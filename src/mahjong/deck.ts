import type { TileDef, TileInstance } from './types'

function id(): string {
  return crypto.randomUUID()
}

function pushFour(def: TileDef, out: TileInstance[]) {
  for (let i = 0; i < 4; i++) out.push({ id: id(), def })
}

/** Full American-style 152-tile set used for practice tables. */
export function buildAmericanDeck(): TileInstance[] {
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

  for (let j = 0; j < 8; j++) {
    tiles.push({ id: id(), def: { cat: 'joker' } })
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
