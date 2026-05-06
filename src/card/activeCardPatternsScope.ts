import type { PracticePattern } from './practicePatterns'
import { PRACTICE_PATTERNS } from './practicePatterns'

let activeCardPatterns: PracticePattern[] = PRACTICE_PATTERNS

export function getActiveCardPatterns(): PracticePattern[] {
  return activeCardPatterns
}

export function setActiveCardPatterns(patterns: PracticePattern[]): void {
  activeCardPatterns = patterns
}
