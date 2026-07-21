/** Main app chrome / background themes (`data-app-theme` on `html` + `.app`). */
export const APP_THEMES = ['purple', 'blue', 'dark'] as const

export type AppTheme = (typeof APP_THEMES)[number]

export const APP_THEME_LABEL: Record<AppTheme, string> = {
  purple: 'Grape',
  blue: 'Denim',
  dark: 'Chalkboard',
}

/** Product default: Grape (`#2a2438`). */
export const DEFAULT_APP_THEME: AppTheme = 'purple'

/** Solid first-paint / page-pad colors (keep in sync with `app-background.css`). */
export const APP_THEME_PAGE_PAD_COLOR: Record<AppTheme, string> = {
  purple: '#2a2438',
  blue: '#1e2d42',
  dark: '#23282e',
}

export function isAppTheme(s: string): s is AppTheme {
  return (APP_THEMES as readonly string[]).includes(s)
}
