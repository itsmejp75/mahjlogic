/**
 * Mock practice card — MahjLogic’s free/teaching card.
 * Built from `data/mock-nmjl-card.csv` (remix of classic pre-2025 NMJL-style structures;
 * not an official league card). Uses the same geometry pipeline as 2025/2026.
 */
import mockCsv from './data/mock-nmjl-card.csv?raw'
import { nmjl2026GeometryFromCsvRow } from './nmjl2026CardGeometry'
import { parseNmjl2026CardCsv, type Nmjl2026CsvHandRow } from './nmjl2026Csv'
import type { PracticePattern } from './practicePatterns'

const MOCK_CSV_ROWS = parseNmjl2026CardCsv(mockCsv)

function mockPatternId(row: Nmjl2026CsvHandRow): string {
  const h = row.handNum.replace(/[^a-zA-Z0-9]/g, '') || row.handNum
  switch (row.category) {
    case '2019':
      return `year-${row.handNum}`
    case '2468':
      return `2468-${row.handNum}`
    case 'ANY LIKE NUMBERS':
      return `like-${row.handNum}`
    case 'QUINTS':
      return `quint-${row.handNum}`
    case 'CONSECUTIVE RUN':
      return `consec-${row.handNum}`
    case '13579':
      return `13579-${row.handNum}`
    case 'WINDS - DRAGONS':
      return `wd-${row.handNum}`
    case '369':
      return `369-${row.handNum}`
    case 'SINGLES AND PAIRS':
      return `sp-${row.handNum}`
    default:
      return `mock-${h}`
  }
}

export const PRACTICE_CARD_SECTION_ORDER: readonly string[] = (() => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const row of MOCK_CSV_ROWS) {
    if (seen.has(row.category)) continue
    seen.add(row.category)
    out.push(row.category)
  }
  return out
})()

export const PRACTICE_PATTERNS: PracticePattern[] = MOCK_CSV_ROWS.map((row) => {
  const geo = nmjl2026GeometryFromCsvRow(row)
  return {
    ...geo,
    id: mockPatternId(row),
    section: row.category,
    title: row.hand.trim(),
    points: row.points,
    closed: row.closed,
    cardHandCode: row.handNum,
    cardParenthesis: row.parenthesis.trim() || undefined,
    roughTarget: 14,
  }
})
