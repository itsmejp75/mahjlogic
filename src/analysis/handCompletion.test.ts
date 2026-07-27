import { describe, expect, it } from 'vitest'
import {
  allocateJokersForProbability,
  allocateJokersToSlots,
  applyBlankTileRedemption,
  applyCompletionComplexityAdjustments,
  calculateWallCompletionProbability,
  computeHandCompletionMetrics,
  copiesForTileType,
  DEFAULT_DECK_COMPOSITION,
  estimateWallCompletionProbability,
  finalizeCompletionMetrics,
  earlyExchangeTrials,
  hypergeometricAtLeast,
  isHandDeadByVisibleTiles,
  isSlotExposureReady,
  jokerBanRatio,
  jokerSwapHintReliefForLine,
  maxCompletionMetricsOverSlotSets,
  probNatPlusJokerAtLeast,
  type CompletionSlot,
  type HandInventoryContext,
  type WallCompletionProbabilityInput,
} from './handCompletion'
import { computePatternCompletionMetrics } from './handCompletionSlots'
import { PRACTICE_PATTERNS } from '../card/mockCardBook'
import { NMJL_2026_PATTERNS } from '../card/nmjl2026Patterns'
import { rankSuggestedHands, compareSuggestedHandsByProximity, suggestedHandShownInPanelList } from './suggestedHands'
import { buildAmericanDeck, dealOpeningFour } from '../mahjong/deck'
import { getActiveCardPatterns } from '../card/activeCardPatternsScope'
import type { SuggestedHandLine } from '../training/types'

const quintSlots: CompletionSlot[] = [
  { tileType: 's:dot:2', targetCount: 5 },
  { tileType: 's:dot:3', targetCount: 4 },
  { tileType: 's:dot:4', targetCount: 3 },
  { tileType: 's:dot:5', targetCount: 2 },
]

describe('computeHandCompletionMetrics', () => {
  it('returns 50% for half-filled naturals with no jokers', () => {
    const ctx: HandInventoryContext = {
      naturals: {
        's:dot:2': 2,
        's:dot:3': 2,
        's:dot:4': 2,
        's:dot:5': 1,
      },
      jokersInHand: 0,
      blanksInHand: 0,
      discardCounts: {},
      jokersDisallowed: false,
    }
    const m = computeHandCompletionMetrics(quintSlots, ctx)
    expect(m.M_nat).toBe(7)
    expect(m.M_joker).toBe(0)
    expect(m.D).toBe(7)
    expect(m.P_base).toBe(50)
    expect(m.P).toBe(50)
  })

  it('allocates jokers only to melds of 3+', () => {
    const ctx: HandInventoryContext = {
      naturals: {
        's:dot:2': 4,
        's:dot:3': 4,
        's:dot:4': 2,
        's:dot:5': 1,
      },
      jokersInHand: 2,
      blanksInHand: 0,
      discardCounts: {},
      jokersDisallowed: false,
    }
    const m = computeHandCompletionMetrics(quintSlots, ctx)
    // M_nat = 4+4+2+1 = 11; joker cap = (5-4)+(4-4)+(3-2) = 1+0+1 = 2
    expect(m.M_nat).toBe(11)
    expect(m.M_joker).toBe(2)
    expect(m.P_base).toBe(93)
    expect(m.P).toBe(93)
    expect(m.D).toBe(1)
  })

  it('treats jokers as zero when jokersDisallowed (Singles and Pairs)', () => {
    const ctx: HandInventoryContext = {
      naturals: { 's:dot:2': 4, 's:dot:3': 4, 's:dot:4': 2, 's:dot:5': 1 },
      jokersInHand: 3,
      blanksInHand: 0,
      discardCounts: {},
      jokersDisallowed: true,
    }
    const m = computeHandCompletionMetrics(quintSlots, ctx)
    expect(m.M_joker).toBe(0)
    expect(m.P_base).toBe(79) // 11/14
    expect(m.P).toBe(79)
  })

  it('allocates jokers to concealed-hand pungs when jokers are allowed', () => {
    const pungSlots: CompletionSlot[] = [{ tileType: 's:bam:8', targetCount: 3 }]
    const ctx: HandInventoryContext = {
      naturals: { 's:bam:8': 1 },
      jokersInHand: 2,
      blanksInHand: 0,
      discardCounts: {},
      jokersDisallowed: false,
    }
    const m = computeHandCompletionMetrics(pungSlots, ctx)
    expect(m.M_nat).toBe(1)
    expect(m.M_joker).toBe(2)
    expect(m.D).toBe(11)
  })

  it('does not assign jokers to pair slots', () => {
    const pairSlot: CompletionSlot[] = [{ tileType: 's:bam:9', targetCount: 2 }]
    const ctx: HandInventoryContext = {
      naturals: { 's:bam:9': 1 },
      jokersInHand: 2,
      blanksInHand: 0,
      discardCounts: {},
      jokersDisallowed: false,
    }
    const m = computeHandCompletionMetrics(pairSlot, ctx)
    expect(m.M_nat).toBe(1)
    expect(m.M_joker).toBe(0)
    expect(m.P_base).toBe(7) // 1/14 rounded
    expect(m.P).toBe(7)
  })

  it('counts flower pungs toward joker capacity', () => {
    const slots: CompletionSlot[] = [
      { tileType: 'f', targetCount: 3 },
      { tileType: 's:crak:3', targetCount: 4 },
      { tileType: 's:crak:7', targetCount: 4 },
    ]
    const ctx: HandInventoryContext = {
      naturals: { f: 2, 's:crak:3': 2, 's:crak:7': 1 },
      jokersInHand: 1,
      blanksInHand: 0,
      discardCounts: {},
      jokersDisallowed: false,
    }
    const m = computeHandCompletionMetrics(slots, ctx)
    expect(m.M_nat).toBe(5)
    expect(m.M_joker).toBe(1)
    expect(m.D).toBe(8) // 14 - 6
    // Flower gap is joker-eligible: capacity F(1)+3c(2)+7c(3)=6
    expect(allocateJokersToSlots(slots, ctx.naturals, 1, false)[0]).toBe(1)
  })
})

describe('allocateJokersForProbability', () => {
  const runs5Slots: CompletionSlot[] = [
    { tileType: 'f', targetCount: 3 },
    { tileType: 's:crak:3', targetCount: 2 },
    { tileType: 's:crak:4', targetCount: 3 },
    { tileType: 's:crak:5', targetCount: 3 },
    { tileType: 'd:red', targetCount: 3 },
  ]

  it('prefers scarce naturals over left-to-right strip parking', () => {
    const naturals = { f: 2, 's:crak:3': 1, 's:crak:5': 1, 'd:red': 3 }
    const visible = { 's:crak:4': 2, 's:crak:5': 0, f: 0 }
    // L→R strip park fills flowers first.
    expect(allocateJokersToSlots(runs5Slots, naturals, 2, false)).toEqual([1, 0, 1, 0, 0])
    // Prob park: 4-craks are scarcer (2 visible) → prefer that meld.
    const alloc = allocateJokersForProbability(
      runs5Slots,
      naturals,
      2,
      false,
      visible,
      DEFAULT_DECK_COMPOSITION,
    )
    expect(alloc[2]).toBeGreaterThan(0)
    expect(alloc[2]! + alloc[3]!).toBeGreaterThanOrEqual(2)
  })

  it('keeps call-ready pungs instead of completing one when another meld still needs help', () => {
    const naturals = { f: 2, 's:crak:3': 1, 's:crak:5': 1, 'd:red': 3 }
    const visible = { 's:crak:4': 1, 's:crak:5': 1, f: 1 }
    const alloc = allocateJokersForProbability(
      runs5Slots,
      naturals,
      3,
      false,
      visible,
      DEFAULT_DECK_COMPOSITION,
    )
    // Not L→R dump-all-on-first-meld; spread to preserve call windows.
    expect(alloc).toEqual([0, 0, 2, 1, 0])
    expect(isSlotExposureReady(runs5Slots[2]!, naturals, alloc[2]!)).toBe(true)
    expect(isSlotExposureReady(runs5Slots[3]!, naturals, alloc[3]!)).toBe(true)
  })
})

describe('applyBlankTileRedemption', () => {
  it('redeems a discard tile when a blank is held', () => {
    const slots: CompletionSlot[] = [{ tileType: 's:crak:7', targetCount: 4 }]
    const { naturals } = applyBlankTileRedemption(
      slots,
      { 's:crak:7': 2 },
      { 's:crak:7': 1 },
      1,
    )
    expect(naturals['s:crak:7']).toBe(3)
  })
})

