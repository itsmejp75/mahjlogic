/**
 * Pure round-state transformation helpers shared between App.tsx and useRoundActions.
 * No React imports — safe to call from both components and hooks.
 */
import type { DiscardEntry, EastExposure, Seat, TileDef, TileInstance } from '../mahjong/types'
import type { BotExposure, BotSeat } from '../analysis/types'
import type { CharlestonPhase, CharlestonBotPassPicker, FourHands } from '../mahjong/charleston'
import type { DeadHandReason } from '../mahjong/deadHandReason'
import type { RoundState } from './roundState'
import type { RankSuggestedHandsInput } from '../analysis/suggestedHands'
import type { CallValidationRoundSlice } from '../mahjong/callValidation'
import type { BotSlotSeats } from '../mahjong/seats'
import type { MainPhase } from './playSurfaceUi'

import { applyCharlestonExchange } from '../mahjong/charleston'
import { handTileFlyInFromBotSeat } from '../mahjong/handTileFlyIn'
import { findExactMatches, tileDefsEqual } from '../mahjong/tileUtils'
import { claimTypeForHandTilesFromDiscard, hasLegalMahjongOnBotDiscard } from '../mahjong/callValidation'
import { representativeDefInExposedMeld } from '../mahjong/jokerSwapTarget'
import { summarizeRackTowardWin } from '../analysis/suggestedHands'
import { getActiveCardPatterns, getActiveCardPatternById } from '../card/activeCardPatternsScope'
import { reorderEastExposuresToPatternGroupOrder } from '../analysis/eastExposurePatternFit'
import {
  toFourHands as fourHandsFromRound,
  fourHandsFromPlayerAsEast,
  fourHandsWithPlayerAsEast,
  seatLabel,
} from '../mahjong/seats'

// ── Utilities ─────────────────────────────────────────────────────────────────

export function toFourHands(r: Pick<RoundState, 'hand' | 'bots' | 'playerSeat' | 'botSlotSeats'>): FourHands {
  return fourHandsFromRound(r.hand, r.bots, r.playerSeat, r.botSlotSeats)
}

export function botLabelAt(r: Pick<RoundState, 'botSlotSeats'>, botIndex: 0 | 1 | 2): BotSeat {
  return seatLabel(r.botSlotSeats[botIndex]) as BotSeat
}

export function botSeatAt(r: Pick<RoundState, 'botSlotSeats'>, botIndex: 0 | 1 | 2): Seat {
  return r.botSlotSeats[botIndex]
}

/** Pre-Charleston wall order: East 14, South/West/North 13 each, then wall. */
export function charlestonIncomingHandTileIds(
  prevHand: TileInstance[],
  nextHand: TileInstance[],
): string[] {
  const prev = new Set(prevHand.map((t) => t.id))
  return nextHand.filter((t) => !prev.has(t.id)).map((t) => t.id)
}

// ── Discard helpers ───────────────────────────────────────────────────────────

/**
 * Discard pile entries shown in the strip / tracker counts — excludes a bot discard still
 * claimable during `bot-turn` or `call-staging` until all players pass or someone claims it.
 */
export function discardPileCommittedForDisplay(
  r: Pick<RoundState, 'discardPile' | 'mainPhase' | 'activeBotDiscard'>,
): RoundState['discardPile'] {
  if (
    (r.mainPhase === 'bot-turn' || r.mainPhase === 'call-staging') &&
    r.activeBotDiscard
  ) {
    return r.discardPile.filter((e) => e.tile.id !== r.activeBotDiscard!.id)
  }
  return r.discardPile
}

/**
 * Tiles in the discard pile that count as "dead" for practice-card table visibility / coach hints.
 */
export function deadDiscardTilesForRanking(
  r: Pick<RoundState, 'discardPile' | 'mainPhase' | 'activeBotDiscard'>,
): TileInstance[] {
  return discardPileCommittedForDisplay(r).map((e) => e.tile)
}

