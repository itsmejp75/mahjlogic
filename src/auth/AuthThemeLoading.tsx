import { useEffect, useRef } from 'react'
import watermarkSrc from '../assets/mahjlogic-watermark.svg?url'

/** Full-viewport loading on the active app theme background (not landing navy). */
export function AuthThemeLoading({
  /** Fixed overlay — use while the play surface is mounting underneath. */
  cover = false,
  onFillComplete,
}: {
  cover?: boolean
  /** Fires once the bar has animated all the way to the end. */
  onFillComplete?: () => void
}) {
  const fillRef = useRef<HTMLSpanElement>(null)
  const completedRef = useRef(false)

  useEffect(() => {
    const el = fillRef.current
    if (!el) return

    const finish = () => {
      if (completedRef.current) return
      completedRef.current = true
      onFillComplete?.()
    }

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

    if (reduced) {
      el.style.animation = 'none'
      el.style.width = '100%'
      finish()
      return
    }

    const onEnd = (event: AnimationEvent) => {
      if (event.target !== el) return
      finish()
    }

    el.addEventListener('animationend', onEnd)
    return () => {
      el.removeEventListener('animationend', onEnd)
    }
  }, [onFillComplete])

  return (
    <main
      className={['app-theme-loading', cover ? 'app-theme-loading--cover' : '']
        .filter(Boolean)
        .join(' ')}
      aria-busy="true"
      aria-label="Loading Mahj Logic"
    >
      <div className="app-theme-loading__brand">
        <img
          className="app-theme-loading__logo"
          src={watermarkSrc}
          alt="Mahj Logic"
          decoding="async"
          draggable={false}
        />
        <div
          className="app-theme-loading__bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Loading"
        >
          <span
            ref={fillRef}
            className="app-theme-loading__bar-fill app-theme-loading__bar-fill--animate"
            aria-hidden="true"
          />
        </div>
      </div>
    </main>
  )
}
