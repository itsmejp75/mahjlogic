/**
 * Bot AI — strategic discard, Charleston pass, joker-swap, and call decisions.
 *
 * Bots don’t lock onto a single hand at game start. Each decision re-evaluates
 * the practice card against the current hand so they flex as Charleston and
 * wall draws change their rack.
 *
 * **Difficulty (behavioral design)**
 * - **Easy** — Weaker at pattern work: more random / wasteful discards, weaker
 *   call discipline, joker-swap and Charleston passes are noisier (more mistakes).
 *   Good for learning without punishing “perfect-robot” pressure.
 * - **Normal** — Solid default: reads the hand against the book and the visible
 *   table; mostly catches joker-swap on the *second* pass of the per-turn swap
 *   search (a human “I missed it, then I saw it”); Charleston blends strategy with
 *   a bit of variety.
 * - **Hard** — Plays to the same *information* a strong human has (rack, discards,
 *   exposures) with consistently tight discards and call judgment—no “wall hacks.”
 * - **Unfair** — Near-optimally exploitative: deterministically good discards in
 *   some branches, joker-swap and Charleston align tightly with the ranker, and
 *   the bot leans into calls that advance its best line—still structurally table-
 *   legal, but extremely sharp.
 *
 * **Open calls** (pung/kong/quint) are also gated in `App.tsx` so a bot’s
 * *combined* table exposures must fit at least one non–closed book line—same
 * structural check the ranker uses (`openClaimMeldsFitSomePracticeLine` /
 * `claimMeldsFitPracticePattern`).
 */

import {
  getRackTilesNotHelpingPattern,
  rankSuggestedHands,
  type RankSuggestedHandsInput,
} from './suggestedHands'
import { PRACTICE_PATTERNS } from '../card/practicePatterns'
import { pickRandomPass } from '../mahjong/charleston'
import { shuffle } from '../mahjong/deck'
import type { DiscardEntry, TileInstance } from '../mahjong/types'
import type { BotExposure, BotSeat } from './types'

/** Tuning for discard heuristics and call eagerness. */
export type BotDifficulty = 'easy' | 'normal' | 'hard' | 'unfair'

export const DEFAULT_BOT_DIFFICULTY: BotDifficulty = 'normal'

export const BOT_DIFFICULTIES: readonly BotDifficulty[] = ['easy', 'normal', 'hard', 'unfair'] as const

export function isBotDifficulty(s: string | null | undefined): s is BotDifficulty {
  return s === 'easy' || s === 'normal' || s === 'hard' || s === 'unfair'
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
  const eligible = hand.filter((t) => t.def.cat !== 'joker')
  if (eligible.length === 0) return []
  if (eligible.length <= n) return shuffle([...eligible])

  const randomPassP: Record<BotDifficulty, number> = {
    easy: 0.58,
    normal: 0.14,
    hard: 0.05,
    unfair: 0,
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
  const p = PRACTICE_PATTERNS.find((x) => x.id === bestLine.id)
  if (!p) return pickRandomPass(hand, n)

  const rack = [...hand]
  const notHelpingRack = getRackTilesNotHelpingPattern(rack, p)
  const handIds = new Set(hand.map((t) => t.id))
  let nonHelpers = notHelpingRack.filter((t) => handIds.has(t.id) && t.def.cat !== 'joker')

  if (difficulty === 'normal' && nonHelpers.length >= n && Math.random() < 0.11) {
    return pickRandomPass(hand, n)
  }

  if (nonHelpers.length > n) {
    if (difficulty === 'unfair') {
      const stable = [...nonHelpers].sort((a, b) => a.id.localeCompare(b.id))
      return stable.slice(0, n)
    }
    return shuffle([...nonHelpers]).slice(0, n)
  }

  if (nonHelpers.length === n) {
    if (difficulty === 'unfair') {
      return [...nonHelpers].sort((a, b) => a.id.localeCompare(b.id))
    }
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
  const nonJokers = hand.filter((t) => t.def.cat !== 'joker')
  if (nonJokers.length === 0) return hand[0]! // edge case: all jokers

  // Weaker play: more random, wasteful discards at easy; occasional slip at normal.
  if (difficulty === 'easy' && Math.random() < 0.52) {
    return nonJokers[Math.floor(Math.random() * nonJokers.length)]!
  }
  if (difficulty === 'normal' && nonJokers.length > 1 && Math.random() < 0.1) {
    return nonJokers[Math.floor(Math.random() * nonJokers.length)]!
  }

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
    if (difficulty === 'unfair') {
      const stable = [...nonHelpers].sort((a, b) => a.id.localeCompare(b.id))
      return stable[0]!
    }
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
/** [helps hand, neutral, hurt] call willingness — tuned by difficulty. */
const CALL_P_BY_DIFFICULTY: Record<BotDifficulty, readonly [number, number, number]> = {
  easy: [0.32, 0.05, 0.01],
  normal: [0.8, 0.11, 0.03],
  hard: [0.9, 0.15, 0.04],
  unfair: [0.998, 0.38, 0.14],
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
