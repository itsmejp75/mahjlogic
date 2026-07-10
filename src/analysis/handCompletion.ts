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
  /** When true, jokers cannot contribute (concealed or Singles & Pairs). */
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
    // NMJL: jokers never substitute for flowers ({@link meldDefIsJokerEligible}).
    if (t > 2 && n < t && slot.tileType !== 'f') jokerCapacity += t - n
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

function pairOrSingleStillMissing(slots: readonly CompletionSlot[], naturals: TileCountMap): boolean {
  for (const slot of slots) {
    if (slot.targetCount > 2) continue
    const held = countNaturalsForSlot(slot.tileType, naturals)
    if (held < slot.targetCount) return true
  }
  return false
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

/** Natural tiles still needed in single/pair slots (callable for Mah Jongg on a discard). */
function pairSingleNaturalGap(slots: readonly CompletionSlot[], naturals: TileCountMap): number {
  let gap = 0
  for (const slot of slots) {
    if (slot.targetCount > 2) continue
    const held = countNaturalsForSlot(slot.tileType, naturals)
    gap += Math.max(0, slot.targetCount - held)
  }
  return gap
}

function estimatePlayerTrials(
  wallRemaining: number,
  isConcealed: boolean,
  isSinglesAndPairs: boolean,
  slots: readonly CompletionSlot[],
  naturals: TileCountMap,
  tilesNeededRough: number,
): number {
  const baseDraws = Math.floor(wallRemaining / 4)
  if (baseDraws <= 0) return wallRemaining > 0 ? 1 : 0

  const callRestricted =
    isConcealed || isSinglesAndPairs || pairOrSingleStillMissing(slots, naturals)

  if (callRestricted) {
    const pairGap = pairSingleNaturalGap(slots, naturals)
    // Open hand near Mah Jongg: the winning tile may be called off an opponent discard,
    // including the natural that completes a pair or single (NMJL declare).
    if (!isConcealed && tilesNeededRough > 0 && tilesNeededRough <= 2 && pairGap > 0) {
      const opponentDiscards = baseDraws * 3
      const expanded = Math.round((baseDraws + opponentDiscards) * 0.85)
      return Math.min(wallRemaining, Math.max(baseDraws, expanded))
    }
    return baseDraws
  }

  // Open meld-only: wall draws plus opponent discard windows, discounted for skip risk.
  const expanded = Math.round((baseDraws + baseDraws * 3) * 0.85)
  return Math.min(wallRemaining, Math.max(baseDraws, expanded))
}

function blankCushionForHand(
  slots: readonly CompletionSlot[],
  ctx: HandInventoryContext,
  deck: DeckComposition,
  hiddenBlanks: number,
  trials: number,
  unknownPool: number,
): number {
  if (deck.totalBlanksInGame <= 0) return 0

  const { blanksRemaining } = applyBlankTileRedemption(
    slots,
    ctx.naturals,
    ctx.discardCounts,
    ctx.blanksInHand,
  )
  const reactive = ctx.blanksInHand - blanksRemaining

  // Held blanks not yet exchanged — flexible end-game optionality.
  const fluidHeld = blanksRemaining

  // Hidden blanks still in wall / opponent racks.
  const expectedFromWall =
    unknownPool > 0 && trials > 0
      ? Math.min(hiddenBlanks, Math.round((trials * hiddenBlanks) / unknownPool))
      : 0

  // Reactive conversions already cover specific deficits; fluid + expected are generic cushion.
  return reactive + fluidHeld + expectedFromWall
}

function slotGapBreakdown(
  slot: CompletionSlot,
  naturals: TileCountMap,
  visibleNaturals: TileCountMap,
  deck: DeckComposition,
  jokersDisallowed: boolean,
): { naturalGap: number; jokerGap: number; jokerGapFromDeadNaturals: number; naturalOuts: number } {
  const held = countNaturalsForSlot(slot.tileType, naturals)
  const gap = Math.max(0, slot.targetCount - held)
  if (gap <= 0) return { naturalGap: 0, jokerGap: 0, jokerGapFromDeadNaturals: 0, naturalOuts: 0 }

  const outs = hiddenNaturalOutsForSlot(slot.tileType, naturals, visibleNaturals, deck)

  // Singles, pairs, and flowers must be filled with naturals (flowers have 8 copies).
  if (slot.targetCount <= 2 || jokersDisallowed || slot.tileType === 'f') {
    return { naturalGap: gap, jokerGap: 0, jokerGapFromDeadNaturals: 0, naturalOuts: outs }
  }

  // Pung / kong / quint: only `copiesForTileType` naturals exist (4 per suit, 8 flowers above).
  // Any gap beyond acquirable naturals can be filled with jokers.
  const maxCopies = copiesForTileType(slot.tileType, deck)
  const theoreticalNaturalRoom = Math.min(
    gap,
    Math.max(0, Math.min(slot.targetCount, maxCopies) - held),
  )
  const naturalGap = Math.min(theoreticalNaturalRoom, outs)
  const jokerGap = gap - naturalGap
  const jokerGapFromDeadNaturals = Math.min(gap, Math.max(0, theoreticalNaturalRoom - outs))
  return { naturalGap, jokerGap, jokerGapFromDeadNaturals, naturalOuts: outs }
}

function aggregateSlotGaps(
  slots: readonly CompletionSlot[],
  naturals: TileCountMap,
  visibleNaturals: TileCountMap,
  deck: DeckComposition,
  jokersDisallowed: boolean,
): { naturalGap: number; jokerGap: number; jokerGapFromDeadNaturals: number; naturalOuts: number } {
  let naturalGap = 0
  let jokerGap = 0
  let jokerGapFromDeadNaturals = 0
  let naturalOuts = 0
  for (const slot of slots) {
    const b = slotGapBreakdown(slot, naturals, visibleNaturals, deck, jokersDisallowed)
    naturalGap += b.naturalGap
    jokerGap += b.jokerGap
    jokerGapFromDeadNaturals += b.jokerGapFromDeadNaturals
    naturalOuts += Math.min(b.naturalGap, b.naturalOuts)
  }
  return { naturalGap, jokerGap, jokerGapFromDeadNaturals, naturalOuts }
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
    const t = slot.targetCount
    if (t <= 2 || slot.tileType === 'f') continue
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
  isConcealed: boolean,
  isSinglesAndPairs: boolean,
): number {
  if (swappableExposedJokers <= 0 || isConcealed || isSinglesAndPairs || ctx.jokersDisallowed) {
    return 0
  }
  return Math.min(
    swappableExposedJokers,
    jokerEligibleCapacityRemaining(slots, ctx, completion),
  )
}

function capCompletionTrials(
  estimatedTrials: number,
  wallRemaining: number,
  pendingDrawBonus: number,
  tilesNeededRough: number,
  isConcealed: boolean,
  isSinglesAndPairs: boolean,
): number {
  const wallDraws = Math.floor(wallRemaining / 4)
  const physicalPickCap = wallDraws + pendingDrawBonus
  const rawTrials = estimatedTrials + pendingDrawBonus

  // Near Mah Jongg on open hands: opponent discard windows can complete a pair/single declare.
  if (
    !isConcealed &&
    !isSinglesAndPairs &&
    tilesNeededRough > 0 &&
    tilesNeededRough <= 2
  ) {
    return Math.max(
      physicalPickCap,
      Math.min(rawTrials, wallRemaining),
    )
  }

  // Endgame: need exceeds realistic wall draws — don't treat every opponent discard as a pickup.
  if (tilesNeededRough > physicalPickCap) {
    return physicalPickCap
  }

  return rawTrials
}

/** Combine rack proximity, draw slack, live outs, and wildcard relief into a 0–99 score. */
function viabilityCompletionScore(
  deficit: number,
  trials: number,
  supplyPool: number,
  jokerGapFromDeadNaturals: number,
  completion: HandCompletionMetrics,
  blankRelief: number,
  deck: DeckComposition,
): number {
  const proximity = Math.min(100, Math.max(0, completion.P)) / 100
  const slack = trials - deficit
  if (slack < 0) return 0

  const wallFactor = slack / (slack + deficit * 0.6)
  const deadNaturalPenalty =
    deficit > 0 ? Math.min(0.45, (jokerGapFromDeadNaturals / deficit) * 0.45) : 0
  const poolFactor = Math.min(1, supplyPool / Math.max(1, deficit)) * (1 - deadNaturalPenalty)
  const blankFactor =
    deck.totalBlanksInGame > 0
      ? 1 + Math.min(0.35, (blankRelief / Math.max(1, deficit)) * 0.35)
      : 1

  const raw = proximity * wallFactor * poolFactor * blankFactor
  return Math.min(99, Math.max(0, Math.round(raw * 100)))
}

/**
 * Solo completion probability (0–100) before the wall runs out.
 * Uses hidden pool math with configurable joker count (8/10) and optional blanks (0/2/4/6).
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

  const trials = estimatePlayerTrials(
    wallRemaining,
    isConcealed,
    isSinglesAndPairs,
    slots,
    ctx.naturals,
    tilesNeededRough,
  )
  // Pre-draw discard phase: East at 13 commits a discard then draws before needing pattern tiles.
  const pendingDrawBonus = playerRackTileCount < 14 ? 1 : 0
  const effectiveTrials = capCompletionTrials(
    trials,
    wallRemaining,
    pendingDrawBonus,
    tilesNeededRough,
    isConcealed,
    isSinglesAndPairs,
  )

  if (
    effectiveTrials <= 0 ||
    tilesNeededRough > wallRemaining ||
    tilesNeededRough > effectiveTrials
  ) {
    return 0
  }

  const totalDeck =
    NATURAL_TILES_IN_DECK + deck.totalJokersInGame + deck.totalBlanksInGame
  const visibleTotal =
    sumVisibleNaturals(visibleNaturals) + visibleJokers + visibleBlanks
  const unknownPool = Math.max(0, totalDeck - playerRackTileCount - visibleTotal)
  if (unknownPool <= 0) return 0

  const gaps = aggregateSlotGaps(
    slots,
    ctx.naturals,
    visibleNaturals,
    deck,
    ctx.jokersDisallowed,
  )
  const hiddenJokers = Math.max(
    0,
    deck.totalJokersInGame - visibleJokers - ctx.jokersInHand,
  )
  const jokerReliefFromWall =
    unknownPool > 0 && effectiveTrials > 0
      ? Math.min(
          gaps.jokerGap,
          hiddenJokers,
          Math.round((effectiveTrials * hiddenJokers) / unknownPool),
        )
      : 0
  const jokerReliefFromHand = Math.min(gaps.jokerGap, completion.M_joker)
  const jokerCapacityRemaining = jokerEligibleCapacityRemaining(slots, ctx, completion)
  const swapHintRelief =
    tilesNeededRough > 4
      ? 0
      : Math.min(jokerReliefFromSwapHint, jokerCapacityRemaining)

  const hiddenBlanks = Math.max(
    0,
    deck.totalBlanksInGame - visibleBlanks - ctx.blanksInHand,
  )
  const blankRelief = blankCushionForHand(slots, ctx, deck, hiddenBlanks, effectiveTrials, unknownPool)

  let swapReliefRemaining = swapHintRelief
  const naturalShiftFromSwap = Math.min(
    Math.max(0, gaps.naturalGap - blankRelief),
    swapReliefRemaining,
  )
  swapReliefRemaining -= naturalShiftFromSwap
  const jokerShiftFromSwap = Math.min(
    Math.max(0, gaps.jokerGap - jokerReliefFromHand - jokerReliefFromWall),
    swapReliefRemaining,
  )
  const jokerRemaining = Math.max(
    0,
    gaps.jokerGap - jokerReliefFromHand - jokerReliefFromWall - jokerShiftFromSwap,
  )

  const naturalRemaining = Math.max(0, gaps.naturalGap - blankRelief - naturalShiftFromSwap)
  const deficit = naturalRemaining + jokerRemaining
  if (deficit <= 0) return 100
  if (tilesNeededRough > wallRemaining || deficit > effectiveTrials) return 0

  const uncommittedHandJokers = Math.max(0, ctx.jokersInHand - completion.M_joker)
  const jokerSupply = hiddenJokers + uncommittedHandJokers + jokerReliefFromWall + swapHintRelief
  if (gaps.naturalOuts < naturalRemaining) return 0
  if (jokerRemaining > jokerSupply) return 0

  const supplyPool =
    gaps.naturalOuts + Math.min(hiddenJokers, gaps.jokerGap) + jokerReliefFromWall + swapHintRelief

  return viabilityCompletionScore(
    deficit,
    effectiveTrials,
    supplyPool,
    gaps.jokerGapFromDeadNaturals,
    completion,
    blankRelief,
    deck,
  )
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
