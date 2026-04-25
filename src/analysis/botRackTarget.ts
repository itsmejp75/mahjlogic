import type { TileInstance } from '../mahjong/types'
import { summarizeRackTowardWin, type RankSuggestedHandsInput } from './suggestedHands'
import type { BotExposure } from './types'

const BOT_SEAT_ORDER = ['South', 'West', 'North'] as const

/**
 * The **least tiles away** and **closest book line** for a bot at `botIndex`, using
 * the same `summarizeRackTowardWin` model as the Suggested hands ranker (open claims
 * + that seat’s melds + table visibility). For debugging: log this when investigating
 * whether a bot’s exposures plausibly match a single card hand.
 */
export function botLeastTilesAndClosestLine(
  hand: TileInstance[],
  wallRemaining: number,
  discards: TileInstance[],
  allBotExposures: BotExposure[],
  eastTableClaimMelds: ReadonlyArray<{ tiles: TileInstance[] }>,
  botIndex: 0 | 1 | 2,
) {
  const seat = BOT_SEAT_ORDER[botIndex]!
  const playerClaimMelds = allBotExposures.filter((e) => e.seat === seat)
  const input: RankSuggestedHandsInput = {
    hand,
    wallRemaining,
    discards,
    exposures: allBotExposures,
    playerClaimMelds,
    eastTableClaimMelds,
  }
  return summarizeRackTowardWin(input)
}
