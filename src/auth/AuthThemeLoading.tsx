import { useEffect, useRef } from 'react'

/** Same public URL as `#pwa-splash` so the PWA handoff reuses one cached logo. */
const WATERMARK_SRC = '/mahjlogic-watermark.svg'

const BAR_FILL_MS = 1500
const BAR_FILL_REDUCED_MS = 600

/** True while the installed-PWA HTML splash cover is still on screen. */
function isPwaSplashBlocking(): boolean {
  const splash = document.getElementById('pwa-splash')
  if (!splash || !document.body.contains(splash)) return false
  if (splash.classList.contains('is-hidden')) return false
  // Browser tabs keep the node with `display: none` — not blocking.
  return window.getComputedStyle(splash).display !== 'none'
}

/**
 * Full-viewport boot loader. Always Abyss (matches `#pwa-splash`) so Phantom/Mystic
 * theme prefs cannot recolor this screen. The status bar fill is driven with the
 * Web Animations API after the splash handoff so iOS PWA actually shows the grow.
 */
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
    let cancelled = false
    let armed = false
    let raf1 = 0
    let raf2 = 0
    let safetyTimer = 0
    let fallbackTimer = 0
    let anim: Animation | null = null
    let splashObserver: MutationObserver | null = null

    const finish = () => {
      if (cancelled || completedRef.current) return
      completedRef.current = true
      onFillComplete?.()
    }

    const cleanupWatchers = () => {
      splashObserver?.disconnect()
      splashObserver = null
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('mahjlogic:pwa-splash-hidden', onSplashHidden)
      window.clearTimeout(safetyTimer)
      safetyTimer = 0
    }

    const startFill = () => {
      if (cancelled || armed) return
      armed = true
      cleanupWatchers()

      const el = fillRef.current
      if (!el) {
        finish()
        return
      }

      const reduced =
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
      const duration = reduced ? BAR_FILL_REDUCED_MS : BAR_FILL_MS

      // Force a settled empty frame before growing (iOS often skips CSS animations).
      el.style.transition = 'none'
      el.style.transform = 'scaleX(0)'
      void el.offsetWidth

      raf1 = window.requestAnimationFrame(() => {
        raf2 = window.requestAnimationFrame(() => {
          if (cancelled) return
          try {
            anim = el.animate(
              [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
              { duration, easing: 'linear', fill: 'forwards' },
            )
            anim.addEventListener('finish', finish)
          } catch {
            el.style.transition = `transform ${duration}ms linear`
            el.style.transform = 'scaleX(1)'
          }
          fallbackTimer = window.setTimeout(finish, duration + 120)
        })
      })
    }

    const tryStart = () => {
      if (cancelled || armed) return
      if (document.visibilityState !== 'visible') return
      if (isPwaSplashBlocking()) return
      startFill()
    }

    const onVisibility = () => {
      tryStart()
    }

    const onSplashHidden = () => {
      tryStart()
    }

    if (document.visibilityState !== 'visible') {
      document.addEventListener('visibilitychange', onVisibility)
    }

    if (isPwaSplashBlocking()) {
      window.addEventListener('mahjlogic:pwa-splash-hidden', onSplashHidden)
      const splash = document.getElementById('pwa-splash')
      if (splash) {
        splashObserver = new MutationObserver(tryStart)
        splashObserver.observe(splash, {
          attributes: true,
          attributeFilter: ['class'],
        })
      }
    }

    tryStart()
    // Safety: never leave the bar frozen if splash/visibility signaling fails.
    safetyTimer = window.setTimeout(startFill, 4500)

    return () => {
      cancelled = true
      cleanupWatchers()
      window.cancelAnimationFrame(raf1)
      window.cancelAnimationFrame(raf2)
      window.clearTimeout(fallbackTimer)
      anim?.cancel()
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
          src={WATERMARK_SRC}
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
          <span ref={fillRef} className="app-theme-loading__bar-fill" aria-hidden="true" />
        </div>
      </div>
    </main>
  )
}
