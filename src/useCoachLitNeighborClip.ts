import { useLayoutEffect, type RefObject } from 'react'
import { updateCoachLitNeighborClip } from './coachLitNeighborClip'

/** Recompute lit→lit vignette/lift clips when bot exposure layout changes. */
export function useCoachLitNeighborClip(
  rootRef: RefObject<HTMLElement | null>,
  active: boolean,
  deps: readonly unknown[],
) {
  useLayoutEffect(() => {
    if (!active) return
    const root = rootRef.current
    if (!root) return

    let raf = 0
    const schedule = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => updateCoachLitNeighborClip(root))
    }

    schedule()

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null
    ro?.observe(root)

    window.addEventListener('resize', schedule)

    return () => {
      cancelAnimationFrame(raf)
      ro?.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [active, rootRef, ...deps])
}
