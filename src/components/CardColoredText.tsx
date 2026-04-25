import type { CardTextSeg } from '../card/cardText'

type Props = {
  segments: CardTextSeg[]
}

/** Renders NMJL-style color runs (no HTML injection — only plain segments). */
export function CardColoredText({ segments }: Props) {
  return (
    <>
      {segments.map((s, i) => (
        <span key={i} className={`card-ink card-ink--${s.ink}`}>
          {s.t}
        </span>
      ))}
    </>
  )
}