describe('unredeemed blanks', () => {
  it('does not count held blanks toward tiles-away even when a discard could redeem them', () => {
    const consec2b = NMJL_2026_PATTERNS.find((p) => p.cardHandCode === '2b' && p.title === 'FFF 1111 234 5555')!
    const rack = [
      { id: 'f1', def: { cat: 'flower' as const } },
      { id: 'f2', def: { cat: 'flower' as const } },
      { id: 'j1', def: { cat: 'joker' as const } },
      { id: 'c3a', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 3 } },
      { id: 'c3b', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 3 } },
      { id: 'b4', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 4 } },
      { id: 'b5', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 5 } },
      { id: 'b6', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 6 } },
      { id: 'c7', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 7 } },
      { id: 'b1', def: { cat: 'blank' as const } },
      { id: 'b2', def: { cat: 'blank' as const } },
    ]
    const discards = [
      { id: 'd1', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 3 } },
    ]
    const m = computePatternCompletionMetrics(consec2b, rack, discards)
    expect(m.D).toBe(5)
  })

  it('full 14-tile rack with south draw still counts joker toward away', () => {
    const consec2b = NMJL_2026_PATTERNS.find((p) => p.cardHandCode === '2b' && p.title === 'FFF 1111 234 5555')!
    const rack = [
      { id: 'f1', def: { cat: 'flower' as const } },
      { id: 'f2', def: { cat: 'flower' as const } },
      { id: 'j1', def: { cat: 'joker' as const } },
      { id: 'c3a', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 3 } },
      { id: 'c3b', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 3 } },
      { id: 'b4', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 4 } },
      { id: 'b5', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 5 } },
      { id: 'b6', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 6 } },
      { id: 'c7', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 7 } },
      { id: 'b1', def: { cat: 'blank' as const } },
      { id: 'b2', def: { cat: 'blank' as const } },
      { id: 'd9', def: { cat: 'suit' as const, suit: 'dot' as const, rank: 9 } },
      { id: 'gd', def: { cat: 'dragon' as const, dragon: 'green' as const } },
      { id: 'sw', def: { cat: 'wind' as const, wind: 'S' as const } },
    ]
    const m = computePatternCompletionMetrics(consec2b, rack, [])
    expect(m.D).toBe(5)
    const ranked = rankSuggestedHands({
      hand: rack,
      wallRemaining: 83,
      discards: [],
      exposures: [],
      patterns: [consec2b],
    })
    expect(ranked[0]?.tilesNeededRough).toBe(5)
    expect(ranked[0]?.completionProbability).toBeGreaterThan(0)
    expect(ranked[0]?.completionProbability).toBeLessThan(100)
  })
})

