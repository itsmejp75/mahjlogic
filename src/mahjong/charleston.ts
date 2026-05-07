import { shuffle } from './deck'
import type { TileInstance } from './types'

/** East-dealer Charleston steps (NMJL order). `done` = finished. */
export type CharlestonPhase =
  | 'right1'
  | 'across1'
  | 'left1'
  | 'left2'
  | 'across2'
  | 'right2'
  | 'courtesy'
  | 'done'

export const CHARLESTON_PHASE_ORDER: CharlestonPhase[] = [
  'right1',
  'across1',
  'left1',
  'left2',
  'across2',
  'right2',
  'courtesy',
  'done',
]

export type FourHands = {
  east: TileInstance[]
  south: TileInstance[]
  west: TileInstance[]
  north: TileInstance[]
}

export function nextCharlestonPhase(phase: CharlestonPhase): CharlestonPhase {
  const i = CHARLESTON_PHASE_ORDER.indexOf(phase)
  if (i < 0 || phase === 'done') return 'done'
  return CHARLESTON_PHASE_ORDER[Math.min(i + 1, CHARLESTON_PHASE_ORDER.length - 1)]!
}

const PHASE_HELP: Record<Exclude<CharlestonPhase, 'done'>, string> = {
  right1: 'Pass 3 tiles to your right (South). You receive 3 from North.',
  across1: 'Pass 3 across (West). You receive 3 from West.',
  left1:
    'Pass 3 left (North). You receive from South — you may use up to 3 blind tiles from that incoming pass (NMJL first left only).',
  left2: 'Second left pass (North again). You receive 3 more from South.',
  across2: 'Second across pass (West). You receive 3 more from West.',
  right2:
    'Second right pass (South). You receive from North — you may use up to 3 blind tiles from that incoming pass (NMJL second right only).',
  courtesy:
    'Courtesy pass across (West): 0–3 tiles (same count for all seats). Bots pass the same number at random.',
}

export function charlestonStepIndex(
  phase: CharlestonPhase,
  skippedSecondCharleston: boolean,
): number {
  if (phase === 'done') return skippedSecondCharleston ? 5 : 7
  const short: Exclude<CharlestonPhase, 'done'>[] = [
    'right1',
    'across1',
    'left1',
    'courtesy',
  ]
  const full = CHARLESTON_PHASE_ORDER.filter((p): p is Exclude<CharlestonPhase, 'done'> => p !== 'done')
  const order = skippedSecondCharleston ? short : full
  const i = order.indexOf(phase as Exclude<CharlestonPhase, 'done'>)
  return i >= 0 ? i + 1 : 0
}

export function charlestonStepTotal(skippedSecondCharleston: boolean): number {
  return skippedSecondCharleston ? 4 : 7
}

/** First Charleston cycle (right–across–left) is complete; East is in second pass or courtesy. */
export function charlestonPastFirstRound(phase: CharlestonPhase): boolean {
  return (
    phase === 'left2' ||
    phase === 'across2' ||
    phase === 'right2' ||
    phase === 'courtesy'
  )
}

/** Rack bar title left of Pass (sentence case). `null` when not shown (e.g. `done`). */
export function charlestonRackRoundTitle(phase: CharlestonPhase): string | null {
  switch (phase) {
    case 'right1':
    case 'across1':
    case 'left1':
      return '1st CHARLESTON:'
    case 'left2':
    case 'across2':
    case 'right2':
      return '2nd CHARLESTON:'
    case 'courtesy':
      return 'COURTESY PASS:'
    default:
      return null
  }
}

/**
 * When to show the Mah Jongg preview control during Charleston: second **left** only, then again
 * from **courtesy** onward (hidden during second across and second right passes).
 */
export function charlestonMahjongButtonPhase(phase: CharlestonPhase): boolean {
  return phase === 'left2' || phase === 'courtesy'
}

export function charlestonBanner(
  phase: CharlestonPhase,
  skippedSecondCharleston = false,
): string {
  if (phase === 'done') return 'Charleston is complete — main play comes next.'
  const step = charlestonStepIndex(phase, skippedSecondCharleston)
  const total = charlestonStepTotal(skippedSecondCharleston)
  const body = PHASE_HELP[phase as Exclude<CharlestonPhase, 'done'>]
  return `Step ${step} of ${total} — ${body}`
}

/** One-line UI hint for the pass strip (e.g. `Charleston: 1st pass right - select 3`). */
export function charlestonPassDirections(phase: CharlestonPhase): string {
  if (phase === 'done') return ''
  const line: Record<Exclude<CharlestonPhase, 'done'>, string> = {
    right1: 'Charleston: 1st pass right - select 3',
    across1: 'Charleston: 1st pass across - select 3',
    left1: 'Charleston: 1st pass left - select up to 3',
    left2:
      'Charleston: 2nd pass left — select 3 tiles, or leave the pass strip empty and pass to skip to courtesy',
    across2: 'Charleston: 2nd pass across - select 3',
    right2: 'Charleston: 2nd pass right - select up to 3',
    courtesy: 'Charleston: courtesy - select 0-3',
  }
  return line[phase as Exclude<CharlestonPhase, 'done'>]
}

/** Visible Pass button text (compact direction + count). Other phases fall back to `PASS` until labeled. */
export function charlestonPassButtonLabel(phase: CharlestonPhase): string {
  if (phase === 'done') return 'PASS'
  const labels: Record<Exclude<CharlestonPhase, 'done'>, string> = {
    right1: 'PASS 3 RIGHT',
    across1: 'PASS 3 ACROSS',
    left1: 'BLIND PASS 0-3 LEFT',
    left2: 'PASS 3 LEFT / 0 TO STOP',
    across2: 'PASS',
    right2: 'PASS',
    courtesy: 'PASS 0-3 ACROSS',
  }
  return labels[phase]
}

