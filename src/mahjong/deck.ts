import type { TileDef, TileInstance } from './types'

function id(): string {
  return crypto.randomUUID()
}

function pushFour(def: TileDef, out: TileInstance[]) {
  for (let i = 0; i < 4; i++) out.push({ id: id(), def })
}

export const AMERICAN_DECK_TILE_COUNT = 152
export const STANDARD_JOKER_COUNT = 8
export const TEN_JOKERS_COUNT = 10

/** House-rule blank tile counts (added to the 152-tile set when enabled). */
export const BLANK_TILE_COUNT_OPTIONS = [2, 4, 6] as const
export type BlankTileCount = (typeof BLANK_TILE_COUNT_OPTIONS)[number]
export const DEFAULT_BLANK_TILE_COUNT: BlankTileCount = 2

export function isBlankTileCount(n: number): n is BlankTileCount {
  return (BLANK_TILE_COUNT_OPTIONS as readonly number[]).includes(n)
}

export function americanDeckTileCount(
  tenJokersEnabled: boolean,
  blankTilesEnabled: boolean,
  blankTileCount: BlankTileCount = DEFAULT_BLANK_TILE_COUNT,
): number {
  return (
    AMERICAN_DECK_TILE_COUNT +
    (tenJokersEnabled ? TEN_JOKERS_COUNT - STANDARD_JOKER_COUNT : 0) +
    (blankTilesEnabled ? blankTileCount : 0)
  )
}

/** Canonical def for sorted-discard tracker + blank tiles in the wall. */
export const BLANK_TILE_DEF = { cat: 'blank' as const }

/** Full American-style 152-tile set; optional 10 jokers and/or blank tiles (2, 4, or 6). */
export function buildAmericanDeck(options?: {
  jokerCount?: number
  blankTileCount?: number
}): TileInstance[] {
  const tiles: TileInstance[] = []

  const suits = ['bam', 'crak', 'dot'] as const
  for (const suit of suits) {
    for (let rank = 1; rank <= 9; rank++) {
      pushFour({ cat: 'suit', suit, rank }, tiles)
    }
  }

  const winds = ['E', 'S', 'W', 'N'] as const
  for (const wind of winds) {
    pushFour({ cat: 'wind', wind }, tiles)
  }

  const dragons = ['red', 'green', 'soap'] as const
  for (const dragon of dragons) {
    pushFour({ cat: 'dragon', dragon }, tiles)
  }

  for (let flower = 1; flower <= 8; flower++) {
    tiles.push({ id: id(), def: { cat: 'flower', flower } })
  }

  const jokerCount = options?.jokerCount ?? STANDARD_JOKER_COUNT
  for (let j = 0; j < jokerCount; j++) {
    tiles.push({ id: id(), def: { cat: 'joker' } })
  }

  const blankCount = options?.blankTileCount ?? 0
  for (let b = 0; b < blankCount; b++) {
    tiles.push({ id: id(), def: BLANK_TILE_DEF })
  }

  return tiles
}

export function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/** Dealer (East) starts with 14 tiles; rest stay in the wall. */
export function dealEastHand(wall: TileInstance[], handSize = 14) {
  const hand = wall.slice(0, handSize)
  const rest = wall.slice(handSize)
  return { hand, wall: rest }
}

const EAST_COUNT = 14
const SIDE_COUNT = 13

/**
 * Opening deal: East 14, South/West/North 13 each, remainder in wall (99 tiles).
 * Order matches counterclockwise seats after East.
 */
export function dealOpeningFour(deck: TileInstance[]) {
  let i = 0
  const east = deck.slice(i, (i += EAST_COUNT))
  const south = deck.slice(i, (i += SIDE_COUNT))
  const west = deck.slice(i, (i += SIDE_COUNT))
  const north = deck.slice(i, (i += SIDE_COUNT))
  const wall = deck.slice(i)
  return { east, south, west, north, wall }
}
