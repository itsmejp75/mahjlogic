import { useLayoutEffect, type RefObject } from 'react'
import { rafAnimate, sampleKeyframes, type RafAnimHandle } from '../lib/rafAnimate'

const POP_MS = 1450

/** Rise (rem) and scale stops matching the former CSS keyframes. */
const Y_STOPS: Array<[number, number]> = [
  [0, 0],
  [0.22, -2.35],
  [0.72, -2.35],
  [1, 0],
]
const S_STOPS: Array<[number, number]> = [
  [0, 1],
  [0.22, 1.9],
  [0.72, 1.9],
  [1, 1],
]

/**
 * MahJ win pop (rise + grow, hold, return) via rAF + inline transform.
 * CSS @keyframes / WAAPI freeze on iOS WKWebView / installed PWA; this path paints.
 * In-app Animations only — do not gate on prefers-reduced-motion.
 */
export function useMahjongWinBtnPop(
  btnRef: RefObject<HTMLElement | null> | undefined,
  active: boolean,
  popKey: number,
) {
  useLayoutEffect(() => {
    if (!active) return

    let cancelled = false
    let handle: RafAnimHandle | null = null
    let fallbackTimer = 0
    let retryRaf = 0
    let startRaf1 = 0
    let startRaf2 = 0

    const settle = (el: HTMLElement) => {
      el.style.transform = 'translateY(0px) scale(1)'
    }

    const startOn = (el: HTMLElement) => {
      el.style.transform = 'translateY(0px) scale(1)'
      void el.offsetWidth

      startRaf1 = requestAnimationFrame(() => {
        startRaf2 = requestAnimationFrame(() => {
          if (cancelled || !btnRef?.current) return
          handle = rafAnimate({
            durationMs: POP_MS,
            // Linear raw t — keyframe stops already encode the hold.
            easing: (t) => t,
            onUpdate: (_e, rawT) => {
              if (!btnRef?.current) return
              const y = sampleKeyframes(Y_STOPS, rawT)
              const s = sampleKeyframes(S_STOPS, rawT)
              btnRef.current.style.transform = `translateY(${y}rem) scale(${s})`
            },
            onDone: () => {
              if (cancelled || !btnRef?.current) return
              settle(btnRef.current)
            },
          })
        })
      })
    }

    const tryStart = () => {
      if (cancelled) return
      const el = btnRef?.current
      if (!el) {
        retryRaf = requestAnimationFrame(tryStart)
        return
      }
      if (el.closest('[data-animations]')?.getAttribute('data-animations') === 'off') {
        return
      }
      startOn(el)
      fallbackTimer = window.setTimeout(() => {
        if (cancelled || !btnRef?.current) return
        settle(btnRef.current)
      }, POP_MS + 200)
    }

    tryStart()

    return () => {
      cancelled = true
      cancelAnimationFrame(retryRaf)
      cancelAnimationFrame(startRaf1)
      cancelAnimationFrame(startRaf2)
      handle?.cancel()
      window.clearTimeout(fallbackTimer)
      const el = btnRef?.current
      if (el) el.style.removeProperty('transform')
    }
  }, [btnRef, active, popKey])
}
