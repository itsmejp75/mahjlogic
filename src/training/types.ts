import type { EastExposure, Suit, TileInstance } from '../mahjong/types'
import type { PassSlots } from '../mahjong/passTargets'
import type { BotExposure } from '../analysis/types'
import type { CardTextSeg } from '../card/cardText'
import type { CharlestonPhase } from '../mahjong/charleston'

/** Game snapshot the coach and hand-strength tools can reason about (grows over time). */
export type TrainingSnapshot = {
  hand: TileInstance[]
  passSlots: PassSlots
  wallRemaining: number
  discards: TileInstance[]
  exposures: BotExposure[]
  /** When set, coach can describe blind passes and courtesy size. */
  charlestonPhase?: CharlestonPhase
  /** After first left: waiting for Yes vs. skip to courtesy before second left. */
  awaitingSecondCharlestonChoice?: boolean
  /** East (player) exposures from claiming discards — filters **C** lines and hands that cannot absorb these melds. */
  eastExposures?: EastExposure[]
}

/**
 * Rough quality bucket — same *role* as XG’s blunder categories, but for mahjong we
 * will later back this with simulated P(Mahjong) or P(finish card) deltas, not Elo.
 */
export type EquityBand = 'best' | 'close' | 'inaccuracy' | 'blunder' | 'unknown'

export type CoachMoveNote = {
  label: string
  detail: string
  band: EquityBand
}

export type SuggestedHandLine = {
  id: string
  /** Plain-language title for screen readers and fallbacks. */
  title: string
  /** Optional color runs — same information as the PDF line when encoded. */
  titleSegments?: CardTextSeg[]
  /** Tiles from your hand **and** your exposures that fill this pattern (14-tile hand total). */
  matchedInHand: number
  tilesNeededRough: number
  wallRemaining: number
  visibleDeadMatches: number
  pressure: 'comfortable' | 'tight' | 'desperate'
  note: string
  section: string
  points: number
  closed: boolean
  /** Fixed line number within this section on the practice card (sequential; never changes with sort order). */
  cardLineNumber: number
  /** Official hand # from the league card when available (e.g. 1a, 2). */
  cardHandCode?: string
  /** Parenthetical note from the league card line. */
  cardParenthesis?: string
  /**
   * For `consecRanks` suit-permute patterns: identifies this as a secondary-tier entry showing
   * alternate (perm, base) combos at a worse "tiles away" than the primary entry.
   * All combos in `combos` tie at this tier's tiles-away distance and are rendered as a stack.
   */
  consecRanksTier?: { combos: Array<{ perm: Suit[]; base: number }> }
}

export type CoachReport = {
  headline: string
  moves: CoachMoveNote[]
  /** Truth-in-advertising for what powered this report. */
  engineMode: 'stub' | 'heuristic' | 'simulation'
  /** Ranked ideas from the practice “fake card” until NMJL data is wired in. */
  suggestedHands: SuggestedHandLine[]
}
