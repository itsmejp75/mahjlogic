/** Location state for `/play` and hub deep-links. */
export type PlayIntent = 'new' | 'resume' | 'enter'

export type PlayLocationState = {
  playIntent?: PlayIntent
  /** Open Game Settings after the table is ready (Home → Play). */
  openSettings?: boolean
  openRackChecker?: boolean
  openStats?: boolean
}

/** Location state for `/home` Play Hub. */
export type HomeLocationState = {
  openStats?: boolean
}

export function readHomeLocationState(state: unknown): HomeLocationState {
  if (typeof state !== 'object' || state == null) return {}
  const s = state as Record<string, unknown>
  const out: HomeLocationState = {}
  if (s.openStats === true) out.openStats = true
  return out
}

export function readPlayLocationState(state: unknown): PlayLocationState {
  if (typeof state !== 'object' || state == null) return {}
  const s = state as Record<string, unknown>
  const out: PlayLocationState = {}
  if (s.playIntent === 'new' || s.playIntent === 'resume' || s.playIntent === 'enter') {
    out.playIntent = s.playIntent
  }
  if (s.openSettings === true) out.openSettings = true
  if (s.openRackChecker === true) out.openRackChecker = true
  if (s.openStats === true) out.openStats = true
  return out
}
