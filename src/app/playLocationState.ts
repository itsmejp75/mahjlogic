/** Location state for `/play` and hub deep-links. */
export type PlayIntent = 'new' | 'resume'

export type PlayLocationState = {
  playIntent?: PlayIntent
  openRackChecker?: boolean
  openStats?: boolean
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
