import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { peekPlayEnterFastPath } from '../app/playLocationState'
import { isAppTheme, persistAppTheme, readAppThemeFromStorage } from '../app/appTheme'
import { loadUserPreferences } from '../lib/userPreferences'
import { AuthThemeLoading } from './AuthThemeLoading'
import { useAuth } from './AuthProvider'
import { SessionBootProvider } from './sessionBoot'

/** Sends signed-out users to the landing page. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth()
  /** Home → Play: theme already applied; skip cloud theme wait + boot-bar fill. */
  const fastPlayEnterRef = useRef(peekPlayEnterFastPath())
  const [themeReady, setThemeReady] = useState(() => fastPlayEnterRef.current)
  const [sessionBootReady, setSessionBootReady] = useState(false)
  const [barFillComplete, setBarFillComplete] = useState(() => fastPlayEnterRef.current)
  /** Bumps when an authenticated boot starts so the status bar remounts/restarts. */
  const [bootEpoch, setBootEpoch] = useState(0)

  const notifySessionBootReady = useCallback(() => {
    setSessionBootReady(true)
  }, [])

  const onFillComplete = useCallback(() => {
    setBarFillComplete(true)
  }, [])

  /**
   * Apply cloud theme before mounting the game shell so a stale localStorage
   * value (e.g. legacy Grape/Mystic default) cannot flash the wrong theme.
   * The boot loader itself stays Abyss (see AuthThemeLoading) regardless.
   * Fast Play enter keeps the Home theme and mounts the shell immediately.
   */
  useEffect(() => {
    if (!user) return

    if (fastPlayEnterRef.current) {
      // Ensure document theme matches local cache (Home already persisted).
      persistAppTheme(readAppThemeFromStorage())
      setThemeReady(true)
      setBarFillComplete(true)
      return
    }

    setBarFillComplete(false)
    setThemeReady(false)
    setSessionBootReady(false)

    // Remount AuthThemeLoading so the status bar always restarts for this boot
    // (avoids a bar that finished during auth `loading` staying stuck at 100%).
    setBootEpoch((n) => n + 1)

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