// ── Charleston pass ───────────────────────────────────────────────────────────

export function applyCharlestonPassForRound(
  r: Pick<RoundState, 'hand' | 'bots' | 'playerSeat' | 'botSlotSeats'>,
  phase: Exclude<CharlestonPhase, 'done'>,
  playerPass: TileInstance[],
  blindCount: number,
  opts?: { pickBotPass?: CharlestonBotPassPicker },
): FourHands {
  const absolute = toFourHands(r)
  const rotated = fourHandsWithPlayerAsEast(absolute, r.playerSeat)
  const nextRotated = applyCharlestonExchange(phase, rotated, playerPass, blindCount, opts)
  return fourHandsFromPlayerAsEast(nextRotated, r.playerSeat)
}

// ── Dead hand ─────────────────────────────────────────────────────────────────

export function applyDeadHand(r: RoundState, reason: DeadHandReason): RoundState {
  return { ...r, mainPhase: 'dead-hand', deadHandReason: reason }
}

// ── Player exposure helpers ───────────────────────────────────────────────────

/** Player's open-claim melds (East compass row when player is East; else that seat in bot exposures). */
export function playerClaimMeldsForRound(
  r: Pick<RoundState, 'playerSeat' | 'eastExposures' | 'botExposures'>,
): ReadonlyArray<{ tiles: TileInstance[] }> {
  if (r.playerSeat === 'east') return r.eastExposures
  const label = seatLabel(r.playerSeat) as BotSeat
  return r.botExposures.filter((e) => e.seat === label)
}

/** Melds shown in the player's exposure row above the hand rack. */
export function playerExposureMeldsForRound(
  r: Pick<RoundState, 'playerSeat' | 'eastExposures' | 'botExposures'>,
): EastExposure[] {
  if (r.playerSeat === 'east') return r.eastExposures
  const label = seatLabel(r.playerSeat) as BotSeat
  return r.botExposures
    .filter((e) => e.seat === label)
    .map((e) => ({
      tiles: e.tiles,
      claimType: e.claimType,
      calledTileId: e.tiles[0]?.id,
    }))
}

export function replacePlayerExposures(r: RoundState, exposures: EastExposure[]): RoundState {
  if (r.playerSeat === 'east') {
    return { ...r, eastExposures: exposures }
  }
  const label = seatLabel(r.playerSeat) as BotSeat
  const rest = r.botExposures.filter((e) => e.seat !== label)
  const mapped: BotExposure[] = exposures.map((exp) => ({
    seat: label,
    tiles: exp.tiles,
    claimType: exp.claimType,
  }))
  return { ...r, botExposures: [...rest, ...mapped] }
}

// ── Joker swap helpers ────────────────────────────────────────────────────────

/**
 * Bot joker redemptions run only on that seat's own turn (E → S → W → N), before they discard.
 * East uses {@link applyEastNaturalForExposedJoker} on `east-discard` / `call-staging`.
 */
export function applyBotsJokerSwapsFromEast(r: RoundState): RoundState {
  return r
}

function getRepDefForExposedJoker(
  r: RoundState,
  parsed: { rack: 'bot' | 'east'; exposureIdx: number },
): TileDef | null {
  if (parsed.rack === 'bot') {
    const exp = r.botExposures[parsed.exposureIdx]
    return exp ? representativeDefInExposedMeld(exp.tiles) : null
  }
  const exp = r.eastExposures[parsed.exposureIdx]
  return exp ? representativeDefInExposedMeld(exp.tiles) : null
}

/**
 * East trades a natural from their hand for an exposed joker (on any rack). The natural
 * replaces the joker in the meld; East receives the joker.
 */
