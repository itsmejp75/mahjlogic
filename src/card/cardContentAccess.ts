/**
 * Card-content access.
 *
 * Default PWA/web builds include card books so the product is playable in the browser.
 * `build:web-locked` (`VITE_CARD_CONTENT=0`) ships an empty stub for a future no-card web shell.
 * Google snippet protection uses meta description + `#root data-nosnippet` (see index.html).
 */

/** Set at build time by Vite (`1` = books in bundle, `0` = stub). */
export function isCardBookBundled(): boolean {
  return import.meta.env.VITE_CARD_CONTENT !== '0'
}

export const LS_KEY_LEAGUE_CARD_ENTITLED = 'mahjlogic.leagueCardEntitled.v1'

/**
 * Full card notation when books are in the bundle (current PWA product).
 * Locked stub builds stay closed unless `setLeagueCardEntitled(true)` (future paid unlock).
 */
export function isLeagueCardEntitled(): boolean {
  if (!isCardBookBundled()) {
    try {
      return localStorage.getItem(LS_KEY_LEAGUE_CARD_ENTITLED) === '1'
    } catch {
      return false
    }
  }
  return true
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
