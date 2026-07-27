import type { Dragon, EastExposure, Suit, TileDef, TileInstance } from '../mahjong/types'
import { findExactMatches, tileDefsEqual } from '../mahjong/tileUtils'
import { collectSwappableJokerTileIds } from '../mahjong/jokerSwapTarget'
import type { CardInk } from '../card/cardText'
import {
  firstOpposingConsecutiveStandInPairFromTitle,
  jokerEligibleGroupToDisplayFromPattern,
  pairKongsTripleBlockRanks,
  oddPairKongsTripleGroupTileCount,
  patternLinePreviewCardInks,
  patternLinePreviewGroupOrderDefs,
  patternLinePreviewSlots,
  patternPreviewJokerEligibleBySlot,
  inferCardLineFromGroupSlotMap,
  reorderTileDefsByCardLineFromGroupMap,
  srsDragonCoupledColumn,
} from '../card/patternLinePreview'
import { getActiveCardPatterns, patternByIdLookup } from '../card/activeCardPatternsScope'
import { suitPermutations } from '../card/nmjlSuitSlots'
import type { PatternGroup, PracticePattern } from '../card/practicePatterns'
import type { SuggestedHandLine } from '../training/types'
import { suggestedHandSectionMenuLabel } from '../suggestedHands/filterSettings'
import type { BotExposure } from './types'
import {
  placeExposureMeldsOnCardLine,
  type ExposureMeld,
} from './botExposureHandStrip'
import {
  claimMeldsFitPracticePattern,
  tileInstancesWithClaimMeldJokersResolved,
  tileInstancesWithClaimMeldJokersResolvedForTilesAway,
} from './eastExposurePatternFit'
import {
  addDeadHintNeed,
  deadHintDefKey,
  deadHintStandardDefsToProbe,
  meldDefIsJokerEligible,
  type DeadHintNeedMap,
} from '../mahjong/deadHintVariants'
import {
  calculateWallCompletionProbability,
  DEFAULT_DECK_COMPOSITION,
  estimateWallCompletionProbability,
  jokerSwapHintReliefForLine,
  type DeckComposition,
  type HandCompletionMetrics,
  type HandInventoryContext,
  type CompletionSlot,
} from './handCompletion'
import {
  buildDeterministicCompletionSlots,
  buildInventoryContext,
  computeTierCompletionMetrics,
  resolveBestPatternCompletion,
} from './handCompletionSlots'

/**
 * Table tiles known dead/out for wall-outs math.
 * Excludes `excludeTileIds` (this seat’s claim-meld tiles) — those are already in rack
 * inventory; counting them again as “visible” double-subtracts and falsely kills outs.
 */
function tableVisibleTiles(
  discards: TileInstance[],
  botExposures: BotExposure[],
  eastTableClaimMelds: ReadonlyArray<{ tiles: TileInstance[] }>,
  excludeTileIds?: ReadonlySet<string>,
): TileInstance[] {
  const keep = (t: TileInstance) => !excludeTileIds?.has(t.id)
  return [
    ...discards.filter(keep),
    ...botExposures.flatMap((e) => e.tiles).filter(keep),
    ...eastTableClaimMelds.flatMap((e) => e.tiles).filter(keep),
  ]
}

function countTableVisibility(visible: TileInstance[]): {
  naturals: Record<string, number>
  jokers: number
  blanks: number
} {
  const naturals: Record<string, number> = {}
  let jokers = 0
  let blanks = 0
  for (const t of visible) {
    if (t.def.cat === 'joker') {
      jokers += 1
      continue
    }
    if (t.def.cat === 'blank') {
      blanks += 1
      continue
    }
    const k = deadHintDefKey(t.def)
    naturals[k] = (naturals[k] ?? 0) + 1
  }
  return { naturals, jokers, blanks }
}

function deckCompositionFromInput(input: RankSuggestedHandsInput): DeckComposition {
  return {
    totalJokersInGame:
      input.deckSettings?.totalJokersInGame ?? DEFAULT_DECK_COMPOSITION.totalJokersInGame,
    totalBlanksInGame: input.deckSettings?.totalBlanksInGame ?? 0,
  }
}

function wallCompletionProbForLine(
  p: PracticePattern,
  rackForPattern: TileInstance[],
  visible: TileInstance[],
  wallRemaining: number,
  deck: DeckComposition,
  slots: readonly CompletionSlot[],
  ctx: HandInventoryContext,
  completion: HandCompletionMetrics,
  tilesNeededRough: number,
  swappableExposedJokers = 0,
  /** Physical rack size for Prob (hand+claims, plus staged discard still on your tray). */
  playerRackTileCount = rackForPattern.length,
): number {
  if (slots.length === 0) {
    return estimateWallCompletionProbability(tilesNeededRough, wallRemaining, completion.P)
  }
  const vis = countTableVisibility(visible)
  const jokerReliefFromSwapHint = jokerSwapHintReliefForLine(
    swappableExposedJokers,
    slots,
    ctx,
    completion,
    vis.naturals,
    deck,
    p.closed,
    p.section === 'SINGLES AND PAIRS',
  )
  return calculateWallCompletionProbability({
    slots,
    ctx,
    completion,
    visibleNaturals: vis.naturals,
    visibleJokers: vis.jokers,
    visibleBlanks: vis.blanks,
    wallRemaining,
    isConcealed: p.closed,
    isSinglesAndPairs: p.section === 'SINGLES AND PAIRS',
    deck,
    playerRackTileCount,
    tilesNeededRough,
    jokerReliefFromSwapHint,
  })
}

/** Tiles-away for one practice line with a specific concealed hand + claim melds. */
function tilesAwayForPracticePattern(
  p: PracticePattern,
  hand: TileInstance[],
  claimMelds: ReadonlyArray<{ tiles: TileInstance[] }>,
): number {
  const rack = rackForPatternWithClaimMelds(hand, claimMelds)
  const exposureTileIds =
    claimMelds.length > 0
      ? new Set(claimMelds.flatMap((e) => e.tiles).map((t) => t.id))
      : undefined
  const opts: GroupMatchOpts = {
    noJokers: p.section === 'SINGLES AND PAIRS',
    leftToRight: true,
    requireCompleteRunSingles: true,
    ...(exposureTileIds && exposureTileIds.size > 0 ? { exposureTileIds } : {}),
  }
  const matched = p.groups?.length
    ? computeGroupMatch(rack, p.groups, opts)
    : rack.filter((t) => p.matches(t.def)).length
  return Math.max(0, p.roughTarget - matched)
}

function pickHandTilesForLiveClaim(
  hand: TileInstance[],
  calledDef: TileDef,
  needed: number,
): TileInstance[] | null {
  const realMatches = findExactMatches(hand, calledDef)
  const handJokers = hand.filter((t) => t.def.cat === 'joker')
  const realsToUse = realMatches.slice(0, Math.min(needed, realMatches.length))
  const jokersToUse = handJokers.slice(0, needed - realsToUse.length)
  const usedTiles = [...realsToUse, ...jokersToUse]
  if (usedTiles.length < needed) return null
  return usedTiles
}

/**
 * True when claiming the live unreclaimed discard completes this practice line (0 away),
 * using the same concealed / pair-exposure / pung–sextet paths as Call → Mah Jongg.
 * Does not change Away — only used to lift Prob % while Call/Ignore are offered.
 */
function liveClaimableDiscardCompletesPattern(
  p: PracticePattern,
  hand: TileInstance[],
  existingMelds: ReadonlyArray<{ tiles: TileInstance[] }>,
  called: TileInstance,
): boolean {
  if (called.def.cat === 'joker') return false

  // (a) 14th tile into the concealed rack (no new exposure).
  if (tilesAwayForPracticePattern(p, [...hand, called], existingMelds) === 0) return true

  // Concealed (C) lines cannot open a new exposure to win on a discard.
  if (p.closed) return false

  // (b) Two-tile claim exposure (pair / single-style groups).
  const oneFromHand = findExactMatches(hand, called.def)
  for (const t of oneFromHand) {
    const handNext = hand.filter((x) => x.id !== t.id)
    const melds = [...existingMelds, { tiles: [called, t] }]
    if (!claimMeldsFitPracticePattern(p, melds)) continue
    if (tilesAwayForPracticePattern(p, handNext, melds) === 0) return true
  }

  // (c–d) Pung / kong / quint / sextet (2–5 tiles from hand + discard).
  for (const needed of [2, 3, 4, 5] as const) {
    const used = pickHandTilesForLiveClaim(hand, called.def, needed)
    if (!used) continue
    const usedIds = new Set(used.map((t) => t.id))
    const handNext = hand.filter((t) => !usedIds.has(t.id))
    const melds = [...existingMelds, { tiles: [called, ...used] }]
    if (!claimMeldsFitPracticePattern(p, melds)) continue
    if (tilesAwayForPracticePattern(p, handNext, melds) === 0) return true
  }

  return false
}

/**
 * Best post-claim rack if `called` can be claimed toward `p` (Away strictly improves).
 * Used so Prob already prices a live Call; committing the call should not drop the %.
 */
function previewLiveClaimForProbability(
  p: PracticePattern,
  hand: TileInstance[],
  existingMelds: ReadonlyArray<{ tiles: TileInstance[] }>,
  called: TileInstance,
  currentAway: number,
): { hand: TileInstance[]; melds: ReadonlyArray<{ tiles: TileInstance[] }>; away: number } | null {
  if (called.def.cat === 'joker' || currentAway <= 0) return null

  let best: { hand: TileInstance[]; melds: ReadonlyArray<{ tiles: TileInstance[] }>; away: number } | null =
    null

  const consider = (
    handNext: TileInstance[],
    melds: ReadonlyArray<{ tiles: TileInstance[] }>,
  ) => {
    if (melds.length > existingMelds.length && !claimMeldsFitPracticePattern(p, melds)) return
    const away = tilesAwayForPracticePattern(p, handNext, melds)
    if (away >= currentAway) return
    if (!best || away < best.away) best = { hand: handNext, melds, away }
  }

  // Concealed 14th (no new exposure).
  consider([...hand, called], existingMelds)

  if (!p.closed) {
    const oneFromHand = findExactMatches(hand, called.def)
    for (const t of oneFromHand) {
      const handNext = hand.filter((x) => x.id !== t.id)
      consider(handNext, [...existingMelds, { tiles: [called, t] }])
    }
    for (const needed of [2, 3, 4, 5] as const) {
      const used = pickHandTilesForLiveClaim(hand, called.def, needed)
      if (!used) continue
      const usedIds = new Set(used.map((t) => t.id))
      const handNext = hand.filter((t) => !usedIds.has(t.id))
      consider(handNext, [...existingMelds, { tiles: [called, ...used] }])
    }
  }

  return best
}

/**
 * Wall-completion %. A live claimable discard that already wins → 100.
 * A live discard that improves Away is scored on the post-claim rack so Call does not
 * drop Prob. Away in the UI stays pre-call.
 */
function completionProbabilityForLine(
  p: PracticePattern,
  rackForPattern: TileInstance[],
  visible: TileInstance[],
  wallRemaining: number,
  deck: DeckComposition,
  slots: readonly CompletionSlot[],
  ctx: HandInventoryContext,
  completion: HandCompletionMetrics,
  tilesNeededRough: number,
  swappableExposedJokers: number,
  hand: TileInstance[],
  playerClaimMelds: ReadonlyArray<{ tiles: TileInstance[] }>,
  liveClaimableDiscard: TileInstance | null | undefined,
  playerRackTileCount: number,
  discards: TileInstance[],
): number {
  if (
    liveClaimableDiscard &&
    tilesNeededRough > 0 &&
    tilesNeededRough <= 1 &&
    liveClaimableDiscardCompletesPattern(p, hand, playerClaimMelds, liveClaimableDiscard)
  ) {
    return 100
  }

  const livePreview =
    liveClaimableDiscard && tilesNeededRough > 1
      ? previewLiveClaimForProbability(
          p,
          hand,
          playerClaimMelds,
          liveClaimableDiscard,
          tilesNeededRough,
        )
      : null

  if (livePreview) {
    const previewRack = rackForPatternWithClaimMelds(livePreview.hand, livePreview.melds)
    const resolved = resolveBestPatternCompletion(p, previewRack, discards)
    // Own claim tiles (including the new exposure) stay out of visible outs.
    const ownIds = new Set(livePreview.melds.flatMap((m) => m.tiles).map((t) => t.id))
    const previewVisible = visible.filter((t) => !ownIds.has(t.id))
    return wallCompletionProbForLine(
      p,
      previewRack,
      previewVisible,
      wallRemaining,
      deck,
      resolved.slots,
      resolved.ctx,
      resolved.metrics,
      livePreview.away,
      swappableExposedJokers,
      previewRack.length,
    )
  }

  return wallCompletionProbForLine(
    p,
    rackForPattern,
    visible,
    wallRemaining,
    deck,
    slots,
    ctx,
    completion,
    tilesNeededRough,
    swappableExposedJokers,
    playerRackTileCount,
  )
}

/** Hand + claim melds for tiles-away: flower-meld jokers stay off the rack; other melds resolve jokers. */
function rackForPatternWithClaimMelds(
  hand: TileInstance[],
  playerClaimMelds: ReadonlyArray<{ tiles: TileInstance[] }>,
): TileInstance[] {
  return tileInstancesWithClaimMeldJokersResolvedForTilesAway(hand, playerClaimMelds)
}

function pressureLabel(need: number, wall: number): SuggestedHandLine['pressure'] {
  const ratio = need / Math.max(1, wall)
  if (ratio < 0.28) return 'comfortable'
  if (ratio < 0.52) return 'tight'
  return 'desperate'
}

/**
 * Returns a grouping key for a tile:
 *   suit tiles  → the rank as a string ("1"…"9")
 *   dragon tiles → dragon type ("red" | "green" | "soap")
 *   wind tiles   → wind direction ("N" | "E" | "W" | "S")
 *   others       → the category string
 */
function tileKey(def: TileInstance['def']): string {
  if (def.cat === 'suit')   return String(def.rank)
  if (def.cat === 'dragon') return def.dragon
  if (def.cat === 'wind')   return def.wind
  return def.cat
}

const SUITS: Suit[] = ['bam', 'dot', 'crak']

/**
 * After you **pick** a real suit for a suit-locked line, American mahjong pairs that suit’s
 * column dragons (bam→green, dot→soap, crak→red). This is **not** the same thing as “red ink on
 * the card always means craks” — see `nmjlSuitSlots.ts` for three-color **slots** vs stand-in preview.
 */
const DRAGON_FOR_SUIT: Record<Suit, 'red' | 'green' | 'soap'> = {
  crak: 'red',
  bam: 'green',
  dot: 'soap',
}

/** True when `g` is an unconstrained dragon `fixed` group (any of the three dragons). */
function isGenericAllDragonsFixedGroup(g: PatternGroup): boolean {
  if (g.kind !== 'fixed') return false
  return (
    g.test({ cat: 'dragon', dragon: 'red' }) &&
    g.test({ cat: 'dragon', dragon: 'green' }) &&
    g.test({ cat: 'dragon', dragon: 'soap' })
  )
}

/** Identical-tile meld (pair / pung / kong): pick the dragon type with the most copies in `rem`. */
function pickBestDragonTypeFromRem(rem: readonly TileInstance[]): Dragon | null {
  let best: Dragon | null = null
  let bestCount = 0
  for (const dr of DRAGON_PAIR_ORDER) {
    const c = rem.filter((t) => t.def.cat === 'dragon' && t.def.dragon === dr).length
    if (c > bestCount) {
      bestCount = c
      best = dr
    }
  }
  return bestCount > 0 ? best : null
}

/** One tile consumed by `computeGroupMatch` (natural or joker fill), for preview-strip alignment. */
export type GroupUsedMeta = {
  id: string
  groupIdx: number
  /** Natural tiles in the first vs second rank arm of a `consec` group. */
  consecPart?: 0 | 1
  isJoker?: boolean
}

type GroupMatchOpts = {
  /**
   * NMJL / common card notes: jokers never count toward **Singles and Pairs** hands
   * (see e.g. Southern Sparrow, “Singles and Pairs: No Jokers can be used in these hands” —
   * https://southernsparrow.com/pages/how-to-read-the-national-mah-jongg-league-card-nmjl-card ).
   */
  noJokers?: boolean
  /** When set, each tile id removed by the greedy matcher is appended in order (for UI + rack sort). */
  usedOut?: string[]
  /** Parallel detail: which pattern group each `usedOut` id belongs to (and consec arm / joker fill). */
  usedMeta?: GroupUsedMeta[]
  /**
   * When true, take tiles left-to-right instead of right-to-left. Used by the highlight and
   * sort paths so that leftmost copies of duplicate tiles are always the ones marked "best" —
   * keeping the rack sort and the highlight computation consistent with each other.
   */
  leftToRight?: boolean
  /**
   * Tile ids in this seat’s exposure melds. A kong-sized natural commit in one column of a
   * `shared-rank-suits` group (e.g. ANY LIKE NUMBERS) fixes the like-number rank to that exposure.
   */
  exposureTileIds?: ReadonlySet<string>
  /**
   * When true, a suit-permute color group made only of non-joker run singles (e.g. 234) is credited
   * only if every rank in that group is available on the rack — partial runs do not reduce tiles-away.
   */
  requireCompleteRunSingles?: boolean
}

/**
 * When an exposure shows `max(...needs)` naturals of the same rank R in one suit column of a
 * `shared-rank-suits` group, only R is legal for that card line — do not score a different rank
 * higher from the concealed hand.
 */
