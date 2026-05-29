/** Minimalist (CSS/glyph) tile face themes on `.app[data-tile-graphics]`. */
export const MINIMALIST_TILE_GRAPHICS = [
  'solid-color',
  'light',
  'designer',
  'bakelite',
  'classic',
] as const

/** Illustrative (SVG art) tile face themes. */
export const ILLUSTRATIVE_TILE_GRAPHICS = ['illustrative-classic'] as const

export const TILE_GRAPHICS = [...MINIMALIST_TILE_GRAPHICS, ...ILLUSTRATIVE_TILE_GRAPHICS] as const

export type MinimalistTileGraphics = (typeof MINIMALIST_TILE_GRAPHICS)[number]
export type IllustrativeTileGraphics = (typeof ILLUSTRATIVE_TILE_GRAPHICS)[number]
export type TileGraphics = (typeof TILE_GRAPHICS)[number]

export const TILE_GRAPHICS_LABEL: Record<TileGraphics, string> = {
  classic: 'Ivory',
  'solid-color': 'Prism',
  light: 'Sorbet',
  designer: 'Jewel',
  bakelite: 'Autumn',
  'illustrative-classic': 'Classic',
}

/** Product default: Illustrative Classic SVG tile set. */
export const DEFAULT_TILE_GRAPHICS: TileGraphics = 'illustrative-classic'

export function isTileGraphics(s: string): s is TileGraphics {
  return (TILE_GRAPHICS as readonly string[]).includes(s)
}

export function isMinimalistTileGraphics(g: TileGraphics): g is MinimalistTileGraphics {
  return (MINIMALIST_TILE_GRAPHICS as readonly string[]).includes(g)
}

export function isIllustrativeTileGraphics(g: TileGraphics): g is IllustrativeTileGraphics {
  return (ILLUSTRATIVE_TILE_GRAPHICS as readonly string[]).includes(g)
}

export function defaultMinimalistTileGraphics(saved: TileGraphics): MinimalistTileGraphics {
  return isMinimalistTileGraphics(saved) ? saved : 'solid-color'
}
