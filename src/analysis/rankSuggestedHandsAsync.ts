/**
 * Main-thread client for {@link ./rankSuggestedHands.worker.ts}.
 *
 * Keeps the last good ranking while a newer request is in flight so the suggested-hands panel
 * does not flash empty on every rack change. Falls back to sync `rankSuggestedHands` if the
 * worker cannot be created (rare) or returns an error.
 */
import { useEffect, useRef, useState } from 'react'
import type { PlayableCardId } from '../card/cardCatalog'
import type { SuggestedHandLine } from '../training/types'
import { rankSuggestedHands, type RankSuggestedHandsInput } from './suggestedHands'
import type {
  RankWorkerError,
  RankWorkerRequest,
  RankWorkerResponse,
} from './rankSuggestedHandsWorkerProtocol'

type Pending = {
  resolve: (lines: SuggestedHandLine[]) => void
  reject: (err: Error) => void
}

let sharedWorker: Worker | null = null
let workerUnavailable = false
let nextRequestId = 1
const pendingById = new Map<number, Pending>()

function getSharedWorker(): Worker | null {
  if (workerUnavailable) return null
  if (sharedWorker) return sharedWorker
  if (typeof Worker === 'undefined') {
    workerUnavailable = true
    return null
  }
  try {
    sharedWorker = new Worker(new URL('./rankSuggestedHands.worker.ts', import.meta.url), {
      type: 'module',
    })
    sharedWorker.onmessage = (event: MessageEvent<RankWorkerResponse | RankWorkerError>) => {
      const msg = event.data
      const pending = pendingById.get(msg.id)
      if (!pending) return
      pendingById.delete(msg.id)
      if (msg.type === 'rank-result') {
        pending.resolve(msg.lines)
      } else {
        pending.reject(new Error(msg.message || 'rank worker error'))
      }
    }
    sharedWorker.onerror = () => {
      // Permanent fallback after a hard worker failure (bad URL, parse error, etc.).
      workerUnavailable = true
      for (const [, p] of pendingById) {
        p.reject(new Error('rank worker failed'))
      }
      pendingById.clear()
      sharedWorker?.terminate()
      sharedWorker = null
    }
    return sharedWorker
  } catch {
    workerUnavailable = true
    return null
  }
}

function omitPatterns(input: RankSuggestedHandsInput): Omit<RankSuggestedHandsInput, 'patterns'> {
  const { patterns: _patterns, ...rest } = input
  return rest
}

/**
 * Rank the card book off the main thread when a worker is available; otherwise sync.
 */
export function rankSuggestedHandsAsync(
  cardId: PlayableCardId,
  input: RankSuggestedHandsInput,
): Promise<SuggestedHandLine[]> {
  const worker = getSharedWorker()
  if (!worker) {
    return Promise.resolve(rankSuggestedHands(input))
  }

  const id = nextRequestId++
  return new Promise<SuggestedHandLine[]>((resolve, reject) => {
    pendingById.set(id, { resolve, reject })
    const request: RankWorkerRequest = {
      type: 'rank',
      id,
      cardId,
      input: omitPatterns(input),
    }
    try {
      worker.postMessage(request)
    } catch (err) {
      pendingById.delete(id)
      // Structured-clone failure — sync path keeps the UI correct.
      resolve(rankSuggestedHands(input))
      void err
    }
  })
}

export type UseRankSuggestedHandsWorkerArgs = {
  /** Full ranking input (patterns may be present; worker ignores them and uses `cardId`). */
  input: RankSuggestedHandsInput
  /** When false, clears lines (end-game phases). */
  enabled: boolean
  cardId: PlayableCardId
  /**
   * Order-independent hand multiset signature — same gate as the former sync `useMemo` so a pure
   * rack reorder does not re-rank.
   */
  handSignature: string
}

/**
 * Async suggested-hands ranking for the East panel. Returns the latest completed result (stale
 * while a newer rank is in flight) so urgent rack paints stay snappy.
 */
export function useRankSuggestedHandsWorker({
  input,
  enabled,
  cardId,
  handSignature,
}: UseRankSuggestedHandsWorkerArgs): SuggestedHandLine[] {
  const [lines, setLines] = useState<SuggestedHandLine[]>([])
  const inputRef = useRef(input)
  inputRef.current = input
  const generationRef = useRef(0)

  useEffect(() => {
    if (!enabled) {
      generationRef.current += 1
      setLines([])
      return
    }

    const generation = ++generationRef.current
    const snapshot = inputRef.current

    let cancelled = false
    rankSuggestedHandsAsync(cardId, snapshot)
      .then((result) => {
        if (cancelled || generation !== generationRef.current) return
        setLines(result)
      })
      .catch(() => {
        if (cancelled || generation !== generationRef.current) return
        setLines(rankSuggestedHands(snapshot))
      })

    return () => {
      cancelled = true
    }
  }, [
    enabled,
    cardId,
    handSignature,
    input.wallRemaining,
    input.discards,
    input.exposures,
    input.playerClaimMelds,
    input.eastTableClaimMelds,
    input.patterns,
    input.deckSettings?.totalJokersInGame,
    input.deckSettings?.totalBlanksInGame,
    input.jokerSwapHintForProb?.enabled,
    input.jokerSwapHintForProb?.hand,
    input.jokerSwapHintForProb?.pendingDiscard,
    input.jokerSwapHintForProb?.botExposures,
    input.jokerSwapHintForProb?.eastExposures,
    input.liveClaimableDiscard,
  ])

  return lines
}
