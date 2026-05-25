import type { TileDef } from './types'
import type { Suit } from './types'

/** Suit spelled out for main-rack / staged-discard stacked glyph layout. */
export function tileSuitRackWord(suit: Suit): 'DOT' | 'BAM' | 'CRAK' {
  switch (suit) {
    case 'dot':
      return 'DOT'
    case 'bam':
      return 'BAM'
    case 'crak':
      return 'CRAK'
  }
}

/** Short text on the tile face (readable without image assets yet). */
export function tileShortLabel(def: TileDef): string {
  switch (def.cat) {
    case 'suit':
      return `${def.rank}${def.suit === 'bam' ? 'B' : def.suit === 'dot' ? 'D' : 'C'}`
    case 'wind':
      return def.wind
    case 'dragon':
      if (def.dragon === 'any') return 'D'
      return def.dragon === 'red' ? 'R' : def.dragon === 'green' ? 'G' : '0'
    case 'flower':
      return 'F'
    case 'joker':
      return 'J'
    case 'blank':
      return 'B'
  }
}

export function tileAriaLabel(def: TileDef): string {
  switch (def.cat) {
    case 'suit': {
      const suit =
        def.suit === 'bam' ? 'bamboo' : def.suit === 'dot' ? 'dot' : 'character'
      return `${def.rank} of ${suit}`
    }
    case 'wind':
      return `${def.wind === 'E' ? 'East' : def.wind === 'S' ? 'South' : def.wind === 'W' ? 'West' : 'North'} wind`
    case 'dragon':
      if (def.dragon === 'any') return 'any dragon'
      return def.dragon === 'soap'
        ? 'soap (white dragon)'
        : `${def.dragon} dragon`
    case 'flower':
      return `flower ${def.flower}`
    case 'joker':
      return 'joker'
    case 'blank':
      return 'blank tile'
  }
}
