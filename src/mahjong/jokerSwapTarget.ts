import type { BotExposure, BotSeat } from '../analysis/types'
import type { EastExposure } from './types'
import type { TileDef, TileInstance } from './types'
import { BLANK_EXCHANGE_DROP_ID } from './jokerSwapIds'
import { tileDefsEqual } from './tileUtils'

/**
 * Compass play order for bot exposure rows. When the player is not East, a bot sits East —
 * that seat must be included or joker swaps against East’s exposures never resolve.
 * After bots, {@link findNextJokerSwapTarget} also checks the player’s own East exposures.
 */
const JOKER_SWAP_SEAT_ORDER: BotSeat[] = ['East', 'South', 'West', 'North']

/**
 * Tile type that every joker in this exposure represents: all non-jokers in the meld must match.
 * Returns null if there are no naturals or they disagree (invalid meld for swap).
 */
export function representativeDefInExposedMeld(tiles: TileInstance[]): TileDef | null {
  const naturals = tiles.filter((t) => t.def.cat !== 'joker')
  if (naturals.length === 0) return null
  const first = naturals[0]!.def
  for (let i = 1; i < naturals.length; i++) {
    if (!tileDefsEqual(naturals[i]!.def, first)) return null
  }
  return first
}

/**
 * On your turn, any exposed joker in the meld may be redeemed with a natural matching what that
 * joker represents (the meld’s like naturals).
 */
function jokersSwappableWithNaturalInMeld(
  tiles: TileInstance[],
  naturalDef: TileDef,
): TileInstance[] {
  const rep = representativeDefInExposedMeld(tiles)
  if (!rep || !tileDefsEqual(naturalDef, rep)) return []
  return tiles.filter((t) => t.def.cat === 'joker')
}

function firstSwappableJokerInMeld(
  tiles: TileInstance[],
  naturalDef: TileDef,
): TileInstance | null {
  const jokers = jokersSwappableWithNaturalInMeld(tiles, naturalDef)
  return jokers[0] ?? null
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
  if (raw === 'east') return 'East'
  if (raw === 'south') return 'South'
  if (raw === 'west') return 'West'
  if (raw === 'north') return 'North'
  return null
}

/** Drop-zone id prefix for East’s own exposure melds (same joker-swap as bot rows). */
export const EAST_EXPOSURE_SWAP_PREFIX = 'east-exp-swap-'

export function eastExposureSwapDropId(exposureIdx: number): string {
  return `${EAST_EXPOSURE_SWAP_PREFIX}${exposureIdx}`
}

export function parseEastExposureSwapDropId(oid: string): number | null {
  if (!oid.startsWith(EAST_EXPOSURE_SWAP_PREFIX)) return null
  const n = parseInt(oid.slice(EAST_EXPOSURE_SWAP_PREFIX.length), 10)
  return isNaN(n) ? null : n
}

/** Single drop id for the whole East exposure rail (swap anywhere on your own rack). */
export const EAST_SEAT_SWAP_ID = 'east-joker-swap-seat'

export type TopBandDropFrame = 'joker-swap' | 'blank-exchange'

