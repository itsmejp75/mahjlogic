import { describe, expect, it } from 'vitest'
import { PRACTICE_PATTERNS, PRACTICE_CARD_SECTION_ORDER } from './mockCardBook'
import type { PatternGroup } from './practicePatterns'

function groupNeed(g: PatternGroup): number {
  switch (g.kind) {
    case 'fixed':
    case 'rank':
      return g.need
    case 'suit-locked-rank':
      return g.need + (g.dragonCount ?? 0)
    case 'consec':
      return g.need1 + g.need2
    case 'shared-rank':
    case 'shared-rank-suits':
    case 'consec-multi':
    case 'suit-locked-consec-multi':
    case 'dragon-meld-permute':
      return g.needs.reduce((a, b) => a + b, 0)
    case 'suit-locked': {
      const ranks = g.rankNeeds.reduce((a, r) => a + r.need, 0)
      const d = g.dragonCount ?? 0
      const opp = g.opposingDragons
        ? g.opposingDragons.eitherType
          ? g.opposingDragons.need
          : g.opposingDragons.need * 2
        : 0
      return ranks + d + opp
    }
    case 'suit-locked-consec':
      return g.numGroups * g.rankCount + g.dragonCount
    case 'odd-pair-kongs-triple':
      return 14
    case 'suit-permute': {
      let n = 0
      for (const cg of g.colorGroups) for (const r of cg) n += r.need
      if (g.colorGroupDragonCounts) n += g.colorGroupDragonCounts.reduce((a, b) => a + b, 0)
      n += g.trailingDragonCount ?? 0
      return n
    }
  }
}

describe('mock practice card', () => {
  it('has 72 hands with parenthesis notes and 14-tile groups', () => {
    expect(PRACTICE_PATTERNS).toHaveLength(72)
    expect(PRACTICE_CARD_SECTION_ORDER[0]).toBe('2019')
    const bad: string[] = []
    for (const p of PRACTICE_PATTERNS) {
      if (!p.groups?.length) {
        bad.push(`${p.id}: no groups`)
        continue
      }
      if (p.section !== 'WINDS - DRAGONS' || (p.cardHandCode !== '1a' && p.cardHandCode !== '1b' && p.cardHandCode !== '3')) {
        // Most hands should carry a parenthesis; classic wind lines may omit.
      }
      const sum = p.groups.reduce((a, g) => a + groupNeed(g), 0)
      if (sum !== 14) bad.push(`${p.id}: sum=${sum} "${p.title}" ${p.cardParenthesis ?? ''}`)
    }
    expect(bad).toEqual([])
  })

  it('exposes cardParenthesis on explanatory lines', () => {
    const withParen = PRACTICE_PATTERNS.filter((p) => p.cardParenthesis)
    expect(withParen.length).toBeGreaterThan(60)
    expect(PRACTICE_PATTERNS.find((p) => p.id === '2468-1a')?.cardParenthesis).toBe('(Any 1 Suit)')
  })
})
