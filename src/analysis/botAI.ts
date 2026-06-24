/**
 * Bot AI — strategic discard, Charleston pass, joker-swap, and call decisions.
 *
 * Bots don’t lock onto a single hand at game start. Each decision re-evaluates
 * the practice card against the current hand so they flex as Charleston and
 * wall draws change their rack.
 *
 * **Difficulty (behavioral design)**
 * - **Novice** (`easy`) — Weaker at pattern work: more random / wasteful discards, weaker
 *   call discipline, joker-swap and Charleston passes are noisier (more mistakes).
 *   Good for learning without punishing “perfect-robot” pressure.
 * - **Advanced** (`normal`) — Solid default: reads the hand against the book and the visible
 *   table; mostly catches joker-swap on the *second* pass of the per-turn swap
 *   search (a human “I missed it, then I saw it”); Charleston blends strategy with
 *   a bit of variety.
 * - **Expert** (`hard`) — Plays to the same *information* a strong human has (rack, discards,
 *   exposures) with consistently tight discards and call judgment—no “wall hacks.”
 *
 * **Open calls** (pung/kong/quint) are also gated in `App.tsx` so a bot’s
 * *combined* table exposures must fit at least one non–closed book line—same
 * structural check the ranker uses (`openClaimMeldsFitSomePracticeLine` /
 * `claimMeldsFitPracticePattern`).
 *
 * On its own turn, before discarding, a bot may exchange a blank for a discarded tile
 * when that type is still needed for its best line — otherwise it holds the blank.
 */

import {
  computeSuggestedDiscardTrackerNeedDefs,
  focusKeyForSuggestedHandLine,
  getRackTilesNotHelpingPattern,
  rankSuggestedHands,
  suggestedHandsTiedAtBest,
  summarizeRackTowardWin,
  type RankSuggestedHandsInput,
} from './suggestedHands'
import { getActiveCardPatterns } from '../card/activeCardPatternsScope'
import { applyBlankExchange, discardedDefsForBlankExchange } from '../mahjong/blankExchange'
import { charlestonPassEligible, pickRandomPass } from '../mahjong/charleston'
import { shuffle } from '../mahjong/deck'
import type { DiscardEntry, Seat, TileDef, TileInstance } from '../mahjong/types'
import { tileDefsEqual } from '../mahjong/tileUtils'
import type { BotExposure, BotSeat } from './types'

/** Tuning for discard heuristics and call eagerness. */
export type BotDifficulty = 'easy' | 'normal' | 'hard'

export const DEFAULT_BOT_DIFFICULTY: BotDifficulty = 'normal'

export const BOT_DIFFICULTIES: readonly BotDifficulty[] = ['easy', 'normal', 'hard'] as const

export function isBotDifficulty(s: string | null | undefined): s is BotDifficulty {
  return s === 'easy' || s === 'normal' || s === 'hard'
}

// ── Context ───────────────────────────────────────────────────────────────────

export type BotRankContext = {
  /** Bot's current concealed hand (after joker swaps, before discard pick). */
  hand: TileInstance[]
  botSeat: BotSeat
  wall: TileInstance[]
  /**
   * When the wall is empty or not meaningful (e.g. during Charleston), set this so
   * `rankSuggestedHands` still gets a plausible wall count for “pressure” labels.
   */
  wallRemainingOverride?: number
  discardPile: DiscardEntry[]
  eastExposures: ReadonlyArray<{ tiles: TileInstance[] }>
  botExposures: BotExposure[]
}

function buildInput(ctx: BotRankContext): RankSuggestedHandsInput {
  return {
    hand: ctx.hand,
    wallRemaining: ctx.wallRemainingOverride ?? ctx.wall.length,
    discards: ctx.discardPile.map((e) => e.tile),
    exposures: ctx.botExposures,
    playerClaimMelds: ctx.botExposures.filter((e) => e.seat === ctx.botSeat),
    eastTableClaimMelds: ctx.eastExposures,
    patterns: getActiveCardPatterns(),
  }
}

// ── Discard selection ─────────────────────────────────────────────────────────

/** Blanks are exchanged for discards, not thrown away — unless the rack is already dead. */
function rackIsHopelesslyDead(ctx: BotRankContext): boolean {
  return summarizeRackTowardWin(buildInput(ctx)).bestTilesAway >= 14
}

function discardEligibleFromHand(hand: TileInstance[], allowBlankDiscards: boolean): TileInstance[] {
  return hand.filter(
    (t) => t.def.cat !== 'joker' && (allowBlankDiscards || t.def.cat !== 'blank'),
  )
}

/**
 * Choose the best tile for a bot to discard.
 *
 * Strategy (in priority order):
 * 1. Find the best hand on the practice card (`tilesNeededRough` minimum).
 * 2. Identify which hand tiles are NOT helping that pattern.
 * 3. Discard one of those non-helpers (randomly among equals — avoids telegraphing).
 * 4. If every tile helps, discard a random eligible tile (rare mid-game edge case).
 * Blanks are never discarded while a winning line is still plausible — only when the rack is dead.
 */
