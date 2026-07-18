import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  postGameRackAndHighlights,
  suggestedHandCardRefDisplay,
  suggestedHandCategoryDashCardRef,
  type RankSuggestedHandsInput,
} from '../analysis/suggestedHands'
import type { TileInstance } from '../mahjong/types'
import { CardHandNotation } from '../card/CardHandNotation'
import type { SuggestedHandLine } from '../training/types'
import { TileFace } from './TileFace'
import { CardColoredText } from './CardColoredText'

/** Split card-ordered rack into runs; consecutive exposure tiles share one meld frame. */
function segmentRackIntoExposureRuns(
  fullRack: readonly TileInstance[],
  claimMelds: ReadonlyArray<{ tiles: TileInstance[] }> | undefined,
): { meldIdx: number | null; tiles: TileInstance[] }[] {
  const idToMeld = new Map<string, number>()
  claimMelds?.forEach((meld, mi) => {
    for (const t of meld.tiles) idToMeld.set(t.id, mi)
  })
  const runs: { meldIdx: number | null; tiles: TileInstance[] }[] = []
  for (const tile of fullRack) {
    const mi = idToMeld.get(tile.id)
    const meldIdx = mi === undefined ? null : mi
    const last = runs[runs.length - 1]
    if (!last || last.meldIdx !== meldIdx) {
      runs.push({ meldIdx, tiles: [tile] })
    } else {
      last.tiles.push(tile)
    }
  }
  return runs
}

function TiedLineHandLabel({ line }: { line: SuggestedHandLine }) {
  return (
    <>
      <span className="post-game-tied__ref">{suggestedHandCategoryDashCardRef(line)}</span>
      <CardHandNotation
        fallback={null}
      >
        <span className="post-game-tied__sep"> — </span>
        {line.titleSegments?.length ? (
          <CardColoredText segments={line.titleSegments} />
        ) : (
          line.title
        )}
      </CardHandNotation>
    </>
  )
}

function PostGameTiedLinePicker({
  rowId,
  lines,
  selectedIndex,
  onSelect,
}: {
  rowId: string
  lines: SuggestedHandLine[]
  selectedIndex: number
  onSelect: (index: number) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const selected = lines[selectedIndex] ?? lines[0]

  useEffect(() => {
    if (!open) return
    const onDocMouseDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (!selected) return null

  return (
    <div className="post-game-tied__picker" ref={rootRef}>
      <button
        type="button"
        className="post-game-tied__select post-game-tied__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label="Choose among tied hands at the same tiles-away distance"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <span className="post-game-tied__trigger-text">
          <TiedLineHandLabel line={selected} />
        </span>
      </button>
      {open ? (
        <ul
          id={listId}
          className="post-game-tied__menu"
          role="listbox"
          aria-label="Tied hands at the same tiles-away distance"
        >
          {lines.map((hand, index) => (
            <li
              key={`${rowId}-opt-${index}-${hand.id}-${hand.matchedInHand}-${suggestedHandCardRefDisplay(hand)}`}
              role="option"
              aria-selected={index === selectedIndex}
              className={[
                'post-game-tied__option',
                index === selectedIndex ? 'post-game-tied__option--selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                onSelect(index)
                setOpen(false)
              }}
            >
              <TiedLineHandLabel line={hand} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
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
  /** Featured top row for this overlay: larger rack (You on wall / your win; winning seat when a bot won). */
  playerSeatFocus?: boolean
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
  playerSeatFocus = false,
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

  const tileRuns = useMemo(
    () => segmentRackIntoExposureRuns(fullRack, rankInput.playerClaimMelds),
    [fullRack, rankInput.playerClaimMelds],
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
        <span className="mahjong-win__bots-review-ref">{suggestedHandCategoryDashCardRef(line)}</span>
      ) : null}
      <div
        className="post-game-tied__pattern-line mahjong-win__bots-review-pattern"
        data-nosnippet
      >
        {showTiedLinePicker && safe.length > 1 ? (
          <PostGameTiedLinePicker
            rowId={rowId}
            lines={safe}
            selectedIndex={tiedIndex}
            onSelect={setTiedIndex}
          />
        ) : (
          <CardHandNotation>
            {line.titleSegments ? (
              <CardColoredText segments={line.titleSegments} />
            ) : (
              line.title
            )}
          </CardHandNotation>
        )}
      </div>
      {trailingLabel === 'bot-mj-loss-pts' ? (
        <span className="mahjong-win__bot-mj-pts">−TBD pts</span>
      ) : null}
    </div>
  )

  const tiles = (
    <div className="mahjong-win__bots-review-tiles">
      {tileRuns.map((run, runIdx) => (
        <div
          key={`run-${runIdx}-${run.tiles[0]?.id ?? runIdx}`}
          className={[
            'mahjong-win__bots-review-tile-run',
            run.meldIdx !== null ? 'mahjong-win__bots-review-tile-run--exposure' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {run.tiles.map((tile) => (
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
      ))}
    </div>
  )

  if (cardVariant === 'wrapped') {
    return (
      <div
        className={[
          'mahjong-win__bots-review-inner',
          playerSeatFocus ? 'mahjong-win__bots-review-inner--player-focus' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
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
