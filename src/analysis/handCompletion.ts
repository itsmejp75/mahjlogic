/**
 * NMJL hand completion scoring (M_nat, M_joker, D, P).
 *
 * P measures how completely the current inventory fills a target hand permutation
 * (0–100%), not wall-draw probability.
 */

import {
  AMERICAN_DECK_TILE_COUNT,
  STANDARD_JOKER_COUNT,
} from '../mahjong/deck'
import { DEAD_HINT_DRAGON_FOR_SUIT } from '../mahjong/deadHintVariants'

export type TileCountMap = Readonly<Record<string, number>>

/** One required meld slot in a resolved hand permutation (sum of targetCount = 14). */
export type CompletionSlot = {
  /**
   * Inventory lookup key.
   * - `s:<suit>:<rank>` — exact natural tile
   * - `rank-any:<rank>` — any suit at rank (consec-multi pooling)
   * - `f`, `d:<dragon>`, `w:<wind>` — specials
   */
  tileType: string
  targetCount: number
}

export type HandInventoryContext = {
  naturals: TileCountMap
  jokersInHand: number
  blanksInHand: number
  /** Natural tiles in the discard pile (blank redemption only). */
  discardCounts: TileCountMap
  /** When true, jokers cannot contribute (Singles & Pairs section only). */
  jokersDisallowed: boolean
}

/** Active deck composition — drives hidden pool size for wall-completion probability. */
export type DeckComposition = {
  /** Standard 8 or house-rule 10. */
  totalJokersInGame: number
  /** 0 when blanks disabled; otherwise 2, 4, or 6. */
  totalBlanksInGame: number
}

export const DEFAULT_DECK_COMPOSITION: DeckComposition = {
  totalJokersInGame: STANDARD_JOKER_COUNT,
  totalBlanksInGame: 0,
}

export type WallCompletionProbabilityInput = {
  slots: readonly CompletionSlot[]
  ctx: HandInventoryContext
  completion: HandCompletionMetrics
  visibleNaturals: TileCountMap
  visibleJokers: number
  visibleBlanks: number
  wallRemaining: number
  isConcealed: boolean
  isSinglesAndPairs: boolean
  deck: DeckComposition
  /** Tiles on this seat's rack (hand + claim melds), including jokers/blanks. */
  playerRackTileCount: number
  /** Greedy tiles-away — pattern distance, not 14-tile inventory gap. */
  tilesNeededRough: number
  /**
   * Exposed jokers redeemable via joker swap this turn. Counts toward supply / deficit relief
   * but not rack proximity or tiles-away until the swap commits.
   */
  jokerReliefFromSwapHint?: number
}

export type HandCompletionMetrics = {
  /** Natural tile matches capped per slot. */
  M_nat: number
  /** Jokers allocated to melds of 3+. */
  M_joker: number
  /** Tiles still needed: 14 − (M_nat + M_joker). */
  D: number
  /** Proximity fill before complexity modifiers: ((14 − D) / 14) × 100. */
  P_base: number
  /** Displayed completion % after concealed / joker-structure modifiers. */
  P: number
}

function getCount(map: TileCountMap, key: string): number {
  return map[key] ?? 0
}

/** Count naturals held for a slot key. */
export function countNaturalsForSlot(tileType: string, naturals: TileCountMap): number {
  if (tileType.startsWith('rank-any:')) {
    const rank = Number(tileType.slice('rank-any:'.length))
    let total = 0
    for (const suit of ['bam', 'dot', 'crak'] as const) {
      total += getCount(naturals, `s:${suit}:${rank}`)
    }
    return total
  }
  return getCount(naturals, tileType)
}

/** True when NMJL allows jokers on this slot (identical meld of 3+; pairs/singles never). */
export function slotAllowsJokers(
  slot: CompletionSlot,
  jokersDisallowed: boolean,
): boolean {
  return !jokersDisallowed && slot.targetCount > 2
}

/**
 * Resolve physical blank tiles by redeeming matching types from the discard pile.
 * Mutates a copy of naturals; returns remaining blanks.
 */