/** Rough wall count during Charleston for suggested-hand pressure heuristics. */
const CHARLESTON_WALL_REMAINING_GUESS = 88

/**
 * Pick `n` tiles for a bot’s Charleston pass (South / West / North).
 * Blends book-aware discards with random passes based on difficulty.
 */
export function chooseBotCharlestonPass(
  hand: TileInstance[],
  n: number,
  seat: BotSeat,
  difficulty: BotDifficulty = 'normal',
): TileInstance[] {
  if (n <= 0) return []
  const eligible = hand.filter((t) => charlestonPassEligible(t.def))
  if (eligible.length === 0) return []
  if (eligible.length <= n) return shuffle([...eligible])

  const randomPassP: Record<BotDifficulty, number> = {
    easy: 0.58,
    normal: 0.14,
    hard: 0.05,
  }
  if (Math.random() < randomPassP[difficulty]) {
    return pickRandomPass(hand, n)
  }

  const ctx: BotRankContext = {
    hand,
    botSeat: seat,
    wall: [],
    wallRemainingOverride: CHARLESTON_WALL_REMAINING_GUESS,
    discardPile: [],
    eastExposures: [],
    botExposures: [],
  }

  const ranked = rankSuggestedHands(buildInput(ctx))
  if (ranked.length === 0) return pickRandomPass(hand, n)
  const bestLine = ranked[0]!
  const p = getActiveCardPatterns().find((x) => x.id === bestLine.id)
  if (!p) return pickRandomPass(hand, n)

  const rack = [...hand]
  const notHelpingRack = getRackTilesNotHelpingPattern(rack, p)
  const handIds = new Set(hand.map((t) => t.id))
  const nonHelpers = notHelpingRack.filter(
    (t) => handIds.has(t.id) && charlestonPassEligible(t.def),
  )

  if (difficulty === 'normal' && nonHelpers.length >= n && Math.random() < 0.11) {
    return pickRandomPass(hand, n)
  }

  if (nonHelpers.length > n) {
    return shuffle([...nonHelpers]).slice(0, n)
  }

  if (nonHelpers.length === n) {
    return shuffle([...nonHelpers])
  }

  const out: TileInstance[] = [...nonHelpers]
  const used = new Set(out.map((t) => t.id))
  const rest = eligible.filter((t) => !used.has(t.id))
  const need = n - out.length
  if (need > 0 && rest.length > 0) {
    out.push(...pickRandomPass(rest, need))
  }
  return out.slice(0, n)
}

export function chooseBotDiscard(
  ctx: BotRankContext,
  difficulty: BotDifficulty = 'normal',
): TileInstance {
  const { hand } = ctx
  const allowBlankDiscards = rackIsHopelesslyDead(ctx)
  const eligible = discardEligibleFromHand(hand, allowBlankDiscards)
  if (eligible.length === 0) {
    const jokers = hand.filter((t) => t.def.cat === 'joker')
    if (jokers.length > 0) return jokers[0]!
    return hand[0]! // edge case: all jokers
  }

  // Weaker play: more random, wasteful discards at easy; occasional slip at normal.
  if (difficulty === 'easy' && Math.random() < 0.52) {
    return eligible[Math.floor(Math.random() * eligible.length)]!
  }
  if (difficulty === 'normal' && eligible.length > 1 && Math.random() < 0.1) {
    return eligible[Math.floor(Math.random() * eligible.length)]!
  }

  const ranked = rankSuggestedHands(buildInput(ctx))
  if (ranked.length === 0) {
    return eligible[Math.floor(Math.random() * eligible.length)]!
  }

  const bestLine = ranked[0]!
  const p = getActiveCardPatterns().find((x) => x.id === bestLine.id)
  if (!p) return eligible[Math.floor(Math.random() * eligible.length)]!

  // Rack = concealed hand + own exposed tiles (both count toward the 14).
  const ownExposureTiles = ctx.botExposures
    .filter((e) => e.seat === ctx.botSeat)
    .flatMap((e) => e.tiles)
  const rack = [...hand, ...ownExposureTiles]

  const notHelpingRack = getRackTilesNotHelpingPattern(rack, p)
  // Restrict to concealed hand only (can't discard exposed tiles), jokers, and blanks (unless dead).
  const handIds = new Set(hand.map((t) => t.id))
  const eligibleIds = new Set(eligible.map((t) => t.id))
  const nonHelpers = notHelpingRack.filter(
    (t) => handIds.has(t.id) && eligibleIds.has(t.id),
  )

  if (nonHelpers.length > 0) {
    return nonHelpers[Math.floor(Math.random() * nonHelpers.length)]!
  }

  // Every tile contributes — discard a random eligible tile.
  return eligible[Math.floor(Math.random() * eligible.length)]!
}

