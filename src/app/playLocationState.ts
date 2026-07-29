/** Location state for `/play` and hub deep-links. */
export type PlayIntent = 'new' | 'resume'

export type PlayLocationState = {
  playIntent?: PlayIntent
  openRackChecker?: boolean
  openStats?: boolean
}

/** Home → Play: skip the cold-start theme wait + boot-bar so the table can appear immediately. */
const LS_PLAY_ENTER_FAST = 'mahjlogic.playEnterFast'

/** Module latch so React Strict Mode remounts still see the fast path until Play clears it. */
let playEnterFastLatched = false

export function markPlayEnterFastPath(): void {
  playEnterFastLatched = true
  try {
    sessionStorage.setItem(LS_PLAY_ENTER_FAST, '1')
  } catch {
    /* ignore */
  }
}

/** True after Home → Play until {@link clearPlayEnterFastPath}. */
export function peekPlayEnterFastPath(): boolean {
  if (playEnterFastLatched) return true
  try {
    return sessionStorage.getItem(LS_PLAY_ENTER_FAST) === '1'
  } catch {
    return false
  }
}

/** Call once the play shell has taken over (after eager deal / session ready). */
export function clearPlayEnterFastPath(): void {
  playEnterFastLatched = false
  try {
    sessionStorage.removeItem(LS_PLAY_ENTER_FAST)
  } catch {
    /* ignore */
  }
}

export function readPlayLocationState(state: unknown): PlayLocationState {
  if (typeof state !== 'object' || state == null) return {}
  const s = state as Record<string, unknown>
  const out: PlayLocationState = {}
  if (s.playIntent === 'new' || s.playIntent === 'resume') out.playIntent = s.playIntent
  if (s.openRackChecker === true) out.openRackChecker = true
  if (s.openStats === true) out.openStats = true
  return out
}
