import { describe, expect, it } from 'vitest'
import { NMJL_2026_PATTERNS } from '../card/nmjl2026Patterns'
import { patternLinePreviewSlots } from '../card/patternLinePreview'
import { listOpenHandsFittingClaimMelds } from './eastExposurePatternFit'
import { placeExposureMeldsOnCardLine } from './botExposureHandStrip'
import type { TileInstance } from '../mahjong/types'

function dragon(d: 'green' | 'red' | 'soap', id: string): TileInstance {
  return { id, def: { cat: 'dragon', dragon: d } }
}

function soap(id: string): TileInstance {
  return dragon('soap', id)
}

function label(def: { cat: string; dragon?: string; suit?: string; rank?: number }) {
  if (def.cat === 'dragon') return `${(def.dragon ?? '?')[0]}D`
  if (def.cat === 'suit') return `${def.rank}${def.suit![0]}`
  return def.cat
}

describe('placeExposureMeldsOnCardLine', () => {
  it('places a green pung on the green DDD of W&D #2, not the soap kong', () => {
    const melds = [{ tiles: [dragon('green', 'g1'), dragon('green', 'g2'), dragon('green', 'g3')] }]
    const p = listOpenHandsFittingClaimMelds(melds, NMJL_2026_PATTERNS).find((x) =>
      x.title.includes('1234 DDD DDD DDDD'),
    )!
    const preview = patternLinePreviewSlots(p)
    expect(preview.map((s) => label(s.def)).join(' ')).toBe('1d 2d 3d 4d gD gD gD rD rD rD sD sD sD sD')

    const placed = placeExposureMeldsOnCardLine(
      preview.map((s) => s.def),
      melds,
    )
    const labs = placed.defs.map((d, i) => `${label(d)}${placed.meldRunId[i] != null ? '*' : ''}`)
    expect(labs.join(' '), labs.join(' ')).toBe('1d 2d 3d 4d gD* gD* gD* rD rD rD sD sD sD sD')
  })

  it('boxes a soap pung on Year / 2468 / W&D fitting lines without using a kong slot', () => {
    const melds = [{ tiles: [soap('s1'), soap('s2'), soap('s3')] }]
    const fitting = listOpenHandsFittingClaimMelds(melds, NMJL_2026_PATTERNS)
    for (const title of [
      '222 000 2222 6666',
      '2026 DDD 2222 DDD',
      '2222 DDD 8888 DDD',
      '1234 DDD DDD DDDD',
    ]) {
      const p = fitting.find((x) => x.title === title)
      expect(p, title).toBeTruthy()
      const preview = patternLinePreviewSlots(p!)
      const placed = placeExposureMeldsOnCardLine(
        preview.map((s) => s.def),
        melds,
      )
      const boxed = placed.meldRunId
        .map((id, i) => (id === 0 ? i : -1))
        .filter((i) => i >= 0)
      expect(boxed, title).toHaveLength(3)
      expect(boxed[1]).toBe(boxed[0]! + 1)
      expect(boxed[2]).toBe(boxed[0]! + 2)
      expect(
        placed.defs
          .slice(boxed[0], boxed[0]! + 3)
          .every((d) => d.cat === 'dragon' && d.dragon === 'soap'),
      ).toBe(true)
    }
  })
})
