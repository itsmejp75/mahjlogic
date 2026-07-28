import { describe, expect, it } from 'vitest'
import { NMJL_2026_PATTERNS } from '../card/nmjl2026Patterns'
import { claimMeldsFitPracticePattern } from './eastExposurePatternFit'
import { rankSuggestedHands } from './suggestedHands'
import type { TileDef, TileInstance } from '../mahjong/types'

function tile(def: TileDef, id: string): TileInstance {
  return { id, def }
}

/** Screenshot repro: W&Ds #3 with NNN exposed; call staging a 5-dot kong before the joker. */
describe('call-staging undersize claim fit (incomplete kong)', () => {
  const wd3 = NMJL_2026_PATTERNS.find(
    (p) => p.section === 'WINDS - DRAGONS' && p.cardHandCode === '3',
  )!

  const northPung = {
    tiles: [
      tile({ cat: 'wind', wind: 'N' }, 'n1'),
      tile({ cat: 'wind', wind: 'N' }, 'n2'),
      tile({ cat: 'wind', wind: 'N' }, 'n3'),
    ],
  }

  /** Called 5-dot + two 5-dots from hand — pung-sized partial toward kong. */
  const incompleteFiveKong = {
    tiles: [
      tile({ cat: 'suit', suit: 'dot', rank: 5 }, 'd5-called'),
      tile({ cat: 'suit', suit: 'dot', rank: 5 }, 'd5a'),
      tile({ cat: 'suit', suit: 'dot', rank: 5 }, 'd5b'),
    ],
  }

  const completeFiveKong = {
    tiles: [
      ...incompleteFiveKong.tiles,
      tile({ cat: 'joker' }, 'j-kong'),
    ],
  }

  it('exact fit rejects incomplete kong of 5s against W&Ds #3 when NNN is locked', () => {
    expect(claimMeldsFitPracticePattern(wd3, [northPung, incompleteFiveKong])).toBe(false)
  })

  it('allowUndersize on the staging meld keeps W&Ds #3 while kong is incomplete', () => {
    expect(
      claimMeldsFitPracticePattern(wd3, [northPung, incompleteFiveKong], {
        allowUndersizeAtIndexes: new Set([1]),
      }),
    ).toBe(true)
  })

  it('does not relax committed melds — undersize only applies at listed indexes', () => {
    // Mark only the wind pung as undersize; the incomplete kong stays exact → still no fit.
    expect(
      claimMeldsFitPracticePattern(wd3, [northPung, incompleteFiveKong], {
        allowUndersizeAtIndexes: new Set([0]),
      }),
    ).toBe(false)
  })

  it('rankSuggestedHands keeps W&Ds #3 in the tray during undersize staging', () => {
    const hand = [
      tile({ cat: 'suit', suit: 'bam', rank: 5 }, 'b5a'),
      tile({ cat: 'suit', suit: 'bam', rank: 5 }, 'b5b'),
      tile({ cat: 'suit', suit: 'bam', rank: 5 }, 'b5c'),
      tile({ cat: 'suit', suit: 'bam', rank: 5 }, 'b5d'),
      tile({ cat: 'wind', wind: 'S' }, 's1'),
      tile({ cat: 'wind', wind: 'S' }, 's2'),
      tile({ cat: 'joker' }, 'j-hand'),
    ]

    const without = rankSuggestedHands({
      hand,
      wallRemaining: 60,
      discards: [],
      exposures: [],
      playerClaimMelds: [northPung, incompleteFiveKong],
      patterns: NMJL_2026_PATTERNS,
    })
    expect(without.some((l) => l.id === wd3.id)).toBe(false)

    const withUndersize = rankSuggestedHands({
      hand,
      wallRemaining: 60,
      discards: [],
      exposures: [],
      playerClaimMelds: [northPung, incompleteFiveKong],
      allowUndersizeClaimMeldIndexes: [1],
      patterns: NMJL_2026_PATTERNS,
    })
    expect(withUndersize.some((l) => l.id === wd3.id)).toBe(true)

    const afterComplete = rankSuggestedHands({
      hand: hand.filter((t) => t.id !== 'j-hand'),
      wallRemaining: 60,
      discards: [],
      exposures: [],
      playerClaimMelds: [northPung, completeFiveKong],
      patterns: NMJL_2026_PATTERNS,
    })
    expect(afterComplete.some((l) => l.id === wd3.id)).toBe(true)
  })
})
