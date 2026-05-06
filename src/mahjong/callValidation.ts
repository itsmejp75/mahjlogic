import { summarizeRackTowardWin } from '../analysis/suggestedHands'
import { getActiveCardPatterns } from '../card/activeCardPatternsScope'
import type { BotExposure } from '../analysis/types'
import type { ClaimType, DiscardEntry, EastExposure, TileInstance } from './types'
import { findExactMatches } from './tileUtils'

/** Not enough naturals + jokers to form any pung / kong / quint / sextet with this discard. */
export const MSG_CALL_INSUFFICIENT_TILES =
  'You do not have the required tiles to call this tile.'

/** At least one meld size is possible, but no line on the practice card fits this table. */
export const MSG_CALL_NO_LEGAL_EXPOSURES =
  'No legal exposures can be made — your melds cannot combine with any playable hand on the card.'

/** Discard can only be used as the 14th tile to win, not to open a new exposure. */
export const MSG_CALL_MAHJONG_ONLY =
  'This discard is only callable as your 14th tile for Mah Jongg. Use the Mah Jongg button to claim it for a win.'

/** Discarded jokers are dead in NMJL and cannot be claimed. */
export const MSG_CALL_DEAD_JOKER =
  'A discarded joker is dead and cannot be called.'

/** East taps Mah Jongg but hand + discard does not complete any practice-card line (tiles away ≠ 0). */
export const MSG_NO_LEGAL_MAHJONG =
  "You don't have a legal hand to declare Mah Jongg."

/** Mah Jongg pressed during second Charleston or courtesy — table does not declare wins during passes. */
export const MSG_MAHJONG_DURING_CHARLESTON =
  'Mah Jongg is not declared during Charleston passes. After courtesy, when a bot discards, tap Mah Jongg if that discard completes your hand — the app checks your rack plus that live tile against the practice card.'

/** Mah Jongg pressed on East’s first discard turn — no live bot discard to claim yet. */
export const MSG_MAHJONG_AWAITING_BOT_DISCARD =
  'Mah Jongg here is declared on another player’s discard. Discard to continue; when a bot discards, tap Mah Jongg if that tile completes your hand.'

/** Title for the table-style swap error modal (fixed overlay). */
export const BLOCKING_TITLE_SWAP_ERROR = 'Error with swap'

/** Swap error: no joker is exposed in any meld on the table. */
export const MSG_SWAP_NO_EXPOSED_JOKERS =
  'There are no exposed jokers in any meld on the table right now, so nothing can be swapped. A joker swap only applies when you or another player has a joker showing in an exposure you are allowed to redeem on your turn.'

/**
 * Swap error: user pressed Swap without staging a natural in the swap / placemat slot.
 * “Placemat” matches on-table language (exposure row + discard-adjacent staging).
 */
export const MSG_SWAP_PICK_TILE_FIRST =
  'To swap a joker, first move the natural tile you want to give up from your hand to the placemat — the staging slot next to the discard tracker or the reserved slot on your exposure row — then press Swap. You must have exactly one tile in the placemat. You can also drag that tile directly onto your own melds or another player’s exposed meld that contains a joker you may redeem.'

/** Swap error: staged tile cannot legally replace any exposed joker. */
export const MSG_SWAP_NO_LEGAL_FOR_TILE =
  'That tile cannot complete a legal joker swap with any exposure on the table. Try staging a different natural tile, or drag your tile directly onto the specific meld whose joker you mean to replace.'

export type CallValidationRoundSlice = {
  mainPhase: string
  activeBotDiscard: TileInstance | null
  hand: TileInstance[]
  eastExposures: EastExposure[]
  botExposures: BotExposure[]
  wall: TileInstance[]
  discardPile: DiscardEntry[]
}

export type CallCapacityFlags = {
  canPung: boolean
  canKong: boolean
  canQuint: boolean
  /** Six identical (five tiles from hand + called discard). Forward-compatible before card lines exist. */
  canSextet: boolean
}