function forcedSharedRankSuitsRankFromExposures(
  rack: TileInstance[],
  exposureTileIds: ReadonlySet<string> | undefined,
  g: Extract<PatternGroup, { kind: 'shared-rank-suits' }>,
): number | null {
  if (!exposureTileIds || exposureTileIds.size === 0) return null
  const maxNeed = Math.max(...g.needs)
  const counts = new Map<string, number>()
  for (const t of rack) {
    if (!exposureTileIds.has(t.id)) continue
    if (t.def.cat !== 'suit' || !g.test(t.def)) continue
    const k = `${t.def.rank}\0${t.def.suit}`
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  let locked: number | null = null
  for (const [k, c] of counts) {
    if (c < maxNeed) continue
    const sep = k.indexOf('\0')
    if (sep < 0) continue
    const rank = parseInt(k.slice(0, sep), 10)
    if (!Number.isFinite(rank) || rank < 1 || rank > 9) continue
    if (locked != null && locked !== rank) return null
    locked = rank
  }
  return locked
}

/**
 * Computes how many tiles in `hand` productively fill the pattern's explicit groups.
 * Each tile can only be used once (greedy left-to-right allocation).
 *
 * **Jokers:** NMJL allows them in any **identical meld of 3+** (pung / kong / quint / sextet):
 * suits, dragons, flowers, winds — never in singles, pairs, or runs built from single tiles (e.g. NEWS
 * or year digits as separate `fixed` groups with `need` 1 each).
 */
function countGroupPreviewSlots(g: PatternGroup): number {
  switch (g.kind) {
    case 'fixed':
      return g.need
    case 'rank':
      return g.need
    case 'consec':
      return g.need1 + g.need2
    case 'shared-rank':
      return g.needs.reduce((a, b) => a + b, 0)
    case 'shared-rank-suits':
      return g.needs.reduce((a, b) => a + b, 0)
    case 'suit-locked-rank':
      return g.need + (g.dragonCount ?? 0)
    case 'suit-locked-consec':
      return g.numGroups * g.rankCount + g.dragonCount
    case 'consec-multi':
    case 'suit-locked-consec-multi':
      return g.needs.reduce((a, b) => a + b, 0)
    case 'suit-locked': {
      let s = g.rankNeeds.reduce((acc, x) => acc + x.need, 0)
      s += g.dragonCount
      if (g.opposingDragons) {
        s += g.opposingDragons.eitherType
          ? g.opposingDragons.need
          : 2 * g.opposingDragons.need
      }
      return s
    }
    case 'suit-permute':
      return g.colorGroups.reduce((acc, cg, ci) =>
        acc + cg.reduce((sum, sg) => sum + sg.need, 0) + (g.colorGroupDragonCounts?.[ci] ?? 0), 0)
        + (g.trailingDragonCount ?? 0)
    case 'dragon-meld-permute':
      return g.needs.reduce((a, b) => a + b, 0)
    case 'odd-pair-kongs-triple':
      return oddPairKongsTripleGroupTileCount(g)
    default:
      return 0
  }
}

/**
 * `[start, end)` indices into `patternLinePreviewGroupOrderDefs(p)` for each `p.groups[i]`, when tile counts
 * match the preview strip length (same order as groups on the card).
 */
/** True if this preview tile “kind” matches what `g` consumes (strip must align with group semantics). */
function previewDefFitsGroupTileType(d: TileDef, g: PatternGroup): boolean {
  switch (g.kind) {
    case 'fixed':
      return g.test(d)
    case 'shared-rank':
    case 'shared-rank-suits':
      return d.cat === 'suit'
    case 'consec':
    case 'consec-multi':
    case 'suit-locked-consec-multi':
      return d.cat === 'suit'
    case 'suit-locked-rank':
      return d.cat === 'suit' || (d.cat === 'dragon' && (g.dragonCount ?? 0) > 0)
    case 'suit-locked-consec':
      return d.cat === 'suit' || d.cat === 'dragon'
    case 'rank':
      return d.cat === 'suit' || d.cat === 'dragon'
    case 'suit-locked':
      return d.cat === 'suit' || d.cat === 'dragon'
    case 'suit-permute':
      return d.cat === 'suit' || (d.cat === 'dragon' && (
        (g.colorGroupDragonCounts?.some((dc) => dc > 0) ?? false) ||
        (g.trailingDragonCount ?? 0) > 0
      ))
    case 'dragon-meld-permute':
      return d.cat === 'dragon'
    case 'odd-pair-kongs-triple':
      return d.cat === 'suit'
    default:
      return true
  }
}

export function groupPreviewIndexSpans(p: PracticePattern): [number, number][] | null {
  if (!p.groups?.length) return null
  const defs = patternLinePreviewGroupOrderDefs(p)
  const defsLen = defs.length
  const spans: [number, number][] = []
  let c = 0
  for (let i = 0; i < p.groups.length; i++) {
    const g = p.groups[i]!
    const n = countGroupPreviewSlots(g)
    const a = c
    const b = c + n
    if (b > defsLen) return null
    for (let si = a; si < b; si++) {
      if (!previewDefFitsGroupTileType(defs[si]!, g)) return null
    }
    spans.push([a, b])
    c = b
  }
  if (c !== defsLen) return null
  return spans
}

/** Natural fill, joker-capable kong gaps, and exposure fill for one (pairRank, suit-perm) — 13579 #4. */
function oddPairKongsTripleScoreParts(
  rack: readonly TileInstance[],
  odds: readonly number[],
  pairRank: number,
  perm: readonly Suit[],
  exposureTileIds: ReadonlySet<string> | undefined,
  noJokers: boolean,
): { exposureFill: number; naturalTotal: number; totalWithJokers: number } {
  const jokerCount = rack.filter((t) => t.def.cat === 'joker').length
  const blockRanks = pairKongsTripleBlockRanks(odds, pairRank)
  const s0 = perm[0]!
  const s1 = perm[1]!
  const s2 = perm[2]!
  let sixNat = 0
  let exposureFill = 0
  const sixNeedByRank = new Map<number, number>()
  for (const r of blockRanks) {
    sixNeedByRank.set(r, (sixNeedByRank.get(r) ?? 0) + 1)
  }
  for (const [r, need] of sixNeedByRank) {
    const matching = rack.filter((t) => t.def.cat === 'suit' && t.def.suit === s0 && t.def.rank === r)
    sixNat += Math.min(matching.length, need)
    if (exposureTileIds) {
      exposureFill += Math.min(matching.filter((t) => exposureTileIds.has(t.id)).length, need)
    }
  }
  const m1 = rack.filter((t) => t.def.cat === 'suit' && t.def.suit === s1 && t.def.rank === pairRank)
  const m1nat = Math.min(m1.length, 4)
  if (exposureTileIds) {
    exposureFill += Math.min(m1.filter((t) => exposureTileIds.has(t.id)).length, 4)
  }
  const m2 = rack.filter((t) => t.def.cat === 'suit' && t.def.suit === s2 && t.def.rank === pairRank)
  const m2nat = Math.min(m2.length, 4)
  if (exposureTileIds) {
    exposureFill += Math.min(m2.filter((t) => exposureTileIds.has(t.id)).length, 4)
  }
  const naturalTotal = sixNat + m1nat + m2nat
  const kongJokerSlots = Math.max(0, 4 - m1nat) + Math.max(0, 4 - m2nat)
  const jokerFill = noJokers ? 0 : Math.min(jokerCount, kongJokerSlots)
  const totalWithJokers = naturalTotal + jokerFill
  return { exposureFill, naturalTotal, totalWithJokers }
}

/**
 * Best (pair rank, suit assignment) for `odd-pair-kongs-triple`: exposure naturals first, then
 * **total tiles toward 14** (naturals + jokers standing in for unfilled kong cells only — six-pack
 * singles/pair cannot use jokers per NMJL). This matches the end of {@link computeGroupMatch} for
 * this single group so we do not pick a worse line when jokers complete a kong-heavy variant.
 */
function pickBestOddPairKongsTriple(
  rack: readonly TileInstance[],
  odds: readonly number[],
  exposureTileIds: ReadonlySet<string> | undefined,
  lockedSuits: ReadonlySet<Suit> | undefined,
  noJokers: boolean,
): { pairRank: number; perm: Suit[] } {
  let bestExposureFill = -1
  let bestTotalWithJokers = -1
  let bestNatural = -1
  let bestSupport = -1
  let bestPairRank = odds[0] ?? 1
  let bestPerm: Suit[] = SUITS

  const rankSupport = (r: number) =>
    rack.filter((t) => t.def.cat === 'suit' && t.def.rank === r).length

  for (const pairRank of odds) {
    const support = rankSupport(pairRank)
    for (const perm of suitPermutations(3)) {
      if (lockedSuits && lockedSuits.size > 0 && perm.some((s) => lockedSuits.has(s))) continue
      const { exposureFill, naturalTotal, totalWithJokers } = oddPairKongsTripleScoreParts(
        rack,
        odds,
        pairRank,
        perm,
        exposureTileIds,
        noJokers,
      )
      const better =
        exposureFill > bestExposureFill ||
        (exposureFill === bestExposureFill && totalWithJokers > bestTotalWithJokers) ||
        (exposureFill === bestExposureFill &&
          totalWithJokers === bestTotalWithJokers &&
          naturalTotal > bestNatural) ||
        (exposureFill === bestExposureFill &&
          totalWithJokers === bestTotalWithJokers &&
          naturalTotal === bestNatural &&
          (support > bestSupport || (support === bestSupport && pairRank > bestPairRank)))

      if (better) {
        bestExposureFill = exposureFill
        bestTotalWithJokers = totalWithJokers
        bestNatural = naturalTotal
        bestSupport = support
        bestPairRank = pairRank
        bestPerm = perm
      }
    }
  }
  return { pairRank: bestPairRank, perm: bestPerm }
}

function isRunSinglesColorGroup(
  slots: ReadonlyArray<{ need: number; canUseJoker?: boolean }>,
): boolean {
  return slots.length >= 2 && slots.every((sg) => sg.need === 1 && !sg.canUseJoker)
}

function runSinglesColorGroupFullyAvailable(
  remaining: readonly TileInstance[],
  suit: Suit,
  slots: ReadonlyArray<{ rank: number; need: number }>,
  base: number,
): boolean {
  for (const sg of slots) {
    const rank = sg.rank - 1 + base
    let c = 0
    for (const t of remaining) {
      if (t.def.cat === 'suit' && t.def.suit === suit && t.def.rank === rank) c++
    }
    if (c < sg.need) return false
  }
  return true
}

function computeGroupMatch(hand: TileInstance[], groups: PatternGroup[], opts?: GroupMatchOpts): number {
  const remaining = [...hand]
  let total = 0
  const noJokers = opts?.noJokers ?? false
  const usedOut = opts?.usedOut
  const usedMeta = opts?.usedMeta
  const jokerSlotsByGroup = new Array(groups.length).fill(0)
  let jokerEligibleUnfilled = 0
  /** After a winning `shared-rank-suits`, pair the next DD groups to those suit columns (card order). */
  let srsDragonCoupling: { groupIndex: number; perm: Suit[] } | null = null

  /** Build a map from tileKey → tiles for all remaining tiles matching `pred`. */
  function byKey(pred: (def: TileInstance['def']) => boolean): Map<string, TileInstance[]> {
    const m = new Map<string, TileInstance[]>()
    for (const t of remaining) {
      if (!pred(t.def)) continue
      const k = tileKey(t.def)
      const arr = m.get(k) ?? []
      arr.push(t)
      m.set(k, arr)
    }
    return m
  }

  /** Build rank→count map for suit tiles matching `pred`. */
  function suitByRank(pred: (def: TileInstance['def']) => boolean): Map<number, number> {
    const m = new Map<number, number>()
    for (const t of remaining) {
      if (pred(t.def) && t.def.cat === 'suit') {
        m.set(t.def.rank, (m.get(t.def.rank) ?? 0) + 1)
      }
    }
    return m
  }

  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi]!

    function take(pred: (def: TileInstance['def']) => boolean, n: number, consecPart?: 0 | 1): number {
      let taken = 0
      if (opts?.leftToRight) {
        // Scan left-to-right so leftmost copies are consumed first (used by highlight/sort paths).
        for (let i = 0; i < remaining.length && taken < n; ) {
          if (pred(remaining[i]!.def)) {
            const [t] = remaining.splice(i, 1)
            if (t && usedOut) usedOut.push(t.id)
            if (t && usedMeta) {
              const row: GroupUsedMeta = { id: t.id, groupIdx: gi }
              if (consecPart !== undefined) row.consecPart = consecPart
              usedMeta.push(row)
            }
            taken++
            // don't increment i — next element has shifted into position i
          } else {
            i++
          }
        }
      } else {
        for (let i = remaining.length - 1; i >= 0 && taken < n; i--) {
          if (pred(remaining[i]!.def)) {
            const [t] = remaining.splice(i, 1)
            if (t && usedOut) usedOut.push(t.id)
            if (t && usedMeta) {
              const row: GroupUsedMeta = { id: t.id, groupIdx: gi }
              if (consecPart !== undefined) row.consecPart = consecPart
              usedMeta.push(row)
            }
            taken++
          }
        }
      }
      return taken
    }

    function noteJokerSlots(need: number, matched: number, skip = false) {
      if (noJokers || skip) return
      if (need < 3) return
      const u = need - matched
      if (u <= 0) return
      jokerEligibleUnfilled += u
      jokerSlotsByGroup[gi] += u
    }

    switch (g.kind) {

      case 'fixed': {
        let pred: (def: TileInstance['def']) => boolean = g.test
        const couple = srsDragonCoupling
        if (couple && g.need === 2 && isGenericAllDragonsFixedGroup(g)) {
          if (gi === couple.groupIndex + 1) {
            const dr = DRAGON_FOR_SUIT[couple.perm[0]!]!
            pred = d => d.cat === 'dragon' && d.dragon === dr
          } else if (gi === couple.groupIndex + 2 && couple.perm.length >= 2) {
            const dr = DRAGON_FOR_SUIT[couple.perm[1]!]!
            pred = d => d.cat === 'dragon' && d.dragon === dr
          }
        } else if (isGenericAllDragonsFixedGroup(g) && g.need >= 2) {
          // Any-dragon pair / pung / kong — must be identical tiles, not mixed types.
          const dr = pickBestDragonTypeFromRem(remaining)
          if (dr) {
            const m = take((d) => d.cat === 'dragon' && d.dragon === dr, g.need)
            total += m
            noteJokerSlots(g.need, m)
          } else {
            noteJokerSlots(g.need, 0)
          }
          break
        }
        const m = take(pred, g.need)
        total += m
        // Flower pungs/kongs take jokers (FFF/FFFF); pairs/singles still skipped via need < 3.
        noteJokerSlots(g.need, m)
        break
      }

      case 'rank': {
        // Pick the key (rank/type) with the most matching tiles, take up to `need`.
        const map = byKey(g.test)
        let bestKey = '', bestCount = 0
        for (const [k, ts] of map) {
          if (ts.length > bestCount) { bestCount = ts.length; bestKey = k }
        }
        if (bestKey) {
          const k = bestKey
          const m = take(d => g.test(d) && tileKey(d) === k, g.need)
          total += m
          noteJokerSlots(g.need, m)
        } else {
          noteJokerSlots(g.need, 0)
        }
        break
      }

      case 'suit-locked-rank': {
        // One suit + one rank (e.g. “1111” kong in a single suit), optionally with matched dragons.
        const drgForSuitSlr = { bam: 'green' as const, dot: 'soap' as const, crak: 'red' as const }
        const dcSlr = g.dragonCount ?? 0
        let bestFill = 0
        let bestSuit: Suit | null = null
        let bestRank = -1
        for (const s of SUITS) {
          for (let rank = 1; rank <= 9; rank++) {
            const c = remaining.filter(
              t => t.def.cat === 'suit' && t.def.suit === s && t.def.rank === rank && g.test(t.def),
            ).length
            let fill = Math.min(c, g.need)
            if (dcSlr > 0) {
              const drg = drgForSuitSlr[s]
              fill += Math.min(remaining.filter(t => t.def.cat === 'dragon' && t.def.dragon === drg).length, dcSlr)
            }
            if (fill > bestFill) {
              bestFill = fill
              bestSuit = s
              bestRank = rank
            }
          }
        }
        if (bestSuit !== null && bestRank >= 0) {
          const s = bestSuit
          const r = bestRank
          const m = take(
            d => d.cat === 'suit' && d.suit === s && d.rank === r && g.test(d),
            g.need,
          )
          total += m
          noteJokerSlots(g.need, m)
          if (dcSlr > 0) {
            const drg = drgForSuitSlr[s]
            const dm = take(d => d.cat === 'dragon' && d.dragon === drg, dcSlr)
            total += dm
            noteJokerSlots(dcSlr, dm)
          }
        } else {
          noteJokerSlots(g.need, 0)
          if (dcSlr > 0) noteJokerSlots(dcSlr, 0)
        }
        break
      }

      case 'consec': {
        // Each arm must be same-suit tiles (the two arms may use different suits).
        // Count per suit+rank so 3B+3C+3D does NOT inflate a single arm's fill count.
        const bySR = new Map<string, number>() // `${suit}:${rank}` → count
        for (const t of remaining) {
          if (t.def.cat === 'suit' && g.test(t.def)) {
            const k = `${t.def.suit}:${t.def.rank}`
            bySR.set(k, (bySR.get(k) ?? 0) + 1)
          }
        }
        let bestFill = 0, bestBalance = -1, bestR = -1
        let bestS1: string | null = null, bestS2: string | null = null
        for (const [k1, c1] of bySR) {
          const [s1, rStr] = k1.split(':') as [string, string]
          const r = parseInt(rStr)
          const f1 = Math.min(c1, g.need1)
          // Best suit for arm2 (rank r+1); if opposingSuits, arm2 suit must differ from arm1.
          let bestF2 = 0, bestSuit2: string | null = null
          for (const [k2, c2] of bySR) {
            const [s2, rStr2] = k2.split(':') as [string, string]
            if (parseInt(rStr2) !== r + 1) continue
            if (g.opposingSuits && s2 === s1) continue
            const f2 = Math.min(c2, g.need2)
            if (f2 > bestF2) { bestF2 = f2; bestSuit2 = s2 }
          }
          const fill = f1 + bestF2
          // Tiebreak: prefer pairs where BOTH arms have naturals (min of the two arms is higher).
          const balance = Math.min(f1, bestF2)
          if (fill > bestFill || (fill === bestFill && balance > bestBalance)) {
            bestFill = fill; bestBalance = balance; bestR = r; bestS1 = s1; bestS2 = bestSuit2
          }
        }
        if (bestR >= 0 && bestS1 !== null) {
          const s1 = bestS1
          const m1 = take(d => d.cat === 'suit' && d.suit === s1 && d.rank === bestR && g.test(d), g.need1, 0)
          total += m1
          noteJokerSlots(g.need1, m1)
          // For opposing-suit hands fall back to any suit that isn't s1; never reuse arm1's suit.
          const SUITS_ALL = ['bam', 'dot', 'crak'] as const
          const s2 = bestS2 ?? (g.opposingSuits
            ? (SUITS_ALL.find(s => s !== s1) ?? s1)
            : s1)
          const m2 = take(d => d.cat === 'suit' && d.suit === s2 && d.rank === bestR + 1 && g.test(d), g.need2, 1)
          total += m2
          noteJokerSlots(g.need2, m2)
        } else {
          noteJokerSlots(g.need1, 0)
          noteJokerSlots(g.need2, 0)
        }
        break
      }

      case 'shared-rank': {
        // All sub-groups must use the same rank/key. Find the key that maximises
        // min(available, totalNeed) then distribute greedily across sub-groups.
        const totalNeed = g.needs.reduce((a, b) => a + b, 0)
        const map = byKey(g.test)
        let bestKey = '', bestFill = 0
        for (const [k, ts] of map) {
          const fill = Math.min(ts.length, totalNeed)
          if (fill > bestFill) { bestFill = fill; bestKey = k }
        }
        if (bestKey) {
          const k = bestKey
          let rem = bestFill
          for (const need of g.needs) {
            if (rem <= 0) break
            const n = Math.min(need, rem)
            const m = take(d => g.test(d) && tileKey(d) === k, n)
            total += m
            noteJokerSlots(need, m)
            rem -= n
          }
        } else {
          for (const need of g.needs) noteJokerSlots(need, 0)
        }
        break
      }

      case 'shared-rank-suits': {
        // Same rank R; each needs[i] must come from a different suit (2 or 3 groups).
        const n = g.needs.length
        if (n < 2 || n > 3) break
        const forcedRank = forcedSharedRankSuitsRankFromExposures(remaining, opts?.exposureTileIds, g)
        const ranksToTry =
          forcedRank != null ? [forcedRank] : ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const)
        let bestFill = 0
        let bestRank = -1
        let bestPerm: Suit[] = []
        for (const rank of ranksToTry) {
          const counts: Record<Suit, number> = { bam: 0, dot: 0, crak: 0 }
          for (const t of remaining) {
            if (t.def.cat === 'suit' && g.test(t.def) && t.def.rank === rank) {
              counts[t.def.suit]++
            }
          }
          for (const perm of suitPermutations(n)) {
            let fill = 0
            for (let i = 0; i < n; i++) {
              fill += Math.min(counts[perm[i]!], g.needs[i]!)
            }
            if (fill > bestFill) {
              bestFill = fill
              bestRank = rank
              bestPerm = [...perm]
            }
          }
        }
        if (bestRank >= 0 && bestPerm.length === n) {
          srsDragonCoupling = { groupIndex: gi, perm: bestPerm }
          for (let i = 0; i < n; i++) {
            const s = bestPerm[i]!
            const need = g.needs[i]!
            const m = take(
              d => d.cat === 'suit' && d.suit === s && d.rank === bestRank && g.test(d),
              need,
            )
            total += m
            noteJokerSlots(need, m)
          }
        } else {
          for (const need of g.needs) noteJokerSlots(need, 0)
        }
        break
      }

      case 'suit-locked-consec': {
        // Find the (suit, startRank) pair that fills the most tiles.
        // Starting ranks 1 … (10 - numGroups) are valid for ranks 1-9.
        const dragonForSuit = { bam: 'green', dot: 'soap', crak: 'red' } as const
        const suits = ['bam', 'dot', 'crak'] as const
        const maxStart = 10 - g.numGroups

        let bestFill = 0
        let bestSuit: (typeof suits)[number] | null = null
        let bestStart = -1

        for (const s of suits) {
          // Build rank→count for this suit
          const byRank = new Map<number, number>()
          for (const t of remaining) {
            if (t.def.cat === 'suit' && t.def.suit === s) {
              byRank.set(t.def.rank, (byRank.get(t.def.rank) ?? 0) + 1)
            }
          }
          const drg = dragonForSuit[s]
          const dCount = Math.min(
            remaining.filter(t => t.def.cat === 'dragon' && t.def.dragon === drg).length,
            g.dragonCount
          )

          for (let r = 1; r <= maxStart; r++) {
            let fill = 0
            for (let i = 0; i < g.numGroups; i++) {
              fill += Math.min(byRank.get(r + i) ?? 0, g.rankCount)
            }
            fill += dCount
            if (fill > bestFill) { bestFill = fill; bestSuit = s; bestStart = r }
          }
        }

        if (bestSuit && bestStart >= 0) {
          const s = bestSuit
          for (let i = 0; i < g.numGroups; i++) {
            const rank = bestStart + i
            const m = take(d => d.cat === 'suit' && d.suit === s && d.rank === rank, g.rankCount)
            total += m
            noteJokerSlots(g.rankCount, m)
          }
          if (g.dragonCount > 0) {
            const drg = dragonForSuit[s]
            const md = take(d => d.cat === 'dragon' && d.dragon === drg, g.dragonCount)
            total += md
            noteJokerSlots(g.dragonCount, md)
          }
        } else {
          for (let i = 0; i < g.numGroups; i++) noteJokerSlots(g.rankCount, 0)
          if (g.dragonCount > 0) noteJokerSlots(g.dragonCount, 0)
        }
        break
      }

      case 'consec-multi': {
        // N consecutive rank groups of sizes needs[0..N-1]. Find best starting rank.
        const rc = suitByRank(g.test)
        const n = g.needs.length
        let bestFill = 0, bestR = -1
        for (const [r] of rc) {
          let fill = 0
          for (let i = 0; i < n; i++) fill += Math.min(rc.get(r + i) ?? 0, g.needs[i])
          if (fill > bestFill) { bestFill = fill; bestR = r }
        }
        if (bestR >= 0) {
          for (let i = 0; i < n; i++) {
            const rank = bestR + i
            const need = g.needs[i]!
            const m = take(d => d.cat === 'suit' && d.rank === rank, need)
            total += m
            noteJokerSlots(need, m)
          }
        } else {
          for (let i = 0; i < n; i++) noteJokerSlots(g.needs[i]!, 0)
        }
        break
      }

      case 'suit-locked-consec-multi': {
        // Like consec-multi, but every rank group must come from the **same** suit (NMJL quints line).
        const suits = ['bam', 'dot', 'crak'] as const
        const n = g.needs.length
        const maxStart = 10 - n
        let bestFill = 0
        let bestSuit: (typeof suits)[number] | null = null
        let bestStart = -1

        for (const s of suits) {
          const byRank = new Map<number, number>()
          for (const t of remaining) {
            if (t.def.cat === 'suit' && t.def.suit === s && g.test(t.def)) {
              byRank.set(t.def.rank, (byRank.get(t.def.rank) ?? 0) + 1)
            }
          }
          for (let r = 1; r <= maxStart; r++) {
            let fill = 0
            for (let i = 0; i < n; i++) {
              fill += Math.min(byRank.get(r + i) ?? 0, g.needs[i])
            }
            if (fill > bestFill) {
              bestFill = fill
              bestSuit = s
              bestStart = r
            }
          }
        }

        if (bestSuit && bestStart >= 0) {
          const s = bestSuit
          for (let i = 0; i < n; i++) {
            const rank = bestStart + i
            const need = g.needs[i]!
            const m = take(
              d => d.cat === 'suit' && d.suit === s && d.rank === rank && g.test(d),
              need,
            )
            total += m
            noteJokerSlots(need, m)
          }
        } else {
          for (let i = 0; i < n; i++) noteJokerSlots(g.needs[i]!, 0)
        }
        break
      }

      case 'suit-locked': {
        // All tiles must share one suit. The matching dragon type is suit-specific:
        //   bam → green,  dot → soap,  crak → red
        // Pairs (need < 3) never get joker slots; 3+ groups do (see noteJokerSlots).
        const dragonForSuit = { bam: 'green', dot: 'soap', crak: 'red' } as const
        // The two dragon types that do NOT match each suit (used for opposingDragons hands)
        const opposingForSuit = {
          bam:  ['soap', 'red'],
          dot:  ['green', 'red'],
          crak: ['green', 'soap'],
        } as const
        const suits = ['bam', 'dot', 'crak'] as const

        let bestFill = 0
        let bestSuit: (typeof suits)[number] | null = null

        for (const s of suits) {
          let fill = 0
          for (const { rank, need } of g.rankNeeds) {
            const count = remaining.filter(
              t => t.def.cat === 'suit' && t.def.suit === s && t.def.rank === rank
            ).length
            fill += Math.min(count, need)
          }
          if (g.dragonCount > 0) {
            const drg = dragonForSuit[s]
            const dCount = remaining.filter(
              t => t.def.cat === 'dragon' && t.def.dragon === drg
            ).length
            fill += Math.min(dCount, g.dragonCount)
          }
          if (g.opposingDragons) {
            const [drg1, drg2] = opposingForSuit[s]
            const need = g.opposingDragons.need
            if (g.opposingDragons.eitherType) {
              const c1 = remaining.filter(t => t.def.cat === 'dragon' && t.def.dragon === drg1).length
              const c2 = remaining.filter(t => t.def.cat === 'dragon' && t.def.dragon === drg2).length
              fill += Math.min(Math.max(c1, c2), need)
            } else {
              fill += Math.min(
                remaining.filter(t => t.def.cat === 'dragon' && t.def.dragon === drg1).length,
                need,
              )
              fill += Math.min(
                remaining.filter(t => t.def.cat === 'dragon' && t.def.dragon === drg2).length,
                need,
              )
            }
          }
          if (fill > bestFill) { bestFill = fill; bestSuit = s }
        }

        if (bestSuit) {
          const s = bestSuit
          if (g.dragonCount > 0) {
            const drg = dragonForSuit[s]
            const md = take(d => d.cat === 'dragon' && d.dragon === drg, g.dragonCount)
            total += md
            noteJokerSlots(g.dragonCount, md)
          }
          if (g.opposingDragons) {
            const [drg1, drg2] = opposingForSuit[s]
            const need = g.opposingDragons.need
            if (g.opposingDragons.eitherType) {
              const c1 = remaining.filter(t => t.def.cat === 'dragon' && t.def.dragon === drg1).length
              const c2 = remaining.filter(t => t.def.cat === 'dragon' && t.def.dragon === drg2).length
              const pick = c2 > c1 ? drg2 : drg1
              const mo = take(d => d.cat === 'dragon' && d.dragon === pick, need)
              total += mo
              noteJokerSlots(need, mo)
            } else {
              const mo1 = take(d => d.cat === 'dragon' && d.dragon === drg1, need)
              total += mo1
              noteJokerSlots(need, mo1)
              const mo2 = take(d => d.cat === 'dragon' && d.dragon === drg2, need)
              total += mo2
              noteJokerSlots(need, mo2)
            }
          }
          for (const { rank, need } of g.rankNeeds) {
            const m = take(d => d.cat === 'suit' && d.suit === s && d.rank === rank, need)
            total += m
            noteJokerSlots(need, m)
          }
        } else {
          if (g.dragonCount > 0) noteJokerSlots(g.dragonCount, 0)
          if (g.opposingDragons) {
            noteJokerSlots(g.opposingDragons.need, 0)
            if (!g.opposingDragons.eitherType) noteJokerSlots(g.opposingDragons.need, 0)
          }
          for (const { need } of g.rankNeeds) noteJokerSlots(need, 0)
        }
        break
      }

      case 'odd-pair-kongs-triple': {
        const odds = g.odds
        const { pairRank: bestPairRank, perm: bestPerm } = pickBestOddPairKongsTriple(
          remaining,
          odds,
          opts?.exposureTileIds,
          undefined,
          noJokers,
        )
        const blockRanksTake = pairKongsTripleBlockRanks(odds, bestPairRank)
        const s0t = bestPerm[0]!
        const s1t = bestPerm[1]!
        const s2t = bestPerm[2]!
        for (const r of blockRanksTake) {
          const m = take((d) => d.cat === 'suit' && d.suit === s0t && d.rank === r, 1)
          total += m
          noteJokerSlots(1, m)
        }
        const m1 = take((d) => d.cat === 'suit' && d.suit === s1t && d.rank === bestPairRank, 4)
        total += m1
        noteJokerSlots(4, m1)
        const m2 = take((d) => d.cat === 'suit' && d.suit === s2t && d.rank === bestPairRank, 4)
        total += m2
        noteJokerSlots(4, m2)
        break
      }

      case 'dragon-meld-permute': {
        if (g.needs.length !== 3 || g.cardDragons.length !== 3) {
          for (const n of g.needs) noteJokerSlots(n, 0)
          break
        }
        const bestTypes = pickBestDragonMeldPermuteTypes(remaining, g.needs)
        if (bestTypes) {
          for (let i = 0; i < 3; i++) {
            const dr = bestTypes[i]!
            const m = take((d) => d.cat === 'dragon' && d.dragon === dr, g.needs[i]!)
            total += m
            noteJokerSlots(g.needs[i]!, m)
          }
        } else {
          for (const n of g.needs) noteJokerSlots(n, 0)
        }
        break
      }

      case 'suit-permute': {
        // Card ink “colors” = distinct suit slots A/B/C — assign real suits via every permutation.
        // Same outer-array index = same slot (same chosen suit); different index = different suit.
        // When consecRanks is true, rank values are 1-indexed offsets and we also search over
        // every valid base rank so the hand can match any consecutive rank pair (not just rank 1+2).
        const n = g.colorGroups.length
        const drgForSuitPerm = { bam: 'green' as const, dot: 'soap' as const, crak: 'red' as const }
        const tdcPerm = g.trailingDragonCount ?? 0
        const maxRankOff = g.consecRanks
          ? Math.max(...g.colorGroups.flatMap((cg) => cg.map((sg) => sg.rank))) - 1
          : 0
        const searchBases = g.consecRanks
          ? Array.from({ length: 9 - maxRankOff }, (_, i) => i + 1)
          : [1]

        let bestScore = { fill: -1, exposureFill: -1, maxSlotFill: -1, slotSquareFill: -1 }
        let bestPerm: Suit[] = []
        let bestBase = 1

        for (const base of searchBases) {
          for (const perm of suitPermutations(n)) {
            const score = scoreSuitPermuteCombo(remaining, g, perm, base, opts?.exposureTileIds)
            if (suitPermuteComboScoreBetter(score, bestScore, !!opts?.exposureTileIds)) {
              bestScore = score
              bestPerm = [...perm]
              bestBase = base
            }
          }
        }

        // Remove matched tiles for the best (permutation, base) and track unfilled joker slots.
        for (let ci = 0; ci < n; ci++) {
          const s = bestPerm[ci] as Suit
          const slots = g.colorGroups[ci]!
          if (
            opts?.requireCompleteRunSingles &&
            isRunSinglesColorGroup(slots) &&
            !runSinglesColorGroupFullyAvailable(remaining, s, slots, bestBase)
          ) {
            continue
          }
          for (const sg of slots) {
            const rank = sg.rank - 1 + bestBase
            const matched = take(
              d => d.cat === 'suit' && d.suit === s && d.rank === rank,
              sg.need
            )
            total += matched
            if (sg.canUseJoker && sg.need >= 3) {
              const u = sg.need - matched
              jokerEligibleUnfilled += u
              jokerSlotsByGroup[gi] += u
            }
          }
          // Take dragons of this slot's assigned suit.
          const dc = g.colorGroupDragonCounts?.[ci] ?? 0
          if (dc > 0) {
            const drg = drgForSuitPerm[bestPerm[ci]!]
            const md = take(d => d.cat === 'dragon' && d.dragon === drg, dc)
            total += md
            noteJokerSlots(dc, md)
          }
        }
        // Take trailing dragons (suit not used in any slot).
        if (tdcPerm > 0) {
          const trailSuit = SUITS.find(s => !bestPerm.includes(s))
          if (trailSuit) {
            const drg = drgForSuitPerm[trailSuit]
            const md = take(d => d.cat === 'dragon' && d.dragon === drg, tdcPerm)
            total += md
            noteJokerSlots(tdcPerm, md)
          }
        }
        break
      }
    }
  }

  // Apply jokers: each joker fills one unfilled slot in a 3+ identical-tile group (exposure).
  if (!noJokers) {
    const jokers = remaining.filter(t => t.def.cat === 'joker').length
    const jFill = Math.min(jokers, jokerEligibleUnfilled)
    total += jFill
    if (jFill > 0 && usedOut) {
      let need = jFill
      for (const t of remaining) {
        if (need <= 0) break
        if (t.def.cat !== 'joker') continue
        let placed = false
        for (let gj = 0; gj < groups.length; gj++) {
          if (jokerSlotsByGroup[gj]! <= 0) continue
          usedOut.push(t.id)
          usedMeta?.push({ id: t.id, groupIdx: gj, isJoker: true })
          jokerSlotsByGroup[gj]!--
          need--
          placed = true
          break
        }
        if (!placed) break
      }
    }
  }

  return total
}

/**
 * Rack tiles whose removal does **not** lower the greedy `computeGroupMatch` score for `p`
 * (or the simple `matches` count when the pattern has no explicit groups).
 * Used only for coaching UI — not authoritative NMJL tile assignment.
 */
export function getRackTilesNotHelpingPattern(
  rack: TileInstance[],
  p: PracticePattern,
): TileInstance[] {
  const noJokers = p.section === 'SINGLES AND PAIRS'
  const full =
    p.groups?.length
      ? computeGroupMatch([...rack], p.groups, { noJokers })
      : rack.filter((t) => p.matches(t.def)).length
  return rack.filter((t) => {
    const rest = rack.filter((x) => x.id !== t.id)
    const partial =
      p.groups?.length
        ? computeGroupMatch([...rest], p.groups, { noJokers })
        : rest.filter((x) => p.matches(x.def)).length
    return partial >= full
  })
}

export type GreedyPatternMatchOpts = {
  exposureTileIds?: ReadonlySet<string>
}

/** Greedy match with ids + per-group metadata (for suggested-hand strip vs rack alignment). */
export function greedyPatternMatchDetail(
  rack: TileInstance[],
  p: PracticePattern,
  opts?: GreedyPatternMatchOpts,
): { usedOrder: string[]; usedMeta: GroupUsedMeta[] } {
  if (!p.groups?.length) {
    return {
      usedOrder: rack.filter((t) => p.matches(t.def)).map((t) => t.id),
      usedMeta: [],
    }
  }
  const usedOut: string[] = []
  const usedMeta: GroupUsedMeta[] = []
  computeGroupMatch([...rack], p.groups, {
    noJokers: p.section === 'SINGLES AND PAIRS',
    leftToRight: true,
    usedOut,
    usedMeta,
    exposureTileIds: opts?.exposureTileIds,
  })
  return { usedOrder: usedOut, usedMeta }
}

/** One blank redeemed against a distinct discarded tile the focused pattern still needs. */
export type BlankExchangeFill = { blankTileId: string; targetDef: TileDef }

/**
 * Greedily redeem each blank in `rack` against a distinct discarded tile the pattern is still short.
 * A blank counts only when swapping it for an available discard copy raises the `computeGroupMatch`
 * score (same basis as tiles-away). Each redemption consumes one discard copy, so N blanks require
 * N distinct discarded tiles. Returns one entry per blank that helps (rack order), capped so the
 * pattern is never credited past `roughTarget`. `eligibleDiscardDefs` carries multiplicity (one
 * entry per available discard copy — exclude jokers/blanks before passing).
 */
export function computeBlankExchangeFills(
  rack: TileInstance[],
  p: PracticePattern,
  eligibleDiscardDefs: readonly TileDef[],
  opts?: { exposureTileIds?: ReadonlySet<string> },
): BlankExchangeFill[] {
  const blanks = rack.filter((t) => t.def.cat === 'blank')
  if (blanks.length === 0 || eligibleDiscardDefs.length === 0) return []

  const availByKey = new Map<string, { def: TileDef; count: number }>()
  for (const d of eligibleDiscardDefs) {
    const k = fullDefKey(d)
    const cur = availByKey.get(k)
    if (cur) cur.count += 1
    else availByKey.set(k, { def: d, count: 1 })
  }

  const matchOpts: GroupMatchOpts = {
    noJokers: p.section === 'SINGLES AND PAIRS',
    leftToRight: true,
    exposureTileIds: opts?.exposureTileIds,
  }
  const score = (tiles: TileInstance[]): number =>
    p.groups?.length
      ? computeGroupMatch(tiles, p.groups, matchOpts)
      : tiles.filter((t) => p.matches(t.def)).length

  // Blanks never match a pattern slot on their own, so drop them from the working rack and
  // simulate each redemption as adding a real tile of the chosen discard def.
  const working = rack.filter((t) => t.def.cat !== 'blank')
  let current = score(working)
  const fills: BlankExchangeFill[] = []
  let probeSeq = 0

  for (const blank of blanks) {
    if (current >= p.roughTarget) break
    let picked: { key: string; def: TileDef; next: number } | null = null
    for (const [key, entry] of availByKey) {
      if (entry.count <= 0) continue
      const next = score([...working, { id: `__bx_probe_${probeSeq}`, def: entry.def }])
      probeSeq += 1
      if (next > current) {
        picked = { key, def: entry.def, next }
        break
      }
    }
    if (!picked) break
    working.push({ id: `__bx_${blank.id}`, def: picked.def })
    current = picked.next
    availByKey.get(picked.key)!.count -= 1
    fills.push({ blankTileId: blank.id, targetDef: picked.def })
  }
  return fills
}

/**
 * Tile ids to ring on the rack for the focused line. With explicit `p.groups`, starts from strip
 * placement (`computePreviewStripAssignment`) for joker/coach alignment, then **always** includes
 * every tile id the greedy matcher consumed toward this pattern (`usedOrder`) that is still on the
 * rack. That keeps claim-meld / exposure tiles (e.g. 7D, 9D in open pungs) lit even when preview
 * placement skips their ids. Tiles that match the pattern but were **not** consumed stay unlit.
 * Live discards not yet on the rack are handled separately in the app (`suggestedTileGuideForRack`).
 */
export function computeRackPatternHighlightIds(
  rack: TileInstance[],
  p: PracticePattern,
  detail: { usedOrder: string[]; usedMeta: GroupUsedMeta[] },
  exposureTileIds?: ReadonlySet<string>,
): Set<string> {
  const byId = new Map(rack.map((t) => [t.id, t] as const))
  const out = new Set<string>()
  if (detail.usedOrder.length > 0) {
    if (p.groups) {
      const rackIdSet = new Set(rack.map((t) => t.id))
      const bestIds = new Set(detail.usedOrder.filter((id) => rackIdSet.has(id)))
      if (bestIds.size === 0) {
        for (const t of rack) {
          if (p.matches(t.def)) bestIds.add(t.id)
        }
      }
      const stripDefs = resolveStripTargetDefsForGreedyMatch(p, rack, detail.usedMeta, exposureTileIds)
      const assign = computePreviewStripAssignment(
        p,
        rack,
        detail.usedOrder,
        bestIds,
        detail.usedMeta,
        stripDefs,
        exposureTileIds ? { exposureTileIds } : undefined,
      )
      for (const id of assign.slotTileIdByStripIndex) {
        if (id != null) out.add(id)
      }
      for (const id of detail.usedOrder) {
        if (rackIdSet.has(id)) out.add(id)
      }
      return out
    }
    for (const id of detail.usedOrder) {
      const t = byId.get(id)
      if (t) out.add(t.id)
    }
    return out
  }
  for (const t of rack) {
    if (p.matches(t.def)) out.add(t.id)
  }
  return out
}

function fullDefKey(def: TileDef): string {
  switch (def.cat) {
    case 'suit':   return `s:${def.suit}:${def.rank}`
    case 'wind':   return `w:${def.wind}`
    case 'dragon': return `d:${def.dragon}`
    case 'flower': return 'f'
    case 'joker':  return 'j'
    case 'blank':  return 'b'
  }
}

/**
 * Order-independent signature of a tile collection keyed by tile identity that matters to ranking
 * and strip layout (suit+rank, wind, dragon, flower/joker/blank category). Two racks holding the
 * same tiles in a different order produce the same string. A pure rack reorder never changes
 * tiles-away or the strip contents, so callers can use this to skip the (expensive) re-rank /
 * strip rebuild + full list re-render that an array-identity change would otherwise trigger.
 */
export function tileMultisetSignature(tiles: readonly TileInstance[]): string {
  if (tiles.length === 0) return ''
  const keys = new Array<string>(tiles.length)
  for (let i = 0; i < tiles.length; i++) keys[i] = fullDefKey(tiles[i]!.def)
  keys.sort()
  return keys.join(',')
}

function totalCopiesForDef(def: TileDef): number {
  if (def.cat === 'flower') return 8
  if (def.cat === 'joker') return 8
  if (def.cat === 'blank') return 6
  return 4
}

