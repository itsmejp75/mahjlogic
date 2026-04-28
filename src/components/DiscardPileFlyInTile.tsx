import { useLayoutEffect, useRef, type ReactNode, type AnimationEvent } from 'react'

/** New discard-tray cell: one-shot drop from above the slot (same `tile-drop-in` as hand / exposure). */
export function DiscardPileFlyInTile({
  tileId,
  animate,
  onDropInEnd,
  children,
}: {
  tileId: string
  animate: boolean
  onDropInEnd?: () => void
  children: ReactNode
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const flyRef = useRef<HTMLDivElement>(null)
  const endOnceRef = useRef(false)
  useLayoutEffect(() => {
    endOnceRef.current = false
  }, [tileId])
  useLayoutEffect(() => {
    if (!animate) return
    const el = wrapRef.current
    const flyEl = flyRef.current
    if (!el || !flyEl) return
    const tileRect = el.getBoundingClientRect()
    const h = tileRect.height
    const tileCx = tileRect.left + tileRect.width / 2
    const tileCy = tileRect.top + tileRect.height / 2
    const ox = tileCx
    const oy = tileCy - h * 1.2
    flyEl.style.setProperty('--draw-anim-dx', `${ox - tileCx}px`)
    flyEl.style.setProperty('--draw-anim-dy', `${oy - tileCy}px`)
  }, [animate, tileId])

  const handleAnimEnd = (e: AnimationEvent) => {
    if (e.animationName !== 'tile-drop-in') return
    if (!animate || !onDropInEnd || endOnceRef.current) return
    endOnceRef.current = true
    onDropInEnd()
  }

  return (
    <div ref={wrapRef} className="discard-entry__fly-wrap">
      <div
        ref={flyRef}
        onAnimationEnd={handleAnimEnd}
        className={[
          'discard-entry__fly',
          'sortable-tile-wrap__fly',
          animate ? 'sortable-tile-wrap--just-drawn' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {children}
      </div>
    </div>
  )
}
