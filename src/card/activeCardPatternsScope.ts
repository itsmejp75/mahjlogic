import type { PracticePattern } from './practicePatterns'
import { PRACTICE_PATTERNS } from './practicePatterns'

/**
 * Whichever card pack is active (`PRACTICE_PATTERNS` mock vs `NMJL_2026_PATTERNS` league).
 * League pattern ids are always prefixed — see `nmjl2026PatternId` — so they never equal mock ids.
 */
let activeCardPatterns: PracticePattern[] = PRACTICE_PATTERNS

export function getActiveCardPatterns(): PracticePattern[] {
  return activeCardPatterns
}

export function setActiveCardPatterns(patterns: PracticePattern[]): void {
  activeCardPatterns = patterns
}
