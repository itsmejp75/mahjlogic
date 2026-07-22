import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import watermarkSrc from '../assets/mahjlogic-watermark.svg?url'
import { useAuth } from '../auth/AuthProvider'
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
  const navigate = useNavigate()
  const {
    configured,
    loading,
    user,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    resetPasswordForEmail,
  } = useAuth()
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  if (!loading && user) {
    return <Navigate to="/play" replace />
  }

  function clearMessages() {
    setError(null)
    setInfo(null)
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
        navigate('/play', { replace: true })
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
      navigate('/play', { replace: true })
    } finally {
      setBusy(false)
    }
  }

  async function onGoogle() {
    clearMessages()
    if (!configured) {
      setError('Add Supabase keys in .env.local to enable accounts.')
      return
    }
    setBusy(true)
    const { error: googleError, redirected } = await signInWithGoogle()
    if (googleError) {
      setError(googleError)
      setBusy(false)
      return
    }
    // OAuth leaves this page; keep "Please wait…" until the browser navigates.
    if (!redirected) {
      setBusy(false)
      navigate('/play', { replace: true })
    }
  }

  const submitLabel =
    mode === 'forgot' ? 'Send reset link' : mode === 'sign-up' ? 'Create account' : 'Sign In'

  return (
    <main className="landing">
      <div className="landing__atmosphere" aria-hidden="true" />
      <div className="landing__glow landing__glow--cyan" aria-hidden="true" />
      <div className="landing__glow landing__glow--gold" aria-hidden="true" />

      <div className="landing__frame">
        <header className="landing__brand">
          <img
            className="landing__logo"
            src={watermarkSrc}
            alt="Mahj Logic"
            decoding="async"
            draggable={false}
          />
          <p className="landing__tagline">American Mah Jongg Intelligence</p>
          <p className="landing__description">
            Practice play, discard tracking, and hand guidance — built for landscape play.
          </p>
        </header>

        <div className="landing__auth-column">
          <section className="landing-auth" aria-label="Account">
            {mode !== 'forgot' ? (
              <>
                <button
                  type="button"
                  className="btn landing-auth__action-btn landing-auth__social-btn"
                  disabled={busy || loading}
                  onClick={() => void onGoogle()}
                >
                  <GoogleMark />
                  Continue with Google
                </button>

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
                  disabled={busy || loading}
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
                    disabled={busy || loading}
                  />
                </label>
              ) : null}

              {mode === 'sign-in' ? (
                <div className="landing-auth__row">
                  <button
                    type="button"
                    className="landing-auth__text-btn"
                    disabled={busy || loading}
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
                disabled={busy || loading}
              >
                {busy ? 'Please wait…' : submitLabel}
              </button>
            </form>
          </section>

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
            <Link to="/privacy">Privacy</Link>
            <span aria-hidden="true">·</span>
            <Link to="/terms">Terms</Link>
          </p>
        </div>
      </div>
    </main>
  )
}
