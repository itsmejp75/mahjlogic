import type { PlayableCardId } from '../card/cardCatalog'
import type { DeadHandReason } from '../mahjong/deadHandReason'
import type { BotDifficulty } from '../analysis/botAI'
import { getSupabase } from './supabase'

export type GameOutcome = 'player_win' | 'bot_win' | 'dead_hand' | 'wall_game'
export type GameWinMethod = 'self-draw' | 'called-discard'
export type WallEndedBy = 'natural' | 'manual_end'

export type GameResultInsert = {
  outcome: GameOutcome
  cardId: PlayableCardId
  patternId?: string | null
  handTitle?: string | null
  handSection?: string | null
  cardHandCode?: string | null
  /**
   * Player-perspective settlement for this hand (NMJL-style):
   * win = total collected (4× or 6× base); loss = amount paid (1× or 2× base).
   */
  points?: number | null
  closed?: boolean | null
  winMethod?: GameWinMethod | null
  deadHandReason?: DeadHandReason | null
  botDifficulty?: BotDifficulty | null
  endedBy?: WallEndedBy | null
}

export type GameResultRow = {
  id: string
  user_id: string
  created_at: string
  outcome: GameOutcome
  card_id: string
  pattern_id: string | null
  hand_title: string | null
  hand_section: string | null
  card_hand_code: string | null
  points: number | null
  closed: boolean | null
  win_method: GameWinMethod | null
  dead_hand_reason: string | null
  bot_difficulty: string | null
  ended_by: WallEndedBy | null
}

export type WinningHandStat = {
  patternId: string
  handTitle: string
  handSection: string | null
  cardHandCode: string | null
  cardId: string
  count: number
}

export type GameStatsSummary = {
  gamesPlayed: number
  wins: number
  losses: number
  wallGames: number
  winPercent: number
  lossPercent: number
  wallPercent: number
  /** Sum of card points on player wins. */
  pointsWon: number
  /** Sum of card points on losses (bot wins / dead hands). */
  pointsLost: number
  winningHands: WinningHandStat[]
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0
  return Math.round((part / whole) * 1000) / 10
}

export function emptyGameStatsSummary(): GameStatsSummary {
  return {
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    wallGames: 0,
    winPercent: 0,
    lossPercent: 0,
    wallPercent: 0,
    pointsWon: 0,
    pointsLost: 0,
    winningHands: [],
  }
}

/** Insert one finished hand for the signed-in user. No-op when auth/client missing. */
export async function recordGameResult(input: GameResultInsert): Promise<{ error: string | null }> {
  const supabase = getSupabase()
  if (!supabase) return { error: 'Supabase is not configured.' }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const { error } = await supabase.from('game_results').insert({
    user_id: user.id,
    outcome: input.outcome,
    card_id: input.cardId,
    pattern_id: input.patternId ?? null,
    hand_title: input.handTitle ?? null,
    hand_section: input.handSection ?? null,
    card_hand_code: input.cardHandCode ?? null,
    points: input.points ?? null,
    closed: input.closed ?? null,
    win_method: input.winMethod ?? null,
    dead_hand_reason: input.deadHandReason ?? null,
    bot_difficulty: input.botDifficulty ?? null,
    ended_by: input.endedBy ?? null,
  })

  return { error: error?.message ?? null }
}

/** Delete all game history / stats rows for the signed-in user (resets points too). */
export async function clearGameResults(): Promise<{ error: string | null }> {
  const supabase = getSupabase()
  if (!supabase) return { error: 'Supabase is not configured.' }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const { error } = await supabase.from('game_results').delete().eq('user_id', user.id)
  return { error: error?.message ?? null }
}

export async function fetchGameResults(opts?: {
  limit?: number
}): Promise<{ rows: GameResultRow[]; error: string | null }> {
  const supabase = getSupabase()
  if (!supabase) return { rows: [], error: 'Supabase is not configured.' }

  const limit = opts?.limit ?? 50
  const { data, error } = await supabase
    .from('game_results')
    .select(
      'id, user_id, created_at, outcome, card_id, pattern_id, hand_title, hand_section, card_hand_code, points, closed, win_method, dead_hand_reason, bot_difficulty, ended_by',
    )
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return { rows: [], error: error.message }
  return { rows: (data ?? []) as GameResultRow[], error: null }
}

export function summarizeGameResults(rows: GameResultRow[]): GameStatsSummary {
  let wins = 0
  let losses = 0
  let wallGames = 0
  let pointsWon = 0
  let pointsLost = 0
  const handCounts = new Map<string, WinningHandStat>()

  for (const row of rows) {
    if (row.outcome === 'player_win') {
      wins += 1
      pointsWon += row.points ?? 0
      if (row.pattern_id) {
        const key = `${row.card_id}::${row.pattern_id}`
        const prev = handCounts.get(key)
        if (prev) {
          prev.count += 1
        } else {
          handCounts.set(key, {
            patternId: row.pattern_id,
            handTitle: row.hand_title ?? row.pattern_id,
            handSection: row.hand_section,
            cardHandCode: row.card_hand_code,
            cardId: row.card_id,
            count: 1,
          })
        }
      }
    } else if (row.outcome === 'bot_win' || row.outcome === 'dead_hand') {
      losses += 1
      pointsLost += row.points ?? 0
    } else if (row.outcome === 'wall_game') {
      wallGames += 1
    }
  }

  const gamesPlayed = wins + losses + wallGames
  const winningHands = [...handCounts.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    return a.handTitle.localeCompare(b.handTitle)
  })

  return {
    gamesPlayed,
    wins,
    losses,
    wallGames,
    winPercent: pct(wins, gamesPlayed),
    lossPercent: pct(losses, gamesPlayed),
    wallPercent: pct(wallGames, gamesPlayed),
    pointsWon,
    pointsLost,
    winningHands,
  }
}

/** Fetch recent results and aggregate stats (wins / losses / wall + top winning hands). */
export async function fetchStatsSummary(opts?: {
  limit?: number
}): Promise<{ summary: GameStatsSummary; error: string | null }> {
  const { rows, error } = await fetchGameResults({ limit: opts?.limit ?? 5000 })
  if (error) {
    return { summary: emptyGameStatsSummary(), error }
  }
  return { summary: summarizeGameResults(rows), error: null }
}

export function gameOutcomeLabel(outcome: GameOutcome): string {
  switch (outcome) {
    case 'player_win':
      return 'Win'
    case 'bot_win':
      return 'Loss (bot)'
    case 'dead_hand':
      return 'Loss (dead hand)'
    case 'wall_game':
      return 'Wall game'
  }
}
