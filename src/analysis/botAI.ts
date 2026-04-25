/**
 * Bot AI — strategic discard and call decisions.
 *
 * Bots don't lock onto a single hand at game start. Each decision re-evaluates
 * the full practice card against the current hand so bots naturally flex toward
 * whatever hand their tiles best support as Charleston and draws reshape their rack.
 *
 * **Open calls** (pung/kong/quint) are also gated in `App.tsx` so a bot’s *combined*
 * table exposures must fit at least one non–closed book line—same structural check
 * the ranker uses (`openClaimMeldsFitSomePracticeLine` / `claimMeldsFitPracticePattern`).
 */

import {
  getRackTilesNotHelpingPattern,
  rankSuggestedHands,
  type RankSuggestedHandsInput,
} from './suggestedHands'
import { PRACTICE_PATTERNS } from '../card/practicePatterns'
import type { DiscardEntry, EastExposure, TileInstance } from '../mahjong/types'
import type { BotExposure, BotSeat } from './types'

// ── Context ───────────────────────────────────────────────────────────────────

export type BotRankContext = {
  /** Bot's current concealed hand (after joker swaps, before discard pick). */
  hand: TileInstance[]
  botSeat: BotSeat
  wall: TileInstance[]
  discardPile: DiscardEntry[]
  eastExposures: ReadonlyArray<{ tiles: TileInstance[] }>
  botExposures: BotExposure[]
}

function buildInput(ctx: BotRankContext): RankSuggestedHandsInput {
  return {
    hand: ctx.hand,
    wallRemaining: ctx.wall.length,
    discards: ctx.discardPile.map((e) => e.tile),
    exposures: ctx.botExposures,
    playerClaimMelds: ctx.botExposures.filter((e) => e.seat === ctx.botSeat),
    eastTableClaimMelds: ctx.eastExposures,
  }
}

// ── Discard selection ─────────────────────────────────────────────────────────

/**
 * Choose the best tile for a bot to discard.
 *
 * Strategy (in priority order):
 * 1. Find the best hand on the practice card (`tilesNeededRough` minimum).
 * 2. Identify which hand tiles are NOT helping that pattern.
 * 3. Discard one of those non-helpers (randomly among equals — avoids telegraphing).
 * 4. If every tile helps, discard a random non-joker (rare mid-game edge case).
 */
export function chooseBotDiscard(ctx: BotRankContext): TileInstance {
  const { hand } = ctx
  const nonJokers = hand.filter((t) => t.def.cat !== 'joker')
  if (nonJokers.length === 0) return hand[0]! // edge case: all jokers

  const ranked = rankSuggestedHands(buildInput(ctx))
  if (ranked.length === 0) {
    return nonJokers[Math.floor(Math.random() * nonJokers.length)]!
  }

  const bestLine = ranked[0]!
  const p = PRACTICE_PATTERNS.find((x) => x.id === bestLine.id)
  if (!p) return nonJokers[Math.floor(Math.random() * nonJokers.length)]!

  // Rack = concealed hand + own exposed tiles (both count toward the 14).
  const ownExposureTiles = ctx.botExposures
    .filter((e) => e.seat === ctx.botSeat)
    .flatMap((e) => e.tiles)
  const rack = [...hand, ...ownExposureTiles]

  const notHelpingRack = getRackTilesNotHelpingPattern(rack, p)
  // Restrict to concealed hand only (can't discard exposed tiles) and exclude jokers.
  const handIds = new Set(hand.map((t) => t.id))
  const nonHelpers = notHelpingRack.filter(
    (t) => handIds.has(t.id) && t.def.cat !== 'joker',
  )

  if (nonHelpers.length > 0) {
    return nonHelpers[Math.floor(Math.random() * nonHelpers.length)]!
  }

  // Every tile contributes — discard a random non-joker.
  return nonJokers[Math.floor(Math.random() * nonJokers.length)]!
}

// ── Call decisions ────────────────────────────────────────────────────────────

/**
 * How many tiles away from the bot's best hand, without/with the candidate tile.
 */
function tilesAway(ctx: BotRankContext): number {
  const ranked = rankSuggestedHands(buildInput(ctx))
  return ranked[0]?.tilesNeededRough ?? 14
}

/**
 * Strategic probability that a bot should call `discard`.
 *
 * - Tile reduces tiles-away  → high probability (bot is chasing a real hand)
 * - Tile is neutral           → low probability (opportunistic / mistake)
 * - Tile increases tiles-away → very low (almost never call)
 *
 * These probabilities are intentionally below 1.0 so bots aren't perfectly
 * optimal and occasionally pass on valid calls (realistic play).
 */
export function botCallStrategicProbability(
  ctx: BotRankContext,
  discard: TileInstance,
): number {
  if (discard.def.cat === 'joker') return 0
  const before = tilesAway(ctx)
  const after = tilesAway({ ...ctx, hand: [...ctx.hand, discard] })
  if (after < before) return 0.82   // tile genuinely advances the hand
  if (after === before) return 0.12 // neutral — occasional opportunistic call
  return 0.04                        // tile makes things worse — almost never
}
