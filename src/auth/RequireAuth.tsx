import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import {
  peekPlayEnterFastPath,
  readHomeLocationState,
} from '../app/playLocationState'
import { isAppTheme, persistAppTheme, readAppThemeFromStorage } from '../app/appTheme'
import { loadUserPreferences } from '../lib/userPreferences'
import { AuthThemeLoading } from './AuthThemeLoading'
import { useAuth } from './AuthProvider'
import { SessionBootProvider } from './sessionBoot'

/** Hub routes that do not need game bootstrap — skip remount theater when already signed in. */
function isLightAuthRoute(pathname: string): boolean {
  return pathname === '/home' || pathname === '/rack-checker'
}

/** Sends signed-out users to the login page. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const forceFullBoot = readHomeLocationState(location.state).fullSessionBoot === true
  /** Home → Play: theme already applied; skip cloud theme wait + boot-bar fill. */
  const fastPlayEnterRef = useRef(peekPlayEnterFastPath())
  /**
   * Already-signed-in navigations to Home / Rack Checker should not replay the
   * logo + progress bar (that theater is for cold auth, post–sign-in, and Play).
   */
  const skipBootTheaterRef = useRef(
    fastPlayEnterRef.current ||
      (isLightAuthRoute(location.pathname) &&
        !forceFullBoot &&
        !loading &&
        Boolean(user)),
  )
  const [themeReady, setThemeReady] = useState(() => skipBootTheaterRef.current)
  // Fast Play still waits on game hydrate; light-route skip can dismiss immediately.
  const [sessionBootReady, setSessionBootReady] = useState(
    () => skipBootTheaterRef.current && !fastPlayEnterRef.current,
  )
  const [barFillComplete, setBarFillComplete] = useState(() => skipBootTheaterRef.current)
  /** Bumps when an authenticated boot starts so the status bar remounts/restarts. */
  const [bootEpoch, setBootEpoch] = useState(0)
  const clearedFullBootRef = useRef(false)

  const notifySessionBootReady = useCallback(() => {
    setSessionBootReady(true)
  }, [])

  const onFillComplete = useCallback(() => {
    setBarFillComplete(true)
  }, [])

  // Drop one-shot post–sign-in boot flag so later Home visits stay instant.
  useEffect(() => {
    if (!forceFullBoot || clearedFullBootRef.current) return
    clearedFullBootRef.current = true
    navigate(location.pathname, { replace: true, state: {} })
  }, [forceFullBoot, location.pathname, navigate])

  /**
   * Apply cloud theme before mounting the game shell so a stale localStorage
   * value (e.g. legacy Grape/Mystic default) cannot flash the wrong theme.
   * The boot loader itself stays Abyss (see AuthThemeLoading) regardless.
   * Fast Play enter / already-warm hub visits keep the local theme and skip the bar.
   */
  useEffect(() => {
    if (!user) return

    if (skipBootTheaterRef.current) {
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
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
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