/** Largest count of tiles this seat may take from hand when claiming `called` (2–5). Uses naturals matching `called` plus all hand jokers — same rule as forming the exposure. */
export function maxOpenClaimHandTiles(flags: CallCapacityFlags): 0 | 2 | 3 | 4 | 5 {
  if (flags.canSextet) return 5
  if (flags.canQuint) return 4
  if (flags.canKong) return 3
  if (flags.canPung) return 2
  return 0
}

function handTilesNeededForClaimType(claimType: ClaimType): number {
  switch (claimType) {
    case 'pung':
      return 2
    case 'kong':
      return 3
    case 'quint':
      return 4
    case 'sextet':
      return 5
  }
}

/** Tiles taken from hand when claiming a discard (not counting the picked-up discard). */
export function claimTypeForHandTilesFromDiscard(handTileCount: number): ClaimType | null {
  switch (handTileCount) {
    case 2:
      return 'pung'
    case 3:
      return 'kong'
    case 4:
      return 'quint'
    case 5:
      return 'sextet'
    default:
      return null
  }
}

export function getCallCapacityFlags(
  hand: TileInstance[],
  called: TileInstance | null,
): CallCapacityFlags {
  if (!called || called.def.cat === 'joker') {
    return { canPung: false, canKong: false, canQuint: false, canSextet: false }
  }
  const callMatches = findExactMatches(hand, called.def)
  const handJokers = hand.filter((t) => t.def.cat === 'joker')
  /* Matching naturals + jokers can fill the meld (flowers never match a suit/honor discard). */
  const total = callMatches.length + handJokers.length
  const canPung = total >= 2
  const canKong = total >= 3
  const canQuint = total >= 4
  const canSextet = total >= 5
  return { canPung, canKong, canQuint, canSextet }
}

function pickHandTilesForClaim(
  hand: TileInstance[],
  calledDef: TileInstance['def'],
  needed: number,
): TileInstance[] | null {
  const realMatches = findExactMatches(hand, calledDef)
  const handJokers = hand.filter((t) => t.def.cat === 'joker')
  const realsToUse = realMatches.slice(0, Math.min(needed, realMatches.length))
  const jokersToUse = handJokers.slice(0, needed - realsToUse.length)
  const usedTiles = [...realsToUse, ...jokersToUse]
  if (usedTiles.length < needed) return null
  return usedTiles
}

/**
 * Simulates East taking `claimType` on `calledTile`: removes matching hand tiles,
 * returns concealed hand after and full East claim melds including the new exposure.
 * Called tile is first in `exposure.tiles` (first slot on the exposure rack).
 */
export function simulateEastClaim(
  hand: TileInstance[],
  eastExposures: EastExposure[],
  calledTile: TileInstance,
  claimType: ClaimType,
): { hand: TileInstance[]; eastMelds: EastExposure[] } | null {
  if (calledTile.def.cat === 'joker') return null
  const needed = handTilesNeededForClaimType(claimType)
  const usedTiles = pickHandTilesForClaim(hand, calledTile.def, needed)
  if (!usedTiles) return null

  const usedIds = new Set(usedTiles.map((t) => t.id))
  const handNext = hand.filter((t) => !usedIds.has(t.id))
  const exposure: EastExposure = {
    tiles: [calledTile, ...usedTiles],
    claimType,
    calledTileId: calledTile.id,
  }
  return { hand: handNext, eastMelds: [...eastExposures, exposure] }
}


function winOnBotDiscardInput(
  r: CallValidationRoundSlice,
  called: TileInstance,
  hand: TileInstance[],
  eastMelds: EastExposure[],
): boolean {
  const discards = r.discardPile.filter((e) => e.tile.id !== called.id).map((e) => e.tile)
  return (
    summarizeRackTowardWin({
      hand,
      wallRemaining: r.wall.length,
      discards,
      exposures: r.botExposures,
      playerClaimMelds: eastMelds,
      eastTableClaimMelds: eastMelds,
      patterns: getActiveCardPatterns(),
    }).bestTilesAway === 0
  )
}

