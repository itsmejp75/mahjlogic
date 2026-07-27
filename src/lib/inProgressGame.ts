import type { BotDifficulty } from '../analysis/botAI'
import type { RoundState } from '../app/roundState'
import type { MainPhase } from '../app/playSurfaceUi'
import type { PlayableCardId } from '../card/cardCatalog'
import type { BlankTileCount } from '../mahjong/deck'
import type { BotSlotSeats } from '../mahjong/seats'
import type { Seat, TileInstance } from '../mahjong/types'
import { getSupabase } from './supabase'

/** Bump when the JSON shape is no longer safely readable. */
export const IN_PROGRESS_GAME_SCHEMA_VERSION = 1

const TERMINAL_PHASES: ReadonlySet<MainPhase> = new Set([
  'mahjong-declared',
  'bot-mahjong',
  'dead-hand',
  'wall-game',
])

export type InProgressGameSettings = {
  cardId: PlayableCardId
  botDifficulty: BotDifficulty
  botWinsEnabled: boolean
  tenJokersEnabled: boolean
  blankTilesEnabled: boolean
  blankTileCount: BlankTileCount
  playAsEastEnabled: boolean
}

export type InProgressGameSnapshot = {
  schemaVersion: number
  clientRoundId: string
  savedAt: string
  round: RoundState
  settings: InProgressGameSettings
  /** Same opening deck order as Replay (optional). */
  openingDeck: TileInstance[] | null
  openingMeta: { playerSeat: Seat; botSlotSeats: BotSlotSeats } | null
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v != null && !Array.isArray(v)
}

function isMainPhase(v: unknown): v is MainPhase {
  return (
    v === 'east-discard' ||
    v === 'bot-turn' ||
    v === 'call-staging' ||
    v === 'mahjong-declared' ||
    v === 'dead-hand' ||
    v === 'wall-game' ||
    v === 'bot-mahjong'
  )
}

/** Strip one-shot animation fields so resume does not replay fly-ins. */
export function sanitizeRoundForSave(round: RoundState): RoundState {
  return {
    ...round,
    handTileFlyIn: null,
    handJokerSwapFlyInFromBelowId: null,
    exposureJokerSwapFlyInTileId: null,
  }
}

/** True once the player (or table) has moved past a fresh opening deal. */
export function roundHasResumeProgress(round: RoundState): boolean {
  if (TERMINAL_PHASES.has(round.mainPhase)) return false
  if (round.charlestonPhase !== 'right1') return true
  if (round.mainPhase !== 'east-discard') return true
  if (round.discardPile.length > 0) return true
  if (round.eastExposures.length > 0 || round.botExposures.length > 0) return true
  if (round.pendingEastDiscardTile != null) return true
  if (round.activeBotDiscard != null) return true
  if (round.passSlots.some((t) => t != null)) return true
  if (round.wall.length < round.openingWallTileCount) return true
  return false
}

export function isResumableSnapshot(snap: InProgressGameSnapshot | null | undefined): boolean {
  if (!snap) return false
  if (snap.schemaVersion !== IN_PROGRESS_GAME_SCHEMA_VERSION) return false
  if (!snap.round || !isMainPhase(snap.round.mainPhase)) return false
  if (TERMINAL_PHASES.has(snap.round.mainPhase)) return false
  if (!Array.isArray(snap.round.hand) || snap.round.hand.length === 0) return false
  if (!Array.isArray(snap.round.wall)) return false
  if (!roundHasResumeProgress(snap.round)) return false
  return true
}

export function buildInProgressSnapshot(input: {
  clientRoundId: string
  round: RoundState
  settings: InProgressGameSettings
  openingDeck: TileInstance[] | null
  openingMeta: { playerSeat: Seat; botSlotSeats: BotSlotSeats } | null
}): InProgressGameSnapshot | null {
  if (TERMINAL_PHASES.has(input.round.mainPhase)) return null
  if (!roundHasResumeProgress(input.round)) return null
  return {
    schemaVersion: IN_PROGRESS_GAME_SCHEMA_VERSION,
    clientRoundId: input.clientRoundId,
    savedAt: new Date().toISOString(),
    round: sanitizeRoundForSave(input.round),
    settings: input.settings,
    openingDeck: input.openingDeck,
    openingMeta: input.openingMeta,
  }
}

