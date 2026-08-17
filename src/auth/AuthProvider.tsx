import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { setAnalyticsUser } from '../lib/analytics'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase'

type OAuthProvider = 'google' | 'apple'

type AuthContextValue = {
  configured: boolean
  loading: boolean
  session: Session | null
  user: User | null
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>
  signUpWithEmail: (email: string, password: string) => Promise<{ error: string | null; needsConfirmation: boolean }>
  signInWithProvider: (provider: OAuthProvider) => Promise<{ error: string | null }>
  /** Fallback only when GIS client ID is missing — Google will show *.supabase.co. */
  signInWithGoogle: () => Promise<{
    error: string | null
    redirected: boolean
    signedIn: boolean
  }>
  signInWithGoogleIdToken: (
    credential: string,
    nonce: string,
  ) => Promise<{ error: string | null }>
  resetPasswordForEmail: (email: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function authRedirectTo(path: string) {
  const url = new URL(path, window.location.origin)
  return url.toString()
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [session, setSession] = useState<Session | null>(null)

  const signInWithGoogleOAuthRedirect = useCallback(async (): Promise<{
    error: string | null
    redirected: boolean
    signedIn: boolean
  }> => {
    const supabase = getSupabase()
    if (!supabase) return { error: 'Supabase is not configured.', redirected: false, signedIn: false }
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: authRedirectTo('/auth/callback'),
        skipBrowserRedirect: true,
      },
    })
    if (error) return { error: error.message, redirected: false, signedIn: false }
    if (!data.url) return { error: 'Google sign-in URL was not returned.', redirected: false, signedIn: false }
    window.location.assign(data.url)
    return { error: null, redirected: true, signedIn: false }
  }, [])

  const signInWithGoogleIdToken = useCallback(
    async (credential: string, nonce: string): Promise<{ error: string | null }> => {
      const supabase = getSupabase()
      if (!supabase) return { error: 'Supabase is not configured.' }
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: credential,
        nonce,
      })
      if (error) return { error: error.message }
      // Eager session so protected routes never mount with a stale signed-out context.
      if (data.session) setSession(data.session)
      return { error: null }
    },
    [],
  )

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const supabase = getSupabase()
    if (!supabase) return { error: 'Supabase is not configured.' }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    if (data.session) setSession(data.session)
    return { error: null }
  }, [])

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    const supabase = getSupabase()
    if (!supabase) return { error: 'Supabase is not configured.', needsConfirmation: false }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: authRedirectTo('/auth/callback') },
    })
    if (error) return { error: error.message, needsConfirmation: false }
    if (data.session) setSession(data.session)
    const needsConfirmation = Boolean(data.user) && !data.session
    return { error: null, needsConfirmation }
  }, [])

  const signInWithProvider = useCallback(
    async (provider: OAuthProvider) => {
      const supabase = getSupabase()
      if (!supabase) return { error: 'Supabase is not configured.' }
      if (provider === 'google') {
        const result = await signInWithGoogleOAuthRedirect()
        return { error: result.error }
      }
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: authRedirectTo('/auth/callback'),
          skipBrowserRedirect: true,
        },
      })
      if (error) return { error: error.message }
      if (data.url) window.location.assign(data.url)
      return { error: null }
    },
    [signInWithGoogleOAuthRedirect],
  )

  const resetPasswordForEmail = useCallback(async (email: string) => {
    const supabase = getSupabase()
    if (!supabase) return { error: 'Supabase is not configured.' }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: authRedirectTo('/auth/callback'),
    })
    return { error: error?.message ?? null }
  }, [])

  const signOut = useCallback(async () => {
    const supabase = getSupabase()
    if (!supabase) return
    await supabase.auth.signOut()
  }, [])

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) {
      setLoading(false)
      return
    }

    let cancelled = false
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setSession(data.session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setLoading(false)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    setAnalyticsUser(session?.user.id ?? null)
  }, [session?.user.id])

  const value: AuthContextValue = {
    configured: isSupabaseConfigured,
    loading,
    session,
    user: session?.user ?? null,
    signInWithEmail,
    signUpWithEmail,
    signInWithProvider,
    signInWithGoogle: signInWithGoogleOAuthRedirect,
    signInWithGoogleIdToken,
    resetPasswordForEmail,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