export function buildUnavailableTileDefCounts(tiles: TileInstance[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const t of tiles) {
    const k = fullDefKey(t.def)
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

/**
 * Find tiles in `bestIds` whose natural tile is publicly exhausted (discarded or
 * exposed by bots). Dead-tile hints should not assume an unseen copy is gone just
 * because it might be in the wall or an opponent rack.
 */
export function findInfeasibleBestIds(
  rackTiles: TileInstance[],
  groups: PatternGroup[],
  usedMeta: GroupUsedMeta[],
  bestIds: ReadonlySet<string>,
  unavailableCounts: ReadonlyMap<string, number>,
): Set<string> {
  const infeasible = new Set<string>()
  const rackById = new Map(rackTiles.map((t) => [t.id, t] as const))

  for (const meta of usedMeta) {
    if (meta.isJoker) continue
    if (!bestIds.has(meta.id)) continue
    const tile = rackById.get(meta.id)
    if (!tile) continue

    const group = groups[meta.groupIdx]
    if (!group) continue
    const defKey = fullDefKey(tile.def)
    const total = totalCopiesForDef(tile.def)
    const unavail = unavailableCounts.get(defKey) ?? 0

    const need = groupNeedForDef(group, tile.def, meta)
    if (need == null || need > 2) continue
    if (total - unavail < need) {
      infeasible.add(meta.id)
    }
  }

  return infeasible
}

function groupNeedForDef(
  group: PatternGroup,
  _def: TileDef,
  meta: GroupUsedMeta,
): number | null {
  switch (group.kind) {
    case 'fixed':
    case 'rank':
    case 'suit-locked-rank':
      return group.need

    case 'consec':
      return meta.consecPart === 0 ? group.need1 : group.need2

    case 'consec-multi':
    case 'suit-locked-consec-multi':
      return Math.min(...group.needs)

    case 'shared-rank':
    case 'shared-rank-suits':
      return Math.max(...group.needs)

    case 'suit-locked':
      if (_def.cat === 'dragon') return group.dragonCount
      if (_def.cat === 'suit') {
        const entry = group.rankNeeds.find((rn) => rn.rank === _def.rank)
        return entry?.need ?? null
      }
      return null

    case 'suit-locked-consec':
      return group.rankCount

    case 'suit-permute': {
      if (_def.cat !== 'suit') {
        const dragonCounts = group.colorGroupDragonCounts
        if (dragonCounts) return Math.max(...dragonCounts)
        return group.trailingDragonCount ?? null
      }
      let need: number | null = null
      for (const cg of group.colorGroups) {
        for (const slot of cg) {
          if (slot.rank !== _def.rank || slot.need <= 0) continue
          need = need == null ? slot.need : Math.min(need, slot.need)
        }
      }
      return need
    }

    case 'odd-pair-kongs-triple':
      if (_def.cat !== 'suit' || !group.odds.includes(_def.rank)) return null
      return 4

    case 'dragon-meld-permute':
      if (_def.cat !== 'dragon') return null
      for (let i = 0; i < group.needs.length; i++) {
        if (group.cardDragons[i] === _def.dragon && group.needs[i]! >= 3) {
          return group.needs[i]
        }
      }
      return null

    default:
      return null
  }
}

/** Greedy assignment order of tile ids toward `p` (same logic as `computeGroupMatch`). */
export function greedyUsedTileOrderForPattern(
  rack: TileInstance[],
  p: PracticePattern,
  opts?: GreedyPatternMatchOpts,
): string[] {
  return greedyPatternMatchDetail(rack, p, opts).usedOrder
}

export type PreviewSlotSuggestKind = 'best' | 'joker' | null

/** One entry per strip cell (card display order): rack tile id (natural or joker) filling that slot. */
export type PreviewStripAssignment = {
  kinds: PreviewSlotSuggestKind[]
  /** Physical tile ids in card strip order (before circled-J badge redistribution). */
  slotTileIdByStripIndex: (string | null)[]
}

function jokerMeldKey(defs: TileDef[], i: number): string | null {
  const d = defs[i]
  if (!d) return null
  if (d.cat === 'suit') return `s:${d.suit}:${d.rank}`
  if (d.cat === 'dragon') return `d:${d.dragon}`
  if (d.cat === 'flower') return 'flower'
  if (d.cat === 'wind') return `w:${d.wind}`
  return null
}

/**
 * Contiguous strip ranges of one identical-tile meld (same suit+rank etc.) where jokers are allowed.
 */
function jokerMeldPreviewIndexRanges(defs: TileDef[], jokerEligible: boolean[]): [number, number][] {
  const out: [number, number][] = []
  let i = 0
  while (i < defs.length) {
    if (!jokerEligible[i]) {
      i++
      continue
    }
    const a = i
    const key0 = jokerMeldKey(defs, i)
    i++
    while (i < defs.length && jokerEligible[i] && jokerMeldKey(defs, i) === key0) {
      i++
    }
    if (i - a >= 3) out.push([a, i])
  }
  return out
}

/**
 * Move all joker marks (real rack jokers with tile IDs + suggestion markers) to the leftmost
 * joker-eligible meld slots in card order, regardless of where pattern-matching initially placed them.
 *
 * `nMarks` = total joker badges to place (usually rackJokerCount, or +1 for an unplaced suggestion).
 * `jokerTileIds` = real rack-joker tile IDs to assign in order (remaining badges are null markers).
 */
function redistributeJokerPreviewMarksToFirstMeld(
  kinds: PreviewSlotSuggestKind[],
  defs: TileDef[],
  jokerEligible: boolean[],
  nMarks: number,
  slotTileIdByStripIndex?: (string | null)[],
  jokerTileIds?: readonly string[],
  exposureTileIds?: ReadonlySet<string>,
): void {
  if (nMarks <= 0) return
  const preservedIndices = new Set<number>()
  if (exposureTileIds && slotTileIdByStripIndex) {
    for (let i = 0; i < kinds.length; i++) {
      const id = slotTileIdByStripIndex[i]
      if (kinds[i] === 'joker' && id && exposureTileIds.has(id)) {
        preservedIndices.add(i)
      }
    }
  }
  // Clear concealed joker marks only — exposure jokers stay on their committed meld.
  for (let i = 0; i < kinds.length; i++) {
    if (kinds[i] === 'joker' && !preservedIndices.has(i)) {
      kinds[i] = null
      if (slotTileIdByStripIndex) slotTileIdByStripIndex[i] = null
    }
  }
  let left = nMarks
  let idIdx = 0
  const concealedJokerIds =
    jokerTileIds?.filter((id) => !exposureTileIds?.has(id)) ?? jokerTileIds
  const placeJoker = (i: number) => {
    kinds[i] = 'joker'
    if (slotTileIdByStripIndex && concealedJokerIds && idIdx < concealedJokerIds.length) {
      slotTileIdByStripIndex[i] = concealedJokerIds[idIdx++]
    }
    left--
  }
  for (const [a, b] of jokerMeldPreviewIndexRanges(defs, jokerEligible)) {
    for (let i = a; i < b && left > 0; i++) {
      if (preservedIndices.has(i)) continue
      if (!jokerEligible[i]) continue
      if (kinds[i] !== null) continue
      placeJoker(i)
    }
    if (left === 0) return
  }
  for (let i = 0; i < kinds.length && left > 0; i++) {
    if (preservedIndices.has(i)) continue
    if (!jokerEligible[i] || kinds[i] !== null) continue
    placeJoker(i)
  }
}

function concealedRackJokers(
  rack: TileInstance[],
  bestIds: ReadonlySet<string>,
  exposureTileIds?: ReadonlySet<string>,
): { usedIds: string[]; suggestionMarks: number } {
  const concealed = rack.filter(
    (t) => t.def.cat === 'joker' && (!exposureTileIds || !exposureTileIds.has(t.id)),
  )
  const usedIds = concealed.filter((t) => bestIds.has(t.id)).map((t) => t.id)
  const unplacedCount = concealed.length - usedIds.length
  return {
    usedIds,
    suggestionMarks: usedIds.length + (unplacedCount > 0 ? 1 : 0),
  }
}

/** NMJL: jokers only in 3+ identical melds — slot list from `patternPreviewJokerEligibleBySlot`. */
function previewSlotAllowsJoker(
  d: TileDef,
  p: PracticePattern,
  slotIndex: number,
  jokerEligible: boolean[],
): boolean {
  if (p.section === 'SINGLES AND PAIRS') return false
  if (d.cat === 'joker') return false
  return jokerEligible[slotIndex] === true
}

function rackOrderIndex(rack: TileInstance[], id: string): number {
  const i = rack.findIndex((t) => t.id === id)
  return i < 0 ? 9999 : i
}

/**
 * Map `usedMeta` onto the pattern strip when preview tile counts match `p.groups` (title strip).
 * Consecutive kongs: naturals in main-rack order first in each rank arm, then jokers in remaining cells.
 */
function buildPreviewSlotKindsFromGroups(
  p: PracticePattern,
  rack: TileInstance[],
  defs: TileDef[],
  spans: [number, number][],
  usedMeta: readonly GroupUsedMeta[],
  bestIds: ReadonlySet<string>,
  jokerEligible: readonly boolean[],
): PreviewStripAssignment {
  const kinds: PreviewSlotSuggestKind[] = defs.map(() => null)
  const slotTileIdByStripIndex = defs.map<string | null>(() => null)
  const byId = new Map(rack.map((t) => [t.id, t] as const))
  const groups = p.groups!

  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi]!
    const span = spans[gi]
    if (!span) continue
    const [a, b] = span
    const nat = usedMeta
      .filter((m) => m.groupIdx === gi && !m.isJoker)
      .sort((x, y) => rackOrderIndex(rack, x.id) - rackOrderIndex(rack, y.id))
    const joks = usedMeta.filter((m) => m.groupIdx === gi && m.isJoker).map((m) => m.id)

    if (g.kind === 'consec') {
      const n1 = g.need1
      const n2 = g.need2
      const nat0 = nat.filter((m) => m.consecPart === 0)
      const nat1 = nat.filter((m) => m.consecPart === 1)
      let jj = 0
      const placeArm = (start: number, len: number, arm: readonly GroupUsedMeta[]) => {
        let ni = 0
        for (let k = 0; k < len; k++) {
          const idx = start + k
          if (ni < arm.length) {
            const id = arm[ni++]!.id
            // Only anchor the natural when it exactly matches the slot's target def.
            // In variant rows (e.g. consec arm1=7C but greedy chose 7D), a mismatched
            // tile must NOT claim the slot — redistribution will place a joker there instead.
            const t = byId.get(id)
            if (t && defs[idx] && tileDefsEqual(t.def, defs[idx]!)) {
              kinds[idx] = bestIds.has(id) ? 'best' : null
              slotTileIdByStripIndex[idx] = id
            }
            continue
          }
          if (!jokerEligible[idx]) continue
          const jid = joks[jj++]
          if (jid && bestIds.has(jid)) {
            kinds[idx] = 'joker'
            slotTileIdByStripIndex[idx] = jid
          }
        }
      }
      placeArm(a, n1, nat0)
      placeArm(a + n1, n2, nat1)
      continue
    }

    const usedNatIds = new Set<string>()
    const placeNaturalAt = (si: number, m: GroupUsedMeta, t: TileInstance) => {
      if (t.def.cat === 'joker' && bestIds.has(m.id)) {
        kinds[si] = 'joker'
      } else {
        kinds[si] = bestIds.has(m.id) ? 'best' : null
      }
      slotTileIdByStripIndex[si] = m.id
      usedNatIds.add(m.id)
    }
    const slotAccepts = (si: number, t: TileInstance): boolean => {
      const target = defs[si]
      if (!target) return false
      return tileDefsEqual(t.def, target) || stripSlotAcceptsNatural(p, target, t.def)
    }
    const naturalKey = (def: TileDef): string => {
      if (def.cat === 'suit') return `s:${def.suit}:${def.rank}`
      if (def.cat === 'dragon') return `d:${def.dragon}`
      if (def.cat === 'wind') return `w:${def.wind}`
      if (def.cat === 'flower') return 'flower'
      return def.cat
    }

    /*
     * Pass 1 — complete-run placement: if we hold exactly N matching naturals and the strip has a
     * contiguous N-slot run that accepts them (e.g. soap pung vs year “0” + soap DDD), fill that
     * run first so a claimed pung doesn’t get split onto a single and a short pung.
     */
    const pendingByKey = new Map<string, GroupUsedMeta[]>()
    for (const m of nat) {
      const t = byId.get(m.id)
      if (!t || t.def.cat === 'joker') continue
      const key = naturalKey(t.def)
      const arr = pendingByKey.get(key) ?? []
      arr.push(m)
      pendingByKey.set(key, arr)
    }
    for (const [, metas] of pendingByKey) {
      const n = metas.length
      if (n < 2) continue
      const sample = byId.get(metas[0]!.id)
      if (!sample) continue
      let runStart = -1
      let runExact = -1
      for (let si = a; si <= b - n; si++) {
        let ok = true
        for (let k = 0; k < n; k++) {
          if (kinds[si + k] != null || !slotAccepts(si + k, sample)) {
            ok = false
            break
          }
        }
        if (!ok) continue
        let exact = true
        for (let k = 0; k < n; k++) {
          if (!tileDefsEqual(defs[si + k]!, sample.def)) {
            exact = false
            break
          }
        }
        if (exact) {
          runExact = si
          break
        }
        if (runStart < 0) runStart = si
      }
      const placeAt = runExact >= 0 ? runExact : runStart
      if (placeAt < 0) continue
      for (let k = 0; k < n; k++) {
        const m = metas[k]!
        const t = byId.get(m.id)
        if (!t) continue
        placeNaturalAt(placeAt + k, m, t)
      }
    }

    // Pass 2 — left-to-right for leftovers (and jokers).
    for (let si = a; si < b; si++) {
      if (kinds[si] != null) continue
      const target = defs[si]!
      for (const m of nat) {
        if (usedNatIds.has(m.id)) continue
        const t = byId.get(m.id)
        if (!t) continue
        if (tileDefsEqual(t.def, target) || stripSlotAcceptsNatural(p, target, t.def)) {
          placeNaturalAt(si, m, t)
          break
        }
        // Exposure jokers are resolved to naturals for greedy match but stay jokers on the display rack.
        if (t.def.cat === 'joker' && bestIds.has(m.id)) {
          placeNaturalAt(si, m, t)
          break
        }
      }
    }
    let jr = 0
    for (let si = a; si < b; si++) {
      if (kinds[si] != null) continue
      if (!jokerEligible[si]) continue
      const jid = joks[jr++]
      if (jid && bestIds.has(jid)) {
        kinds[si] = 'joker'
        slotTileIdByStripIndex[si] = jid
      }
    }
  }

  return { kinds, slotTileIdByStripIndex }
}

/** Card-order joker flags → indices aligned with group-append `defs` for greedy placement. */
function jokerEligibleForGroupOrderStrip(cardOrderElig: readonly boolean[], p: PracticePattern): boolean[] {
  const gToD = jokerEligibleGroupToDisplayFromPattern(p, cardOrderElig.length)
  if (!gToD) return [...cardOrderElig]
  return gToD.map((d) => cardOrderElig[d]!)
}

/** Group-order strip assignment → card line order using `PracticePattern.cardLineFromGroupSlotMap`. */
function permutePreviewStripAssignmentByCardLine(
  a: PreviewStripAssignment,
  map: readonly number[] | undefined,
): PreviewStripAssignment {
  if (!map || a.kinds.length !== map.length) return a
  const n = a.kinds.length
  const kinds: PreviewSlotSuggestKind[] = new Array(n).fill(null)
  const slotTileIdByStripIndex: (string | null)[] = new Array(n).fill(null)
  for (let d = 0; d < n; d++) {
    const g = map[d]!
    kinds[d] = a.kinds[g]!
    slotTileIdByStripIndex[d] = a.slotTileIdByStripIndex[g]!
  }
  return { kinds, slotTileIdByStripIndex }
}

function maybePermuteAssignmentToCardLine(p: PracticePattern, r: PreviewStripAssignment): PreviewStripAssignment {
  return permutePreviewStripAssignmentByCardLine(r, p.cardLineFromGroupSlotMap)
}

/**
 * When title strip order interleaves groups (e.g. `1111 DD 1111 DD`), contiguous group spans are
 * invalid — map rack naturals onto strip cells by category + suit column / dragon color so
 * highlights match `bestIds` like the main rack.
 */
function buildPreviewKindsByCategoryPartition(
  p: PracticePattern,
  rack: TileInstance[],
  defs: TileDef[],
  usedMeta: readonly GroupUsedMeta[],
  bestIds: ReadonlySet<string>,
  jokerEligible: boolean[],
  exposureTileIds?: ReadonlySet<string>,
): PreviewStripAssignment {
  const kinds: PreviewSlotSuggestKind[] = defs.map(() => null)
  const slotTileIdByStripIndex = defs.map<string | null>(() => null)
  const usedSlot = new Set<number>()
  const assignedId = new Set<string>()
  const byId = new Map(rack.map((t) => [t.id, t] as const))
  const likeLikeNumbers =
    p.groups?.some((g) => g.kind === 'shared-rank-suits' || g.kind === 'shared-rank') ?? false

  const naturals = usedMeta
    .filter((m) => !m.isJoker)
    .sort((a, b) => rackOrderIndex(rack, a.id) - rackOrderIndex(rack, b.id))
  const jokerIds = usedMeta.filter((m) => m.isJoker).map((m) => m.id)

  function occupy(si: number, id: string, jok: boolean) {
    if (jok) kinds[si] = bestIds.has(id) ? 'joker' : null
    else kinds[si] = bestIds.has(id) ? 'best' : null
    slotTileIdByStripIndex[si] = id
    usedSlot.add(si)
    assignedId.add(id)
  }

  function placePass(match: (si: number, def: TileDef, t: TileInstance) => boolean) {
    for (const m of naturals) {
      if (assignedId.has(m.id)) continue
      const t = byId.get(m.id)
      if (!t) continue
      for (let si = 0; si < defs.length; si++) {
        if (usedSlot.has(si)) continue
        if (match(si, defs[si]!, t)) occupy(si, m.id, false)
        if (assignedId.has(m.id)) break
      }
    }
  }

  placePass((_si, d, t) => tileDefsEqual(d, t.def))
  placePass((_si, d, t) => d.cat === 'flower' && t.def.cat === 'flower')

  for (const m of naturals) {
    if (assignedId.has(m.id)) continue
    const t = byId.get(m.id)
    if (!t || t.def.cat !== 'wind') continue
    for (let si = 0; si < defs.length; si++) {
      if (usedSlot.has(si)) continue
      const d = defs[si]!
      if (d.cat === 'wind' && d.wind === t.def.wind) {
        occupy(si, m.id, false)
        break
      }
    }
  }

  placePass((_, d, t) => d.cat === 'dragon' && t.def.cat === 'dragon' && d.dragon === t.def.dragon)
  placePass((_, d, t) => d.cat === 'dragon' && t.def.cat === 'dragon')

  for (const m of naturals) {
    if (assignedId.has(m.id)) continue
    const t = byId.get(m.id)
    if (!t || t.def.cat !== 'suit') continue
    for (let si = 0; si < defs.length; si++) {
      if (usedSlot.has(si)) continue
      const d = defs[si]!
      if (d.cat !== 'suit') continue
      if (d.suit !== t.def.suit) continue
      if (!likeLikeNumbers && d.rank !== t.def.rank) continue
      occupy(si, m.id, false)
      break
    }
  }

  placePass((_, d, t) => {
    if (d.cat !== 'suit' || t.def.cat !== 'suit') return false
    return d.rank === t.def.rank
  })

  placePass((_, d, t) => d.cat === 'suit' && t.def.cat === 'suit')

  let jx = 0
  for (let si = 0; si < defs.length; si++) {
    if (kinds[si] != null) continue
    if (!jokerEligible[si]) continue
    const jid = jokerIds[jx++]
    if (jid && bestIds.has(jid)) {
      kinds[si] = 'joker'
      slotTileIdByStripIndex[si] = jid
    }
  }

  const jokerMarksBcp = concealedRackJokers(rack, bestIds, exposureTileIds)
  if (jokerMarksBcp.suggestionMarks > 0) {
    redistributeJokerPreviewMarksToFirstMeld(
      kinds,
      defs,
      jokerEligible,
      jokerMarksBcp.suggestionMarks,
      slotTileIdByStripIndex,
      jokerMarksBcp.usedIds,
      exposureTileIds,
    )
  }

  return { kinds, slotTileIdByStripIndex }
}

/**
 * Strip kinds plus which rack tile id sits in each card cell (for matching rack sort order to the line).
 */
export function computePreviewStripAssignment(
  p: PracticePattern,
  rackForPattern: TileInstance[],
  usedOrder: readonly string[],
  bestIds: ReadonlySet<string>,
  usedMetaArg?: readonly GroupUsedMeta[] | null,
  stripTargetDefs?: readonly TileDef[] | null,
  greedyOpts?: GreedyPatternMatchOpts,
): PreviewStripAssignment {
  const defs =
    stripTargetDefs && stripTargetDefs.length > 0
      ? [...stripTargetDefs]
      : patternLinePreviewGroupOrderDefs(p)
  if (defs.length === 0) return { kinds: [], slotTileIdByStripIndex: [] }

  const usedMeta = usedMetaArg ?? greedyPatternMatchDetail(rackForPattern, p, greedyOpts).usedMeta
  const jokerEligible = jokerEligibleForGroupOrderStrip(patternPreviewJokerEligibleBySlot(p), p)
  const spans = groupPreviewIndexSpans(p)

  if (p.groups && spans && usedMeta.length > 0) {
    const r = buildPreviewSlotKindsFromGroups(p, rackForPattern, defs, spans, usedMeta, bestIds, jokerEligible)
    const jokerMarks = concealedRackJokers(rackForPattern, bestIds, greedyOpts?.exposureTileIds)
    if (jokerMarks.suggestionMarks > 0) {
      redistributeJokerPreviewMarksToFirstMeld(
        r.kinds,
        defs,
        jokerEligible,
        jokerMarks.suggestionMarks,
        r.slotTileIdByStripIndex,
        jokerMarks.usedIds,
        greedyOpts?.exposureTileIds,
      )
    }
    return maybePermuteAssignmentToCardLine(p, r)
  }
  if (usedMeta.length > 0) {
    const r = buildPreviewKindsByCategoryPartition(
      p,
      rackForPattern,
      defs,
      usedMeta,
      bestIds,
      jokerEligible,
      greedyOpts?.exposureTileIds,
    )
    return maybePermuteAssignmentToCardLine(p, r)
  }

  const byId = new Map(rackForPattern.map((t) => [t.id, t] as const))

  const kindForId = (id: string): PreviewSlotSuggestKind => {
    if (bestIds.has(id)) return 'best'
    return null
  }

  const queue: TileInstance[] = []
  for (const id of usedOrder) {
    const t = byId.get(id)
    if (t) queue.push(t)
  }

  const kinds: PreviewSlotSuggestKind[] = defs.map(() => null)
  const slotTileIdByStripIndex = defs.map<string | null>(() => null)
  const working = [...queue]

  for (let i = 0; i < defs.length; i++) {
    const d = defs[i]!
    const qi = working.findIndex((t) => tileDefsEqual(t.def, d))
    if (qi < 0) continue
    const t = working.splice(qi, 1)[0]!
    kinds[i] = kindForId(t.id)
    slotTileIdByStripIndex[i] = t.id
  }

  for (let i = 0; i < defs.length; i++) {
    if (kinds[i] != null) continue
    const d = defs[i]!
    if (!previewSlotAllowsJoker(d, p, i, jokerEligible)) continue
    const qi = working.findIndex((t) => t.def.cat === 'joker' && bestIds.has(t.id))
    if (qi < 0) continue
    const t = working.splice(qi, 1)[0]!
    kinds[i] = 'joker'
    slotTileIdByStripIndex[i] = t.id
  }

  const jokerMarksFb = concealedRackJokers(rackForPattern, bestIds, greedyOpts?.exposureTileIds)
  redistributeJokerPreviewMarksToFirstMeld(
    kinds,
    defs,
    jokerEligible,
    jokerMarksFb.suggestionMarks,
    slotTileIdByStripIndex,
    jokerMarksFb.usedIds,
    greedyOpts?.exposureTileIds,
  )

  const r = { kinds, slotTileIdByStripIndex }
  return maybePermuteAssignmentToCardLine(p, r)
}

function rackAfterPriorGroups(
  rack: TileInstance[],
  usedMeta: readonly GroupUsedMeta[],
  stopGi: number,
): TileInstance[] {
  const drop = new Set(usedMeta.filter((m) => m.groupIdx < stopGi).map((m) => m.id))
  return rack.filter((t) => !drop.has(t.id))
}

function metaNatTilesForGroup(
  rack: TileInstance[],
  usedMeta: readonly GroupUsedMeta[],
  gi: number,
): TileInstance[] {
  const byId = new Map(rack.map((t) => [t.id, t] as const))
  const out: TileInstance[] = []
  for (const m of usedMeta) {
    if (m.groupIdx !== gi || m.isJoker) continue
    const t = byId.get(m.id)
    if (t) out.push(t)
  }
  return out
}

function peekSharedRankSuitsPlan(
  remaining: TileInstance[],
  g: Extract<PatternGroup, { kind: 'shared-rank-suits' }>,
  forcedRank: number | null = null,
): { rank: number; perm: Suit[] } | null {
  const n = g.needs.length
  if (n < 2 || n > 3) return null
  const ranksToTry =
    forcedRank != null && forcedRank >= 1 && forcedRank <= 9
      ? [forcedRank]
      : ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const)
  let bestFill = 0
  let bestRank = -1
  let bestPerm: Suit[] = []
  for (const rank of ranksToTry) {
    const counts: Record<Suit, number> = { bam: 0, dot: 0, crak: 0 }
    for (const t of remaining) {
      if (t.def.cat === 'suit' && g.test(t.def) && t.def.rank === rank) {
        counts[t.def.suit]++
      }
    }
    for (const perm of suitPermutations(n)) {
      let fill = 0
      for (let i = 0; i < n; i++) {
        fill += Math.min(counts[perm[i]!], g.needs[i]!)
      }
      if (fill > bestFill) {
        bestFill = fill
        bestRank = rank
        bestPerm = [...perm]
      }
    }
  }
  if (bestRank < 0 || bestPerm.length !== n) return null
  return { rank: bestRank, perm: bestPerm }
}

function inferSharedRankSuitsFromMeta(
  rack: TileInstance[],
  usedMeta: readonly GroupUsedMeta[],
  gi: number,
  g: Extract<PatternGroup, { kind: 'shared-rank-suits' }>,
): { rank: number; perm: Suit[] } | null {
  const ordered = metaNatTilesForGroup(rack, usedMeta, gi)
  const suitTiles = ordered.filter((t) => t.def.cat === 'suit')
  if (suitTiles.length === 0) return null
  const ranks = new Set<number>()
  for (const t of suitTiles) {
    if (t.def.cat === 'suit') ranks.add(t.def.rank)
  }
  if (ranks.size !== 1) return null
  const head = suitTiles[0]!.def
  if (head.cat !== 'suit') return null
  const rank = head.rank
  let off = 0
  const perm: Suit[] = []
  for (let col = 0; col < g.needs.length; col++) {
    const need = g.needs[col]!
    const chunk = ordered.slice(off, off + need)
    off += need
    const st = chunk.find((t) => t.def.cat === 'suit')
    if (!st || st.def.cat !== 'suit') return null
    perm.push(st.def.suit)
  }
  if (perm.length !== g.needs.length) return null
  // If tiles didn't land cleanly into each column (e.g. fewer naturals than needs[i]),
  // the slice-by-size approach produces duplicate suits. Fall back to the full search.
  if (new Set(perm).size !== perm.length) return null
  return { rank, perm }
}

function majoritySuitAmongSuitTiles(tiles: TileInstance[]): Suit | null {
  const counts: Record<Suit, number> = { bam: 0, dot: 0, crak: 0 }
  for (const t of tiles) {
    if (t.def.cat === 'suit') counts[t.def.suit]++
  }
  let best: Suit | null = null
  let bestC = -1
  for (const s of SUITS) {
    if (counts[s] > bestC) {
      bestC = counts[s]
      best = s
    }
  }
  return best
}

function fillSpan(out: TileDef[], a: number, b: number, def: TileDef) {
  for (let i = a; i < b; i++) out[i] = def
}

function fillSpanTileDefs(out: TileDef[], a: number, tiles: TileInstance[]) {
  let idx = a
  for (const t of tiles) {
    if (idx >= out.length) break
    out[idx++] = t.def
  }
}

const DRAGON_PAIR_ORDER: readonly Dragon[] = ['green', 'red', 'soap']

/** All 6 assignments of three distinct dragon types to three meld slots. */
function permuteThreeDragonTypes(): Array<['green' | 'red' | 'soap', 'green' | 'red' | 'soap', 'green' | 'red' | 'soap']> {
  const t: Array<'green' | 'red' | 'soap'> = ['green', 'red', 'soap']
  const out: Array<['green' | 'red' | 'soap', 'green' | 'red' | 'soap', 'green' | 'red' | 'soap']> = []
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (j === i) continue
      for (let k = 0; k < 3; k++) {
        if (k === i || k === j) continue
        out.push([t[i]!, t[j]!, t[k]!])
      }
    }
  }
  return out
}

/** Best fill when each meld slot may take any permutation of green / red / soap (W&D #2). */
function pickBestDragonMeldPermuteTypes(
  rem: readonly TileInstance[],
  needs: readonly number[],
): Array<'green' | 'red' | 'soap'> | null {
  if (needs.length !== 3) return null
  let bestFill = -1
  let bestComplete = -1
  let bestTypes: Array<'green' | 'red' | 'soap'> | null = null
  for (const typePerm of permuteThreeDragonTypes()) {
    let fill = 0
    let complete = 0
    for (let i = 0; i < 3; i++) {
      const dr = typePerm[i]!
      const have = rem.filter((t) => t.def.cat === 'dragon' && t.def.dragon === dr).length
      const take = Math.min(have, needs[i]!)
      fill += take
      // Prefer parking a pung on a pung slot (exact complete meld) over a short kong.
      if (have >= needs[i]!) complete++
    }
    if (fill > bestFill || (fill === bestFill && complete > bestComplete)) {
      bestFill = fill
      bestComplete = complete
      bestTypes = [...typePerm]
    }
  }
  return bestTypes
}

/** Fill a `dragon-meld-permute` span in card meld order (3+3+4), placing held tiles in their assigned melds. */
function fillDragonMeldPermuteSpan(
  out: TileDef[],
  a: number,
  b: number,
  g: Extract<PatternGroup, { kind: 'dragon-meld-permute' }>,
  rem: readonly TileInstance[],
  rack: TileInstance[],
  usedMeta: readonly GroupUsedMeta[],
  gi: number,
): void {
  if (g.needs.length !== 3 || g.cardDragons.length !== 3) return
  const bestTypes = pickBestDragonMeldPermuteTypes(rem, g.needs)
  if (!bestTypes) return

  const taken = metaNatTilesForGroup(rack, usedMeta, gi)
  const takenByAssignedType = new Map<Dragon, TileInstance[]>()
  for (const t of taken) {
    if (t.def.cat !== 'dragon') continue
    const dr = t.def.dragon
    const arr = takenByAssignedType.get(dr) ?? []
    arr.push(t)
    takenByAssignedType.set(dr, arr)
  }

  let idx = a
  for (let i = 0; i < g.needs.length; i++) {
    const assignedType = bestTypes[i]!
    const cardType = g.cardDragons[i] ?? assignedType
    const pool = [...(takenByAssignedType.get(assignedType) ?? [])]
    for (let k = 0; k < g.needs[i]! && idx < b; k++) {
      const held = pool.shift()
      out[idx++] = held?.def ?? { cat: 'dragon', dragon: cardType }
    }
  }
}

/** When the greedy matcher already assigned suit tiles, keep the same suit + consecutive base for the strip. */
function inferConsecSuitPermutePlanFromMeta(
  rack: TileInstance[],
  usedMeta: readonly GroupUsedMeta[],
  gi: number,
  g: Extract<PatternGroup, { kind: 'suit-permute' }>,
): { perm: Suit[]; base: number } | null {
  if (!g.consecRanks || g.colorGroups.length !== 1) return null
  const groupTiles = metaNatTilesForGroup(rack, usedMeta, gi)
  const suitTiles = groupTiles.filter((t) => t.def.cat === 'suit')
  if (suitTiles.length === 0) return null
  const suit = majoritySuitAmongSuitTiles(suitTiles)
  if (!suit) return null
  if (suitTiles.some((t) => t.def.cat === 'suit' && t.def.suit !== suit)) return null
  const heldRanks = suitTiles
    .filter((t): t is TileInstance & { def: { cat: 'suit'; suit: Suit; rank: number } } => t.def.cat === 'suit')
    .map((t) => t.def.rank)
  const maxRankOff = Math.max(...g.colorGroups[0]!.map((sg) => sg.rank)) - 1
  for (let base = 1; base <= 9 - maxRankOff; base++) {
    const runRanks = g.colorGroups[0]!.map((sg) => sg.rank - 1 + base)
    if (heldRanks.every((r) => runRanks.includes(r))) {
      return { perm: [suit], base }
    }
  }
  return null
}

