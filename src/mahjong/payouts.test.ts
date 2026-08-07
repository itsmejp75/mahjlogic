import { describe, expect, it } from 'vitest'
import {
  effectiveMahjongBasePoints,
  handUsesJoker,
  isSinglesAndPairsSection,
  nonWinnerPaysPoints,
  winnerCollectsPoints,
} from './payouts'

describe('jokerless Mah Jongg base value', () => {
  it('recognizes Singles and Pairs section case-insensitively', () => {
    expect(isSinglesAndPairsSection('SINGLES AND PAIRS')).toBe(true)
    expect(isSinglesAndPairsSection(' singles and pairs ')).toBe(true)
    expect(isSinglesAndPairsSection('2468')).toBe(false)
  })

  it('detects jokers in the winning tile set', () => {
    expect(handUsesJoker([{ def: { cat: 'suit' } }, { def: { cat: 'joker' } }])).toBe(true)
    expect(handUsesJoker([{ def: { cat: 'suit' } }, { def: { cat: 'dragon' } }])).toBe(false)
  })

  it('doubles card value when the hand has no joker', () => {
    expect(
      effectiveMahjongBasePoints(25, { section: '2468', usesJoker: false }),
    ).toBe(50)
  })

  it('does not double when a joker was used', () => {
    expect(
      effectiveMahjongBasePoints(25, { section: '2468', usesJoker: true }),
    ).toBe(25)
  })

  it('does not double Singles and Pairs even without jokers', () => {
    expect(
      effectiveMahjongBasePoints(50, { section: 'SINGLES AND PAIRS', usesJoker: false }),
    ).toBe(50)
  })
})

describe('table multipliers use the effective base', () => {
  it('self-pick jokerless 25 → base 50 → winner collects 300', () => {
    const base = effectiveMahjongBasePoints(25, { section: 'LIKE NUMBERS', usesJoker: false })
    expect(winnerCollectsPoints(base, 'self-draw')).toBe(300)
  })

  it('discard win jokerless 25 → base 50 → winner collects 200', () => {
    const base = effectiveMahjongBasePoints(25, { section: 'LIKE NUMBERS', usesJoker: false })
    expect(winnerCollectsPoints(base, 'called-discard')).toBe(200)
    expect(nonWinnerPaysPoints(base, 'called-discard', true)).toBe(100)
    expect(nonWinnerPaysPoints(base, 'called-discard', false)).toBe(50)
  })
})
