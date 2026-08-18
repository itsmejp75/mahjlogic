import { useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { consumePostLoginFrom, postLoginNav } from '../auth/postLoginNav'
import { beginPlayEnterLoader } from '../auth/playEnterLoader'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase'

/**
 * Completes OAuth / email-confirm PKCE exchange, then continues to the
 * destination remembered from the login CTA (Play, Rack Checker, or Home).
 */
export function AuthCallbackPage() {
  const [ready, setReady] = useState(!isSupabaseConfigured)
  const [error, setError] = useState<string | null>(null)
  const destOnceRef = useRef<ReturnType<typeof postLoginNav> | null>(
    isSupabaseConfigured ? null : postLoginNav(consumePostLoginFrom()),
  )
  const [dest, setDest] = useState(destOnceRef.current)

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) {
      setReady(true)
      return
    }

    let cancelled = false
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (cancelled) return
      if (sessionError) {
        setError(sessionError.message)
      } else if (!data.session) {
        setError('Could not complete sign-in. Try again from the home page.')
      } else {
        if (!destOnceRef.current) {
          destOnceRef.current = postLoginNav(consumePostLoginFrom())
        }
        const next = destOnceRef.current
        if (next.path === '/play') beginPlayEnterLoader()
        setDest(next)
      }
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

  if (!dest) return null
  return <Navigate to={dest.path} replace state={dest.state} />
}
