/**
 * Google Analytics 4 (gtag) helpers.
 *
 * After deploy, in GA4 Admin → Data display → Custom definitions, register:
 *   Event-scoped dimensions: player_id, winner, winner_kind, bot_seat, outcome,
 *     card_id, bot_difficulty, hand_title, hand_section, card_hand_code,
 *     win_method, ended_by
 *   Event-scoped metrics: duration_seconds, joker_count, resumed
 *
 * Explorations:
 *   - Each logged-in player: break down by `player_id`
 *   - Bots only: filter `winner_kind` = bot
 *   - All humans, no bots: filter `winner_kind` = human
 *   - Everyone together (humans + bots): no winner_kind filter; break down by `winner`
 *
 * `winner` is the logged-in player id on a human win, or `bot:<seat>` on a bot win.
 * Do not send email or display names (GA PII policy).
 *
 * Events appear in DebugView immediately; standard reports can take up to 24 hours.
 */

export const GA_MEASUREMENT_ID = 'G-RVCERNZJ9S'

export type GameAnalyticsOutcome =
  | 'player_win'
  | 'bot_win'
  | 'dead_hand'
  | 'wall_game'
  | 'new_rack'
  | 'abandoned'

export type GameAnalyticsWinnerKind = 'human' | 'bot' | 'none'

export type GameStartParams = {
  roundId: string
  cardId: string
  botDifficulty: string
  resumed?: boolean
}

export type GameEndParams = {
  outcome: GameAnalyticsOutcome
  roundId?: string
  cardId?: string
  botDifficulty?: string
  handTitle?: string | null
  handSection?: string | null
  cardHandCode?: string | null
  jokerCount?: number | null
  winMethod?: string | null
  endedBy?: string | null
  /** Compass seat of the winning bot (`south` / `west` / `north` / `east`). */
  botSeat?: string | null
}

type LiveGame = {
  roundId: string
  startedAt: number
  cardId: string
  botDifficulty: string
}

type GtagFn = (...args: unknown[]) => void

declare global {
  interface Window {
    gtag?: GtagFn
    dataLayer?: unknown[]
  }
}

const GA_STRING_MAX = 100

let live: LiveGame | null = null
/** Last outcome sent per round — abandoned can be followed by a real result. */
const sentEnds = new Map<string, GameAnalyticsOutcome>()
let lastPageViewPath = ''
let lastPageViewAt = 0
/** Signed-in account id (Supabase). Never email. */
let analyticsUserId: string | null = null

function gtag(): GtagFn | null {
  if (typeof window === 'undefined') return null
  return typeof window.gtag === 'function' ? window.gtag : null
}

function clip(value: string | null | undefined): string | undefined {
  if (value == null) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.length > GA_STRING_MAX ? trimmed.slice(0, GA_STRING_MAX) : trimmed
}

function compactParams(params: Record<string, string | number | undefined>): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue
    out[key] = value
  }
  return out
}

export function winnerKindForOutcome(outcome: GameAnalyticsOutcome): GameAnalyticsWinnerKind {
  if (outcome === 'player_win') return 'human'
  if (outcome === 'bot_win') return 'bot'
  return 'none'
}

/** Who won: logged-in player id, `bot:<seat>`, or `none`. */
export function winnerIdForOutcome(
  outcome: GameAnalyticsOutcome,
  opts?: { playerId?: string | null; botSeat?: string | null },
): string {
  if (outcome === 'player_win') {
    const id = opts?.playerId?.trim()
    return id ? id : 'human'
  }
  if (outcome === 'bot_win') {
    const seat = opts?.botSeat?.trim().toLowerCase()
    return seat ? `bot:${seat}` : 'bot'
  }
  return 'none'
}

export function currentAnalyticsUserId(): string | null {
  return analyticsUserId
}

/**
 * Bind GA to the signed-in account. Pass `null` on sign-out.
 * Uses GA4 User-ID plus `player_id` on events — not email or name.
 */
export function setAnalyticsUser(userId: string | null): void {
  const next = userId?.trim() ? userId.trim() : null
  analyticsUserId = next
  const send = gtag()
  if (!send) return
  send('config', GA_MEASUREMENT_ID, {
    send_page_view: false,
    user_id: next ?? '',
  })
}

export function durationSecondsSince(startedAt: number, now = Date.now()): number {
  if (!Number.isFinite(startedAt) || startedAt <= 0) return 0
  return Math.max(0, Math.round((now - startedAt) / 1000))
}

