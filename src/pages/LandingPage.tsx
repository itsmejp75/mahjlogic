import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { markPlayEnterFastPath } from '../app/playLocationState'
import mahjLogoSrc from '../assets/mahj-logo.svg?url'
import logicLogoSrc from '../assets/logic-logo.svg?url'
import { applyAppThemeToDocument, DEFAULT_APP_THEME } from '../app/appTheme'
import { AuthThemeLoading } from '../auth/AuthThemeLoading'
import { useAuth } from '../auth/AuthProvider'
import {
  isGoogleIdentityConfigured,
  mountGoogleContinueButton,
} from '../lib/googleIdentity'
import { LandingTileAtmosphere } from '../components/LandingTileAtmosphere'
import { usePageMeta } from '../seo/usePageMeta'
import '../styles/landing.css'


type Mode = 'sign-in' | 'sign-up' | 'forgot'

function GoogleMark() {
  return (
    <svg className="landing-auth__google-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}

export function LandingPage() {
  usePageMeta({
    title: 'MahjLogic: American Mah Jongg Intelligence',
    description:
      'MahjLogic helps you practice American Mah Jongg (Mahjong) with suggested hands and tiles, tile probabilities, and stats — smart guidance in one console.',
    path: '/',
  })

  const navigate = useNavigate()
  const {
    configured,
    loading,
    user,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    signInWithGoogleIdToken,
    resetPasswordForEmail,
    signOut,
  } = useAuth()
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [signOutBusy, setSignOutBusy] = useState(false)
  /** Stay on the Mahj Logic loader after success until auth context redirects to /home. */
  const [enteringApp, setEnteringApp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [gisReady, setGisReady] = useState(false)
  const googleHostRef = useRef<HTMLDivElement>(null)
  const useGis = configured && isGoogleIdentityConfigured()

  /** Login always paints Abyss; do not rewrite localStorage (cloud restores on sign-in). */
  useLayoutEffect(() => {
    applyAppThemeToDocument(DEFAULT_APP_THEME)
  }, [])

  function clearMessages() {
    setError(null)
    setInfo(null)
  }

  useEffect(() => {
    if (!useGis || mode === 'forgot' || user || enteringApp) {
      setGisReady(false)
      return
    }
    const host = googleHostRef.current
    if (!host) return

    let disposed = false
    let unmount: (() => void) | undefined

    void (async () => {
      try {
        unmount = await mountGoogleContinueButton(host, {
          onCredential: (credential, nonce) => {
            void (async () => {
              clearMessages()
              setGoogleBusy(true)
              try {
                const { error: googleError } = await signInWithGoogleIdToken(credential, nonce)
                if (googleError) {
                  setError(googleError)
                  setGoogleBusy(false)
                  return
                }
                // Declarative redirect once `user` is set — avoid /home before context commits.
                setEnteringApp(true)
              } catch {
                setGoogleBusy(false)
              }
            })()
          },
          onError: (message) => {
            setError(message)
            setGoogleBusy(false)
          },
        })
        if (!disposed) setGisReady(true)
      } catch (err) {
        if (!disposed) {
          setGisReady(false)
          console.warn(err instanceof Error ? err.message : err)
        }
      }
    })()

    return () => {
      disposed = true
      unmount?.()
      setGisReady(false)
    }
  }, [useGis, mode, user, enteringApp, signInWithGoogleIdToken])

  /** Fresh login → enter the app; already-signed-in visits stay on this page. */
  if (!loading && user && enteringApp) {
    return <Navigate to="/home" replace />
  }

  if (enteringApp) {
    return <AuthThemeLoading />
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    clearMessages()
    if (!configured) {
      setError('Add Supabase keys in .env.local to enable accounts.')
      return
    }

    setBusy(true)
    try {
      if (mode === 'forgot') {
        const { error: resetError } = await resetPasswordForEmail(email.trim())
        if (resetError) {
          setError(resetError)
          return
        }
        setInfo('If that email is registered, a reset link is on the way.')
        return
      }

      if (password.length < 6) {
        setError('Password must be at least 6 characters.')
        return
      }

      if (mode === 'sign-in') {
        const { error: signInError } = await signInWithEmail(email.trim(), password)
        if (signInError) {
          setError(signInError)
          return
        }
        setEnteringApp(true)
        return
      }

      const { error: signUpError, needsConfirmation } = await signUpWithEmail(email.trim(), password)
      if (signUpError) {
        setError(signUpError)
        return
      }
      if (needsConfirmation) {
        setInfo('Check your email to confirm your account, then sign in.')
        setMode('sign-in')
        return
      }
      setEnteringApp(true)
    } finally {
      setBusy(false)
    }
  }

  async function onGoogleFallback() {
    clearMessages()
    if (!configured) {
      setError('Add Supabase keys in .env.local to enable accounts.')
      return
    }
    if (useGis) {
      setError(
        `Google button isn’t ready. In Google Cloud → Credentials → Web client, add Authorized JavaScript origin: ${window.location.origin}`,
      )
      return
    }
    setGoogleBusy(true)
    const { error: googleError, redirected, signedIn } = await signInWithGoogle()
    if (googleError) {
      setError(googleError)
      setGoogleBusy(false)
      return
    }
    if (redirected) return
    if (signedIn) {
      setEnteringApp(true)
      return
    }
    setGoogleBusy(false)
  }

  async function onSignOut() {
    if (signOutBusy) return
    setSignOutBusy(true)
    try {
      await signOut()
    } finally {
      setSignOutBusy(false)
    }
  }

  function goPlay() {
    markPlayEnterFastPath()
    navigate('/play', { state: { playIntent: 'enter' } })
  }

  const submitLabel =
    mode === 'forgot' ? 'Send reset link' : mode === 'sign-up' ? 'Create account' : 'Sign In'
  const formBusy = busy || googleBusy

  return (
    <main className="landing">
      <div className="landing__atmosphere" aria-hidden="true" />
      <div className="landing__glow landing__glow--cyan" aria-hidden="true" />
      <div className="landing__glow landing__glow--gold" aria-hidden="true" />
      <LandingTileAtmosphere />

      <header className="landing__header">
        <div className="landing__header-inner">
          <div className="landing__brand-mark" aria-label="Mahj Logic">
            <img
              className="landing__mark-logo landing__mark-logo--mahj"
              src={mahjLogoSrc}
              alt=""
              decoding="async"
              draggable={false}
            />
            <img
              className="landing__mark-logo landing__mark-logo--logic"
              src={logicLogoSrc}
              alt=""
              decoding="async"
              draggable={false}
            />
            <span className="landing__tagline-sep" aria-hidden="true">
              —
            </span>
            <p className="landing__tagline">American Mah Jongg Intelligence</p>
          </div>
          <nav className="landing__top-nav" aria-label="Site">
            <Link to="/home">Home</Link>
            <Link to="/learn">Learn</Link>
            <Link to="/rack-checker">Rack Checker</Link>
            <Link to="/play">Play</Link>
          </nav>
        </div>
      </header>

      <div className="landing__shell">
        <div
          className={['landing__frame', user ? 'landing__frame--signed-in' : '']
            .filter(Boolean)
            .join(' ')}
        >
          <section className="landing__features" aria-label="Mahj Logic modes">
            <article className="landing__feature">
              <div className="landing__feature-media">
                <img
                  className="landing__feature-img"
                  src="/marketing/practice.jpg"
                  alt="Mahj Logic practice table"
                  decoding="async"
                  draggable={false}
                />
              </div>
              <div className="landing__feature-body">
                <h2 className="landing__feature-title">Practice</h2>
                <p className="landing__feature-copy">
                  Practice American Mah Jongg in an Intelligent All-In-One Console that includes
                  guidance with suggested hands, highlighted tiles, discard tracking, opponent
                  hand identification, and other hints.
                </p>
                {user ? (
                  <div className="landing__feature-actions">
                    <button
                      type="button"
                      className="btn landing-auth__action-btn landing-auth__action-btn--primary landing__feature-cta"
                      onClick={goPlay}
                    >
                      Play
                    </button>
                  </div>
                ) : null}
              </div>
            </article>

            <article className="landing__feature">
              <div className="landing__feature-media">
                <img
                  className="landing__feature-img"
                  src="/marketing/rack-checker.jpg"
                  alt="Mahj Logic Rack Checker"
                  decoding="async"
                  draggable={false}
                />
              </div>
              <div className="landing__feature-body">
                <h2 className="landing__feature-title">Rack Checker</h2>
                <p className="landing__feature-copy">
                  Enter your tiles to see the closest matching hands on the card. See
                  probabilities of finishing your hand before the wall runs out. Spot overlaps
                  and sections you might have overlooked.
                </p>
                {user ? (
                  <div className="landing__feature-actions">
                    <Link
                      className="btn landing-auth__action-btn landing-auth__action-btn--primary landing__feature-cta"
                      to="/rack-checker"
                    >
                      Open Rack Checker
                    </Link>
                  </div>
                ) : null}
              </div>
            </article>
          </section>

          {!user ? (
            <div className="landing__auth-col">
              <section className="landing-auth" aria-label="Account">
                {mode !== 'forgot' ? (
                  <>
                    <div className="landing-auth__google-wrap">
                      <button
                        type="button"
                        className="btn landing-auth__action-btn landing-auth__social-btn"
                        disabled={formBusy || loading}
                        onClick={() => void onGoogleFallback()}
                        tabIndex={gisReady ? -1 : 0}
                        aria-hidden={gisReady || undefined}
                      >
                        <GoogleMark />
                        Continue with Google
                      </button>
                      {useGis ? (
                        <div
                          ref={googleHostRef}
                          className={
                            gisReady && !googleBusy && !loading
                              ? 'landing-auth__google-gsi landing-auth__google-gsi--ready'
                              : 'landing-auth__google-gsi'
                          }
                          aria-label="Continue with Google"
                        />
                      ) : null}
                    </div>

                    <div className="landing-auth__divider">
                      <span>Or sign in with</span>
                    </div>
                  </>
                ) : (
                  <p className="landing-auth__forgot-lead">
                    Enter your email and we&apos;ll send a password reset link.
                  </p>
                )}

                <form className="landing-auth__form" onSubmit={(e) => void onSubmit(e)}>
                  <label className="landing-auth__field">
                    <span className="landing-auth__field-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="18" height="18">
                        <path
                          fill="currentColor"
                          d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2Zm0 4-8 5L4 8V6l8 5 8-5v2Z"
                        />
                      </svg>
                    </span>
                    <input
                      type="email"
                      name="email"
                      autoComplete="email"
                      required
                      placeholder="Email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={formBusy || loading}
                    />
                  </label>

                  {mode !== 'forgot' ? (
                    <label className="landing-auth__field">
                      <span className="landing-auth__field-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="18" height="18">
                          <path
                            fill="currentColor"
                            d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2Zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2Zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2Z"
                          />
                        </svg>
                      </span>
                      <input
                        type="password"
                        name="password"
                        autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                        required
                        minLength={6}
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={formBusy || loading}
                      />
                    </label>
                  ) : null}

                  {mode === 'sign-in' ? (
                    <div className="landing-auth__row">
                      <button
                        type="button"
                        className="landing-auth__text-btn"
                        disabled={formBusy || loading}
                        onClick={() => {
                          setMode('forgot')
                          clearMessages()
                        }}
                      >
                        Forgot Password?
                      </button>
                    </div>
                  ) : null}

                  {error ? (
                    <p className="landing-auth__error" role="alert">
                      {error}
                    </p>
                  ) : null}
                  {info ? (
                    <p className="landing-auth__info" role="status">
                      {info}
                    </p>
                  ) : null}

                  <button
                    type="submit"
                    className="btn landing-auth__action-btn landing-auth__action-btn--primary"
                    disabled={formBusy || loading}
                  >
                    {busy ? 'Please wait…' : submitLabel}
                  </button>
                </form>
              </section>

              <div className="landing__auth-footer">
                <p className="landing__switch">
                  {mode === 'sign-up' ? (
                    <>
                      Already have an account?{' '}
                      <button
                        type="button"
                        className="landing__switch-link"
                        onClick={() => {
                          setMode('sign-in')
                          clearMessages()
                        }}
                      >
                        Sign in
                      </button>
                    </>
                  ) : mode === 'forgot' ? (
                    <>
                      Remembered it?{' '}
                      <button
                        type="button"
                        className="landing__switch-link"
                        onClick={() => {
                          setMode('sign-in')
                          clearMessages()
                        }}
                      >
                        Back to sign in
                      </button>
                    </>
                  ) : (
                    <>
                      New user?{' '}
                      <button
                        type="button"
                        className="landing__switch-link"
                        onClick={() => {
                          setMode('sign-up')
                          clearMessages()
                        }}
                      >
                        Create new account
                      </button>
                    </>
                  )}
                </p>

                <p className="landing__legal-links">
                  <a href="mailto:support@mahjlogic.com">support@mahjlogic.com</a>
                  <span aria-hidden="true">·</span>
                  <Link to="/american-mah-jongg-practice">Practice</Link>
                  <span aria-hidden="true">·</span>
                  <Link to="/mah-jongg-tile-checker">Rack Checker</Link>
                  <span aria-hidden="true">·</span>
                  <Link to="/privacy">Privacy</Link>
                  <span aria-hidden="true">·</span>
                  <Link to="/terms">Terms</Link>
                </p>
              </div>
            </div>
          ) : (
            <div className="landing__account-footer">
              <div className="landing__account">
                <p className="landing__account-status">
                  Signed in as{' '}
                  <span className="landing__account-email">{user.email ?? 'account'}</span>
                </p>
                <Link className="landing__sign-out" to="/home">
                  Home setup
                </Link>
                <button
                  type="button"
                  className="landing__sign-out"
                  disabled={signOutBusy}
                  onClick={() => void onSignOut()}
                >
                  {signOutBusy ? 'Signing out…' : 'Sign out'}
                </button>
              </div>
              <p className="landing__legal-links">
                <a href="mailto:support@mahjlogic.com">support@mahjlogic.com</a>
                <span aria-hidden="true">·</span>
                <Link to="/american-mah-jongg-practice">Practice</Link>
                <span aria-hidden="true">·</span>
                <Link to="/mah-jongg-tile-checker">Rack Checker</Link>
                <span aria-hidden="true">·</span>
                <Link to="/privacy">Privacy</Link>
                <span aria-hidden="true">·</span>
                <Link to="/terms">Terms</Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