export function applyBlankTileRedemption(
  slots: readonly CompletionSlot[],
  naturalsIn: TileCountMap,
  discardCounts: TileCountMap,
  blanksInHand: number,
): { naturals: TileCountMap; blanksRemaining: number } {
  const naturals: Record<string, number> = { ...naturalsIn }
  let blanks = blanksInHand

  for (const slot of slots) {
    if (blanks <= 0) break
    let n = countNaturalsForSlot(slot.tileType, naturals)
    while (n < slot.targetCount && blanks > 0) {
      const inDiscard = countNaturalsForSlot(slot.tileType, discardCounts)
      if (inDiscard <= 0) break
      if (slot.tileType.startsWith('rank-any:')) {
        // Redeem from any suit column present in discards.
        const rank = Number(slot.tileType.slice('rank-any:'.length))
        let redeemed = false
        for (const suit of ['bam', 'dot', 'crak'] as const) {
          const key = `s:${suit}:${rank}`
          if (getCount(discardCounts, key) > 0) {
            naturals[key] = getCount(naturals, key) + 1
            redeemed = true
            break
          }
        }
        if (!redeemed) break
      } else {
        naturals[slot.tileType] = getCount(naturals, slot.tileType) + 1
      }
      blanks -= 1
      n += 1
    }
  }

  return { naturals, blanksRemaining: blanks }
}

/**
 * Core NMJL completion formulas for one slot permutation.
 *
 * - M_nat = Σ min(n_i, t_i)
 * - j_i = 0 when t_i ≤ 2; else t_i − n_i when n_i < t_i
 * - M_joker = min(J_hand, Σ j_i)  (0 when jokers disallowed)
 * - D = 14 − (M_nat + M_joker)
 * - P = (M_nat + M_joker) / 14 × 100
 */
export function computeHandCompletionMetrics(
  slots: readonly CompletionSlot[],
  ctx: HandInventoryContext,
): HandCompletionMetrics {
  // Blanks are not real tiles until exchanged on the table; unredeemed blanks do not
  // reduce tiles-away (D) or raise completion % (P). After exchange they appear as
  // naturals on the rack and are counted normally.
  const naturals = ctx.naturals

  let M_nat = 0
  let jokerCapacity = 0

  for (const slot of slots) {
    const t = slot.targetCount
    const n = countNaturalsForSlot(slot.tileType, naturals)
    M_nat += Math.min(n, t)
    // NMJL: jokers fill any identical meld of 3+ (suits, dragons, flowers, winds) — never pairs/singles.
    if (slotAllowsJokers(slot, false) && n < t) jokerCapacity += t - n
  }

  const J_hand = ctx.jokersDisallowed ? 0 : ctx.jokersInHand
  const M_joker = Math.min(J_hand, jokerCapacity)
  const filled = M_nat + M_joker
  const D = Math.max(0, 14 - filled)
  const P_base = Math.round((filled / 14) * 100)

  return { M_nat, M_joker, D, P_base, P: P_base }
}

/** Share of target tiles in singles/pairs slots where jokers are illegal (t_i ≤ 2). */
export function jokerBanRatio(slots: readonly CompletionSlot[]): number {
  let banned = 0
  for (const slot of slots) {
    if (slot.targetCount <= 2) banned += slot.targetCount
  }
  return banned / 14
}

const CONCEALED_WEIGHT = 0.8
const JOKER_BAN_PENALTY = 0.25

/**
 * P_final = P_base × W_concealed × W_joker_restriction
 * - Concealed [C]: W_concealed = 0.80
 * - W_joker_restriction = 1 − 0.25 × banRatio
 */
export function applyCompletionComplexityAdjustments(
  P_base: number,
  isConcealed: boolean,
  banRatio: number,
): number {
  const W_concealed = isConcealed ? CONCEALED_WEIGHT : 1
  const W_joker = 1 - JOKER_BAN_PENALTY * Math.min(1, Math.max(0, banRatio))
  const adjusted = P_base * W_concealed * W_joker
  return Math.min(100, Math.max(0, Math.round(adjusted)))
}

export function finalizeCompletionMetrics(
  raw: HandCompletionMetrics,
  slots: readonly CompletionSlot[],
  isConcealed: boolean,
): HandCompletionMetrics {
  // Fully filled rack — complexity modifiers (concealed / joker-ban structure) only
  // apply while tiles are still missing; 0 away always reads as 100%.
  if (raw.D === 0) return { ...raw, P: 100 }
  const P = applyCompletionComplexityAdjustments(raw.P_base, isConcealed, jokerBanRatio(slots))
  return { ...raw, P }
}

const NATURAL_TILES_IN_DECK = AMERICAN_DECK_TILE_COUNT - STANDARD_JOKER_COUNT