describe('calculateWallCompletionProbability', () => {
  const baseInput = (
    overrides: Partial<WallCompletionProbabilityInput> = {},
  ): WallCompletionProbabilityInput => ({
    slots: [{ tileType: 's:bam:3', targetCount: 4 }],
    ctx: {
      naturals: { 's:bam:3': 2 },
      jokersInHand: 0,
      blanksInHand: 0,
      discardCounts: {},
      jokersDisallowed: false,
    },
    completion: { M_nat: 2, M_joker: 0, D: 12, P_base: 14, P: 14 },
    visibleNaturals: {},
    visibleJokers: 0,
    visibleBlanks: 0,
    wallRemaining: 40,
    isConcealed: false,
    isSinglesAndPairs: false,
    deck: DEFAULT_DECK_COMPOSITION,
    playerRackTileCount: 14,
    tilesNeededRough: 12,
    ...overrides,
  })

  it('returns 100% when completion deficit is zero', () => {
    expect(
      calculateWallCompletionProbability(
        baseInput({
          tilesNeededRough: 0,
          completion: { M_nat: 14, M_joker: 0, D: 0, P_base: 100, P: 100 },
        }),
      ),
    ).toBe(100)
  })

  it('returns 0% when need exceeds wall and trials', () => {
    expect(
      calculateWallCompletionProbability(
        baseInput({
          tilesNeededRough: 10,
          wallRemaining: 2,
          completion: { M_nat: 4, M_joker: 0, D: 10, P_base: 29, P: 29 },
        }),
      ),
    ).toBe(0)
  })

  it('returns 0% when a required pair is dead on the table', () => {
    const slots: CompletionSlot[] = [{ tileType: 's:crak:1', targetCount: 2 }]
    expect(
      isHandDeadByVisibleTiles(
        slots,
        {},
        { 's:crak:1': 3 },
        DEFAULT_DECK_COMPOSITION,
      ),
    ).toBe(true)
    expect(
      calculateWallCompletionProbability(
        baseInput({
          slots,
          ctx: {
            naturals: {},
            jokersInHand: 0,
            blanksInHand: 0,
            discardCounts: {},
            jokersDisallowed: true,
          },
          completion: { M_nat: 0, M_joker: 0, D: 14, P_base: 0, P: 0 },
          visibleNaturals: { 's:crak:1': 3 },
          isConcealed: true,
          isSinglesAndPairs: true,
        }),
      ),
    ).toBe(0)
  })

  it('ignores blank cushion when totalBlanksInGame is 0', () => {
    const withBlanksHeld = calculateWallCompletionProbability(
      baseInput({
        ctx: {
          naturals: { 's:bam:3': 2 },
          jokersInHand: 0,
          blanksInHand: 2,
          discardCounts: { 's:bam:3': 1 },
          jokersDisallowed: false,
        },
        deck: { totalJokersInGame: 8, totalBlanksInGame: 0 },
        completion: { M_nat: 2, M_joker: 0, D: 12, P_base: 14, P: 14 },
      }),
    )
    const withoutBlanksHeld = calculateWallCompletionProbability(
      baseInput({
        completion: { M_nat: 2, M_joker: 0, D: 12, P_base: 14, P: 14 },
      }),
    )
    expect(withBlanksHeld).toBe(withoutBlanksHeld)
  })

  it('raises Prob when a useful joker cuts Runs #5 Away (no clamp)', () => {
    // FFF 33 444 555 RRR — flexible run; only the 3c pair is natural-only.
    const slots: CompletionSlot[] = [
      { tileType: 'f', targetCount: 3 },
      { tileType: 's:crak:3', targetCount: 2 },
      { tileType: 's:crak:4', targetCount: 3 },
      { tileType: 's:crak:5', targetCount: 3 },
      { tileType: 'd:red', targetCount: 3 },
    ]
    const visibleNaturals = {
      's:bam:1': 1,
      's:bam:2': 1,
      's:bam:4': 2,
      's:bam:5': 1,
      's:bam:8': 3,
      's:dot:1': 1,
      's:dot:4': 1,
      'd:soap': 1,
      'w:E': 1,
      's:crak:1': 1,
      's:crak:2': 1,
      's:crak:3': 1,
      's:crak:4': 1,
      's:crak:5': 1,
      's:crak:8': 1,
      'd:green': 1,
      f: 1,
    }
    const naturalsBefore = {
      f: 2,
      's:crak:3': 1,
      's:crak:5': 1,
      'd:red': 3,
      's:crak:6': 1,
      's:crak:9': 1,
      'w:S': 1,
      's:dot:8': 1,
      's:dot:1': 1,
    }
    const naturalsAfter = {
      f: 2,
      's:crak:3': 1,
      's:crak:5': 1,
      'd:red': 3,
      's:crak:6': 1,
      's:crak:9': 1,
      'w:S': 1,
      's:dot:8': 1,
    }
    const beforeCtx: HandInventoryContext = {
      naturals: naturalsBefore,
      jokersInHand: 2,
      blanksInHand: 0,
      discardCounts: {},
      jokersDisallowed: false,
    }
    const afterCtx: HandInventoryContext = {
      naturals: naturalsAfter,
      jokersInHand: 3,
      blanksInHand: 0,
      discardCounts: {},
      jokersDisallowed: false,
    }
    const before = calculateWallCompletionProbability({
      slots,
      ctx: beforeCtx,
      completion: computeHandCompletionMetrics(slots, beforeCtx),
      visibleNaturals,
      visibleJokers: 0,
      visibleBlanks: 0,
      wallRemaining: 86,
      isConcealed: false,
      isSinglesAndPairs: false,
      deck: DEFAULT_DECK_COMPOSITION,
      playerRackTileCount: 14,
      tilesNeededRough: 5,
    })
    const after = calculateWallCompletionProbability({
      slots,
      ctx: afterCtx,
      completion: computeHandCompletionMetrics(slots, afterCtx),
      visibleNaturals,
      visibleJokers: 0,
      visibleBlanks: 0,
      wallRemaining: 85,
      isConcealed: false,
      isSinglesAndPairs: false,
      deck: DEFAULT_DECK_COMPOSITION,
      playerRackTileCount: 14,
      tilesNeededRough: 4,
    })
    expect(after).toBeGreaterThan(before)
  })

  it('raises probability when blanks are in the deck and held', () => {
    const slots: CompletionSlot[] = [
      { tileType: 's:bam:3', targetCount: 4 },
      { tileType: 's:dot:5', targetCount: 4 },
      { tileType: 'f', targetCount: 2 },
    ]
    const noBlanks = calculateWallCompletionProbability(
      baseInput({
        slots,
        ctx: {
          naturals: { 's:bam:3': 4, 's:dot:5': 3, f: 1 },
          jokersInHand: 0,
          blanksInHand: 0,
          discardCounts: {},
          jokersDisallowed: false,
        },
        completion: { M_nat: 8, M_joker: 0, D: 6, P_base: 57, P: 57 },
        wallRemaining: 60,
      }),
    )
    const withBlanks = calculateWallCompletionProbability(
      baseInput({
        slots,
        ctx: {
          naturals: { 's:bam:3': 4, 's:dot:5': 3, f: 1 },
          jokersInHand: 0,
          blanksInHand: 2,
          discardCounts: { 's:dot:5': 1, f: 1 },
          jokersDisallowed: false,
        },
        completion: { M_nat: 8, M_joker: 0, D: 6, P_base: 57, P: 57 },
        wallRemaining: 60,
        deck: { totalJokersInGame: 8, totalBlanksInGame: 4 },
      }),
    )
    expect(withBlanks).toBeGreaterThan(noBlanks)
  })

  it('raises probability with 10 jokers vs 8 jokers in the deck', () => {
    const eight = calculateWallCompletionProbability(
      baseInput({
        completion: { M_nat: 8, M_joker: 0, D: 6, P_base: 57, P: 57 },
        wallRemaining: 30,
        deck: { totalJokersInGame: 8, totalBlanksInGame: 0 },
      }),
    )
    const ten = calculateWallCompletionProbability(
      baseInput({
        completion: { M_nat: 8, M_joker: 0, D: 6, P_base: 57, P: 57 },
        wallRemaining: 30,
        deck: { totalJokersInGame: 10, totalBlanksInGame: 0 },
      }),
    )
    expect(ten).toBeGreaterThanOrEqual(eight)
  })

  it('uses 8 and 10 joker copy counts from deck settings', () => {
    expect(copiesForTileType('j', { totalJokersInGame: 8, totalBlanksInGame: 0 })).toBe(8)
    expect(copiesForTileType('j', { totalJokersInGame: 10, totalBlanksInGame: 0 })).toBe(10)
  })

  it('lowers Prob % when kong naturals die and more jokers are required', () => {
    const slots: CompletionSlot[] = [
      { tileType: 'w:W', targetCount: 3 },
      { tileType: 'w:S', targetCount: 4 },
      { tileType: 'd:green', targetCount: 3 },
      { tileType: 'd:red', targetCount: 4 },
    ]
    const shared = {
      slots,
      ctx: {
        naturals: { 'w:W': 3, 'w:S': 2, 'd:green': 2, 'd:red': 2 },
        jokersInHand: 1,
        blanksInHand: 0,
        discardCounts: {},
        jokersDisallowed: false,
      } satisfies HandInventoryContext,
      completion: { M_nat: 9, M_joker: 1, D: 4, P_base: 71, P: 71 },
      wallRemaining: 56,
      isConcealed: false,
      isSinglesAndPairs: false,
      deck: DEFAULT_DECK_COMPOSITION,
      playerRackTileCount: 14,
      tilesNeededRough: 4,
      visibleJokers: 0,
      visibleBlanks: 0,
    }
    const beforeDiscard = calculateWallCompletionProbability({
      ...shared,
      visibleNaturals: {},
    })
    const afterDiscard = calculateWallCompletionProbability({
      ...shared,
      // Two Souths dead on the table → kong must lean harder on jokers.
      visibleNaturals: { 'w:S': 2 },
    })
    expect(beforeDiscard).toBeGreaterThan(0)
    expect(afterDiscard).toBeGreaterThan(0)
    expect(afterDiscard).toBeLessThan(beforeDiscard)
  })

  it('stays non-zero for 1-away open pair with short wall and 13-tile discard rack', () => {
    const slots: CompletionSlot[] = [
      { tileType: 's:bam:2', targetCount: 2 },
      { tileType: 'd:soap', targetCount: 2 },
      { tileType: 's:crak:2', targetCount: 3 },
      { tileType: 's:crak:6', targetCount: 3 },
      { tileType: 'w:N', targetCount: 1 },
      { tileType: 'w:E', targetCount: 1 },
      { tileType: 'w:W', targetCount: 1 },
      { tileType: 'w:S', targetCount: 1 },
    ]
    const prob = calculateWallCompletionProbability(
      baseInput({
        slots,
        ctx: {
          naturals: {
            's:bam:2': 2,
            'd:soap': 1,
            's:crak:2': 3,
            's:crak:6': 3,
            'w:N': 1,
            'w:E': 1,
            'w:W': 1,
            'w:S': 1,
          },
          jokersInHand: 0,
          blanksInHand: 0,
          discardCounts: {},
          jokersDisallowed: false,
        },
        completion: { M_nat: 12, M_joker: 0, D: 2, P_base: 86, P: 86 },
        tilesNeededRough: 1,
        playerRackTileCount: 13,
        wallRemaining: 8,
        visibleJokers: 1,
      }),
    )
    expect(prob).toBeGreaterThan(0)
  })

  it('counts opponent discard calls when 1 away on an open pair (Mah Jongg declare)', () => {
    const slots: CompletionSlot[] = [
      { tileType: 'd:soap', targetCount: 2 },
      { tileType: 's:crak:2', targetCount: 3 },
    ]
    const prob = calculateWallCompletionProbability(
      baseInput({
        slots,
        ctx: {
          naturals: { 'd:soap': 1, 's:crak:2': 3 },
          jokersInHand: 0,
          blanksInHand: 0,
          discardCounts: {},
          jokersDisallowed: false,
        },
        completion: { M_nat: 4, M_joker: 0, D: 10, P_base: 29, P: 29 },
        tilesNeededRough: 1,
        playerRackTileCount: 13,
        wallRemaining: 8,
      }),
    )
    // 8 wall → 2 draws + near-MJ call windows on the open pair; should not read as hopeless.
    expect(prob).toBeGreaterThan(10)
  })

  it('returns non-zero for quint melds that require jokers beyond four naturals', () => {
    const quintSlots: CompletionSlot[] = [
      { tileType: 'f', targetCount: 5 },
      { tileType: 'd:green', targetCount: 5 },
      { tileType: 's:dot:1', targetCount: 4 },
    ]
    const prob = calculateWallCompletionProbability(
      baseInput({
        slots: quintSlots,
        ctx: {
          naturals: { 's:dot:1': 2 },
          jokersInHand: 1,
          blanksInHand: 0,
          discardCounts: {},
          jokersDisallowed: false,
        },
        completion: { M_nat: 2, M_joker: 0, D: 12, P_base: 14, P: 14 },
        wallRemaining: 99,
      }),
    )
    expect(prob).toBeGreaterThan(0)
  })

  it('raises Prob when an exposure-ready flower pung is filled (cover outs not fungible)', () => {
    const slots: CompletionSlot[] = [
      { tileType: 'f', targetCount: 3 },
      { tileType: 's:crak:4', targetCount: 4 },
      { tileType: 's:dot:6', targetCount: 4 },
      { tileType: 's:bam:2', targetCount: 3 },
    ]
    const visibleNaturals = {
      's:bam:8': 1,
      'd:soap': 1,
      's:dot:3': 1,
      's:dot:4': 1,
      's:crak:4': 1,
      'd:red': 1,
      f: 1,
    }
    const beforeCtx: HandInventoryContext = {
      naturals: { f: 2, 's:crak:4': 2, 's:dot:6': 3, 's:bam:2': 2 },
      jokersInHand: 1,
      blanksInHand: 0,
      discardCounts: {},
      jokersDisallowed: false,
    }
    const afterCtx: HandInventoryContext = {
      naturals: { f: 3, 's:crak:4': 2, 's:dot:6': 3, 's:bam:2': 2 },
      jokersInHand: 1,
      blanksInHand: 0,
      discardCounts: {},
      jokersDisallowed: false,
    }
    const shared = {
      slots,
      visibleNaturals,
      visibleJokers: 0,
      visibleBlanks: 0,
      wallRemaining: 94,
      isConcealed: false,
      isSinglesAndPairs: false,
      deck: DEFAULT_DECK_COMPOSITION,
      playerRackTileCount: 14,
    }
    const before = calculateWallCompletionProbability({
      ...shared,
      ctx: beforeCtx,
      completion: computeHandCompletionMetrics(slots, beforeCtx),
      tilesNeededRough: 6,
    })
    const after = calculateWallCompletionProbability({
      ...shared,
      ctx: afterCtx,
      completion: computeHandCompletionMetrics(slots, afterCtx),
      tilesNeededRough: 5,
    })
    expect(after).toBeGreaterThan(before)
  })

  it('does not change Prob when rack count is 13 vs 14 (junk on tray)', () => {
    const slots: CompletionSlot[] = [
      { tileType: 's:bam:2', targetCount: 2 },
      { tileType: 'd:soap', targetCount: 2 },
      { tileType: 's:crak:2', targetCount: 3 },
      { tileType: 's:crak:6', targetCount: 3 },
      { tileType: 'w:N', targetCount: 1 },
      { tileType: 'w:E', targetCount: 1 },
      { tileType: 'w:W', targetCount: 1 },
      { tileType: 'w:S', targetCount: 1 },
    ]
    const ctx: HandInventoryContext = {
      naturals: { 's:bam:2': 2, 's:crak:2': 2, 'w:E': 1, 'w:S': 2 },
      jokersInHand: 0,
      blanksInHand: 0,
      discardCounts: {},
      jokersDisallowed: false,
    }
    const completion = { M_nat: 7, M_joker: 0, D: 7, P_base: 50, P: 50 }
    const shared = {
      slots,
      ctx,
      completion,
      visibleNaturals: {},
      visibleJokers: 0,
      visibleBlanks: 0,
      wallRemaining: 60,
      isConcealed: false,
      isSinglesAndPairs: false,
      deck: DEFAULT_DECK_COMPOSITION,
      tilesNeededRough: 6,
    }
    const at13 = calculateWallCompletionProbability({ ...shared, playerRackTileCount: 13 })
    const at14 = calculateWallCompletionProbability({ ...shared, playerRackTileCount: 14 })
    expect(at13).toBe(at14)
  })

  it('returns 0% when 7 away with only 8 wall tiles (W&D #5 endgame)', () => {
    const slots: CompletionSlot[] = [
      { tileType: 'f', targetCount: 3 },
      { tileType: 'w:N', targetCount: 4 },
      { tileType: 'f', targetCount: 3 },
      { tileType: 'd:red', targetCount: 4 },
    ]
    const ctx: HandInventoryContext = {
      naturals: { f: 3, 'd:green': 2 },
      jokersInHand: 2,
      blanksInHand: 0,
      discardCounts: {},
      jokersDisallowed: false,
    }
    const completion = { M_nat: 6, M_joker: 2, D: 6, P_base: 57, P: 57 }
    expect(
      calculateWallCompletionProbability({
        slots,
        ctx,
        completion,
        visibleNaturals: {},
        visibleJokers: 1,
        visibleBlanks: 0,
        wallRemaining: 8,
        isConcealed: false,
        isSinglesAndPairs: false,
        deck: DEFAULT_DECK_COMPOSITION,
        playerRackTileCount: 13,
        tilesNeededRough: 7,
        jokerReliefFromSwapHint: 2,
      }),
    ).toBe(0)
  })

  it('keeps Away-3 open melds low but non-zero at wall 11 with a 14-tile rack', () => {
    // Quints-style: 11111 44444 DDDD — call paths only when exposure-ready.
    const slots: CompletionSlot[] = [
      { tileType: 's:dot:1', targetCount: 5 },
      { tileType: 's:dot:4', targetCount: 5 },
      { tileType: 'd:green', targetCount: 4 },
    ]
    const shared = {
      slots,
      ctx: {
        naturals: { 's:dot:1': 3, 's:dot:4': 3, 'd:green': 2 },
        jokersInHand: 3,
        blanksInHand: 0,
        discardCounts: {},
        jokersDisallowed: false,
      } satisfies HandInventoryContext,
      completion: { M_nat: 8, M_joker: 3, D: 3, P_base: 79, P: 79 },
      visibleNaturals: { 's:dot:1': 1, 's:dot:4': 1, 'd:green': 1 },
      visibleJokers: 3,
      visibleBlanks: 0,
      isConcealed: false,
      isSinglesAndPairs: false,
      deck: DEFAULT_DECK_COMPOSITION,
      playerRackTileCount: 14,
      tilesNeededRough: 3,
    }
    const at11 = calculateWallCompletionProbability({ ...shared, wallRemaining: 11 })
    const at12 = calculateWallCompletionProbability({ ...shared, wallRemaining: 12 })
    expect(at11).toBeGreaterThan(0)
    expect(at11).toBeLessThan(25)
    expect(at12).toBeGreaterThan(0)
    expect(at12).toBeLessThan(25)
  })

  it('gives higher Prob % when a quint is exposure-ready vs the same wall when it is not', () => {
    const slots: CompletionSlot[] = [
      { tileType: 's:dot:1', targetCount: 5 },
      { tileType: 'd:green', targetCount: 5 },
      { tileType: 's:bam:2', targetCount: 4 },
    ]
    const wallRemaining = 48
    // Not ready to expose either quint (need 4 matching before calling the 5th).
    const notReady = calculateWallCompletionProbability(
      baseInput({
        slots,
        ctx: {
          naturals: { 's:dot:1': 2, 'd:green': 2, 's:bam:2': 3 },
          jokersInHand: 1,
          blanksInHand: 0,
          discardCounts: {},
          jokersDisallowed: false,
        },
        completion: { M_nat: 7, M_joker: 1, D: 6, P_base: 57, P: 57 },
        wallRemaining,
        tilesNeededRough: 6,
      }),
    )
    // Ready to call the last 1-dot for the quint (4 naturals held).
    const ready = calculateWallCompletionProbability(
      baseInput({
        slots,
        ctx: {
          naturals: { 's:dot:1': 4, 'd:green': 4, 's:bam:2': 4 },
          jokersInHand: 1,
          blanksInHand: 0,
          discardCounts: {},
          jokersDisallowed: false,
        },
        completion: { M_nat: 12, M_joker: 1, D: 1, P_base: 93, P: 93 },
        wallRemaining,
        tilesNeededRough: 1,
      }),
    )
    expect(notReady).toBeGreaterThan(0)
    expect(ready).toBeGreaterThan(notReady)
    expect(ready).toBeGreaterThan(20)
  })

  it('gives meaningful opening Charleston Prob % for Away-6 concealed runs (not ~1%)', () => {
    const slots: CompletionSlot[] = [
      { tileType: 'f', targetCount: 2 },
      { tileType: 's:bam:2', targetCount: 1 },
      { tileType: 's:bam:3', targetCount: 2 },
      { tileType: 's:bam:4', targetCount: 3 },
      { tileType: 's:crak:2', targetCount: 1 },
      { tileType: 's:crak:3', targetCount: 2 },
      { tileType: 's:crak:4', targetCount: 3 },
    ]
    expect(earlyExchangeTrials(99, 5)).toBeGreaterThan(0)
    expect(earlyExchangeTrials(80, 5)).toBe(0)
    const prob = calculateWallCompletionProbability(
      baseInput({
        slots,
        ctx: {
          naturals: {
            's:bam:2': 1,
            's:bam:3': 1,
            's:crak:2': 1,
            's:crak:3': 2,
          },
          jokersInHand: 0,
          blanksInHand: 0,
          discardCounts: {},
          jokersDisallowed: false,
        },
        completion: { M_nat: 5, M_joker: 0, D: 9, P_base: 36, P: 29 },
        visibleNaturals: { 's:dot:3': 1, 's:crak:3': 1, f: 1, 'w:N': 1, 'w:W': 1 },
        wallRemaining: 99,
        isConcealed: true,
        tilesNeededRough: 6,
      }),
    )
    // Full wall + Charleston receives: pursuit odds, not the crushed slot-product ~1%.
    // Cover outs are capped per-slot (not fungible across types), so high-single-digits is honest.
    expect(prob).toBeGreaterThanOrEqual(8)
    expect(prob).toBeLessThan(80)
  })

  it('does not treat expected wall jokers as a guaranteed 100% for a 1-joker quint gap', () => {
    const slots: CompletionSlot[] = [
      { tileType: 's:bam:3', targetCount: 5 },
      { tileType: 's:dot:5', targetCount: 5 },
      { tileType: 'd:green', targetCount: 4 },
    ]
    const prob = calculateWallCompletionProbability(
      baseInput({
        slots,
        ctx: {
          naturals: { 's:bam:3': 4, 's:dot:5': 4, 'd:green': 4 },
          jokersInHand: 1,
          blanksInHand: 0,
          discardCounts: {},
          jokersDisallowed: false,
        },
        completion: { M_nat: 12, M_joker: 1, D: 1, P_base: 93, P: 93 },
        wallRemaining: 40,
        tilesNeededRough: 1,
        visibleJokers: 0,
      }),
    )
    // Need one more joker from the wall/calls — real odds, not EV wipeout to 100.
    expect(prob).toBeGreaterThan(0)
    expect(prob).toBeLessThan(100)
  })

  it('raises completion prob when joker-swap hint relief is available', () => {
    const slots: CompletionSlot[] = [
      { tileType: 'w:west', targetCount: 3 },
      { tileType: 'w:south', targetCount: 4 },
    ]
    const ctx: HandInventoryContext = {
      naturals: { 'w:west': 3, 'w:south': 1 },
      jokersInHand: 0,
      blanksInHand: 0,
      discardCounts: {},
      jokersDisallowed: false,
    }
    const completion = computeHandCompletionMetrics(slots, ctx)
    const shared = {
      slots,
      ctx,
      completion,
      visibleNaturals: {},
      visibleJokers: 2,
      visibleBlanks: 0,
      wallRemaining: 48,
      isConcealed: false,
      isSinglesAndPairs: false,
      deck: DEFAULT_DECK_COMPOSITION,
      playerRackTileCount: 14,
      tilesNeededRough: 4,
    }
    const withoutHint = calculateWallCompletionProbability(shared)
    const withHint = calculateWallCompletionProbability({
      ...shared,
      jokerReliefFromSwapHint: jokerSwapHintReliefForLine(
        2,
        slots,
        ctx,
        completion,
        {},
        DEFAULT_DECK_COMPOSITION,
        false,
        false,
      ),
    })
    expect(jokerSwapHintReliefForLine(2, slots, ctx, completion, {}, DEFAULT_DECK_COMPOSITION, false, false)).toBe(2)
    expect(withHint).toBeGreaterThan(withoutHint)
  })

  it('applies joker-swap hint relief even when more than 4 tiles away', () => {
    const slots: CompletionSlot[] = [
      { tileType: 'w:west', targetCount: 3 },
      { tileType: 'w:south', targetCount: 4 },
    ]
    const ctx: HandInventoryContext = {
      naturals: { 'w:west': 3, 'w:south': 1 },
      jokersInHand: 0,
      blanksInHand: 0,
      discardCounts: {},
      jokersDisallowed: false,
    }
    const completion = computeHandCompletionMetrics(slots, ctx)
    const shared = {
      slots,
      ctx,
      completion,
      visibleNaturals: {},
      visibleJokers: 2,
      visibleBlanks: 0,
      wallRemaining: 80,
      isConcealed: false,
      isSinglesAndPairs: false,
      deck: DEFAULT_DECK_COMPOSITION,
      playerRackTileCount: 14,
      tilesNeededRough: 7,
    }
    const withoutHint = calculateWallCompletionProbability(shared)
    const withHint = calculateWallCompletionProbability({
      ...shared,
      jokerReliefFromSwapHint: 2,
    })
    expect(withHint).toBeGreaterThanOrEqual(withoutHint)
  })

  describe('early chase progressive calls (2468 #3 shape)', () => {
    const slots: CompletionSlot[] = [
      { tileType: 'f', targetCount: 3 },
      { tileType: 's:crak:2', targetCount: 4 },
      { tileType: 's:bam:4', targetCount: 1 },
      { tileType: 's:bam:6', targetCount: 2 },
      { tileType: 's:crak:8', targetCount: 4 },
    ]
    const openingNaturals = {
      f: 3,
      's:crak:2': 1,
      's:bam:4': 1,
      's:bam:6': 2,
      's:crak:8': 2,
    }

    it('scores above concealed (no-call) baseline at opening Away 5', () => {
      const ctx: HandInventoryContext = {
        naturals: openingNaturals,
        jokersInHand: 0,
        blanksInHand: 0,
        discardCounts: {},
        jokersDisallowed: false,
      }
      const completion = computeHandCompletionMetrics(slots, ctx)
      const shared = {
        slots,
        ctx,
        completion,
        visibleNaturals: {},
        visibleJokers: 0,
        visibleBlanks: 0,
        wallRemaining: 99,
        isSinglesAndPairs: false,
        deck: DEFAULT_DECK_COMPOSITION,
        playerRackTileCount: 14,
        tilesNeededRough: 5,
      }
      const open = calculateWallCompletionProbability({ ...shared, isConcealed: false })
      const concealed = calculateWallCompletionProbability({ ...shared, isConcealed: true })
      expect(open).toBeGreaterThan(concealed)
      expect(open).toBeGreaterThanOrEqual(18)
      expect(open).toBeLessThan(50)
    })

    it('does not drop Prob when an 8 is drawn toward the kong (Away 5→4)', () => {
      const beforeCtx: HandInventoryContext = {
        naturals: openingNaturals,
        jokersInHand: 0,
        blanksInHand: 0,
        discardCounts: {},
        jokersDisallowed: false,
      }
      const afterCtx: HandInventoryContext = {
        naturals: { ...openingNaturals, 's:crak:8': 3 },
        jokersInHand: 0,
        blanksInHand: 0,
        discardCounts: {},
        jokersDisallowed: false,
      }
      const shared = {
        slots,
        visibleNaturals: {},
        visibleJokers: 0,
        visibleBlanks: 0,
        wallRemaining: 98,
        isConcealed: false,
        isSinglesAndPairs: false,
        deck: DEFAULT_DECK_COMPOSITION,
        playerRackTileCount: 14,
      }
      const before = calculateWallCompletionProbability({
        ...shared,
        ctx: beforeCtx,
        completion: computeHandCompletionMetrics(slots, beforeCtx),
        tilesNeededRough: 5,
      })
      const after = calculateWallCompletionProbability({
        ...shared,
        ctx: afterCtx,
        completion: computeHandCompletionMetrics(slots, afterCtx),
        tilesNeededRough: 4,
      })
      expect(after).toBeGreaterThanOrEqual(before)
    })

    it('raises Prob with joker-swap relief at Away 5', () => {
      const ctx: HandInventoryContext = {
        naturals: openingNaturals,
        jokersInHand: 0,
        blanksInHand: 0,
        discardCounts: {},
        jokersDisallowed: false,
      }
      const completion = computeHandCompletionMetrics(slots, ctx)
      const shared = {
        slots,
        ctx,
        completion,
        visibleNaturals: {},
        visibleJokers: 0,
        visibleBlanks: 0,
        wallRemaining: 99,
        isConcealed: false,
        isSinglesAndPairs: false,
        deck: DEFAULT_DECK_COMPOSITION,
        playerRackTileCount: 14,
        tilesNeededRough: 5,
      }
      const without = calculateWallCompletionProbability(shared)
      const withSwap = calculateWallCompletionProbability({
        ...shared,
        jokerReliefFromSwapHint: 2,
      })
      expect(withSwap).toBeGreaterThan(without)
    })

    it('still gives full call credit when a kong is already exposure-ready', () => {
      const readyCtx: HandInventoryContext = {
        naturals: { ...openingNaturals, 's:crak:8': 3 },
        jokersInHand: 0,
        blanksInHand: 0,
        discardCounts: {},
        jokersDisallowed: false,
      }
      expect(isSlotExposureReady(slots[4]!, readyCtx.naturals, 0)).toBe(true)
      const completion = computeHandCompletionMetrics(slots, readyCtx)
      const readyOpen = calculateWallCompletionProbability({
        slots,
        ctx: readyCtx,
        completion,
        visibleNaturals: {},
        visibleJokers: 0,
        visibleBlanks: 0,
        wallRemaining: 99,
        isConcealed: false,
        isSinglesAndPairs: false,
        deck: DEFAULT_DECK_COMPOSITION,
        playerRackTileCount: 14,
        tilesNeededRough: 4,
      })
      const readyConcealed = calculateWallCompletionProbability({
        slots,
        ctx: readyCtx,
        completion,
        visibleNaturals: {},
        visibleJokers: 0,
        visibleBlanks: 0,
        wallRemaining: 99,
        isConcealed: true,
        isSinglesAndPairs: false,
        deck: DEFAULT_DECK_COMPOSITION,
        playerRackTileCount: 14,
        tilesNeededRough: 4,
      })
      expect(readyOpen).toBeGreaterThan(readyConcealed)
    })
  })

  it('does not apply joker-swap hint relief for singles-and-pairs lines', () => {
    const slots: CompletionSlot[] = [{ tileType: 'w:west', targetCount: 3 }]
    const ctx: HandInventoryContext = {
      naturals: { 'w:west': 1 },
      jokersInHand: 0,
      blanksInHand: 0,
      discardCounts: {},
      jokersDisallowed: true,
    }
    const completion = computeHandCompletionMetrics(slots, ctx)
    expect(
      jokerSwapHintReliefForLine(2, slots, ctx, completion, {}, DEFAULT_DECK_COMPOSITION, true, true),
    ).toBe(0)
  })

  it('applies joker-swap hint relief for concealed meld hands', () => {
    const slots: CompletionSlot[] = [{ tileType: 'w:west', targetCount: 3 }]
    const ctx: HandInventoryContext = {
      naturals: { 'w:west': 1 },
      jokersInHand: 0,
      blanksInHand: 0,
      discardCounts: {},
      jokersDisallowed: false,
    }
    const completion = computeHandCompletionMetrics(slots, ctx)
    expect(
      jokerSwapHintReliefForLine(2, slots, ctx, completion, {}, DEFAULT_DECK_COMPOSITION, true, false),
    ).toBe(2)
  })

  it('returns non-zero scores on a fresh opening deal with a full wall', () => {
    const deck = buildAmericanDeck({ jokerCount: 8, blankTileCount: 0 })
    const { east, wall } = dealOpeningFour(deck)
    const ranked = rankSuggestedHands({
      hand: east,
      wallRemaining: wall.length,
      discards: [],
      exposures: [],
      deckSettings: { totalJokersInGame: 8, totalBlanksInGame: 0 },
      patterns: getActiveCardPatterns().slice(0, 20),
    })
    expect(wall.length).toBeGreaterThan(50)
    expect(ranked.some((line) => line.completionProbability > 0)).toBe(true)
  })
})

