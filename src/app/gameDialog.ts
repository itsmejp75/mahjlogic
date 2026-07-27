import type { RankSuggestedHandsInput } from '../analysis/suggestedHands'
import type { DeadHandReason } from '../mahjong/deadHandReason'

/**
 * Fixed full-screen overlay: `card` matches Charleston/call; `table` is felt + gold for swap;
 * `mahjong-blocked` is the coach modal for illegal Mah Jongg on a discard.
 */
export type GameBlockingDialog =
  | { variant: 'card'; message: string }
  | { variant: 'table'; title: string; message: string }
  | { variant: 'mahjong-blocked'; rankInput: RankSuggestedHandsInput }
  | { variant: 'dead-hand-warning' }
  | { variant: 'mahjong-dead-warning'; rankInput: RankSuggestedHandsInput; deadHandReason: DeadHandReason }
  | { variant: 'call-exposure-dead-warning'; rankInput: RankSuggestedHandsInput }
  | {
      variant: 'call-meld-size-warning'
      rankInput: RankSuggestedHandsInput
      neededHandTiles: 3 | 4 | 5
    }
  | { variant: 'invalid-call-meld-warning' }
  | { variant: 'discard-dead-warning'; rankInput: RankSuggestedHandsInput }
  | { variant: 'concealed-call-warning' }
  /** Signed-in reload: resume autosaved hand or start a new game. */
  | { variant: 'resume-game' }