export function applyEastNaturalForExposedJoker(
  r: RoundState,
  p: { rack: 'bot' | 'east'; exposureIdx: number; jokerTileId: string; eastTileId: string },
): RoundState {
  if (r.mainPhase !== 'east-discard' && r.mainPhase !== 'call-staging') return r
  if (r.mainPhase === 'call-staging' && r.stagedCallTileIds.includes(p.eastTileId)) return r
  const handIdx = r.hand.findIndex((t) => t.id === p.eastTileId)
  const fromPending = handIdx < 0 && r.pendingEastDiscardTile?.id === p.eastTileId
  if (handIdx < 0 && !fromPending) return r
  const eastTile = handIdx >= 0 ? r.hand[handIdx]! : r.pendingEastDiscardTile!
  if (eastTile.def.cat === 'joker') return r

  const rep = getRepDefForExposedJoker(r, p)
  if (!rep || !tileDefsEqual(eastTile.def, rep)) return r

  function buildHandAndPending(joker: TileInstance): { handNext: TileInstance[]; pendingNext: TileInstance | null } {
    if (handIdx >= 0) {
      const handNext = [...r.hand]
      handNext[handIdx] = joker
      return { handNext, pendingNext: r.pendingEastDiscardTile }
    }
    return { handNext: [...r.hand, joker], pendingNext: null }
  }

  if (p.rack === 'bot') {
    const exp = r.botExposures[p.exposureIdx]
    if (!exp) return r
    const joker = exp.tiles.find((t) => t.id === p.jokerTileId)
    if (!joker || joker.def.cat !== 'joker') return r
    const { handNext, pendingNext } = buildHandAndPending(joker)
    const botExposuresNext = [...r.botExposures]
    botExposuresNext[p.exposureIdx] = {
      ...exp,
      tiles: exp.tiles.map((t) => (t.id === p.jokerTileId ? eastTile : t)),
    }
    return applyBotsJokerSwapsFromEast({
      ...r,
      hand: handNext,
      botExposures: botExposuresNext,
      pendingEastDiscardTile: pendingNext,
      drawnTileId: joker.id,
      handTileFlyIn: null,
      handJokerSwapFlyInFromBelowId: joker.id,
      exposureJokerSwapFlyInTileId: eastTile.id,
      selectedHandTileId: null,
    })
  }

  const exp = r.eastExposures[p.exposureIdx]
  if (!exp) return r
  const joker = exp.tiles.find((t) => t.id === p.jokerTileId)
  if (!joker || joker.def.cat !== 'joker') return r
  const { handNext, pendingNext } = buildHandAndPending(joker)
  const eastExposuresNext = [...r.eastExposures]
  eastExposuresNext[p.exposureIdx] = {
    ...exp,
    tiles: exp.tiles.map((t) => (t.id === p.jokerTileId ? eastTile : t)),
  }
  return applyBotsJokerSwapsFromEast({
    ...r,
    hand: handNext,
    eastExposures: eastExposuresNext,
    pendingEastDiscardTile: pendingNext,
    drawnTileId: joker.id,
    handTileFlyIn: null,
    handJokerSwapFlyInFromBelowId: joker.id,
    exposureJokerSwapFlyInTileId: eastTile.id,
    selectedHandTileId: null,
  })
}

// ── Mahjong declaration ───────────────────────────────────────────────────────

/**
 * Player declares Mah Jongg on the active bot's discard.
 */
export function applyDeclareMahjong(r: RoundState): RoundState {
  if ((r.mainPhase !== 'bot-turn' && r.mainPhase !== 'call-staging') || !r.activeBotDiscard) return r
  const calledTile = r.activeBotDiscard
  const pileNext = r.discardPile.filter((e) => e.tile.id !== calledTile.id)
  const botLabel = botLabelAt(r, r.activeBotIndex as 0 | 1 | 2)
  const flyFrom =
    r.activeBotIndex != null ? handTileFlyInFromBotSeat(r.activeBotIndex as 0 | 1 | 2) : ('across' as const)
  return {
    ...r,
    hand: [...r.hand, calledTile],
    discardPile: pileNext,
    mainPhase: 'mahjong-declared',
    activeBotIndex: null,
    activeBotDiscard: null,
    botTurnBanner: null,
    drawnTileId: null,
    selectedHandTileId: null,
    stagedCallTileIds: [],
    playerWinMethod: { type: 'called-discard', botLabel, tile: calledTile.def },
    handTileFlyIn: { ids: [calledTile.id], from: flyFrom },
  }
}