/** First left and second right allow blind passes (tiles from incoming batch, not from rack). */
export function charlestonAllowsBlind(phase: CharlestonPhase): boolean {
  return phase === 'left1' || phase === 'right2'
}

function stripByIds(hand: TileInstance[], remove: TileInstance[]): TileInstance[] {
  const ids = new Set(remove.map((t) => t.id))
  return hand.filter((t) => !ids.has(t.id))
}

/**
 * Pick `n` distinct random tiles from a hand (Charleston choice for bots).
 * Jokers are never passed (NMJL).
 */
export function pickRandomPass(hand: TileInstance[], n: number): TileInstance[] {
  if (n <= 0) return []
  const eligible = hand.filter((t) => t.def.cat !== 'joker')
  if (eligible.length === 0) return []
  if (eligible.length <= n) return shuffle([...eligible])
  return shuffle([...eligible]).slice(0, n)
}

function incomingForEastAfterPass(
  incoming: TileInstance[],
  eastPass: TileInstance[],
): TileInstance[] {
  const passIds = new Set(eastPass.map((t) => t.id))
  return incoming.filter((t) => !passIds.has(t.id))
}

/** Everyone passes right: E→S, S→W, W→N, N→E. */
function applyRight(
  h: FourHands,
  eastPass: TileInstance[],
  southPass: TileInstance[],
  westPass: TileInstance[],
  northPass: TileInstance[],
): FourHands {
  return {
    east: [...stripByIds(h.east, eastPass), ...incomingForEastAfterPass(northPass, eastPass)],
    south: [...stripByIds(h.south, southPass), ...eastPass],
    west: [...stripByIds(h.west, westPass), ...southPass],
    north: [...stripByIds(h.north, northPass), ...westPass],
  }
}

/** Everyone passes across: E↔W, S↔N. `n` = pass size (0–3 for courtesy). */
function applyAcross(
  h: FourHands,
  eastPass: TileInstance[],
  southPass: TileInstance[],
  westPass: TileInstance[],
  northPass: TileInstance[],
): FourHands {
  const n = eastPass.length
  if (n === 0) {
    return { east: [...h.east], south: [...h.south], west: [...h.west], north: [...h.north] }
  }
  return {
    east: [...stripByIds(h.east, eastPass), ...westPass],
    south: [...stripByIds(h.south, southPass), ...northPass],
    west: [...stripByIds(h.west, westPass), ...eastPass],
    north: [...stripByIds(h.north, northPass), ...southPass],
  }
}

/** Everyone passes left: E→N, N→W, W→S, S→E. */
function applyLeft(
  h: FourHands,
  eastPass: TileInstance[],
  southPass: TileInstance[],
  westPass: TileInstance[],
  northPass: TileInstance[],
): FourHands {
  return {
    east: [...stripByIds(h.east, eastPass), ...incomingForEastAfterPass(southPass, eastPass)],
    south: [...stripByIds(h.south, southPass), ...westPass],
    west: [...stripByIds(h.west, westPass), ...northPass],
    north: [...stripByIds(h.north, northPass), ...eastPass],
  }
}

/** Optional bot pass picker: `botIndex` 0 = South, 1 = West, 2 = North. */
export type CharlestonBotPassPicker = (
  hand: TileInstance[],
  n: number,
  botIndex: 0 | 1 | 2,
) => TileInstance[]

/**
 * One synchronized Charleston exchange.
 * - Most steps: `eastRackPass` has 3 tiles from the pass strip (not in rack while in slots).
 * - First left / second right: `blindCount` tiles are chosen at random from the incoming batch
 *   (South on first left, North on second right) and appended to `eastRackPass` to make 3 total.
 * - Courtesy: `eastRackPass` has 0–3 tiles; bots pass the same count at random.
 */
export function applyCharlestonExchange(
  phase: Exclude<CharlestonPhase, 'done'>,
  hands: FourHands,
  eastRackPass: TileInstance[],
  blindCount = 0,
  opts?: { pickBotPass?: CharlestonBotPassPicker },
): FourHands {
  const botPass = opts?.pickBotPass

  if (phase === 'courtesy') {
    const n = eastRackPass.length
    const southPass = botPass ? botPass(hands.south, n, 0) : pickRandomPass(hands.south, n)
    const westPass = botPass ? botPass(hands.west, n, 1) : pickRandomPass(hands.west, n)
    const northPass = botPass ? botPass(hands.north, n, 2) : pickRandomPass(hands.north, n)
    return applyAcross(hands, eastRackPass, southPass, westPass, northPass)
  }

  const southPass = botPass ? botPass(hands.south, 3, 0) : pickRandomPass(hands.south, 3)
  const westPass = botPass ? botPass(hands.west, 3, 1) : pickRandomPass(hands.west, 3)
  const northPass = botPass ? botPass(hands.north, 3, 2) : pickRandomPass(hands.north, 3)

  let eastPass = eastRackPass
  if ((phase === 'left1' || phase === 'right2') && blindCount > 0) {
    const inbound = phase === 'left1' ? southPass : northPass
    eastPass = [...eastRackPass, ...pickRandomPass(inbound, blindCount)]
  }

  switch (phase) {
    case 'right1':
    case 'right2':
      return applyRight(hands, eastPass, southPass, westPass, northPass)
    case 'across1':
    case 'across2':
      return applyAcross(hands, eastPass, southPass, westPass, northPass)
    case 'left1':
    case 'left2':
      return applyLeft(hands, eastPass, southPass, westPass, northPass)
  }
}
