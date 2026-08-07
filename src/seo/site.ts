/** Canonical production origin for SEO meta, sitemap, and Open Graph. */
export const SITE_ORIGIN = 'https://mahjlogic.com'

export const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/icon-512.png`

export function absoluteUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${SITE_ORIGIN}${normalized}`
}
