import { pairKongsTripleBlockRanks } from '../card/patternLinePreview'
import type { PatternGroup, PracticePattern } from '../card/practicePatterns'
import type { Suit, TileDef } from './types'

export const DEAD_HINT_SUITS: readonly Suit[] = ['bam', 'dot', 'crak']

export const DEAD_HINT_DRAGON_FOR_SUIT: Record<Suit, Extract<TileDef, { cat: 'dragon' }>['dragon']> = {
  bam: 'green',
  dot: 'soap',
  crak: 'red',
}

export function deadHintDefKey(def: TileDef): string {
  switch (def.cat) {
    case 'suit':
      return `s:${def.suit}:${def.rank}`
    case 'wind':
      return `w:${def.wind}`
    case 'dragon':
      return `d:${def.dragon}`
    case 'flower':
      return 'f'
    case 'joker':
      return 'j'
    case 'blank':
      return 'b'
  }
}

export type DeadHintNeedEntry = {
  def: TileDef
  need: number
  /** Kong/pung slots that may be filled with jokers (need ≥ 3). */
  canUseJoker?: boolean
}

export type DeadHintNeedMap = Map<string, DeadHintNeedEntry>

/**
 * NMJL joker rule: a joker may substitute for any tile in a pung/kong/quint/sextet (a meld of 3+
 * identical tiles), including flower pungs/kongs — never singles or pairs. Runs/sequences built from
 * single tiles never reach here. Intrinsic to meld size, not a per-pattern opt-in flag.
 */
export function meldDefIsJokerEligible(_def: TileDef, need: number): boolean {
  return need >= 3
}

export function addDeadHintNeed(
  needs: DeadHintNeedMap,
  def: TileDef,
  count: number,
  canUseJoker?: boolean,
) {
  if (count <= 0) return
  const key = deadHintDefKey(def)
  const cur = needs.get(key)
  const jokerOk = !!(canUseJoker && count >= 3)
  needs.set(key, {
    def,
    need: (cur?.need ?? 0) + count,
    canUseJoker: jokerOk || cur?.canUseJoker,
  })
}

export function copyDeadHintNeeds(needs: ReadonlyMap<string, DeadHintNeedEntry>): DeadHintNeedMap {
  return new Map(Array.from(needs, ([key, value]) => [key, { ...value }]))
}

export function deadHintSuitPermutations(slotCount: number): Suit[][] {
  if (slotCount <= 0) return [[]]
  const out: Suit[][] = []
  const walk = (chosen: Suit[]) => {
    if (chosen.length === slotCount) {
      out.push([...chosen])
      return
    }
    for (const suit of DEAD_HINT_SUITS) {
      if (chosen.includes(suit)) continue
      chosen.push(suit)
      walk(chosen)
      chosen.pop()
    }
  }
  walk([])
  return out
}

/** Standard defs for probing fixed / rank groups (flowers, winds, dragons, 1–9 × suits). */
export function deadHintStandardDefsToProbe(): TileDef[] {
  const defs: TileDef[] = [
    { cat: 'wind', wind: 'E' },
    { cat: 'wind', wind: 'S' },
    { cat: 'wind', wind: 'W' },
    { cat: 'wind', wind: 'N' },
    { cat: 'dragon', dragon: 'red' },
    { cat: 'dragon', dragon: 'green' },
    { cat: 'dragon', dragon: 'soap' },
    { cat: 'flower', flower: 1 },
  ]
  for (const suit of DEAD_HINT_SUITS) {
    for (let rank = 1; rank <= 9; rank++) {
      defs.push({ cat: 'suit', suit, rank })
    }
  }
  return defs
}

