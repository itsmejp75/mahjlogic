/** Google Identity Services — ID-token sign-in so Google brands this origin, not supabase.co. */

const GSI_SRC = 'https://accounts.google.com/gsi/client'

export type GoogleCredentialResponse = {
  credential: string
  select_by?: string
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

type GoogleAccountsId = {
  initialize: (config: {
    client_id: string
    callback: (response: GoogleCredentialResponse) => void
    nonce?: string
    context?: 'signin' | 'signup' | 'use'
    use_fedcm_for_prompt?: boolean
    auto_select?: boolean
  }) => void
  prompt: (momentListener?: (notification: GooglePromptNotification) => void) => void
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
let primedNonce: { nonce: string; hashedNonce: string } | null = null

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

/** Load GIS + precompute nonce so a click can call prompt() without awaiting first. */
export async function primeGoogleIdentity(): Promise<void> {
  if (!isGoogleIdentityConfigured()) return
  await loadGoogleIdentityScript()
  primedNonce = await createGoogleNonce()
}

function takeNonce(): { nonce: string; hashedNonce: string } | null {
  const pair = primedNonce
  primedNonce = null
  void createGoogleNonce()
    .then((next) => {
      primedNonce = next
    })
    .catch(() => undefined)
  return pair
}

export type GoogleIdTokenResult =
  | { status: 'credential'; credential: string; nonce: string }
  | { status: 'cancelled' }
  | { status: 'unavailable'; reason: string }

/**
 * FedCM / One Tap from a real user click — no popup windows, no invisible overlay.
 * Google brands this page’s origin. If the prompt cannot show, caller should use
 * full-page Supabase OAuth redirect (also no popup).
 */
export async function promptGoogleIdToken(): Promise<GoogleIdTokenResult> {
  const clientId = getGoogleClientId()
  if (!clientId) {
    return { status: 'unavailable', reason: 'Missing VITE_GOOGLE_CLIENT_ID' }
  }

  if (!window.google?.accounts?.id) {
    await loadGoogleIdentityScript()
  }
  const googleId = window.google?.accounts?.id
  if (!googleId) {
    return { status: 'unavailable', reason: 'Google Identity failed to initialize' }
  }

  // Prefer primed nonce so we don't await crypto during the click (keeps user gesture).
  const pair = takeNonce() ?? (await createGoogleNonce())

  return new Promise((resolve) => {
    let settled = false
    const finish = (result: GoogleIdTokenResult) => {
      if (settled) return
      settled = true
      try {
        googleId.cancel()
      } catch {
        /* ignore */
      }
      resolve(result)
    }

    googleId.initialize({
      client_id: clientId,
      callback: (response) => {
        if (!response.credential) {
          finish({ status: 'unavailable', reason: 'Google did not return a credential' })
          return
        }
        finish({ status: 'credential', credential: response.credential, nonce: pair.nonce })
      },
      nonce: pair.hashedNonce,
      context: 'signin',
      use_fedcm_for_prompt: true,
      auto_select: false,
    })

    googleId.prompt((notification) => {
      if (notification.isDisplayMoment() || notification.isDisplayed()) {
        return
      }
      if (notification.isDismissedMoment()) {
        finish({ status: 'cancelled' })
        return
      }
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        const reason = notification.isNotDisplayed()
          ? notification.getNotDisplayedReason()
          : notification.getSkippedReason()
        finish({ status: 'unavailable', reason: reason || 'prompt_unavailable' })
      }
    })
  })
}