/**
 * Reorder matched naturals so each **pair** of strip cells shows two identical dragons when the
 * multiset supports it (e.g. RR+GG, RRRR). Greedy `usedMeta` order can interleave types when a
 * single `fixed` dragon span still spans two pairs (legacy geometry) or when pairing is ambiguous.
 */
function orderDragonTilesForAdjacentPairs(tiles: TileInstance[]): TileInstance[] {
  if (tiles.length !== 2 && tiles.length !== 4) return tiles
  if (!tiles.every((t) => t.def.cat === 'dragon')) return tiles
  if (tiles.length === 2) {
    const [x, y] = tiles
    if (!x || !y) return tiles
    if (x.def.cat === 'dragon' && y.def.cat === 'dragon' && x.def.dragon === y.def.dragon) return tiles
    return tiles
  }
  const byType = new Map<Dragon, TileInstance[]>()
  for (const t of tiles) {
    if (t.def.cat !== 'dragon') return tiles
    const d = t.def.dragon
    const arr = byType.get(d) ?? []
    arr.push(t)
    byType.set(d, arr)
  }
  const ranked = [...byType.entries()].sort((a, b) => b[1].length - a[1].length)
  const top = ranked[0]
  if (!top) return tiles
  const arr0 = top[1]
  if (arr0.length >= 4) return arr0.slice(0, 4)
  if (arr0.length === 2 && ranked.length >= 2 && ranked[1]![1].length === 2) {
    const arr1 = ranked[1]![1]
    return [...arr0.slice(0, 2), ...arr1.slice(0, 2)]
  }
  // Kong / pung: one dragon type per meld — never mix G+RRR in one four-tile span.
  return arr0.slice(0, Math.min(4, arr0.length))
}

function isDragonKey(k: string): k is Dragon {
  return k === 'red' || k === 'green' || k === 'soap'
}

function stripSlotAcceptsNatural(p: PracticePattern, targetDef: TileDef, naturalDef: TileDef): boolean {
  if (tileDefsEqual(targetDef, naturalDef)) return true
  if (targetDef.cat === 'dragon' && targetDef.dragon === 'any' && naturalDef.cat === 'dragon') {
    return true
  }
  // W&D #2: meld sizes permute, but printed G/R/Soap cells stay typed — a soap natural must not
  // occupy a green cell (that stole joker slots and ordered the rack G, Soap, J, J).
  if (
    targetDef.cat === 'dragon' &&
    naturalDef.cat === 'dragon' &&
    p.groups?.some((g) => g.kind === 'dragon-meld-permute')
  ) {
    return (
      targetDef.dragon === naturalDef.dragon ||
      targetDef.dragon === 'any' ||
      naturalDef.dragon === 'any'
    )
  }
  if (firstOpposingConsecutiveStandInPairFromTitle(p) == null) return false
  if (!p.groups?.some((g) => g.kind === 'consec')) return false
  if (targetDef.cat !== 'suit' || naturalDef.cat !== 'suit') return false
  return targetDef.rank === naturalDef.rank
}

/**
 * Target defs for the suggested strip: same layout as `groupPreviewIndexSpans`, but ranks / suit
 * slots / dragons chosen by the same greedy logic as `computeGroupMatch` (fixes e.g. ANY LIKE
 * NUMBERS showing “1” while the matcher uses your “2” tiles).
 */
function resolveStripTargetDefsForGreedyMatch(
  p: PracticePattern,
  rack: TileInstance[],
  usedMeta: readonly GroupUsedMeta[],
  exposureTileIds?: ReadonlySet<string>,
): TileDef[] {
  const base = patternLinePreviewGroupOrderDefs(p)
  if (!p.groups?.length || base.length === 0) return base
  const spans = groupPreviewIndexSpans(p)
  if (!spans) return base

  const out = [...base]
  // Tracks suits already committed by suit-locked groups so suit-permute won't collide.
  const lockedSuits = new Set<Suit>()

  for (let gi = 0; gi < p.groups.length; gi++) {
    const g = p.groups[gi]!
    const span = spans[gi]
    if (!span) continue
    const [a, b] = span
    const rem = rackAfterPriorGroups(rack, usedMeta, gi)

    switch (g.kind) {
      case 'shared-rank-suits': {
        const forcedRank = forcedSharedRankSuitsRankFromExposures(rack, exposureTileIds, g)
        const plan =
          inferSharedRankSuitsFromMeta(rack, usedMeta, gi, g) ??
          peekSharedRankSuitsPlan(rem, g, forcedRank)
        if (!plan) break
        let idx = a
        for (let col = 0; col < g.needs.length; col++) {
          const suit = plan.perm[col]!
          const n = g.needs[col]!
          for (let k = 0; k < n && idx < b; k++) {
            out[idx++] = { cat: 'suit', suit, rank: plan.rank }
          }
        }
        break
      }
      case 'fixed': {
        if (isGenericAllDragonsFixedGroup(g) && g.need >= 2) {
          // Show the full pair/pung/kong target (e.g. 4× green) — closest meld from what you hold.
          const dr = pickBestDragonTypeFromRem(rem)
          if (dr) fillSpan(out, a, b, { cat: 'dragon', dragon: dr })
          break
        }
        const taken = metaNatTilesForGroup(rack, usedMeta, gi)
        if (taken.length > 0) {
          const ordered =
            taken.length >= 2 && taken.every((t) => t.def.cat === 'dragon')
              ? orderDragonTilesForAdjacentPairs(taken)
              : taken
          fillSpanTileDefs(out, a, ordered)
        }
        break
      }
      case 'rank': {
        const map = new Map<string, TileInstance[]>()
        for (const t of rem) {
          if (!g.test(t.def)) continue
          const k = tileKey(t.def)
          const arr = map.get(k) ?? []
          arr.push(t)
          map.set(k, arr)
        }
        let bestKey = '', bestCount = 0
        for (const [k, ts] of map) {
          if (ts.length > bestCount) {
            bestCount = ts.length
            bestKey = k
          }
        }
        if (!bestKey) break
        if (isDragonKey(bestKey)) {
          fillSpan(out, a, b, { cat: 'dragon', dragon: bestKey })
        } else {
          const rank = Number(bestKey)
          const st = rem.find((t) => t.def.cat === 'suit' && tileKey(t.def) === bestKey && g.test(t.def))
          const suit = st?.def.cat === 'suit' ? st.def.suit : 'bam'
          if (rank >= 1 && rank <= 9) fillSpan(out, a, b, { cat: 'suit', suit, rank })
        }
        break
      }
      case 'shared-rank': {
        const totalNeed = g.needs.reduce((x, y) => x + y, 0)
        const map = new Map<string, TileInstance[]>()
        for (const t of rem) {
          if (!g.test(t.def)) continue
          const k = tileKey(t.def)
          const arr = map.get(k) ?? []
          arr.push(t)
          map.set(k, arr)
        }
        let bestKey = '', bestFill = 0
        for (const [k, ts] of map) {
          const fill = Math.min(ts.length, totalNeed)
          if (fill > bestFill) {
            bestFill = fill
            bestKey = k
          }
        }
        if (!bestKey) break
        if (isDragonKey(bestKey)) {
          fillSpan(out, a, b, { cat: 'dragon', dragon: bestKey })
        } else {
          const rank = Number(bestKey)
          const st = rem.find((t) => t.def.cat === 'suit' && tileKey(t.def) === bestKey && g.test(t.def))
          const suit = st?.def.cat === 'suit' ? st.def.suit : 'bam'
          if (rank >= 1 && rank <= 9) fillSpan(out, a, b, { cat: 'suit', suit, rank })
        }
        break
      }
      case 'suit-locked-rank': {
        const dragonForSuit = { bam: 'green' as const, dot: 'soap' as const, crak: 'red' as const }
        const dc = g.dragonCount ?? 0
        let bestFill = 0
        let bestSuit: Suit | null = null
        let bestRank = -1
        for (const s of SUITS) {
          for (let rank = 1; rank <= 9; rank++) {
            const c = rem.filter(
              (t) => t.def.cat === 'suit' && t.def.suit === s && t.def.rank === rank && g.test(t.def),
            ).length
            let fill = Math.min(c, g.need)
            if (dc > 0) {
              const drg = dragonForSuit[s]
              fill += Math.min(rem.filter((t) => t.def.cat === 'dragon' && t.def.dragon === drg).length, dc)
            }
            if (fill > bestFill) {
              bestFill = fill
              bestSuit = s
              bestRank = rank
            }
          }
        }
        if (bestSuit && bestRank >= 0) {
          const drg = dragonForSuit[bestSuit]
          let idx = a
          if (g.dragonsFirst && dc > 0) {
            for (let k = 0; k < dc && idx < b; k++) out[idx++] = { cat: 'dragon', dragon: drg }
          }
          for (let k = 0; k < g.need && idx < b; k++) {
            out[idx++] = { cat: 'suit', suit: bestSuit, rank: bestRank }
          }
          if (!g.dragonsFirst && dc > 0) {
            for (let k = 0; k < dc && idx < b; k++) out[idx++] = { cat: 'dragon', dragon: drg }
          }
          lockedSuits.add(bestSuit)
        }
        break
      }
      case 'consec': {
        // Derive bestR from usedMeta first (the greedy matcher now selects per-suit-rank correctly).
        const metaById = new Map(usedMeta.map((m) => [m.id, m] as const))
        const groupTiles = metaNatTilesForGroup(rack, usedMeta, gi)
        const arm0Tiles = groupTiles.filter((t) => {
          const m = metaById.get(t.id)
          return m && m.groupIdx === gi && !m.isJoker && m.consecPart === 0 && t.def.cat === 'suit' && g.test(t.def)
        })
        const arm1Tiles = groupTiles.filter((t) => {
          const m = metaById.get(t.id)
          return m && m.groupIdx === gi && !m.isJoker && m.consecPart === 1 && t.def.cat === 'suit' && g.test(t.def)
        })
        // Determine bestR from actual arm0 tiles; fall back to per-suit-rank calculation.
        let bestR = arm0Tiles.length > 0 && arm0Tiles[0]!.def.cat === 'suit' ? arm0Tiles[0]!.def.rank : -1
        if (bestR < 0 && arm1Tiles.length > 0 && arm1Tiles[0]!.def.cat === 'suit') {
          bestR = arm1Tiles[0]!.def.rank - 1
        }
        if (bestR < 0) {
          // No naturals assigned — pick rank by per-suit-rank fill, same logic as the greedy matcher.
          const bySR = new Map<string, number>()
          for (const t of rem) {
            if (t.def.cat === 'suit' && g.test(t.def)) {
              const k = `${t.def.suit}:${t.def.rank}`
              bySR.set(k, (bySR.get(k) ?? 0) + 1)
            }
          }
          let bestFill = 0, bestBalance = -1
          for (const [k1, c1] of bySR) {
            const r = parseInt(k1.split(':')[1]!)
            const f1 = Math.min(c1, g.need1)
            let bestF2 = 0
            for (const [k2, c2] of bySR) {
              if (parseInt(k2.split(':')[1]!) !== r + 1) continue
              const f2 = Math.min(c2, g.need2)
              if (f2 > bestF2) bestF2 = f2
            }
            const fill = f1 + bestF2
            const balance = Math.min(f1, bestF2)
            if (fill > bestFill || (fill === bestFill && balance > bestBalance)) {
              bestFill = fill; bestBalance = balance; bestR = r
            }
          }
        }
        if (bestR < 0) break
        let suit1 = majoritySuitAmongSuitTiles(arm0Tiles)
        let suit2 = majoritySuitAmongSuitTiles(arm1Tiles)
        if (suit1 == null) {
          const t = rem.find((x) => x.def.cat === 'suit' && x.def.rank === bestR && g.test(x.def))
          suit1 = t?.def.cat === 'suit' ? t.def.suit : 'bam'
        }
        if (suit2 == null) {
          const t = g.opposingSuits
            ? rem.find((x) => x.def.cat === 'suit' && x.def.rank === bestR + 1 && g.test(x.def) && x.def.suit !== suit1)
            : rem.find((x) => x.def.cat === 'suit' && x.def.rank === bestR + 1 && g.test(x.def))
          if (t?.def.cat === 'suit') {
            suit2 = t.def.suit
          } else if (g.opposingSuits) {
            const SUITS_ALL = ['bam', 'dot', 'crak'] as const
            suit2 = SUITS_ALL.find(s => s !== suit1) ?? suit1
          } else {
            suit2 = suit1
          }
        }
        // For opposing-suit hands, ensure arm2 never uses arm1's suit even if meta placed it there.
        if (g.opposingSuits && suit2 === suit1) {
          const SUITS_ALL = ['bam', 'dot', 'crak'] as const
          suit2 = SUITS_ALL.find(s => s !== suit1) ?? suit1
        }
        let idx = a
        for (let k = 0; k < g.need1 && idx < b; k++) out[idx++] = { cat: 'suit', suit: suit1, rank: bestR }
        for (let k = 0; k < g.need2 && idx < b; k++) out[idx++] = { cat: 'suit', suit: suit2, rank: bestR + 1 }
        break
      }
      case 'suit-locked-consec': {
        const dragonForSuit = { bam: 'green' as const, dot: 'soap' as const, crak: 'red' as const }
        const maxStart = 10 - g.numGroups
        let bestFill = 0
        let bestSuit: Suit | null = null
        let bestStart = -1
        for (const s of SUITS) {
          const byRank = new Map<number, number>()
          for (const t of rem) {
            if (t.def.cat === 'suit' && t.def.suit === s) {
              byRank.set(t.def.rank, (byRank.get(t.def.rank) ?? 0) + 1)
            }
          }
          const dCount = Math.min(
            rem.filter((t) => t.def.cat === 'dragon' && t.def.dragon === dragonForSuit[s]).length,
            g.dragonCount,
          )
          for (let r = 1; r <= maxStart; r++) {
            let fill = 0
            for (let i = 0; i < g.numGroups; i++) {
              fill += Math.min(byRank.get(r + i) ?? 0, g.rankCount)
            }
            fill += dCount
            if (fill > bestFill) {
              bestFill = fill
              bestSuit = s
              bestStart = r
            }
          }
        }
        if (!bestSuit || bestStart < 0) break
        let idx = a
        for (let i = 0; i < g.numGroups; i++) {
          const rank = bestStart + i
          for (let k = 0; k < g.rankCount && idx < b; k++) {
            out[idx++] = { cat: 'suit', suit: bestSuit, rank }
          }
        }
        if (g.dragonCount > 0) {
          const drg = dragonForSuit[bestSuit]
          for (let k = 0; k < g.dragonCount && idx < b; k++) {
            out[idx++] = { cat: 'dragon', dragon: drg }
          }
        }
        break
      }
      case 'dragon-meld-permute': {
        fillDragonMeldPermuteSpan(out, a, b, g, rem, rack, usedMeta, gi)
        break
      }
      case 'odd-pair-kongs-triple': {
        const odds = g.odds
        const { pairRank: bestPairRank, perm: bestPerm } = pickBestOddPairKongsTriple(
          rem,
          odds,
          exposureTileIds,
          lockedSuits,
          p.section === 'SINGLES AND PAIRS',
        )
        let idx = a
        const blockOut = pairKongsTripleBlockRanks(odds, bestPairRank)
        const s0o = bestPerm[0]!
        const s1o = bestPerm[1]!
        const s2o = bestPerm[2]!
        for (const r of blockOut) {
          for (let k = 0; k < 1 && idx < b; k++) out[idx++] = { cat: 'suit', suit: s0o, rank: r }
        }
        for (let k = 0; k < 4 && idx < b; k++) out[idx++] = { cat: 'suit', suit: s1o, rank: bestPairRank }
        for (let k = 0; k < 4 && idx < b; k++) out[idx++] = { cat: 'suit', suit: s2o, rank: bestPairRank }
        break
      }
      case 'suit-permute': {
        const drgForSuitPerm = { bam: 'green' as const, dot: 'soap' as const, crak: 'red' as const }
        const n = g.colorGroups.length
        const tdc = g.trailingDragonCount ?? 0
        const maxRankOff = g.consecRanks
          ? Math.max(...g.colorGroups.flatMap((cg) => cg.map((sg) => sg.rank))) - 1
          : 0
        const searchBases = g.consecRanks
          ? Array.from({ length: 9 - maxRankOff }, (_, i) => i + 1)
          : [1]
        let bestScore = { fill: -1, exposureFill: -1, maxSlotFill: -1, slotSquareFill: -1 }
        let bestPerm: Suit[] = []
        let bestBase = 1
        const metaPlan = inferConsecSuitPermutePlanFromMeta(rack, usedMeta, gi, g)
        if (metaPlan) {
          bestPerm = metaPlan.perm
          bestBase = metaPlan.base
        } else {
          for (const base of searchBases) {
            for (const perm of suitPermutations(n)) {
              // Skip permutations that reuse a suit already committed by a suit-locked group.
              if (lockedSuits.size > 0 && perm.some((s) => lockedSuits.has(s))) continue
              const score = scoreSuitPermuteCombo(rem, g, perm, base, exposureTileIds)
              if (suitPermuteComboScoreBetter(score, bestScore, !!exposureTileIds)) {
                bestScore = score
                bestPerm = [...perm]
                bestBase = base
              }
            }
          }
        }
        if (bestPerm.length !== n) break
        let idx = a
        for (let ci = 0; ci < n; ci++) {
          const s = bestPerm[ci]!
          const yearBlock =
            isNmjl2026NeutralZeroPattern(p) && isNmjl2026ZeroColorGroup(g.colorGroups[ci]!)
          const rankOcc = new Map<number, number>()
          for (const sg of g.colorGroups[ci]) {
            const rank = sg.rank - 1 + bestBase
            for (let k = 0; k < sg.need && idx < b; k++) {
              const occ = rankOcc.get(rank) ?? 0
              rankOcc.set(rank, occ + 1)
              const suit = yearBlock ? nmjl2026ZeroSuitForGroupTile(s, rank, occ) : s
              out[idx++] = { cat: 'suit', suit, rank }
            }
          }
          const dc = g.colorGroupDragonCounts?.[ci] ?? 0
          if (dc > 0) {
            const drg = drgForSuitPerm[s]
            for (let k = 0; k < dc && idx < b; k++) out[idx++] = { cat: 'dragon', dragon: drg }
          }
        }
        if (tdc > 0) {
          const remaining = SUITS.find((s) => !bestPerm.includes(s))
          if (remaining) {
            const drg = drgForSuitPerm[remaining]
            for (let k = 0; k < tdc && idx < b; k++) out[idx++] = { cat: 'dragon', dragon: drg }
          }
        }
        break
      }
      case 'suit-locked': {
        const dragonForSuit = { bam: 'green' as const, dot: 'soap' as const, crak: 'red' as const }
        const opposingForSuit = {
          bam: ['soap', 'red'] as const,
          dot: ['green', 'red'] as const,
          crak: ['green', 'soap'] as const,
        } as const
        let bestFill = 0
        let bestSuit: Suit | null = null
        for (const s of SUITS) {
          let fill = 0
          for (const { rank, need } of g.rankNeeds) {
            const count = rem.filter(
              (t) => t.def.cat === 'suit' && t.def.suit === s && t.def.rank === rank,
            ).length
            fill += Math.min(count, need)
          }
          if (g.dragonCount > 0) {
            const drg = dragonForSuit[s]
            const dCount = rem.filter((t) => t.def.cat === 'dragon' && t.def.dragon === drg).length
            fill += Math.min(dCount, g.dragonCount)
          }
          if (g.opposingDragons) {
            const [drg1, drg2] = opposingForSuit[s]
            const need = g.opposingDragons.need
            if (g.opposingDragons.eitherType) {
              const c1 = rem.filter((t) => t.def.cat === 'dragon' && t.def.dragon === drg1).length
              const c2 = rem.filter((t) => t.def.cat === 'dragon' && t.def.dragon === drg2).length
              fill += Math.min(Math.max(c1, c2), need)
            } else {
              fill += Math.min(
                rem.filter((t) => t.def.cat === 'dragon' && t.def.dragon === drg1).length,
                need,
              )
              fill += Math.min(
                rem.filter((t) => t.def.cat === 'dragon' && t.def.dragon === drg2).length,
                need,
              )
            }
          }
          if (fill > bestFill) {
            bestFill = fill
            bestSuit = s
          }
        }
        if (!bestSuit) break
        lockedSuits.add(bestSuit)
        let idx = a
        const drg = dragonForSuit[bestSuit]
        // dragonsFirst: dragons before rank tiles (e.g. "DDDD 3333…"); default: ranks first.
        if (g.dragonsFirst && g.dragonCount > 0) {
          for (let k = 0; k < g.dragonCount && idx < b; k++) out[idx++] = { cat: 'dragon', dragon: drg }
        }
        for (const { rank, need } of g.rankNeeds) {
          for (let k = 0; k < need && idx < b; k++) {
            out[idx++] = { cat: 'suit', suit: bestSuit, rank }
          }
        }
        if (!g.dragonsFirst && g.dragonCount > 0) {
          for (let k = 0; k < g.dragonCount && idx < b; k++) out[idx++] = { cat: 'dragon', dragon: drg }
        }
        if (g.opposingDragons) {
          const [drg1, drg2] = opposingForSuit[bestSuit]
          const need = g.opposingDragons.need
          if (g.opposingDragons.eitherType) {
            const c1 = rem.filter((t) => t.def.cat === 'dragon' && t.def.dragon === drg1).length
            const c2 = rem.filter((t) => t.def.cat === 'dragon' && t.def.dragon === drg2).length
            const pick = c2 > c1 ? drg2 : drg1
            for (let k = 0; k < need && idx < b; k++) out[idx++] = { cat: 'dragon', dragon: pick }
          } else {
            for (let k = 0; k < need && idx < b; k++) out[idx++] = { cat: 'dragon', dragon: drg1 }
            for (let k = 0; k < need && idx < b; k++) out[idx++] = { cat: 'dragon', dragon: drg2 }
          }
        }
        break
      }
      case 'suit-locked-consec-multi': {
        // QUINTS #1 etc.: same search as `computeGroupMatch` / tiles-away (defaults were all `bam`,
        // so naturals in the *chosen* suit did not line up and rack highlights were wrong).
        const rem = rackAfterPriorGroups(rack, usedMeta, gi)
        const n = g.needs.length
        const maxStart = 10 - n
        let bestFill = 0
        let bestSuit: Suit | null = null
        let bestStart = -1
        for (const s of SUITS) {
          const byRank = new Map<number, number>()
          for (const t of rem) {
            if (t.def.cat === 'suit' && t.def.suit === s && g.test(t.def)) {
              byRank.set(t.def.rank, (byRank.get(t.def.rank) ?? 0) + 1)
            }
          }
          for (let r = 1; r <= maxStart; r++) {
            let fill = 0
            for (let i = 0; i < n; i++) {
              fill += Math.min(byRank.get(r + i) ?? 0, g.needs[i]!)
            }
            if (fill > bestFill) {
              bestFill = fill
              bestSuit = s
              bestStart = r
            }
          }
        }
        if (bestSuit == null || bestStart < 0) break
        lockedSuits.add(bestSuit)
        const s = bestSuit
        let idx = a
        for (let i = 0; i < n; i++) {
          const rank = bestStart + i
          const need = g.needs[i]!
          for (let k = 0; k < need && idx < b; k++) {
            out[idx++] = { cat: 'suit', suit: s, rank }
          }
        }
        break
      }
      default:
        break
    }
  }

  // After resolving SRS suits, patch any coupled generic-dragon fixed groups so their
  // dragon type matches the actual chosen suit (bam→green, dot→soap, crak→red).
  patchCoupledSrsDragonStripDefs(out, p, spans)

  return out
}

/**
 * Re-derives the dragon type for each SRS-coupled generic-dragon `fixed` group using the
 * actual suits already written into `out` (rather than whatever rack tiles the greedy match
 * happened to assign, which may be the wrong dragon flavor).
 */
function patchCoupledSrsDragonStripDefs(
  out: TileDef[],
  p: PracticePattern,
  spans: readonly ([number, number] | undefined)[],
): void {
  const groups = p.groups
  if (!groups?.length) return
  const dragonForSuit = { bam: 'green', dot: 'soap', crak: 'red' } as const
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi]!
    if (!isGenericAllDragonsFixedGroup(g)) continue
    const col = srsDragonCoupledColumn(p, gi, g)
    if (col == null) continue
    const srsGi = col === 0 ? gi - 1 : gi - 2
    const srsG = groups[srsGi]
    if (!srsG || srsG.kind !== 'shared-rank-suits') continue
    const srsSpan = spans[srsGi]
    const span = spans[gi]
    if (!srsSpan || !span) continue
    const [srsA] = srsSpan
    const [a, b] = span
    // Column col starts after the sum of prior column needs within the SRS span
    const colOffset = srsG.needs.slice(0, col).reduce((s, n) => s + n, 0)
    const colTile = out[srsA + colOffset]
    if (colTile?.cat !== 'suit') continue
    const dragon = dragonForSuit[colTile.suit]
    for (let k = a; k < b; k++) out[k] = { cat: 'dragon', dragon }
  }
}

/** One card-order cell in the suggested-hands strip: actual rack face when held, else pattern target (never a joker face). */
export type SuggestedStripSlot = {
  displayDef: TileDef
  cardInk?: CardInk
  /** True when this cell shows a natural tile from your rack that counts toward the line. */
  highlight: boolean
  /** True when this cell is the next legal joker fill target in the suggested meld. */
  jokerSuggested: boolean
  /**
   * Rack tile id shown in this cell (natural or joker), when assigned. Used so focused Sort
   * follows the same left-to-right order as the tray strip (including left-anchored jokers).
   */
  tileId?: string | null
  /**
   * Pattern group index when this cell belongs to a claim meld that is fully on the table
   * (boxed on the suggested-hands tile strip, same idea as bot possible-hands).
   */
  exposureMeldId?: number | null
}

/**
 * When pairing title-line preview cells to greedy strip defs for reorder, suit columns must
 * match; rank may differ because NMJL “any like numbers” lines print `1` as a placeholder while
 * the strip shows the resolved rank from the rack.
 */
/** Suit-locked lines with one real suit: title digits use stand-in suits (see `previewStandInSuitForDigitInk`). */
function suitLockedSingleSuitPattern(p: PracticePattern): boolean {
  return (
    p.groups?.some(
      (g) =>
        g.kind === 'suit-locked' &&
        !g.opposingDragons &&
        g.rankNeeds.length > 0,
    ) ?? false
  )
}

function stripDefsMatchForTitleReorder(stripDef: TileDef, titleDef: TileDef, p: PracticePattern): boolean {
  if (stripDef.cat !== titleDef.cat) return false
  if (stripDef.cat === 'suit' && titleDef.cat === 'suit') {
    if (stripDef.suit !== titleDef.suit) {
      if (suitLockedSingleSuitPattern(p) && stripDef.rank === titleDef.rank) return true
      return false
    }
    if (stripDef.rank === titleDef.rank) return true
    const likeNumbersPlaceholder =
      p.section === 'ANY LIKE NUMBERS' || p.id.startsWith('like-')
    return likeNumbersPlaceholder && titleDef.rank === 1
  }
  if (stripDef.cat === 'wind' && titleDef.cat === 'wind') return stripDef.wind === titleDef.wind
  if (stripDef.cat === 'dragon' && titleDef.cat === 'dragon') {
    return (
      stripDef.dragon === titleDef.dragon ||
      stripDef.dragon === 'any' ||
      titleDef.dragon === 'any'
    )
  }
  return true
}

function reorderStripToTitleOrder(
  provisional: SuggestedStripSlot[],
  groupDefs: readonly TileDef[],
  p: PracticePattern,
): { defs: TileDef[]; slots: SuggestedStripSlot[] } | null {
  const titlePreview = patternLinePreviewSlots(p)
  if (titlePreview.length !== provisional.length) return null

  const resolvedTitleDefs = suitLockedConsecTitleOrderDefsFromResolvedStrip(p, groupDefs)
  if (resolvedTitleDefs) {
    const used = new Set<number>()
    const reorderedDefs: TileDef[] = []
    const reorderedSlots: SuggestedStripSlot[] = []
    for (let ti = 0; ti < titlePreview.length; ti++) {
      const tp = titlePreview[ti]!
      const want = resolvedTitleDefs[ti]!
      let found = -1
      for (let gi = 0; gi < groupDefs.length; gi++) {
        if (used.has(gi)) continue
        if (tileDefsEqual(groupDefs[gi]!, want)) {
          found = gi
          break
        }
      }
      if (found < 0) return null
      used.add(found)
      reorderedDefs.push(groupDefs[found]!)
      reorderedSlots.push({ ...provisional[found]!, cardInk: tp.cardInk })
    }
    return { defs: reorderedDefs, slots: reorderedSlots }
  }

  const used = new Set<number>()
  const reorderedDefs: TileDef[] = []
  const reorderedSlots: SuggestedStripSlot[] = []
  for (const tp of titlePreview) {
    let found = -1
    for (let gi = 0; gi < groupDefs.length; gi++) {
      if (used.has(gi)) continue
      if (stripDefsMatchForTitleReorder(groupDefs[gi]!, tp.def, p)) {
        found = gi
        break
      }
    }
    if (found < 0) return null
    used.add(found)
    reorderedDefs.push(groupDefs[found]!)
    reorderedSlots.push({ ...provisional[found]!, cardInk: tp.cardInk })
  }
  return { defs: reorderedDefs, slots: reorderedSlots }
}

function leftAnchorNaturalsByMeldRun(
  defs: readonly TileDef[],
  slots: readonly SuggestedStripSlot[],
): SuggestedStripSlot[] {
  if (defs.length !== slots.length) return [...slots]
  const out = slots.map((s) => ({ ...s }))
  let i = 0
  while (i < defs.length) {
    const a = i
    const d0 = defs[i]!
    i++
    while (i < defs.length && tileDefsEqual(defs[i]!, d0)) i++
    const b = i
    const run = out.slice(a, b)
    if (!run.some((s) => s.highlight || s.jokerSuggested)) continue

    const ordered = [
      ...run.filter((s) => s.highlight),
      ...run.filter((s) => !s.highlight && s.jokerSuggested),
      ...run.filter((s) => !s.highlight && !s.jokerSuggested),
    ]
    for (let k = a; k < b; k++) {
      out[k] = {
        ...ordered[k - a]!,
        // Preserve card-line ink by visual position; duplicate runs can be recolored by card column.
        cardInk: out[k]!.cardInk,
      }
    }
  }
  return out
}

/** Card-line defs sometimes use `{ cat: 'joker' }` placeholders — replace with the natural tile that meld represents. */
function normalizeSuggestedStripTargetDefs(defs: TileDef[]): TileDef[] {
  const naturalNeighbor = (i: number): TileDef | null => {
    for (let j = i - 1; j >= 0; j--) {
      const d = defs[j]!
      if (d.cat === 'joker') continue
      if (d.cat === 'suit' || d.cat === 'wind' || d.cat === 'dragon' || d.cat === 'flower') return d
    }
    for (let j = i + 1; j < defs.length; j++) {
      const d = defs[j]!
      if (d.cat === 'joker') continue
      if (d.cat === 'suit' || d.cat === 'wind' || d.cat === 'dragon' || d.cat === 'flower') return d
    }
    return null
  }
  return defs.map((d, i) => {
    if (d.cat !== 'joker') return d
    return naturalNeighbor(i) ?? d
  })
}

