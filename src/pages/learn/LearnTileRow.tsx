import type { TileDef } from '../../mahjong/types'
import { TileFace } from '../../components/TileFace'

type Props = {
  defs: readonly TileDef[]
  label?: string
  /** Optional caption under the row. */
  caption?: string
}

/** Compact illustrative tile strip for Learn pages. */
export function LearnTileRow({ defs, label, caption }: Props) {
  return (
    <figure className="learn__tile-figure">
      {label ? <figcaption className="learn__tile-label">{label}</figcaption> : null}
      <div className="learn__tile-row" role="list" aria-label={label ?? 'Example tiles'}>
        {defs.map((def, i) => (
          <div key={`${i}-${JSON.stringify(def)}`} className="learn__tile" role="listitem">
            <TileFace def={def} ariaHidden />
          </div>
        ))}
      </div>
      {caption ? <p className="learn__tile-caption">{caption}</p> : null}
    </figure>
  )
}

export const LEARN_TILE = {
  crak: (rank: number): TileDef => ({ cat: 'suit', suit: 'crak', rank }),
  bam: (rank: number): TileDef => ({ cat: 'suit', suit: 'bam', rank }),
  dot: (rank: number): TileDef => ({ cat: 'suit', suit: 'dot', rank }),
  wind: (wind: 'E' | 'S' | 'W' | 'N'): TileDef => ({ cat: 'wind', wind }),
  dragon: (dragon: 'red' | 'green' | 'soap'): TileDef => ({ cat: 'dragon', dragon }),
  flower: (n = 1): TileDef => ({ cat: 'flower', flower: n }),
  joker: (): TileDef => ({ cat: 'joker' }),
} as const