/**
 * True when East can declare Mah Jongg on the live bot discard: same `summarizeRackTowardWin`
 * model as the Suggested-hands panel and the Call flow.
 *
 * The rack may complete a line when the called tile is **(a)** added to the concealed hand only, or
 * **(b–d)** used in a new exposure with tiles from the hand. Case (a) alone is not enough: group
 * matching is exposure-aware, so a win that only appears after forming a 2-tile (or 3+ tile) claim
 * with the discard would wrongly fail (e.g. flower + flower in exposure vs. both in hand).
 */
export function hasLegalMahjongOnBotDiscard(r: CallValidationRoundSlice): boolean {
  if (r.mainPhase !== 'bot-turn' && r.mainPhase !== 'call-staging') return false
  if (!r.activeBotDiscard) return false
  if (r.activeBotDiscard.def.cat === 'joker') return false
  const called = r.activeBotDiscard

  // (a) All concealed: 13th tile in hand + called as 14th, no new exposure.
  if (winOnBotDiscardInput(r, called, [...r.hand, called], r.eastExposures)) return true

  // (b) Same as Call → one tile staged → commit: 2-tile exposure [called, t], claimType pung.
  const oneFromHand: TileInstance[] = [
    ...findExactMatches(r.hand, called.def),
    ...r.hand.filter((t) => t.def.cat === 'joker'),
  ]
  for (const t of oneFromHand) {
    const handNext = r.hand.filter((x) => x.id !== t.id)
    const exposure: EastExposure = {
      tiles: [called, t],
      claimType: 'pung',
      calledTileId: called.id,
    }
    if (winOnBotDiscardInput(r, called, handNext, [...r.eastExposures, exposure])) return true
  }

  // (c–d) 3+ tile claim melds (pung … sextet with 2–5 hand tiles + discard).
  for (const claimType of ['pung', 'kong', 'quint', 'sextet'] as const) {
    const sim = simulateEastClaim(r.hand, r.eastExposures, called, claimType)
    if (sim && winOnBotDiscardInput(r, called, sim.hand, sim.eastMelds)) return true
  }

  return false
}

/** Before opening the call-declare UI (from bot-turn). */
export function getCallInitiateBlockMessage(r: CallValidationRoundSlice): string | null {
  if (r.mainPhase !== 'bot-turn' || !r.activeBotDiscard) return null
  if (r.activeBotDiscard.def.cat === 'joker') return MSG_CALL_DEAD_JOKER
  const flags = getCallCapacityFlags(r.hand, r.activeBotDiscard)
  if (!flags.canPung && !flags.canKong && !flags.canQuint && !flags.canSextet) {
    // No open claim from hand + discard — still OK if this discard completes Mah Jongg
    // (including “pair” or single 14th tile); player may use Call → Done with 0–1 staged tiles.
    if (hasLegalMahjongOnBotDiscard(r)) return null
    return MSG_CALL_INSUFFICIENT_TILES
  }
  return null
}

/** Before committing a specific pung / kong / quint / sextet (from call-declare). */
export function getDeclareCallBlockMessage(
  r: CallValidationRoundSlice,
  claimType: ClaimType,
): string | null {
  if (r.mainPhase !== 'call-declare' || !r.activeBotDiscard) return null
  if (r.activeBotDiscard.def.cat === 'joker') return MSG_CALL_DEAD_JOKER
  const called = r.activeBotDiscard
  const flags = getCallCapacityFlags(r.hand, called)
  const allowed =
    claimType === 'pung'
      ? flags.canPung
      : claimType === 'kong'
        ? flags.canKong
        : claimType === 'quint'
          ? flags.canQuint
          : flags.canSextet
  if (!allowed) return MSG_CALL_INSUFFICIENT_TILES

  const sim = simulateEastClaim(r.hand, r.eastExposures, called, claimType)
  if (!sim) return MSG_CALL_INSUFFICIENT_TILES
  return null
}
