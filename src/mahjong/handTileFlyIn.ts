import type { CharlestonPhase } from './charleston'

/** Viewport corner / top-center tiles fly in from (East seat = bottom of screen). */
export type HandTileFlyInFrom = 'right' | 'across' | 'left'

export type HandTileFlyIn = { ids: readonly string[]; from: HandTileFlyInFrom }

/** Charleston step just completed → direction incoming tiles "arrive" from on the table UI. */
export function handTileFlyInFromCharlestonPhase(phase: CharlestonPhase): HandTileFlyInFrom | null {
  if (phase === 'done') return null
  if (phase === 'courtesy') return 'across'
  if (phase === 'right1' || phase === 'right2') return 'right'
  if (phase === 'across1' || phase === 'across2') return 'across'
  if (phase === 'left1' || phase === 'left2') return 'left'
  return null
}

/** Bot seat index 0=South (right), 1=West (across), 2=North (left) — matches `BOT_LABELS` order. */
export function handTileFlyInFromBotSeat(botIndex: 0 | 1 | 2): HandTileFlyInFrom {
  if (botIndex === 0) return 'right'
  if (botIndex === 1) return 'across'
  return 'left'
}

/** Pixel origin for fly-in toward the main rack (upper-right, top center, upper-left). */
export function viewportOriginForHandFlyIn(from: HandTileFlyInFrom): { x: number; y: number } {
  if (typeof window === 'undefined') return { x: 200, y: 40 }
  const margin = 40
  let topInset = 0
  try {
    topInset = Number.parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('env(safe-area-inset-top)') || '0',
      10,
    )
  } catch {
    /* ignore */
  }
  const y = margin + (Number.isFinite(topInset) ? topInset : 0)
  const w = window.innerWidth
  switch (from) {
    case 'right':
      return { x: w - margin, y }
    case 'left':
      return { x: margin, y }
    case 'across':
    default:
      return { x: w / 2, y }
  }
}

export function wallDrawHandTileFlyIn(
  drawnTileId: string | null,
  botSeat: 0 | 1 | 2 | null,
): HandTileFlyIn | null {
  if (!drawnTileId) return null
  if (botSeat === null) return { ids: [drawnTileId], from: 'across' }
  return { ids: [drawnTileId], from: handTileFlyInFromBotSeat(botSeat) }
}
