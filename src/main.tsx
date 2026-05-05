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

async function tryLockLandscapeStandalone() {
  const o = window.screen.orientation
  if (!o?.lock) return
  try {
    await o.lock('landscape')
    return
  } catch {
    /* Chrome/iOS differ on accepted lock types; portrait-primary-only PWAs often need a gesture. */
  }
  try {
    await o.lock('landscape-primary')
  } catch {
    /* iOS standalone Safari usually rejects lock(); manifest + native Android still handle those cases. */
  }
}

function AppWithNativeSplashHandoff() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      if (isStandaloneWebApp()) {
        void tryLockLandscapeStandalone()
        const retryOnGesture = () => {
          void tryLockLandscapeStandalone()
        }
        window.addEventListener('pointerdown', retryOnGesture, { capture: true, once: true })
        window.addEventListener('touchend', retryOnGesture, { capture: true, once: true })
        const onVisible = () => {
          if (document.visibilityState === 'visible') void tryLockLandscapeStandalone()
        }
        document.addEventListener('visibilitychange', onVisible)
        window.addEventListener('pageshow', onVisible)
        return () => {
          document.removeEventListener('visibilitychange', onVisible)
          window.removeEventListener('pageshow', onVisible)
        }
      }
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