/** Max physical copies for a completion-slot key (flowers pooled as `f`). */
export function copiesForTileType(tileType: string, deck: DeckComposition = DEFAULT_DECK_COMPOSITION): number {
  if (tileType === 'f') return 8
  if (tileType === 'j') return deck.totalJokersInGame
  if (tileType === 'b') return deck.totalBlanksInGame
  return 4
}

function binomial(a: number, b: number): number {
  if (b < 0 || b > a) return 0
  let k = Math.min(b, a - b)
  let result = 1
  for (let i = 0; i < k; i++) {
    result *= (a - i) / (i + 1)
  }
  return result
}

/** P(X ≥ k) for X ~ Hypergeometric(K successes in N, sample n). */
export function hypergeometricAtLeast(K: number, n: number, N: number, k: number): number {
  if (k <= 0) return 1
  if (K < k || n < k || N <= 0 || n <= 0) return 0
  if (n >= N) return K >= k ? 1 : 0

  const denom = binomial(N, n)
  if (denom === 0) return 0

  let sum = 0
  const maxHits = Math.min(n, K)
  for (let hits = k; hits <= maxHits; hits++) {
    sum += (binomial(K, hits) * binomial(N - K, n - hits)) / denom
  }
  return Math.min(1, Math.max(0, sum))
}

/**
 * P(X1 + X2 ≥ need) for multivariate hypergeometric draws:
 * X1 from K1 typed naturals, X2 from K2 jokers, sample n from pool N.
 */
export function probNatPlusJokerAtLeast(
  outs: number,
  jokers: number,
  trials: number,
  pool: number,
  need: number,
): number {
  if (need <= 0) return 1
  if (trials <= 0 || pool <= 0) return 0
  if (outs + jokers < need || trials < need) return 0
  if (trials >= pool) return outs + jokers >= need ? 1 : 0

  const denom = binomial(pool, trials)
  if (denom === 0) return 0

  const other = pool - outs - jokers
  if (other < 0) return 0

  let sum = 0
  const nMax = Math.min(outs, trials)
  for (let n = 0; n <= nMax; n++) {
    const jMin = Math.max(0, need - n)
    const jMax = Math.min(jokers, trials - n)
    for (let j = jMin; j <= jMax; j++) {
      const rest = trials - n - j
      if (rest < 0 || rest > other) continue
      sum += (binomial(outs, n) * binomial(jokers, j) * binomial(other, rest)) / denom
    }
  }
  return Math.min(1, Math.max(0, sum))
}

/** Integer 0–100; sub-percent positive odds display as 1 (not a hard zero). */
function pctFromProb(p: number): number {
  if (p <= 0) return 0
  if (p >= 1) return 100
  const rounded = Math.round(p * 100)
  return Math.max(1, Math.min(100, rounded))
}

function hiddenNaturalOutsForSlot(
  tileType: string,
  naturals: TileCountMap,
  visibleNaturals: TileCountMap,
  deck: DeckComposition,
): number {
  if (tileType.startsWith('rank-any:')) {
    const rank = Number(tileType.slice('rank-any:'.length))
    let total = 0
    for (const suit of ['bam', 'dot', 'crak'] as const) {
      const key = `s:${suit}:${rank}`
      total += Math.max(
        0,
        copiesForTileType(key, deck) - getCount(visibleNaturals, key) - getCount(naturals, key),
      )
    }
    return total
  }
  return Math.max(
    0,
    copiesForTileType(tileType, deck) - getCount(visibleNaturals, tileType) - getCount(naturals, tileType),
  )
}

/** 0% when a single/pair slot cannot be satisfied from remaining physical copies. */
export function isHandDeadByVisibleTiles(
  slots: readonly CompletionSlot[],
  naturals: TileCountMap,
  visibleNaturals: TileCountMap,
  deck: DeckComposition = DEFAULT_DECK_COMPOSITION,
): boolean {
  for (const slot of slots) {
    if (slot.targetCount > 2) continue
    const held = countNaturalsForSlot(slot.tileType, naturals)
    const need = slot.targetCount - held
    if (need <= 0) continue
    const available = hiddenNaturalOutsForSlot(slot.tileType, naturals, visibleNaturals, deck)
    if (available < need) return true
  }
  return false
}

function sumVisibleNaturals(visibleNaturals: TileCountMap): number {
  let total = 0
  for (const count of Object.values(visibleNaturals)) total += count
  return total
}

