import { describe, expect, it } from 'vitest'
import { NMJL_2026_PATTERNS } from '../card/nmjl2026CardBook'
import { countOpenHandsFittingClaimMelds } from './eastExposurePatternFit'

describe('countOpenHandsFittingClaimMelds', () => {
  it('returns 0 with no melds', () => {
    expect(countOpenHandsFittingClaimMelds([])).toBe(0)
  })

  it('counts open 2026 lines for FFF + pung of 5 dots', () => {
    const melds = [
      {
        tiles: [
          { id: 'f1', def: { cat: 'flower' as const, flower: 3 } },
          { id: 'f2', def: { cat: 'flower' as const, flower: 1 } },
          { id: 'f3', def: { cat: 'flower' as const, flower: 2 } },
        ],
      },
      {
        tiles: [
          { id: 'd1', def: { cat: 'suit' as const, suit: 'dot' as const, rank: 5 } },
          { id: 'j1', def: { cat: 'joker' as const } },
          { id: 'd2', def: { cat: 'suit' as const, suit: 'dot' as const, rank: 5 } },
        ],
      },
    ]
    expect(countOpenHandsFittingClaimMelds(melds, NMJL_2026_PATTERNS)).toBe(3)
  })
})
