/**
 * Empty card books for public web deploys — no hand lines, geometry, or payload in the bundle.
 * Native / `build:native` uses `cardBooks.full.ts` via the Vite alias.
 */
import type { PracticePattern } from './practicePatterns'

export const PRACTICE_PATTERNS: PracticePattern[] = []
export const PRACTICE_CARD_SECTION_ORDER: readonly string[] = []
export const NMJL_2026_PATTERNS: PracticePattern[] = []
export const NMJL_2026_CARD_SECTION_ORDER: readonly string[] = []

export const CARD_BOOKS_BUNDLED = false as const

export const CARD_SECTION_DISPLAY_LABEL: Readonly<Record<string, string>> = {}
