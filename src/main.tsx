import { Capacitor } from '@capacitor/core'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

/* index.html may have set this already for first paint; keep for dev / parity. */
if (Capacitor.isNativePlatform()) {
  document.documentElement.setAttribute('data-native-app', '')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
