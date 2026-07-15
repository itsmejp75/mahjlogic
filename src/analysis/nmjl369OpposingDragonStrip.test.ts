import { describe, expect, it } from 'vitest'
import { NMJL_2026_PATTERNS } from '../card/nmjl2026Patterns'
import { patternLinePreviewGroupOrderDefs, patternLinePreviewSlots } from '../card/patternLinePreview'
import { placeExposureMeldsOnCardLine } from './botExposureHandStrip'
import { listOpenHandsFittingClaimMelds } from './eastExposurePatternFit'
import { groupPreviewIndexSpans, resolveCardLineDefsForClaimMelds } from './suggestedHands'
import type { TileInstance } from '../mahjong/types'

function label(d: { cat: string; suit?: string; rank?: number; dragon?: string }): string {
  if (d.cat === 'suit') return `${d.rank}${d.suit![0]}`
  if (d.cat === 'dragon') return d.dragon === 'soap' ? 'sD' : d.dragon === 'any' ? 'aD' : d.dragon![0] + 'D'
  if (d.cat === 'flower') return 'F'
  return d.cat
}

describe('369-3b opposing single DDDD', () => {
  const melds = [
    {
      tiles: [
        { id: 'a', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 6 } },
        { id: 'b', def: { cat: 'joker' as const } },
        { id: 'c', def: { cat: 'suit' as const, suit: 'crak' as const, rank: 6 } },
      ] as TileInstance[],
    },
  ]

  it('models eitherType so group defs match the 14-tile title line', () => {
    const p = NMJL_2026_PATTERNS.find((x) => x.section === '369' && x.cardHandCode === '3b')!
    const opp = p.groups?.find((g) => g.kind === 'suit-locked')
    expect(opp && opp.kind === 'suit-locked' && opp.opposingDragons).toEqual({
      need: 4,
      eitherType: true,
    })
    expect(patternLinePreviewGroupOrderDefs(p)).toHaveLength(14)
    expect(patternLinePreviewSlots(p)).toHaveLength(14)
    expect(groupPreviewIndexSpans(p)).toEqual([
      [0, 3],
      [3, 14],
    ])
  })

  it('resolves exposed 6-crak pung onto 666 and boxes it (not stand-in bams)', () => {
    const fitting = listOpenHandsFittingClaimMelds(melds, NMJL_2026_PATTERNS)
    const p3b = fitting.find((p) => p.cardHandCode === '3b' && p.section === '369')
    expect(p3b).toBeTruthy()

    const resolved = resolveCardLineDefsForClaimMelds(p3b!, melds)
    expect(resolved.map(label).join(' ')).toMatch(/^F F F 3c 3c 6c 6c 6c 9c 9c /)

    const placed = placeExposureMeldsOnCardLine(resolved, melds)
    const labs = placed.defs.map((d, i) => `${label(d)}${placed.meldRunId[i] != null ? '*' : ''}`)
    expect(labs.join(' ')).toContain('6c* 6c* 6c*')
    expect(labs.filter((x) => x.startsWith('6b'))).toHaveLength(0)
  })
})