function resolveCardLineFromGroupSlotMap(
  p: PracticePattern,
  override?: readonly number[],
): readonly number[] | undefined {
  return override ?? p.cardLineFromGroupSlotMap ?? inferCardLineFromGroupSlotMap(p)
}

function patternForCardLineStrip(
  p: PracticePattern,
  cardLineMap: readonly number[] | undefined,
): PracticePattern {
  if (!cardLineMap || p.cardLineFromGroupSlotMap === cardLineMap) return p
  return { ...p, cardLineFromGroupSlotMap: cardLineMap }
}

export function finalizeExposureMeldStripHighlights(
  slots: SuggestedStripSlot[],
  usedMeta: readonly GroupUsedMeta[],
  exposureTileIds: ReadonlySet<string>,
  p: PracticePattern,
): SuggestedStripSlot[] {
  if (!exposureTileIds.size || !p.groups) return slots
  const spans = groupPreviewIndexSpans(p)
  if (!spans) return slots
  const cardLineMap = p.cardLineFromGroupSlotMap ?? inferCardLineFromGroupSlotMap(p)
  const out = slots.map((s) => ({ ...s }))
  for (let gi = 0; gi < p.groups.length; gi++) {
    const span = spans[gi]
    if (!span) continue
    const [a, b] = span
    const meldLen = b - a
    const expInGroup = usedMeta.filter(
      (m) => m.groupIdx === gi && exposureTileIds.has(m.id),
    ).length
    if (expInGroup < meldLen) continue
    const cardIndices: number[] = []
    if (cardLineMap) {
      for (let d = 0; d < cardLineMap.length; d++) {
        const g = cardLineMap[d]!
        if (g >= a && g < b) cardIndices.push(d)
      }
    } else {
      for (let si = a; si < b; si++) cardIndices.push(si)
    }
    for (const si of cardIndices) {
      if (si >= out.length) continue
      out[si] = {
        ...out[si]!,
        highlight: true,
        jokerSuggested: false,
      }
    }
  }
  return out
}

/**
 * Box claim melds on the suggested-hands strip the same way bot possible-hands does:
 * park each exposure on a same-size printed run (`placeExposureMeldsOnCardLine`), never by
 * pattern-group fill (suit-permute groups are too wide and pairs must not steal a pung).
 */
export function applyExposureMeldBoxesToStrip(
  slots: SuggestedStripSlot[],
  claimMelds: readonly ExposureMeld[],
): SuggestedStripSlot[] {
  if (!claimMelds.length || slots.length === 0) {
    return slots.map((s) => ({ ...s, exposureMeldId: s.exposureMeldId ?? null }))
  }
  const placed = placeExposureMeldsOnCardLine(
    slots.map((s) => s.displayDef),
    claimMelds,
  )
  return slots.map((s, i) => {
    const exposureMeldId = placed.meldRunId[i] ?? null
    if (exposureMeldId == null) return { ...s, exposureMeldId }
    // Full expose run lights up — including joker stand-ins that never got a rack highlight id.
    return {
      ...s,
      exposureMeldId,
      highlight: true,
      jokerSuggested: false,
    }
  })
}

/**
 * After a claim meld is exposed, remapping the strip to the same concrete card line bot
 * possible-hands uses (exact meld sizes — a pung never parks on a kong), then re-apply rack
 * highlights and exposure boxes. Without this, greedy fill keeps a hand-biased base (e.g. Runs
 * starting at 4) and only lights the natural copies of the expose.
 */
/**
 * True when claim melds already land on exact-size runs in the strip's display defs.
 * Used to skip claim-meld-only consec remapping that can pick a worse window (e.g. exposed
 * 8888 fitting both 678 and 789 — first-match would steal the hand off 789 onto 678).
 */
function stripDisplayDefsFitClaimMelds(
  slots: readonly SuggestedStripSlot[],
  claimMelds: readonly ExposureMeld[],
): boolean {
  if (slots.length === 0 || claimMelds.length === 0) return false
  const collapsed: { key: string; need: number }[] = []
  for (const s of slots) {
    const key = s.displayDef.cat === 'flower' ? 'flower' : fullDefKey(s.displayDef)
    const last = collapsed[collapsed.length - 1]
    if (last && last.key === key) last.need += 1
    else collapsed.push({ key, need: 1 })
  }
  return claimMeldsExactMatchSlots(claimMelds, collapsed)
}

export function realignSuggestedStripToClaimMelds(
  slots: SuggestedStripSlot[],
  p: PracticePattern,
  claimMelds: readonly ExposureMeld[],
  rack: TileInstance[],
  usedOrder: readonly string[],
  bestIdsForAssignment: ReadonlySet<string>,
  usedMeta: readonly GroupUsedMeta[] | null,
  exposureTileIds?: ReadonlySet<string>,
): SuggestedStripSlot[] {
  if (!claimMelds.length || slots.length === 0) return slots
  // Full-rack greedy already chose a consec window that hosts the exposures — keep it.
  // Claim-meld-only planning returns the *first* fitting base and can downgrade a better
  // match (Runs #7b: 789 with four 9s + exposed 8888 → wrongly remapped to 678).
  if (stripDisplayDefsFitClaimMelds(slots, claimMelds)) {
    return applyExposureMeldBoxesToStrip(slots, claimMelds)
  }
  const aligned = resolveCardLineDefsForClaimMelds(p, claimMelds)
  if (aligned.length !== slots.length) {
    return applyExposureMeldBoxesToStrip(slots, claimMelds)
  }
  // `aligned` is already card/title order; skip title reorder so assignment stays on that line.
  const rebuilt = buildSuggestedStripSlotsFromStripDefs(
    p,
    rack,
    usedOrder,
    bestIdsForAssignment,
    usedMeta,
    aligned,
    true,
    true,
    undefined,
    exposureTileIds,
  )
  const base =
    rebuilt.length === slots.length
      ? rebuilt
      : slots.map((s, i) => ({
          ...s,
          displayDef: aligned[i]!,
          highlight: false,
          jokerSuggested: false,
          exposureMeldId: null,
        }))
  return applyExposureMeldBoxesToStrip(base, claimMelds)
}

/**
 * Builds strip cells for a **full** winning hand (`roughTarget` tiles, usually 14): rack naturals
 * where assigned, otherwise the completed-hand target tile (joker placeholders → that meld’s natural).
 * `highlight` for naturals you hold and for exposure meld tiles (including jokers in open melds).
 */
function buildSuggestedStripSlotsFromStripDefs(
  p: PracticePattern,
  rack: TileInstance[],
  usedOrder: readonly string[],
  bestIdsForAssignment: ReadonlySet<string>,
  usedMeta: readonly GroupUsedMeta[] | null,
  stripDefsGroup: TileDef[],
  /** When true (variant rows), a rack tile only shows in a slot when it exactly matches the slot's
   * resolved suit+rank. Prevents mixed-suit display in consec / suit-permute variant rows. */
  strictSuitMatching = false,
  /** Skip internal title-order reorder (caller will do its own reordering). */
  skipTitleReorder = false,
  /** Base-pattern card line map when `p` is a pinned variant without `cardLineFromGroupSlotMap`. */
  cardLineFromGroupSlotMapOverride?: readonly number[],
  exposureTileIds?: ReadonlySet<string>,
): SuggestedStripSlot[] {
  const cardLineMap = resolveCardLineFromGroupSlotMap(p, cardLineFromGroupSlotMapOverride)
  const pForStrip = patternForCardLineStrip(p, cardLineMap)
  const rawDefs = reorderTileDefsByCardLineFromGroupMap(stripDefsGroup, cardLineMap)
  const defs = normalizeSuggestedStripTargetDefs(rawDefs).slice(0, p.roughTarget)
  const cardInks = patternLinePreviewCardInks(p)
  if (defs.length === 0) return []
  const greedyOpts: GreedyPatternMatchOpts | undefined =
    exposureTileIds?.size ? { exposureTileIds } : undefined
  const assign = computePreviewStripAssignment(
    pForStrip,
    rack,
    usedOrder,
    bestIdsForAssignment,
    usedMeta,
    stripDefsGroup,
    greedyOpts,
  )
  const byId = new Map(rack.map((t) => [t.id, t] as const))
  const naturalUsed = new Set(
    usedOrder.filter((id) => {
      const t = byId.get(id)
      return t && t.def.cat !== 'joker'
    }),
  )
  const provisional = defs.map((targetDef, i) => {
    const cardInk = i < cardInks.length ? cardInks[i] : undefined
    const tid = assign.slotTileIdByStripIndex[i] ?? null
    let displayDef: TileDef = targetDef
    let highlight = false
    let jokerSuggested = false
    if (tid) {
      const t = byId.get(tid)
      const isExposure = exposureTileIds?.has(tid) ?? false
      if (t && t.def.cat === 'joker') {
        // Real rack joker filling this slot: keep the target tile's color/identifier;
        // the JOKER badge renders on top so the meld type stays readable.
        displayDef = targetDef
        if (isExposure) {
          highlight = true
        } else {
          jokerSuggested = true
        }
      } else if (t && t.def.cat !== 'joker') {
        const compatible = strictSuitMatching
          ? tileDefsEqual(targetDef, t.def)
          : stripSlotAcceptsNatural(p, targetDef, t.def)
        displayDef = compatible ? t.def : targetDef
        highlight = compatible && (naturalUsed.has(tid) || isExposure)
      }
    } else if (assign.kinds[i] === 'joker') {
      const expId = assign.slotTileIdByStripIndex[i]
      if (expId && exposureTileIds?.has(expId)) {
        displayDef = targetDef
        highlight = true
      } else {
        jokerSuggested = true
      }
    }

    return { displayDef, cardInk, highlight, jokerSuggested, tileId: tid }
  })
  for (let i = 0; i < provisional.length; i++) {
    const tid = assign.slotTileIdByStripIndex[i]
    if (assign.kinds[i] === 'joker' && tid && exposureTileIds?.has(tid)) {
      provisional[i] = {
        ...provisional[i]!,
        displayDef: defs[i]!,
        highlight: true,
        jokerSuggested: false,
        tileId: tid,
      }
    }
  }
  if (exposureTileIds?.size && usedMeta && p.groups) {
    const spans = groupPreviewIndexSpans(p)
    if (spans) {
      for (let gi = 0; gi < p.groups.length; gi++) {
        const span = spans[gi]
        if (!span) continue
        const [a, b] = span
        const meldLen = b - a
        const expInGroup = usedMeta.filter(
          (m) => m.groupIdx === gi && exposureTileIds.has(m.id),
        ).length
        if (expInGroup < meldLen) continue
        const cardIndices: number[] = []
        if (cardLineMap) {
          for (let d = 0; d < cardLineMap.length; d++) {
            const g = cardLineMap[d]!
            if (g >= a && g < b) cardIndices.push(d)
          }
        } else {
          for (let si = a; si < b; si++) cardIndices.push(si)
        }
        for (const si of cardIndices) {
          if (si >= provisional.length) continue
          provisional[si] = {
            ...provisional[si]!,
            displayDef: defs[si]!,
            highlight: true,
            jokerSuggested: false,
          }
        }
      }
    }
  }
  if (!skipTitleReorder) {
    const reordered = reorderStripToTitleOrder(provisional, defs, p)
    if (reordered) {
      const anchored = leftAnchorNaturalsByMeldRun(reordered.defs, reordered.slots)
      return usedMeta && exposureTileIds?.size
        ? finalizeExposureMeldStripHighlights(anchored, usedMeta, exposureTileIds, pForStrip)
        : anchored
    }
  }
  const anchored = leftAnchorNaturalsByMeldRun(defs, provisional)
  return usedMeta && exposureTileIds?.size
    ? finalizeExposureMeldStripHighlights(anchored, usedMeta, exposureTileIds, pForStrip)
    : anchored
}

/**
 * WINDS-DRAGONS-style `consec` + card title with two digit-column inks: every ordered pair of
 * **distinct** suits for the two consecutive ranks (e.g. 1B+2C, 1C+2D, …), greedy match first.
 *
 * Scans ALL valid consecutive rank pairs (1,2)–(8,9) (not just the primary greedy's choice) so
 * that a player holding, say, 5B tiles will see both "5B+6x" variants (5B as arm-1) AND "4x+5B"
 * variants (5B as arm-2) when they are tied at the highest joker-inclusive fill score.
 */
function buildConsecOpposingSuitStripVariantRows(
  p: PracticePattern,
  rack: TileInstance[],
  usedMeta: readonly GroupUsedMeta[] | null,
  stripResolved: TileDef[],
): {
  rows: SuggestedStripSlot[][]
  maxFill: number
  /** Parallel to `rows`: the (r, s1, s2) combo each row was built from. */
  combos: Array<{ r: number; s1: Suit; s2: Suit }>
} | null {
  if (!firstOpposingConsecutiveStandInPairFromTitle(p)) return null
  const groups = p.groups
  if (!groups?.length) return null
  const gi = groups.findIndex((g) => g.kind === 'consec')
  if (gi < 0) return null
  const g = groups[gi]!
  if (g.kind !== 'consec') return null
  const spans = groupPreviewIndexSpans(p)
  if (!spans) return null
  const span = spans[gi]
  if (!span) return null
  const [a, b] = span
  const mid = a + g.need1
  const d0 = stripResolved[a]
  const d1 = stripResolved[mid]
  if (d0?.cat !== 'suit' || d1?.cat !== 'suit') return null
  const rLo = d0.rank
  const rHi = d1.rank
  if (rHi !== rLo + 1) return null

  const um = usedMeta ?? []
  const rem = rackAfterPriorGroups(rack, um, gi)
  const jokerCount = rem.filter((t) => t.def.cat === 'joker').length

  // The primary greedy's suit choice — used to sort that combo first.
  const prim = d0.suit
  const sec = d1.suit

  /** Build one variant strip row for the given (r, r+1, s1, s2) combination. */
  const buildRow = (r: number, s1: Suit, s2: Suit): SuggestedStripSlot[] => {
    const strip = [...stripResolved]
    let idx = a
    for (let k = 0; k < g.need1 && idx < b; k++) strip[idx++] = { cat: 'suit', suit: s1, rank: r }
    for (let k = 0; k < g.need2 && idx < b; k++) strip[idx++] = { cat: 'suit', suit: s2, rank: r + 1 }
    // Re-run greedy match with a pinned version of the pattern so highlight ids reflect THIS
    // variant's (suit, rank) assignment rather than the primary greedy match result.
    // We keep kind='consec' (not 'fixed') so that usedMeta entries carry consecPart (0 or 1),
    // which buildPreviewSlotKindsFromGroups requires to place arm-0 and arm-1 tiles correctly.
    const pinnedGroups: PatternGroup[] = groups.map((grp, i) => {
      if (i !== gi) return grp
      return {
        ...g,
        kind: 'consec' as const,
        test: (def: TileDef) =>
          def.cat === 'suit' &&
          ((def.suit === s1 && def.rank === r) || (def.suit === s2 && def.rank === r + 1)),
      }
    })
    const pinnedP: PracticePattern = { ...p, groups: pinnedGroups }
    const variantDetail = greedyPatternMatchDetail(rack, pinnedP)
    const variantBestIds = computeRackPatternHighlightIds(rack, pinnedP, variantDetail)
    return buildSuggestedStripSlotsFromStripDefs(
      p,
      rack,
      variantDetail.usedOrder,
      variantBestIds,
      variantDetail.usedMeta,
      strip,
      true,
    )
  }

  // Evaluate every (r, r+1, s1, s2) combo across all valid ranks and distinct suit pairs.
  // Include rack jokers in the fill score so that e.g. "5B(×2) + joker" at rank 5 correctly
  // competes with or ties "7B(×2) + 8D(×2)" at rank 7 when the joker bridges the gap.
  // n1/n2 are stored separately (natural tiles only) so the sort can prefer combos where
  // the player has multiple tiles toward the same arm (e.g. 7D×2 → arm1 max=2) over combos
  // where tiles are split across both arms 1+1 (e.g. 3B + 4D → arm max=1).
  type Combo = { r: number; s1: Suit; s2: Suit; fill: number; n1: number; n2: number }
  const allCombos: Combo[] = []
  for (let r = 1; r <= 8; r++) {
    for (const s1 of SUITS) {
      for (const s2 of SUITS) {
        if (s1 === s2) continue
        const n1 = Math.min(
          rem.filter((t) => t.def.cat === 'suit' && t.def.suit === s1 && t.def.rank === r).length,
          g.need1,
        )
        const n2 = Math.min(
          rem.filter((t) => t.def.cat === 'suit' && t.def.suit === s2 && t.def.rank === r + 1).length,
          g.need2,
        )
        const jokerFill = Math.min(jokerCount, (g.need1 - n1) + (g.need2 - n2))
        allCombos.push({ r, s1, s2, fill: n1 + n2 + jokerFill, n1, n2 })
      }
    }
  }

  const maxFill = allCombos.reduce((mx, c) => Math.max(mx, c.fill), 0)

  // When no tiles match any combo, fall back to showing the 6 suit-pair variants at the
  // primary greedy rank only — same as the original single-rank behavior.
  const sourceCombos: Combo[] =
    maxFill === 0
      ? SUITS.flatMap((s1) =>
          SUITS.filter((s2) => s2 !== s1).map((s2) => ({ r: rLo, s1, s2, fill: 0, n1: 0, n2: 0 })),
        )
      : allCombos.filter((c) => c.fill === maxFill)

  const bestCombos = sourceCombos.sort((a, b) => {
    // 1. Prefer the combo where the player has the most tiles concentrated in a single arm
    //    (2 naturals in one arm beats 1+1 split across both, even though total naturals tie).
    //    The primary greedy often picks same-suit (excluded here as s1≠s2), so its (rLo,prim,sec)
    //    may not appear in this list — use arm-concentration as the primary sort key instead.
    const aArmMax = Math.max(a.n1, a.n2)
    const bArmMax = Math.max(b.n1, b.n2)
    if (bArmMax !== aArmMax) return bArmMax - aArmMax
    // 2. Then total naturals descending.
    const aNat = a.n1 + a.n2
    const bNat = b.n1 + b.n2
    if (bNat !== aNat) return bNat - aNat
    // 3. Finally put the primary greedy's (rLo, prim, sec) combo first as a stable tiebreaker.
    const ap = a.r === rLo && a.s1 === prim && a.s2 === sec ? 0 : 1
    const bp = b.r === rLo && b.s1 === prim && b.s2 === sec ? 0 : 1
    return ap - bp
  })

  const rows = bestCombos.map(({ r, s1, s2 }) => buildRow(r, s1, s2))
  if (rows.length <= 1) return null
  return {
    rows,
    maxFill,
    combos: bestCombos.map(({ r, s1, s2 }) => ({ r, s1, s2 })),
  }
}

function sameDigitRuns(text: string): Array<{ rank: number; count: number }> {
  const out: Array<{ rank: number; count: number }> = []
  const re = /(\d)\1*/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) != null) {
    const run = m[0]!
    out.push({ rank: Number(run[0]), count: run.length })
  }
  return out
}

function allTitleDigitRanks(p: PracticePattern): number[] {
  const out: number[] = []
  for (const seg of p.titleSegments ?? []) {
    for (const { rank } of sameDigitRuns(seg.t)) {
      if (rank >= 1 && rank <= 9) out.push(rank)
    }
  }
  return out
}

function suitPermuteColorGroupIndexForTitleRun(
  g: Extract<PatternGroup, { kind: 'suit-permute' }>,
  normalizedRank: number,
  count: number,
  candidates?: readonly number[],
): number | null {
  const scan = candidates ?? Array.from({ length: g.colorGroups.length }, (_, i) => i)
  for (const ci of scan) {
    const group = g.colorGroups[ci]!
    if (group.some((sg) => sg.rank === normalizedRank && sg.need >= count)) return ci
  }
  return null
}

function suitPermuteComboKey(base: number, perm: readonly Suit[]): string {
  return `${base}:${perm.join('-')}`
}

function suitPermuteVariantSuffix(base: number, perm: readonly Suit[]): string {
  return `tier::${suitPermuteComboKey(base, perm)}`
}

function scoreSuitPermuteCombo(
  tiles: readonly TileInstance[],
  g: Extract<PatternGroup, { kind: 'suit-permute' }>,
  perm: readonly Suit[],
  base: number,
  exposureTileIds?: ReadonlySet<string>,
): { fill: number; exposureFill: number; maxSlotFill: number; slotSquareFill: number } {
  const drgForSuit = DRAGON_FOR_SUIT
  let fill = 0
  let exposureFill = 0
  let maxSlotFill = 0
  let slotSquareFill = 0

  const addSlotFill = (slotFill: number) => {
    maxSlotFill = Math.max(maxSlotFill, slotFill)
    slotSquareFill += slotFill * slotFill
    fill += slotFill
  }

  for (let ci = 0; ci < g.colorGroups.length; ci++) {
    const s = perm[ci]!
    let slotFill = 0
    for (const sg of g.colorGroups[ci]!) {
      const rank = g.consecRanks ? sg.rank - 1 + base : sg.rank
      const matching = tiles.filter(
        (t) => t.def.cat === 'suit' && t.def.suit === s && t.def.rank === rank,
      )
      const count = Math.min(matching.length, sg.need)
      slotFill += count
      if (exposureTileIds) {
        exposureFill += Math.min(matching.filter((t) => exposureTileIds.has(t.id)).length, sg.need)
      }
    }
    const dc = g.colorGroupDragonCounts?.[ci] ?? 0
    if (dc > 0) {
      const drg = drgForSuit[s]
      const matching = tiles.filter((t) => t.def.cat === 'dragon' && t.def.dragon === drg)
      const count = Math.min(matching.length, dc)
      slotFill += count
      if (exposureTileIds) {
        exposureFill += Math.min(matching.filter((t) => exposureTileIds.has(t.id)).length, dc)
      }
    }
    addSlotFill(slotFill)
  }

  const tdc = g.trailingDragonCount ?? 0
  if (tdc > 0) {
    const trailSuit = SUITS.find((s) => !perm.includes(s))
    if (trailSuit) {
      const drg = drgForSuit[trailSuit]
      const matching = tiles.filter((t) => t.def.cat === 'dragon' && t.def.dragon === drg)
      const count = Math.min(matching.length, tdc)
      if (exposureTileIds) {
        exposureFill += Math.min(matching.filter((t) => exposureTileIds.has(t.id)).length, tdc)
      }
      addSlotFill(count)
    }
  }

  return { fill, exposureFill, maxSlotFill, slotSquareFill }
}

function suitPermuteComboScoreBetter(
  candidate: { fill: number; exposureFill: number; maxSlotFill: number; slotSquareFill: number },
  current: { fill: number; exposureFill: number; maxSlotFill: number; slotSquareFill: number },
  useExposureBias: boolean,
): boolean {
  if (useExposureBias && candidate.exposureFill !== current.exposureFill) {
    return candidate.exposureFill > current.exposureFill
  }
  if (candidate.fill !== current.fill) return candidate.fill > current.fill
  if (candidate.maxSlotFill !== current.maxSlotFill) return candidate.maxSlotFill > current.maxSlotFill
  return candidate.slotSquareFill > current.slotSquareFill
}

/** NMJL cards: soap zero is neutral — adjoining 2s/6s may also be dots when matching. */
function isNmjl2026NeutralZeroPattern(p: PracticePattern): boolean {
  // Applies anywhere an NMJL card prints a zero (Year, Winds-Dragons, S&P). Not mock.
  return (
    (p.id.startsWith('nmjl2026:') || p.id.startsWith('nmjl2025:')) && p.title.includes('0')
  )
}

function isNmjl2026ZeroColorGroup(colorGroup: readonly { rank: number; need: number }[]): boolean {
  const twos = colorGroup.find((sg) => sg.rank === 2)?.need ?? 0
  const sixes = colorGroup.find((sg) => sg.rank === 6)?.need ?? 0
  return twos >= 2 && sixes >= 1
}

function nmjl2026ZeroSuitForGroupTile(groupSuit: Suit, _rank: number, _rankOccurrence: number): Suit {
  // “2026” column: one assigned suit for the run; soap is neutral but 2s/6s still
  // sort in that suit (dots are legal alternates for matching, not the default rack order).
  return groupSuit
}

function cardTitleOrderDefsForSuitPermute(
  p: PracticePattern,
  g: Extract<PatternGroup, { kind: 'suit-permute' }>,
  perm: readonly Suit[],
  base: number,
): TileDef[] | null {
  if (!p.titleSegments?.length) return null
  const digitRanks = allTitleDigitRanks(p).filter((rank) => rank > 0)
  const minRank = digitRanks.length ? Math.min(...digitRanks) : 1
  const out: TileDef[] = []
  const usedColorGroups = new Set<number>()
  const colorGroupByInk = new Map<CardInk, number>()
  let currentColorGroup: number | null = null
  const dragonForSuit = { bam: 'green' as const, dot: 'soap' as const, crak: 'red' as const }

  for (const seg of p.titleSegments) {
    const parts = seg.t.match(/F+|N+|E+|W+|S+|D+|(\d)\1*/g) ?? []
    currentColorGroup = null
    for (const part of parts) {
      if (/^F+$/.test(part)) {
        for (let i = 0; i < part.length; i++) out.push({ cat: 'flower', flower: 1 })
        continue
      }
      if (/^[NEWS]+$/.test(part)) {
        for (const ch of part) out.push({ cat: 'wind', wind: ch as 'N' | 'E' | 'W' | 'S' })
        continue
      }
      if (/^D+$/.test(part)) {
        if (currentColorGroup == null) {
          const mapped = colorGroupByInk.get(seg.ink)
          const candidates = Array.from({ length: g.colorGroups.length }, (_, i) => i)
          let ci =
            mapped != null && (g.colorGroupDragonCounts?.[mapped] ?? 0) >= part.length
              ? mapped
              : candidates.find((i) => !usedColorGroups.has(i) && (g.colorGroupDragonCounts?.[i] ?? 0) >= part.length) ??
                candidates.find((i) => (g.colorGroupDragonCounts?.[i] ?? 0) >= part.length) ??
                null
          if (ci == null) {
            const tdc = g.trailingDragonCount ?? 0
            if (tdc >= part.length) {
              const usedSuits = new Set(perm.slice(0, g.colorGroups.length))
              const remaining =
                (['bam', 'dot', 'crak'] as const).find((s) => !usedSuits.has(s)) ?? 'crak'
              for (let i = 0; i < part.length; i++) {
                out.push({ cat: 'dragon', dragon: dragonForSuit[remaining] })
              }
              continue
            }
            return null
          }
          currentColorGroup = ci
          usedColorGroups.add(ci)
          colorGroupByInk.set(seg.ink, ci)
        }
        const suit = perm[currentColorGroup]
        if (!suit) return null
        for (let i = 0; i < part.length; i++) {
          out.push({ cat: 'dragon', dragon: dragonForSuit[suit] })
        }
        continue
      }
      const runRank = Number(part[0])
      if (runRank === 0) {
        for (let i = 0; i < part.length; i++) out.push({ cat: 'dragon', dragon: 'soap' })
        continue
      }
      const normalizedRank = g.consecRanks ? runRank - minRank + 1 : runRank
      let ci: number | null = null
      if (currentColorGroup != null) {
        const group = g.colorGroups[currentColorGroup]
        if (group?.some((sg) => sg.rank === normalizedRank && sg.need >= part.length)) {
          ci = currentColorGroup
        }
      } else {
        const mapped = colorGroupByInk.get(seg.ink)
        const mappedGroup = mapped != null ? g.colorGroups[mapped] : undefined
        if (mappedGroup?.some((sg) => sg.rank === normalizedRank && sg.need >= part.length)) {
          ci = mapped ?? null
        }
      }
      if (ci == null) {
        const available = Array.from({ length: g.colorGroups.length }, (_, i) => i).filter(
          (i) => !usedColorGroups.has(i),
        )
        ci = suitPermuteColorGroupIndexForTitleRun(g, normalizedRank, part.length, available)
        if (ci == null) {
          ci = suitPermuteColorGroupIndexForTitleRun(g, normalizedRank, part.length)
        }
      }
      if (ci == null) return null
      const groupSuit = perm[ci]
      if (!groupSuit) return null
      currentColorGroup = ci
      usedColorGroups.add(ci)
      colorGroupByInk.set(seg.ink, ci)
      const actualRank = g.consecRanks ? normalizedRank - 1 + base : normalizedRank
      const suit = groupSuit
      for (let i = 0; i < part.length; i++) out.push({ cat: 'suit', suit, rank: actualRank })
    }
  }

  return out.length === p.roughTarget ? out : null
}

function reorderStripSlotsToCardTitleOrder(
  slots: SuggestedStripSlot[],
  stripDefs: readonly TileDef[],
  desiredDefs: readonly TileDef[] | null,
  /** When group-append strip order differs from card line (e.g. consec-2b kongs before run). */
  cardLineFromGroupSlotMap?: readonly number[],
): SuggestedStripSlot[] {
  if (!desiredDefs || desiredDefs.length !== slots.length || stripDefs.length !== slots.length) {
    return slots
  }
  // `buildSuggestedStripSlotsFromStripDefs` may already have applied an inferred card-line map
  // (common for pinned suit-permute year hands). Slots are then already in title order — applying
  // a group-order→title permutation again double-shuffles (e.g. Year #2 → soap/R first).
  if (desiredDefs.every((d, i) => tileDefsEqual(d, slots[i]!.displayDef))) {
    return slots
  }
  // `slots` follow card/display order (post `maybePermuteAssignmentToCardLine`); `stripDefs` are
  // usually still in group-append order. Match against card-ordered defs so indices align with `slots`.
  const stripForMatch = reorderTileDefsByCardLineFromGroupMap(stripDefs, cardLineFromGroupSlotMap)
  const used = new Set<number>()
  const order: number[] = []
  for (const d of desiredDefs) {
    const idx = stripForMatch.findIndex(
      (candidate, i) => !used.has(i) && tileDefsEqual(candidate, d),
    )
    if (idx < 0) return slots
    used.add(idx)
    order.push(idx)
  }
  return order.length === slots.length ? order.map((idx) => slots[idx]!) : slots
}

function suitPermuteTitleOrderDefsFromResolvedStrip(
  p: PracticePattern,
  stripDefs: readonly TileDef[],
): TileDef[] | null {
  const groups = p.groups
  if (!groups?.length) return null
  const gi = groups.findIndex((g) => g.kind === 'suit-permute')
  if (gi < 0) return null
  const g = groups[gi]!
  if (g.kind !== 'suit-permute') return null
  const span = groupPreviewIndexSpans(p)?.[gi]
  if (!span) return null
  const [a] = span
  const perm: Suit[] = []
  let base: number | null = null
  let idx = a
  for (let ci = 0; ci < g.colorGroups.length; ci++) {
    const firstRankGroup = g.colorGroups[ci]?.find((sg) => sg.need > 0)
    if (!firstRankGroup) return null
    const def = stripDefs[idx]
    if (def?.cat !== 'suit') return null
    perm.push(def.suit)
    if (base == null) base = g.consecRanks ? def.rank - firstRankGroup.rank + 1 : 1
    idx += g.colorGroups[ci]!.reduce((sum, sg) => sum + sg.need, 0)
    idx += g.colorGroupDragonCounts?.[ci] ?? 0
  }
  if (base == null) return null
  return cardTitleOrderDefsForSuitPermute(p, g, perm, base)
}