describe('isSlotExposureReady', () => {
  it('requires targetCount-1 matching tiles', () => {
    const quint: CompletionSlot = { tileType: 's:dot:1', targetCount: 5 }
    expect(isSlotExposureReady(quint, { 's:dot:1': 3 }, 0)).toBe(false)
    expect(isSlotExposureReady(quint, { 's:dot:1': 3 }, 1)).toBe(true)
    expect(isSlotExposureReady(quint, { 's:dot:1': 4 }, 0)).toBe(true)
    expect(isSlotExposureReady(quint, { 's:dot:1': 5 }, 0)).toBe(false)
  })
})

describe('probNatPlusJokerAtLeast', () => {
  it('allows jokers to fill natural shortfall', () => {
    const withJokers = probNatPlusJokerAtLeast(2, 8, 20, 120, 3)
    const naturalsOnly = hypergeometricAtLeast(2, 20, 120, 3)
    expect(naturalsOnly).toBe(0)
    expect(withJokers).toBeGreaterThan(0.2)
  })
})

describe('hypergeometricAtLeast', () => {
  it('returns 1 when k is zero', () => {
    expect(hypergeometricAtLeast(5, 3, 20, 0)).toBe(1)
  })

  it('returns 0 when success pool is too small', () => {
    expect(hypergeometricAtLeast(2, 5, 20, 3)).toBe(0)
  })
})

