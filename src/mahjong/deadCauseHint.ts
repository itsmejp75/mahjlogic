import type { PracticePattern } from '../card/practicePatterns'
import {
  buildGreedyAlignedDeadHintNeeds,
  buildPinnedPatternsFromFocusKey,
} from '../analysis/suggestedHands'
import type { SuggestedStripSlot } from '../analysis/suggestedHands'
import type { TileInstance } from './types'
import {
  buildPatternNeedVariants,
  firstShortfallInNeedMap,
  patternNeedVariantIsSatisfiable,
} from './deadHintVariants'
import { tileAriaLabel, tileShortLabel } from './labels'
import type { TileDef } from './types'
import { tileDefsEqual } from './tileUtils'

export type DeadCauseHint = {
  defs: TileDef[]
  need: number
  available: number
}

export function availableCopiesForDeadHintDef(
  def: TileDef,
  unavailableByKey: ReadonlyMap<string, number>,
  totalCopiesForDef: (def: TileDef) => number,
  deadHintDefKey: (def: TileDef) => string,
): number {
  return totalCopiesForDef(def) - (unavailableByKey.get(deadHintDefKey(def)) ?? 0)
}

export type FindFocusedPatternDeadCauseOpts = {
  rack?: TileInstance[]
  exposureTileIds?: ReadonlySet<string>
}

/**
 * When every legal suit/color variant of the focused line is short on copies, return the first
 * shortfall; otherwise null (hand still possible — e.g. 44 as craks even if 4 dots are scarce).
 * Jokers count toward kong/pung slots marked `canUseJoker`. When a rack is provided, the warning
 * text follows the same suit assignment the highlight matcher chose (not a different permutation).
 */
export function findFocusedPatternDeadCause(
  focusKey: string | null,
  unavailableByKey: ReadonlyMap<string, number>,
  patterns: PracticePattern[],
  totalCopiesForDef: (def: TileDef) => number,
  opts?: FindFocusedPatternDeadCauseOpts,
): DeadCauseHint | null {
  if (!focusKey) return null
  const variantSep = ['::tier::', '::oc::', '::ocall::']
    .map((s) => focusKey.indexOf(s))
    .filter((i) => i >= 0)
    .reduce((m, i) => (m < 0 ? i : Math.min(m, i)), -1)
  const patternId = variantSep >= 0 ? focusKey.slice(0, variantSep) : focusKey
  const pattern = patterns.find((p) => p.id === patternId)
  if (!pattern) return null

  const pinnedPatterns = buildPinnedPatternsFromFocusKey(pattern, focusKey)
  const candidates = pinnedPatterns.length > 0 ? pinnedPatterns : [pattern]

  const greedyUiOpts =
    opts?.exposureTileIds && opts.exposureTileIds.size > 0
      ? { exposureTileIds: opts.exposureTileIds }
      : undefined

  for (const candidate of candidates) {
    const variants = buildPatternNeedVariants(candidate)
    let anyViable = false
    let firstDead: DeadCauseHint | null = null

    for (const needs of variants) {
      if (needs.size === 0) continue
      if (patternNeedVariantIsSatisfiable(needs, unavailableByKey, totalCopiesForDef)) {
        anyViable = true
        break
      }
      if (!firstDead) {
        const shortfall = firstShortfallInNeedMap(needs, unavailableByKey, totalCopiesForDef)
        if (shortfall) firstDead = shortfall
      }
    }

    if (anyViable) continue

    if (opts?.rack) {
      const greedyNeeds = buildGreedyAlignedDeadHintNeeds(candidate, opts.rack, greedyUiOpts)
      if (greedyNeeds.size > 0) {
        const shortfall = firstShortfallInNeedMap(greedyNeeds, unavailableByKey, totalCopiesForDef)
        if (shortfall) return shortfall
      }
    }

    if (firstDead) return firstDead
  }
  return null
}

export function formatDeadCauseMessage(cause: DeadCauseHint): string {
  const def = cause.defs[0]
  if (!def) return 'Hand no longer possible'
  const label = tileShortLabel(def)
  const readable = tileAriaLabel(def)
  const tileName = label === readable ? readable : `${label} (${readable})`
  if (cause.available <= 0) {
    return `Need ${cause.need} ${tileName} — none left`
  }
  return `Need ${cause.need} ${tileName} — only ${cause.available} left`
}

export function stripSlotMatchesDeadCause(slot: SuggestedStripSlot, cause: DeadCauseHint | null): boolean {
  if (!cause) return false
  return cause.defs.some((d) => tileDefsEqual(d, slot.displayDef))
}

export function titleTokenMatchesDeadCause(token: string, defs: readonly TileDef[]): boolean {
  if (/^F+$/.test(token)) {
    return defs.some((d) => d.cat === 'flower')
  }
  if (/^E+$/.test(token)) {
    return defs.some((d) => d.cat === 'wind' && d.wind === 'E')
  }
  if (/^S+$/.test(token)) {
    return defs.some((d) => d.cat === 'wind' && d.wind === 'S')
  }
  if (/^W+$/.test(token)) {
    return defs.some((d) => d.cat === 'wind' && d.wind === 'W')
  }
  if (/^N+$/.test(token)) {
    return defs.some((d) => d.cat === 'wind' && d.wind === 'N')
  }
  if (/^D+$/.test(token)) {
    return defs.some((d) => d.cat === 'dragon')
  }
  if (/^\d+$/.test(token)) {
    const rank = Number(token[0])
    return defs.some((d) => d.cat === 'suit' && d.rank === rank)
  }
  return false
}

/** Split card title text and wrap matching runs (e.g. `EE`) for dead-cause emphasis. */
export function splitTitleTextForDeadCause(text: string, defs: readonly TileDef[]): Array<{ text: string; highlight: boolean }> {
  const parts = text.split(/(F+|E+|S+|W+|N+|D+|\d+)/g).filter((p) => p.length > 0)
  return parts.map((part) => ({
    text: part,
    highlight: titleTokenMatchesDeadCause(part, defs),
  }))
}
