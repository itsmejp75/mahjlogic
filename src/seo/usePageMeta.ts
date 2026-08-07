import { useEffect } from 'react'
import { absoluteUrl, DEFAULT_OG_IMAGE } from './site'

export type PageMeta = {
  title: string
  description: string
  /** Path starting with `/`, or absolute URL. */
  path: string
  /** Absolute or site-relative image URL. */
  image?: string
  /** Open Graph type. Default `website`. */
  type?: 'website' | 'article'
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  const selector = `meta[${attr}="${key}"]`
  let el = document.head.querySelector(selector)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

function isStandaloneDisplay(): boolean {
  try {
    if (document.documentElement.hasAttribute('data-native-app')) return true
    if (window.matchMedia('(display-mode: standalone)').matches) return true
    const nav = window.navigator as Navigator & { standalone?: boolean }
    return nav.standalone === true
  } catch {
    return false
  }
}

/**
 * Sets document title + description/canonical/Open Graph/Twitter tags for the
 * current route. Safe for SPA navigations (overwrites prior values).
 * Skips `document.title` in installed PWA / native shells (window caption uses
 * the manifest name only — see index.html).
 */
export function usePageMeta({
  title,
  description,
  path,
  image = DEFAULT_OG_IMAGE,
  type = 'website',
}: PageMeta) {
  useEffect(() => {
    const url = absoluteUrl(path)
    const imageUrl = absoluteUrl(image)

    if (!isStandaloneDisplay()) document.title = title
    upsertMeta('name', 'description', description)
    upsertLink('canonical', url)

    upsertMeta('property', 'og:title', title)
    upsertMeta('property', 'og:description', description)
    upsertMeta('property', 'og:url', url)
    upsertMeta('property', 'og:image', imageUrl)
    upsertMeta('property', 'og:type', type)
    upsertMeta('property', 'og:site_name', 'MahjLogic')
    upsertMeta('property', 'og:locale', 'en_US')

    upsertMeta('name', 'twitter:card', 'summary_large_image')
    upsertMeta('name', 'twitter:title', title)
    upsertMeta('name', 'twitter:description', description)
    upsertMeta('name', 'twitter:image', imageUrl)
  }, [title, description, path, image, type])
}