/** Discount on opponent discard windows for skip / competition risk. */
const CALL_WINDOW_DISCOUNT = 0.35
/** Near-MJ declare calls are more reliable (you take any winning discard). */
const NEAR_MJ_CALL_DISCOUNT = 0.85
/**
 * Prospective mid-hand call credit for open melds not yet exposure-ready.
 * Low on purpose: most matching discards still go by until the rack can expose.
 */
const PROSPECTIVE_CALL_DISCOUNT = 0.12
/** Wall height where Charleston / early-deal exchange value is still material (~full wall 99). */
const EARLY_WALL_FULL = 99
/** Below this wall, treat Charleston as over and stop adding exchange trials. */
const EARLY_WALL_FLOOR = 88

/**
 * Left-to-right joker park onto joker-eligible melds (display / strip-style).
 * Returns per-slot joker counts (parallel to `slots`).
 */
export function allocateJokersToSlots(
  slots: readonly CompletionSlot[],
  naturals: TileCountMap,
  jokersInHand: number,
  jokersDisallowed: boolean,
): number[] {
  const alloc = slots.map(() => 0)
  let remaining = jokersDisallowed ? 0 : Math.max(0, jokersInHand)
  for (let i = 0; i < slots.length; i++) {
    if (remaining <= 0) break
    const slot = slots[i]!
    if (!slotAllowsJokers(slot, false)) continue
    const held = countNaturalsForSlot(slot.tileType, naturals)
    const need = Math.max(0, slot.targetCount - held)
    if (need <= 0) continue
    const give = Math.min(need, remaining)
    alloc[i] = give
    remaining -= give
  }
  return alloc
}

/**
 * Prob-only joker placement: flexible wilds scored one at a time.
 * Prefer mandatory fills, then scarce naturals, then exposure-ready over completing a meld
 * while another joker-eligible gap remains.
 */
export function allocateJokersForProbability(
  slots: readonly CompletionSlot[],
  naturals: TileCountMap,
  jokersInHand: number,
  jokersDisallowed: boolean,
  visibleNaturals: TileCountMap = {},
  deck: DeckComposition = DEFAULT_DECK_COMPOSITION,
): number[] {
  const alloc = slots.map(() => 0)
  let remaining = jokersDisallowed ? 0 : Math.max(0, jokersInHand)
  if (remaining <= 0) return alloc

  while (remaining > 0) {
    let incompleteEligible = 0
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]!
      if (!slotAllowsJokers(slot, jokersDisallowed)) continue
      const heldNat = countNaturalsForSlot(slot.tileType, naturals)
      const gap = Math.max(0, slot.targetCount - heldNat - alloc[i]!)
      if (gap > 0) incompleteEligible++
    }

    let bestIdx = -1
    let bestMust = false
    let bestOuts = Infinity
    let bestWasteful = true
    let bestGap = -1

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]!
      if (!slotAllowsJokers(slot, jokersDisallowed)) continue
      const heldNat = countNaturalsForSlot(slot.tileType, naturals)
      const held = heldNat + alloc[i]!
      const gap = Math.max(0, slot.targetCount - held)
      if (gap <= 0) continue

      const outs = hiddenNaturalOutsForSlot(slot.tileType, naturals, visibleNaturals, deck)
      const must = gap > outs
      const completes = held + 1 >= slot.targetCount
      // Completing a meld while another joker-eligible gap remains wastes a call window.
      const wasteful = completes && incompleteEligible > 1 && !must

      // After mandatory fills: avoid completing a meld while others still need help, then scarce outs.
      const better =
        bestIdx < 0 ||
        (must !== bestMust
          ? must
          : wasteful !== bestWasteful
            ? !wasteful
            : outs !== bestOuts
              ? outs < bestOuts
              : gap !== bestGap
                ? gap > bestGap
                : i < bestIdx)

      if (better) {
        bestIdx = i
        bestMust = must
        bestOuts = outs
        bestWasteful = wasteful
        bestGap = gap
      }
    }

    if (bestIdx < 0) break
    alloc[bestIdx]!++
    remaining--
  }

  return alloc
}

/**
 * NMJL: a pung/kong/quint can be called only when the rack already holds
 * `targetCount - 1` matching tiles (naturals + jokers on that meld).
 */
