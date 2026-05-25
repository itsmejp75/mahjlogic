import type { CardInk, CardTextSeg } from './cardText'
import type { TileDef } from '../mahjong/types'

function textHasWindGlyphs(t: string): boolean {
  for (const ch of t) {
    if (ch === 'N' || ch === 'E' || ch === 'W' || ch === 'S') return true
  }
  return false
}

/**
 * When the **card** prints one suit group in a single color (all navy, all green, or all red)
 * — including “honor”-ink `DD` pairs sitting on that same one-color line — dragons on the strip
 * should use that **same** ink (e.g. blue mini tiles for all-navy one-suit hands).
 */
export function inferMonoSuitCardPrint(segments: readonly CardTextSeg[]): CardInk | null {
  for (const seg of segments) {
    if (seg.ink === 'honor' && textHasWindGlyphs(seg.t)) return null
  }
  const inks = new Set<'navy' | 'green' | 'red'>()
  for (const seg of segments) {
    if (seg.ink === 'neutral' || seg.ink === 'joker' || seg.ink === 'flower' || seg.ink === 'rack-wind')
      continue
    if (seg.ink === 'honor') continue
    if (seg.ink === 'soap') return null
    if (seg.ink === 'navy' || seg.ink === 'green' || seg.ink === 'red') inks.add(seg.ink)
    else return null
  }
  if (inks.size !== 1) return null
  const only = [...inks][0]!
  const hasNumbers = segments.some(
    (s) =>
      (s.ink === 'navy' || s.ink === 'green' || s.ink === 'red') && /\d/.test(s.t),
  )
  if (!hasNumbers) return null
  return only
}

export type PreviewLineContext = {
  monoSuitCardPrint: CardInk | null
}

/**
 * NMJL official card (PDF) → suggested-hand **mini tile** chrome.
 *
 * The League prints runs in **blue**, **green**, **red**, and **black** (honors / generic dragons /
 * winds / neutral punctuation). Soap (white dragon) and digit **0** are always printed in **blue**
 * on the card; we mirror that on mini tiles even when the surrounding segment uses another ink.
 *
 * This table is the single source of truth for `TileFace` `--card-skin--*` classes in the suggested
 * hands strip (not rack tiles).
 */
export const CARD_INK_TO_TILE_SKIN_CLASS: Record<CardInk, string> = {
  navy: 'tile-face--card-skin-navy',
  green: 'tile-face--card-skin-green',
  red: 'tile-face--card-skin-red',
  /** Black / dark print (honor dragons, generic D when the card is black). */
  honor: 'tile-face--card-skin-honor',
  /** Title ink only; strip flowers use `rack-flower` (main rack flower fill). */
  flower: 'tile-face--card-skin-rack-flower',
  joker: 'tile-face--card-skin-rack-wind',
  /** Soap-ink segments (digits other than 0 still follow segment; see resolver). */
  soap: 'tile-face--card-skin-soap',
  neutral: 'tile-face--card-skin-neutral',
  /** Winds / jokers in suggested strip — main rack wind tile chrome. */
  'rack-wind': 'tile-face--card-skin-rack-wind',
  /** Flowers in suggested strip — main rack flower tile chrome. */
  'rack-flower': 'tile-face--card-skin-rack-flower',
}

/**
 * Picks the **card-print** ink for one preview tile: segment ink, with soap / flower overrides
 * so mini tiles track the PDF (black honor dragons, etc.). Flowers / winds / jokers in the strip
 * use `rack-wind` to match **main rack** wind tiles (`--wind-tile-bg`).
 */
export function resolveCardInkForPreviewSlot(
  def: TileDef,
  segmentInk: CardInk,
  ctx?: PreviewLineContext,
): CardInk {
  if (def.cat === 'flower') return 'rack-flower'
  if (def.cat === 'joker' || def.cat === 'wind' || def.cat === 'blank') return 'rack-wind'
  if (def.cat === 'dragon') {
    if (def.dragon === 'soap') return 'navy'
    const mono = ctx?.monoSuitCardPrint
    if (mono === 'navy' || mono === 'green' || mono === 'red') return mono
    if (def.dragon === 'any') return segmentInk === 'navy' ? 'navy' : 'honor'
    if (def.dragon === 'red') return 'red'
    if (def.dragon === 'green') return 'green'
    return 'honor'
  }
  return segmentInk
}

/** Fallback strip (no `titleSegments`): best-effort ink from tile kind alone. */
export function cardInkForGroupBuiltPreviewTile(def: TileDef): CardInk {
  return resolveCardInkForPreviewSlot(def, 'neutral', undefined)
}
