import type { RankSuggestedHandsInput } from '../analysis/suggestedHands'
import type { DeadHandReason } from '../mahjong/deadHandReason'
import type { PlayableCardId } from '../card/cardCatalog'

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
  | { variant: 'discard-dead-warning'; rankInput: RankSuggestedHandsInput }
  | { variant: 'different-card-requires-new-game'; pendingCardId: PlayableCardId }
  | { variant: 'concealed-call-warning' }
