/**
 * Enumerate completion slot permutations for NMJL card patterns.
 * Each returned slot set sums to 14 tiles and represents one valid suit assignment.
 */

import type { PatternGroup, PracticePattern } from '../card/practicePatterns'
import { suitPermutations } from '../card/nmjlSuitSlots'
import type { Suit, TileInstance } from '../mahjong/types'
import { deadHintDefKey } from '../mahjong/deadHintVariants'
import {
  type CompletionSlot,
  type HandCompletionMetrics,
  type HandInventoryContext,
  applyCompletionComplexityAdjustments,
  computeHandCompletionMetrics,
  dragonKeyForSuit,
  finalizeCompletionMetrics,
  maxCompletionMetricsOverSlotSets,
  rankAnyKey,
  suitRankKey,
} from './handCompletion'

const SUITS: Suit[] = ['bam', 'dot', 'crak']
const DRAGON_TYPES = ['green', 'red', 'soap'] as const

function appendPartial(partial: CompletionSlot[], slots: CompletionSlot[]): CompletionSlot[] {
  return [...partial, ...slots]
}

function slotsForSuitPermute(
  g: Extract<PatternGroup, { kind: 'suit-permute' }>,
  perm: readonly Suit[],
  base: number,
): CompletionSlot[] {
  const slots: CompletionSlot[] = []
  for (let ci = 0; ci < g.colorGroups.length; ci++) {
    const s = perm[ci]!
    for (const sg of g.colorGroups[ci]!) {
      const rank = g.consecRanks ? sg.rank - 1 + base : sg.rank
      slots.push({ tileType: suitRankKey(s, rank), targetCount: sg.need })
    }
    const dc = g.colorGroupDragonCounts?.[ci] ?? 0
    if (dc > 0) slots.push({ tileType: dragonKeyForSuit(s), targetCount: dc })
  }
  const tdc = g.trailingDragonCount ?? 0
  if (tdc > 0) {
    const trailSuit = SUITS.find((s) => !perm.includes(s))
    if (trailSuit) slots.push({ tileType: dragonKeyForSuit(trailSuit), targetCount: tdc })
  }
  return slots
}

