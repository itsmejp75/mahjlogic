import { memo } from 'react'

/** Orange triangle exclamation — tile is a dead copy for the focused suggested hand. */
export const DeadCauseWarning = memo(function DeadCauseWarning({
  className,
}: {
  className?: string
}) {
  return (
    <svg
      className={['dead-cause-warn', className].filter(Boolean).join(' ')}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M12 2L1 21h22L12 2z" strokeWidth="1.5" strokeLinejoin="round" />
      <text x="12" y="18.5" textAnchor="middle" fontSize="13" fontWeight="800" fontFamily="system-ui, sans-serif">!</text>
    </svg>
  )
})
