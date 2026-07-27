import { describe, expect, it } from 'vitest'
import { PRACTICE_PATTERNS } from '../card/mockCardBook'
import { NMJL_2026_PATTERNS } from '../card/nmjl2026Patterns'
import { patternLinePreviewSlots } from '../card/patternLinePreview'
import { listOpenHandsFittingClaimMelds } from './eastExposurePatternFit'
import { placeExposureMeldsOnCardLine } from './botExposureHandStrip'
import { resolveCardLineDefsForClaimMelds } from './suggestedHands'
import type { TileInstance } from '../mahjong/types'

function dragon(d: 'green' | 'red' | 'soap', id: string): TileInstance {
  return { id, def: { cat: 'dragon', dragon: d } }
}

function soap(id: string): TileInstance {
  return dragon('soap', id)
}

function dots(rank: number, ids: string[]): TileInstance[] {
  return ids.map((id) => ({ id, def: { cat: 'suit' as const, suit: 'dot' as const, rank } }))
}

function label(def: { cat: string; dragon?: string; suit?: string; rank?: number }) {
  if (def.cat === 'dragon') return `${(def.dragon ?? '?')[0]}D`
  if (def.cat === 'suit') return `${def.rank}${def.suit![0]}`
  if (def.cat === 'flower') return 'F'
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

describe('resolveCardLineDefsForClaimMelds', () => {
  it('shifts Runs 11 22 333 to 77 88 999 for an exposed pung of 9 dots', () => {
    const melds = [{ tiles: dots(9, ['a', 'b', 'c']) }]
    const fitting = listOpenHandsFittingClaimMelds(melds, NMJL_2026_PATTERNS)
    const runs5a = fitting.find((p) => p.cardHandCode === '5a' && /11 22 333/.test(p.title))
    expect(runs5a).toBeTruthy()

    const resolved = resolveCardLineDefsForClaimMelds(runs5a!, melds)
    expect(resolved.map(label).join(' ')).toBe('F F F 7d 7d 8d 8d 9d 9d 9d sD sD sD sD')

    const placed = placeExposureMeldsOnCardLine(resolved, melds)
    const labs = placed.defs.map((d, i) => `${label(d)}${placed.meldRunId[i] != null ? '*' : ''}`)
    expect(labs.join(' ')).toBe('F F F 7d 7d 8d 8d 9d* 9d* 9d* sD sD sD sD')
  })

  it('keeps literal 13579 999 boxed on the printed 9s', () => {
    const melds = [{ tiles: dots(9, ['a', 'b', 'c']) }]
    const p = listOpenHandsFittingClaimMelds(melds, NMJL_2026_PATTERNS).find((x) =>
      x.title.includes('55 77 999'),
    )!
    const resolved = resolveCardLineDefsForClaimMelds(p, melds)
    const placed = placeExposureMeldsOnCardLine(resolved, melds)
    const labs = placed.defs.map((d, i) => `${label(d)}${placed.meldRunId[i] != null ? '*' : ''}`)
    expect(labs.join(' ')).toContain('9d* 9d* 9d*')
  })

  it('maps a pung of 7 craks onto pung slots, not kongs, for Runs 3 / 4a / 4b', () => {
    const melds = [
      {
        tiles: [
          { id: 'a', def: { cat: 'suit', suit: 'crak', rank: 7 } },
          { id: 'b', def: { cat: 'joker' } },
          { id: 'c', def: { cat: 'suit', suit: 'crak', rank: 7 } },
        ] as TileInstance[],
      },
    ]
    const fitting = listOpenHandsFittingClaimMelds(melds, NMJL_2026_PATTERNS)
    for (const code of ['3', '4a', '4b'] as const) {
      const p = fitting.find((x) => x.cardHandCode === code && /3333/.test(x.title))
      expect(p, code).toBeTruthy()
      const resolved = resolveCardLineDefsForClaimMelds(p!, melds)
      const placed = placeExposureMeldsOnCardLine(resolved, melds)
      const labs = placed.defs.map((d, i) => `${label(d)}${placed.meldRunId[i] != null ? '*' : ''}`)
      // Exactly three boxed 7c tiles — never a fourth unboxed 7c from a kong stand-in.
      const boxed7c = labs.filter((x) => x === '7c*')
      const any7c = labs.filter((x) => x.startsWith('7c'))
      expect(boxed7c, `${code}: ${labs.join(' ')}`).toHaveLength(3)
      expect(any7c, `${code}: ${labs.join(' ')}`).toHaveLength(3)
    }
  })

  it('keeps W&D #2 dragon melds as three distinct types when a soap pung is exposed', () => {
    const melds = [{ tiles: [soap('s1'), soap('s2'), soap('s3')] }]
    const p = listOpenHandsFittingClaimMelds(melds, NMJL_2026_PATTERNS).find((x) =>
      x.title.includes('1234 DDD DDD DDDD'),
    )!
    const resolved = resolveCardLineDefsForClaimMelds(p, melds)
    const dragons = resolved.filter((d) => d.cat === 'dragon').map((d) => d.dragon)
    expect(dragons).toHaveLength(10)
    expect(new Set(dragons).size, dragons.join(' ')).toBe(3)

    const placed = placeExposureMeldsOnCardLine(resolved, melds)
    const labs = placed.defs.map((d, i) => `${label(d)}${placed.meldRunId[i] != null ? '*' : ''}`)
    expect(labs.filter((x) => x === 'sD*')).toHaveLength(3)
    // Unboxed dragons still include the other two card types (not all soap).
    const unboxedDragons = placed.defs
      .map((d, i) => (placed.meldRunId[i] == null && d.cat === 'dragon' ? d.dragon : null))
      .filter((d): d is NonNullable<typeof d> => d != null)
    expect(new Set(unboxedDragons).size, labs.join(' ')).toBeGreaterThanOrEqual(2)
  })

  it('shows even like-number stand-ins for W&Ds #4 when only an East pung is exposed', () => {
    const melds = [
      {
        tiles: [
          { id: 'a', def: { cat: 'wind' as const, wind: 'E' as const } },
          { id: 'b', def: { cat: 'joker' as const } },
          { id: 'c', def: { cat: 'joker' as const } },
        ] as TileInstance[],
      },
    ]
    const p = listOpenHandsFittingClaimMelds(melds, NMJL_2026_PATTERNS).find(
      (x) => x.cardHandCode === '4' && /EEE 2222 2222 WWW/.test(x.title),
    )
    expect(p).toBeTruthy()

    const resolved = resolveCardLineDefsForClaimMelds(p!, melds)
    const suitRanks = resolved
      .filter((d): d is Extract<(typeof resolved)[number], { cat: 'suit' }> => d.cat === 'suit')
      .map((d) => d.rank)
    expect(suitRanks).toHaveLength(8)
    expect(suitRanks.every((r) => r % 2 === 0), suitRanks.join(',')).toBe(true)
    expect(new Set(suitRanks).size).toBe(1)
  })

  it('maps an exposed pung of 1-bams onto the pung column for Like #s FFF 1111 111 1111', () => {
    const melds = [
      {
        tiles: [
          { id: 'a', def: { cat: 'suit', suit: 'bam', rank: 1 } },
          { id: 'b', def: { cat: 'suit', suit: 'bam', rank: 1 } },
          { id: 'c', def: { cat: 'suit', suit: 'bam', rank: 1 } },
        ] as TileInstance[],
      },
    ]
    const p = listOpenHandsFittingClaimMelds(melds, PRACTICE_PATTERNS).find(
      (x) => x.id === 'like-1' && x.title === 'FFF 1111 111 1111',
    )
    expect(p).toBeTruthy()

    const resolved = resolveCardLineDefsForClaimMelds(p!, melds)
    expect(resolved.map(label).join(' ')).toMatch(/^F F F \S+ \S+ \S+ \S+ 1b 1b 1b \S+ \S+ \S+ \S+$/)

    const placed = placeExposureMeldsOnCardLine(resolved, melds)
    const labs = placed.defs.map((d, i) => `${label(d)}${placed.meldRunId[i] != null ? '*' : ''}`)
    // Bam pung must box on the size-3 column — never paint 1-bams as a kong stand-in.
    expect(labs.filter((x) => x === '1b*'), labs.join(' ')).toHaveLength(3)
    expect(labs.filter((x) => x.startsWith('1b')), labs.join(' ')).toHaveLength(3)
    const boxed = labs
      .map((x, i) => (x === '1b*' ? i : -1))
      .filter((i) => i >= 0)
    expect(boxed).toEqual([7, 8, 9])
  })
})
