import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { isAppTheme, persistAppTheme } from '../app/appTheme'
import { loadUserPreferences } from '../lib/userPreferences'
import { useAuth } from './AuthProvider'

/** Sends signed-out users to the landing page. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth()
  const [themeReady, setThemeReady] = useState(false)

  /**
   * Apply cloud theme before mounting the game shell so a stale localStorage
   * value (e.g. legacy Grape/Mystic default) cannot flash the wrong theme.
   */
  useEffect(() => {
    if (!user) {
      setThemeReady(false)
      return
    }

    let cancelled = false
    setThemeReady(false)

    void (async () => {
      try {
        const { prefs, error } = await loadUserPreferences()
        if (cancelled) return
        if (!error && prefs?.appTheme != null && isAppTheme(prefs.appTheme)) {
          persistAppTheme(prefs.appTheme)
        }
      } finally {
        if (!cancelled) setThemeReady(true)
      }
    })()

    return () => {
      cancelled = true
    }
    // Intentional: re-run only when the signed-in user changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- user.id
  }, [user?.id])

  if (loading || (user && !themeReady)) {
    return (
      <main className="landing landing--callback" aria-busy="true">
        <p className="landing__status">Loading…</p>
      </main>
    )
  }

  if (!user) {
    return <Navigate to="/" replace />
  }

  return children
}
