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

/**
 * Menu Theme picker faces — fixed per theme so all three stay identifiable
 * regardless of the active `data-app-theme`. Keep in sync with action-pill
 * colors in `app-background.css`.
 */
export const APP_THEME_BTN_PREVIEW: Record<
  AppTheme,
  { face: string; facePressed: string; border: string }
> = {
  blue: {
    face: 'linear-gradient(180deg, #33c5e3 0%, #14a0bf 48%, #0a7a98 100%)',
    facePressed: '#0c6480',
    border: '#2a9bb5',
  },
  dark: {
    face: 'linear-gradient(180deg, #b0bcc8 0%, #7d8c9b 48%, #5a6b7d 100%)',
    facePressed: '#3f4f60',
    border: '#8a97a4',
  },
  purple: {
    face: 'linear-gradient(180deg, #c792dd 0%, #9a55b8 48%, #7e3a9c 100%)',
    facePressed: '#582872',
    border: '#a86fc4',
  },
}

export function isAppTheme(s: string): s is AppTheme {
  return (APP_THEMES as readonly string[]).includes(s)
}
