import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isGoogleIdentityConfigured, promptGoogleIdToken } from '../lib/googleIdentity'
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
  signInWithGoogle: () => Promise<{
    error: string | null
    redirected: boolean
    signedIn: boolean
  }>
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

  /** Full-page redirect through Supabase (one window; Google may show *.supabase.co). */
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

  const signInWithGoogle = useCallback(async (): Promise<{
    error: string | null
    redirected: boolean
    signedIn: boolean
  }> => {
    const supabase = getSupabase()
    if (!supabase) return { error: 'Supabase is not configured.', redirected: false, signedIn: false }

    if (isGoogleIdentityConfigured()) {
      try {
        const result = await promptGoogleIdToken()
        if (result.status === 'credential') {
          const { data, error } = await supabase.auth.signInWithIdToken({
            provider: 'google',
            token: result.credential,
            nonce: result.nonce,
          })
          if (error) return { error: error.message, redirected: false, signedIn: false }
          if (data.session) setSession(data.session)
          return { error: null, redirected: false, signedIn: Boolean(data.session) }
        }
        if (result.status === 'cancelled') {
          return { error: null, redirected: false, signedIn: false }
        }
        // FedCM/One Tap unavailable → full-page OAuth (no popup / blank window).
      } catch {
        // Fall through to OAuth redirect.
      }
    }

    return signInWithGoogleOAuthRedirect()
  }, [signInWithGoogleOAuthRedirect])

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

  const value: AuthContextValue = {
    configured: isSupabaseConfigured,
    loading,
    session,
    user: session?.user ?? null,
    async signInWithEmail(email, password) {
      const supabase = getSupabase()
      if (!supabase) return { error: 'Supabase is not configured.' }
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return { error: error?.message ?? null }
    },
    async signUpWithEmail(email, password) {
      const supabase = getSupabase()
      if (!supabase) return { error: 'Supabase is not configured.', needsConfirmation: false }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: authRedirectTo('/auth/callback') },
      })
      if (error) return { error: error.message, needsConfirmation: false }
      const needsConfirmation = Boolean(data.user) && !data.session
      return { error: null, needsConfirmation }
    },
    async signInWithProvider(provider) {
      const supabase = getSupabase()
      if (!supabase) return { error: 'Supabase is not configured.' }
      if (provider === 'google') {
        const result = await signInWithGoogle()
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
    signInWithGoogle,
    async resetPasswordForEmail(email) {
      const supabase = getSupabase()
      if (!supabase) return { error: 'Supabase is not configured.' }
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: authRedirectTo('/auth/callback'),
      })
      return { error: error?.message ?? null }
    },
    async signOut() {
      const supabase = getSupabase()
      if (!supabase) return
      await supabase.auth.signOut()
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