/**
 * `shared-rank-suits` lines (e.g. Like #s #3): title digit columns follow card left-to-right order,
 * but `patternLinePreviewDefs` uses ink stand-in suits (green→bam, red→crak, …) that may not match
 * the greedy suit permutation. Rebuild the SRS span using resolved perm suits in title column order.
 */
function sharedRankSuitsTitleOrderDefsFromResolvedStrip(
  p: PracticePattern,
  stripDefs: readonly TileDef[],
): TileDef[] | null {
  const groups = p.groups
  if (!groups?.length || !p.titleSegments?.length) return null
  const srsGi = groups.findIndex((g) => g.kind === 'shared-rank-suits')
  if (srsGi < 0) return null
  const g = groups[srsGi]!
  if (g.kind !== 'shared-rank-suits') return null
  const span = groupPreviewIndexSpans(p)?.[srsGi]
  if (!span) return null
  const [srsA, srsB] = span
  if (stripDefs.length < srsB || p.roughTarget !== stripDefs.length) return null

  const titleRuns: number[] = []
  for (const seg of p.titleSegments) {
    for (const part of seg.t.match(/F+|N+|E+|W+|S+|D+|(\d)\1*/g) ?? []) {
      if (/^\d/.test(part)) titleRuns.push(part.length)
    }
  }
  if (titleRuns.length !== g.needs.length) return null
  if (!titleRuns.every((len, i) => len === g.needs[i]!)) return null

  const perm: Suit[] = []
  let rank = 1
  let src = srsA
  for (let col = 0; col < g.needs.length; col++) {
    const def = stripDefs[src]
    if (def?.cat !== 'suit') return null
    rank = def.rank
    perm.push(def.suit)
    src += g.needs[col]!
  }

  const out = [...stripDefs]
  let dst = srsA
  for (let col = 0; col < g.needs.length; col++) {
    const suit = perm[col]!
    const need = g.needs[col]!
    for (let i = 0; i < need; i++) {
      out[dst++] = { cat: 'suit', suit, rank }
    }
  }
  if (dst !== srsB) return null
  return out
}

/**
 * `suit-locked-consec` / `suit-locked-consec-multi`: card title digits are stand-ins (11…66 in bam);
 * greedy match picks any consecutive run in one suit. Rebuild the group span with resolved suit +
 * start rank so rack sort / card-line fill target the tiles you actually hold (e.g. d5 d5 d7 d7 d8 d8).
 */
function suitLockedConsecTitleOrderDefsFromResolvedStrip(
  p: PracticePattern,
  stripDefs: readonly TileDef[],
): TileDef[] | null {
  const groups = p.groups
  if (!groups?.length || !p.titleSegments?.length) return null

  const gi = groups.findIndex((g) => g.kind === 'suit-locked-consec' || g.kind === 'suit-locked-consec-multi')
  if (gi < 0) return null
  const g = groups[gi]!
  if (g.kind !== 'suit-locked-consec' && g.kind !== 'suit-locked-consec-multi') return null

  const span = groupPreviewIndexSpans(p)?.[gi]
  if (!span) return null
  const [srsA, srsB] = span
  if (stripDefs.length < srsB) return null

  const first = stripDefs[srsA]
  if (first?.cat !== 'suit') return null
  const suit = first.suit
  const startRank = first.rank

  const titleDigitRuns: number[] = []
  for (const seg of p.titleSegments) {
    for (const part of seg.t.match(/F+|N+|E+|W+|S+|D+|(\d)\1*/g) ?? []) {
      if (/^\d/.test(part)) titleDigitRuns.push(part.length)
    }
  }

  const out = [...stripDefs]
  let dst = srsA

  if (g.kind === 'suit-locked-consec') {
    if (titleDigitRuns.length !== g.numGroups) return null
    for (let i = 0; i < g.numGroups; i++) {
      const rank = startRank + i
      for (let k = 0; k < g.rankCount; k++) {
        out[dst++] = { cat: 'suit', suit, rank }
      }
    }
    if (g.dragonCount > 0) {
      const dragonForSuit = { bam: 'green' as const, dot: 'soap' as const, crak: 'red' as const }
      const drg = dragonForSuit[suit]
      for (let k = 0; k < g.dragonCount; k++) {
        out[dst++] = { cat: 'dragon', dragon: drg }
      }
    }
  } else {
    if (titleDigitRuns.length !== g.needs.length) return null
    for (let i = 0; i < g.needs.length; i++) {
      const rank = startRank + i
      const need = g.needs[i]!
      for (let k = 0; k < need; k++) {
        out[dst++] = { cat: 'suit', suit, rank }
      }
    }
  }

  return dst === srsB ? out : null
}

/**
 * `suit-permute` groups: one strip row per ordered suit assignment across color slots, greedy first.
 * e.g. FF 2222 44 66 8888 → 6 rows (all 3! orderings of bam/dot/crak to red/navy/green slots).
 */
function buildSuitPermuteStripVariantRows(
  p: PracticePattern,
  rack: TileInstance[],
  _usedOrder: readonly string[],
  _bestIdsForAssignment: ReadonlySet<string>,
  usedMeta: readonly GroupUsedMeta[] | null,
  stripResolved: TileDef[],
  /** Must match {@link resolveStripTargetDefsForGreedyMatch}: same exposure-first tie-break so
   * strip rows / discard-need defs stay aligned with greedy `usedOrder` after claims. */
  exposureTileIds?: ReadonlySet<string>,
): { rows: SuggestedStripSlot[][]; maxFill: number; combos: Array<{ perm: Suit[]; base: number }> } | null {
  const groups = p.groups
  if (!groups?.length) return null
  const gi = groups.findIndex((g) => g.kind === 'suit-permute')
  if (gi < 0) return null
  const g = groups[gi]!
  if (g.kind !== 'suit-permute') return null
  const nSlots = g.colorGroups.length
  if (nSlots < 2) return null
  const spans = groupPreviewIndexSpans(p)
  if (!spans) return null
  const span = spans[gi]
  if (!span) return null
  const [a, b] = span

  const um = usedMeta ?? []
  const rem = rackAfterPriorGroups(rack, um, gi)
  const perms = suitPermutations(nSlots)

  // Collect suits already committed by suit-locked groups (read from the resolved strip).
  const lockedSuitsForVariants = new Set<Suit>()
  const dragonToSuit: Record<string, Suit> = { green: 'bam', soap: 'dot', red: 'crak' }
  for (let gi2 = 0; gi2 < groups.length; gi2++) {
    const g2 = groups[gi2]
    if (!g2 || g2.kind !== 'suit-locked') continue
    const span2 = spans[gi2]
    if (!span2) continue
    const [a2, b2] = span2
    for (let k = a2; k < b2; k++) {
      const def = stripResolved[k]
      if (def?.cat === 'suit') { lockedSuitsForVariants.add(def.suit); break }
      if (def?.cat === 'dragon') { const s = dragonToSuit[def.dragon]; if (s) lockedSuitsForVariants.add(s); break }
    }
  }

  const drgForSuitVar = { bam: 'green' as const, dot: 'soap' as const, crak: 'red' as const }
  const tdc = g.trailingDragonCount ?? 0

  // When consecRanks, also iterate over valid base ranks; otherwise base is always 1
  // (actualRank = sg.rank - 1 + base; when base=1 and not consecRanks, actualRank = sg.rank).
  const maxRankOff = g.consecRanks
    ? Math.max(...g.colorGroups.flatMap((cg) => cg.map((sg) => sg.rank))) - 1
    : 0
  const searchBases = g.consecRanks
    ? Array.from({ length: 9 - maxRankOff }, (_, i) => i + 1)
    : [1]

  // Build all (perm, base) combos, compute fill for each, track the best.
  type Combo = {
    perm: Suit[]
    base: number
    fill: number
    exposureFill: number
    maxSlotFill: number
    slotSquareFill: number
  }
  const combos: Combo[] = []
  let bestScore = { fill: -1, exposureFill: -1, maxSlotFill: -1, slotSquareFill: -1 }
  let bestComboIdx = -1
  const useExposureBias = exposureTileIds && exposureTileIds.size > 0

  for (const base of searchBases) {
    for (const perm of perms) {
      if (lockedSuitsForVariants.size > 0 && perm.some((s) => lockedSuitsForVariants.has(s))) {
        continue
      }
      const score = scoreSuitPermuteCombo(rem, g, perm, base, exposureTileIds)
      combos.push({ perm: [...perm], base, ...score })
      if (bestComboIdx < 0 || suitPermuteComboScoreBetter(score, bestScore, !!useExposureBias)) {
        bestScore = score
        bestComboIdx = combos.length - 1
      }
    }
  }

  if (bestComboIdx < 0) return null
  const maxFill = bestScore.fill

  const primary = combos[bestComboIdx]!
  const sorted =
    maxFill > 0
      ? combos
          .filter((c) =>
            useExposureBias
              ? c.exposureFill === primary.exposureFill && c.fill === primary.fill
              : c.fill === primary.fill,
          )
          .sort((a, b) => {
            const ap = a.base === primary.base && a.perm.join('-') === primary.perm.join('-') ? 0 : 1
            const bp = b.base === primary.base && b.perm.join('-') === primary.perm.join('-') ? 0 : 1
            if (ap !== bp) return ap - bp
            return a.base !== b.base ? a.base - b.base : a.perm.join('').localeCompare(b.perm.join(''))
          })
      : [primary]

  const rows: SuggestedStripSlot[][] = sorted.map(({ perm, base }) => {
    const strip = [...stripResolved]
    let idx = a
    for (let ci = 0; ci < nSlots && idx < b; ci++) {
      const s = perm[ci]!
      for (const sg of g.colorGroups[ci]!) {
        const rank = sg.rank - 1 + base
        for (let k = 0; k < sg.need && idx < b; k++) {
          strip[idx++] = { cat: 'suit', suit: s, rank }
        }
      }
      const dc = g.colorGroupDragonCounts?.[ci] ?? 0
      if (dc > 0) {
        const drg = drgForSuitVar[s]
        for (let k = 0; k < dc && idx < b; k++) strip[idx++] = { cat: 'dragon', dragon: drg }
      }
    }
    if (tdc > 0) {
      const remaining = SUITS.find((s) => !perm.includes(s))
      if (remaining) {
        const drg = drgForSuitVar[remaining]
        for (let k = 0; k < tdc && idx < b; k++) strip[idx++] = { cat: 'dragon', dragon: drg }
      }
    }
    const comboKey = suitPermuteComboKey(base, perm)
    const pinnedP = buildPinnedPatternFromComboStr(p, comboKey) ?? p
    const cardLineMap = resolveCardLineFromGroupSlotMap(p)
    const variantDetail = greedyPatternMatchDetail(
      rack,
      pinnedP,
      exposureTileIds?.size ? { exposureTileIds } : undefined,
    )
    const rackIdSet = new Set(rack.map((t) => t.id))
    const variantBestIds = new Set(variantDetail.usedOrder.filter((id) => rackIdSet.has(id)))
    if (variantBestIds.size === 0) {
      for (const t of rack) {
        if (pinnedP.matches(t.def)) variantBestIds.add(t.id)
      }
    }
    const slots = buildSuggestedStripSlotsFromStripDefs(
      pinnedP,
      rack,
      variantDetail.usedOrder,
      variantBestIds,
      variantDetail.usedMeta,
      strip,
      true,
      true,
      cardLineMap,
      exposureTileIds,
    )
    return reorderStripSlotsToCardTitleOrder(
      slots,
      strip,
      cardTitleOrderDefsForSuitPermute(p, g, perm, base),
      cardLineMap,
    )
  })
  return rows.length > 0
    ? { rows, maxFill, combos: sorted.map(({ perm, base }) => ({ perm, base })) }
    : null
}

/**
 * Exact (key, need) assignment for claim melds — same rule as eastExposurePatternFit’s
 * meld-to-slot check. Partial fills (pung on a kong) are rejected.
 */
function claimMeldsExactMatchSlots(
  melds: ReadonlyArray<{ tiles: TileInstance[] }>,
  slots: readonly { key: string; need: number }[],
): boolean {
  const sigs: { key: string; count: number }[] = []
  for (const meld of melds) {
    const naturals = meld.tiles.filter((t) => t.def.cat !== 'joker')
    if (naturals.length === 0) return false
    const anchor = naturals[0]!.def
    const key = fullDefKey(anchor)
    // Flower keys differ between helpers (`f` vs `flower`); normalize to eastExposure’s `flower`.
    const normKey =
      anchor.cat === 'flower'
        ? 'flower'
        : key
    if (
      !naturals.every((t) => {
        if (anchor.cat === 'flower') return t.def.cat === 'flower'
        return fullDefKey(t.def) === key
      })
    ) {
      return false
    }
    sigs.push({ key: normKey, count: meld.tiles.length })
  }
  if (sigs.length > slots.length) return false
  const used = new Array(slots.length).fill(false)
  const dfs = (i: number): boolean => {
    if (i >= sigs.length) return true
    const s = sigs[i]!
    for (let j = 0; j < slots.length; j++) {
      if (used[j]) continue
      const sl = slots[j]!
      const slKey = sl.key === 'f' ? 'flower' : sl.key
      if (s.key === slKey && s.count === sl.need) {
        used[j] = true
        if (dfs(i + 1)) return true
        used[j] = false
      }
    }
    return false
  }
  return dfs(0)
}

/**
 * First (perm, base) for a suit-permute group where every claim meld lands on an exact-size slot.
 * Avoids greedy partial fills that paint a pung onto a kong of the same rank.
 */
function firstSuitPermutePlanFittingClaimMelds(
  g: Extract<PatternGroup, { kind: 'suit-permute' }>,
  claimMelds: ReadonlyArray<{ tiles: TileInstance[] }>,
): { perm: Suit[]; base: number } | null {
  if (claimMelds.length === 0) return null
  const n = g.colorGroups.length
  const maxRankOff =
    Math.max(...g.colorGroups.flatMap((cg) => cg.map((sg) => sg.rank))) - 1
  const searchBases = g.consecRanks
    ? Array.from({ length: 9 - maxRankOff }, (_, i) => i + 1)
    : [1]
  for (const base of searchBases) {
    for (const perm of suitPermutations(n)) {
      const slots: { key: string; need: number }[] = []
      for (let ci = 0; ci < n; ci++) {
        const s = perm[ci]!
        for (const sg of g.colorGroups[ci]!) {
          const rank = g.consecRanks ? sg.rank - 1 + base : sg.rank
          slots.push({ key: `s:${s}:${rank}`, need: sg.need })
        }
        const dc = g.colorGroupDragonCounts?.[ci] ?? 0
        if (dc > 0) slots.push({ key: `d:${DRAGON_FOR_SUIT[s]}`, need: dc })
      }
      const tdc = g.trailingDragonCount ?? 0
      if (tdc > 0) {
        const trailSuit = SUITS.find((s) => !perm.includes(s))
        if (trailSuit) slots.push({ key: `d:${DRAGON_FOR_SUIT[trailSuit]}`, need: tdc })
      }
      if (claimMeldsExactMatchSlots(claimMelds, slots)) {
        return { perm: [...perm], base }
      }
    }
  }
  return null
}

/**
 * First (perm, rank) for a shared-rank-suits group where every *suit* claim meld lands on an
 * exact-size slot. Ignores flower/dragon/wind exposures (other groups) so they don't block the
 * suit↔size assignment. Avoids greedy partial fills that paint a pung onto a kong of the same
 * like-number (e.g. Like #s `FFF 1111 111 1111` with an exposed pung of 1-bams).
 */
function firstSharedRankSuitsPlanFittingClaimMelds(
  g: Extract<PatternGroup, { kind: 'shared-rank-suits' }>,
  claimMelds: ReadonlyArray<{ tiles: TileInstance[] }>,
): { perm: Suit[]; rank: number } | null {
  const n = g.needs.length
  if (n < 2 || n > 3) return null
  const suitMelds = claimMelds.filter((m) => {
    const naturals = m.tiles.filter((t) => t.def.cat !== 'joker')
    if (naturals.length === 0) return false
    return naturals.every((t) => t.def.cat === 'suit' && g.test(t.def))
  })
  if (suitMelds.length === 0) return null
  for (let rank = 1; rank <= 9; rank++) {
    for (const perm of suitPermutations(n)) {
      let ok = true
      const slots: { key: string; need: number }[] = []
      for (let i = 0; i < n; i++) {
        const s = perm[i]!
        const def: TileDef = { cat: 'suit', suit: s, rank }
        if (!g.test(def)) {
          ok = false
          break
        }
        slots.push({ key: `s:${s}:${rank}`, need: g.needs[i]! })
      }
      if (!ok) continue
      if (claimMeldsExactMatchSlots(suitMelds, slots)) {
        return { perm: [...perm], rank }
      }
    }
  }
  return null
}

/** Write a concrete (perm, rank) into the shared-rank-suits group span only. */
function applySharedRankSuitsPlanToPreviewSpan(
  preview: readonly TileDef[],
  p: PracticePattern,
  srsGi: number,
  g: Extract<PatternGroup, { kind: 'shared-rank-suits' }>,
  plan: { perm: Suit[]; rank: number },
): TileDef[] | null {
  const spans = groupPreviewIndexSpans(p)
  const span = spans?.[srsGi]
  if (!span || preview.length < span[1]) return null
  const out = [...preview]
  const [a, b] = span
  let idx = a
  for (let col = 0; col < g.needs.length && idx < b; col++) {
    const s = plan.perm[col]!
    const need = g.needs[col]!
    for (let k = 0; k < need && idx < b; k++) {
      out[idx++] = { cat: 'suit', suit: s, rank: plan.rank }
    }
  }
  if (idx !== b) return null
  return out
}

/**
 * Write a concrete (perm, base) into the suit-permute group span only — leaves neighboring
 * groups (e.g. `dragon-meld-permute` DDD DDD DDDD) as printed preview stand-ins.
 */
function applySuitPermutePlanToPreviewSpan(
  preview: readonly TileDef[],
  p: PracticePattern,
  spGi: number,
  g: Extract<PatternGroup, { kind: 'suit-permute' }>,
  plan: { perm: Suit[]; base: number },
): TileDef[] | null {
  const spans = groupPreviewIndexSpans(p)
  const span = spans?.[spGi]
  if (!span || preview.length < span[1]) return null
  const out = [...preview]
  const [a, b] = span
  let idx = a
  for (let ci = 0; ci < g.colorGroups.length && idx < b; ci++) {
    const s = plan.perm[ci]!
    for (const sg of g.colorGroups[ci]!) {
      const rank = g.consecRanks ? sg.rank - 1 + plan.base : sg.rank
      for (let k = 0; k < sg.need && idx < b; k++) {
        out[idx++] = { cat: 'suit', suit: s, rank }
      }
    }
    const dc = g.colorGroupDragonCounts?.[ci] ?? 0
    for (let k = 0; k < dc && idx < b; k++) {
      out[idx++] = { cat: 'dragon', dragon: DRAGON_FOR_SUIT[s] }
    }
  }
  const tdc = g.trailingDragonCount ?? 0
  if (tdc > 0) {
    const trailSuit = SUITS.find((s) => !plan.perm.includes(s))
    if (trailSuit) {
      for (let k = 0; k < tdc && idx < b; k++) {
        out[idx++] = { cat: 'dragon', dragon: DRAGON_FOR_SUIT[trailSuit] }
      }
    }
  }
  return out
}

/**
 * Concrete card-line tile defs for a pattern given only claim melds (bot possible-hands strip).
 * Shifts consecRanks / suit assignments so relative lines (e.g. Runs `11 22 333`) show the ranks
 * that actually fit the exposures (e.g. `77 88 999` for a pung of 9s), then falls back to the
 * printed preview when nothing can be resolved.
 *
 * Suit-permute and shared-rank-suits plans require **exact** meld sizes (pung≠kong) so a pung
 * of 7s / 1-bams cannot paint a kong of the same rank just because greedy fill scored a partial
 * match.
 *
 * Patterns with `dragon-meld-permute` (W&D #2) keep the printed distinct dragon melds — never
 * rebuild the whole title through suit-permute ink (that collapses every DDD to one type).
 */
export function resolveCardLineDefsForClaimMelds(
  p: PracticePattern,
  claimMelds: ReadonlyArray<{ tiles: TileInstance[] }>,
): TileDef[] {
  const preview = patternLinePreviewSlots(p).map((s) => s.def)
  if (claimMelds.length === 0 || preview.length === 0) return preview

  const hasDragonMeldPermute =
    p.groups?.some((g) => g.kind === 'dragon-meld-permute') ?? false

  const spGi = p.groups?.findIndex((g) => g.kind === 'suit-permute') ?? -1
  if (spGi >= 0) {
    const g = p.groups![spGi]! as Extract<PatternGroup, { kind: 'suit-permute' }>
    const plan = firstSuitPermutePlanFittingClaimMelds(g, claimMelds)
    if (plan) {
      // Full title rebuild is fine for pure suit-permute lines (Runs). When a separate
      // dragon-meld-permute group follows (W&D #2), only patch the suit span.
      if (!hasDragonMeldPermute) {
        const title = cardTitleOrderDefsForSuitPermute(p, g, plan.perm, plan.base)
        if (title && title.length === preview.length) return title
      }
      const patched = applySuitPermutePlanToPreviewSpan(preview, p, spGi, g, plan)
      if (patched) return patched
    }
  }

  const srsGi = p.groups?.findIndex((g) => g.kind === 'shared-rank-suits') ?? -1
  if (srsGi >= 0) {
    const g = p.groups![srsGi]! as Extract<PatternGroup, { kind: 'shared-rank-suits' }>
    const plan = firstSharedRankSuitsPlanFittingClaimMelds(g, claimMelds)
    if (plan) {
      const patched = applySharedRankSuitsPlanToPreviewSpan(preview, p, srsGi, g, plan)
      if (patched) return patched
    }
  }

  // Keep printed G/R/Soap melds; placeExposureMeldsOnCardLine boxes the exposed dragon run.
  if (hasDragonMeldPermute) return preview

  const rack = tileInstancesWithClaimMeldJokersResolved([], claimMelds)
  if (rack.length === 0) return preview

  const exposureTileIds = new Set(rack.map((t) => t.id))
  const { usedMeta } = greedyPatternMatchDetail(rack, p, { exposureTileIds })
  const resolved = resolveStripTargetDefsForGreedyMatch(p, rack, usedMeta, exposureTileIds)

  const titleOrder =
    suitPermuteTitleOrderDefsFromResolvedStrip(p, resolved) ??
    sharedRankSuitsTitleOrderDefsFromResolvedStrip(p, resolved) ??
    suitLockedConsecTitleOrderDefsFromResolvedStrip(p, resolved)

  if (titleOrder && titleOrder.length === preview.length) return titleOrder
  if (resolved.length === preview.length) return resolved
  return preview
}

/**
 * Build the single strip-slot row for a consecRanks suit-permute pattern with the suit permutation
 * and base rank pinned to a specific tier combo. Used by the suggested-hands panel to render
 * secondary-tier entries (e.g. "10 away" variant) with the correct suit/rank assignment.
 * @param rackForMatch — tiles with exposure jokers expanded to their stand-in defs for the matcher.
 * @param rackForDisplay — optional; same ids, real joker defs for strip faces (defaults to `rackForMatch`).
 */
export function buildConsecRanksTierStripRow(
  p: PracticePattern,
  rackForMatch: TileInstance[],
  tierPerm: Suit[],
  tierBase: number,
  rackForDisplay: TileInstance[] = rackForMatch,
): SuggestedStripSlot[] | null {
  const gi = p.groups?.findIndex((g) => g.kind === 'suit-permute') ?? -1
  if (gi < 0) return null
  const spg = p.groups![gi] as Extract<PatternGroup, { kind: 'suit-permute' }>
  if (!spg.consecRanks) return null

  // Build a pinned PracticePattern replacing the suit-permute group with fixed groups
  // so the greedy matcher uses only tiles that match the specific (perm, base) combo.
  // This gives correct usedOrder / usedMeta for highlighting tiles in the tier row.
  const drgForSuitPin = { bam: 'green' as const, dot: 'soap' as const, crak: 'red' as const }
  const trailSuit = (['bam', 'dot', 'crak'] as Suit[]).find((s) => !tierPerm.includes(s))!
  const pinnedGroups: PatternGroup[] = [
    ...(p.groups!.slice(0, gi) as PatternGroup[]),
    ...spg.colorGroups.flatMap((cgSlot, ci): PatternGroup[] => {
      const s = tierPerm[ci]!
      const suitGroups = cgSlot.map((sg): PatternGroup => {
        const rank = sg.rank - 1 + tierBase
        return {
          kind: 'fixed',
          need: sg.need,
          test: (d) => d.cat === 'suit' && d.suit === s && d.rank === rank,
        }
      })
      // Per-color-group dragons sit right after that slot's suit tiles in `strip`; mirror them in
      // the pinned groups so the matcher consumes the held dragons and strip geometry stays aligned.
      const dc = spg.colorGroupDragonCounts?.[ci] ?? 0
      const dragonGroups: PatternGroup[] =
        dc > 0
          ? [{ kind: 'fixed', need: dc, test: (d: TileDef) => d.cat === 'dragon' && d.dragon === drgForSuitPin[s] }]
          : []
      return [...suitGroups, ...dragonGroups]
    }),
    ...(spg.trailingDragonCount
      ? [{ kind: 'fixed' as const, need: spg.trailingDragonCount, test: (d: TileDef) => d.cat === 'dragon' && d.dragon === drgForSuitPin[trailSuit] }]
      : []),
    ...(p.groups!.slice(gi + 1) as PatternGroup[]),
  ]
  const pinnedP: PracticePattern = { ...p, groups: pinnedGroups }
  const cardLineMap = resolveCardLineFromGroupSlotMap(p)
  const tierDetail = greedyPatternMatchDetail(rackForMatch, pinnedP)
  const rackIdSet = new Set(rackForMatch.map((t) => t.id))
  const tierBestIds = new Set(tierDetail.usedOrder.filter((id) => rackIdSet.has(id)))
  if (tierBestIds.size === 0) {
    for (const t of rackForMatch) {
      if (p.matches(t.def)) tierBestIds.add(t.id)
    }
  }

  // Build the overridden strip: start from the primary pattern's resolved strip and
  // overwrite the suit-permute span with concrete suit/rank values for this tier.
  const primaryUsedMeta = greedyPatternMatchDetail(rackForMatch, p).usedMeta ?? []
  const primaryStrip = resolveStripTargetDefsForGreedyMatch(p, rackForMatch, primaryUsedMeta)
  const span = groupPreviewIndexSpans(p)?.[gi]
  const strip = [...primaryStrip]
  if (span) {
    const [a, b] = span
    const nSlots = spg.colorGroups.length
    let idx = a
    for (let ci = 0; ci < nSlots && idx < b; ci++) {
      const s = tierPerm[ci]!
      for (const sg of spg.colorGroups[ci]!) {
        const rank = sg.rank - 1 + tierBase
        for (let k = 0; k < sg.need && idx < b; k++) strip[idx++] = { cat: 'suit', suit: s, rank }
      }
      const dc = spg.colorGroupDragonCounts?.[ci] ?? 0
      const drg = drgForSuitPin[s]
      for (let k = 0; k < dc && idx < b; k++) strip[idx++] = { cat: 'dragon', dragon: drg }
    }
    if (spg.trailingDragonCount) {
      const trailDrg = drgForSuitPin[trailSuit]
      for (let k = 0; k < spg.trailingDragonCount && idx < b; k++) strip[idx++] = { cat: 'dragon', dragon: trailDrg }
    }
  }

  // Pass pinnedP — not p — because tierDetail.usedMeta has groupIdx values referencing
  // pinnedP's groups (which split the suit-permute group into multiple fixed groups).
  // Using p would map e.g. a "2222 in bam" used tile (groupIdx=2 in pinnedP) to the
  // "DDD" dragon group in p, where it can't be placed and would silently fail to highlight.
  const slots = buildSuggestedStripSlotsFromStripDefs(
    pinnedP,
    rackForDisplay,
    tierDetail.usedOrder,
    tierBestIds,
    tierDetail.usedMeta ?? [],
    strip,
    true,
    true,
    cardLineMap,
  )
  return reorderStripSlotsToCardTitleOrder(
    slots,
    strip,
    cardTitleOrderDefsForSuitPermute(p, spg, tierPerm, tierBase),
    cardLineMap,
  )
}

/**
 * One or more full strip rows: a single row normally; for opposing `consec` suit columns or
 * `suit-permute` color-slot hands, one row per valid suit assignment, greedy match first.
 */
export type SuggestedStripRowsResult = {
  rows: SuggestedStripSlot[][]
  /** Per-row focus-key suffix for stacked opposing-consec rows (parallel to `rows`).
   * Format: `oc::<r>-<s1>-<s2>`. Empty array when the stack isn't opposing-consec or rows.length <= 1. */
  ocVariantSuffixes: string[]
  /** Combined "all" suffix for opposing-consec stacks: `ocall::<r1>-<s1a>-<s1b>|...`. Empty otherwise. */
  ocAllSuffix: string
}

export function buildSuggestedStripSlotRowsWithVariants(
  p: PracticePattern,
  rack: TileInstance[],
  usedOrder: readonly string[],
  bestIdsForAssignment: ReadonlySet<string>,
  usedMeta: readonly GroupUsedMeta[] | null,
  exposureTileIds?: ReadonlySet<string>,
  exposureMelds?: readonly ExposureMeld[],
): SuggestedStripRowsResult {
  const um = usedMeta ?? []
  const finalizeRows = (rows: SuggestedStripSlot[][]): SuggestedStripSlot[][] => {
    let out = rows
    if (usedMeta && exposureTileIds?.size) {
      out = out.map((row) => finalizeExposureMeldStripHighlights(row, usedMeta, exposureTileIds, p))
    }
    if (exposureMelds?.length) {
      out = out.map((row) =>
        realignSuggestedStripToClaimMelds(
          row,
          p,
          exposureMelds,
          rack,
          usedOrder,
          bestIdsForAssignment,
          usedMeta,
          exposureTileIds,
        ),
      )
    }
    return out
  }
  const stripResolved = resolveStripTargetDefsForGreedyMatch(p, rack, um, exposureTileIds)
  const altConsec = buildConsecOpposingSuitStripVariantRows(
    p,
    rack,
    usedMeta,
    stripResolved,
  )
  if (altConsec) {
    // When the player holds real tiles toward the consec group, show all tied suit-pair variants
    // so they can see every combination they're closest to (different suits = genuinely different tiles).
    // When maxFill is 0 the player has nothing for any variant — all strips look identical, show one.
    if (altConsec.maxFill > 0) {
      const suffixes = altConsec.combos.map(({ r, s1, s2 }) => `oc::${r}-${s1}-${s2}`)
      return {
        rows: finalizeRows(altConsec.rows),
        ocVariantSuffixes: suffixes,
        ocAllSuffix:
          altConsec.combos.length > 0
            ? `ocall::${altConsec.combos.map(({ r, s1, s2 }) => `${r}-${s1}-${s2}`).join('|')}`
            : '',
      }
    }
    return { rows: finalizeRows([altConsec.rows[0]!]), ocVariantSuffixes: [], ocAllSuffix: '' }
  }
  const altPerm = buildSuitPermuteStripVariantRows(
    p,
    rack,
    usedOrder,
    bestIdsForAssignment,
    usedMeta,
    stripResolved,
    exposureTileIds,
  )
  if (altPerm) {
    if (altPerm.rows.length > 1) {
      const suffixes = altPerm.combos.map(({ base, perm }) => suitPermuteVariantSuffix(base, perm))
      return {
        rows: finalizeRows(altPerm.rows),
        ocVariantSuffixes: suffixes,
        ocAllSuffix:
          altPerm.combos.length > 0
            ? `tier::${altPerm.combos.map(({ base, perm }) => suitPermuteComboKey(base, perm)).join('|')}`
            : '',
      }
    }
    return { rows: finalizeRows(altPerm.rows), ocVariantSuffixes: [], ocAllSuffix: '' }
  }
  return {
    rows: finalizeRows([
      buildSuggestedStripSlotsFromStripDefs(
        p,
        rack,
        usedOrder,
        bestIdsForAssignment,
        um,
        stripResolved,
        true,
        p.skipStripTitleReorder === true,
        undefined,
        exposureTileIds,
      ),
    ]),
    ocVariantSuffixes: [],
    ocAllSuffix: '',
  }
}

