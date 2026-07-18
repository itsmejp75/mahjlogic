import { memo, useLayoutEffect, useMemo, useRef } from 'react'
import type { PracticePattern } from '../card/practicePatterns'
import type { TileDef } from '../mahjong/types'
import type { CardInk } from '../card/cardText'
import { patternLinePreviewSlots } from '../card/patternLinePreview'
import {
  placeExposureMeldsOnCardLine,
  type ExposureMeld,
} from '../analysis/botExposureHandStrip'
import { resolveCardLineDefsForClaimMelds } from '../analysis/suggestedHands'
import type { BotSeat } from '../analysis/types'
import { CardHandNotation, showCardHandNotation } from '../card/CardHandNotation'
import { suggestedHandSectionMenuLabel } from '../suggestedHands/filterSettings'
import { CardColoredText } from './CardColoredText'
import { TileFace } from './TileFace'

type Props = {
  seat: BotSeat
  patterns: readonly PracticePattern[]
  /** Claim melds already on the table for this seat — boxed on the tile strip. */
  exposureMelds?: readonly ExposureMeld[]
  discardTraySurface?: boolean
  onClose?: () => void
}

function patternCardRef(p: PracticePattern): string {
  return p.cardHandCode?.trim() || '—'
}

/** Same strip ink rules as suggested-hands mini tiles (suits use rack face colors). */
function stripTileFaceCardInk(def: TileDef, ink: CardInk | undefined): CardInk | undefined {
  if (def.cat === 'suit') return undefined
  if (def.cat === 'dragon') {
    if (def.dragon === 'red') return 'red'
    if (def.dragon === 'green') return 'green'
    if (def.dragon === 'soap') return 'navy'
  }
  if (def.cat === 'flower') return 'rack-flower'
  if (def.cat === 'wind' || def.cat === 'joker') return 'rack-wind'
  return ink
}

type StripCell = {
  def: TileDef
  cardInk?: CardInk
  meldRunId: number | null
}

type StripRun = {
  meldRunId: number | null
  cells: StripCell[]
}

function segmentStripIntoRuns(cells: readonly StripCell[]): StripRun[] {
  const runs: StripRun[] = []
  for (const cell of cells) {
    const last = runs[runs.length - 1]
    if (!last || last.meldRunId !== cell.meldRunId) {
      runs.push({ meldRunId: cell.meldRunId, cells: [cell] })
    } else {
      last.cells.push(cell)
    }
  }
  return runs
}

function stripCellsForPattern(
  pattern: PracticePattern,
  exposureMelds: readonly ExposureMeld[],
): StripCell[] {
  const preview = patternLinePreviewSlots(pattern)
  if (preview.length === 0) return []

  if (exposureMelds.length === 0) {
    return preview.map((s) => ({ def: s.def, cardInk: s.cardInk, meldRunId: null }))
  }

  // Resolve consec / suit stand-ins from exposures (Runs 11 22 333 → 77 88 999 for 9s), then box.
  const resolvedDefs = resolveCardLineDefsForClaimMelds(pattern, exposureMelds)
  const placed = placeExposureMeldsOnCardLine(resolvedDefs, exposureMelds)
  return preview.map((s, i) => ({
    def: placed.defs[i]!,
    cardInk: s.cardInk,
    meldRunId: placed.meldRunId[i] ?? null,
  }))
}

const BotExposureHandTiles = memo(function BotExposureHandTiles({
  pattern,
  exposureMelds,
}: {
  pattern: PracticePattern
  exposureMelds: readonly ExposureMeld[]
}) {
  const runs = useMemo(
    () => segmentStripIntoRuns(stripCellsForPattern(pattern, exposureMelds)),
    [pattern, exposureMelds],
  )
  if (runs.length === 0) return null

  return (
    <div className="bot-exposure-hands-list__tiles-row" role="presentation">
      {runs.map((run, runIdx) => (
        <div
          key={`${pattern.id}-run-${runIdx}`}
          className={[
            'bot-exposure-hands-list__tile-run',
            run.meldRunId !== null ? 'bot-exposure-hands-list__tile-run--exposure' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {run.cells.map((cell, i) => (
            <div
              key={`${pattern.id}-run-${runIdx}-tile-${i}`}
              className="bot-exposure-hands-list__tile-cell"
            >
              <TileFace def={cell.def} cardInk={stripTileFaceCardInk(cell.def, cell.cardInk)} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
})

export const BotExposureHandsPanel = memo(function BotExposureHandsPanel({
  seat,
  patterns,
  exposureMelds = [],
  discardTraySurface = false,
  onClose,
}: Props) {
  const listColumnRef = useRef<HTMLDivElement>(null)

  /** Freeze list-column width for tile math (same token as SuggestedHandsPanel). */
  useLayoutEffect(() => {
    const el = listColumnRef.current
    if (!el) return

    const refresh = () => {
      const w = el.clientWidth
      if (!Number.isFinite(w) || w < 1) return
      const next = `${w}px`
      if (el.style.getPropertyValue('--suggest-hands-panel-cqw') !== next) {
        el.style.setProperty('--suggest-hands-panel-cqw', next)
      }
    }

    refresh()
    const ro = new ResizeObserver(refresh)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const rootClassName = [
    'panel',
    'panel--hands',
    'bot-exposure-hands-panel',
    discardTraySurface ? 'suggested-hands-popup__user-shift' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const title = `${seat}'s ${patterns.length} possible hand${patterns.length === 1 ? '' : 's'}`

  return (
    <section className={rootClassName} aria-label={title} data-nosnippet>
      <div className="hands-panel__content">
        <div className="bot-exposure-hands-panel__toolbar">
          <p className="bot-exposure-hands-panel__title">{title}</p>
        </div>
        {onClose ? (
          <button
            type="button"
            className="bot-exposure-hands-panel__close"
            aria-label={`Hide ${seat} possible hands`}
            onClick={onClose}
          >
            <svg
              className="bot-exposure-hands-panel__close-x"
              viewBox="0 0 12 12"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M3 3l6 6M9 3L3 9" />
            </svg>
          </button>
        ) : null}
        <div ref={listColumnRef} className="hands-panel__list-column">
          <div className="hands-list-scroll bot-exposure-hands-panel__scroll">
            {patterns.length === 0 ? (
              <p className="bot-exposure-hands-panel__empty">No open card hands fit these exposures.</p>
            ) : (
              <div
                className="bot-exposure-hands-list"
                id="bot-exposure-hands-list"
                role="list"
                aria-label={`${seat} possible card hands`}
              >
                {patterns.map((p) => {
                  const cardRef = patternCardRef(p)
                  const handNotationOn = showCardHandNotation()
                  return (
                    <div key={p.id} className="bot-exposure-hands-list__row" role="listitem">
                      <div className="bot-exposure-hands-list__cat">
                        <span className="hands-sheet__category">
                          {suggestedHandSectionMenuLabel(p.section)}
                          <span className="hands-sheet__section-num"> - {cardRef}</span>
                        </span>
                      </div>
                      <div
                        className="bot-exposure-hands-list__hand"
                        aria-label={handNotationOn ? p.title : `Hand ${cardRef}`}
                      >
                        <span className="hands-sheet__hand-title-line">
                          <CardHandNotation>
                            {p.titleSegments?.length ? (
                              <CardColoredText segments={p.titleSegments} />
                            ) : (
                              p.title
                            )}
                          </CardHandNotation>
                        </span>
                      </div>
                      <div className="bot-exposure-hands-list__tiles">
                        <BotExposureHandTiles pattern={p} exposureMelds={exposureMelds} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
})
