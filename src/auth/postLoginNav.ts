/** Survives Google OAuth / email-confirm full-page redirects. */
const POST_LOGIN_FROM_KEY = 'mahjlogic.postLoginFrom'

const REMEMBERED_FROM = new Set(['/play', '/rack-checker', '/home'])

export function rememberPostLoginFrom(from: unknown) {
  try {
    if (from === '/play' || from === '/rack-checker') {
      sessionStorage.setItem(POST_LOGIN_FROM_KEY, from)
      return
    }
    sessionStorage.setItem(POST_LOGIN_FROM_KEY, '/home')
  } catch {
    /* private mode / blocked storage */
  }
}

export function consumePostLoginFrom(): string | undefined {
  try {
    const from = sessionStorage.getItem(POST_LOGIN_FROM_KEY)
    sessionStorage.removeItem(POST_LOGIN_FROM_KEY)
    if (from && REMEMBERED_FROM.has(from)) return from
  } catch {
    /* ignore */
  }
  return undefined
}

/** After sign-in: Play CTA → table, Rack Checker CTA → checker, header Login → hub. */
export function postLoginNav(from: unknown): { path: string; state?: Record<string, unknown> } {
  if (from === '/play') {
    return { path: '/play', state: { playIntent: 'enter' } }
  }
  if (from === '/rack-checker') {
    return { path: '/rack-checker' }
  }
  return { path: '/home' }
}