export function buildSuggestedStripSlotRows(
  p: PracticePattern,
  rack: TileInstance[],
  usedOrder: readonly string[],
  bestIdsForAssignment: ReadonlySet<string>,
  usedMeta: readonly GroupUsedMeta[] | null,
  exposureTileIds?: ReadonlySet<string>,
  exposureMelds?: readonly ExposureMeld[],
): SuggestedStripSlot[][] {
  return buildSuggestedStripSlotRowsWithVariants(
    p,
    rack,
    usedOrder,
    bestIdsForAssignment,
    usedMeta,
    exposureTileIds,
    exposureMelds,
  ).rows
}

export function buildSuggestedStripSlots(
  p: PracticePattern,
  rack: TileInstance[],
  usedOrder: readonly string[],
  bestIdsForAssignment: ReadonlySet<string>,
  usedMeta: readonly GroupUsedMeta[] | null,
  exposureTileIds?: ReadonlySet<string>,
  exposureMelds?: readonly ExposureMeld[],
): SuggestedStripSlot[] {
  const rows = buildSuggestedStripSlotRows(
    p,
    rack,
    usedOrder,
    bestIdsForAssignment,
    usedMeta,
    exposureTileIds,
    exposureMelds,
  )
  return rows[0] ?? []
}

/**
 * Per preview-tile index: matches rack “associated tiles” (`bestIds`).
 * Pass 1: each card-order preview def takes the earliest unused `usedOrder` tile with the same def.
 * Pass 2: remaining preview naturals that allow jokers take earliest unused joker from the same
 * pool (still in `bestIds`), so strip highlights match rack jokers standing in for those melds.
 */
export function previewSlotSuggestKinds(
  p: PracticePattern,
  rackForPattern: TileInstance[],
  usedOrder: readonly string[],
  bestIds: ReadonlySet<string>,
  usedMetaArg?: readonly GroupUsedMeta[] | null,
): PreviewSlotSuggestKind[] {
  return computePreviewStripAssignment(p, rackForPattern, usedOrder, bestIds, usedMetaArg).kinds
}

/**
 * Picks which strip row(s) match the current focus. Multi-combo "all" keys use every row; a single
 * opposing-consec variant matches `patternId::oc::…`.
 */
function pickStripRowsForFocusKey(
  patternId: string,
  focusKey: string,
  isMulti: boolean,
  res: SuggestedStripRowsResult,
): SuggestedStripSlot[][] {
  if (res.rows.length === 0) return []
  if (isMulti) return res.rows
  if (res.rows.length === 1) return [res.rows[0]!]
  if (res.ocVariantSuffixes.length > 0 && res.ocVariantSuffixes.length === res.rows.length) {
    const i = res.ocVariantSuffixes.findIndex(
      (suf) => focusKey === `${patternId}::${suf}` || focusKey.endsWith(suf),
    )
    if (i >= 0) return [res.rows[i]!]
  }
  return [res.rows[0]!]
}

function collectNeededNaturalDefsFromStripRows(rows: SuggestedStripSlot[][]): TileDef[] {
  const out: TileDef[] = []
  for (const row of rows) {
    for (const s of row) {
      if (s.highlight) continue
      if (s.displayDef.cat === 'joker') continue
      out.push(s.displayDef)
    }
  }
  return out
}

function collectMatchedNaturalDefsFromStripRows(rows: SuggestedStripSlot[][]): TileDef[] {
  const out: TileDef[] = []
  for (const row of rows) {
    for (const s of row) {
      if (!s.highlight) continue
      if (s.displayDef.cat === 'joker') continue
      out.push(s.displayDef)
    }
  }
  return out
}

/**
 * Non-exposure rack tiles (concealed + staged pick + pass slots) that could still be played from
 * your hand — used only to decide whether discard-tracker “need” rings stay on.
 */
function concealedRackTilesForDiscardCoach(
  rack: TileInstance[],
  exposureTileIds?: ReadonlySet<string>,
): TileInstance[] {
  if (!exposureTileIds || exposureTileIds.size === 0) return rack
  return rack.filter((t) => !exposureTileIds.has(t.id))
}

/**
 * When the strip still shows open cells for def D but your concealed naturals of D already meet
 * the full pattern count (matched strip cells + open cells), you are not “short” that tile in the
 * discard tracker anymore — drop D from discard need highlights so the tray stops dimming (e.g.
 * right after you draw the copy you were hunting).
 */
function stripNeedDefsRequiringMoreFromDiscards(
  needDefs: TileDef[],
  matchedDefs: TileDef[],
  rack: TileInstance[],
  exposureTileIds?: ReadonlySet<string>,
): TileDef[] {
  if (needDefs.length === 0) return needDefs
  const concealed = concealedRackTilesForDiscardCoach(rack, exposureTileIds)
  const needByKey = new Map<string, number>()
  for (const d of needDefs) {
    const k = fullDefKey(d)
    needByKey.set(k, (needByKey.get(k) ?? 0) + 1)
  }
  const matchedByKey = new Map<string, number>()
  for (const d of matchedDefs) {
    const k = fullDefKey(d)
    matchedByKey.set(k, (matchedByKey.get(k) ?? 0) + 1)
  }
  const haveByKey = new Map<string, number>()
  for (const t of concealed) {
    if (t.def.cat === 'joker') continue
    const k = fullDefKey(t.def)
    haveByKey.set(k, (haveByKey.get(k) ?? 0) + 1)
  }
  const satisfiedKeys = new Set<string>()
  for (const [k, need] of needByKey) {
    const requiredTotal = (matchedByKey.get(k) ?? 0) + need
    if ((haveByKey.get(k) ?? 0) >= requiredTotal) satisfiedKeys.add(k)
  }
  if (satisfiedKeys.size === 0) return needDefs
  return needDefs.filter((d) => !satisfiedKeys.has(fullDefKey(d)))
}

function discardIdsMatchingNeededDefs(
  discards: readonly TileInstance[],
  needDefs: readonly TileDef[],
): Set<string> {
  const ids = new Set<string>()
  for (const t of discards) {
    if (needDefs.some((d) => tileDefsEqual(d, t.def))) {
      ids.add(t.id)
    }
  }
  return ids
}

function botExposureTileIdsMatchingNeededDefs(
  botExposures: readonly BotExposure[],
  needDefs: readonly TileDef[],
): Set<string> {
  const ids = new Set<string>()
  for (const exp of botExposures) {
    for (const t of exp.tiles) {
      if (t.def.cat === 'joker') continue
      if (needDefs.some((d) => tileDefsEqual(d, t.def))) ids.add(t.id)
    }
  }
  return ids
}

/** True when the focused strip still has at least one unfilled joker-eligible cell. */
function stripRowsStillWantJoker(rows: SuggestedStripSlot[][]): boolean {
  for (const row of rows) {
    for (const s of row) {
      if (s.jokerSuggested) return true
    }
  }
  return false
}

/**
 * Bot exposure jokers get coach `--suggest-best` (full lift + vignette) when the focused line can
 * still use them — default on for joker-eligible patterns, off only when melds are complete on the
 * strip or the only open cells left are singles/pairs (non-joker-eligible).
 */
export function shouldHighlightBotExposureJokers(
  p: PracticePattern,
  rows: SuggestedStripSlot[][],
): boolean {
  if (p.section === 'SINGLES AND PAIRS') return false

  const jokerEligible = patternPreviewJokerEligibleBySlot(p)
  if (!jokerEligible.some(Boolean)) return false

  if (stripRowsStillWantJoker(rows)) return true

  const slots = rows.flat()
  if (slots.length !== jokerEligible.length) {
    return stripRowsStillWantJoker(rows)
  }

  const hasOpenNaturalNeed = slots.some(
    (s) => !s.highlight && s.displayDef.cat !== 'joker',
  )
  if (!hasOpenNaturalNeed) return false

  for (let i = 0; i < slots.length; i++) {
    const s = slots[i]!
    if (s.highlight) continue
    if (jokerEligible[i]) return true
  }
  return false
}

function addBotExposureJokerIds(
  botExposures: readonly BotExposure[],
  out: Set<string>,
): void {
  for (const exp of botExposures) {
    for (const t of exp.tiles) {
      if (t.def.cat === 'joker') out.add(t.id)
    }
  }
}

/**
 * Bot exposure tile ids for the focused suggested line: naturals that match strip “need” defs
 * (same basis as discard dead-tile highlights), exposed jokers you may redeem with a natural in
 * hand (joker swap — always when legally swappable on your rack), and while the focused line can
 * still use jokers (see {@link shouldHighlightBotExposureJokers}).
 */
export function computeBotExposureSuggestedBestIds(
  focusKey: string | null,
  rack: TileInstance[],
  botExposures: BotExposure[],
  hand: TileInstance[],
  pendingEastDiscard: TileInstance | null,
  eastExposures: EastExposure[],
  exposureTileIds?: ReadonlySet<string>,
  patternBook: PracticePattern[] = getActiveCardPatterns(),
): Set<string> {
  if (!focusKey) return new Set()
  const variantSep = ['::tier::', '::oc::', '::ocall::']
    .map((s) => focusKey.indexOf(s))
    .filter((i) => i >= 0)
    .reduce((m, i) => (m < 0 ? i : Math.min(m, i)), -1)
  const patternId = variantSep >= 0 ? focusKey.slice(0, variantSep) : focusKey
  const p = patternByIdLookup(patternBook).get(patternId)
  if (!p) return new Set()
  const greedyUiOpts: GreedyPatternMatchOpts | undefined =
    exposureTileIds && exposureTileIds.size > 0 ? { exposureTileIds } : undefined

  const addFromStripWork = (pinnedP: PracticePattern, isMulti: boolean, fk: string) => {
    const detail = greedyPatternMatchDetail(rack, pinnedP, greedyUiOpts)
    const rackIdSet = new Set(rack.map((t) => t.id))
    const bestIds = isMulti
      ? new Set(detail.usedOrder.filter((id) => rackIdSet.has(id)))
      : computeRackPatternHighlightIds(
          rack,
          pinnedP,
          detail,
          exposureTileIds,
        )
    const result = buildSuggestedStripSlotRowsWithVariants(
      pinnedP,
      rack,
      detail.usedOrder,
      bestIds,
      detail.usedMeta,
      exposureTileIds,
    )
    const rows = pickStripRowsForFocusKey(p.id, fk, isMulti, result)
    const needDefs = collectNeededNaturalDefsFromStripRows(rows)
    const out = botExposureTileIdsMatchingNeededDefs(botExposures, needDefs)
    for (const id of collectSwappableJokerTileIds(
      hand,
      pendingEastDiscard,
      botExposures,
      eastExposures,
    )) {
      out.add(id)
    }
    if (shouldHighlightBotExposureJokers(pinnedP, rows)) {
      addBotExposureJokerIds(botExposures, out)
    }
    return out
  }

  if (variantSep >= 0) {
    const pinnedPatterns = buildPinnedPatternsFromFocusKey(p, focusKey)
    if (pinnedPatterns.length > 0) {
      const isMulti = isMultiComboFocusKey(focusKey)
      const out = new Set<string>()
      for (const pinnedP of pinnedPatterns) {
        for (const id of addFromStripWork(pinnedP, isMulti, focusKey)) {
          out.add(id)
        }
      }
      return out
    }
  }
  return addFromStripWork(p, false, focusKey)
}

/**
 * Tile defs the focused suggested hand is still short — same basis as discard-pile “need” rings
 * and sorted-discard-tracker slot highlights.
 */
export function computeSuggestedDiscardTrackerNeedDefs(
  focusKey: string | null,
  rack: TileInstance[],
  exposureTileIds?: ReadonlySet<string>,
  patternBook: PracticePattern[] = getActiveCardPatterns(),
): TileDef[] {
  if (!focusKey) return []
  const variantSep = ['::tier::', '::oc::', '::ocall::']
    .map((s) => focusKey.indexOf(s))
    .filter((i) => i >= 0)
    .reduce((m, i) => (m < 0 ? i : Math.min(m, i)), -1)
  const patternId = variantSep >= 0 ? focusKey.slice(0, variantSep) : focusKey
  const p = patternByIdLookup(patternBook).get(patternId)
  if (!p) return []
  const greedyUiOpts: GreedyPatternMatchOpts | undefined =
    exposureTileIds && exposureTileIds.size > 0
      ? { exposureTileIds }
      : undefined

  const addFromStripWork = (pinnedP: PracticePattern, isMulti: boolean, fk: string): TileDef[] => {
    const detail = greedyPatternMatchDetail(rack, pinnedP, greedyUiOpts)
    const rackIdSet = new Set(rack.map((t) => t.id))
    const bestIds = isMulti
      ? new Set(detail.usedOrder.filter((id) => rackIdSet.has(id)))
      : computeRackPatternHighlightIds(
          rack,
          pinnedP,
          detail,
          exposureTileIds,
        )
    const result = buildSuggestedStripSlotRowsWithVariants(
      pinnedP,
      rack,
      detail.usedOrder,
      bestIds,
      detail.usedMeta,
      exposureTileIds,
    )
    const rows = pickStripRowsForFocusKey(p.id, fk, isMulti, result)
    const needDefsRaw = collectNeededNaturalDefsFromStripRows(rows)
    const matchedDefs = collectMatchedNaturalDefsFromStripRows(rows)
    return stripNeedDefsRequiringMoreFromDiscards(needDefsRaw, matchedDefs, rack, exposureTileIds)
  }

  if (variantSep >= 0) {
    const pinnedPatterns = buildPinnedPatternsFromFocusKey(p, focusKey)
    if (pinnedPatterns.length > 0) {
      const isMulti = isMultiComboFocusKey(focusKey)
      const out: TileDef[] = []
      const seen = new Set<string>()
      for (const pinnedP of pinnedPatterns) {
        for (const def of addFromStripWork(pinnedP, isMulti, focusKey)) {
          const k = fullDefKey(def)
          if (seen.has(k)) continue
          seen.add(k)
          out.push(def)
        }
      }
      return out
    }
  }
  return addFromStripWork(p, false, focusKey)
}

/**
 * For the same suggested-hand focus as the rack guide, which discard-pile tile ids are naturals
 * the pattern is still short (non-highlight strip slots) — "dead" copies of tiles you need.
 * Empty when `focusKey` is null/invalid or the strip cannot be built.
 */
export function computeSuggestedDiscardNeedHighlightIds(
  focusKey: string | null,
  rack: TileInstance[],
  discards: readonly TileInstance[],
  exposureTileIds?: ReadonlySet<string>,
  patternBook: PracticePattern[] = getActiveCardPatterns(),
): Set<string> {
  const needDefs = computeSuggestedDiscardTrackerNeedDefs(
    focusKey,
    rack,
    exposureTileIds,
    patternBook,
  )
  return discardIdsMatchingNeededDefs(discards, needDefs)
}

/**
 * Hand tiles appearing in the greedy “used” set for both `focus` and another line with the same
 * `matchedInHand` + `tilesNeededRough` (contested between two equally-close card lines).
 */
export function contestedFlexibleHandTileIds(
  rack: TileInstance[],
  focus: PracticePattern,
  lines: SuggestedHandLine[],
  patternBook: PracticePattern[] = getActiveCardPatterns(),
): Set<string> {
  const fl = lines.find((l) => l.id === focus.id)
  if (!fl) return new Set()
  const usedF = new Set(greedyUsedTileOrderForPattern(rack, focus))
  const out = new Set<string>()
  const byId = patternByIdLookup(patternBook)
  for (const line of lines) {
    if (line.id === focus.id) continue
    if (line.tilesNeededRough !== fl.tilesNeededRough || line.matchedInHand !== fl.matchedInHand)
      continue
    const q = byId.get(line.id)
    if (!q) continue
    const usedQ = new Set(greedyUsedTileOrderForPattern(rack, q))
    for (const id of usedF) {
      if (usedQ.has(id)) out.add(id)
    }
  }
  return out
}

/**
 * Reorder East’s concealed tiles: **card-line / suggested-strip order** (suits then their dragons,
 * etc.), then any other matched hand tiles in matcher order, then pattern-helping tiles sorted by
 * table scarcity, then the rest.
 */
/** Build a pinned pattern from an opposing-consec combo string `<r>-<s1>-<s2>`.
 * Mirrors the inline construction in `buildConsecOpposingSuitStripVariantRows`. */
function buildPinnedPatternFromOpposingConsecComboStr(
  basePattern: PracticePattern,
  comboStr: string,
): PracticePattern | null {
  const parts = comboStr.split('-')
  if (parts.length !== 3) return null
  const r = parseInt(parts[0]!)
  const s1 = parts[1] as Suit
  const s2 = parts[2] as Suit
  if (!Number.isFinite(r) || r < 1 || r > 8) return null
  if (!basePattern.groups) return null
  const gi = basePattern.groups.findIndex((g) => g.kind === 'consec')
  if (gi < 0) return null
  const g = basePattern.groups[gi]!
  if (g.kind !== 'consec') return null
  const pinnedGroups: PatternGroup[] = basePattern.groups.map((grp, i) => {
    if (i !== gi) return grp
    return {
      ...g,
      kind: 'consec' as const,
      test: (def: TileDef) =>
        def.cat === 'suit' &&
        ((def.suit === s1 && def.rank === r) || (def.suit === s2 && def.rank === r + 1)),
    }
  })
  return { ...basePattern, groups: pinnedGroups }
}

/** Build pinned pattern(s) from a focus key. Returns one pinned pattern per combo for the
 * multi-combo "all" cases (`::tier::` with `|`, `::ocall::` with `|`); returns a single
 * pinned pattern wrapped in an array for individual variant keys. Returns empty array if
 * the focus key isn't a recognized variant key (caller falls back to base pattern). */
export function buildPinnedPatternsFromFocusKey(
  basePattern: PracticePattern,
  focusKey: string,
): PracticePattern[] {
  // Tier (suit-permute consecRanks): `::tier::<base>:<perm>` (single) or `::tier::<c1>|<c2>|...` (multi)
  const tierSep = focusKey.indexOf('::tier::')
  if (tierSep >= 0) {
    const tierStr = focusKey.slice(tierSep + '::tier::'.length)
    const comboStrs = tierStr.split('|').filter(Boolean)
    return comboStrs
      .map((c) => buildPinnedPatternFromComboStr(basePattern, c))
      .filter((x): x is PracticePattern => x != null)
  }
  // Opposing-consec stack — "all" variant: `::ocall::<r1>-<s1a>-<s1b>|...`
  const ocallSep = focusKey.indexOf('::ocall::')
  if (ocallSep >= 0) {
    const ocStr = focusKey.slice(ocallSep + '::ocall::'.length)
    const comboStrs = ocStr.split('|').filter(Boolean)
    return comboStrs
      .map((c) => buildPinnedPatternFromOpposingConsecComboStr(basePattern, c))
      .filter((x): x is PracticePattern => x != null)
  }
  // Opposing-consec stack — single variant: `::oc::<r>-<s1>-<s2>`
  const ocSep = focusKey.indexOf('::oc::')
  if (ocSep >= 0) {
    const comboStr = focusKey.slice(ocSep + '::oc::'.length)
    const pp = buildPinnedPatternFromOpposingConsecComboStr(basePattern, comboStr)
    return pp ? [pp] : []
  }
  return []
}

const FOCUS_KEY_VARIANT_SEPS = ['::tier::', '::oc::', '::ocall::'] as const

function focusKeyVariantSeparator(focusKey: string): number {
  return FOCUS_KEY_VARIANT_SEPS.map((s) => focusKey.indexOf(s))
    .filter((i) => i >= 0)
    .reduce((m, i) => (m < 0 ? i : Math.min(m, i)), -1)
}

/** Pattern id portion of a focus key (`year-4` from `year-4::tier::6:2-3-4`, etc.). */
export function focusKeyPatternId(focusKey: string): string {
  const variantSep = focusKeyVariantSeparator(focusKey)
  return variantSep >= 0 ? focusKey.slice(0, variantSep) : focusKey
}

/**
 * Joker swap dock-bounce: when a suggested line is focused, if any swappable hand natural that is
 * also highlighted for that line sits on a strip slot where jokers may not substitute (printed
 * pair / single / short run on the card), run the bounce animation once instead of looping.
 */
export function jokerSwapHandHintUsesSingleBounceIteration(args: {
  focusKey: string | null
  suppressedFocusKey: string | null
  /** Same gate as rack suggested highlights (Charleston done + in-play phases). */
  lineFocusActive: boolean
  patterns: PracticePattern[]
  rack: TileInstance[]
  bounceHandIds: ReadonlySet<string> | null | undefined
  exposureTileIds: ReadonlySet<string> | undefined
}): boolean {
  const {
    focusKey,
    suppressedFocusKey,
    lineFocusActive,
    patterns,
    rack,
    bounceHandIds,
    exposureTileIds,
  } = args
  if (!lineFocusActive || !focusKey || suppressedFocusKey === focusKey) return false
  const bounce = bounceHandIds
  if (!bounce || bounce.size === 0) return false

  const variantSep = focusKeyVariantSeparator(focusKey)
  const patternId = variantSep >= 0 ? focusKey.slice(0, variantSep) : focusKey
  const p = patternByIdLookup(patterns).get(patternId)
  if (!p) return false

  const pinnedPatterns =
    variantSep >= 0 ? buildPinnedPatternsFromFocusKey(p, focusKey) : []
  const candidates = pinnedPatterns.length > 0 ? pinnedPatterns : [p]

  for (const bid of bounce) {
    for (const pinnedP of candidates) {
      if (jokerSwapHintNaturalInNonJokerStripSlot(pinnedP, rack, bid, exposureTileIds)) return true
    }
  }
  return false
}

function jokerSwapHintNaturalInNonJokerStripSlot(
  pinnedP: PracticePattern,
  rack: TileInstance[],
  tileId: string,
  exposureTileIds: ReadonlySet<string> | undefined,
): boolean {
  const greedyUiOpts = exposureTileIds && exposureTileIds.size > 0 ? { exposureTileIds } : undefined
  const detail = greedyPatternMatchDetail(rack, pinnedP, greedyUiOpts)
  const bestIds = computeRackPatternHighlightIds(rack, pinnedP, detail, exposureTileIds)
  if (!bestIds.has(tileId)) return false

  const assign = computePreviewStripAssignment(
    pinnedP,
    rack,
    detail.usedOrder,
    bestIds,
    detail.usedMeta,
    null,
    greedyUiOpts,
  )
  const jElig = patternPreviewJokerEligibleBySlot(pinnedP)
  const n = Math.min(assign.slotTileIdByStripIndex.length, jElig.length)
  for (let i = 0; i < n; i++) {
    if (assign.slotTileIdByStripIndex[i] !== tileId) continue
    return jElig[i] !== true
  }
  return false
}

/** Returns true when the focus key represents a multi-combo "all" / category selection
 * (i.e., the rack should be lit by the UNION of all variants' contributing tiles). */
export function isMultiComboFocusKey(focusKey: string): boolean {
  if (focusKey.includes('::ocall::')) return true
  const tierSep = focusKey.indexOf('::tier::')
  if (tierSep < 0) return false
  return focusKey.slice(tierSep + '::tier::'.length).includes('|')
}

/** Build a pinned pattern (concrete fixed groups) from a single suit-permute combo string `<base>:<perm>`. */
function buildPinnedPatternFromComboStr(
  basePattern: PracticePattern,
  comboStr: string,
): PracticePattern | null {
  const colonIdx = comboStr.indexOf(':')
  if (colonIdx < 0) return null
  const base = parseInt(comboStr.slice(0, colonIdx))
  if (!Number.isFinite(base)) return null
  const permSuits = comboStr.slice(colonIdx + 1).split('-') as Suit[]
  const gi = basePattern.groups?.findIndex((g) => g.kind === 'suit-permute') ?? -1
  if (gi < 0 || !basePattern.groups) return null
  const spg = basePattern.groups[gi]
  if (!spg || spg.kind !== 'suit-permute') return null
  const drgForSuitPin = { bam: 'green' as const, dot: 'soap' as const, crak: 'red' as const }
  const trailSuit = (['bam', 'dot', 'crak'] as Suit[]).find((s) => !permSuits.includes(s))!
  const pinnedGroups: PatternGroup[] = [
    ...basePattern.groups.slice(0, gi),
    ...spg.colorGroups.flatMap((cgSlot, ci): PatternGroup[] => {
      const s = permSuits[ci]!
      const suitGroups = cgSlot.map((sg): PatternGroup => {
        const rank = spg.consecRanks ? sg.rank - 1 + base : sg.rank
        return { kind: 'fixed', need: sg.need, canUseJoker: sg.canUseJoker, test: (d) => d.cat === 'suit' && d.suit === s && d.rank === rank }
      })
      // Per-color-group dragons (e.g. sp-7 "D 1 2 3 …") match the color slot's suit dragon and sit
      // right after that slot's suit singles — keep them in the pinned pattern so the matcher
      // consumes them and the strip/rack highlights cover the held dragons (and align geometry).
      const dc = spg.colorGroupDragonCounts?.[ci] ?? 0
      const dragonGroups: PatternGroup[] =
        dc > 0
          ? [{ kind: 'fixed', need: dc, test: (d: TileDef) => d.cat === 'dragon' && d.dragon === drgForSuitPin[s] }]
          : []
      return [...suitGroups, ...dragonGroups]
    }),
    ...(spg.trailingDragonCount
      ? [{ kind: 'fixed' as const, need: spg.trailingDragonCount, test: (d: TileDef) => d.cat === 'dragon' && d.dragon === drgForSuitPin[trailSuit] }]
      : []),
    ...basePattern.groups.slice(gi + 1),
  ]
  const {
    cardLineFromGroupSlotMap: _cardLineFromGroupSlotMap,
    jokerEligibleGroupToDisplaySlot: _jokerEligibleGroupToDisplaySlot,
    ...pinnedBase
  } = basePattern
  return { ...pinnedBase, groups: pinnedGroups }
}

/**
 * Compute the strip-ordered hand-tile IDs for a focused pattern.
 * Uses the same tray strip builder as the suggested-hands UI so Sort matches what you see
 * (including left-anchored jokers within each meld run).
 */
function stripOrderedHandIdsForPattern(
  pinnedP: PracticePattern,
  rackForPattern: TileInstance[],
  handIds: Set<string>,
  exposureTileIds?: ReadonlySet<string>,
  exposureMelds?: readonly ExposureMeld[],
): { orderedIds: string[]; usedIds: Set<string> } {
  const greedyOpts = exposureTileIds?.size ? { exposureTileIds } : undefined
  const detail = greedyPatternMatchDetail(rackForPattern, pinnedP, greedyOpts)
  const rackIdSet = new Set(rackForPattern.map((t) => t.id))
  const bestIds = new Set(detail.usedOrder.filter((id) => rackIdSet.has(id)))
  if (bestIds.size === 0) {
    for (const t of rackForPattern) {
      if (pinnedP.matches(t.def)) bestIds.add(t.id)
    }
  }

  // Build the strip from the focused/pinned pattern (same path as the tray row you clicked).
  const { rows } = buildSuggestedStripSlotRowsWithVariants(
    pinnedP,
    rackForPattern,
    detail.usedOrder,
    bestIds,
    detail.usedMeta,
    exposureTileIds,
    exposureMelds,
  )
  const row = rows[0] ?? []

  const orderedIds: string[] = []
  const seen = new Set<string>()
  for (const slot of row) {
    const id = slot.tileId
    if (id == null || !handIds.has(id) || seen.has(id)) continue
    orderedIds.push(id)
    seen.add(id)
  }
  return { orderedIds, usedIds: seen }
}

/** Blanks never occupy strip slots; group them after pattern-sorted tiles (rack order preserved). */
function blanksAfterPatternSortInHandOrder(
  handOrder: readonly TileInstance[],
  seen: Set<string>,
): TileInstance[] {
  const out: TileInstance[] = []
  for (const t of handOrder) {
    if (t.def.cat === 'blank' && !seen.has(t.id)) {
      out.push(t)
      seen.add(t.id)
    }
  }
  return out
}

export function sortHandForSuggestedPattern(
  hand: TileInstance[],
  patternId: string,
  input: RankSuggestedHandsInput,
  /** Optional hand-entry key to sort toward a specific flexible variant. Recognized formats:
   *  - `<patternId>::tier::<base>:<perm>` — single suit-permute consecRanks variant
   *  - `<patternId>::oc::<r>-<s1>-<s2>` — single opposing-consec variant
   *  Legacy `|`-joined multi-combo keys (`::tier::a|b|...`, `::ocall::...`) are tolerated for
   *  backwards compatibility with old saved pins; they resolve to the FIRST combo so the sort
   *  produces a single coherent variant ordering instead of interleaving suits/colors. */
  focusKey?: string,
): TileInstance[] {
  const basePattern = patternByIdLookup(cardBookForRankInput(input)).get(patternId)
  if (!basePattern) return [...hand]
  const playerClaimMelds = input.playerClaimMelds ?? []
  const rackForPattern = rackForPatternWithClaimMelds(hand, playerClaimMelds)
  const handIds = new Set(hand.map((t) => t.id))
  const exposureTileIds: ReadonlySet<string> | undefined =
    playerClaimMelds.length > 0
      ? new Set(playerClaimMelds.flatMap((e) => e.tiles).map((t) => t.id))
      : undefined

  // Resolve the focus key to a single concrete pinned pattern (or fall back to base).
  // `buildPinnedPatternsFromFocusKey` may return >1 pattern for legacy `|`-joined keys;
  // we only ever consume the first combo to avoid the interleaved-suits sort artifact.
  const pinnedPatterns: PracticePattern[] = focusKey
    ? buildPinnedPatternsFromFocusKey(basePattern, focusKey)
    : []
  const sortPattern: PracticePattern = pinnedPatterns[0] ?? basePattern

  const orderedBest: TileInstance[] = []
  const seen = new Set<string>()
  const { orderedIds } = stripOrderedHandIdsForPattern(
    sortPattern,
    rackForPattern,
    handIds,
    exposureTileIds,
    playerClaimMelds.length > 0 ? playerClaimMelds : undefined,
  )
  for (const id of orderedIds) {
    if (seen.has(id)) continue
    const t = hand.find((x) => x.id === id)
    if (t) {
      orderedBest.push(t)
      seen.add(id)
    }
  }

  const blanksAfterPattern = blanksAfterPatternSortInHandOrder(hand, seen)

  /*
   * Strip `tileId`s can miss some highlighted tiles when strip realign and greedy match
   * briefly disagree. Pull any remaining usedOrder / best tiles left (stable usedOrder),
   * then keep true dim tiles in their current rack order so switching focused hands only
   * slides the best group left without scrambling the rest.
   */
  const greedyOpts: GreedyPatternMatchOpts | undefined =
    exposureTileIds?.size ? { exposureTileIds } : undefined
  const tailDetail = greedyPatternMatchDetail(rackForPattern, sortPattern, greedyOpts)
  const usedRank = new Map(tailDetail.usedOrder.map((id, i) => [id, i] as const))
  const remainingBest: TileInstance[] = []
  const dimRest: TileInstance[] = []
  for (const t of hand) {
    if (seen.has(t.id)) continue
    if (usedRank.has(t.id)) remainingBest.push(t)
    else dimRest.push(t)
  }
  remainingBest.sort((a, b) => (usedRank.get(a.id) ?? 0) - (usedRank.get(b.id) ?? 0))
  return [...orderedBest, ...remainingBest, ...blanksAfterPattern, ...dimRest]
}

