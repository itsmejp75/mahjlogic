import {
  CARD_SECTION_DISPLAY_LABEL,
  PRACTICE_CARD_SECTION_ORDER,
} from '@mahjlogic/card-books'
import type { PracticePattern } from '../card/practicePatterns'
import { claimMeldsFitPracticePattern } from '../analysis/eastExposurePatternFit'
import type { TileInstance } from '../mahjong/types'

/**
 * Canonical `PracticePattern.section` / CSV category keys → short labels for the suggested-hands
 * menu and the suggested-hands list (storage and filters still use the canonical keys).
 * Labels live in `@mahjlogic/card-books` so public web stubs omit them.
 */
const SUGGESTED_HAND_SECTION_DISPLAY_LABEL = CARD_SECTION_DISPLAY_LABEL

/** When `'1'`, hands marked concealed (C) are omitted from the suggested list. */
export const HIDE_CONCEALED_HANDS_STORAGE_KEY = 'mahjlogic:suggested-hands-hide-concealed'

/** JSON array of section names the user has turned off in the menu. */
export const SUGGESTED_HANDS_UNCHECKED_SECTIONS_KEY = 'mahjlogic.suggestedHandsUncheckedSections'

/**
 * Mock vs 2026 CSV use different canonical section strings for the same menu category.
 * Filter storage and checks always treat these keys as one toggle.
 */
const SUGGESTED_HAND_SECTION_FILTER_ALIAS_GROUPS: readonly (readonly string[])[] = [
  ['CONSECUTIVE RUN', 'CONSECUTIVE RUNS'],
  ['WINDS - DRAGONS', 'WINDS-DRAGONS'],
]

const suggestedHandSectionFilterAliasKeys = new Map<string, readonly string[]>()
for (const group of SUGGESTED_HAND_SECTION_FILTER_ALIAS_GROUPS) {
  for (const key of group) {
    suggestedHandSectionFilterAliasKeys.set(key, group)
  }
}

/** All filter keys tied to this section (including cross-card aliases). */
export function suggestedHandSectionFilterKeys(section: string): readonly string[] {
  return suggestedHandSectionFilterAliasKeys.get(section) ?? [section]
}

/** True when the menu category is on and hands from this section may appear in the list. */
export function isSuggestedHandSectionFilterEnabled(
  section: string,
  uncheckedSections: ReadonlySet<string>,
): boolean {
  return !suggestedHandSectionFilterKeys(section).some((k) => uncheckedSections.has(k))
}

/** Apply one menu toggle; keeps alias keys in sync across cards. */
export function toggledSuggestedHandSectionFilter(
  section: string,
  uncheckedSections: ReadonlySet<string>,
  enable: boolean,
): Set<string> {
  const keys = suggestedHandSectionFilterKeys(section)
  const next = new Set(uncheckedSections)
  if (enable) {
    for (const k of keys) next.delete(k)
  } else {
    for (const k of keys) next.add(k)
  }
  return next
}

function normalizeUncheckedSectionAliases(set: Set<string>): Set<string> {
  const next = new Set(set)
  for (const group of SUGGESTED_HAND_SECTION_FILTER_ALIAS_GROUPS) {
    if (group.some((k) => next.has(k))) {
      for (const k of group) next.add(k)
    }
  }
  return next
}

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
    return normalizeUncheckedSectionAliases(
      new Set(arr.filter((x): x is string => typeof x === 'string')),
    )
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
 * Display label for suggested-hands UI (menu toggles, list category column).
 * Uses compact NMJL abbreviations when defined; otherwise title-case words / hyphen segments.
 */
export function suggestedHandSectionMenuLabel(section: string): string {
  const mapped = SUGGESTED_HAND_SECTION_DISPLAY_LABEL[section]
  if (mapped != null) return mapped
  return section
    .split(/\s+/)
    .map((token) => (token.includes('-') ? token.split('-').map(titleCaseMenuSegment).join('-') : titleCaseMenuSegment(token)))
    .join(' ')
}

/**
 * Two-column column-major layout (read down column 1, then column 2) — 10 NMJL sections → 5×2.
 */
export function suggestedHandsFilterMenuColumns(
  order: readonly string[] = PRACTICE_CARD_SECTION_ORDER,
): string[][] {
  const n = order.length
  if (n === 0) return [[], []]
  const colCount = 2
  const rows = Math.ceil(n / colCount)
  const cols: string[][] = [[], []]
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

/**
 * Card sections that still have at least one open (non-concealed) hand line compatible with
 * this seat's committed claim melds — same filter as `rankSuggestedHands` when exposures exist.
 */
export function suggestedHandSectionsAvailableWithClaimMelds(
  book: readonly PracticePattern[],
  claimMelds: ReadonlyArray<{ tiles: TileInstance[] }>,
  sectionOrder: readonly string[] = PRACTICE_CARD_SECTION_ORDER,
): Set<string> {
  if (claimMelds.length === 0) return new Set(sectionOrder)
  const available = new Set<string>()
  for (const p of book) {
    if (p.closed) continue
    if (!claimMeldsFitPracticePattern(p, claimMelds)) continue
    available.add(p.section)
  }
  return available
}
