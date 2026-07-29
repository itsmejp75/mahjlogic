import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase'

/**
 * Completes OAuth / email-confirm PKCE exchange, then sends the user to Home.
 */
export function AuthCallbackPage() {
  const [ready, setReady] = useState(!isSupabaseConfigured)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) {
      setReady(true)
      return
    }

    let cancelled = false
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (cancelled) return
      if (sessionError) setError(sessionError.message)
      else if (!data.session) setError('Could not complete sign-in. Try again from the home page.')
      setReady(true)
    })

    return () => {
      cancelled = true
    }
  }, [])

  if (!ready) {
    return (
      <main className="landing landing--callback" aria-busy="true">
        <p className="landing__status">Finishing sign-in…</p>
      </main>
    )
  }

  if (error) {
    return (
      <main className="landing landing--callback">
        <p className="landing-auth__error" role="alert">
          {error}
        </p>
        <a className="landing__guest-link" href="/">
          Back to home
        </a>
      </main>
    )
  }

  return <Navigate to="/home" replace />
}
