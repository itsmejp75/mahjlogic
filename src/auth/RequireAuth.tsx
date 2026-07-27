import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { isAppTheme, persistAppTheme } from '../app/appTheme'
import { loadUserPreferences } from '../lib/userPreferences'
import { AuthThemeLoading } from './AuthThemeLoading'
import { useAuth } from './AuthProvider'
import { SessionBootProvider } from './sessionBoot'

/** Sends signed-out users to the landing page. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth()
  const [themeReady, setThemeReady] = useState(false)
  const [sessionBootReady, setSessionBootReady] = useState(false)
  const [barFillComplete, setBarFillComplete] = useState(false)
  /** Bumps only on account switch so the CSS bar is not remounted when session arrives. */
  const [bootEpoch, setBootEpoch] = useState(0)
  const prevUserIdRef = useRef<string | undefined>(undefined)

  const notifySessionBootReady = useCallback(() => {
    setSessionBootReady(true)
  }, [])

  const onFillComplete = useCallback(() => {
    setBarFillComplete(true)
  }, [])

  /**
   * Apply cloud theme before mounting the game shell so a stale localStorage
   * value (e.g. legacy Grape/Mystic default) cannot flash the wrong theme.
   */
  useEffect(() => {
    const nextId = user?.id
    const prevId = prevUserIdRef.current
    if (prevId !== undefined && prevId !== nextId) {
      setBootEpoch((n) => n + 1)
      setBarFillComplete(false)
    }
    prevUserIdRef.current = nextId

    setThemeReady(false)
    setSessionBootReady(false)

    if (!user) return

    let cancelled = false

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

  if (!loading && !user) {
    return <Navigate to="/" replace />
  }

  const appMounted = Boolean(user && !loading && themeReady)
  const showLoader =
    loading || Boolean(user && (!themeReady || !sessionBootReady || !barFillComplete))
  const bootLoaderDismissed = appMounted && !showLoader

  return (
    <>
      {appMounted ? (
        <SessionBootProvider
          notifySessionBootReady={notifySessionBootReady}
          bootLoaderDismissed={bootLoaderDismissed}
        >
          {children}
        </SessionBootProvider>
      ) : null}
      {showLoader ? (
        <AuthThemeLoading
          key={`boot-loader-${bootEpoch}`}
          cover={appMounted}
          onFillComplete={onFillComplete}
        />
      ) : null}
    </>
  )
}
