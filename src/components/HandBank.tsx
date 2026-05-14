import type { ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'

export const HAND_BANK_ID = 'hand-bank'

export function HandBank({
  children,
  watermark,
  watermarkOverlayClassName,
}: {
  children: ReactNode
  /** Centered backdrop (e.g. Mahjong win review); paints above tray fill, below `.hand-row`. */
  watermark?: ReactNode
  /** Extra classes on the overlay (e.g. `hand-bank__main-rack-watermark--interactive` for buttons). */
  watermarkOverlayClassName?: string
}) {
  const { setNodeRef, isOver } = useDroppable({ id: HAND_BANK_ID })

  return (
    <div
      ref={setNodeRef}
      className={['hand-bank', isOver ? 'hand-bank--hover' : ''].filter(Boolean).join(' ')}
      aria-label="Your hand — drop pass tiles here to return them"
    >
      {watermark ? (
        <div
          className={['hand-bank__main-rack-watermark', watermarkOverlayClassName].filter(Boolean).join(' ')}
        >
          {watermark}
        </div>
      ) : null}
      {children}
    </div>
  )
}
