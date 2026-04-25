export type Suit = 'bam' | 'crak' | 'dot'

export type Seat = 'east' | 'south' | 'west' | 'north'

export type Wind = 'E' | 'S' | 'W' | 'N'

/** `any` is preview-only: card shows generic “D” (any dragon); never appears on physical tiles. */
export type Dragon = 'red' | 'green' | 'soap' | 'any'

/** What is printed on the tile (American / NMJL-style set). */
export type TileDef =
  | { cat: 'suit'; suit: Suit; rank: number }
  | { cat: 'wind'; wind: Wind }
  | { cat: 'dragon'; dragon: Dragon }
  | { cat: 'flower'; flower: number }
  | { cat: 'joker' }

/** One physical tile in the wall or a rack (stable id for React + drag). */
export type TileInstance = { id: string; def: TileDef }

export type DiscardEntry = { tile: TileInstance; seat: Seat }

export type ClaimType = 'pung' | 'kong' | 'quint'

export type EastExposure = {
  /** All tiles in the meld, matched hand tiles first then the called discard. */
  tiles: TileInstance[]
  claimType: ClaimType
  /** Id of the tile that was claimed from the discard. */
  calledTileId: string
}
