/**
 * Off-main-thread suggested-hands ranking.
 *
 * PracticePattern carries non-cloneable `matches` functions, so the worker loads the card book
 * itself from `cardId` instead of receiving patterns over postMessage.
 */
import { patternsForCard } from '../card/cardCatalog'
import { setActiveCardPatterns } from '../card/activeCardPatternsScope'
import { rankSuggestedHands } from './suggestedHands'
import type {
  RankWorkerError,
  RankWorkerRequest,
  RankWorkerResponse,
} from './rankSuggestedHandsWorkerProtocol'

self.onmessage = (event: MessageEvent<RankWorkerRequest>) => {
  const msg = event.data
  if (!msg || msg.type !== 'rank') return

  try {
    const patterns = patternsForCard(msg.cardId)
    setActiveCardPatterns(patterns)
    const lines = rankSuggestedHands({ ...msg.input, patterns })
    const response: RankWorkerResponse = { type: 'rank-result', id: msg.id, lines }
    self.postMessage(response)
  } catch (err) {
    const response: RankWorkerError = {
      type: 'rank-error',
      id: msg.id,
      message: err instanceof Error ? err.message : String(err),
    }
    self.postMessage(response)
  }
}