/**
 * **Concealed + claim-meld** tiles in one list, left-to-right as on the card strip (same
 * `computePreviewStripAssignment` order as the suggested-hands line). Use for end-game review
 * when the rack should read as the full 14, not “melds in table order, then sorted concealed”.
 */
export function sortFullRackTilesForPattern(
  patternId: string,
  input: RankSuggestedHandsInput,
  focusKey?: string,
): TileInstance[] {
  const basePattern = patternByIdLookup(cardBookForRankInput(input)).get(patternId)
  const playerClaimMelds = input.playerClaimMelds ?? []
  const rackRaw = [...input.hand, ...playerClaimMelds.flatMap((e) => e.tiles)]
  const rackForPattern = rackForPatternWithClaimMelds(input.hand, playerClaimMelds)
  if (!basePattern) return rackRaw

  const byIdRaw = new Map(rackRaw.map((t) => [t.id, t] as const))
  const rackIds = new Set(rackForPattern.map((t) => t.id))
  const exposureTileIds: ReadonlySet<string> | undefined =
    playerClaimMelds.length > 0
      ? new Set(playerClaimMelds.flatMap((e) => e.tiles).map((t) => t.id))
      : undefined

  // Tied flexible variants are now their own suggested-hand lines, so the focus key always
  // resolves to a single concrete combo. Legacy `|`-joined multi-combo keys collapse to the
  // first combo via {@link buildPinnedPatternsFromFocusKey}'s array order.
  const pinnedPatterns: PracticePattern[] = focusKey
    ? buildPinnedPatternsFromFocusKey(basePattern, focusKey)
    : []
  const ordered: TileInstance[] = []
  const seen = new Set<string>()
  const sortPattern: PracticePattern = pinnedPatterns[0] ?? basePattern

  const { orderedIds } = stripOrderedHandIdsForPattern(
    sortPattern,
    rackForPattern,
    rackIds,
    exposureTileIds,
    playerClaimMelds.length > 0 ? playerClaimMelds : undefined,
  )
  for (const id of orderedIds) {
    if (seen.has(id)) continue
    const t = byIdRaw.get(id)
    if (t) {
      ordered.push(t)
      seen.add(id)
    }
  }

  const pForMatch: PracticePattern = sortPattern
  const greedyOpts: GreedyPatternMatchOpts | undefined =
    exposureTileIds?.size ? { exposureTileIds } : undefined
  const blanksAfterPattern = blanksAfterPatternSortInHandOrder(input.hand, seen)
  const tailDetail = greedyPatternMatchDetail(rackForPattern, pForMatch, greedyOpts)
  const usedRank = new Map(tailDetail.usedOrder.map((id, i) => [id, i] as const))
  const rest = rackRaw.filter((t) => !seen.has(t.id))
  rest.sort((a, b) => (usedRank.get(a.id) ?? 99_999) - (usedRank.get(b.id) ?? 99_999))
  return [...ordered, ...blanksAfterPattern, ...rest]
}

/**
 * Suggested-hands `focusKey` for strip sort / match detail.
 * Tied flexible variants are split into separate {@link SuggestedHandLine} rows at line build time
 * (each line carries a single combo), so this returns a single-combo key — never a `|`-joined
 * multi-combo key. Mirrors `SuggestedHandsPanel`'s click/double-click handler keys.
 */
export function focusKeyForSuggestedHandLine(line: SuggestedHandLine): string | undefined {
  if (line.consecRanksTier && line.consecRanksTier.combos.length > 0) {
    const c = line.consecRanksTier.combos[0]!
    return `${line.id}::tier::${c.base}:${c.perm.join('-')}`
  }
  return undefined
}

/**
 * Card-order rack + which tile ids “count” toward the line (greedy, same as in-play highlights).
 * Uses pinned pattern for tiered `id` + `consecRanksTier` when present.
 */
export function postGameRackAndHighlights(
  line: SuggestedHandLine,
  rankInput: RankSuggestedHandsInput,
): { fullRack: TileInstance[]; bestIds: Set<string> } {
  const fk = focusKeyForSuggestedHandLine(line)
  const fullRack = sortFullRackTilesForPattern(line.id, rankInput, fk)
  const base = patternByIdLookup(cardBookForRankInput(rankInput)).get(line.id)
  if (!base) return { fullRack, bestIds: new Set() }
  const playerClaimMelds = rankInput.playerClaimMelds ?? []
  const rack = rackForPatternWithClaimMelds(rankInput.hand, playerClaimMelds)
  const opt: GreedyPatternMatchOpts | undefined =
    playerClaimMelds.length > 0
      ? { exposureTileIds: new Set(playerClaimMelds.flatMap((e) => e.tiles).map((t) => t.id)) }
      : undefined
  let pForMatch: PracticePattern = base
  if (fk) {
    const pinned = buildPinnedPatternsFromFocusKey(base, fk)
    if (pinned.length > 0) pForMatch = pinned[0]!
  }
  const detail = greedyPatternMatchDetail(rack, pForMatch, opt)
  const rackIdSet = new Set(rack.map((t) => t.id))
  const bestIds = new Set(detail.usedOrder.filter((id) => rackIdSet.has(id)))
  if (bestIds.size === 0) {
    for (const t of rack) {
      if (pForMatch.matches(t.def)) bestIds.add(t.id)
    }
  }
  return { fullRack, bestIds }
}

/** Official hand # for UI: league `cardHandCode` when set, else practice-card sequential index. */
export function suggestedHandCardRefDisplay(line: SuggestedHandLine): string {
  const c = line.cardHandCode?.trim()
  if (c) return c
  return String(line.cardLineNumber)
}

/**
 * Category + hand # in the same form as the suggested-hands card column (e.g. `2468 - 6`), not
 * `2468 #6` — keeps Mah Jongg / wall-game overlays aligned with the rack card display.
 */
export function suggestedHandCategoryDashCardRef(line: SuggestedHandLine): string {
  return `${suggestedHandSectionMenuLabel(line.section)} - ${suggestedHandCardRefDisplay(line)}`
}

/**
 * Sort key within a section (e.g. 1a before 1b before 2). Practice card uses sequential line index.
 */
export function suggestedHandCardRefOrder(line: SuggestedHandLine): number {
  const code = line.cardHandCode?.trim()
  if (code) {
    const m = code.match(/^(\d+)([a-z])?$/i)
    if (m) {
      const n = parseInt(m[1]!, 10)
      const suf = m[2] ? m[2]!.toLowerCase().charCodeAt(0) - 96 : 0
      return n * 32 + suf
    }
  }
  return 10_000 + line.cardLineNumber
}

/**
 * All practice lines that share the best (minimum) `tilesNeededRough` for this rack, ordered with
 * the same tiebreak as {@link summarizeRackTowardWin} — `[0]` is that function’s `closestLine`.
 * Post-game: use when several hands tie in distance; offer a chooser to flip strip + highlights.
 */
export function suggestedHandsTiedAtBest(input: RankSuggestedHandsInput): {
  bestTilesAway: number
  linesAtMin: SuggestedHandLine[]
} {
  const lines = rankSuggestedHands(input)
  if (!lines.length) return { bestTilesAway: 14, linesAtMin: [] }
  let minAway = 14
  for (const line of lines) {
    if (line.tilesNeededRough < minAway) minAway = line.tilesNeededRough
  }
  const tied = lines.filter((l) => l.tilesNeededRough === minAway)
  tied.sort((a, b) => {
    const prox = compareSuggestedHandsByProximity(a, b)
    if (prox !== 0) return prox
    if (a.visibleDeadMatches !== b.visibleDeadMatches) return a.visibleDeadMatches - b.visibleDeadMatches
    if (a.section !== b.section) return a.section.localeCompare(b.section)
    if (suggestedHandCardRefOrder(a) !== suggestedHandCardRefOrder(b)) {
      return suggestedHandCardRefOrder(a) - suggestedHandCardRefOrder(b)
    }
    return a.title.localeCompare(b.title)
  })
  return { bestTilesAway: minAway, linesAtMin: tied }
}

/**
 * Ranks placeholder “hands” using your **hand + East exposures** (14-tile total toward Mah Jongg),
 * wall height, discards, and bot racks.
 * Card data comes from {@link RankSuggestedHandsInput.patterns} or the session book ({@link getActiveCardPatterns}).
 */
export type RankSuggestedHandsInput = {
  /**
   * Concealed rack tiles for this seat. **Tiles-away** ({@link SuggestedHandLine.tilesNeededRough}) uses
   * only these plus resolved {@link playerClaimMelds} (`rankSuggestedHands` → `rackForPatternWithClaimMelds`)
   * — nothing from {@link discards} ever increases {@link SuggestedHandLine.matchedInHand}.
   * When you stage a discard for East, that tile leaves `hand` until you undo or commit, so tiles away goes
   * up despite the discarded copy still glowing on the discard tracker coach.
   */
  hand: TileInstance[]
  wallRemaining: number
  /**
   * Discards folded into {@link tableVisibleTiles} **only** for `visibleDeadMatches`.
   * The app omits any live unreclaimed opponent discard here so unreclaimed tiles are not counted as
   * settled table-dead in messaging (coach still rings that tile separately from the discard strip).
   */
  discards: TileInstance[]
  exposures: BotExposure[]
  /**
   * This seat’s discard-claim melds — **C** lines omitted when non-empty; pattern fit + rack merge.
   * For East, pass their `eastExposures`; for a bot, pass that seat’s `BotExposure[]` entries only.
   */
  playerClaimMelds?: ReadonlyArray<{ tiles: TileInstance[] }>
  /**
   * East’s claim melds on the table (always include in `visible` dead-tile pool for every seat).
   * Omit to default to `playerClaimMelds` (correct when the scoring seat is East).
   */
  eastTableClaimMelds?: ReadonlyArray<{ tiles: TileInstance[] }>
  /**
   * Card book to rank against. Defaults to the session book ({@link getActiveCardPatterns}).
   */
  patterns?: PracticePattern[]
  /** Deck composition for completion-probability math. */
  deckSettings?: {
    totalJokersInGame?: number
    totalBlanksInGame?: number
  }
  /**
   * When a joker swap is legal this turn, exposed redeemable jokers boost completion prob for lines
   * with joker-eligible gaps. Not tied to the hint setting — hints are visual only.
   */
  jokerSwapHintForProb?: {
    enabled: boolean
    hand: TileInstance[]
    pendingDiscard?: TileInstance | null
    botExposures: BotExposure[]
    eastExposures: EastExposure[]
  }
  /**
   * Live unreclaimed opponent discard (bot-turn Call/Ignore). Still omitted from {@link discards}
   * and from Away, but lines this tile completes for Mah Jongg show Prob % 100.
   */
  liveClaimableDiscard?: TileInstance | null
  /**
   * Tile staged on the discard tray (still yours until Discard commits). Counted in Prob rack
   * size only — not toward Away — so staging junk does not change ownership bookkeeping.
   */
  pendingDiscardTile?: TileInstance | null
}

function cardBookForRankInput(input: RankSuggestedHandsInput): PracticePattern[] {
  return input.patterns ?? getActiveCardPatterns()
}

/**
 * True when every `suit-permute` color slot has the same rank/dragon shape and there is no
 * trailing-dragon tail. Suit assignments then only reorder the strip (same multiset of tiles
 * toward the hand); permutations at a fixed "like number" base should not stack as separate rows.
 */
function suitPermuteConsecSlotsAreReorderOnly(
  g: Extract<PatternGroup, { kind: 'suit-permute' }>,
): boolean {
  if (!g.consecRanks) return false
  if ((g.trailingDragonCount ?? 0) > 0) return false
  const n = g.colorGroups.length
  if (n < 2) return false
  const slotSig = (i: number): string => {
    const cg = g.colorGroups[i]!
    const part = [...cg]
      .map((sg) => `${sg.rank}:${sg.need}`)
      .sort()
      .join(',')
    const dc = g.colorGroupDragonCounts?.[i] ?? 0
    return `${part}|d${dc}`
  }
  const s0 = slotSig(0)
  for (let i = 1; i < n; i++) {
    if (slotSig(i) !== s0) return false
  }
  return true
}

/** Primary suggested-hand ordering: fewest tiles away, then highest completion %. */
export function compareSuggestedHandsByProximity(a: SuggestedHandLine, b: SuggestedHandLine): number {
  if (a.tilesNeededRough !== b.tilesNeededRough) {
    return a.tilesNeededRough - b.tilesNeededRough
  }
  if (b.completionProbability !== a.completionProbability) {
    return b.completionProbability - a.completionProbability
  }
  return 0
}

/**
 * Suggested-hands panel visibility. Currently shows every ranked line, including 0% Prob
 * (so near-edge hands stop flickering in/out). `focusedPatternId` is unused but kept for
 * call-site compatibility if we reintroduce a hide-0% filter later.
 */
export function suggestedHandShownInPanelList(
  _line: SuggestedHandLine,
  _focusedPatternId: string | null,
): boolean {
  return true
}

export function rankSuggestedHands(input: RankSuggestedHandsInput): SuggestedHandLine[] {
  const { hand, wallRemaining, discards, exposures } = input
  const playerClaimMelds = input.playerClaimMelds ?? []
  const eastTableClaimMelds = input.eastTableClaimMelds ?? input.playerClaimMelds ?? []
  const liveClaimableDiscard = input.liveClaimableDiscard ?? null
  const pendingDiscardTile = input.pendingDiscardTile ?? null
  const hasPlayerClaimMelds = playerClaimMelds.length > 0
  /** Concealed hand + this seat’s exposed claim melds — all count toward the 14. */
  const rackForPattern = rackForPatternWithClaimMelds(hand, playerClaimMelds)
  /** Prob acquisition uses physical ownership (include staged discard still on the tray). */
  const playerRackTileCount = rackForPattern.length + (pendingDiscardTile ? 1 : 0)
  const exposureTileIds: ReadonlySet<string> | undefined =
    hasPlayerClaimMelds ? new Set(playerClaimMelds.flatMap((e) => e.tiles).map((t) => t.id)) : undefined
  const groupMatchOpts: GroupMatchOpts = {
    noJokers: false,
    leftToRight: true,
    requireCompleteRunSingles: true,
    ...(exposureTileIds && exposureTileIds.size > 0 ? { exposureTileIds } : {}),
  }
  const greedyExposureOpts: GreedyPatternMatchOpts | undefined =
    exposureTileIds && exposureTileIds.size > 0 ? { exposureTileIds } : undefined
  const visible = tableVisibleTiles(
    discards,
    exposures,
    eastTableClaimMelds,
    exposureTileIds,
  )
  const deck = deckCompositionFromInput(input)
  const swappableExposedJokers =
    input.jokerSwapHintForProb?.enabled === true
      ? collectSwappableJokerTileIds(
          input.jokerSwapHintForProb.hand,
          input.jokerSwapHintForProb.pendingDiscard ?? null,
          input.jokerSwapHintForProb.botExposures,
          input.jokerSwapHintForProb.eastExposures,
        ).size
      : 0
  const resolvedByPatternId = new Map<string, ReturnType<typeof resolveBestPatternCompletion>>()
  const completionResolvedFor = (p: PracticePattern) => {
    let resolved = resolvedByPatternId.get(p.id)
    if (!resolved) {
      resolved = resolveBestPatternCompletion(p, rackForPattern, discards)
      resolvedByPatternId.set(p.id, resolved)
    }
    return resolved
  }

  const book = cardBookForRankInput(input)

  // Pre-compute fixed card line numbers (never changes regardless of sort order)
  const cardLineNumbers = new Map<string, number>()
  const sectionLineCount: Record<string, number> = {}
  for (const p of book) {
    sectionLineCount[p.section] = (sectionLineCount[p.section] ?? 0) + 1
    cardLineNumbers.set(p.id, sectionLineCount[p.section])
  }

  const patternsToRank = book.filter((p) => {
    if (hasPlayerClaimMelds && p.closed) return false
    if (hasPlayerClaimMelds && !claimMeldsFitPracticePattern(p, playerClaimMelds)) return false
    return true
  })

  const drgForSuit = { bam: 'green' as const, dot: 'soap' as const, crak: 'red' as const }

  const rows: SuggestedHandLine[] = patternsToRank.flatMap((p) => {
    const resolved = completionResolvedFor(p)
    const completion = resolved.metrics
    // Tiles-away follows the same greedy matcher as the suggested-tile strip (jokers fill
    // kong/quint gaps, never flowers). Completion metrics still drive completion %.
    const greedyMatched = p.groups?.length
      ? computeGroupMatch(rackForPattern, p.groups, {
          ...groupMatchOpts,
          noJokers: p.section === 'SINGLES AND PAIRS',
        })
      : rackForPattern.filter((t) => p.matches(t.def)).length
    const matchedInHand = greedyMatched
    const tilesNeededRough = Math.max(0, p.roughTarget - matchedInHand)
    const visibleDeadMatches = visible.filter((t) => p.matches(t.def)).length
    const pressure = pressureLabel(tilesNeededRough, wallRemaining)

    const note =
      visible.length === 0
        ? 'No discards or exposures yet — table info will tighten these estimates next.'
        : `${visibleDeadMatches} tile(s) that help this shape are already visible on discards or bot racks — fewer copies are hidden in other hands or the wall.`

    const primary: SuggestedHandLine = {
      id: p.id,
      title: p.title,
      titleSegments: p.titleSegments,
      matchedInHand,
      tilesNeededRough,
      completionProbability: completionProbabilityForLine(
        p,
        rackForPattern,
        visible,
        wallRemaining,
        deck,
        resolved.slots,
        resolved.ctx,
        completion,
        tilesNeededRough,
        swappableExposedJokers,
        hand,
        playerClaimMelds,
        liveClaimableDiscard,
        playerRackTileCount,
        discards,
      ),
      wallRemaining,
      visibleDeadMatches,
      pressure,
      note,
      section: p.section,
      points: p.points,
      closed: p.closed,
      cardLineNumber: cardLineNumbers.get(p.id) ?? 1,
      cardHandCode: p.cardHandCode,
      cardParenthesis: p.cardParenthesis,
    }

    // For consecRanks patterns generate additional tier entries (each at a different tiles-away
    // level) so the player sees this hand at every distance up to 12 away.
    const consecPermuteGroup = p.groups?.find(
      (g): g is Extract<PatternGroup, { kind: 'suit-permute' }> =>
        g.kind === 'suit-permute' && !!g.consecRanks,
    )
    if (!consecPermuteGroup) return [primary]

    const nSlots = consecPermuteGroup.colorGroups.length
    const tdc = consecPermuteGroup.trailingDragonCount ?? 0
    const maxRankOff =
      Math.max(...consecPermuteGroup.colorGroups.flatMap((cg) => cg.map((sg) => sg.rank))) - 1
    const searchBases = Array.from({ length: 9 - maxRankOff }, (_, i) => i + 1)
    const perms = suitPermutations(nSlots)
    const jokerCount = rackForPattern.filter((t) => t.def.cat === 'joker').length

    // Score for each (perm, base) combo: natural fill + joker contribution to suit-permute group.
    // Other groups (e.g. flower) use their score from the primary matchedInHand minus the
    // suit-permute group's contribution (primary natural fill for that group).
    const primaryDetail = greedyPatternMatchDetail(rackForPattern, p, greedyExposureOpts)
    const gi = p.groups!.findIndex((g) => g.kind === 'suit-permute')
    const remForPermute = rackAfterPriorGroups(rackForPattern, primaryDetail.usedMeta, gi)
    // Natural tiles consumed by groups BEFORE the suit-permute group (e.g. flowers).
    // These are fixed regardless of which (perm, base) we use for the suit-permute group.
    const priorGroupsMatched = primaryDetail.usedMeta.filter((m) => m.groupIdx < gi).length

    type ComboScore = {
      perm: Suit[]
      base: number
      total: number
      maxSlotFill: number
      slotSquareFill: number
    }
    const comboScores: ComboScore[] = []

    for (const base of searchBases) {
      for (const perm of perms) {
        let naturalFill = 0
        let jokerEligibleUnfilled = 0
        for (let ci = 0; ci < nSlots; ci++) {
          const s = perm[ci]!
          for (const sg of consecPermuteGroup.colorGroups[ci]!) {
            const rank = sg.rank - 1 + base
            const count = Math.min(
              remForPermute.filter(
                (t) => t.def.cat === 'suit' && t.def.suit === s && t.def.rank === rank,
              ).length,
              sg.need,
            )
            naturalFill += count
            if (sg.canUseJoker && sg.need >= 3) jokerEligibleUnfilled += sg.need - count
          }
          const slotDc = consecPermuteGroup.colorGroupDragonCounts?.[ci] ?? 0
          if (slotDc > 0) {
            const drg = drgForSuit[s]
            const dNat = Math.min(
              remForPermute.filter((t) => t.def.cat === 'dragon' && t.def.dragon === drg).length,
              slotDc,
            )
            naturalFill += dNat
            jokerEligibleUnfilled += slotDc - dNat
          }
        }
        if (tdc > 0) {
          const trailSuit = (['bam', 'dot', 'crak'] as Suit[]).find((s) => !perm.includes(s))
          if (trailSuit) {
            const drg = drgForSuit[trailSuit]
            const count = Math.min(
              remForPermute.filter((t) => t.def.cat === 'dragon' && t.def.dragon === drg).length,
              tdc,
            )
            naturalFill += count
            jokerEligibleUnfilled += tdc - count
          }
        }
        const jokerFill = Math.min(jokerCount, jokerEligibleUnfilled)
        const total = priorGroupsMatched + naturalFill + jokerFill
        const { maxSlotFill, slotSquareFill } = scoreSuitPermuteCombo(
          remForPermute,
          consecPermuteGroup,
          perm,
          base,
          exposureTileIds,
        )
        comboScores.push({ perm, base, total, maxSlotFill, slotSquareFill })
      }
    }

    const sortCombos = (combos: ComboScore[]) =>
      [...combos].sort((a, b) => {
        if (b.maxSlotFill !== a.maxSlotFill) return b.maxSlotFill - a.maxSlotFill
        if (b.slotSquareFill !== a.slotSquareFill) return b.slotSquareFill - a.slotSquareFill
        return a.base !== b.base ? a.base - b.base : a.perm.join('').localeCompare(b.perm.join(''))
      })
    const collapsePermutationTiers = suitPermuteConsecSlotsAreReorderOnly(consecPermuteGroup)
    const maybeCollapseCombos = (combos: ComboScore[]) => {
      if (!collapsePermutationTiers) return combos
      const seenBase = new Set<number>()
      return combos.filter((c) => {
        if (seenBase.has(c.base)) return false
        seenBase.add(c.base)
        return true
      })
    }

    // Group combos by total matched count and produce one tier entry per distinct count
    // that is worse than the primary (lower total) but still yields ≤ 12 tiles away.
    const MAX_TILES_AWAY = 12
    const byTotal = new Map<number, ComboScore[]>()
    for (const cs of comboScores) {
      if (cs.total >= matchedInHand) continue // primary level or better — skip
      const tilesAway = Math.max(0, p.roughTarget - cs.total)
      if (tilesAway > MAX_TILES_AWAY) continue
      const arr = byTotal.get(cs.total) ?? []
      arr.push(cs)
      byTotal.set(cs.total, arr)
    }

    const tierEntries: SuggestedHandLine[] = []
    for (const [, tierCombos] of [...byTotal.entries()].sort((a, b) => b[0] - a[0])) {
      // Sort within tier: by base ascending, then perm lexicographically.
      const sorted = maybeCollapseCombos(sortCombos(tierCombos))
      // Emit one suggested-hand line per tied tier combo so each tied variant has its own
      // clickable row in the panel (keeps click → sort → highlight wired to a single concrete
      // suit/base assignment). The panel groups identical-line metadata visually.
      for (const c of sorted) {
        const tierCtx = buildInventoryContext(p, rackForPattern, discards)
        const tierSlots = buildDeterministicCompletionSlots(p, { perm: c.perm, base: c.base })
        const tierCompletion = computeTierCompletionMetrics(p, rackForPattern, discards, c.perm, c.base)
        const tierMatched = c.total
        const tierAway = Math.max(0, p.roughTarget - tierMatched)
        tierEntries.push({
          id: p.id,
          title: p.title,
          titleSegments: p.titleSegments,
          matchedInHand: tierMatched,
          tilesNeededRough: tierAway,
          completionProbability: completionProbabilityForLine(
            p,
            rackForPattern,
            visible,
            wallRemaining,
            deck,
            tierSlots,
            tierCtx,
            tierCompletion,
            tierAway,
            swappableExposedJokers,
            hand,
            playerClaimMelds,
            liveClaimableDiscard,
            playerRackTileCount,
            discards,
          ),
          wallRemaining,
          visibleDeadMatches,
          pressure: pressureLabel(tierAway, wallRemaining),
          note,
          section: p.section,
          points: p.points,
          closed: p.closed,
          cardLineNumber: cardLineNumbers.get(p.id) ?? 1,
          cardHandCode: p.cardHandCode,
          cardParenthesis: p.cardParenthesis,
          consecRanksTier: { combos: [{ perm: c.perm, base: c.base }] },
        })
      }
    }

    return [primary, ...tierEntries]
  })

  rows.sort((a, b) => {
    const prox = compareSuggestedHandsByProximity(a, b)
    if (prox !== 0) return prox
    return a.visibleDeadMatches - b.visibleDeadMatches
  })

  return rows
}

/** Best “tiles away” across all surviving practice lines for this seat (0 = could declare on card). */
export function summarizeRackTowardWin(input: RankSuggestedHandsInput): {
  bestTilesAway: number
  closestLine: SuggestedHandLine | null
} {
  const { bestTilesAway, linesAtMin } = suggestedHandsTiedAtBest(input)
  if (!linesAtMin.length) return { bestTilesAway: 14, closestLine: null }
  return { bestTilesAway, closestLine: linesAtMin[0]! }
}

/**
 * Tile needs for the focused line using the same suit-permute assignment as rack highlights
 * (greedy best fill), including `canUseJoker` on kong slots — for dead-cause messaging.
 */
export function buildGreedyAlignedDeadHintNeeds(
  pattern: PracticePattern,
  rack: TileInstance[],
  opts?: GreedyPatternMatchOpts,
): DeadHintNeedMap {
  const needs: DeadHintNeedMap = new Map()
  const groups = pattern.groups
  if (!groups?.length) return needs

  const detail = greedyPatternMatchDetail(rack, pattern, opts)
  const drgForSuitPerm = { bam: 'green' as const, dot: 'soap' as const, crak: 'red' as const }

  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi]!
    switch (g.kind) {
      case 'fixed':
      case 'rank':
      case 'suit-locked-rank': {
        for (const def of deadHintStandardDefsToProbe()) {
          if (!g.test(def)) continue
          addDeadHintNeed(needs, def, g.need, meldDefIsJokerEligible(def, g.need))
        }
        break
      }
      case 'suit-permute': {
        const rem = rackAfterPriorGroups(rack, detail.usedMeta, gi)
        const n = g.colorGroups.length
        const tdc = g.trailingDragonCount ?? 0
        const maxRankOff = g.consecRanks
          ? Math.max(...g.colorGroups.flatMap((cg) => cg.map((sg) => sg.rank))) - 1
          : 0
        const searchBases = g.consecRanks
          ? Array.from({ length: 9 - maxRankOff }, (_, i) => i + 1)
          : [1]
        let bestScore = { fill: -1, exposureFill: -1, maxSlotFill: -1, slotSquareFill: -1 }
        let bestPerm: Suit[] = []
        let bestBase = 1
        for (const base of searchBases) {
          for (const perm of suitPermutations(n)) {
            const score = scoreSuitPermuteCombo(rem, g, perm, base, opts?.exposureTileIds)
            if (suitPermuteComboScoreBetter(score, bestScore, !!opts?.exposureTileIds)) {
              bestScore = score
              bestPerm = [...perm]
              bestBase = base
            }
          }
        }
        if (bestPerm.length !== n) break
        for (let ci = 0; ci < n; ci++) {
          const s = bestPerm[ci]!
          for (const sg of g.colorGroups[ci]!) {
            const rank = g.consecRanks ? sg.rank - 1 + bestBase : sg.rank
            const def: TileDef = { cat: 'suit', suit: s, rank }
            addDeadHintNeed(needs, def, sg.need, meldDefIsJokerEligible(def, sg.need))
          }
          const dragonCount = g.colorGroupDragonCounts?.[ci] ?? 0
          if (dragonCount > 0) {
            const dragonDef: TileDef = { cat: 'dragon', dragon: drgForSuitPerm[s] }
            addDeadHintNeed(
              needs,
              dragonDef,
              dragonCount,
              meldDefIsJokerEligible(dragonDef, dragonCount),
            )
          }
        }
        if (tdc > 0) {
          const trailSuit = (['bam', 'dot', 'crak'] as Suit[]).find((s) => !bestPerm.includes(s))
          if (trailSuit) {
            const dragonDef: TileDef = { cat: 'dragon', dragon: drgForSuitPerm[trailSuit] }
            addDeadHintNeed(
              needs,
              dragonDef,
              tdc,
              meldDefIsJokerEligible(dragonDef, tdc),
            )
          }
        }
        break
      }
      case 'dragon-meld-permute': {
        if (g.needs.length !== 3) break
        const rem = rackAfterPriorGroups(rack, detail.usedMeta, gi)
        const bestTypes = pickBestDragonMeldPermuteTypes(rem, g.needs)
        if (!bestTypes) break
        for (let i = 0; i < 3; i++) {
          const dr = bestTypes[i]!
          const def: TileDef = { cat: 'dragon', dragon: dr }
          addDeadHintNeed(needs, def, g.needs[i]!, meldDefIsJokerEligible(def, g.needs[i]!))
        }
        break
      }
      default:
        break
    }
  }
  return needs
}
