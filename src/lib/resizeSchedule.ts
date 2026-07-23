/**
 * Coalesce high-frequency resize / ResizeObserver work onto rAF, with an optional
 * trailing "settled" pass after the stream goes quiet. Avoids per-pixel layout thrash
 * while still snapping to the final size when the user stops dragging the window.
 */
export type ResizeScheduler = {
  /** Run `fn` once on the next animation frame (coalesces bursts). */
  live: (fn: () => void) => void
  /**
   * Run `liveFn` on the next frame; after `settleMs` of quiet, run `settledFn`
   * (defaults to `liveFn` when omitted).
   */
  liveAndSettle: (liveFn: () => void, settledFn?: () => void) => void
  /** Skip live work; run `fn` only after `settleMs` of quiet. */
  settle: (fn: () => void) => void
  cancel: () => void
}

export function createResizeScheduler(settleMs = 120): ResizeScheduler {
  let raf = 0
  let settleTimer = 0

  const cancel = () => {
    if (raf) {
      window.cancelAnimationFrame(raf)
      raf = 0
    }
    if (settleTimer) {
      window.clearTimeout(settleTimer)
      settleTimer = 0
    }
  }

  const live = (fn: () => void) => {
    if (raf) window.cancelAnimationFrame(raf)
    raf = window.requestAnimationFrame(() => {
      raf = 0
      fn()
    })
  }

  const settle = (fn: () => void) => {
    if (settleTimer) window.clearTimeout(settleTimer)
    settleTimer = window.setTimeout(() => {
      settleTimer = 0
      fn()
    }, settleMs)
  }

  const liveAndSettle = (liveFn: () => void, settledFn: () => void = liveFn) => {
    live(liveFn)
    settle(settledFn)
  }

  return { live, liveAndSettle, settle, cancel }
}