describe('estimateWallCompletionProbability', () => {
  it('returns 100% when the hand is complete', () => {
    expect(estimateWallCompletionProbability(0, 13, 79)).toBe(100)
  })

  it('scales down rack fill when need is tight vs wall (Runs-6 style)', () => {
    // 3 away, 13 wall, ~79% rack fill → ~49% wall odds
    expect(estimateWallCompletionProbability(3, 13, 79)).toBe(49)
  })

  it('returns 0% when need exceeds wall picks', () => {
    expect(estimateWallCompletionProbability(10, 2, 71)).toBe(0)
    expect(estimateWallCompletionProbability(11, 2, 21)).toBe(0)
    expect(estimateWallCompletionProbability(11, 10, 79)).toBe(0)
  })
})

describe('compareSuggestedHandsByProximity', () => {
  const line = (away: number, prob: number): SuggestedHandLine => ({
    id: 'test',
    title: 't',
    matchedInHand: 14 - away,
    tilesNeededRough: away,
    completionProbability: prob,
    wallRemaining: 80,
    visibleDeadMatches: 0,
    pressure: 'comfortable',
    note: '',
    section: 'CONSECUTIVE RUN',
    points: 25,
    closed: false,
    cardLineNumber: 1,
  })

  it('sorts by tiles away ascending, then completion % descending', () => {
    expect(compareSuggestedHandsByProximity(line(3, 75), line(11, 20))).toBeLessThan(0)
    expect(compareSuggestedHandsByProximity(line(5, 90), line(5, 60))).toBeLessThan(0)
  })

  it('shows 0% lines (including when nothing is focused)', () => {
    const dead = line(6, 0)
    const live = line(6, 40)
    expect(suggestedHandShownInPanelList(dead, null)).toBe(true)
    expect(suggestedHandShownInPanelList(live, null)).toBe(true)
    expect(suggestedHandShownInPanelList(dead, dead.id)).toBe(true)
    expect(suggestedHandShownInPanelList(dead, 'other-pattern')).toBe(true)
  })
})

