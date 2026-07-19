import {
  NMJL_2025_PATTERNS,
  NMJL_2026_PATTERNS,
  PRACTICE_PATTERNS,
} from '@mahjlogic/card-books'
import type { PracticePattern } from './practicePatterns'
import { isCardBookBundled } from './cardContentAccess'

export type PlayableCardId = 'mock' | '2025' | '2026'

export const PLAYABLE_CARD_IDS: readonly PlayableCardId[] = ['mock', '2025', '2026'] as const

export const PLAYABLE_CARD_LABEL: Record<PlayableCardId, string> = {
  mock: 'Mock',
  '2025': '2025',
  '2026': '2026',
}

export const LS_KEY_PLAYABLE_CARD = 'mahjlogic.playableCardId.v1'

export function isPlayableCardId(s: string | null | undefined): s is PlayableCardId {
  return s === 'mock' || s === '2025' || s === '2026'
}

export function patternsForCard(id: PlayableCardId): PracticePattern[] {
  if (id === 'mock') return PRACTICE_PATTERNS
  if (id === '2025') return NMJL_2025_PATTERNS
  return NMJL_2026_PATTERNS
}

/** False on public web builds that omit card books from the bundle. */
export function isCardContentAvailable(): boolean {
  return (
    isCardBookBundled() &&
    (PRACTICE_PATTERNS.length > 0 || NMJL_2025_PATTERNS.length > 0 || NMJL_2026_PATTERNS.length > 0)
  )
}

/** Section order for filters / suggested-hands list — first occurrence per section in card array order. */
export function cardSectionOrderFromPatterns(patterns: PracticePattern[]): readonly string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of patterns) {
    if (seen.has(p.section)) continue
    seen.add(p.section)
    out.push(p.section)
  }
  return out
}

export function readPlayableCardFromStorage(): PlayableCardId {
  try {
    const v = localStorage.getItem(LS_KEY_PLAYABLE_CARD)
    if (isPlayableCardId(v)) return v
  } catch {
    /* ignore */
  }
  return '2026'
}

export function writePlayableCardToStorage(id: PlayableCardId): void {
  try {
    localStorage.setItem(LS_KEY_PLAYABLE_CARD, id)
  } catch {
    /* ignore */
  }
}

/** Short label for in-game copy (dead hand, warnings). */
export function playableCardShortLabel(id: PlayableCardId): string {
  return id === 'mock' ? 'Mock practice card' : `${id} NMJL card`
}

/** Title-style label for post-game overlays (Mah Jongg win, etc.). */
export function playableCardHeadingLabel(id: PlayableCardId): string {
  return id === 'mock' ? 'Practice Card' : `${id} NMJL Card`
}