/** Self-draw Mah Jongg: player declares on their own drawn tile (east-discard phase). */
export function applyDeclareMahjongSelfDraw(r: RoundState): RoundState {
  if (r.mainPhase !== 'east-discard' || !r.drawnTileId) return r
  const drawnTile = r.hand.find((t) => t.id === r.drawnTileId)
  if (!drawnTile) return r
  return {
    ...r,
    playerWinMethod: { type: 'self-draw', tile: drawnTile.def },
    mainPhase: 'mahjong-declared',
    drawnTileId: null,
    selectedHandTileId: null,
    pendingEastDiscardTile: null,
  }
}

// ── Call staging ──────────────────────────────────────────────────────────────

export function applyInitiateCall(r: RoundState): RoundState {
  if (r.mainPhase !== 'bot-turn' || !r.activeBotDiscard) return r
  return { ...r, mainPhase: 'call-staging', stagedCallTileIds: [], botTurnBanner: null }
}

/**
 * Auto-select `needed` hand tiles for the staged meld (naturals first, then jokers).
 */
export function applyAutoSelectCallTiles(r: RoundState, needed: number): RoundState {
  if (r.mainPhase !== 'call-staging' || !r.activeBotDiscard) return r
  const calledDef = r.activeBotDiscard.def
  const naturals = findExactMatches(r.hand, calledDef)
  const jokers = r.hand.filter((t) => t.def.cat === 'joker')
  const selected = [...naturals, ...jokers].slice(0, needed)
  return { ...r, stagedCallTileIds: selected.map((t) => t.id) }
}

/** Toggle a hand tile into/out of the staged call meld. */
export function applyToggleStagedCallTile(r: RoundState, tileId: string): RoundState {
  if (r.mainPhase !== 'call-staging' || !r.activeBotDiscard) return r
  if (r.stagedCallTileIds.includes(tileId)) {
    return { ...r, stagedCallTileIds: r.stagedCallTileIds.filter((id) => id !== tileId) }
  }
  const tile = r.hand.find((t) => t.id === tileId)
  if (!tile) return r
  if (r.stagedCallTileIds.length >= 5) return r
  return { ...r, stagedCallTileIds: [...r.stagedCallTileIds, tileId] }
}

/** After committing a new claim meld, left-to-right order of exposures matches the closest line's group order when possible. */
export function orderEastExposuresForClosestCardLine(
  r: RoundState,
  hand: TileInstance[],
  discardPile: RoundState['discardPile'],
  nextEast: EastExposure[],
): EastExposure[] {
  if (nextEast.length < 2) return nextEast
  const { closestLine } = summarizeRackTowardWin({
    hand,
    wallRemaining: r.wall.length,
    discards: discardPile.map((e) => e.tile),
    exposures: r.botExposures,
    playerClaimMelds: nextEast,
    eastTableClaimMelds: nextEast,
    patterns: getActiveCardPatterns(),
  })
  if (!closestLine) return nextEast
  const pat = getActiveCardPatternById(closestLine.id)
  if (!pat) return nextEast
  const reordered = reorderEastExposuresToPatternGroupOrder(nextEast, pat)
  if (!reordered) return nextEast
  return reordered as EastExposure[]
}