describe('maxCompletionMetricsOverSlotSets', () => {
  it('picks the permutation with the highest P', () => {
    const dotPerm = quintSlots
    const bamPerm: CompletionSlot[] = [
      { tileType: 's:bam:2', targetCount: 5 },
      { tileType: 's:bam:3', targetCount: 4 },
      { tileType: 's:bam:4', targetCount: 3 },
      { tileType: 's:bam:5', targetCount: 2 },
    ]
    const ctx: HandInventoryContext = {
      naturals: { 's:bam:2': 5, 's:bam:3': 4, 's:bam:4': 3, 's:bam:5': 2 },
      jokersInHand: 0,
      blanksInHand: 0,
      discardCounts: {},
      jokersDisallowed: false,
    }
    const best = maxCompletionMetricsOverSlotSets([dotPerm, bamPerm], ctx, false)
    expect(best.P_base).toBe(100)
    expect(best.P).toBe(100)
    expect(best.D).toBe(0)
  })
})

describe('applyCompletionComplexityAdjustments', () => {
  it('applies concealed and full joker-ban penalties for S&P hands at 8 away', () => {
    // P_base = 43% (8 tiles away), ban ratio 1.0, concealed
    const P = applyCompletionComplexityAdjustments(43, true, 1)
    // 43 × 0.80 × 0.75 = 25.8 → 26
    expect(P).toBe(26)
  })

  it('keeps open kong-heavy hands closer to P_base', () => {
    const slots2468: CompletionSlot[] = [
      { tileType: 'f', targetCount: 2 },
      { tileType: 's:bam:2', targetCount: 4 },
      { tileType: 's:dot:4', targetCount: 2 },
      { tileType: 's:dot:6', targetCount: 2 },
      { tileType: 's:crak:8', targetCount: 4 },
    ]
    const banRatio = jokerBanRatio(slots2468)
    expect(banRatio).toBeCloseTo(6 / 14)
    const P = applyCompletionComplexityAdjustments(43, false, banRatio)
    // 43 × 1.0 × (1 − 0.25 × 6/14) ≈ 38
    expect(P).toBeGreaterThan(30)
    expect(P).toBeLessThan(43)
  })

  it('returns 100% when the rack is fully complete (0 away)', () => {
    const consec2aSlots: CompletionSlot[] = [
      { tileType: 'f', targetCount: 3 },
      { tileType: 's:bam:1', targetCount: 4 },
      { tileType: 's:bam:2', targetCount: 1 },
      { tileType: 's:bam:3', targetCount: 1 },
      { tileType: 's:bam:4', targetCount: 1 },
      { tileType: 's:bam:5', targetCount: 4 },
    ]
    const raw = { M_nat: 11, M_joker: 3, D: 0, P_base: 100, P: 100 }
    const finalized = finalizeCompletionMetrics(raw, consec2aSlots, false)
    expect(finalized.P).toBe(100)
  })
})

