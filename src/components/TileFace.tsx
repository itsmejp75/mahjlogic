import type React from 'react'
import type { TileDef } from '../mahjong/types'
import type { CardInk } from '../card/cardText'
import { CARD_INK_TO_TILE_SKIN_CLASS } from '../card/cardInkTileSkin'
import { tileAriaLabel, tileShortLabel, tileSuitRackWord } from '../mahjong/labels'

type Props = {
  def: TileDef
  /** When true, subtle drag styling (no depth shadow). */
  elevated?: boolean
  /**
   * Main hand + staged discard only: suit tiles show rank centered with DOT / BAM / CRAK below.
   * (Discard tracker, bot exposures, Charleston pass strip, etc. keep the compact single-line glyph.)
   */
  rackSuitStacked?: boolean
  /**
   * When set (suggested-hand strip), paint this mini tile to match the **NMJL card PDF** ink
   * for that cell (`patternLinePreviewSlots` + `cardInkTileSkin`).
   */
  cardInk?: CardInk
  /** Your rack: tiny bottom-center mark for tiles just received (Charleston, draw, joker swap) until the turn ends. */
  rackNewMark?: boolean
}

/**
 * Split a tile glyph (e.g. `3B`, `5D`, `0` soap) into per-character spans so digits render in
 * `Noto Sans Arabic` while letters stay in `Figtree`. See `.tile-face__glyph-num` / `-letter`.
 */
function renderGlyphChars(label: string): React.ReactNode {
  return Array.from(label).map((ch, i) => {
    const isDigit = ch >= '0' && ch <= '9'
    return (
      <span
        key={i}
        className={isDigit ? 'tile-face__glyph-num' : 'tile-face__glyph-letter'}
      >
        {ch}
      </span>
    )
  })
}

function categoryClass(def: TileDef): string {
  switch (def.cat) {
    case 'suit':
      return `tile--suit tile--${def.suit}`
    case 'wind':
      return 'tile--wind'
    case 'dragon':
      return def.dragon === 'any'
        ? 'tile--dragon tile--dragon-any'
        : `tile--dragon tile--dragon-${def.dragon}`
    case 'flower':
      return 'tile--flower'
    case 'joker':
      return 'tile--joker'
  }
}

export function TileFace({ def, elevated, rackSuitStacked, cardInk, rackNewMark }: Props) {
  const skinClass =
    cardInk != null
      ? ['tile-face--card-skin', CARD_INK_TO_TILE_SKIN_CLASS[cardInk]].filter(Boolean).join(' ')
      : categoryClass(def)

  const stackedSuit = rackSuitStacked && def.cat === 'suit'

  return (
    <div
      className={[
        'tile-face',
        skinClass,
        stackedSuit ? 'tile-face--rack-suit-stack' : '',
        elevated ? 'tile-face--elevated' : '',
        rackNewMark ? 'tile-face--rack-new-mark' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={tileAriaLabel(def)}
    >
      {stackedSuit ? (
        <>
          <span className="tile-face__rank">{def.rank}</span>
          <div className="tile-face__suit-band">
            <span className="tile-face__suit-name">
              <span className="tile-face__suit-text">{tileSuitRackWord(def.suit)}</span>
            </span>
          </div>
        </>
      ) : (
        <span className="tile-face__glyph">{renderGlyphChars(tileShortLabel(def))}</span>
      )}
      {rackNewMark ? <span className="tile-face__rack-new-dot" aria-hidden="true" /> : null}
    </div>
  )
}