export function buildRankInputAfterStagedCall(
  r: RoundState,
  handNext: TileInstance[],
  pileNext: RoundState['discardPile'],
  eastMelds: EastExposure[],
): RankSuggestedHandsInput {
  return {
    hand: handNext,
    wallRemaining: r.wall.length,
    discards: pileNext.map((e) => e.tile),
    exposures: r.botExposures,
    playerClaimMelds: eastMelds,
    eastTableClaimMelds: eastMelds,
    patterns: getActiveCardPatterns(),
  }
}

/** Hand + exposures after modeling the in-progress call meld (called discard + staged hand tiles). */
export function buildCallStagingPreview(
  r: Pick<
    RoundState,
    'hand' | 'discardPile' | 'eastExposures' | 'activeBotDiscard' | 'stagedCallTileIds'
  >,
  orderRound?: RoundState,
): { handNext: TileInstance[]; eastMelds: EastExposure[] } | null {
  if (!r.activeBotDiscard) return null

  const calledTile = r.activeBotDiscard
  const stagedTiles = r.stagedCallTileIds
    .map((id) => r.hand.find((t) => t.id === id))
    .filter((t): t is TileInstance => !!t)
  if (stagedTiles.length > 5) return null

  const stagedIds = new Set(r.stagedCallTileIds)
  const handNext = r.hand.filter((t) => !stagedIds.has(t.id))
  const pileNext = r.discardPile.filter((e) => e.tile.id !== calledTile.id)
  const claimType = claimTypeForHandTilesFromDiscard(stagedTiles.length) ?? 'pung'
  const exposure: EastExposure = {
    tiles: [calledTile, ...stagedTiles],
    claimType,
    calledTileId: calledTile.id,
  }
  let eastMelds: EastExposure[] = [...r.eastExposures, exposure]
  if (stagedTiles.length >= 2 && orderRound) {
    eastMelds = orderEastExposuresForClosestCardLine(orderRound, handNext, pileNext, eastMelds)
  }
  return { handNext, eastMelds }
}

/**
 * Rank input while call-staging: the exposure slot (called discard + staged hand tiles) counts
 * toward tiles-away / prob exactly as after Done.
 */
export function rankInputDuringCallStaging(
  r: Pick<
    RoundState,
    | 'mainPhase'
    | 'hand'
    | 'wall'
    | 'discardPile'
    | 'botExposures'
    | 'eastExposures'
    | 'activeBotDiscard'
    | 'stagedCallTileIds'
  >,
): RankSuggestedHandsInput | null {
  if (r.mainPhase !== 'call-staging' || !r.activeBotDiscard) return null

  const preview = buildCallStagingPreview(r, r as RoundState)
  if (!preview) return null
  const pileNext = r.discardPile.filter((e) => e.tile.id !== r.activeBotDiscard!.id)
  return buildRankInputAfterStagedCall(r as RoundState, preview.handNext, pileNext, preview.eastMelds)
}

/** Rank input after committing the currently staged call tiles, or `null` if not a committable meld. */
export function previewStagedCallRankInput(r: RoundState): RankSuggestedHandsInput | null {
  if (r.mainPhase !== 'call-staging' || !r.activeBotDiscard) return null
  const calledTile = r.activeBotDiscard
  const stagedTiles = r.stagedCallTileIds
    .map((id) => r.hand.find((t) => t.id === id))
    .filter((t): t is TileInstance => !!t)
  if (stagedTiles.length === 0) return null
  if (stagedTiles.length > 5) return null
  if (stagedTiles.length === 1) {
    const meldOk = stagedTiles.every(
      (t) => t.def.cat === 'joker' || tileDefsEqual(t.def, calledTile.def),
    )
    if (!meldOk) return null
    return rankInputDuringCallStaging(r)
  }
  const meldIsValid = stagedTiles.every(
    (t) => t.def.cat === 'joker' || tileDefsEqual(t.def, calledTile.def),
  )
  if (!meldIsValid) return null
  if (!claimTypeForHandTilesFromDiscard(stagedTiles.length)) return null
  return rankInputDuringCallStaging(r)
}