/** Map the active dnd-kit `over` id to the yellow top-band drop frame (bot exposures vs sorted tray). */
export function topBandDropFrameForOverId(overId: string | null | undefined): TopBandDropFrame | null {
  if (!overId) return null
  if (overId === BLANK_EXCHANGE_DROP_ID) return 'blank-exchange'
  if (
    overId === EAST_SEAT_SWAP_ID ||
    parseBotSeatSwapDropId(overId) != null ||
    parseBotExposureSwapDropId(overId) != null ||
    parseEastExposureSwapDropId(overId) != null
  ) {
    return 'joker-swap'
  }
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

/** Redeem a joker in your own (East) exposure. */
export function findJokerSwapTargetAtEastExposure(
  eastExposures: EastExposure[],
  exposureIdx: number,
  naturalDef: TileDef,
): JokerSwapTargetPick | null {
  const exp = eastExposures[exposureIdx]
  if (!exp) return null
  const joker = firstSwappableJokerInMeld(exp.tiles, naturalDef)
  if (!joker) return null
  return { rack: 'east', exposureIdx, jokerTileId: joker.id }
}

/** First legal joker swap on your own rack (seat-wide drop). */
export function findJokerSwapTargetInEastRack(
  eastExposures: EastExposure[],
  naturalDef: TileDef,
): JokerSwapTargetPick | null {
  for (let i = 0; i < eastExposures.length; i++) {
    const p = findJokerSwapTargetAtEastExposure(eastExposures, i, naturalDef)
    if (p) return p
  }
  return null
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

/** First legal bot joker swap in compass order: East, South, West, North. */
export function findNextBotJokerSwapTarget(
  botExposures: BotExposure[],
  naturalDef: TileDef,
): JokerSwapTargetPick | null {
  for (const seat of JOKER_SWAP_SEAT_ORDER) {
    const pick = findJokerSwapTargetAtSeat(botExposures, seat, naturalDef)
    if (pick) return pick
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

function uniqueNaturalDefs(tiles: TileInstance[]): TileDef[] {
  const out: TileDef[] = []
  for (const t of tiles) {
    if (t.def.cat === 'joker') continue
    if (out.some((d) => tileDefsEqual(d, t.def))) continue
    out.push(t.def)
  }
  return out
}

/**
 * Inverse of `collectSwappableJokerTileIds`: each hand tile id whose def matches the tile type of
 * some exposed meld that contains a joker (bot rows and East’s own exposures) — naturals you can
 * trade for an exposed joker on your turn.
 *
 * `pendingDiscard` — tile staged in the discard tray (out of `hand`) is included so the joker
 * train stays on it until the discard is committed.
 */
export function collectHandTileIdsSwappableForJokers(
  hand: TileInstance[],
  botExposures: BotExposure[],
  eastExposures: EastExposure[],
  pendingDiscard?: TileInstance | null,
): Set<string> {
  const ids = new Set<string>()

  const addIfSwappable = (tile: TileInstance) => {
    if (tile.def.cat === 'joker') return
    const swappable =
      botExposures.some(
        (exp) => jokersSwappableWithNaturalInMeld(exp.tiles, tile.def).length > 0,
      ) ||
      eastExposures.some(
        (exp) => jokersSwappableWithNaturalInMeld(exp.tiles, tile.def).length > 0,
      )
    if (swappable) ids.add(tile.id)
  }

  for (const handTile of hand) addIfSwappable(handTile)
  if (pendingDiscard) addIfSwappable(pendingDiscard)
  return ids
}

/**
 * Every exposed joker the player may redeem **on their turn** with a natural currently in hand
 * (or staged for discard): each joker sits in a meld whose naturals all match that tile type —
 * bot rows and your own East exposures.
 */
export function collectSwappableJokerTileIds(
  hand: TileInstance[],
  pendingEastDiscard: TileInstance | null,
  botExposures: BotExposure[],
  eastExposures: EastExposure[],
): Set<string> {
  const fromPlayer: TileInstance[] = hand.filter((t) => t.def.cat !== 'joker')
  if (pendingEastDiscard && pendingEastDiscard.def.cat !== 'joker') {
    fromPlayer.push(pendingEastDiscard)
  }
  const defs = uniqueNaturalDefs(fromPlayer)
  const ids = new Set<string>()
  for (const naturalDef of defs) {
    for (const exp of botExposures) {
      for (const joker of jokersSwappableWithNaturalInMeld(exp.tiles, naturalDef)) {
        ids.add(joker.id)
      }
    }
    for (const exp of eastExposures) {
      for (const joker of jokersSwappableWithNaturalInMeld(exp.tiles, naturalDef)) {
        ids.add(joker.id)
      }
    }
  }
  return ids
}
