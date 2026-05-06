import { useMemo, useState } from 'react'
import { postGameRackAndHighlights, suggestedHandCardRefDisplay, type RankSuggestedHandsInput } from '../analysis/suggestedHands'
import type { SuggestedHandLine } from '../training/types'
import { TileFace } from './TileFace'
import { CardColoredText } from './CardColoredText'

function lineLabelPlain(line: SuggestedHandLine): string {
  const ref = suggestedHandCardRefDisplay(line)
  return `${line.section} #${ref} — ${line.title}`
}

export type PostGameLoserRackRowProps = {
  /** Stabilize React state for tied-line selection when the screen or data changes. */
  rowId: string
  label: string
  bestTilesAway: number
  linesAtMin: SuggestedHandLine[]
  rankInput: RankSuggestedHandsInput
  showTiedLinePicker: boolean
  /** `wrapped` = `mahjong-win__bots-review-inner` (player win + wall). `flat` = bot-mj list. */
  cardVariant: 'wrapped' | 'flat'
  /**
   * `bot-mj` row: “−TBD pts” after the pattern. Omit on wall / player win lists.
   */
  trailingLabel?: 'bot-mj-loss-pts' | 'none'
}

/**
 * One losing seat: tiles-away, optional section ref, pattern title, optional dropdown when
 * several card lines share the best distance, then 14 tiles in the chosen hand’s left-to-right order.
 */
export function PostGameLoserRackRow({
  rowId,
  label,
  bestTilesAway,
  linesAtMin,
  rankInput,
  showTiedLinePicker,
  cardVariant,
  trailingLabel = 'none',
}: PostGameLoserRackRowProps) {
  const [tiedIndex, setTiedIndex] = useState(0)
  const safe = linesAtMin
  const line = safe[Math.min(tiedIndex, Math.max(0, safe.length - 1))] ?? safe[0]

  const { fullRack, bestIds } = useMemo(
    () =>
      line
        ? postGameRackAndHighlights(line, rankInput)
        : { fullRack: [] as const, bestIds: new Set<string>() },
    [line, rankInput],
  )

  if (!line) {
    return null
  }

  const header = (
    <div className="mahjong-win__bots-review-header">
      <span className="mahjong-win__bots-review-seat">{label}</span>
      <span className="mahjong-win__bots-review-away">
        {bestTilesAway === 0 ? '0 away' : `${bestTilesAway} away`}
      </span>
      {line.section ? (
        <span className="mahjong-win__bots-review-ref">
          {line.section} #{suggestedHandCardRefDisplay(line)}
        </span>
      ) : null}
      <div className="post-game-tied__pattern-line mahjong-win__bots-review-pattern">
        {line.titleSegments ? <CardColoredText segments={line.titleSegments} /> : line.title}
        {showTiedLinePicker && safe.length > 1 ? (
          <select
            className="post-game-tied__select"
            aria-label="Other hands with the same tiles-away distance on the practice card"
            value={tiedIndex}
            onChange={(e) => setTiedIndex(Number(e.target.value))}
          >
            {safe.map((h, i) => (
              <option
                key={`${rowId}-opt-${i}-${h.id}-${h.matchedInHand}-${suggestedHandCardRefDisplay(h)}`}
                value={i}
              >
                {lineLabelPlain(h)}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      {trailingLabel === 'bot-mj-loss-pts' ? (
        <span className="mahjong-win__bot-mj-pts">−TBD pts</span>
      ) : null}
    </div>
  )

  const tiles = (
    <div className="mahjong-win__bots-review-tiles">
      {fullRack.map((tile) => (
        <div
          key={tile.id}
          className={[
            'mahjong-win__bots-review-tile',
            bestIds.has(tile.id) ? '' : 'mahjong-win__bots-review-tile--dim',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <TileFace def={tile.def} />
        </div>
      ))}
    </div>
  )

  if (cardVariant === 'wrapped') {
    return (
      <div className="mahjong-win__bots-review-inner">
        {header}
        {tiles}
      </div>
    )
  }

  return (
    <>
      {header}
      {tiles}
    </>
  )
}
