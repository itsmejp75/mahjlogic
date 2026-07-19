/**
 * 2025 National Mah Jongg League card — from opaque `data/2025-nmjl-card.payload.json`
 * (packed from `data/2025-nmjl-card.csv` via `scripts/encrypt-nmjl-card.mjs`).
 * Reuses 2026 CSV parse + geometry; pattern ids use `nmjl2025:` so they never collide
 * with mock or 2026 league ids.
 */
import type { PracticePattern } from './practicePatterns'
import { nmjl2026GeometryFromCsvRow } from './nmjl2026CardGeometry'
import { loadNmjl2025CsvText } from './nmjl2025CardPayload'
import { nmjl2025PatternId, parseNmjl2026CardCsv } from './nmjl2026Csv'

const NMJL_2025_CSV_ROWS = parseNmjl2026CardCsv(loadNmjl2025CsvText())

export const NMJL_2025_CARD_SECTION_ORDER: readonly string[] = (() => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const row of NMJL_2025_CSV_ROWS) {
    if (seen.has(row.category)) continue
    seen.add(row.category)
    out.push(row.category)
  }
  return out
})()

export const NMJL_2025_PATTERNS: PracticePattern[] = NMJL_2025_CSV_ROWS.map((row) => {
  const geo = nmjl2026GeometryFromCsvRow(row)
  return {
    ...geo,
    id: nmjl2025PatternId(row),
    section: row.category,
    title: row.hand.trim(),
    points: row.points,
    closed: row.closed,
    cardHandCode: row.handNum,
    cardParenthesis: row.parenthesis.trim(),
    roughTarget: 14,
  }
})
