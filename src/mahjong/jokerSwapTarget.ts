import type { BotExposure, BotSeat } from '../analysis/types'
import type { EastExposure } from './types'
import type { TileDef, TileInstance } from './types'
import { tileDefsEqual } from './tileUtils'

/** Clockwise from East: South, West, North, then East’s own exposures. */
const JOKER_SWAP_SEAT_ORDER: BotSeat[] = ['South', 'West', 'North']

function firstSwappableJokerInMeld(
  tiles: TileInstance[],
  naturalDef: TileDef,
): TileInstance | null {
  const rep = tiles.find((t) => t.def.cat !== 'joker')
  if (!rep || !tileDefsEqual(rep.def, naturalDef)) return null
  const joker = tiles.find((t) => t.def.cat === 'joker')
  return joker ?? null
}

export type JokerSwapTargetPick = {
  rack: 'bot' | 'east'
  exposureIdx: number
  jokerTileId: string
}

/** Drop-zone id prefix for bot exposure melds (drag-to-exposure joker swap). */
export const BOT_EXPOSURE_SWAP_PREFIX = 'bot-exp-swap-'
export const BOT_SEAT_SWAP_PREFIX = 'bot-seat-swap-'

/** Encode / decode the global `botExposures` index into a DnD drop-zone id. */
export function botExposureSwapDropId(globalIdx: number): string {
  return `${BOT_EXPOSURE_SWAP_PREFIX}${globalIdx}`
}
export function parseBotExposureSwapDropId(oid: string): number | null {
  if (!oid.startsWith(BOT_EXPOSURE_SWAP_PREFIX)) return null
  const n = parseInt(oid.slice(BOT_EXPOSURE_SWAP_PREFIX.length), 10)
  return isNaN(n) ? null : n
}

/** Seat-wide drop-zone id (drop anywhere on a bot's exposure rail cell). */
export function botSeatSwapDropId(seat: BotSeat): string {
  return `${BOT_SEAT_SWAP_PREFIX}${seat.toLowerCase()}`
}
export function parseBotSeatSwapDropId(oid: string): BotSeat | null {
  if (!oid.startsWith(BOT_SEAT_SWAP_PREFIX)) return null
  const raw = oid.slice(BOT_SEAT_SWAP_PREFIX.length).toLowerCase()
  if (raw === 'south') return 'South'
  if (raw === 'west') return 'West'
  if (raw === 'north') return 'North'
  return null
}

/**
 * Finds a swap target within a specific bot exposure meld (for drag-to-exposure).
 * Returns null if the exposure has no joker or the natural tile doesn't match.
 */
export function findJokerSwapTargetAtExposure(
  botExposures: BotExposure[],
  exposureIdx: number,
  naturalDef: TileDef,
): JokerSwapTargetPick | null {
  const exp = botExposures[exposureIdx]
  if (!exp) return null
  const joker = firstSwappableJokerInMeld(exp.tiles, naturalDef)
  if (!joker) return null
  return { rack: 'bot', exposureIdx, jokerTileId: joker.id }
}

/** Finds the first legal joker swap target in a specific bot seat's exposures. */
export function findJokerSwapTargetAtSeat(
  botExposures: BotExposure[],
  seat: BotSeat,
  naturalDef: TileDef,
): JokerSwapTargetPick | null {
  for (let i = 0; i < botExposures.length; i++) {
    const exp = botExposures[i]!
    if (exp.seat !== seat) continue
    const joker = firstSwappableJokerInMeld(exp.tiles, naturalDef)
    if (joker) return { rack: 'bot', exposureIdx: i, jokerTileId: joker.id }
  }
  return null
}

/**
 * Picks one exposed joker East may reclaim with `naturalDef`, preferring earlier seats in turn order.
 */
export function findNextJokerSwapTarget(
  botExposures: BotExposure[],
  eastExposures: EastExposure[],
  naturalDef: TileDef,
): JokerSwapTargetPick | null {
  for (const seat of JOKER_SWAP_SEAT_ORDER) {
    for (let i = 0; i < botExposures.length; i++) {
      const exp = botExposures[i]!
      if (exp.seat !== seat) continue
      const joker = firstSwappableJokerInMeld(exp.tiles, naturalDef)
      if (joker) return { rack: 'bot', exposureIdx: i, jokerTileId: joker.id }
    }
  }
  for (let ei = 0; ei < eastExposures.length; ei++) {
    const exp = eastExposures[ei]!
    const joker = firstSwappableJokerInMeld(exp.tiles, naturalDef)
    if (joker) return { rack: 'east', exposureIdx: ei, jokerTileId: joker.id }
  }
  return null
}
