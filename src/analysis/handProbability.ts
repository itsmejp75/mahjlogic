/**
 * Hand completion scoring — re-exports the NMJL inventory fill model.
 *
 * @see handCompletion.ts for M_nat / M_joker / D / P formulas.
 * @see handCompletionSlots.ts for suit-permutation enumeration.
 */

export type {
  CompletionSlot,
  DeckComposition,
  HandCompletionMetrics,
  HandInventoryContext,
  TileCountMap,
  WallCompletionProbabilityInput,
} from './handCompletion'

export {
  applyBlankTileRedemption,
  applyCompletionComplexityAdjustments,
  calculateWallCompletionProbability,
  computeHandCompletionMetrics,
  copiesForTileType,
  countNaturalsForSlot,
  DEFAULT_DECK_COMPOSITION,
  dragonKeyForSuit,
  estimateWallCompletionProbability,
  finalizeCompletionMetrics,
  hypergeometricAtLeast,
  isHandDeadByVisibleTiles,
  jokerBanRatio,
  jokerSwapHintReliefForLine,
  maxCompletionMetricsOverSlotSets,
  rankAnyKey,
  suitRankKey,
  totalMissingNaturalTiles,
} from './handCompletion'

export {
  buildDeterministicCompletionSlots,
  buildInventoryContext,
  computePatternCompletionMetrics,
  computeTierCompletionMetrics,
  enumerateCompletionSlotSets,
  resolveBestPatternCompletion,
} from './handCompletionSlots'

/** @deprecated Use {@link HandCompletionMetrics.P}. */
export type HandGroupStructure = 'single' | 'pair' | 'pung' | 'kong' | 'quint'

/** @deprecated Use {@link CompletionSlot}. */
export type TargetHandGroup = {
  tileType: string
  countNeeded: number
  structure: HandGroupStructure
}

/** @deprecated Use {@link HandInventoryContext} + {@link computePatternCompletionMetrics}. */
export type HandCompletionProbabilityInput = {
  targetHandGroups: readonly TargetHandGroup[]
  playerHand: import('./handCompletion').TileCountMap
  playerJokersInHand: number
  blankTilesHeldByPlayer: number
  visibleTableTiles: import('./handCompletion').TileCountMap
  visibleDiscardTiles?: import('./handCompletion').TileCountMap
  visibleJokersOnTable: number
  visibleBlanksOnTable: number
  wallTilesRemaining: number
  isConcealed: boolean
  totalJokersInGame?: number
  totalBlanksInGame?: number
  tilesNeededRough?: number
}

import {
  type CompletionSlot,
  type HandInventoryContext,
  applyCompletionComplexityAdjustments,
  computeHandCompletionMetrics,
} from './handCompletion'

/** @deprecated Use {@link computePatternCompletionMetrics}. */
export function calculateHandCompletionProbability(
  input: HandCompletionProbabilityInput,
): number {
  const slots: CompletionSlot[] = input.targetHandGroups.map((g) => ({
    tileType: g.tileType,
    targetCount: g.countNeeded,
  }))
  const ctx: HandInventoryContext = {
    naturals: input.playerHand,
    jokersInHand: input.playerJokersInHand,
    blanksInHand: input.blankTilesHeldByPlayer,
    discardCounts: input.visibleDiscardTiles ?? {},
    jokersDisallowed: input.isConcealed,
  }
  if (slots.length === 0 && input.tilesNeededRough != null) {
    const filled = Math.max(0, 14 - input.tilesNeededRough)
    const P_base = Math.round((filled / 14) * 100)
    return applyCompletionComplexityAdjustments(P_base, input.isConcealed, 0)
  }
  return computeHandCompletionMetrics(slots, ctx).P
}

/** @deprecated Use {@link computeHandCompletionMetrics}. */
export function estimateCompletionFromTilesAway(tilesNeededRough: number): number {
  if (tilesNeededRough <= 0) return 100
  const filled = Math.max(0, 14 - tilesNeededRough)
  return Math.round((filled / 14) * 100)
}

/** Standard American natural copy counts (flowers are pooled under key `f`). */
export function defaultCopiesForTileType(tileType: string): number {
  return tileType === 'f' ? 8 : 4
}