function expandGroup(
  g: PatternGroup,
  partial: CompletionSlot[],
): CompletionSlot[][] {
  switch (g.kind) {
    case 'fixed':
      return [appendPartial(partial, [{ tileType: previewKeyForFixed(g), targetCount: g.need }])]

    case 'rank': {
      const keys = rankKeysForRankGroup(g)
      return keys.map((tileType) => appendPartial(partial, [{ tileType, targetCount: g.need }]))
    }

    case 'shared-rank': {
      const keys = rankKeysForSharedRank(g)
      return keys.map((tileType) =>
        appendPartial(
          partial,
          g.needs.map((targetCount) => ({ tileType, targetCount })),
        ),
      )
    }

    case 'shared-rank-suits': {
      const n = g.needs.length
      const out: CompletionSlot[][] = []
      for (let rank = 1; rank <= 9; rank++) {
        for (const perm of suitPermutations(n)) {
          const slots = g.needs.map((targetCount, i) => ({
            tileType: suitRankKey(perm[i]!, rank),
            targetCount,
          }))
          out.push(appendPartial(partial, slots))
        }
      }
      return out
    }

    case 'consec': {
      const out: CompletionSlot[][] = []
      for (let start = 1; start <= 8; start++) {
        if (g.opposingSuits) {
          for (const s1 of SUITS) {
            for (const s2 of SUITS) {
              if (s1 === s2) continue
              out.push(
                appendPartial(partial, [
                  { tileType: suitRankKey(s1, start), targetCount: g.need1 },
                  { tileType: suitRankKey(s2, start + 1), targetCount: g.need2 },
                ]),
              )
            }
          }
        } else {
          for (const s of SUITS) {
            out.push(
              appendPartial(partial, [
                { tileType: suitRankKey(s, start), targetCount: g.need1 },
                { tileType: suitRankKey(s, start + 1), targetCount: g.need2 },
              ]),
            )
          }
        }
      }
      return out
    }

    case 'consec-multi': {
      const n = g.needs.length
      const maxStart = 10 - n
      const out: CompletionSlot[][] = []
      for (let start = 1; start <= maxStart; start++) {
        const slots = g.needs.map((targetCount, i) => ({
          tileType: rankAnyKey(start + i),
          targetCount,
        }))
        out.push(appendPartial(partial, slots))
      }
      return out
    }

    case 'suit-locked-rank': {
      const out: CompletionSlot[][] = []
      for (const s of SUITS) {
        for (let rank = 1; rank <= 9; rank++) {
          const slots: CompletionSlot[] = []
          if (g.dragonsFirst && (g.dragonCount ?? 0) > 0) {
            slots.push({ tileType: dragonKeyForSuit(s), targetCount: g.dragonCount! })
          }
          slots.push({ tileType: suitRankKey(s, rank), targetCount: g.need })
          if (!g.dragonsFirst && (g.dragonCount ?? 0) > 0) {
            slots.push({ tileType: dragonKeyForSuit(s), targetCount: g.dragonCount! })
          }
          out.push(appendPartial(partial, slots))
        }
      }
      return out
    }

    case 'suit-locked-consec-multi': {
      const n = g.needs.length
      const maxStart = 10 - n
      const out: CompletionSlot[][] = []
      for (const s of SUITS) {
        for (let start = 1; start <= maxStart; start++) {
          const slots = g.needs.map((targetCount, i) => ({
            tileType: suitRankKey(s, start + i),
            targetCount,
          }))
          out.push(appendPartial(partial, slots))
        }
      }
      return out
    }

    case 'suit-locked-consec': {
      const maxStart = 10 - g.numGroups
      const out: CompletionSlot[][] = []
      for (const s of SUITS) {
        for (let start = 1; start <= maxStart; start++) {
          const slots: CompletionSlot[] = []
          for (let i = 0; i < g.numGroups; i++) {
            slots.push({ tileType: suitRankKey(s, start + i), targetCount: g.rankCount })
          }
          if (g.dragonCount > 0) {
            slots.push({ tileType: dragonKeyForSuit(s), targetCount: g.dragonCount })
          }
          out.push(appendPartial(partial, slots))
        }
      }
      return out
    }

    case 'suit-locked': {
      const out: CompletionSlot[][] = []
      for (const s of SUITS) {
        const slots: CompletionSlot[] = []
        if (g.dragonsFirst && g.dragonCount > 0) {
          slots.push({ tileType: dragonKeyForSuit(s), targetCount: g.dragonCount })
        }
        for (const rn of g.rankNeeds) {
          slots.push({ tileType: suitRankKey(s, rn.rank), targetCount: rn.need })
        }
        if (g.opposingDragons) {
          const opp = SUITS.filter((x) => x !== s).map((x) => dragonKeyForSuit(x))
          for (const dk of opp) {
            slots.push({ tileType: dk, targetCount: g.opposingDragons.need })
          }
        } else if (!g.dragonsFirst && g.dragonCount > 0) {
          slots.push({ tileType: dragonKeyForSuit(s), targetCount: g.dragonCount })
        }
        out.push(appendPartial(partial, slots))
      }
      return out
    }

    case 'suit-permute': {
      const n = g.colorGroups.length
      const maxRankOff =
        g.consecRanks
          ? Math.max(...g.colorGroups.flatMap((cg) => cg.map((sg) => sg.rank))) - 1
          : 0
      const bases = g.consecRanks ? Array.from({ length: 9 - maxRankOff }, (_, i) => i + 1) : [1]
      const out: CompletionSlot[][] = []
      for (const base of bases) {
        for (const perm of suitPermutations(n)) {
          out.push(appendPartial(partial, slotsForSuitPermute(g, perm, base)))
        }
      }
      return out
    }

    case 'odd-pair-kongs-triple': {
      const out: CompletionSlot[][] = []
      for (const pairRank of g.odds) {
        for (const perm of suitPermutations(3)) {
          const [mixed, k1, k2] = perm
          out.push(
            appendPartial(partial, [
              { tileType: suitRankKey(mixed!, pairRank), targetCount: 6 },
              { tileType: suitRankKey(k1!, pairRank), targetCount: 4 },
              { tileType: suitRankKey(k2!, pairRank), targetCount: 4 },
            ]),
          )
        }
      }
      return out
    }

    case 'dragon-meld-permute': {
      const perms = permuteDragonTypes(g.needs.length)
      return perms.map((types) =>
        appendPartial(
          partial,
          g.needs.map((targetCount, i) => ({
            tileType: `d:${types[i]!}`,
            targetCount,
          })),
        ),
      )
    }
  }
}

