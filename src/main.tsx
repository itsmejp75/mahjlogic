import { Capacitor } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'
import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

/* index.html may have set this already for first paint; keep for dev / parity. */
if (Capacitor.isNativePlatform()) {
  document.documentElement.setAttribute('data-native-app', '')
}

function AppWithNativeSplashHandoff() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

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
