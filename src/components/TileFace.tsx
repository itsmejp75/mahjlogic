import { memo, useEffect, useRef, useState, type ReactNode } from 'react'
import type { TileDef } from '../mahjong/types'
import type { CardInk } from '../card/cardText'
import { CARD_INK_TO_TILE_SKIN_CLASS } from '../card/cardInkTileSkin'
import { tileAriaLabel, tileShortLabel, tileSuitRackWord } from '../mahjong/labels'
import { classicTileArtUrl } from '../tiles/classicTileArt'
import {
  isIllustrativeTileGraphics,
  type TileGraphics,
} from '../tiles/tileGraphics'
import { useTileGraphics } from '../tiles/TileGraphicsContext'

/** Mobile Safari can fail a concurrent SVG load and keep the broken-image icon forever. */
const TILE_ART_LOAD_MAX_ATTEMPTS = 4

/**
 * Classic tile SVG with load recovery. Remounts on error (same URL — no cache-bust query that
 * can 404 on Capacitor) and stays invisible until `onLoad` so the blue question-mark placeholder
 * never flashes. Explains "looks fine while dragging": DragOverlay mounts a fresh `<img>` that
 * loads while the broken source stays parked at opacity 0.
 */
function TileArtImage({ src }: { src: string }) {
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const retryTimerRef = useRef(0)

  useEffect(() => {
    setAttempt(0)
    setLoaded(false)
    return () => window.clearTimeout(retryTimerRef.current)
  }, [src])

  return (
    <img
      key={`${src}:${attempt}`}
      className="tile-face__art"
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="async"
      // Keep layout; hide until decode succeeds so Safari's broken-image icon never shows.
      style={loaded ? undefined : { opacity: 0 }}
      onLoad={() => setLoaded(true)}
      onError={() => {
        setLoaded(false)
        if (attempt + 1 >= TILE_ART_LOAD_MAX_ATTEMPTS) return
        const next = attempt + 1
        window.clearTimeout(retryTimerRef.current)
        retryTimerRef.current = window.setTimeout(() => setAttempt(next), 50 * next)
      }}
    />
  )
}

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
  /** Compact glyph: suit tiles show rank only (e.g. `1` not `1D`); suit color classes unchanged. */
  compactRankOnly?: boolean
  /** Sorted discard tray: glyph band in the upper portion of the face (e.g. 1D, 2D). */
  sortedDiscardGlyph?: boolean
  /** Sorted discard tray: center the glyph horizontally in the upper band (0, F, N, S). */
  sortedDiscardGlyphCenter?: boolean
  /** Sorted discard tray: paint dot blue (including soap dragon). */
  sortedDiscardDotBlue?: boolean
  /** Sorted discard tray: paint bam green (including green dragon). */
  sortedDiscardBamGreen?: boolean
  /** Sorted discard tray: paint crak red (including red dragon). */
  sortedDiscardCrakRed?: boolean
}

/**
 * Split a tile glyph (e.g. `3B`, `5D`, `0` soap) into per-character spans so digits render in
 * `Noto Sans Arabic` while letters stay in `Figtree`. See `.tile-face__glyph-num` / `-letter`.
 */
function renderGlyphChars(label: string): ReactNode {
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

/**
 * Suggested-strip `cardInk` paints prism card-print solids. Under illustrative Classic,
 * honor tiles should match the main rack (SVG art), not card-print wind/flower skins.
 */
function cardInkForTileFace(
  def: TileDef,
  cardInk: CardInk | undefined,
  tileGraphics: TileGraphics,
): CardInk | undefined {
  if (cardInk == null) return undefined
  if (!isIllustrativeTileGraphics(tileGraphics)) return cardInk
  if (
    def.cat === 'flower' ||
    def.cat === 'dragon' ||
    def.cat === 'wind' ||
    def.cat === 'joker' ||
    def.cat === 'blank'
  ) {
    return undefined
  }
  return cardInk
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
    case 'blank':
      return 'tile--blank'
  }
}

export const TileFace = memo(function TileFace({
  def,
  elevated,
  rackSuitStacked,
  cardInk,
  compactRankOnly = false,
  sortedDiscardGlyph = false,
  sortedDiscardGlyphCenter = false,
  sortedDiscardDotBlue = false,
  sortedDiscardBamGreen = false,
  sortedDiscardCrakRed = false,
}: Props) {
  const { tileGraphics } = useTileGraphics()
  const skinCardInk = cardInkForTileFace(def, cardInk, tileGraphics)
  const illustrativeMode =
    skinCardInk == null && isIllustrativeTileGraphics(tileGraphics) && !sortedDiscardGlyph
  const artUrl = illustrativeMode ? classicTileArtUrl(def) : null
  // Blanks have no art image, but in illustrative mode they should still wear the illustrative
  // ivory face + rim bevel (the `::before` highlight/shadow) so they match every other rack tile
  // instead of falling back to a flat solid fill that reads as a different white.
  const illustrativeFace = artUrl != null || (illustrativeMode && def.cat === 'blank')

  const skinClass =
    skinCardInk != null
      ? ['tile-face--card-skin', CARD_INK_TO_TILE_SKIN_CLASS[skinCardInk]].filter(Boolean).join(' ')
      : categoryClass(def)

  const stackedSuit = rackSuitStacked && def.cat === 'suit' && artUrl == null

  return (
    <div
      key={tileGraphics}
      className={[
        'tile-face',
        skinClass,
        illustrativeFace ? 'tile-face--illustrative-art' : '',
        stackedSuit ? 'tile-face--rack-suit-stack' : '',
        elevated ? 'tile-face--elevated' : '',
        sortedDiscardGlyph ? 'tile-face--sorted-discard-glyph' : '',
        sortedDiscardGlyphCenter ? 'tile-face--sorted-discard-glyph-center' : '',
        sortedDiscardDotBlue ? 'tile-face--sorted-discard-dot' : '',
        sortedDiscardBamGreen ? 'tile-face--sorted-discard-bam' : '',
        sortedDiscardCrakRed ? 'tile-face--sorted-discard-crak' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={tileAriaLabel(def)}
    >
      {artUrl != null ? (
        <TileArtImage src={artUrl} />
      ) : stackedSuit ? (
        <>
          <span className="tile-face__rank">{def.rank}</span>
          <div className="tile-face__suit-band">
            <span className="tile-face__suit-name">
              <span className="tile-face__suit-text">{tileSuitRackWord(def.suit)}</span>
            </span>
          </div>
        </>
      ) : compactRankOnly && def.cat === 'suit' ? (
        <span className="tile-face__glyph">
          <span className="tile-face__glyph-num">{def.rank}</span>
        </span>
      ) : def.cat === 'blank' ? (
        sortedDiscardGlyph ? (
          <span className="tile-face__glyph">
            <span className="tile-face__glyph-letter">B</span>
          </span>
        ) : null
      ) : (
        <span className="tile-face__glyph">{renderGlyphChars(tileShortLabel(def))}</span>
      )}
    </div>
  )
})
