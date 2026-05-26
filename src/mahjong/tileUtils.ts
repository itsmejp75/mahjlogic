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

/** Rack sort: bams, then craks, then dots (within each rank group for number sort). */
const SUIT_NUM_IDX: Record<string, number> = { bam: 0, crak: 1, dot: 2 }
/** Dragons after numbered tiles: green (G), red (R), soap (0). */
const DRAGON_TAIL: Record<string, number> = { green: 0, red: 1, soap: 2, any: 3 }
/** Winds last: North, East, West, South. */
const WIND_TAIL: Record<string, number> = { N: 0, E: 1, W: 2, S: 3 }

const SORT_JOKER = 0
const SORT_BLANK = 5
const SORT_FLOWER_BASE = 10
const SORT_SUIT_BASE = 100
const SORT_DRAGON_BASE = 500
const SORT_WIND_BASE = 600

/**
 * Sort 1 — by suit: J, F, Bams 1–9, Craks 1–9, Dots 1–9, G R 0, N E W S.
 */
function suitSortKey(def: TileDef): number {
  switch (def.cat) {
    case 'joker':  return SORT_JOKER
    case 'blank':  return SORT_BLANK
    case 'flower': return SORT_FLOWER_BASE + def.flower
    case 'suit':   return SORT_SUIT_BASE + SUIT_NUM_IDX[def.suit]! * 10 + def.rank
    case 'dragon': return SORT_DRAGON_BASE + DRAGON_TAIL[def.dragon]!
    case 'wind':   return SORT_WIND_BASE + WIND_TAIL[def.wind]!
  }
}

/**
 * Sort 2 — by number: J, F, all 1s (Bam/Crak/Dot), …, all 9s, G R 0, N E W S.
 */
function numberSortKey(def: TileDef): number {
  switch (def.cat) {
    case 'joker':  return SORT_JOKER
    case 'blank':  return SORT_BLANK
    case 'flower': return SORT_FLOWER_BASE + def.flower
    case 'suit':   return SORT_SUIT_BASE + def.rank * 10 + SUIT_NUM_IDX[def.suit]!
    case 'dragon': return SORT_DRAGON_BASE + DRAGON_TAIL[def.dragon]!
    case 'wind':   return SORT_WIND_BASE + WIND_TAIL[def.wind]!
  }
}

/** Return a sorted copy of `hand`. Does not mutate the original array. */
export function sortTiles(hand: TileInstance[], mode: SortMode): TileInstance[] {
  const key = mode === 'suit' ? suitSortKey : numberSortKey
  return [...hand].sort((a, b) => key(a.def) - key(b.def))
}
