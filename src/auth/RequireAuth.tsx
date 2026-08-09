import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useSyncExternalStore } from 'react'
import { isAppTheme, persistAppTheme, readAppThemeFromStorage } from '../app/appTheme'
import { loadUserPreferences } from '../lib/userPreferences'
import { AuthThemeLoading } from './AuthThemeLoading'
import { useAuth } from './AuthProvider'
import {
  endPlayEnterLoader,
  getPlayEnterLoaderActive,
  getPlayEnterLoaderBarComplete,
  subscribePlayEnterLoader,
} from './playEnterLoader'
import { SessionBootProvider } from './sessionBoot'

/** Hub routes that do not need game bootstrap — never show the logo + progress bar. */
function isLightAuthRoute(pathname: string): boolean {
  return pathname === '/home' || pathname === '/rack-checker'
}

/** Sends signed-out users to the login page. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth()
  const location = useLocation()
  const lightRoute = isLightAuthRoute(location.pathname)
  const playEnterActive = useSyncExternalStore(
    subscribePlayEnterLoader,
    getPlayEnterLoaderActive,
    () => false,
  )
  const playEnterBarComplete = useSyncExternalStore(
    subscribePlayEnterLoader,
    getPlayEnterLoaderBarComplete,
    () => false,
  )
  /**
   * Home / Rack Checker never play the boot theater (including refresh / cold auth).
   * Play still runs the full logo + bar while the table and assets warm.
   */
  const skipBootTheaterRef = useRef(lightRoute)
  const [themeReady, setThemeReady] = useState(() => skipBootTheaterRef.current)
  const [sessionBootReady, setSessionBootReady] = useState(() => skipBootTheaterRef.current)
  const [barFillComplete, setBarFillComplete] = useState(() => skipBootTheaterRef.current)
  /** Bumps when an authenticated boot starts so the status bar remounts/restarts. */
  const [bootEpoch, setBootEpoch] = useState(0)
  /** True when this mount already had a session (Home → Play) — skip bar remount thrash. */
  const hadSessionOnMountRef = useRef(!loading && Boolean(user))

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
   * Hub routes keep the local theme and skip the bar (Home applies cloud prefs itself).
   */
  useEffect(() => {
    if (!user) return

    if (skipBootTheaterRef.current) {
      // Ensure document theme matches local cache (Home already persisted).
      persistAppTheme(readAppThemeFromStorage())
      setThemeReady(true)
      setBarFillComplete(true)
      setSessionBootReady(true)
      return
    }

    setBarFillComplete(false)
    setThemeReady(false)
    setSessionBootReady(false)

    // Remount local bar only after a cold auth wait (bar may already be at 100%).
    // Home → Play already has a session and uses PlayEnterLoaderHost instead.
    if (!hadSessionOnMountRef.current && !getPlayEnterLoaderActive()) {
      setBootEpoch((n) => n + 1)
    }

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

  // Dismiss the route-survivable Play loader once theme, session, and bar are ready.
  useEffect(() => {
    if (!playEnterActive || lightRoute) return
    if (!user || loading || !themeReady || !sessionBootReady || !playEnterBarComplete) return
    endPlayEnterLoader()
  }, [
    playEnterActive,
    playEnterBarComplete,
    lightRoute,
    user,
    loading,
    themeReady,
    sessionBootReady,
  ])

  useEffect(() => {
    if (!loading && !user && playEnterActive) endPlayEnterLoader()
  }, [loading, user, playEnterActive])

  if (!loading && !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  const appMounted = Boolean(user && !loading && themeReady)
  // External host owns the theater for Home → Play; local loader is for cold /play.
  const showLocalLoader =
    !lightRoute &&
    !playEnterActive &&
    (loading || Boolean(user && (!themeReady || !sessionBootReady || !barFillComplete)))
  const showLoader = showLocalLoader || (playEnterActive && !lightRoute)
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
      {showLocalLoader ? (
        <AuthThemeLoading
          key={`boot-loader-${bootEpoch}`}
          cover={appMounted}
          onFillComplete={onFillComplete}
        />
      ) : null}
    </>
  )
}