/** All need maps for one pattern group (not filtered to a single trigger tile). */
export function deadHintGroupNeedVariantsAll(group: PatternGroup): DeadHintNeedMap[] {
  switch (group.kind) {
    case 'fixed':
    case 'rank':
    case 'suit-locked-rank': {
      const variants: DeadHintNeedMap[] = []
      for (const def of deadHintStandardDefsToProbe()) {
        if (!group.test(def)) continue
        const needs: DeadHintNeedMap = new Map()
        addDeadHintNeed(needs, def, group.need, meldDefIsJokerEligible(def, group.need))
        variants.push(needs)
      }
      return variants.length > 0 ? variants : [new Map()]
    }
    case 'suit-locked': {
      return DEAD_HINT_SUITS.map((suit) => {
        const needs = new Map<string, { def: TileDef; need: number }>()
        for (const rankNeed of group.rankNeeds) {
          const def: TileDef = { cat: 'suit', suit, rank: rankNeed.rank }
          addDeadHintNeed(needs, def, rankNeed.need, meldDefIsJokerEligible(def, rankNeed.need))
        }
        if (group.dragonCount > 0) {
          const dragonDef: TileDef = { cat: 'dragon', dragon: DEAD_HINT_DRAGON_FOR_SUIT[suit] }
          addDeadHintNeed(needs, dragonDef, group.dragonCount, meldDefIsJokerEligible(dragonDef, group.dragonCount))
        }
        return needs
      })
    }
    case 'suit-locked-consec': {
      const variants: Array<Map<string, { def: TileDef; need: number }>> = []
      const maxStart = 10 - group.numGroups
      for (const suit of DEAD_HINT_SUITS) {
        for (let start = 1; start <= maxStart; start++) {
          const needs = new Map<string, { def: TileDef; need: number }>()
          for (let i = 0; i < group.numGroups; i++) {
            const def: TileDef = { cat: 'suit', suit, rank: start + i }
            addDeadHintNeed(needs, def, group.rankCount, meldDefIsJokerEligible(def, group.rankCount))
          }
          if (group.dragonCount > 0) {
            const dragonDef: TileDef = { cat: 'dragon', dragon: DEAD_HINT_DRAGON_FOR_SUIT[suit] }
            addDeadHintNeed(needs, dragonDef, group.dragonCount, meldDefIsJokerEligible(dragonDef, group.dragonCount))
          }
          variants.push(needs)
        }
      }
      return variants
    }
    case 'suit-locked-consec-multi': {
      const variants: Array<Map<string, { def: TileDef; need: number }>> = []
      const maxStart = 10 - group.needs.length
      for (const suit of DEAD_HINT_SUITS) {
        for (let start = 1; start <= maxStart; start++) {
          const needs = new Map<string, { def: TileDef; need: number }>()
          group.needs.forEach((need, i) => {
            const def: TileDef = { cat: 'suit', suit, rank: start + i }
            addDeadHintNeed(needs, def, need, meldDefIsJokerEligible(def, need))
          })
          variants.push(needs)
        }
      }
      return variants
    }
    case 'suit-permute': {
      const variants: Array<Map<string, { def: TileDef; need: number }>> = []
      const maxOffset = Math.max(0, ...group.colorGroups.flatMap((cg) => cg.map((slot) => slot.rank)))
      const maxStart = group.consecRanks ? 10 - maxOffset : 1
      for (const assignment of deadHintSuitPermutations(group.colorGroups.length)) {
        for (let start = 1; start <= maxStart; start++) {
          const needs = new Map<string, { def: TileDef; need: number }>()
          group.colorGroups.forEach((colorGroup, colorIdx) => {
            const suit = assignment[colorIdx]
            if (!suit) return
            for (const slot of colorGroup) {
              const def: TileDef = {
                cat: 'suit',
                suit,
                rank: group.consecRanks ? start + slot.rank - 1 : slot.rank,
              }
              addDeadHintNeed(needs, def, slot.need, meldDefIsJokerEligible(def, slot.need))
            }
            const dragonCount = group.colorGroupDragonCounts?.[colorIdx] ?? 0
            if (dragonCount > 0) {
              const dragonDef: TileDef = { cat: 'dragon', dragon: DEAD_HINT_DRAGON_FOR_SUIT[suit] }
              addDeadHintNeed(
                needs,
                dragonDef,
                dragonCount,
                meldDefIsJokerEligible(dragonDef, dragonCount),
              )
            }
          })
          if (group.trailingDragonCount && assignment.length < DEAD_HINT_SUITS.length) {
            const remainingSuit = DEAD_HINT_SUITS.find((suit) => !assignment.includes(suit))
            if (remainingSuit) {
              const dragonDef: TileDef = {
                cat: 'dragon',
                dragon: DEAD_HINT_DRAGON_FOR_SUIT[remainingSuit],
              }
              addDeadHintNeed(
                needs,
                dragonDef,
                group.trailingDragonCount,
                meldDefIsJokerEligible(dragonDef, group.trailingDragonCount),
              )
            }
          }
          variants.push(needs)
        }
      }
      return variants
    }
    case 'dragon-meld-permute': {
      const variants: Array<Map<string, { def: TileDef; need: number }>> = []
      if (group.needs.length !== 3) return variants
      const types: Array<Extract<TileDef, { cat: 'dragon' }>['dragon']> = ['green', 'red', 'soap']
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          if (j === i) continue
          for (let k = 0; k < 3; k++) {
            if (k === i || k === j) continue
            const needs = new Map<string, { def: TileDef; need: number }>()
            const pairs: Array<[Extract<TileDef, { cat: 'dragon' }>['dragon'], number]> = [
              [types[i]!, group.needs[0]!],
              [types[j]!, group.needs[1]!],
              [types[k]!, group.needs[2]!],
            ]
            for (const [dr, need] of pairs) {
              const def: TileDef = { cat: 'dragon', dragon: dr }
              addDeadHintNeed(needs, def, need, meldDefIsJokerEligible(def, need))
            }
            variants.push(needs)
          }
        }
      }
      return variants
    }
    case 'odd-pair-kongs-triple': {
      const variants: Array<Map<string, { def: TileDef; need: number }>> = []
      for (const pairRank of group.odds) {
        const sixRanks = pairKongsTripleBlockRanks(group.odds, pairRank)
        for (const assignment of deadHintSuitPermutations(3)) {
          const needs = new Map<string, { def: TileDef; need: number }>()
          const s0 = assignment[0]!
          const s1 = assignment[1]!
          const s2 = assignment[2]!
          for (const r of sixRanks) {
            addDeadHintNeed(needs, { cat: 'suit', suit: s0, rank: r }, 1)
          }
          addDeadHintNeed(needs, { cat: 'suit', suit: s1, rank: pairRank }, 4, meldDefIsJokerEligible({ cat: 'suit', suit: s1, rank: pairRank }, 4))
          addDeadHintNeed(needs, { cat: 'suit', suit: s2, rank: pairRank }, 4, meldDefIsJokerEligible({ cat: 'suit', suit: s2, rank: pairRank }, 4))
          variants.push(needs)
        }
      }
      return variants
    }
    default:
      return [new Map()]
  }
}

