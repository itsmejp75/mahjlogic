/**
 * 2026 National Mah Jongg League card — from opaque `data/2026-nmjl-card.payload.json`
 * (packed from `data/2026-nmjl-card.csv` via `scripts/encrypt-nmjl-card.mjs`).
 * Does not use or merge `PRACTICE_PATTERNS` (Mock card). Geometry, hand text, colors,
 * parentheses, values, and hand numbers are generated row-by-row from the CSV.
 * Pattern `id` values use `NMJL_2026_PATTERN_ID_PREFIX` so they never match mock card ids.
 *
 * The source `.csv` is not imported into the client bundle (copyright / scrape resistance).
 */
import type { PracticePattern } from './practicePatterns'
import { nmjl2026GeometryFromCsvRow } from './nmjl2026CardGeometry'
import { loadNmjl2026CsvText } from './nmjl2026CardPayload'
import { nmjl2026PatternId, parseNmjl2026CardCsv } from './nmjl2026Csv'

const NMJL_2026_CSV_ROWS = parseNmjl2026CardCsv(loadNmjl2026CsvText())

export const NMJL_2026_CARD_SECTION_ORDER: readonly string[] = (() => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const row of NMJL_2026_CSV_ROWS) {
    if (seen.has(row.category)) continue
    seen.add(row.category)
    out.push(row.category)
  }
  return out
})()

export const NMJL_2026_PATTERNS: PracticePattern[] = NMJL_2026_CSV_ROWS.map((row) => {
  const geo = nmjl2026GeometryFromCsvRow(row)
  return {
    ...geo,
    id: nmjl2026PatternId(row),
    section: row.category,
    title: row.hand.trim(),
    points: row.points,
    closed: row.closed,
    cardHandCode: row.handNum,
    cardParenthesis: row.parenthesis.trim(),
    roughTarget: 14,
  }
})
