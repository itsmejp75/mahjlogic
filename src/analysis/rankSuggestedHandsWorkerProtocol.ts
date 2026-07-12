import type { PlayableCardId } from '../card/cardCatalog'
import type { SuggestedHandLine } from '../training/types'
import type { RankSuggestedHandsInput } from './suggestedHands'

export type RankWorkerRequest = {
  type: 'rank'
  id: number
  cardId: PlayableCardId
  /** Serializable ranking input — omit `patterns` (resolved from `cardId`). */
  input: Omit<RankSuggestedHandsInput, 'patterns'>
}

export type RankWorkerResponse = {
  type: 'rank-result'
  id: number
  lines: SuggestedHandLine[]
}

export type RankWorkerError = {
  type: 'rank-error'
  id: number
  message: string
}
