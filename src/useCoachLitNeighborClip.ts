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
    let raf2 = 0
    const run = () => updateCoachLitNeighborClip(root)
    const schedule = () => {
      cancelAnimationFrame(raf)
      cancelAnimationFrame(raf2)
      raf = requestAnimationFrame(() => {
        run()
        // Second frame: catch post-bounce class toggles / late layout after React commit.
        raf2 = requestAnimationFrame(run)
      })
    }

    // Sync before paint so same-frame lit neighbors are not briefly double-rimmed; rAF
    // catches late layout (fonts, fly-in settle) without waiting on a resize.
    run()
    schedule()

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null
    ro?.observe(root)

    window.addEventListener('resize', schedule)

    return () => {
      cancelAnimationFrame(raf)
      cancelAnimationFrame(raf2)
      ro?.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [active, rootRef, ...deps])
}
