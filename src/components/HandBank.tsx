import type { ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'

export const HAND_BANK_ID = 'hand-bank'

export function HandBank({ children }: { children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: HAND_BANK_ID })

  return (
    <div
      ref={setNodeRef}
      className={['hand-bank', isOver ? 'hand-bank--hover' : ''].filter(Boolean).join(' ')}
      aria-label="Your hand — drop pass tiles here to return them"
    >
      {children}
    </div>
  )
}
