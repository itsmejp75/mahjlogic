import { Capacitor } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'
import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import { AppRoutes } from './app/AppRoutes.tsx'
import { AuthProvider } from './auth/AuthProvider'
import { initButtonPointerPress } from './buttonPointerPress'
import { preloadClassicTileArt } from './tiles/classicTileArt'

initButtonPointerPress()

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
 * the visible launch is `apple-touch-startup-image` (or this watermark cover when iOS skips
 * it) → app, with no white flash or icon swap between them. Browser tabs never show the splash.
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
    // Native: warm SVGs under the splash. Web/PWA: idle + low concurrency so we do not starve
    // the suggested-hands worker / JS chunks (mobile Safari ~6 connections).
    preloadClassicTileArt({ immediate: Capacitor.isNativePlatform() })

    if (!Capacitor.isNativePlatform()) {
      return
    }

    const hideNative = () => {
      void SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => undefined)
    }

    // Try immediately (bridge is up once this bundle runs), then after paint, then as a
    // safety net if React mount or the plugin call fails — otherwise launchAutoHide:false
    // leaves the native splash up forever (common simulator report).
    hideNative()
    let cancelled = false
    let firstFrame = 0
    let secondFrame = 0
    const safetyTimer = window.setTimeout(hideNative, 3500)

    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        if (!cancelled) hideNative()
      })
    })

    return () => {
      cancelled = true
      window.clearTimeout(safetyTimer)
      window.cancelAnimationFrame(firstFrame)
      window.cancelAnimationFrame(secondFrame)
    }
  }, [])

  return <AppRoutes />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppWithNativeSplashHandoff />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
