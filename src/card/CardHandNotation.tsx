import type { ReactNode } from 'react'
import { showCardHandNotation } from './cardContentAccess'

type NotationProps = {
  /** Rendered when notation may be shown. */
  children: ReactNode
  /** Optional fallback when notation is hidden. */
  fallback?: ReactNode
}

/** Gates copyrighted / card hand-line text out of the DOM on the public web. */
export function CardHandNotation({ children, fallback = null }: NotationProps) {
  if (!showCardHandNotation()) return <>{fallback}</>
  return <>{children}</>
}

export { showCardHandNotation }
