import type { DiscardEntry, Seat, TileDef, TileInstance } from './types'
import { tileDefsEqual } from './tileUtils'

/**
 * Distinct tile types currently in the committed discard pile (for blank redemption).
 * Excludes jokers and other blanks; order follows pile appearance (newest last).
 */
export function discardedDefsForBlankExchange(pile: readonly DiscardEntry[]): TileDef[] {
  const out: TileDef[] = []
  for (const { tile } of pile) {
    const def = tile.def
    if (def.cat === 'joker' || def.cat === 'blank') continue
    if (out.some((d) => tileDefsEqual(d, def))) continue
    out.push(def)
  }
  return out
}

/**
 * Exchange a blank in hand for a discarded tile type. Removes one matching discard entry,
 * replaces the blank with a new tile of `chosenDef`, and puts the blank face-up in the pile.
 */
export function applyBlankExchange(
  hand: TileInstance[],
  discardPile: readonly DiscardEntry[],
  blankTileId: string,
  chosenDef: TileDef,
  seat: Seat,
): { hand: TileInstance[]; discardPile: DiscardEntry[] } | null {
  const handIdx = hand.findIndex((t) => t.id === blankTileId && t.def.cat === 'blank')
  if (handIdx < 0) return null
  const eligible = discardedDefsForBlankExchange(discardPile)
  if (!eligible.some((d) => tileDefsEqual(d, chosenDef))) return null

  const takenIdx = discardPile.findIndex(({ tile }) => tileDefsEqual(tile.def, chosenDef))
  const discardWithoutTaken =
    takenIdx >= 0
      ? [...discardPile.slice(0, takenIdx), ...discardPile.slice(takenIdx + 1)]
      : [...discardPile]

  const blankTile = hand[handIdx]!
  const handNext = [...hand]
  handNext[handIdx] = { id: crypto.randomUUID(), def: chosenDef }

  return {
    hand: handNext,
    discardPile: [...discardWithoutTaken, { tile: blankTile, seat }],
  }
}
