/** Google Identity Services — ID-token sign-in so Google brands this origin, not supabase.co. */

const GSI_SRC = 'https://accounts.google.com/gsi/client'

export type GoogleCredentialResponse = {
  credential: string
  select_by?: string
}

type GoogleAccountsId = {
  initialize: (config: {
    client_id: string
    callback: (response: GoogleCredentialResponse) => void
    nonce?: string
    context?: 'signin' | 'signup' | 'use'
    ux_mode?: 'popup' | 'redirect'
    auto_select?: boolean
    itp_support?: boolean
  }) => void
  renderButton: (
    parent: HTMLElement,
    options: {
      type?: 'standard' | 'icon'
      theme?: 'outline' | 'filled_blue' | 'filled_black'
      size?: 'large' | 'medium' | 'small'
      text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
      shape?: 'rectangular' | 'pill' | 'circle' | 'square'
      logo_alignment?: 'left' | 'center'
      width?: number | string
    },
  ) => void
  cancel: () => void
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: GoogleAccountsId
      }
    }
  }
}

export function getGoogleClientId(): string {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? ''
}

export function isGoogleIdentityConfigured(): boolean {
  return Boolean(getGoogleClientId())
}

let gsiLoadPromise: Promise<void> | null = null

export function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'))
  if (window.google?.accounts?.id) return Promise.resolve()
  if (gsiLoadPromise) return gsiLoadPromise

  gsiLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity')), {
        once: true,
      })
      if (window.google?.accounts?.id) resolve()
      return
    }

    const script = document.createElement('script')
    script.src = GSI_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      gsiLoadPromise = null
      reject(new Error('Failed to load Google Identity'))
    }
    document.head.appendChild(script)
  })

  return gsiLoadPromise
}

/** Raw nonce for Supabase + SHA-256 hex for Google. */
export async function createGoogleNonce(): Promise<{ nonce: string; hashedNonce: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const nonce = btoa(String.fromCharCode(...bytes))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce))
  const hashedNonce = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return { nonce, hashedNonce }
}

export type MountGoogleButtonOptions = {
  onCredential: (credential: string, nonce: string) => void
  onError?: (message: string) => void
}

/**
 * Mounts Google’s real Sign-In button into `host` (near-invisible overlay).
 * Clicks hit Google’s control → Google brands this page origin (mahjlogic.com),
 * not *.supabase.co. Requires Cross-Origin-Opener-Policy: same-origin-allow-popups.
 */
export async function mountGoogleContinueButton(
  host: HTMLElement,
  options: MountGoogleButtonOptions,
): Promise<() => void> {
  const clientId = getGoogleClientId()
  if (!clientId) {
    throw new Error('Missing VITE_GOOGLE_CLIENT_ID')
  }

  await loadGoogleIdentityScript()
  const googleId = window.google?.accounts?.id
  if (!googleId) {
    throw new Error('Google Identity failed to initialize')
  }

  let cancelled = false
  let nonce = ''

  const paint = async () => {
    if (cancelled) return
    const pair = await createGoogleNonce()
    if (cancelled) return
    nonce = pair.nonce
    host.replaceChildren()
    googleId.initialize({
      client_id: clientId,
      callback: (response) => {
        if (!response.credential) {
          options.onError?.('Google did not return a credential')
          return
        }
        options.onCredential(response.credential, nonce)
        void paint()
      },
      nonce: pair.hashedNonce,
      context: 'signin',
      ux_mode: 'popup',
      auto_select: false,
      itp_support: true,
    })
    const width = Math.max(Math.floor(host.getBoundingClientRect().width) || 320, 240)
    googleId.renderButton(host, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'rectangular',
      width,
      logo_alignment: 'left',
    })
  }

  await paint()

  return () => {
    cancelled = true
    try {
      googleId.cancel()
    } catch {
      /* ignore */
    }
    host.replaceChildren()
  }
}