/**
 * `bestTilesAway` after committing the current staged call meld, or `null` if the staging
 * does not form a committable shape.
 */
export function previewStagedCallBestTilesAway(r: RoundState): number | null {
  const input = previewStagedCallRankInput(r)
  if (!input) return null
  return summarizeRackTowardWin(input).bestTilesAway
}

export function previewAutoSelectedCallRankInput(
  r: RoundState,
  needed: number,
): RankSuggestedHandsInput | null {
  if (
    (r.mainPhase !== 'bot-turn' && r.mainPhase !== 'call-staging') ||
    !r.activeBotDiscard
  ) {
    return null
  }
  if (needed < 2 || needed > 5) return null
  const calledTile = r.activeBotDiscard
  const naturals = findExactMatches(r.hand, calledTile.def)
  const jokers = r.hand.filter((t) => t.def.cat === 'joker')
  const stagedTiles = [...naturals, ...jokers].slice(0, needed)
  if (stagedTiles.length < needed) return null

  const stagedIds = new Set(stagedTiles.map((t) => t.id))
  const handNext = r.hand.filter((t) => !stagedIds.has(t.id))
  const pileNext = r.discardPile.filter((e) => e.tile.id !== calledTile.id)
  const claimType = claimTypeForHandTilesFromDiscard(needed)
  if (!claimType) return null
  const exposure: EastExposure = {
    tiles: [calledTile, ...stagedTiles],
    claimType,
    calledTileId: calledTile.id,
  }
  const eastMelds = orderEastExposuresForClosestCardLine(r, handNext, pileNext, [
    ...r.eastExposures,
    exposure,
  ])

  return buildRankInputAfterStagedCall(r, handNext, pileNext, eastMelds)
}

export function commitPlayerExposureOrdered(
  r: RoundState,
  handNext: TileInstance[],
  pileNext: DiscardEntry[],
  exposure: EastExposure,
): EastExposure[] {
  return orderEastExposuresForClosestCardLine(r, handNext, pileNext, [
    ...playerExposureMeldsForRound(r),
    exposure,
  ])
}

/**
 * Commit the staged meld: remove staged tiles from hand, add the exposure, return to east-discard;
 * or complete Mah Jongg on the live discard (0 staged = tile to hand only; 1 staged = pair exposure win).
 *
 * Training mode: an invalid meld (mismatched non-joker tiles) is committed anyway so the player
 * sees a warning at discard time. Competition mode kills the hand on commit.
 */