// ── Blank exchange ────────────────────────────────────────────────────────────

/** Natural tile types the bot's best line is still short — same basis as the discard-tracker need rings. */
function neededDefsForBotBestLine(ctx: BotRankContext): TileDef[] {
  const { linesAtMin, bestTilesAway } = suggestedHandsTiedAtBest(buildInput(ctx))
  const best = linesAtMin[0]
  if (!best || bestTilesAway >= 14) return []

  const focusKey = focusKeyForSuggestedHandLine(best) ?? best.id
  const ownExposureTiles = ctx.botExposures
    .filter((e) => e.seat === ctx.botSeat)
    .flatMap((e) => e.tiles)
  const rack = [...ctx.hand, ...ownExposureTiles]
  const exposureTileIds =
    ownExposureTiles.length > 0
      ? new Set(ownExposureTiles.map((t) => t.id))
      : undefined
  return computeSuggestedDiscardTrackerNeedDefs(focusKey, rack, exposureTileIds)
}

function defMatchesAny(def: TileDef, defs: readonly TileDef[]): boolean {
  return defs.some((d) => tileDefsEqual(d, def))
}

/**
 * Pick a discarded tile type to redeem a blank for. Returns null when nothing in the
 * pile matches a need on the bot's promising hand, or when the swap would not help.
 */
export function chooseBotBlankExchangeDef(
  ctx: BotRankContext,
  eligibleDefs: readonly TileDef[],
  difficulty: BotDifficulty = 'normal',
): TileDef | null {
  if (eligibleDefs.length === 0) return null
  if (!ctx.hand.some((t) => t.def.cat === 'blank')) return null

  if (difficulty === 'easy' && Math.random() < 0.42) return null
  if (difficulty === 'normal' && Math.random() < 0.07) return null

  const neededDefs = neededDefsForBotBestLine(ctx)
  if (neededDefs.length === 0) return null

  const candidates = eligibleDefs.filter((d) => defMatchesAny(d, neededDefs))
  if (candidates.length === 0) return null

  const blank = ctx.hand.find((t) => t.def.cat === 'blank')!
  const before = tilesAway(ctx)
  let bestAfter = before
  const bestDefs: TileDef[] = []

  for (const def of candidates) {
    const blankIdx = ctx.hand.findIndex((t) => t.id === blank.id)
    if (blankIdx < 0) break
    const handAfter = [...ctx.hand]
    handAfter[blankIdx] = { ...handAfter[blankIdx]!, def }
    const after = tilesAway({ ...ctx, hand: handAfter })
    if (after < bestAfter) {
      bestAfter = after
      bestDefs.length = 0
      bestDefs.push(def)
    } else if (after === bestAfter && after < before) {
      if (!defMatchesAny(def, bestDefs)) bestDefs.push(def)
    }
  }

  if (bestDefs.length === 0) return null

  if (difficulty === 'normal' && bestDefs.length > 1 && Math.random() < 0.14) {
    return bestDefs[Math.floor(Math.random() * bestDefs.length)]!
  }
  return bestDefs[Math.floor(Math.random() * bestDefs.length)]!
}

/**
 * On this bot's turn, exchange a blank for a discarded tile the best line still needs.
 */
export function tryBotBlankExchange(
  ctx: BotRankContext,
  seat: Seat,
  difficulty: BotDifficulty = 'normal',
): { hand: TileInstance[]; discardPile: DiscardEntry[] } {
  const blank = ctx.hand.find((t) => t.def.cat === 'blank')
  if (!blank) return { hand: ctx.hand, discardPile: ctx.discardPile }

  const eligible = discardedDefsForBlankExchange(ctx.discardPile)
  const chosen = chooseBotBlankExchangeDef(ctx, eligible, difficulty)
  if (!chosen) return { hand: ctx.hand, discardPile: ctx.discardPile }

  const applied = applyBlankExchange(ctx.hand, ctx.discardPile, blank.id, chosen, seat)
  return applied ?? { hand: ctx.hand, discardPile: ctx.discardPile }
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
/** [helps hand, neutral, hurt] call willingness — tuned by difficulty. */
const CALL_P_BY_DIFFICULTY: Record<BotDifficulty, readonly [number, number, number]> = {
  easy: [0.32, 0.05, 0.01],
  normal: [0.8, 0.11, 0.03],
  hard: [0.9, 0.15, 0.04],
}

export function botCallStrategicProbability(
  ctx: BotRankContext,
  discard: TileInstance,
  difficulty: BotDifficulty = 'normal',
): number {
  if (discard.def.cat === 'joker') return 0
  const [pg, pn, pw] = CALL_P_BY_DIFFICULTY[difficulty]
  const before = tilesAway(ctx)
  const after = tilesAway({ ...ctx, hand: [...ctx.hand, discard] })
  if (after < before) return pg
  if (after === before) return pn
  return pw
}