function previewKeyForFixed(g: Extract<PatternGroup, { kind: 'fixed' }>): string {
  if (g.test({ cat: 'flower', flower: 1 })) return 'f'
  for (const w of ['N', 'E', 'W', 'S'] as const) {
    if (g.test({ cat: 'wind', wind: w })) return `w:${w}`
  }
  for (const d of ['red', 'green', 'soap'] as const) {
    if (g.test({ cat: 'dragon', dragon: d })) return `d:${d}`
  }
  if (g.test({ cat: 'suit', suit: 'bam', rank: 1 })) return 'rank-any:1'
  return 'rank-any:1'
}

function rankKeysForRankGroup(g: Extract<PatternGroup, { kind: 'rank' }>): string[] {
  if (g.test({ cat: 'suit', suit: 'bam', rank: 1 })) {
    return Array.from({ length: 9 }, (_, i) => rankAnyKey(i + 1))
  }
  if (g.test({ cat: 'wind', wind: 'N' })) {
    return ['w:N', 'w:E', 'w:W', 'w:S']
  }
  if (g.test({ cat: 'dragon', dragon: 'red' })) {
    return ['d:red', 'd:green', 'd:soap']
  }
  return ['rank-any:1']
}

function rankKeysForSharedRank(g: Extract<PatternGroup, { kind: 'shared-rank' }>): string[] {
  return rankKeysForRankGroup({ kind: 'rank', need: 1, test: g.test })
}

function permuteDragonTypes(count: number): Array<Array<(typeof DRAGON_TYPES)[number]>> {
  if (count <= 0) return [[]]
  const out: Array<Array<(typeof DRAGON_TYPES)[number]>> = []
  const go = (picked: Array<(typeof DRAGON_TYPES)[number]>, used: Set<string>) => {
    if (picked.length === count) {
      out.push([...picked])
      return
    }
    for (const d of DRAGON_TYPES) {
      if (used.has(d)) continue
      picked.push(d)
      used.add(d)
      go(picked, used)
      picked.pop()
      used.delete(d)
    }
  }
  go([], new Set())
  return out
}

function enumerateFromGroups(
  p: PracticePattern,
  groups: PatternGroup[],
  gi: number,
  partial: CompletionSlot[],
): CompletionSlot[][] {
  if (gi >= groups.length) return partial.length ? [partial] : []
  const g = groups[gi]!
  const branches = expandGroup(g, partial)
  return branches.flatMap((branch) => enumerateFromGroups(p, groups, gi + 1, branch))
}

/** Build one deterministic slot set, optionally pinning a suit-permute (perm, base) combo. */
export function buildDeterministicCompletionSlots(
  p: PracticePattern,
  pin?: { perm: readonly Suit[]; base: number },
): CompletionSlot[] {
  if (!p.groups?.length) return []
  let partial: CompletionSlot[] = []
  for (const g of p.groups) {
    if (g.kind === 'suit-permute' && pin) {
      partial = appendPartial(partial, slotsForSuitPermute(g, pin.perm, pin.base))
      continue
    }
    const branches = expandGroup(g, partial)
    partial = branches[0] ?? partial
  }
  return partial
}

/** All slot permutations for a card line (each sums to 14 when pattern is well-formed). */
export function enumerateCompletionSlotSets(p: PracticePattern): CompletionSlot[][] {
  if (!p.groups?.length) return []
  return enumerateFromGroups(p, p.groups, 0, [])
}

