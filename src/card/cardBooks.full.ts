/**
 * Full card books for native / local builds (`MAHJLOGIC_CARD_CONTENT` ≠ `0`).
 * Public web builds resolve `@mahjlogic/card-books` to `cardBooks.stub.ts` instead.
 */
export { PRACTICE_PATTERNS, PRACTICE_CARD_SECTION_ORDER } from './mockCardBook'
export { NMJL_2025_PATTERNS, NMJL_2025_CARD_SECTION_ORDER } from './nmjl2025Patterns'
export { NMJL_2026_PATTERNS, NMJL_2026_CARD_SECTION_ORDER } from './nmjl2026Patterns'

export const CARD_BOOKS_BUNDLED = true as const

/** Canonical section keys → short UI labels (kept with card books so web stubs omit them). */
export const CARD_SECTION_DISPLAY_LABEL: Readonly<Record<string, string>> = {
  '2019': 'Year',
  '2025': 'Year',
  '2026': 'Year',
  '2468': '2468',
  'ANY LIKE NUMBERS': 'Like #s',
  QUINTS: 'Quints',
  'CONSECUTIVE RUN': 'Runs',
  'CONSECUTIVE RUNS': 'Runs',
  '13579': '13579',
  'WINDS - DRAGONS': 'W&Ds',
  'WINDS-DRAGONS': 'W&Ds',
  '369': '369',
  'SINGLES AND PAIRS': 'S&Ps',
}