export function applyCommitStagedCall(
  r: RoundState,
  gameMode: 'training' | 'competition' = 'competition',
): RoundState {
  if (r.mainPhase !== 'call-staging' || !r.activeBotDiscard) return r
  const calledTile = r.activeBotDiscard
  const stagedTiles = r.stagedCallTileIds
    .map((id) => r.hand.find((t) => t.id === id))
    .filter((t): t is TileInstance => !!t)

  if (stagedTiles.length === 0) {
    const chk: CallValidationRoundSlice = {
      mainPhase: 'bot-turn',
      activeBotDiscard: calledTile,
      hand: r.hand,
      eastExposures: r.eastExposures,
      botExposures: r.botExposures,
      wall: r.wall,
      discardPile: r.discardPile,
    }
    if (hasLegalMahjongOnBotDiscard(chk)) {
      return applyDeclareMahjong({ ...r, mainPhase: 'bot-turn' })
    }
    return r
  }

  if (stagedTiles.length === 1) {
    const meldOk = stagedTiles.every(
      (t) => t.def.cat === 'joker' || tileDefsEqual(t.def, calledTile.def),
    )
    if (!meldOk) {
      if (gameMode === 'training') return r
      return applyDeadHand(r, 'invalid-call-meld')
    }
    const stagedIds = new Set(r.stagedCallTileIds)
    const handNext = r.hand.filter((t) => !stagedIds.has(t.id))
    const pileNext = r.discardPile.filter((e) => e.tile.id !== calledTile.id)
    const exposure: EastExposure = {
      tiles: [calledTile, ...stagedTiles],
      claimType: 'pung',
      calledTileId: calledTile.id,
    }
    const eastMelds = commitPlayerExposureOrdered(r, handNext, pileNext, exposure)
    const { bestTilesAway } = summarizeRackTowardWin({
      hand: handNext,
      wallRemaining: r.wall.length,
      discards: pileNext.map((e) => e.tile),
      exposures: r.botExposures,
      playerClaimMelds: eastMelds,
      eastTableClaimMelds: r.eastExposures,
    })
    if (bestTilesAway !== 0) return r
    const botLabel = botLabelAt(r, r.activeBotIndex as 0 | 1 | 2)
    return applyBotsJokerSwapsFromEast({
      ...replacePlayerExposures(r, eastMelds),
      hand: handNext,
      discardPile: pileNext,
      mainPhase: 'mahjong-declared',
      activeBotIndex: null,
      activeBotDiscard: null,
      botTurnBanner: null,
      pendingEastDiscardTile: null,
      drawnTileId: null,
      selectedHandTileId: null,
      stagedCallTileIds: [],
      playerWinMethod: { type: 'called-discard', botLabel, tile: calledTile.def },
    })
  }

  if (stagedTiles.length < 2 || stagedTiles.length > 5) return r
  const meldIsValid = stagedTiles.every(
    (t) => t.def.cat === 'joker' || tileDefsEqual(t.def, calledTile.def),
  )
  if (!meldIsValid && gameMode !== 'training') {
    return applyDeadHand(r, 'invalid-call-meld')
  }
  const claimType = claimTypeForHandTilesFromDiscard(stagedTiles.length)
  if (!claimType) return r
  const stagedIds = new Set(r.stagedCallTileIds)
  const handNext = r.hand.filter((t) => !stagedIds.has(t.id))
  const pileNext = r.discardPile.filter((e) => e.tile.id !== calledTile.id)
  const exposure: EastExposure = {
    tiles: [calledTile, ...stagedTiles],
    claimType,
    calledTileId: calledTile.id,
  }
  const nextEast = commitPlayerExposureOrdered(r, handNext, pileNext, exposure)
  const { bestTilesAway: awayOpen } = summarizeRackTowardWin({
    hand: handNext,
    wallRemaining: r.wall.length,
    discards: pileNext.map((e) => e.tile),
    exposures: r.botExposures,
    playerClaimMelds: nextEast,
    eastTableClaimMelds: r.eastExposures,
  })
  if (awayOpen === 0) {
    const botLabel = botLabelAt(r, r.activeBotIndex as 0 | 1 | 2)
    return applyBotsJokerSwapsFromEast({
      ...replacePlayerExposures(r, nextEast),
      hand: handNext,
      discardPile: pileNext,
      mainPhase: 'mahjong-declared',
      activeBotIndex: null,
      activeBotDiscard: null,
      botTurnBanner: null,
      pendingEastDiscardTile: null,
      drawnTileId: null,
      selectedHandTileId: null,
      stagedCallTileIds: [],
      callAmendableAfterClaimTileId: null,
      callAmendFromBotIndex: null,
      playerWinMethod: { type: 'called-discard', botLabel, tile: calledTile.def },
    })
  }
  return applyBotsJokerSwapsFromEast({
    ...replacePlayerExposures(r, nextEast),
    hand: handNext,
    discardPile: pileNext,
    mainPhase: 'east-discard',
    activeBotIndex: null,
    activeBotDiscard: null,
    botTurnBanner: null,
    pendingEastDiscardTile: null,
    drawnTileId: null,
    selectedHandTileId: null,
    stagedCallTileIds: [],
    callAmendableAfterClaimTileId: null,
    callAmendFromBotIndex: null,
  })
}
