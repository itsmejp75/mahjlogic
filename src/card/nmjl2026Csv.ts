/**
 * Parse `src/card/data/2026-nmjl-card.csv` (league card export).
 * Handles quoted fields; ignores preamble and blank rows.
 */

export type Nmjl2026CsvHandRow = {
  category: string
  handNum: string
  hand: string
  colors: string
  parenthesis: string
  valueRaw: string
  points: number
  closed: boolean
}

/** Split a CSV line into fields (handles "..." quotes, no embedded newlines). */
export function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
        continue
      }
      inQuotes = !inQuotes
      continue
    }
    if (!inQuotes && c === ',') {
      out.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  out.push(cur)
  return out
}

function parseValueColumn(raw: string): { points: number; closed: boolean } {
  const s = raw.trim().toUpperCase()
  const closed = s.startsWith('C')
  const m = s.match(/\d+/)
  const points = m ? Number(m[0]) : 0
  return { points, closed }
}

export function parseNmjl2026CardCsv(text: string): Nmjl2026CsvHandRow[] {
  const lines = text.split(/\r?\n/)
  const out: Nmjl2026CsvHandRow[] = []
  let headerSeen = false
  for (const line of lines) {
    if (!line.trim()) continue
    const fields = splitCsvLine(line)
    if (fields[0]?.trim() === 'Category' && fields[1]?.trim() === 'Hand #') {
      headerSeen = true
      continue
    }
    if (!headerSeen) continue
    const category = (fields[0] ?? '').trim()
    const handNum = (fields[1] ?? '').trim()
    const hand = (fields[2] ?? '').trim()
    if (!category || !handNum || !hand) continue
    const colors = (fields[3] ?? '').trim()
    const parenthesis = (fields[4] ?? '').trim()
    const valueRaw = (fields[5] ?? '').trim()
    const { points, closed } = parseValueColumn(valueRaw)
    out.push({
      category,
      handNum,
      hand,
      colors,
      parenthesis,
      valueRaw,
      points,
      closed,
    })
  }
  return out
}

export function nmjl2026RowKey(row: Nmjl2026CsvHandRow): string {
  return `${row.category}\t${row.handNum}`
}

/**
 * Every 2026 league hand id starts with this string so it **never** equals a mock practice-card id
 * from `PRACTICE_PATTERNS` (for example `like-3`, `2468-2`).
 */
export const NMJL_2026_PATTERN_ID_PREFIX = 'nmjl2026:' as const

/** 2025 league hand id prefix — disjoint from mock and from `nmjl2026:…`. */
export const NMJL_2025_PATTERN_ID_PREFIX = 'nmjl2025:' as const

export function isNmjl2026LeaguePatternId(id: string): boolean {
  return id.startsWith(NMJL_2026_PATTERN_ID_PREFIX)
}

export function isNmjl2025LeaguePatternId(id: string): boolean {
  return id.startsWith(NMJL_2025_PATTERN_ID_PREFIX)
}

/** Stable id for one CSV row. Always year-prefixed so mock and league cards stay disjoint. */
export function nmjlLeaguePatternId(row: Nmjl2026CsvHandRow, year: '2025' | '2026'): string {
  const prefix = year === '2025' ? NMJL_2025_PATTERN_ID_PREFIX : NMJL_2026_PATTERN_ID_PREFIX
  const h = row.handNum.replace(/[^a-zA-Z0-9]/g, '') || row.handNum
  let base: string
  switch (row.category) {
    case '2025':
    case '2026':
      base = `${row.category}-${row.handNum}`
      break
    case '2468':
      base = `2468-${row.handNum}`
      break
    case 'ANY LIKE NUMBERS':
      base = `like-${row.handNum}`
      break
    case 'QUINTS':
      base = `quint-${row.handNum}`
      break
    case 'CONSECUTIVE RUN':
      base = `consec-${row.handNum}`
      break
    case '13579':
      base = `13579-${row.handNum}`
      break
    case 'WINDS - DRAGONS':
      base = `wd-${row.handNum}`
      break
    case '369':
      base = `369-${row.handNum}`
      break
    case 'SINGLES AND PAIRS':
      base = `sp-${row.handNum}`
      break
    default:
      base = `nmjl-${h}`
  }
  return `${prefix}${base}`
}

export function nmjl2026PatternId(row: Nmjl2026CsvHandRow): string {
  return nmjlLeaguePatternId(row, '2026')
}

export function nmjl2025PatternId(row: Nmjl2026CsvHandRow): string {
  return nmjlLeaguePatternId(row, '2025')
}
