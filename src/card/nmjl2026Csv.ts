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

export function nmjl2026PatternId(row: Nmjl2026CsvHandRow): string {
  const h = row.handNum.replace(/[^a-zA-Z0-9]/g, '') || row.handNum
  switch (row.category) {
    case '2026':
      return `2026-${row.handNum}`
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
      return `nmjl-${h}`
  }
}
