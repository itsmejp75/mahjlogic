/**
 * 2026 National Mah Jongg League card — **only** from `data/2026-nmjl-card.csv`.
 * Does not use or merge `PRACTICE_PATTERNS` (Mock card). Geometry, hand text, colors,
 * parentheses, values, and hand numbers are generated row-by-row from the CSV.
 */
import type { PracticePattern } from './practicePatterns'
import csvRaw from './data/2026-nmjl-card.csv?raw'
import { nmjl2026GeometryFromCsvRow } from './nmjl2026CardGeometry'
import { nmjl2026PatternId, parseNmjl2026CardCsv } from './nmjl2026Csv'

const NMJL_2026_CSV_ROWS = parseNmjl2026CardCsv(csvRaw)

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
