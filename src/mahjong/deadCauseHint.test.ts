import { describe, expect, it } from 'vitest'
import { NMJL_2026_PATTERNS } from '../card/nmjl2026Patterns'
import { buildGreedyAlignedDeadHintNeeds } from '../analysis/suggestedHands'
import {
  buildPatternNeedVariants,
  firstShortfallInNeedMap,
  patternNeedVariantIsSatisfiable,
} from './deadHintVariants'
import { findFocusedPatternDeadCause, focusedLineJokerIneligibleNeedForDef } from './deadCauseHint'
import type { TileDef, TileInstance } from './types'

function tile(def: TileDef, id: string): TileInstance {
  return { id, def }
}

function totalCopiesForDeadHintDef(def: TileDef): number {
  if (def.cat === 'flower' || def.cat === 'joker') return 8
  if (def.cat === 'blank') return 6
  return 4
}

describe('findFocusedPatternDeadCause', () => {
  const consec4b = NMJL_2026_PATTERNS.find(
    (p) => p.section === 'CONSECUTIVE RUN' && p.cardHandCode === '4b',
  )

  it('finds CONSECUTIVE RUN 4b pattern', () => {
    expect(consec4b).toBeDefined()
    expect(consec4b!.title).toBe('111 222 3333 4444')
    // Any 2 suits: green pung pair + red kong pair (not a single all-green run).
    expect(consec4b!.titleSegments?.map((s) => s.ink)).toEqual(['green', 'red'])
    const sp = consec4b!.groups?.find((g) => g.kind === 'suit-permute')
    expect(sp?.kind).toBe('suit-permute')
    if (sp?.kind === 'suit-permute') expect(sp.colorGroups).toHaveLength(2)
  })

  it('369-4: 6 dot in the pung suit is not a pair dead-tile warning when other 6 dots are gone', () => {
    const p369_4 = NMJL_2026_PATTERNS.find(
      (x) => x.section === '369' && x.cardHandCode === '4',
    )
    expect(p369_4).toBeDefined()

    const rack = [
      tile({ cat: 'suit', suit: 'bam', rank: 3 }, '3b1'),
      tile({ cat: 'suit', suit: 'bam', rank: 3 }, '3b2'),
      tile({ cat: 'suit', suit: 'bam', rank: 6 }, '6b'),
      tile({ cat: 'suit', suit: 'dot', rank: 6 }, '6d'),
      tile({ cat: 'suit', suit: 'dot', rank: 9 }, '9d1'),
      tile({ cat: 'suit', suit: 'dot', rank: 9 }, '9d2'),
      tile({ cat: 'suit', suit: 'dot', rank: 9 }, '9d3'),
      tile({ cat: 'wind', wind: 'N' }, 'n'),
      tile({ cat: 'wind', wind: 'E' }, 'e'),
      tile({ cat: 'wind', wind: 'W' }, 'w'),
      tile({ cat: 'wind', wind: 'S' }, 's'),
      tile({ cat: 'joker' }, 'j1'),
      tile({ cat: 'joker' }, 'j2'),
      tile({ cat: 'suit', suit: 'crak', rank: 7 }, '7c'),
    ]

    expect(
      focusedLineJokerIneligibleNeedForDef(
        p369_4!.id,
        { cat: 'suit', suit: 'dot', rank: 6 },
        NMJL_2026_PATTERNS,
        rack,
      ),
    ).toBeNull()

    const unavailableByKey = new Map<string, number>([['s:dot:6', 3]])
    expect(
      findFocusedPatternDeadCause(
        p369_4!.id,
        unavailableByKey,
        NMJL_2026_PATTERNS,
        totalCopiesForDeadHintDef,
        { rack },
      ),
    ).toBeNull()
  })

  it('does not warn when a kong shortfall is coverable by jokers in hand and on table', () => {
    const unavailableByKey = new Map<string, number>([
      ['s:crak:5', 1],
      ['s:crak:6', 1],
      ['s:crak:7', 3],
      ['s:crak:8', 3],
      ['j', 3],
    ])

    const rack = [
      tile({ cat: 'joker' }, 'j1'),
      tile({ cat: 'joker' }, 'j2'),
      tile({ cat: 'joker' }, 'j3'),
      tile({ cat: 'suit', suit: 'crak', rank: 8 }, '8c'),
      tile({ cat: 'suit', suit: 'crak', rank: 1 }, '1c'),
      tile({ cat: 'suit', suit: 'crak', rank: 4 }, '4c'),
      tile({ cat: 'suit', suit: 'bam', rank: 7 }, '7b'),
    ]

    const variants = buildPatternNeedVariants(consec4b!)
    const anyViable = variants.some((needs) =>
      patternNeedVariantIsSatisfiable(needs, unavailableByKey, totalCopiesForDeadHintDef),
    )
    expect(anyViable).toBe(true)

    const greedyNeeds = buildGreedyAlignedDeadHintNeeds(consec4b!, rack)
    expect([...greedyNeeds.values()].every((e) => e.need <= 2 || e.canUseJoker)).toBe(true)

    const cause = findFocusedPatternDeadCause(
      consec4b!.id,
      unavailableByKey,
      NMJL_2026_PATTERNS,
      totalCopiesForDeadHintDef,
      { rack },
    )
    expect(cause).toBeNull()
  })

  it('does not warn for joker-eligible melds even when naturals and jokers look exhausted', () => {
    const unavailableByKey = new Map<string, number>([
      ['s:crak:8', 4],
      ['j', 7],
    ])
    const variants = buildPatternNeedVariants(consec4b!)
    const needs = variants.find((v) =>
      [...v.values()].some(
        (e) => e.def.cat === 'suit' && e.def.suit === 'crak' && e.def.rank === 4 && e.need === 4,
      ),
    )
    expect(needs).toBeDefined()
    expect(
      firstShortfallInNeedMap(needs!, unavailableByKey, totalCopiesForDeadHintDef),
    ).toBeNull()

    const cause = findFocusedPatternDeadCause(
      consec4b!.id,
      unavailableByKey,
      NMJL_2026_PATTERNS,
      totalCopiesForDeadHintDef,
    )
    expect(cause).toBeNull()
  })

  it('warns when a pair slot is short on naturals', () => {
    const needs = new Map([
      [
        's:dot:2',
        {
          def: { cat: 'suit', suit: 'dot', rank: 2 } as TileDef,
          need: 2,
          canUseJoker: false,
        },
      ],
    ])
    const unavailableByKey = new Map<string, number>([['s:dot:2', 4]])

    expect(firstShortfallInNeedMap(needs, unavailableByKey, totalCopiesForDeadHintDef)).toEqual({
      defs: [{ cat: 'suit', suit: 'dot', rank: 2 }],
      need: 2,
      available: 0,
    })
  })
})