/** Trigger-aware variants (used when checking discard-exhaustion pivots). */
export function deadHintGroupNeedVariants(
  group: PatternGroup,
  triggerDef: TileDef,
): DeadHintNeedMap[] {
  switch (group.kind) {
    case 'fixed':
    case 'rank':
    case 'suit-locked-rank': {
      const needs: DeadHintNeedMap = new Map()
      if (group.test(triggerDef)) {
        addDeadHintNeed(needs, triggerDef, group.need, meldDefIsJokerEligible(triggerDef, group.need))
      }
      return [needs]
    }
    default:
      return deadHintGroupNeedVariantsAll(group)
  }
}

export function buildPatternNeedVariants(pattern: PracticePattern): DeadHintNeedMap[] {
  let variants: DeadHintNeedMap[] = [new Map()]
  for (const group of pattern.groups ?? []) {
    const groupVariants = deadHintGroupNeedVariantsAll(group)
    const next: DeadHintNeedMap[] = []
    for (const base of variants) {
      for (const groupVariant of groupVariants) {
        const merged = copyDeadHintNeeds(base)
        for (const { def, need, canUseJoker } of groupVariant.values()) {
          addDeadHintNeed(merged, def, need, canUseJoker)
        }
        next.push(merged)
      }
    }
    variants = next
  }
  return variants
}

export function availableCopiesForDeadHint(
  def: TileDef,
  unavailableByKey: ReadonlyMap<string, number>,
  totalCopiesForDef: (def: TileDef) => number,
): number {
  return totalCopiesForDef(def) - (unavailableByKey.get(deadHintDefKey(def)) ?? 0)
}

export function patternNeedVariantIsSatisfiable(
  needs: ReadonlyMap<string, DeadHintNeedEntry>,
  unavailableByKey: ReadonlyMap<string, number>,
  totalCopiesForDef: (def: TileDef) => number,
  redeemableExposedJokers = 0,
): boolean {
  let jokersLeft =
    availableCopiesForDeadHint({ cat: 'joker' }, unavailableByKey, totalCopiesForDef) +
    Math.max(0, redeemableExposedJokers)

  const jokerEligible: DeadHintNeedEntry[] = []
  for (const entry of needs.values()) {
    if (entry.canUseJoker) {
      jokerEligible.push(entry)
      continue
    }
    if (
      availableCopiesForDeadHint(entry.def, unavailableByKey, totalCopiesForDef) < entry.need
    ) {
      return false
    }
  }

  for (const entry of jokerEligible) {
    const available = availableCopiesForDeadHint(entry.def, unavailableByKey, totalCopiesForDef)
    const shortfall = Math.max(0, entry.need - available)
    if (shortfall > jokersLeft) return false
    jokersLeft -= shortfall
  }
  return true
}

export type DeadCauseShortfall = {
  defs: TileDef[]
  need: number
  available: number
}

/** First single/pair shortfall in a need map (stable iteration order). */
export function firstShortfallInNeedMap(
  needs: ReadonlyMap<string, DeadHintNeedEntry>,
  unavailableByKey: ReadonlyMap<string, number>,
  totalCopiesForDef: (def: TileDef) => number,
): DeadCauseShortfall | null {
  for (const { def, need, canUseJoker } of needs.values()) {
    if (canUseJoker) continue
    const available = availableCopiesForDeadHint(def, unavailableByKey, totalCopiesForDef)
    if (available < need) {
      return { defs: [def], need, available }
    }
  }
  return null
}
