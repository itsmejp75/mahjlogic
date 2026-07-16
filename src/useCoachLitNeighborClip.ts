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
    let applying = false
    const run = () => {
      applying = true
      try {
        updateCoachLitNeighborClip(root)
      } finally {
        // Defer clear so the MutationObserver from our class writes is ignored.
        queueMicrotask(() => {
          applying = false
        })
      }
    }
    const schedule = () => {
      if (applying) return
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

    // suggest-need / suggest-best class toggles can land without a resize — keep vertical
    // lit↔lit seam clips (e.g. 2D above 2C) in sync. Ignore our own coach-lit-clip-* writes.
    const mo =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver((records) => {
            if (applying) return
            const coachRelevant = records.some((record) => {
              if (record.type === 'childList') return true
              if (record.type !== 'attributes' || record.attributeName !== 'class') return false
              const el = record.target
              if (!(el instanceof Element)) return false
              return (
                el.classList.contains('sorted-discard-tray__slot--suggest-need') ||
                el.classList.contains('sorted-discard-tray__slot--suggest-dim') ||
                el.classList.contains('exposure-rack__slot--suggest-best') ||
                el.classList.contains('exposure-rack__slot--suggest-dim') ||
                (record.oldValue?.includes('suggest-need') ?? false) ||
                (record.oldValue?.includes('suggest-best') ?? false) ||
                (record.oldValue?.includes('suggest-dim') ?? false)
              )
            })
            if (coachRelevant) schedule()
          })
        : null
    mo?.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class'],
      attributeOldValue: true,
    })

    window.addEventListener('resize', schedule)

    return () => {
      cancelAnimationFrame(raf)
      cancelAnimationFrame(raf2)
      ro?.disconnect()
      mo?.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [active, rootRef, ...deps])
}
