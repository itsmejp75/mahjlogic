import type { DiscardEntry, TileDef } from './types'
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
