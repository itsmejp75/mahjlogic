/** Google Identity Services (GSI) — ID-token sign-in so consent shows Mahj Logic, not supabase.co. */

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
    use_fedcm_for_prompt?: boolean
    auto_select?: boolean
  }) => void
  prompt: (momentListener?: (notification: GooglePromptNotification) => void) => void
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

type GooglePromptNotification = {
  isDisplayMoment: () => boolean
  isDisplayed: () => boolean
  isNotDisplayed: () => boolean
  isSkippedMoment: () => boolean
  isDismissedMoment: () => boolean
  getNotDisplayedReason: () => string
  getSkippedReason: () => string
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

/**
 * Opens Google account chooser (One Tap / FedCM / fallback button) and returns the ID token.
 * Does not redirect through supabase.co, so consent can show “Mahj Logic”.
 */
export async function requestGoogleIdToken(): Promise<{ credential: string; nonce: string }> {
  const clientId = getGoogleClientId()
  if (!clientId) {
    throw new Error('Missing VITE_GOOGLE_CLIENT_ID in .env.local')
  }

  await loadGoogleIdentityScript()
  const googleId = window.google?.accounts?.id
  if (!googleId) {
    throw new Error('Google Identity failed to initialize')
  }

  const { nonce, hashedNonce } = await createGoogleNonce()

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (credential: string) => {
      if (settled) return
      settled = true
      cleanup()
      resolve({ credential, nonce })
    }
    const fail = (message: string) => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error(message))
    }

    let overlay: HTMLDivElement | null = null

    const cleanup = () => {
      try {
        googleId.cancel()
      } catch {
        /* ignore */
      }
      overlay?.remove()
      overlay = null
    }

    googleId.initialize({
      client_id: clientId,
      callback: (response) => {
        if (!response.credential) {
          fail('Google did not return a credential')
          return
        }
        finish(response.credential)
      },
      nonce: hashedNonce,
      context: 'signin',
      ux_mode: 'popup',
      use_fedcm_for_prompt: true,
      auto_select: false,
    })

    const showFallbackButton = () => {
      if (overlay || settled) return
      overlay = document.createElement('div')
      overlay.className = 'landing-google-fallback'
      overlay.innerHTML = `
        <div class="landing-google-fallback__panel" role="dialog" aria-modal="true" aria-label="Continue with Google">
          <p class="landing-google-fallback__title">Continue with Google</p>
          <div class="landing-google-fallback__btn-host"></div>
          <button type="button" class="landing-google-fallback__cancel">Cancel</button>
        </div>
      `
      document.body.appendChild(overlay)
      const host = overlay.querySelector<HTMLElement>('.landing-google-fallback__btn-host')
      const cancel = overlay.querySelector<HTMLButtonElement>('.landing-google-fallback__cancel')
      cancel?.addEventListener('click', () => fail('Google sign-in cancelled'))
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) fail('Google sign-in cancelled')
      })
      if (host) {
        googleId.renderButton(host, {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          width: 320,
          logo_alignment: 'left',
        })
      }
    }

    googleId.prompt((notification) => {
      // One Tap / FedCM is visible — wait for credential or dismiss; do not stack our modal.
      if (notification.isDisplayMoment() || notification.isDisplayed()) {
        return
      }
      if (notification.isDismissedMoment()) {
        fail('Google sign-in cancelled')
        return
      }
      // Only if Google could not show One Tap at all.
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        showFallbackButton()
      }
    })
  })
}
