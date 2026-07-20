/** Main app chrome / background themes (`data-app-theme` on `html` + `.app`). */
export const APP_THEMES = ['dark', 'blue', 'purple'] as const

export type AppTheme = (typeof APP_THEMES)[number]

export const APP_THEME_LABEL: Record<AppTheme, string> = {
  dark: 'Chalkboard',
  blue: 'Denim',
  purple: 'Plum',
}

/** Product default: current dark gray chrome (`#23282e`). */
export const DEFAULT_APP_THEME: AppTheme = 'dark'

/** Solid first-paint / page-pad colors (keep in sync with `app-background.css`). */
export const APP_THEME_PAGE_PAD_COLOR: Record<AppTheme, string> = {
  dark: '#23282e',
  blue: '#1e2d42',
  purple: '#2a2438',
}

export function isAppTheme(s: string): s is AppTheme {
  return (APP_THEMES as readonly string[]).includes(s)
}
