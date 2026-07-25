import { BLANK_TILE_DEF } from './deck'
import type { TileInstance } from './types'

/** Sorted B/C/D band width in tile-width units (suit label 1.75 + 12 ranks). */
export const DISCARD_TRACKER_SORTED_BAND_COLS = 13.75

/** Slot count for each sorted discard tracker row (leading suit label + 12 tiles). */
export const DISCARD_TRACKER_SORTED_ROW_SLOTS = 13

/** Row 1 of sorted discard: bams 1–9, green dragon (G), North, South. */
export const SORTED_DISCARD_ROW1_TILES: readonly TileInstance[] = [
  ...([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((rank) => ({
    id: `sorted-discard-r1-b${rank}`,
    def: { cat: 'suit' as const, suit: 'bam' as const, rank },
  })),
  {
    id: 'sorted-discard-r1-green',
    def: { cat: 'dragon' as const, dragon: 'green' as const },
  },
  {
    id: 'sorted-discard-r1-n',
    def: { cat: 'wind' as const, wind: 'N' },
  },
  {
    id: 'sorted-discard-r1-s',
    def: { cat: 'wind' as const, wind: 'S' },
  },
]

/** Row 2 of sorted discard: dots 1–9, soap (0), East, West. */
export const SORTED_DISCARD_ROW2_TILES: readonly TileInstance[] = [
  ...([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((rank) => ({
    id: `sorted-discard-r2-d${rank}`,
    def: { cat: 'suit' as const, suit: 'dot' as const, rank },
  })),
  {
    id: 'sorted-discard-r2-soap',
    def: { cat: 'dragon' as const, dragon: 'soap' as const },
  },
  {
    id: 'sorted-discard-r2-e',
    def: { cat: 'wind' as const, wind: 'E' },
  },
  {
    id: 'sorted-discard-r2-w',
    def: { cat: 'wind' as const, wind: 'W' },
  },
]

/** Row 3 of sorted discard: craks 1–9, red dragon (R), flower (F), blank (B) or joker (J) when blanks off. */
export const SORTED_DISCARD_ROW3_TILES: readonly TileInstance[] = [
  ...([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((rank) => ({
    id: `sorted-discard-r3-c${rank}`,
    def: { cat: 'suit' as const, suit: 'crak' as const, rank },
  })),
  {
    id: 'sorted-discard-r3-red',
    def: { cat: 'dragon' as const, dragon: 'red' as const },
  },
  {
    id: 'sorted-discard-r3-f',
    def: { cat: 'flower' as const, flower: 1 },
  },
  {
    id: 'sorted-discard-r3-blank',
    def: BLANK_TILE_DEF,
  },
]

/** Every natural/joker def shown on the sorted tracker (blank slot reads as joker when blanks off). */
export function sortedDiscardTrackerPickableDefs(blankTilesEnabled: boolean) {
  const defs = [
    ...SORTED_DISCARD_ROW1_TILES.map((t) => t.def),
    ...SORTED_DISCARD_ROW2_TILES.map((t) => t.def),
    ...SORTED_DISCARD_ROW3_TILES.map((t) =>
      t.def.cat === 'blank' && !blankTilesEnabled ? ({ cat: 'joker' as const }) : t.def,
    ),
  ]
  return defs
}