export function isSlotExposureReady(
  slot: CompletionSlot,
  naturals: TileCountMap,
  jokersOnSlot: number,
): boolean {
  if (slot.targetCount <= 2) return false
  const jokers = Math.max(0, jokersOnSlot)
  const held = countNaturalsForSlot(slot.tileType, naturals) + jokers
  return held >= slot.targetCount - 1 && held < slot.targetCount
}

function wallDrawTrials(wallRemaining: number, pendingDrawBonus: number): number {
  const base = Math.floor(wallRemaining / 4)
  if (base <= 0 && wallRemaining > 0) return Math.max(1, pendingDrawBonus)
  return Math.max(0, base + pendingDrawBonus)
}

/**
 * Equivalent random acquisition trials from remaining Charleston / courtesy receives.
 * Inferred from a near-full wall (wall does not shrink during Charleston) and how little
 * is already settled on the table.
 */
export function earlyExchangeTrials(wallRemaining: number, visibleTotal: number): number {
  if (wallRemaining < EARLY_WALL_FLOOR) return 0
  const early = Math.min(
    1,
    Math.max(0, (wallRemaining - EARLY_WALL_FLOOR) / (EARLY_WALL_FULL - EARLY_WALL_FLOOR)),
  )
  // Up to ~15 receives across a full Charleston; many are unhelpful → keep ~55%.
  const receives = 3 + Math.round(12 * early)
  const visibilityFactor = Math.max(0.4, 1 - visibleTotal / 28)
  return Math.round(receives * 0.55 * visibilityFactor)
}

/** Weight on pooled cover odds vs slot-precise product (1 = full early-game cover). */
function earlyCoverWeight(wallRemaining: number, tilesNeededRough: number): number {
  const wallW = Math.min(
    1,
    Math.max(0, (wallRemaining - 40) / (EARLY_WALL_FULL - 40)),
  )
  // Smooth in Away — stepped thresholds used to drop Prob when Away improved (e.g. 5→4).
  const awayW = Math.min(1, Math.max(0.35, tilesNeededRough / 5))
  return Math.min(0.88, Math.max(0.15, 0.25 + 0.55 * wallW * awayW))
}

/** Linear blend — geometric mean lets a ~0 slot-product crush early cover odds. */
function linearBlend(a: number, b: number, weightA: number): number {
  const w = Math.min(1, Math.max(0, weightA))
  return Math.min(1, Math.max(0, a * w + b * (1 - w)))
}

/**
 * Extra acquisition trials from opponent discards for one slot.
 * Credit only when the meld is already exposure-ready, or for a near-MJ pair/single declare.
 */
function callTrialsForSlot(
  wallDraws: number,
  slot: CompletionSlot,
  naturals: TileCountMap,
  jokersOnSlot: number,
  isConcealed: boolean,
  isSinglesAndPairs: boolean,
  tilesNeededRough: number,
): number {
  if (wallDraws <= 0 || isConcealed || isSinglesAndPairs) return 0

  const nearMj =
    tilesNeededRough > 0 &&
    tilesNeededRough <= 2 &&
    slot.targetCount <= 2 &&
    countNaturalsForSlot(slot.tileType, naturals) < slot.targetCount

  if (nearMj) {
    return Math.round(wallDraws * 3 * NEAR_MJ_CALL_DISCOUNT)
  }

  if (!isSlotExposureReady(slot, naturals, jokersOnSlot)) return 0
  return Math.round(wallDraws * 3 * CALL_WINDOW_DISCOUNT)
}

/**
 * Held blanks that already redeem (or remain fluid) — reduces natural need only.
 * Hidden-wall blanks are handled separately via a small multiplicative boost (not EV wipeout).
 */
function blankNaturalRelief(
  slots: readonly CompletionSlot[],
  ctx: HandInventoryContext,
  deck: DeckComposition,
): { naturals: TileCountMap; fluidBlanks: number } {
  if (deck.totalBlanksInGame <= 0) {
    return { naturals: ctx.naturals, fluidBlanks: 0 }
  }
  const { naturals, blanksRemaining } = applyBlankTileRedemption(
    slots,
    ctx.naturals,
    ctx.discardCounts,
    ctx.blanksInHand,
  )
  return { naturals, fluidBlanks: blanksRemaining }
}

/**
 * Joker-eligible meld slots still unfilled after rack jokers are allocated (matches M_joker cap).
 */
