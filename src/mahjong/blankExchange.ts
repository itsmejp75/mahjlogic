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

export type PlayerBlankExchangeRoundSlice = {
  mainPhase: string
  hand: TileInstance[]
  discardPile: readonly DiscardEntry[]
  pendingEastDiscardTile: TileInstance | null
  pendingEastDiscardIdx: number | null
}

/**
 * Player blank exchange (hand or staged discard slot). Preserves prior attribution of the
 * given-up blank as seat `east` (UI bottom rack). Returns null when the swap is illegal.
 */
export function applyPlayerBlankExchange(
  r: PlayerBlankExchangeRoundSlice,
  blankTileId: string,
  chosenDef: TileDef,
): (PlayerBlankExchangeRoundSlice & {
  drawnTileId: string
  selectedHandTileId: null
}) | null {
  if (r.mainPhase !== 'east-discard') return null
  const eligible = discardedDefsForBlankExchange(r.discardPile)
  if (!eligible.some((d) => tileDefsEqual(d, chosenDef))) return null

  const newTile: TileInstance = { id: crypto.randomUUID(), def: chosenDef }
  const takenIdx = r.discardPile.findIndex(({ tile }) => tileDefsEqual(tile.def, chosenDef))
  const discardWithoutTaken =
    takenIdx >= 0
      ? [...r.discardPile.slice(0, takenIdx), ...r.discardPile.slice(takenIdx + 1)]
      : [...r.discardPile]

  const handIdx = r.hand.findIndex((t) => t.id === blankTileId && t.def.cat === 'blank')
  if (handIdx >= 0) {
    const blankTile = r.hand[handIdx]!
    const handNext = [...r.hand]
    handNext[handIdx] = newTile
    return {
      ...r,
      hand: handNext,
      discardPile: [...discardWithoutTaken, { tile: blankTile, seat: 'east' }],
      drawnTileId: newTile.id,
      selectedHandTileId: null,
    }
  }
  if (
    r.pendingEastDiscardTile?.id === blankTileId &&
    r.pendingEastDiscardTile.def.cat === 'blank'
  ) {
    const blankTile = r.pendingEastDiscardTile
    const insertIdx = Math.min(r.pendingEastDiscardIdx ?? r.hand.length, r.hand.length)
    const handNext = [...r.hand]
    handNext.splice(insertIdx, 0, newTile)
    return {
      ...r,
      hand: handNext,
      discardPile: [...discardWithoutTaken, { tile: blankTile, seat: 'east' }],
      pendingEastDiscardTile: null,
      pendingEastDiscardIdx: null,
      drawnTileId: newTile.id,
      selectedHandTileId: null,
    }
  }
  return null
}
