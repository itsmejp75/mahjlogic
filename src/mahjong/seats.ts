import type { FourHands } from './charleston'
import type { Seat, TileInstance } from './types'

export const COMPASS_SEATS: readonly Seat[] = ['east', 'south', 'west', 'north'] as const

export type BotSlotSeats = [Seat, Seat, Seat]

/** Default bot UI slots (right / across / left) when the player is East. */
export const DEFAULT_BOT_SLOT_SEATS: BotSlotSeats = ['south', 'west', 'north']

export function seatLabel(seat: Seat): string {
  return seat.charAt(0).toUpperCase() + seat.slice(1)
}

export function playerYouLabel(playerSeat: Seat): string {
  return `You (${seatLabel(playerSeat)})`
}

/** Next compass seat in play order (East → South → West → North). */
export function nextCompassSeat(from: Seat): Seat {
  const i = COMPASS_SEATS.indexOf(from)
  return COMPASS_SEATS[(i + 1) % 4]!
}

/** The three compass seats after `from`, in turn order (not including `from`). */
export function compassSeatsAfter(from: Seat): [Seat, Seat, Seat] {
  return [nextCompassSeat(from), nextCompassSeat(nextCompassSeat(from)), nextCompassSeat(nextCompassSeat(nextCompassSeat(from)))]
}

/** Compass seats at the three bot UI slots, CCW from the player. */
export function botSlotSeatsForPlayer(playerSeat: Seat): BotSlotSeats {
  return compassSeatsAfter(playerSeat)
}

export function pickRandomPlayerSeat(): Seat {
  return COMPASS_SEATS[Math.floor(Math.random() * COMPASS_SEATS.length)]!
}

export function botIndexForCompassSeat(botSlotSeats: BotSlotSeats, seat: Seat): 0 | 1 | 2 | null {
  const idx = botSlotSeats.indexOf(seat)
  return idx >= 0 ? (idx as 0 | 1 | 2) : null
}

/** Bot indices in full-table compass order (East → …), skipping the player seat. */
export function botIndicesInCompassPlayOrder(
  playerSeat: Seat,
  botSlotSeats: BotSlotSeats,
): (0 | 1 | 2)[] {
  const out: (0 | 1 | 2)[] = []
  let cur: Seat = 'east'
  for (let i = 0; i < 4; i++) {
    if (cur !== playerSeat) {
      const idx = botIndexForCompassSeat(botSlotSeats, cur)
      if (idx != null) out.push(idx)
    }
    cur = nextCompassSeat(cur)
  }
  return out
}

/** Bot indices after the player discards — next compass seats that are bots. */
export function botIndicesAfterPlayerDiscard(
  playerSeat: Seat,
  botSlotSeats: BotSlotSeats,
): (0 | 1 | 2)[] {
  const out: (0 | 1 | 2)[] = []
  for (const seat of compassSeatsAfter(playerSeat)) {
    if (seat === playerSeat) continue
    const idx = botIndexForCompassSeat(botSlotSeats, seat)
    if (idx != null) out.push(idx)
  }
  return out
}

/** Bot indices after `afterSeat` in compass order (for claim windows / skip chains). */
export function botIndicesAfterCompassSeat(
  afterSeat: Seat,
  playerSeat: Seat,
  botSlotSeats: BotSlotSeats,
): (0 | 1 | 2)[] {
  const out: (0 | 1 | 2)[] = []
  for (const seat of compassSeatsAfter(afterSeat)) {
    if (seat === playerSeat) continue
    const idx = botIndexForCompassSeat(botSlotSeats, seat)
    if (idx != null) out.push(idx)
  }
  return out
}

export function assignOpeningHands(
  deal: FourHands,
  randomSeatEnabled: boolean,
): {
  hand: TileInstance[]
  bots: [TileInstance[], TileInstance[], TileInstance[]]
  botSlotSeats: BotSlotSeats
  playerSeat: Seat
} {
  const playerSeat = randomSeatEnabled ? pickRandomPlayerSeat() : 'east'
  const botSlotSeats = botSlotSeatsForPlayer(playerSeat)
  return {
    hand: deal[playerSeat],
    bots: [deal[botSlotSeats[0]], deal[botSlotSeats[1]], deal[botSlotSeats[2]]],
    botSlotSeats,
    playerSeat,
  }
}

export function toFourHands(
  hand: TileInstance[],
  bots: [TileInstance[], TileInstance[], TileInstance[]],
  playerSeat: Seat,
  botSlotSeats: BotSlotSeats,
): FourHands {
  const four: FourHands = { east: [], south: [], west: [], north: [] }
  four[playerSeat] = hand
  four[botSlotSeats[0]] = bots[0]
  four[botSlotSeats[1]] = bots[1]
  four[botSlotSeats[2]] = bots[2]
  return four
}

export function handsFromFourHands(
  four: FourHands,
  playerSeat: Seat,
  botSlotSeats: BotSlotSeats,
): { hand: TileInstance[]; bots: [TileInstance[], TileInstance[], TileInstance[]] } {
  return {
    hand: four[playerSeat],
    bots: [four[botSlotSeats[0]], four[botSlotSeats[1]], four[botSlotSeats[2]]],
  }
}

/** Rotate absolute compass hands so the human's seat occupies `east` (Charleston exchange convention). */
export function fourHandsWithPlayerAsEast(four: FourHands, playerSeat: Seat): FourHands {
  const south = nextCompassSeat(playerSeat)
  const west = nextCompassSeat(south)
  const north = nextCompassSeat(west)
  return {
    east: four[playerSeat],
    south: four[south],
    west: four[west],
    north: four[north],
  }
}

/** Inverse of `fourHandsWithPlayerAsEast` — restore absolute compass seats. */
export function fourHandsFromPlayerAsEast(four: FourHands, playerSeat: Seat): FourHands {
  const south = nextCompassSeat(playerSeat)
  const west = nextCompassSeat(south)
  const north = nextCompassSeat(west)
  const out: FourHands = { east: [], south: [], west: [], north: [] }
  out[playerSeat] = four.east
  out[south] = four.south
  out[west] = four.west
  out[north] = four.north
  return out
}