export function jokerEligibleCapacityRemaining(
  slots: readonly CompletionSlot[],
  ctx: HandInventoryContext,
  completion: HandCompletionMetrics,
): number {
  let capacity = 0
  for (const slot of slots) {
    if (!slotAllowsJokers(slot, ctx.jokersDisallowed)) continue
    const t = slot.targetCount
    const n = countNaturalsForSlot(slot.tileType, ctx.naturals)
    if (n < t) capacity += t - n
  }
  return Math.max(0, capacity - completion.M_joker)
}

/**
 * How many exposed jokers may count toward completion prob when a joker swap is legal:
 * capped by swappable meld jokers and this line's unfilled joker-eligible capacity.
 */
export function jokerSwapHintReliefForLine(
  swappableExposedJokers: number,
  slots: readonly CompletionSlot[],
  ctx: HandInventoryContext,
  completion: HandCompletionMetrics,
  _visibleNaturals: TileCountMap,
  _deck: DeckComposition,
  _isConcealed: boolean,
  isSinglesAndPairs: boolean,
): number {
  if (swappableExposedJokers <= 0 || isSinglesAndPairs || ctx.jokersDisallowed) {
    return 0
  }
  return Math.min(
    swappableExposedJokers,
    jokerEligibleCapacityRemaining(slots, ctx, completion),
  )
}

/** Light dampener when multiple natural needs compete for the same draw budget. */
function naturalCompetitionDampener(totalNaturalNeed: number): number {
  if (totalNaturalNeed <= 1) return 1
  return 1 / (1 + 0.15 * (totalNaturalNeed - 1))
}

/**
 * Solo completion probability (0–100) before the wall runs out.
 *
 * Analytical model:
 * - Wall draws + early Charleston exchange trials from the hidden pool (hypergeometric)
 * - Call windows for exposure-ready melds (or near-MJ pair/single declare)
 * - Slot-precise product blended with pooled “useful tile” cover while the wall is high
 *   (independence alone crushes opening Away-6..8 hands to ~1%)
 * - Jokers via nat+joker multivariate fill — never EV wipeout to 100%
 */