describe('computePatternCompletionMetrics', () => {
  it('evaluates quint-1 across suit permutations', () => {
    const quint = PRACTICE_PATTERNS.find((p) => p.id === 'quint-1')!
    const rack = [
      { id: '1', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 3 } },
      { id: '2', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 3 } },
      { id: '3', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 3 } },
      { id: '4', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 4 } },
      { id: '5', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 4 } },
      { id: '6', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 4 } },
      { id: '7', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 4 } },
      { id: '8', def: { cat: 'joker' as const } },
    ]
    const m = computePatternCompletionMetrics(quint, rack, [])
    expect(m.P).toBeGreaterThan(0)
    expect(m.P).toBeLessThan(100)
  })

  it('counts rack jokers toward concealed 2468 #8 pungs (not dead at 0%)', () => {
    const pattern = NMJL_2026_PATTERNS.find((p) => p.id === 'nmjl2026:2468-8')!
    const hand = [
      { id: '1', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 2 } },
      { id: '2', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 4 } },
      { id: '3', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 6 } },
      { id: '4', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 8 } },
      { id: '5', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 6 } },
      { id: '6', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 8 } },
      { id: '7', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 6 } },
      { id: '8', def: { cat: 'suit' as const, suit: 'dot' as const, rank: 1 } },
      { id: '9', def: { cat: 'suit' as const, suit: 'dot' as const, rank: 3 } },
      { id: '10', def: { cat: 'suit' as const, suit: 'dot' as const, rank: 5 } },
      { id: '11', def: { cat: 'suit' as const, suit: 'dot' as const, rank: 3 } },
      { id: '12', def: { cat: 'wind' as const, wind: 'east' as const } },
      { id: '13', def: { cat: 'joker' as const } },
      { id: '14', def: { cat: 'joker' as const } },
    ]
    const discards = [
      { id: 'd1', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 8 } },
      { id: 'd2', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 8 } },
      { id: 'd3', def: { cat: 'suit' as const, suit: 'dot' as const, rank: 1 } },
      { id: 'd4', def: { cat: 'suit' as const, suit: 'dot' as const, rank: 2 } },
      { id: 'd5', def: { cat: 'suit' as const, suit: 'dot' as const, rank: 4 } },
      { id: 'd6', def: { cat: 'suit' as const, suit: 'dot' as const, rank: 4 } },
      { id: 'd7', def: { cat: 'suit' as const, suit: 'dot' as const, rank: 5 } },
      { id: 'd8', def: { cat: 'suit' as const, suit: 'dot' as const, rank: 8 } },
      { id: 'd9', def: { cat: 'dragon' as const, dragon: 'soap' as const } },
      { id: 'd10', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 1 } },
      { id: 'd11', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 7 } },
      { id: 'd12', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 8 } },
      { id: 'd13', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 9 } },
      { id: 'd14', def: { cat: 'flower' as const } },
      { id: 'd15', def: { cat: 'dragon' as const, dragon: 'red' as const } },
    ]
    const exposures = [
      {
        tiles: [
          { id: 's1', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 2 } },
          { id: 's2', def: { cat: 'joker' as const } },
          { id: 's3', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 2 } },
        ],
      },
      {
        tiles: [
          { id: 'n1', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 5 } },
          { id: 'n2', def: { cat: 'joker' as const } },
          { id: 'n3', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 5 } },
        ],
      },
    ]
    const ranked = rankSuggestedHands({
      hand,
      wallRemaining: 80,
      discards,
      exposures,
      deckSettings: { totalJokersInGame: 8, totalBlanksInGame: 0 },
      patterns: [pattern],
    })
    const line = ranked.find((l) => l.id === pattern.id)
    expect(line?.tilesNeededRough).toBe(6)
    // Concealed + joker-gated: precise odds stay low (old viability heuristic was >10%).
    expect(line?.completionProbability).toBeGreaterThan(0)
    expect(line?.completionProbability).toBeLessThan(99)
    expect(isHandDeadByVisibleTiles(
      [{ tileType: 's:crak:2', targetCount: 1 }],
      {},
      { 's:crak:2': 2 },
      DEFAULT_DECK_COMPOSITION,
    )).toBe(false)
  })
})

describe('liveClaimableDiscard completion probability', () => {
  it('sets Prob % to 100 when a live discard wins the line, without changing Away', () => {
    // 369-1a: 333 666 6666 9999 — one 6-dot away; West just discarded that 6-dot.
    const pattern = NMJL_2026_PATTERNS.find(
      (p) => p.section === '369' && p.cardHandCode === '1a',
    )!
    const hand = [
      { id: 'b3a', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 3 } },
      { id: 'b3b', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 3 } },
      { id: 'b3c', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 3 } },
      { id: 'b6a', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 6 } },
      { id: 'b6b', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 6 } },
      { id: 'd6a', def: { cat: 'suit' as const, suit: 'dot' as const, rank: 6 } },
      { id: 'd6b', def: { cat: 'suit' as const, suit: 'dot' as const, rank: 6 } },
      { id: 'd6c', def: { cat: 'suit' as const, suit: 'dot' as const, rank: 6 } },
      { id: 'd9a', def: { cat: 'suit' as const, suit: 'dot' as const, rank: 9 } },
      { id: 'd9b', def: { cat: 'suit' as const, suit: 'dot' as const, rank: 9 } },
      { id: 'j1', def: { cat: 'joker' as const } },
      { id: 'j2', def: { cat: 'joker' as const } },
      { id: 'j3', def: { cat: 'joker' as const } },
    ]
    const live = {
      id: 'd6-live',
      def: { cat: 'suit' as const, suit: 'dot' as const, rank: 6 },
    }

    const withoutLive = rankSuggestedHands({
      hand,
      wallRemaining: 60,
      discards: [],
      exposures: [],
      patterns: [pattern],
      deckSettings: { totalJokersInGame: 8, totalBlanksInGame: 0 },
    })
    const withLive = rankSuggestedHands({
      hand,
      wallRemaining: 60,
      discards: [],
      exposures: [],
      patterns: [pattern],
      deckSettings: { totalJokersInGame: 8, totalBlanksInGame: 0 },
      liveClaimableDiscard: live,
    })

    const base = withoutLive.find((l) => l.id === pattern.id)!
    const boosted = withLive.find((l) => l.id === pattern.id)!
    expect(base.tilesNeededRough).toBe(1)
    expect(base.completionProbability).toBeGreaterThan(0)
    expect(base.completionProbability).toBeLessThan(100)
    expect(boosted.tilesNeededRough).toBe(1)
    expect(boosted.completionProbability).toBe(100)
  })

  it('lowers Prob when a needed tile is lit but cannot be called (2468 FFF 22 44 666 8888)', () => {
    // One natural 8, no jokers — cannot pung/kong the discarded 8. That copy leaves the
    // hidden outs pool, so Prob should fall (not rise via a fake concealed pickup).
    const pattern =
      PRACTICE_PATTERNS.find((p) => p.id === '2468-7') ??
      NMJL_2026_PATTERNS.find((p) => p.section === '2468' && p.cardHandCode === '5')!
    const hand = [
      { id: 'f1', def: { cat: 'flower' as const } },
      { id: 'f2', def: { cat: 'flower' as const } },
      { id: 'f3', def: { cat: 'flower' as const } },
      { id: 'b2a', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 2 } },
      { id: 'b2b', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 2 } },
      { id: 'b3', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 3 } },
      { id: 'b4a', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 4 } },
      { id: 'b4b', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 4 } },
      { id: 'gd1', def: { cat: 'dragon' as const, dragon: 'green' as const } },
      { id: 'gd2', def: { cat: 'dragon' as const, dragon: 'green' as const } },
      { id: 'b6', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 6 } },
      { id: 'b8', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 8 } },
      { id: 'n1', def: { cat: 'wind' as const, wind: 'N' as const } },
    ]
    const live = {
      id: 'b8-live',
      def: { cat: 'suit' as const, suit: 'bam' as const, rank: 8 },
    }

    const withoutLive = rankSuggestedHands({
      hand,
      wallRemaining: 82,
      discards: [],
      exposures: [],
      patterns: [pattern],
      deckSettings: { totalJokersInGame: 8, totalBlanksInGame: 0 },
    })
    const withLive = rankSuggestedHands({
      hand,
      wallRemaining: 82,
      discards: [],
      exposures: [],
      patterns: [pattern],
      deckSettings: { totalJokersInGame: 8, totalBlanksInGame: 0 },
      liveClaimableDiscard: live,
    })

    const base = withoutLive.find((l) => l.id === pattern.id)!
    const lit = withLive.find((l) => l.id === pattern.id)!
    expect(base.tilesNeededRough).toBe(5)
    expect(lit.tilesNeededRough).toBe(5)
    expect(base.completionProbability).toBeGreaterThan(0)
    expect(lit.completionProbability).toBeLessThan(base.completionProbability)
  })

  it('still boosts Prob when a lit discard can legally pung toward the line', () => {
    const pattern =
      PRACTICE_PATTERNS.find((p) => p.id === '2468-7') ??
      NMJL_2026_PATTERNS.find((p) => p.section === '2468' && p.cardHandCode === '5')!
    // Two natural 6s → can pung a discarded 6 toward 666.
    const hand = [
      { id: 'f1', def: { cat: 'flower' as const } },
      { id: 'f2', def: { cat: 'flower' as const } },
      { id: 'f3', def: { cat: 'flower' as const } },
      { id: 'b2a', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 2 } },
      { id: 'b2b', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 2 } },
      { id: 'b4a', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 4 } },
      { id: 'b4b', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 4 } },
      { id: 'b6a', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 6 } },
      { id: 'b6b', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 6 } },
      { id: 'b8a', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 8 } },
      { id: 'b8b', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 8 } },
      { id: 'b3', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 3 } },
      { id: 'n1', def: { cat: 'wind' as const, wind: 'N' as const } },
    ]
    const live = {
      id: 'b6-live',
      def: { cat: 'suit' as const, suit: 'bam' as const, rank: 6 },
    }

    const withoutLive = rankSuggestedHands({
      hand,
      wallRemaining: 82,
      discards: [],
      exposures: [],
      patterns: [pattern],
      deckSettings: { totalJokersInGame: 8, totalBlanksInGame: 0 },
    })
    const withLive = rankSuggestedHands({
      hand,
      wallRemaining: 82,
      discards: [],
      exposures: [],
      patterns: [pattern],
      deckSettings: { totalJokersInGame: 8, totalBlanksInGame: 0 },
      liveClaimableDiscard: live,
    })

    const base = withoutLive.find((l) => l.id === pattern.id)!
    const lit = withLive.find((l) => l.id === pattern.id)!
    expect(lit.tilesNeededRough).toBe(base.tilesNeededRough)
    expect(lit.completionProbability).toBeGreaterThan(base.completionProbability)
  })
})

