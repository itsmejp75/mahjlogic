/**
 * Route-survivable Play boot loader. Home/Landing start it on Play click so the
 * logo + bar keep running across the /play navigation instead of remounting for
 * a one-frame flash.
 */

type Listener = () => void

const listeners = new Set<Listener>()

let active = false
let barComplete = false
/** Monotonic key so AuthThemeLoading remounts for each Play enter. */
let epoch = 0

function emit() {
  for (const listener of listeners) listener()
}

export function subscribePlayEnterLoader(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getPlayEnterLoaderActive(): boolean {
  return active
}

export function getPlayEnterLoaderBarComplete(): boolean {
  return barComplete
}

export function getPlayEnterLoaderEpoch(): number {
  return epoch
}

/** Show the Play boot loader (call from Play click before navigate). */
export function beginPlayEnterLoader(): void {
  // Keep an in-flight bar running — do not restart on duplicate calls.
  if (active) return
  active = true
  barComplete = false
  epoch += 1
  emit()
}

export function notifyPlayEnterLoaderBarComplete(): void {
  if (!active || barComplete) return
  barComplete = true
  emit()
}

/** Dismiss after /play theme + session + bar are ready. */
export function endPlayEnterLoader(): void {
  if (!active && !barComplete) return
  active = false
  barComplete = false
  emit()
}
