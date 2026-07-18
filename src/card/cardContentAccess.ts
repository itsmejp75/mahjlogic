/**
 * Card-content access for copyright / scrape resistance.
 *
 * Public web builds (`MAHJLOGIC_CARD_CONTENT=0`) ship **no** card books at all.
 * Native / local builds include books; DOM notation can still be gated for a future web unlock.
 */

/** Set at build time by Vite (`1` = books in bundle, `0` = stub). */
export function isCardBookBundled(): boolean {
  return import.meta.env.VITE_CARD_CONTENT !== '0'
}

export const LS_KEY_LEAGUE_CARD_ENTITLED = 'mahjlogic.leagueCardEntitled.v1'

export function isNativeAppShell(): boolean {
  if (typeof document === 'undefined') return false
  return document.documentElement.hasAttribute('data-native-app')
}

/**
 * Dev, Capacitor/native shell, or explicit unlock — for a future checkout on web once books
 * are served from a server (today web builds omit books entirely).
 */
export function isLeagueCardEntitled(): boolean {
  if (!isCardBookBundled()) return false
  if (import.meta.env.DEV) return true
  if (isNativeAppShell()) return true
  try {
    return localStorage.getItem(LS_KEY_LEAGUE_CARD_ENTITLED) === '1'
  } catch {
    return false
  }
}

export function setLeagueCardEntitled(on: boolean): void {
  try {
    if (on) localStorage.setItem(LS_KEY_LEAGUE_CARD_ENTITLED, '1')
    else localStorage.removeItem(LS_KEY_LEAGUE_CARD_ENTITLED)
  } catch {
    /* ignore */
  }
}

/** When false, UI must not put hand lines like `FF 11 22 33…` into the DOM or aria labels. */
export function showCardHandNotation(): boolean {
  return isLeagueCardEntitled()
}
