import type { PracticePattern } from '../card/practicePatterns'
import { buildPinnedPatternsFromFocusKey } from '../analysis/suggestedHands'
import type { SuggestedStripSlot } from '../analysis/suggestedHands'
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

/** First pattern def that is short for the focused line given tiles already out of play. */
export function findFocusedPatternDeadCause(
  focusKey: string | null,
  unavailableByKey: ReadonlyMap<string, number>,
  patterns: PracticePattern[],
  totalCopiesForDef: (def: TileDef) => number,
  deadHintDefKey: (def: TileDef) => string,
  needForDef: (focusKey: string | null, def: TileDef, patterns: PracticePattern[]) => number | null,
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
  const defsToProbe: TileDef[] = [
    { cat: 'wind', wind: 'E' },
    { cat: 'wind', wind: 'S' },
    { cat: 'wind', wind: 'W' },
    { cat: 'wind', wind: 'N' },
    { cat: 'dragon', dragon: 'red' },
    { cat: 'dragon', dragon: 'green' },
    { cat: 'dragon', dragon: 'soap' },
    { cat: 'flower', flower: 1 },
  ]
  for (const suit of ['bam', 'dot', 'crak'] as const) {
    for (let rank = 1; rank <= 9; rank++) {
      defsToProbe.push({ cat: 'suit', suit, rank })
    }
  }

  for (const candidate of candidates) {
    if (!candidate.groups?.length) continue
    for (const def of defsToProbe) {
      if (!candidate.matches(def)) continue
      const need = needForDef(focusKey, def, patterns)
      if (need == null) continue
      const available = availableCopiesForDeadHintDef(
        def,
        unavailableByKey,
        totalCopiesForDef,
        deadHintDefKey,
      )
      if (available < need) {
        return { defs: [def], need, available }
      }
    }
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
  return cause.defs.some(
    (d) =>
      tileDefsEqual(d, slot.displayDef) ||
      (d.cat === 'suit' &&
        slot.displayDef.cat === 'suit' &&
        d.rank === slot.displayDef.rank),
  )
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
