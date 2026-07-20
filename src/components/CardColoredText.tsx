import { memo } from 'react'
import type { CardTextSeg } from '../card/cardText'

type Props = {
  segments: CardTextSeg[]
}

/** Drop edge spaces — `.card-ink + .card-ink` margin owns gaps between color runs. */
export function cardInkRunText(t: string): string {
  return t.replace(/^\s+/, '').replace(/\s+$/, '')
}

/** Renders NMJL-style color runs (no HTML injection — only plain segments). */
export const CardColoredText = memo(function CardColoredText({ segments }: Props) {
  return (
    <>
      {segments.map((s, i) => (
        <span key={i} className={`card-ink card-ink--${s.ink}`}>
          {cardInkRunText(s.t)}
        </span>
      ))}
    </>
  )
})
