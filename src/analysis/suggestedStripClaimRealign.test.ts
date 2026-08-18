import { describe, expect, it } from 'vitest'
import { NMJL_2026_PATTERNS } from '../card/nmjl2026Patterns'
import { tileInstancesWithClaimMeldJokersResolved } from './eastExposurePatternFit'
import {
  buildSuggestedStripSlots,
  computeRackPatternHighlightIds,
  greedyPatternMatchDetail,
} from './suggestedHands'
import type { TileDef, TileInstance } from '../mahjong/types'

function tile(def: TileDef, id: string): TileInstance {
  return { id, def }
}

function label(d: TileDef): string {
  if (d.cat === 'suit') return `${d.rank}${d.suit[0]}`
  if (d.cat === 'joker') return 'J'
  return d.cat
}

describe('suggested strip realigns after claim expose', () => {
  it('Runs 4a: exposed 7c pung (+joker) remaps to 666 777* 8888 9999', () => {
    const p = NMJL_2026_PATTERNS.find(
      (x) => x.cardHandCode === '4a' && x.title.includes('111 222 3333 4444'),
    )!
    const hand: TileInstance[] = [
      tile({ cat: 'suit', suit: 'crak', rank: 4 }, 'c4'),
      tile({ cat: 'suit', suit: 'bam', rank: 2 }, 'b2'),
      tile({ cat: 'wind', wind: 'S' }, 's'),
      tile({ cat: 'wind', wind: 'W' }, 'w'),
      tile({ cat: 'suit', suit: 'dot', rank: 7 }, 'd7a'),
      tile({ cat: 'suit', suit: 'dot', rank: 5 }, 'd5'),
      tile({ cat: 'wind', wind: 'N' }, 'n'),
      tile({ cat: 'suit', suit: 'crak', rank: 2 }, 'c2'),
      tile({ cat: 'joker' }, 'jHand'),
      tile({ cat: 'suit', suit: 'dot', rank: 7 }, 'd7b'),
      tile({ cat: 'suit', suit: 'dot', rank: 4 }, 'd4'),
    ]
    const expA = tile({ cat: 'suit', suit: 'crak', rank: 7 }, 'e7a')
    const expB = tile({ cat: 'suit', suit: 'crak', rank: 7 }, 'e7b')
    const expJ = tile({ cat: 'joker' }, 'eJ')
    const melds = [{ tiles: [expA, expB, expJ] }]
    const exposureIds = new Set([expA.id, expB.id, expJ.id])
    const rackDisplay = [...hand, expA, expB, expJ]
    const rackMatch = tileInstancesWithClaimMeldJokersResolved(hand, melds)

    const detail = greedyPatternMatchDetail(rackMatch, p, { exposureTileIds: exposureIds })
    const bestIds = computeRackPatternHighlightIds(rackMatch, p, detail, exposureIds)
    const slots = buildSuggestedStripSlots(
      p,
      rackDisplay,
      detail.usedOrder,
      bestIds,
      detail.usedMeta,
      exposureIds,
      melds,
    )

    const labs = slots.map(
      (s) => `${label(s.displayDef)}${s.exposureMeldId != null ? '*' : ''}`,
    )
    expect(labs.join(' ')).toBe('6c 6c 6c 7c* 7c* 7c* 8c 8c 8c 8c 9c 9c 9c 9c')
    const boxed = slots.filter((s) => s.exposureMeldId != null)
    expect(boxed).toHaveLength(3)
    expect(boxed.every((s) => s.highlight)).toBe(true)
    expect(boxed.filter((s) => s.jokerSuggested).map((s) => s.tileId)).toEqual(['eJ'])
    expect(labs.some((x) => x.startsWith('4c'))).toBe(false)
  })
})
