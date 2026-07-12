import type { PracticePattern } from './practicePatterns'
import { NMJL_2026_PATTERNS } from './nmjl2026Patterns'

/**
 * Whichever card pack is active (`PRACTICE_PATTERNS` mock vs `NMJL_2026_PATTERNS` league).
 * League pattern ids are always prefixed — see `nmjl2026PatternId` — so they never equal mock ids.
 */
let activeCardPatterns: PracticePattern[] = NMJL_2026_PATTERNS
let activeCardPatternsById = buildPatternByIdMap(NMJL_2026_PATTERNS)

/** Cache Maps for stable card-book arrays (`PRACTICE_PATTERNS` / `NMJL_2026_PATTERNS`). */
const patternListByIdCache = new WeakMap<
  readonly PracticePattern[],
  ReadonlyMap<string, PracticePattern>
>()

/** O(1) id → pattern for a card book (or any pattern list). */
export function buildPatternByIdMap(
  patterns: readonly PracticePattern[],
): ReadonlyMap<string, PracticePattern> {
  const m = new Map<string, PracticePattern>()
  for (const p of patterns) m.set(p.id, p)
  return m
}

/**
 * Memoized id lookup for a pattern array identity. Reuses the Map when the same
 * card-book array reference is passed again (typical for `patternsForCard` / active scope).
 */
export function patternByIdLookup(
  patterns: readonly PracticePattern[],
): ReadonlyMap<string, PracticePattern> {
  let m = patternListByIdCache.get(patterns)
  if (!m) {
    m = buildPatternByIdMap(patterns)
    patternListByIdCache.set(patterns, m)
  }
  return m
}

export function getActiveCardPatterns(): PracticePattern[] {
  return activeCardPatterns
}

export function getActiveCardPatternById(id: string): PracticePattern | undefined {
  return activeCardPatternsById.get(id)
}

export function setActiveCardPatterns(patterns: PracticePattern[]): void {
  activeCardPatterns = patterns
  activeCardPatternsById = patternByIdLookup(patterns)
}
