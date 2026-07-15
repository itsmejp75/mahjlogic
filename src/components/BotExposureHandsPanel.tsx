import { memo } from 'react'
import type { PracticePattern } from '../card/practicePatterns'
import type { BotSeat } from '../analysis/types'
import { suggestedHandSectionMenuLabel } from '../suggestedHands/filterSettings'
import { CardColoredText } from './CardColoredText'

type Props = {
  seat: BotSeat
  patterns: readonly PracticePattern[]
  discardTraySurface?: boolean
  onClose?: () => void
}

function patternCardRef(p: PracticePattern): string {
  return p.cardHandCode?.trim() || '—'
}

export const BotExposureHandsPanel = memo(function BotExposureHandsPanel({
  seat,
  patterns,
  discardTraySurface = false,
  onClose,
}: Props) {
  const rootClassName = [
    'panel',
    'panel--hands',
    'bot-exposure-hands-panel',
    discardTraySurface ? 'suggested-hands-popup__user-shift' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const title = `${seat} - ${patterns.length} possible hand${patterns.length === 1 ? '' : 's'}`

  return (
    <section className={rootClassName} aria-label={title}>
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
        <div className="hands-panel__list-column">
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
                  return (
                    <div key={p.id} className="bot-exposure-hands-list__row" role="listitem">
                      <div className="bot-exposure-hands-list__cat">
                        <span className="hands-sheet__category">
                          {suggestedHandSectionMenuLabel(p.section)}
                          <span className="hands-sheet__section-num"> - {cardRef}</span>
                        </span>
                      </div>
                      <div className="bot-exposure-hands-list__hand" aria-label={p.title}>
                        <span className="hands-sheet__hand-title-line">
                          {p.titleSegments?.length ? (
                            <CardColoredText segments={p.titleSegments} />
                          ) : (
                            p.title
                          )}
                        </span>
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
