import type { Seat } from './types'
import type { BotSeat } from '../analysis/types'

/**
 * NMJL-style table payouts from a hand’s printed base value:
 * - Discard win: discarder pays 2× base; other two pay 1× each → winner collects 4×.
 * - Self-pick: each of the other three pays 2× base → winner collects 6×.
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
