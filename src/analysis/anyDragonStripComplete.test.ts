import { describe, expect, it } from 'vitest'
import { NMJL_2026_PATTERNS } from '../card/nmjl2026Patterns'
import { patternLinePreviewDefs } from '../card/patternLinePreview'
import {
  buildSuggestedStripSlots,
  greedyPatternMatchDetail,
} from './suggestedHands'
import type { TileDef, TileInstance } from '../mahjong/types'

function tile(def: TileDef, id: string): TileInstance {
  return { id, def }
}

describe('singular Any Dragon hands keep a full 14-tile strip', () => {
  it('W&Ds #5 FFF NNNN FFF DDDD includes the dragon kong in groups and strip', () => {
    const p = NMJL_2026_PATTERNS.find((x) => x.id === 'nmjl2026:wd-5')
    expect(p).toBeDefined()
    expect(patternLinePreviewDefs(p!).length).toBe(14)

    const dragonFixed = p!.groups?.find(
      (g) =>
        g.kind === 'fixed' &&
        g.need === 4 &&
        g.test({ cat: 'dragon', dragon: 'red' }) &&
        g.test({ cat: 'dragon', dragon: 'green' }) &&
        g.test({ cat: 'dragon', dragon: 'soap' }),
    )
    expect(dragonFixed).toBeDefined()

    const rack: TileInstance[] = [
      tile({ cat: 'flower', flower: 1 }, 'f1'),
      tile({ cat: 'flower', flower: 2 }, 'f2'),
      tile({ cat: 'flower', flower: 3 }, 'f3'),
      tile({ cat: 'wind', wind: 'N' }, 'n1'),
      tile({ cat: 'wind', wind: 'N' }, 'n2'),
      tile({ cat: 'suit', suit: 'bam', rank: 3 }, 'b3'),
      tile({ cat: 'suit', suit: 'bam', rank: 6 }, 'b6'),
      tile({ cat: 'suit', suit: 'crak', rank: 6 }, 'c6'),
      tile({ cat: 'suit', suit: 'crak', rank: 9 }, 'c9'),
      tile({ cat: 'wind', wind: 'E' }, 'e'),
      tile({ cat: 'wind', wind: 'W' }, 'w'),
      tile({ cat: 'wind', wind: 'S' }, 's'),
    ]
    const detail = greedyPatternMatchDetail(rack, p!)
    const slots = buildSuggestedStripSlots(p!, rack, detail.usedOrder, new Set(detail.usedOrder), detail.usedMeta)
    expect(slots).toHaveLength(14)
    expect(slots.filter((s) => s.displayDef.cat === 'dragon')).toHaveLength(4)
  })

  it('Like #s #3 FF 1111 11 1111 DD includes the dragon pair in groups and strip', () => {
    const p = NMJL_2026_PATTERNS.find((x) => x.id === 'nmjl2026:like-3')
    expect(p).toBeDefined()
    expect(patternLinePreviewDefs(p!).length).toBe(14)

    const dragonFixed = p!.groups?.find(
      (g) =>
        g.kind === 'fixed' &&
        g.need === 2 &&
        g.test({ cat: 'dragon', dragon: 'red' }) &&
        g.test({ cat: 'dragon', dragon: 'green' }) &&
        g.test({ cat: 'dragon', dragon: 'soap' }),
    )
    expect(dragonFixed).toBeDefined()

    const rack: TileInstance[] = [
      tile({ cat: 'flower', flower: 1 }, 'f1'),
      tile({ cat: 'flower', flower: 2 }, 'f2'),
      tile({ cat: 'suit', suit: 'bam', rank: 4 }, 'b1'),
      tile({ cat: 'suit', suit: 'bam', rank: 4 }, 'b2'),
      tile({ cat: 'suit', suit: 'dot', rank: 4 }, 'd1'),
      tile({ cat: 'suit', suit: 'dot', rank: 4 }, 'd2'),
      tile({ cat: 'suit', suit: 'crak', rank: 4 }, 'c1'),
      tile({ cat: 'suit', suit: 'crak', rank: 4 }, 'c2'),
      tile({ cat: 'suit', suit: 'bam', rank: 3 }, 'junk1'),
      tile({ cat: 'suit', suit: 'bam', rank: 6 }, 'junk2'),
      tile({ cat: 'wind', wind: 'N' }, 'n'),
      tile({ cat: 'wind', wind: 'S' }, 's'),
    ]
    const detail = greedyPatternMatchDetail(rack, p!)
    const slots = buildSuggestedStripSlots(p!, rack, detail.usedOrder, new Set(detail.usedOrder), detail.usedMeta)
    expect(slots).toHaveLength(14)
    expect(slots.filter((s) => s.displayDef.cat === 'dragon')).toHaveLength(2)
  })

  it('still uses dragon-meld-permute for Any 2 / Any 3 Dragons hands', () => {
    const wd2 = NMJL_2026_PATTERNS.find((x) => x.id === 'nmjl2026:wd-2')!
    const wd7a = NMJL_2026_PATTERNS.find((x) => x.id === 'nmjl2026:wd-7a')!
    expect(wd2.groups?.some((g) => g.kind === 'dragon-meld-permute')).toBe(true)
    expect(wd7a.groups?.some((g) => g.kind === 'dragon-meld-permute')).toBe(true)
    expect(patternLinePreviewDefs(wd2).length).toBe(14)
    expect(patternLinePreviewDefs(wd7a).length).toBe(14)
  })
})
