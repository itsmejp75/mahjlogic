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
  /** Optional house rule: redeem in hand for any tile already in the discard pile. */
  | { cat: 'blank' }

/** One physical tile in the wall or a rack (stable id for React + drag). */
export type TileInstance = { id: string; def: TileDef }

export type DiscardEntry = { tile: TileInstance; seat: Seat }

/** Hand tiles taken from rack + discarded tile completes meld (pung 2 … sextet 5). */
export type ClaimType = 'pung' | 'kong' | 'quint' | 'sextet'

export type EastExposure = {
  /** All tiles in the meld, matched hand tiles first then the called discard. */
  tiles: TileInstance[]
  claimType: ClaimType
  /** Id of the tile that was claimed from the discard. */
  calledTileId: string
}
