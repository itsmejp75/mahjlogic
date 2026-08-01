import { describe, expect, it } from 'vitest'
import { NMJL_2026_PATTERNS } from '../card/nmjl2026Patterns'
import {
  computeRackPatternHighlightIds,
  greedyPatternMatchDetail,
  jokerSwapHandHintUsesSingleBounceIteration,
} from './suggestedHands'
import type { TileDef, TileInstance } from '../mahjong/types'

function tile(def: TileDef, id: string): TileInstance {
  return { id, def }
}

describe('jokerSwapHandHintUsesSingleBounceIteration', () => {
  // W&D #2: 1234 + dragon melds — lit dragons sit on joker-eligible pung/kong slots.
  const p = NMJL_2026_PATTERNS.find((x) => x.title.includes('1234 DDD DDD DDDD'))!

  const rack: TileInstance[] = [
    tile({ cat: 'suit', suit: 'bam', rank: 6 }, 'b6'),
    tile({ cat: 'suit', suit: 'bam', rank: 7 }, 'b7'),
    tile({ cat: 'suit', suit: 'bam', rank: 8 }, 'b8'),
    tile({ cat: 'suit', suit: 'bam', rank: 9 }, 'b9'),
    tile({ cat: 'dragon', dragon: 'green' }, 'g1'),
    tile({ cat: 'dragon', dragon: 'green' }, 'g2'),
    tile({ cat: 'dragon', dragon: 'green' }, 'g3'),
    tile({ cat: 'dragon', dragon: 'red' }, 'r1'),
    tile({ cat: 'dragon', dragon: 'red' }, 'r2'),
    tile({ cat: 'dragon', dragon: 'red' }, 'r3'),
    tile({ cat: 'dragon', dragon: 'soap' }, 's1'),
    tile({ cat: 'dragon', dragon: 'soap' }, 's2'),
    tile({ cat: 'dragon', dragon: 'soap' }, 's3'),
    tile({ cat: 'suit', suit: 'dot', rank: 2 }, 'd2'),
  ]

  it('uses a single bounce when a swappable natural is lit for the focused hand', () => {
    const detail = greedyPatternMatchDetail(rack, p)
    const bestIds = computeRackPatternHighlightIds(rack, p, detail)
    expect(bestIds.has('g1')).toBe(true)

    expect(
      jokerSwapHandHintUsesSingleBounceIteration({
        focusKey: p.id,
        suppressedFocusKey: null,
        lineFocusActive: true,
        patterns: NMJL_2026_PATTERNS,
        rack,
        bounceHandIds: new Set(['g1']),
        exposureTileIds: undefined,
      }),
    ).toBe(true)
  })

  it('keeps the full bounce loop when the swappable natural is not needed by the focused hand', () => {
    const detail = greedyPatternMatchDetail(rack, p)
    const bestIds = computeRackPatternHighlightIds(rack, p, detail)
    expect(bestIds.has('d2')).toBe(false)

    expect(
      jokerSwapHandHintUsesSingleBounceIteration({
        focusKey: p.id,
        suppressedFocusKey: null,
        lineFocusActive: true,
        patterns: NMJL_2026_PATTERNS,
        rack,
        bounceHandIds: new Set(['d2']),
        exposureTileIds: undefined,
      }),
    ).toBe(false)
  })

  it('does not single-bounce when no suggested line is focused', () => {
    expect(
      jokerSwapHandHintUsesSingleBounceIteration({
        focusKey: p.id,
        suppressedFocusKey: null,
        lineFocusActive: false,
        patterns: NMJL_2026_PATTERNS,
        rack,
        bounceHandIds: new Set(['g1']),
        exposureTileIds: undefined,
      }),
    ).toBe(false)
  })
})
