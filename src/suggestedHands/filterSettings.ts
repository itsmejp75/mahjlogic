import { PRACTICE_CARD_SECTION_ORDER } from '../card/practicePatterns'

/** Text size tier for the suggested-hands popup (`small` | `medium` | `large`). */
export const SUGGESTED_HANDS_FONT_SIZE_OPTIONS = ['small', 'medium', 'large'] as const
export type SuggestedHandsFontSize = (typeof SUGGESTED_HANDS_FONT_SIZE_OPTIONS)[number]

export const SUGGESTED_HANDS_FONT_SIZE_STORAGE_KEY = 'mahjlogic:suggested-hands-font-size'
export const SUGGESTED_HANDS_FONT_SIZE_DEFAULT: SuggestedHandsFontSize = 'medium'

export function isSuggestedHandsFontSize(value: string): value is SuggestedHandsFontSize {
  return (SUGGESTED_HANDS_FONT_SIZE_OPTIONS as readonly string[]).includes(value)
}

export function readSuggestedHandsFontSizeFromStorage(): SuggestedHandsFontSize {
  try {
    const raw = localStorage.getItem(SUGGESTED_HANDS_FONT_SIZE_STORAGE_KEY)
    if (raw != null && isSuggestedHandsFontSize(raw)) return raw
  } catch {
    /* ignore */
  }
  return SUGGESTED_HANDS_FONT_SIZE_DEFAULT
}

export function writeSuggestedHandsFontSizeToStorage(value: SuggestedHandsFontSize): void {
  try {
    localStorage.setItem(SUGGESTED_HANDS_FONT_SIZE_STORAGE_KEY, value)
  } catch {
    /* ignore */
  }
}

/** When `'1'`, hands marked concealed (C) are omitted from the suggested list. */
export const HIDE_CONCEALED_HANDS_STORAGE_KEY = 'mahjlogic:suggested-hands-hide-concealed'

/** JSON array of section names the user has turned off in the menu. */
export const SUGGESTED_HANDS_UNCHECKED_SECTIONS_KEY = 'mahjlogic.suggestedHandsUncheckedSections'

export function readHideConcealedHandsFromStorage(): boolean {
  try {
    const raw = localStorage.getItem(HIDE_CONCEALED_HANDS_STORAGE_KEY)
    if (raw == null) return false
    return raw === '1'
  } catch {
    return false
  }
}

export function writeHideConcealedHandsToStorage(value: boolean): void {
  try {
    localStorage.setItem(HIDE_CONCEALED_HANDS_STORAGE_KEY, value ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function readUncheckedSectionsFromStorage(): Set<string> {
  try {
    const raw = localStorage.getItem(SUGGESTED_HANDS_UNCHECKED_SECTIONS_KEY)
    if (raw == null || raw === '') return new Set()
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return new Set()
    return new Set(arr.filter((x): x is string => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

export function writeUncheckedSectionsToStorage(set: Set<string>): void {
  try {
    localStorage.setItem(SUGGESTED_HANDS_UNCHECKED_SECTIONS_KEY, JSON.stringify([...set]))
  } catch {
    /* ignore */
  }
}

/** First character upper, remainder lower; digits-only segments unchanged. */
function titleCaseMenuSegment(seg: string): string {
  if (seg === '' || seg === '-') return seg
  if (/^\d+$/.test(seg)) return seg
  const lower = seg.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

/**
 * Display label for the suggested-hands filter menu (card section keys stay canonical for storage).
 * Title case per word; hyphenated names get each segment title-cased (e.g. Winds-Dragons).
 */
export function suggestedHandSectionMenuLabel(section: string): string {
  return section
    .split(/\s+/)
    .map((token) => (token.includes('-') ? token.split('-').map(titleCaseMenuSegment).join('-') : titleCaseMenuSegment(token)))
    .join(' ')
}

/**
 * Column-major layout (read down column 1, then column 2, …) to match common NMJL filter sheets.
 */
export function suggestedHandsFilterMenuColumns(
  order: readonly string[] = PRACTICE_CARD_SECTION_ORDER,
): string[][] {
  const n = order.length
  if (n === 0) return [[], [], []]
  const colCount = 3
  const rows = Math.ceil(n / colCount)
  const cols: string[][] = [[], [], []]
  for (let c = 0; c < colCount; c++) {
    for (let r = 0; r < rows; r++) {
      const i = c * rows + r
      if (i < n) cols[c]!.push(order[i]!)
    }
  }
  return cols
}

/** Precomputed column-major layout for the app menu (practice card section order). */
export const SUGGESTED_HANDS_FILTER_MENU_COLUMNS = suggestedHandsFilterMenuColumns()
