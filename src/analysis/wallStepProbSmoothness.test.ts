import { describe, expect, it } from 'vitest'
import { NMJL_2026_PATTERNS } from '../card/nmjl2026Patterns'
import { rankSuggestedHands } from './suggestedHands'

describe('Prob % wall-step smoothness', () => {
  const pattern = NMJL_2026_PATTERNS.find(
    (p) => p.section === 'CONSECUTIVE RUN' && p.cardHandCode === '2a',
  )!

  const baseHand = [
    { id: 'j1', def: { cat: 'joker' as const } },
    { id: 'b1a', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 1 } },
    { id: 'b1b', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 1 } },
    { id: 'b2', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 2 } },
    { id: 'b3', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 3 } },
    { id: 'b4', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 4 } },
    { id: 'b5a', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 5 } },
    { id: 'b5b', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 5 } },
    { id: 'c3', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 3 } },
    { id: 'c4', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 4 } },
    { id: 'w1', def: { cat: 'wind' as const, wind: 'W' as const } },
    { id: 'w2', def: { cat: 'wind' as const, wind: 'W' as const } },
    { id: 'd8', def: { cat: 'suit' as const, suit: 'dot' as const, rank: 8 } },
  ]
  const live1d = {
    id: 'd1-live',
    def: { cat: 'suit' as const, suit: 'dot' as const, rank: 1 },
  }
  const drawn5c = {
    id: 'c5',
    def: { cat: 'suit' as const, suit: 'crak' as const, rank: 5 },
  }
  const priorDiscards = [
    { id: 'b8', def: { cat: 'suit' as const, suit: 'bam' as const, rank: 8 } },
    { id: 'd7', def: { cat: 'suit' as const, suit: 'dot' as const, rank: 7 } },
    { id: 'c7', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 7 } },
    { id: 'f1', def: { cat: 'flower' as const, flower: 1 } },
  ]

  function prob(
    hand: typeof baseHand,
    discards: typeof priorDiscards,
    live: typeof live1d | null,
    wall: number,
  ) {
    return rankSuggestedHands({
      hand,
      wallRemaining: wall,
      discards,
      exposures: [],
      patterns: [pattern],
      deckSettings: { totalJokersInGame: 8, totalBlanksInGame: 0 },
      liveClaimableDiscard: live,
    }).find((x) => x.id === pattern.id)!.completionProbability
  }

  it('does not cliff ~6 Prob points when East ignores a junk 1D and draws junk at wall 96→95', () => {
    // N discarded 1D (uncallable / wrong suit); East next, draws 5C; wall 95 after draw.
    const before = prob(baseHand, priorDiscards, live1d, 96)
    const after = prob([...baseHand, drawn5c], [...priorDiscards, live1d], null, 95)
    expect(before).toBeGreaterThan(0)
    expect(after).toBeGreaterThan(0)
    // One wall tile + junk draw should move Prob only slightly.
    expect(before - after).toBeLessThanOrEqual(2)
  })
})
