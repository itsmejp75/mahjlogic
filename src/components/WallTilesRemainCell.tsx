import type { CSSProperties } from 'react'

type Props = {
  count: number
  className: string
  style?: CSSProperties
}

/** Rack column 11: wall tiles remaining (heat box + count). */
export function WallTilesRemainCell({ count, className, style }: Props) {
  return (
    <div
      className={className}
      style={style}
      aria-label={`${count} tiles remaining in wall`}
    >
      <span className="rack-bottom-wall__num">{count}</span>
    </div>
  )
}
