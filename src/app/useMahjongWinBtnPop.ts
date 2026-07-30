import { useLayoutEffect, type RefObject } from 'react'

const POP_MS = 1450
const POP_EASING = 'cubic-bezier(0.45, 0.05, 0.25, 1)'

/**
 * MahJ win pop (rise + grow, hold, return). WAAPI — not CSS `@keyframes` — so iOS
 * WKWebView / installed PWA actually runs it; CSS `animation-fill-mode: both` on mount
 * often freezes at the first keyframe.
 */
export function useMahjongWinBtnPop(
  btnRef: RefObject<HTMLElement | null> | undefined,
  active: boolean,
  /** Remount/replay key from App when a fresh win starts. */
  popKey: number,
) {
  useLayoutEffect(() => {
    const el = btnRef?.current
    if (!el || !active) return

    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const animOff =
      el.closest('[data-animations]')?.getAttribute('data-animations') === 'off'

    el.style.removeProperty('transform')

    if (reduceMotion || animOff || typeof el.animate !== 'function') {
      return
    }

    let cancelled = false
    let anim: Animation | null = null
    let raf2 = 0
    let fallbackTimer = 0

    const settle = () => {
      if (cancelled || !btnRef?.current) return
      const node = btnRef.current
      node.style.transform = 'translateY(0) scale(1)'
      try {
        anim?.cancel()
      } catch {
        /* ignore */
      }
      anim = null
      window.clearTimeout(fallbackTimer)
      fallbackTimer = 0
    }

    void el.offsetWidth

    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (cancelled || !btnRef?.current) return
        const node = btnRef.current
        try {
          anim = node.animate(
            [
              { transform: 'translateY(0) scale(1)' },
              { transform: 'translateY(-2.35rem) scale(1.9)', offset: 0.22 },
              { transform: 'translateY(-2.35rem) scale(1.9)', offset: 0.72 },
              { transform: 'translateY(0) scale(1)' },
            ],
            { duration: POP_MS, easing: POP_EASING, fill: 'forwards' },
          )
          anim.addEventListener('finish', settle)
        } catch {
          settle()
          return
        }
        fallbackTimer = window.setTimeout(settle, POP_MS + 160)
      })
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      window.clearTimeout(fallbackTimer)
      try {
        anim?.cancel()
      } catch {
        /* ignore */
      }
      el.style.removeProperty('transform')
    }
  }, [btnRef, active, popKey])
}
