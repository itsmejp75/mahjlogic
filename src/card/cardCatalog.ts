import type { PracticePattern } from './practicePatterns'
import { PRACTICE_PATTERNS } from './practicePatterns'
import { NMJL_2026_PATTERNS } from './nmjl2026Patterns'

export type PlayableCardId = 'mock' | '2026'

export const PLAYABLE_CARD_IDS: readonly PlayableCardId[] = ['mock', '2026'] as const

export const PLAYABLE_CARD_LABEL: Record<PlayableCardId, string> = {
  mock: 'Mock',
  '2026': '2026',
}

export const LS_KEY_PLAYABLE_CARD = 'mahjlogic.playableCardId.v1'

export function isPlayableCardId(s: string | null | undefined): s is PlayableCardId {
  return s === 'mock' || s === '2026'
}

export function patternsForCard(id: PlayableCardId): PracticePattern[] {
  // Mock vs league are separate arrays; league ids are prefixed (`nmjl2026:…`) — see `nmjl2026PatternId`.
  return id === 'mock' ? PRACTICE_PATTERNS : NMJL_2026_PATTERNS
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
  return 'mock'
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
  return id === 'mock' ? 'Mock practice card' : '2026 NMJL card'
}

/** Title-style label for post-game overlays (Mah Jongg win, etc.). */
export function playableCardHeadingLabel(id: PlayableCardId): string {
  return id === 'mock' ? 'Practice Card' : '2026 NMJL Card'
}