export function hasLiveGame(): boolean {
  return live != null
}

export function liveRoundId(): string | null {
  return live?.roundId ?? null
}

function shouldSkipEnd(roundId: string, outcome: GameAnalyticsOutcome): boolean {
  const prev = sentEnds.get(roundId)
  if (!prev) return false
  if (prev === outcome) return true
  if (prev !== 'abandoned') return true
  return outcome === 'abandoned'
}

export function trackEvent(name: string, params?: Record<string, string | number | undefined>): void {
  const send = gtag()
  if (!send) return
  const compact = params ? compactParams(params) : undefined
  if (compact && Object.keys(compact).length > 0) {
    send('event', name, compact)
    return
  }
  send('event', name)
}

export function trackPageView(path: string): void {
  const normalized = path.startsWith('/') ? path : `/${path}`
  const now = Date.now()
  if (normalized === lastPageViewPath && now - lastPageViewAt < 800) return
  lastPageViewPath = normalized
  lastPageViewAt = now

  const send = gtag()
  if (!send) return
  const locationHref =
    typeof window !== 'undefined' ? `${window.location.origin}${normalized}` : normalized
  send('event', 'page_view', {
    page_path: normalized,
    page_location: locationHref,
    send_to: GA_MEASUREMENT_ID,
  })
}

function isDevPreviewSearch(): boolean {
  if (typeof window === 'undefined') return false
  const q = new URLSearchParams(window.location.search)
  return q.has('previewWinHand') || q.has('previewEndDialog') || q.has('previewMenu')
}

export function trackGameStart(input: GameStartParams): void {
  if (isDevPreviewSearch()) return
  const roundId = input.roundId.trim()
  if (!roundId) return
  sentEnds.delete(roundId)
  live = {
    roundId,
    startedAt: Date.now(),
    cardId: input.cardId,
    botDifficulty: input.botDifficulty,
  }
  trackEvent('game_start', {
    player_id: clip(analyticsUserId),
    card_id: clip(input.cardId),
    bot_difficulty: clip(input.botDifficulty),
    resumed: input.resumed ? 1 : 0,
  })
}

export function trackGameEnd(input: GameEndParams): boolean {
  if (isDevPreviewSearch()) return false
  const outcome = input.outcome
  const fromLive = live
  const roundId = (input.roundId ?? fromLive?.roundId ?? '').trim()

  if (outcome === 'abandoned' || outcome === 'new_rack') {
    if (!fromLive) return false
  }
  if (!roundId) return false
  if (shouldSkipEnd(roundId, outcome)) return false

  const startedAt = fromLive?.roundId === roundId ? fromLive.startedAt : 0
  const duration = startedAt > 0 ? durationSecondsSince(startedAt) : undefined
  const cardId = input.cardId ?? fromLive?.cardId
  const botDifficulty = input.botDifficulty ?? fromLive?.botDifficulty
  const isWin = outcome === 'player_win' || outcome === 'bot_win'
  const playerId = analyticsUserId
  const botSeat = outcome === 'bot_win' ? clip(input.botSeat)?.toLowerCase() : undefined

  sentEnds.set(roundId, outcome)
  if (fromLive?.roundId === roundId) live = null

  trackEvent('game_end', {
    outcome,
    player_id: clip(playerId),
    winner_kind: winnerKindForOutcome(outcome),
    winner: winnerIdForOutcome(outcome, { playerId, botSeat }),
    bot_seat: botSeat,
    duration_seconds: duration,
    card_id: clip(cardId),
    bot_difficulty: clip(botDifficulty),
    hand_title: isWin ? clip(input.handTitle) : undefined,
    hand_section: isWin ? clip(input.handSection) : undefined,
    card_hand_code: isWin ? clip(input.cardHandCode) : undefined,
    joker_count: isWin && input.jokerCount != null ? input.jokerCount : undefined,
    win_method: isWin ? clip(input.winMethod) : undefined,
    ended_by: outcome === 'wall_game' ? clip(input.endedBy) : undefined,
  })
  return true
}

/** Send `game_end` / abandoned when the player leaves mid-hand. */
export function trackGameAbandonedIfInProgress(): boolean {
  if (!live) return false
  return trackGameEnd({ outcome: 'abandoned' })
}

/** Test-only: clear module state between cases. */
export function resetAnalyticsForTests(): void {
  live = null
  sentEnds.clear()
  lastPageViewPath = ''
  lastPageViewAt = 0
  analyticsUserId = null
}