describe('odd-pair-kongs-triple completion slots', () => {
  it('models 13579 #4 six-pack as per-rank singles/pair (not 6-of-a-kind)', () => {
    const pattern = NMJL_2026_PATTERNS.find(
      (p) => p.section === '13579' && p.cardHandCode === '4',
    )!
    const hand = [
      { id: 'c1', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 1 } },
      { id: 'c3', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 3 } },
      { id: 'c5', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 5 } },
      { id: 'c7a', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 7 } },
      { id: 'c7b', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 7 } },
      { id: 'c9', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 9 } },
      { id: 'b7a', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 7 } },
      { id: 'b7b', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 7 } },
      { id: 'd7a', def: { cat: 'suit' as const, suit: 'dot' as const, rank: 7 } },
      { id: 'd7b', def: { cat: 'suit' as const, suit: 'dot' as const, rank: 7 } },
      { id: 'j1', def: { cat: 'joker' as const } },
      { id: 'junk1', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 1 } },
      { id: 'junk2', def: { cat: 'suit' as const, suit: 'dot' as const, rank: 5 } },
      { id: 'junk3', def: { cat: 'suit' as const, suit: 'dot' as const, rank: 8 } },
    ]
    const ranked = rankSuggestedHands({
      hand,
      wallRemaining: 66,
      discards: [],
      exposures: [],
      patterns: [pattern],
      deckSettings: { totalJokersInGame: 8, totalBlanksInGame: 0 },
    })
    const line = ranked.find((l) => l.id === pattern.id)!
    // Greedy Away and Prob deficit must agree: six-pack is complete; only kong gaps remain.
    expect(line.tilesNeededRough).toBe(3)
    expect(line.completionProbability).toBeGreaterThan(10)
  })
})

describe('joker-swap Prob relief vs required naturals', () => {
  it('does not raise Prob when the only swap natural is needed as a six-pack single (13579 #4)', () => {
    // Hand aims at 113579 (crak, pair 7) + kong 7 bam + kong 7 dot. West exposes 5-crak + joker;
    // swapping the sole 5-crak for that joker would ruin the six-pack single (jokers cannot fill it).
    const pattern = NMJL_2026_PATTERNS.find(
      (p) => p.section === '13579' && p.cardHandCode === '4',
    )!
    const hand = [
      { id: 'c1', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 1 } },
      { id: 'c3', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 3 } },
      { id: 'c5', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 5 } },
      { id: 'c7a', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 7 } },
      { id: 'c7b', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 7 } },
      { id: 'c9', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 9 } },
      { id: 'b7a', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 7 } },
      { id: 'b7b', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 7 } },
      { id: 'd7a', def: { cat: 'suit' as const, suit: 'dot' as const, rank: 7 } },
      { id: 'd7b', def: { cat: 'suit' as const, suit: 'dot' as const, rank: 7 } },
      { id: 'j1', def: { cat: 'joker' as const } },
      { id: 'junk1', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 1 } },
      { id: 'junk2', def: { cat: 'suit' as const, suit: 'dot' as const, rank: 5 } },
    ]
    const westExposure = {
      seat: 'West' as const,
      claimType: 'pung' as const,
      tiles: [
        { id: 'w5a', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 5 } },
        { id: 'wj', def: { cat: 'joker' as const } },
        { id: 'w5b', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 5 } },
      ],
    }

    const withoutSwap = rankSuggestedHands({
      hand,
      wallRemaining: 60,
      discards: [],
      exposures: [westExposure],
      patterns: [pattern],
      deckSettings: { totalJokersInGame: 8, totalBlanksInGame: 0 },
    })
    const withSwap = rankSuggestedHands({
      hand,
      wallRemaining: 60,
      discards: [],
      exposures: [westExposure],
      patterns: [pattern],
      deckSettings: { totalJokersInGame: 8, totalBlanksInGame: 0 },
      jokerSwapHintForProb: {
        enabled: true,
        hand,
        pendingDiscard: null,
        botExposures: [westExposure],
        eastExposures: [],
      },
    })

    const base = withoutSwap.find((l) => l.id === pattern.id)!
    const lit = withSwap.find((l) => l.id === pattern.id)!
    expect(base.tilesNeededRough).toBeGreaterThan(0)
    expect(lit.tilesNeededRough).toBe(base.tilesNeededRough)
    expect(lit.completionProbability).toBe(base.completionProbability)
  })

  it('still raises Prob when a surplus natural can redeem an exposed joker', () => {
    // Same 13579 #4 shape, but an extra 6-crak can swap for West's 6-crak joker without
    // touching the six-pack — that joker helps the kong gaps.
    const pattern = NMJL_2026_PATTERNS.find(
      (p) => p.section === '13579' && p.cardHandCode === '4',
    )!
    const hand = [
      { id: 'c1', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 1 } },
      { id: 'c3', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 3 } },
      { id: 'c5', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 5 } },
      { id: 'c7a', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 7 } },
      { id: 'c7b', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 7 } },
      { id: 'c9', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 9 } },
      { id: 'b7a', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 7 } },
      { id: 'b7b', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 7 } },
      { id: 'd7a', def: { cat: 'suit' as const, suit: 'dot' as const, rank: 7 } },
      { id: 'd7b', def: { cat: 'suit' as const, suit: 'dot' as const, rank: 7 } },
      { id: 'j1', def: { cat: 'joker' as const } },
      { id: 'spare6', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 6 } },
      { id: 'junk2', def: { cat: 'suit' as const, suit: 'dot' as const, rank: 5 } },
    ]
    const westExposure = {
      seat: 'West' as const,
      claimType: 'pung' as const,
      tiles: [
        { id: 'w6a', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 6 } },
        { id: 'wj', def: { cat: 'joker' as const } },
        { id: 'w6b', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 6 } },
      ],
    }

    const withoutSwap = rankSuggestedHands({
      hand,
      wallRemaining: 60,
      discards: [],
      exposures: [westExposure],
      patterns: [pattern],
      deckSettings: { totalJokersInGame: 8, totalBlanksInGame: 0 },
    })
    const withSwap = rankSuggestedHands({
      hand,
      wallRemaining: 60,
      discards: [],
      exposures: [westExposure],
      patterns: [pattern],
      deckSettings: { totalJokersInGame: 8, totalBlanksInGame: 0 },
      jokerSwapHintForProb: {
        enabled: true,
        hand,
        pendingDiscard: null,
        botExposures: [westExposure],
        eastExposures: [],
      },
    })

    const base = withoutSwap.find((l) => l.id === pattern.id)!
    const lit = withSwap.find((l) => l.id === pattern.id)!
    expect(lit.completionProbability).toBeGreaterThan(base.completionProbability)
  })
})
