import type { DiscardEntry, TileDef, TileInstance } from './types'

/** How many committed discards in `pile` match `def` (jokers / flowers use `tileDefsEqual` rules). */
export function countDiscardEntriesMatchingDef(
  pile: readonly DiscardEntry[],
  def: TileDef,
): number {
  let n = 0
  for (const e of pile) {
    if (tileDefsEqual(e.tile.def, def)) n += 1
  }
  return n
}

/** True when `a` and `b` represent the exact same tile definition. */
export function tileDefsEqual(a: TileDef, b: TileDef): boolean {
  if (a.cat !== b.cat) return false
  switch (a.cat) {
    case 'suit': {
      const bb = b as Extract<TileDef, { cat: 'suit' }>
      return a.suit === bb.suit && a.rank === bb.rank
    }
    case 'wind':
      return a.wind === (b as Extract<TileDef, { cat: 'wind' }>).wind
    case 'dragon': {
      const bd = (b as Extract<TileDef, { cat: 'dragon' }>).dragon
      if (a.dragon === 'any' || bd === 'any') return false
      return a.dragon === bd
    }
    case 'flower':
      return true // all flowers are identical in NMJL regardless of number
    case 'joker':
      return true
    case 'blank':
      return true
  }
}

/**
 * Returns tiles from `hand` whose def exactly equals `target`.
 * Jokers in hand are excluded (they are not callers; joker-sub support comes later).
 * Returns [] when `target` is a joker (jokers cannot be discarded or called).
 */
export function findExactMatches(hand: TileInstance[], target: TileDef): TileInstance[] {
  if (target.cat === 'joker' || target.cat === 'blank') return []
  return hand.filter(
    (t) => t.def.cat !== 'joker' && t.def.cat !== 'blank' && tileDefsEqual(t.def, target),
  )
}

// ── Rack sort ────────────────────────────────────────────────────────────────

export type SortMode = 'suit' | 'number'

// Both sorts share the same tail: White Dragon, Green Dragon, Red Dragon, N, E, W, S
const DRAGON_TAIL: Record<string, number> = { soap: 0, green: 1, red: 2, any: 3 }
const WIND_TAIL: Record<string, number>   = { N: 0, E: 1, W: 2, S: 3 }
const SUIT_NUM_IDX: Record<string, number> = { dot: 0, bam: 1, crak: 2 }

/**
 * Sort 1 — by suit: F, J, Dots 1-9, Bams 1-9, Craks 1-9,
 * then White Dragon / Green Dragon / Red Dragon, then N E W S.
 */
function suitSortKey(def: TileDef): number {
  switch (def.cat) {
    case 'flower': return def.flower                              // 1–8
    case 'joker':  return 100
    case 'blank':  return 105
    case 'suit':   return 200 + SUIT_NUM_IDX[def.suit]! * 10 + def.rank
    case 'dragon': return 500 + DRAGON_TAIL[def.dragon]!
    case 'wind':   return 600 + WIND_TAIL[def.wind]!
  }
}

/**
 * Sort 2 — by number: F, J, all 1s (Dot/Bam/Crak), all 2s, …, all 9s,
 * then White Dragon / Green Dragon / Red Dragon, then N E W S.
 */
function numberSortKey(def: TileDef): number {
  switch (def.cat) {
    case 'flower': return def.flower                              // 1–8
    case 'joker':  return 100
    case 'blank':  return 105
    case 'suit':   return 200 + def.rank * 10 + SUIT_NUM_IDX[def.suit]!
    case 'dragon': return 500 + DRAGON_TAIL[def.dragon]!
    case 'wind':   return 600 + WIND_TAIL[def.wind]!
  }
}

/** Return a sorted copy of `hand`. Does not mutate the original array. */
export function sortTiles(hand: TileInstance[], mode: SortMode): TileInstance[] {
  const key = mode === 'suit' ? suitSortKey : numberSortKey
  return [...hand].sort((a, b) => key(a.def) - key(b.def))
}
