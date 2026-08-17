import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { trackGameAbandonedIfInProgress, trackPageView } from '../lib/analytics'

/** SPA page views + abandon an in-progress hand when leaving `/play` or unloading. */
export function GaPageViews() {
  const { pathname } = useLocation()
  const prevPathRef = useRef(pathname)

  useEffect(() => {
    const onPageHide = () => {
      trackGameAbandonedIfInProgress()
    }
    window.addEventListener('pagehide', onPageHide)
    return () => window.removeEventListener('pagehide', onPageHide)
  }, [])

  useEffect(() => {
    const prev = prevPathRef.current
    if (prev === '/play' && pathname !== '/play') {
      trackGameAbandonedIfInProgress()
    }
    prevPathRef.current = pathname
    trackPageView(pathname)
  }, [pathname])

  return null
}
