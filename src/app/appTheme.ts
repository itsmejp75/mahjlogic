/** Main app chrome / background themes (`data-app-theme` on `html` + `.app`). */
export const APP_THEMES = ['blue', 'dark', 'purple'] as const

export type AppTheme = (typeof APP_THEMES)[number]

export const APP_THEME_LABEL: Record<AppTheme, string> = {
  dark: 'Phantom',
  blue: 'Abyss',
  purple: 'Mystic',
}

/** Product default: Abyss (login navy) chrome (`#0d1522`). */
export const DEFAULT_APP_THEME: AppTheme = 'blue'

/** Solid first-paint / page-pad colors (keep in sync with `app-background.css`). */
export const APP_THEME_PAGE_PAD_COLOR: Record<AppTheme, string> = {
  dark: '#151a20',
  blue: '#0d1522',
  purple: '#2a2438',
}

export function isAppTheme(s: string): s is AppTheme {
  return (APP_THEMES as readonly string[]).includes(s)
}