export function calculateWallCompletionProbability(
  input: WallCompletionProbabilityInput,
): number {
  const {
    slots,
    ctx,
    completion,
    visibleNaturals,
    visibleJokers,
    visibleBlanks,
    wallRemaining,
    isConcealed,
    isSinglesAndPairs,
    deck,
    playerRackTileCount,
    tilesNeededRough,
    jokerReliefFromSwapHint = 0,
  } = input

  if (tilesNeededRough <= 0 || completion.D <= 0) return 100
  if (wallRemaining <= 0) return 0
  if (isHandDeadByVisibleTiles(slots, ctx.naturals, visibleNaturals, deck)) return 0
  if (tilesNeededRough > wallRemaining) return 0

  // Pre-draw discard phase: East at 13 commits a discard then draws before needing pattern tiles.
  const pendingDrawBonus = playerRackTileCount < 14 ? 1 : 0
  const wallDraws = wallDrawTrials(wallRemaining, pendingDrawBonus)
  if (wallDraws <= 0) return 0

  const totalDeck =
    NATURAL_TILES_IN_DECK + deck.totalJokersInGame + deck.totalBlanksInGame
  const visibleTotal =
    sumVisibleNaturals(visibleNaturals) + visibleJokers + visibleBlanks
  const unknownPool = Math.max(0, totalDeck - playerRackTileCount - visibleTotal)
  if (unknownPool <= 0) return 0

  const exchangeTrials = earlyExchangeTrials(wallRemaining, visibleTotal)
  const baseAcquisition = wallDraws + exchangeTrials

  const { naturals: workingNaturals, fluidBlanks } = blankNaturalRelief(slots, ctx, deck)
  const jokerAlloc = allocateJokersForProbability(
    slots,
    workingNaturals,
    ctx.jokersInHand,
    ctx.jokersDisallowed,
    visibleNaturals,
    deck,
  )

  const jokerCapacityRemaining = jokerEligibleCapacityRemaining(slots, ctx, completion)
  let swapRemaining =
    tilesNeededRough > 4
      ? 0
      : Math.min(jokerReliefFromSwapHint, jokerCapacityRemaining)

  // Apply swap-hint relief with the same scarcity / call-ready preferences as hand jokers.
  const swapOnSlot = slots.map(() => 0)
  if (swapRemaining > 0) {
    const swapAlloc = allocateJokersForProbability(
      slots,
      workingNaturals,
      ctx.jokersInHand + swapRemaining,
      ctx.jokersDisallowed,
      visibleNaturals,
      deck,
    )
    for (let i = 0; i < slots.length; i++) {
      swapOnSlot[i] = Math.max(0, swapAlloc[i]! - jokerAlloc[i]!)
    }
  }

  let fluidBlankBudget = fluidBlanks
  let anyCallCredit = false
  let totalFlexNeed = 0
  let totalNaturalOuts = 0
  let meldJokerCapacity = 0

  type NaturalOnlyNeed = { outs: number; need: number; trials: number }
  type MeldNeed = {
    outs: number
    remaining: number
    trials: number
    minJokers: number
  }

  const naturalOnly: NaturalOnlyNeed[] = []
  const meldNeeds: MeldNeed[] = []

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]!
    const jokersOnSlot = jokerAlloc[i]! + swapOnSlot[i]!
    const heldNat = countNaturalsForSlot(slot.tileType, workingNaturals)
    let gapAfterWild = Math.max(0, slot.targetCount - heldNat - jokersOnSlot)
    if (gapAfterWild <= 0) continue

    if (fluidBlankBudget > 0) {
      const use = Math.min(fluidBlankBudget, gapAfterWild)
      gapAfterWild -= use
      fluidBlankBudget -= use
    }
    if (gapAfterWild <= 0) continue

    const outs = hiddenNaturalOutsForSlot(
      slot.tileType,
      workingNaturals,
      visibleNaturals,
      deck,
    )

    const callExtra = callTrialsForSlot(
      wallDraws,
      slot,
      workingNaturals,
      jokersOnSlot,
      isConcealed,
      isSinglesAndPairs,
      tilesNeededRough,
    )
    if (callExtra > 0) anyCallCredit = true
    const trials = Math.min(unknownPool, baseAcquisition + callExtra)

    const jokersAllowed = slotAllowsJokers(slot, ctx.jokersDisallowed)

    if (!jokersAllowed) {
      if (outs < gapAfterWild) return 0
      naturalOnly.push({ outs, need: gapAfterWild, trials })
      totalFlexNeed += gapAfterWild
      totalNaturalOuts += outs
      continue
    }

    const minJokers = Math.max(0, gapAfterWild - outs)
    meldNeeds.push({ outs, remaining: gapAfterWild, trials, minJokers })
    totalFlexNeed += gapAfterWild
    totalNaturalOuts += outs
    meldJokerCapacity += gapAfterWild
  }

  // Away exceeds acquisition trials: calls / exchanges can close only a modest gap.
  const acquisitionCap = baseAcquisition
  if (tilesNeededRough > acquisitionCap) {
    if (isConcealed || isSinglesAndPairs) {
      // Concealed / S&P: exchanges + wall only (no mid-hand calls).
      if (tilesNeededRough > acquisitionCap) return 0
    } else if (!anyCallCredit && exchangeTrials <= 0) {
      return 0
    } else {
      const pairSingleStillOpen = slots.some(
        (slot) =>
          slot.targetCount <= 2 &&
          countNaturalsForSlot(slot.tileType, workingNaturals) < slot.targetCount,
      )
      if (pairSingleStillOpen && tilesNeededRough > 2 && exchangeTrials <= 0) return 0
      const callSurplus = anyCallCredit
        ? Math.max(1, Math.round(wallDraws * 3 * CALL_WINDOW_DISCOUNT))
        : 0
      if (tilesNeededRough > acquisitionCap + callSurplus) return 0
    }
  }

  const hiddenJokers = Math.max(
    0,
    deck.totalJokersInGame - visibleJokers - ctx.jokersInHand,
  )
  const totalMinJokers = meldNeeds.reduce((s, m) => s + m.minJokers, 0)
  if (totalMinJokers > hiddenJokers) return 0

  if (naturalOnly.length === 0 && meldNeeds.length === 0) return 100

  let pPrecise = 1

  for (const n of naturalOnly) {
    pPrecise *= hypergeometricAtLeast(n.outs, n.trials, unknownPool, n.need)
  }

  // Hardest meld first (most mandatory jokers); consume reserved jokers so they aren't double-counted.
  meldNeeds.sort((a, b) => b.minJokers - a.minJokers || b.remaining - a.remaining)
  let jokersLeft = hiddenJokers
  for (const m of meldNeeds) {
    pPrecise *= probNatPlusJokerAtLeast(m.outs, jokersLeft, m.trials, unknownPool, m.remaining)
    jokersLeft = Math.max(0, jokersLeft - m.minJokers)
  }

  pPrecise *= naturalCompetitionDampener(totalFlexNeed)

  // Pooled cover: P(acquire enough useful tiles) — optimistic on type mix, good early-game signal.
  const usefulPool = Math.min(
    unknownPool,
    totalNaturalOuts + Math.min(hiddenJokers, meldJokerCapacity),
  )
  const prospectiveCalls =
    !isConcealed && !isSinglesAndPairs && wallRemaining >= 60
      ? Math.round(wallDraws * 3 * PROSPECTIVE_CALL_DISCOUNT)
      : 0
  const coverTrials = Math.min(unknownPool, baseAcquisition + prospectiveCalls)
  // Cover tracks pattern Away (tilesNeededRough), capped by post-joker/swap flex so hints help.
  // Using raw flex alone overstates need vs Away and crushes opening Prob % (mean hits << flex).
  const coverNeed = Math.min(totalFlexNeed, Math.max(0, tilesNeededRough))
  const pCover =
    coverNeed <= 0
      ? 1
      : hypergeometricAtLeast(usefulPool, coverTrials, unknownPool, coverNeed)

  const coverW = earlyCoverWeight(wallRemaining, tilesNeededRough)
  let p = linearBlend(pCover, pPrecise, coverW)

  const hiddenBlanks = Math.max(
    0,
    deck.totalBlanksInGame - visibleBlanks - ctx.blanksInHand,
  )
  // Small boost only — blanks do not wipe natural deficit via expected value.
  const blankBoost =
    deck.totalBlanksInGame > 0 && hiddenBlanks > 0 && totalFlexNeed > 0
      ? 1 + Math.min(0.25, hypergeometricAtLeast(hiddenBlanks, wallDraws, unknownPool, 1) * 0.25)
      : 1

  return pctFromProb(Math.min(1, Math.max(0, p * blankBoost)))
}

