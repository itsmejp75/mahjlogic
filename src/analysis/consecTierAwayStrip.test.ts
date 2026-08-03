import { describe, expect, it } from 'vitest'
import { NMJL_2026_PATTERNS } from '../card/nmjl2026Patterns'
import {
  buildConsecRanksTierStripRow,
  rankSuggestedHands,
} from './suggestedHands'
import type { TileDef, TileInstance } from '../mahjong/types'

function tile(def: TileDef, id: string): TileInstance {
  return { id, def }
}

/**
 * Screenshot rack: 3 jokers, 1B, 2×7B, 9B, 2×6D, 7D, 8D, soap, E, S.
 * Primary Runs #5a is dots 6–7–8 + soap (jokers on FFF). Bam 1–2–3 + green is a worse
 * consecRanks tier — Away must match strip coverage (no double-counting flower jokers).
 */
function screenshotRack(): TileInstance[] {
  return [
    tile({ cat: 'joker' }, 'j1'),
    tile({ cat: 'joker' }, 'j2'),
    tile({ cat: 'joker' }, 'j3'),
    tile({ cat: 'suit', suit: 'bam', rank: 1 }, 'b1'),
    tile({ cat: 'suit', suit: 'bam', rank: 7 }, 'b7a'),
    tile({ cat: 'suit', suit: 'bam', rank: 7 }, 'b7b'),
    tile({ cat: 'suit', suit: 'bam', rank: 9 }, 'b9'),
    tile({ cat: 'suit', suit: 'dot', rank: 6 }, 'd6a'),
    tile({ cat: 'suit', suit: 'dot', rank: 6 }, 'd6b'),
    tile({ cat: 'suit', suit: 'dot', rank: 7 }, 'd7'),
    tile({ cat: 'suit', suit: 'dot', rank: 8 }, 'd8'),
    tile({ cat: 'dragon', dragon: 'soap' }, 'soap'),
    tile({ cat: 'wind', wind: 'E' }, 'e'),
    tile({ cat: 'wind', wind: 'S' }, 's'),
  ]
}

describe('consecRanks tier Away vs strip highlights', () => {
  it('does not double-count flower jokers on Runs #5a bam 1–2–3 tier', () => {
    const rack = screenshotRack()
    const p = NMJL_2026_PATTERNS.find((x) => x.id === 'nmjl2026:consec-5a')
    expect(p).toBeTruthy()

    const ranked = rankSuggestedHands({
      hand: rack,
      wallRemaining: 99,
      discards: [],
      exposures: [],
      patterns: [p!],
    })

    const primary = ranked.find((l) => !l.consecRanksTier)
    expect(primary?.tilesNeededRough).toBe(6)
    expect(primary?.matchedInHand).toBe(8)

    const bamBase1 = ranked.find(
      (l) =>
        l.consecRanksTier?.combos[0]?.base === 1 &&
        l.consecRanksTier.combos[0]?.perm.join() === 'bam',
    )
    expect(bamBase1).toBeTruthy()
    // 3 jokers on FFF + 1B only — not 7 (old bug reused the same 3 jokers on 333/DDDD).
    expect(bamBase1!.matchedInHand).toBe(4)
    expect(bamBase1!.tilesNeededRough).toBe(10)

    const strip = buildConsecRanksTierStripRow(p!, rack, ['bam'], 1)
    expect(strip).toBeTruthy()
    const covered = strip!.filter((s) => s.highlight || s.jokerSuggested).length
    expect(covered).toBe(bamBase1!.matchedInHand)
    expect(strip!.filter((s) => s.highlight).map((s) => s.displayDef)).toEqual([
      { cat: 'suit', suit: 'bam', rank: 1 },
    ])
    expect(strip!.filter((s) => s.jokerSuggested)).toHaveLength(3)
  })

  it('keeps every consecRanks tier Away aligned with strip coverage', () => {
    const rack = screenshotRack()
    const p = NMJL_2026_PATTERNS.find((x) => x.id === 'nmjl2026:consec-5a')!
    const ranked = rankSuggestedHands({
      hand: rack,
      wallRemaining: 99,
      discards: [],
      exposures: [],
      patterns: [p],
    })

    for (const line of ranked.filter((l) => l.consecRanksTier)) {
      const c = line.consecRanksTier!.combos[0]!
      const strip = buildConsecRanksTierStripRow(p, rack, c.perm, c.base)
      expect(strip, `${c.perm.join('-')}@${c.base}`).toBeTruthy()
      const covered = strip!.filter((s) => s.highlight || s.jokerSuggested).length
      expect(covered, `${c.perm.join('-')}@${c.base}`).toBe(line.matchedInHand)
      expect(line.tilesNeededRough).toBe(Math.max(0, p.roughTarget - line.matchedInHand))
    }
  })
})
