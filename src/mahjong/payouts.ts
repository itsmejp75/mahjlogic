import type { Seat } from './types'
import type { BotSeat } from '../analysis/types'

/**
 * NMJL-style table payouts from a hand’s printed base value:
 * - Discard win: discarder pays 2× base; other two pay 1× each → winner collects 4×.
 * - Self-pick: each of the other three pays 2× base → winner collects 6×.
 *
 * Jokerless Mah Jongg (league rule): double the card value before those multipliers,
 * except Singles and Pairs (`effectiveMahjongBasePoints`).
 *
 * Dead hand (solo app today): the round ends immediately, so there is no payout —
 * record 0. In a future multi-player table where a dead seat stays for scoring and
 * someone else wins, that dead player pays the winner the same as any other
 * non-winner (`nonWinnerPaysPoints` with isDiscarder=false on a discard win, or
 * the usual 2× on a self-pick). Being dead does not change the amount.
 */

export function normalizeCompassSeat(seat: Seat | BotSeat | string): Seat | null {
  const s = String(seat).toLowerCase()
  if (s === 'east') return 'east'
  if (s === 'south') return 'south'
  if (s === 'west') return 'west'
  if (s === 'north') return 'north'
  return null
}

/** League card section that never gets the jokerless double. */
export function isSinglesAndPairsSection(section: string | null | undefined): boolean {
  return (section ?? '').trim().toUpperCase() === 'SINGLES AND PAIRS'
}

/** True if any tile in the winning hand (concealeds + exposures) is a joker. */
export function handUsesJoker(tiles: readonly { def: { cat: string } }[]): boolean {
  return tiles.some((t) => t.def.cat === 'joker')
}

/**
 * Card value after the NMJL jokerless-Mah-Jongg double.
 * Doubles when the win used no jokers, except Singles and Pairs.
 */
export function effectiveMahjongBasePoints(
  cardPoints: number,
  opts: { section: string | null | undefined; usesJoker: boolean },
): number {
  if (!Number.isFinite(cardPoints) || cardPoints <= 0) return 0
  if (opts.usesJoker || isSinglesAndPairsSection(opts.section)) return cardPoints
  return cardPoints * 2
}

/** Total points the winner collects from all opponents. */
export function winnerCollectsPoints(
  basePoints: number,
  method: 'self-draw' | 'called-discard',
): number {
  if (!Number.isFinite(basePoints) || basePoints <= 0) return 0
  return method === 'self-draw' ? basePoints * 6 : basePoints * 4
}

/**
 * Points one non-winner pays the winner.
 * On a discard win, the discarder pays double; the other two pay single.
 * On a self-pick, every non-winner pays double.
 */
export function nonWinnerPaysPoints(
  basePoints: number,
  method: 'self-draw' | 'called-discard',
  isDiscarder: boolean,
): number {
  if (!Number.isFinite(basePoints) || basePoints <= 0) return 0
  if (method === 'self-draw') return basePoints * 2
  return isDiscarder ? basePoints * 2 : basePoints
}

export function isPlayerTheDiscarder(
  discardFrom: Seat | BotSeat | string,
  playerSeat: Seat,
): boolean {
  return normalizeCompassSeat(discardFrom) === playerSeat
}
