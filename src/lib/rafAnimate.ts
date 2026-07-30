/**
 * Imperative rAF tweens for iOS WKWebView / installed PWA.
 * CSS @keyframes and often WAAPI freeze at the first keyframe on mount there;
 * writing `style.*` every frame (see SuggestedHandsPanel joker timeshare) does paint.
 */

export type RafAnimHandle = { cancel: () => void }

/** Smoothstep-ish ease used by the win dialog drop. */
export function easeOutCubic(t: number): number {
  const u = 1 - t
  return 1 - u * u * u
}

/** Piecewise linear progress through [offset, value] stops (offsets in 0..1). */
export function sampleKeyframes(stops: Array<[number, number]>, t: number): number {
  if (stops.length === 0) return 0
  if (t <= stops[0]![0]) return stops[0]![1]
  for (let i = 1; i < stops.length; i++) {
    const [o0, v0] = stops[i - 1]!
    const [o1, v1] = stops[i]!
    if (t <= o1) {
      const u = (t - o0) / Math.max(1e-6, o1 - o0)
      return v0 + (v1 - v0) * u
    }
  }
  return stops[stops.length - 1]![1]
}

export function rafAnimate({
  durationMs,
  easing = easeOutCubic,
  onUpdate,
  onDone,
}: {
  durationMs: number
  easing?: (t: number) => number
  onUpdate: (easedT: number, rawT: number) => void
  onDone?: () => void
}): RafAnimHandle {
  let raf = 0
  let cancelled = false
  const start = performance.now()

  const tick = (now: number) => {
    if (cancelled) return
    const rawT = Math.min(1, (now - start) / Math.max(1, durationMs))
    onUpdate(easing(rawT), rawT)
    if (rawT < 1) {
      raf = requestAnimationFrame(tick)
      return
    }
    onDone?.()
  }

  raf = requestAnimationFrame(tick)

  return {
    cancel: () => {
      cancelled = true
      cancelAnimationFrame(raf)
    },
  }
}
