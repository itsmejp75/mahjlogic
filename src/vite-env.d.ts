/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `1` = card books in bundle (native/dev); `0` = public web stub. */
  readonly VITE_CARD_CONTENT: '0' | '1'
  /** Supabase project URL (Dashboard → Project Settings → API). */
  readonly VITE_SUPABASE_URL?: string
  /** Supabase publishable key (preferred; safe for the browser). */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** Legacy alias for the public/anon key. */
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** Google OAuth Web Client ID (same as Supabase Google provider). */
  readonly VITE_GOOGLE_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