/**
 * @deprecated Use {@link calculateWallCompletionProbability}.
 * Rough proximity scaler kept for tests and legacy callers.
 */
export function estimateWallCompletionProbability(
  tilesNeeded: number,
  wallRemaining: number,
  rackProximityPercent: number,
): number {
  if (tilesNeeded <= 0) return 100
  if (wallRemaining <= 0 || tilesNeeded > wallRemaining) return 0

  const draws = wallRemaining
  const need = tilesNeeded
  const proximity = Math.min(100, Math.max(0, rackProximityPercent))

  const slack = draws - need
  const factor = slack / (slack + need * 2)
  return Math.min(99, Math.max(0, Math.round(proximity * factor)))
}

/** Return metrics for the permutation with the highest P_base (ties → lowest D). */
export function maxCompletionMetricsOverSlotSets(
  slotSets: readonly (readonly CompletionSlot[])[],
  ctx: HandInventoryContext,
  isConcealed: boolean,
): HandCompletionMetrics {
  let best: HandCompletionMetrics = { M_nat: 0, M_joker: 0, D: 14, P_base: 0, P: 0 }
  let bestSlots: readonly CompletionSlot[] = []
  for (const slots of slotSets) {
    if (slots.length === 0) continue
    const raw = computeHandCompletionMetrics(slots, ctx)
    if (raw.P_base > best.P_base || (raw.P_base === best.P_base && raw.D < best.D)) {
      best = raw
      bestSlots = slots
    }
  }
  if (bestSlots.length === 0) return best
  return finalizeCompletionMetrics(best, bestSlots, isConcealed)
}

export function dragonKeyForSuit(suit: 'bam' | 'dot' | 'crak'): string {
  return `d:${DEAD_HINT_DRAGON_FOR_SUIT[suit]}`
}

export function suitRankKey(suit: 'bam' | 'dot' | 'crak', rank: number): string {
  return `s:${suit}:${rank}`
}

export function rankAnyKey(rank: number): string {
  return `rank-any:${rank}`
}

/** Sum of missing natural tiles across completion slots (ignores jokers). */
export function totalMissingNaturalTiles(
  slots: readonly CompletionSlot[],
  naturals: TileCountMap,
): number {
  let m = 0
  for (const slot of slots) {
    const held = countNaturalsForSlot(slot.tileType, naturals)
    m += Math.max(0, slot.targetCount - held)
  }
  return m
}