/** Soft-parse cloud JSON; reject unknown schema or terminal hands. */
export function parseInProgressSnapshot(raw: unknown): InProgressGameSnapshot | null {
  if (!isRecord(raw)) return null
  if (raw.schemaVersion !== IN_PROGRESS_GAME_SCHEMA_VERSION) return null
  if (typeof raw.clientRoundId !== 'string' || !raw.clientRoundId) return null
  if (typeof raw.savedAt !== 'string') return null
  if (!isRecord(raw.round) || !isMainPhase(raw.round.mainPhase)) return null
  if (!isRecord(raw.settings)) return null
  const s = raw.settings
  if (s.cardId !== 'mock' && s.cardId !== '2025' && s.cardId !== '2026') return null
  if (s.botDifficulty !== 'easy' && s.botDifficulty !== 'normal' && s.botDifficulty !== 'hard') {
    return null
  }
  if (typeof s.botWinsEnabled !== 'boolean') return null
  if (typeof s.tenJokersEnabled !== 'boolean') return null
  if (typeof s.blankTilesEnabled !== 'boolean') return null
  if (typeof s.blankTileCount !== 'number') return null
  if (typeof s.playAsEastEnabled !== 'boolean') return null

  const snap: InProgressGameSnapshot = {
    schemaVersion: IN_PROGRESS_GAME_SCHEMA_VERSION,
    clientRoundId: raw.clientRoundId,
    savedAt: raw.savedAt,
    round: sanitizeRoundForSave(raw.round as unknown as RoundState),
    settings: {
      cardId: s.cardId,
      botDifficulty: s.botDifficulty,
      botWinsEnabled: s.botWinsEnabled,
      tenJokersEnabled: s.tenJokersEnabled,
      blankTilesEnabled: s.blankTilesEnabled,
      blankTileCount: s.blankTileCount as BlankTileCount,
      playAsEastEnabled: s.playAsEastEnabled,
    },
    openingDeck: Array.isArray(raw.openingDeck) ? (raw.openingDeck as TileInstance[]) : null,
    openingMeta: isRecord(raw.openingMeta)
      ? (raw.openingMeta as InProgressGameSnapshot['openingMeta'])
      : null,
  }
  return isResumableSnapshot(snap) ? snap : null
}

export async function loadInProgressGame(): Promise<{
  snapshot: InProgressGameSnapshot | null
  error: string | null
}> {
  const supabase = getSupabase()
  if (!supabase) return { snapshot: null, error: 'Supabase is not configured.' }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { snapshot: null, error: 'Not signed in.' }

  const { data, error } = await supabase
    .from('in_progress_games')
    .select('state')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return { snapshot: null, error: error.message }
  if (!data) return { snapshot: null, error: null }
  return { snapshot: parseInProgressSnapshot(data.state), error: null }
}

export async function saveInProgressGame(
  snapshot: InProgressGameSnapshot,
): Promise<{ error: string | null }> {
  const supabase = getSupabase()
  if (!supabase) return { error: 'Supabase is not configured.' }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const { error } = await supabase.from('in_progress_games').upsert(
    {
      user_id: user.id,
      state: snapshot,
      schema_version: snapshot.schemaVersion,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )

  return { error: error?.message ?? null }
}

export async function clearInProgressGame(): Promise<{ error: string | null }> {
  const supabase = getSupabase()
  if (!supabase) return { error: 'Supabase is not configured.' }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const { error } = await supabase.from('in_progress_games').delete().eq('user_id', user.id)
  return { error: error?.message ?? null }
}

/** Debounce rapid round updates into a single upsert. */
export function createDebouncedInProgressGameSaver(delayMs = 800): {
  schedule: (snapshot: InProgressGameSnapshot) => void
  /** Flush pending save immediately (pagehide / visibility hidden). */
  flush: () => void
  cancel: () => void
} {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: InProgressGameSnapshot | null = null

  const write = (snap: InProgressGameSnapshot) => {
    void saveInProgressGame(snap)
  }

  return {
    schedule(snapshot) {
      pending = snapshot
      if (timer != null) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        const next = pending
        pending = null
        if (next) write(next)
      }, delayMs)
    },
    flush() {
      if (timer != null) clearTimeout(timer)
      timer = null
      const next = pending
      pending = null
      if (next) write(next)
    },
    cancel() {
      if (timer != null) clearTimeout(timer)
      timer = null
      pending = null
    },
  }
}
