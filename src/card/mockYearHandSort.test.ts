import { describe, expect, it } from 'vitest'
import { setActiveCardPatterns } from './activeCardPatternsScope'
import { PRACTICE_PATTERNS } from './mockCardBook'
import { sortHandForSuggestedPattern } from '../analysis/suggestedHands'
import type { TileInstance } from '../mahjong/types'

setActiveCardPatterns(PRACTICE_PATTERNS)

const ti = (def: TileInstance['def'], id: string): TileInstance => ({ id, def })
const lab = (t: TileInstance) => {
  const d = t.def
  if (d.cat === 'dragon') return d.dragon === 'soap' ? '0' : d.dragon[0]!.toUpperCase()
  if (d.cat === 'suit') return `${d.rank}${d.suit[0]!.toUpperCase()}`
  if (d.cat === 'flower') return 'F'
  if (d.cat === 'wind') return d.wind[0]!.toUpperCase()
  return '?'
}

describe('mock Year hands', () => {
  it('keeps 2019 digit order (2,1,9) in suit-permute / suit-locked groups', () => {
    const y2 = PRACTICE_PATTERNS.find((p) => p.id === 'year-2')!
    const sp = y2.groups?.find((g) => g.kind === 'suit-permute')
    expect(sp?.kind).toBe('suit-permute')
    if (sp?.kind !== 'suit-permute') return
    expect(sp.colorGroups[0]!.map((r) => r.rank)).toEqual([2, 1, 9])

    const y3 = PRACTICE_PATTERNS.find((p) => p.id === 'year-3')!
    const locked = y3.groups?.find((g) => g.kind === 'suit-locked')
    expect(locked?.kind).toBe('suit-locked')
    if (locked?.kind !== 'suit-locked') return
    expect(locked.rankNeeds.map((r) => r.rank)).toEqual([2, 1, 9])
  })

  it('Year #3 Any Dragons permutes dragon types (soap can fill either meld)', () => {
    const y3 = PRACTICE_PATTERNS.find((p) => p.id === 'year-3')!
    const perm = y3.groups?.find((g) => g.kind === 'dragon-meld-permute')
    expect(perm?.kind).toBe('dragon-meld-permute')
    if (perm?.kind !== 'dragon-meld-permute') return
    expect(perm.needs).toEqual([4, 3])
  })

  it('sorts a complete Year #2 rack into card order 2 0 1 9 GGG 2222 RRR', () => {
    const hand: TileInstance[] = [
      ti({ cat: 'suit', suit: 'bam', rank: 2 }, '2b'),
      ti({ cat: 'dragon', dragon: 'soap' }, 'soap'),
      ti({ cat: 'suit', suit: 'bam', rank: 1 }, '1b'),
      ti({ cat: 'suit', suit: 'bam', rank: 9 }, '9b'),
      ti({ cat: 'dragon', dragon: 'green' }, 'g1'),
      ti({ cat: 'dragon', dragon: 'green' }, 'g2'),
      ti({ cat: 'dragon', dragon: 'green' }, 'g3'),
      ti({ cat: 'suit', suit: 'crak', rank: 2 }, '2c1'),
      ti({ cat: 'suit', suit: 'crak', rank: 2 }, '2c2'),
      ti({ cat: 'suit', suit: 'crak', rank: 2 }, '2c3'),
      ti({ cat: 'suit', suit: 'crak', rank: 2 }, '2c4'),
      ti({ cat: 'dragon', dragon: 'red' }, 'r1'),
      ti({ cat: 'dragon', dragon: 'red' }, 'r2'),
      ti({ cat: 'dragon', dragon: 'red' }, 'r3'),
    ]
    const sorted = sortHandForSuggestedPattern(hand, 'year-2', {
      hand,
      wallRemaining: 50,
      discards: [],
      exposures: [],
      patterns: PRACTICE_PATTERNS,
    })
    expect(sorted.map(lab).join(' ')).toBe('2B 0 1B 9B G G G 2C 2C 2C 2C R R R')
  })

  it('sorts a partial Year #2 rack without parking a red dragon before the year digits', () => {
    const hand: TileInstance[] = [
      ti({ cat: 'dragon', dragon: 'red' }, 'r1'),
      ti({ cat: 'suit', suit: 'bam', rank: 1 }, '1b'),
      ti({ cat: 'dragon', dragon: 'green' }, 'g1'),
      ti({ cat: 'suit', suit: 'crak', rank: 2 }, '2c1'),
      ti({ cat: 'suit', suit: 'crak', rank: 2 }, '2c2'),
      ti({ cat: 'dragon', dragon: 'red' }, 'r2'),
      ti({ cat: 'dragon', dragon: 'red' }, 'r3'),
      ti({ cat: 'suit', suit: 'crak', rank: 6 }, '6c'),
      ti({ cat: 'wind', wind: 'south' }, 's'),
      ti({ cat: 'suit', suit: 'dot', rank: 8 }, '8d'),
      ti({ cat: 'suit', suit: 'dot', rank: 4 }, '4d1'),
      ti({ cat: 'suit', suit: 'dot', rank: 3 }, '3d'),
      ti({ cat: 'suit', suit: 'dot', rank: 4 }, '4d2'),
      ti({ cat: 'suit', suit: 'dot', rank: 2 }, '2d'),
    ]
    const sorted = sortHandForSuggestedPattern(hand, 'year-2', {
      hand,
      wallRemaining: 80,
      discards: [],
      exposures: [],
      patterns: PRACTICE_PATTERNS,
    })
    const best = sorted.map(lab).join(' ')
    // Best tiles left in card order; dim leftovers keep prior relative order.
    expect(best.startsWith('1B G 2C 2C R R R')).toBe(true)
    expect(best.startsWith('R ')).toBe(false)
    expect(best.startsWith('0 ')).toBe(false)
  })
})
