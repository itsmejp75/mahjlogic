import { Capacitor } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'
import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

type NavigatorWithStandalone = Navigator & { standalone?: boolean }

function isStandaloneWebApp() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as NavigatorWithStandalone).standalone === true
  )
}

/* index.html may have set this already for first paint; keep for dev / parity. */
if (Capacitor.isNativePlatform()) {
  document.documentElement.setAttribute('data-native-app', '')
} else if (isStandaloneWebApp()) {
  document.documentElement.setAttribute('data-home-screen-app', '')
}

/**
 * Installed-PWA splash cover defined in `index.html`. Fade it out after React has painted so
 * the visible launch is `apple-touch-startup-image` (or this dark cover when iOS skips it) →
 * app, with no white flash between them.  Browser tabs never show the splash to begin with.
 */
function hidePwaSplashAfterFirstPaint() {
  if (typeof document === 'undefined') return
  const splash = document.getElementById('pwa-splash')
  if (!splash) return
  const hide = () => {
    splash.classList.add('is-hidden')
    window.setTimeout(() => splash.remove(), 320)
  }
  // Two RAFs guarantee at least one full app frame has rendered before we fade.
  window.requestAnimationFrame(() => window.requestAnimationFrame(hide))
  // Safety: never let the cover linger if something errors during mount.
  window.setTimeout(hide, 4000)
}

export function AppWithNativeSplashHandoff() {
  useEffect(() => {
    hidePwaSplashAfterFirstPaint()

    if (!Capacitor.isNativePlatform()) {
      return
    }

    let cancelled = false
    let firstFrame = 0
    let secondFrame = 0

    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        if (cancelled) return
        void SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => undefined)
      })
    })

    return () => {
      cancelled = true
      window.cancelAnimationFrame(firstFrame)
      window.cancelAnimationFrame(secondFrame)
    }
  }, [])

  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppWithNativeSplashHandoff />
  </StrictMode>,
)