export function buildInventoryContext(
  p: PracticePattern,
  rack: TileInstance[],
  discards: TileInstance[],
): HandInventoryContext {
  const naturals: Record<string, number> = {}
  let jokersInHand = 0
  let blanksInHand = 0
  for (const t of rack) {
    if (t.def.cat === 'joker') {
      jokersInHand += 1
      continue
    }
    if (t.def.cat === 'blank') {
      blanksInHand += 1
      continue
    }
    const k = deadHintDefKey(t.def)
    naturals[k] = (naturals[k] ?? 0) + 1
  }
  const discardCounts: Record<string, number> = {}
  for (const t of discards) {
    if (t.def.cat === 'joker' || t.def.cat === 'blank') continue
    const k = deadHintDefKey(t.def)
    discardCounts[k] = (discardCounts[k] ?? 0) + 1
  }
  return {
    naturals,
    jokersInHand,
    blanksInHand,
    discardCounts,
    jokersDisallowed: p.closed || p.section === 'SINGLES AND PAIRS',
  }
}

/** Max completion metrics across all valid suit permutations for a card line. */
export function computePatternCompletionMetrics(
  p: PracticePattern,
  rack: TileInstance[],
  discards: TileInstance[],
): HandCompletionMetrics {
  const isConcealed = p.closed
  if (!p.groups?.length) {
    let matched = 0
    for (const t of rack) {
      if (t.def.cat === 'joker' || t.def.cat === 'blank') continue
      if (p.matches(t.def)) matched += 1
    }
    const filled = Math.min(14, matched)
    const P_base = Math.round((filled / 14) * 100)
    const banRatio = p.section === 'SINGLES AND PAIRS' ? 1 : 0
    return {
      M_nat: filled,
      M_joker: 0,
      D: 14 - filled,
      P_base,
      P: applyCompletionComplexityAdjustments(P_base, isConcealed, banRatio),
    }
  }
  const ctx = buildInventoryContext(p, rack, discards)
  const slotSets = enumerateCompletionSlotSets(p)
  if (slotSets.length === 0) {
    return { M_nat: 0, M_joker: 0, D: 14, P_base: 0, P: 0 }
  }
  return maxCompletionMetricsOverSlotSets(slotSets, ctx, isConcealed)
}

export type ResolvedPatternCompletion = {
  metrics: HandCompletionMetrics
  slots: readonly CompletionSlot[]
  ctx: HandInventoryContext
}

/** Best suit permutation metrics plus the slot set and inventory context that produced them. */
export function resolveBestPatternCompletion(
  p: PracticePattern,
  rack: TileInstance[],
  discards: TileInstance[],
): ResolvedPatternCompletion {
  const ctx = buildInventoryContext(p, rack, discards)
  const slotSets = enumerateCompletionSlotSets(p)
  if (slotSets.length === 0) {
    return {
      metrics: computePatternCompletionMetrics(p, rack, discards),
      slots: [],
      ctx,
    }
  }

  let best: HandCompletionMetrics = { M_nat: 0, M_joker: 0, D: 14, P_base: 0, P: 0 }
  let bestSlots: readonly CompletionSlot[] = []
  for (const slots of slotSets) {
    const raw = computeHandCompletionMetrics(slots, ctx)
    if (raw.P_base > best.P_base || (raw.P_base === best.P_base && raw.D < best.D)) {
      best = raw
      bestSlots = slots
    }
  }
  const metrics = bestSlots.length > 0 ? finalizeCompletionMetrics(best, bestSlots, p.closed) : best
  return { metrics, slots: bestSlots, ctx }
}

/** Completion metrics for one pinned suit-permute consecRanks tier row. */
export function computeTierCompletionMetrics(
  p: PracticePattern,
  rack: TileInstance[],
  discards: TileInstance[],
  perm: readonly Suit[],
  base: number,
): HandCompletionMetrics {
  const ctx = buildInventoryContext(p, rack, discards)
  const slots = buildDeterministicCompletionSlots(p, { perm, base })
  if (slots.length === 0) return { M_nat: 0, M_joker: 0, D: 14, P_base: 0, P: 0 }
  const raw = computeHandCompletionMetrics(slots, ctx)
  return finalizeCompletionMetrics(raw, slots, p.closed)
}
