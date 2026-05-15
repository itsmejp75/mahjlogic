import { useMemo, useState } from 'react'
import { getActiveCardPatterns } from '../card/activeCardPatternsScope'
import type { PracticePattern } from '../card/practicePatterns'
import {
  getRackTilesNotHelpingPattern,
  rankSuggestedHands,
  suggestedHandCategoryDashCardRef,
  type RankSuggestedHandsInput,
} from '../analysis/suggestedHands'
import { suggestedHandSectionMenuLabel } from '../suggestedHands/filterSettings'
import type { SuggestedHandLine } from '../training/types'
import { CardColoredText } from './CardColoredText'
import { TileFace } from './TileFace'

const PRACTICE_CARD_CAPTION =
  'Teaching card: built-in practice hands (NMJL-style placeholder — not the official NMJL PDF).'

function ruleBulletsForPattern(p: PracticePattern): string[] {
  const out: string[] = []
  out.push(
    p.closed
      ? 'This line is marked concealed (C) on the card: league rules generally require it to be won on self-draw, and you may not expose from a discard except to declare Mah Jongg on this line.'
      : 'Exposed hand — you may claim discards to build exposures when the rules of this line allow.',
  )
  out.push(`Practice-card points for this line: ${p.points}.`)
  switch (p.section) {
    case 'ANY LIKE NUMBERS':
      out.push(
        'Like-numbers family: three suits; all ordinary tiles share one rank (1–9); dragons match suits (Green → Bam, Red → Crak, Soap → Dot) when the line uses dragons.',
      )
      break
    case '2468':
      out.push('2468 family: even-numbered suit tiles only, plus the flowers, dragons, and winds shown on that line.')
      break
    case '13579':
      out.push('13579 family: odd-numbered suit tiles only, following the ranks and honors on the card line.')
      break
    case 'MATH':
      out.push('Addition hands: follow the year / zero / digit arithmetic shown on the card for each line.')
      break
    case 'QUINTS':
      out.push('Quints: five identical tiles in a suit group where the card shows quint pungs or kong-like shapes.')
      break
    case 'CONSECUTIVE RUNS':
      out.push('Consecutive runs: suit runs in the lengths and dragons shown on the card line.')
      break
    case 'SINGLES AND PAIRS':
      out.push('Singles and pairs: no jokers in these hands on the league card; the practice engine mirrors that for this section.')
      break
    default:
      out.push(`Section “${p.section}”: follow the NMJL card layout for pairs, pungs, kongs, and honors on this line.`)
  }
  out.push(
    'Jokers on the practice card may fill openings in 3+ identical-tile groups where the engine allows.',
  )
  return out
}

type Props = {
  rankInput: RankSuggestedHandsInput
  onDismiss: () => void
}

export function IllegalMahjongDialog({ rankInput, onDismiss }: Props) {
  const lines = useMemo(() => rankSuggestedHands(rankInput), [rankInput])
  const rack = useMemo(
    () => [
      ...rankInput.hand,
      ...(rankInput.playerClaimMelds ?? []).flatMap((e) => e.tiles),
    ],
    [rankInput],
  )

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const effectiveId =
    selectedId && lines.some((l) => l.id === selectedId) ? selectedId : (lines[0]?.id ?? '')
  const selected: SuggestedHandLine | null =
    lines.find((l) => l.id === effectiveId) ?? lines[0] ?? null

  const sections = useMemo(() => [...new Set(lines.map((l) => l.section))], [lines])
  const handsInActiveSection = selected
    ? lines.filter((l) => l.section === selected.section)
    : lines

  const patternBook = rankInput.patterns ?? getActiveCardPatterns()
  const pattern: PracticePattern | undefined = selected
    ? patternBook.find((p) => p.id === selected.id)
    : undefined

  const unusedTiles = useMemo(() => {
    if (!pattern) return [] as typeof rack
    return getRackTilesNotHelpingPattern(rack, pattern)
  }, [rack, pattern])

  const rules = pattern ? ruleBulletsForPattern(pattern) : []

  return (
    <>
      <button
        type="button"
        className="charleston-error-dialog__dismiss"
        aria-label="Close"
        onClick={onDismiss}
      >
        ×
      </button>
      <h2 id="mj-blocked-title" className="charleston-error-dialog__title charleston-error-dialog__title--mj">
        THIS HAND IS NOT MAH JONGG
      </h2>
      <div className="mahjong-blocked-modal__scroll">
        {!lines.length ? (
          <p className="mahjong-blocked-modal__lead">
            No practice-card lines match your current exposures for scoring hints. On the real NMJL card,
            your exposures must belong to a family you are playing toward.
          </p>
        ) : (
          <>
            <p className="mahjong-blocked-modal__lead">
              Were you going for one of these hands? Use the selectors to explore the closest practice-card
              lines (same engine as Suggested hands).
            </p>
            <div className="mahjong-blocked-modal__select-row">
              <label className="mahjong-blocked-modal__field">
                <span className="mahjong-blocked-modal__label">Closest hands — section</span>
                <select
                  className="mahjong-blocked-modal__select"
                  aria-label="Practice card section"
                  value={selected?.section ?? ''}
                  onChange={(e) => {
                    const sec = e.target.value
                    const first = lines.find((l) => l.section === sec)
                    if (first) setSelectedId(first.id)
                  }}
                >
                  {sections.map((sec) => (
                    <option key={sec} value={sec}>
                      {suggestedHandSectionMenuLabel(sec)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mahjong-blocked-modal__field">
                <span className="mahjong-blocked-modal__label">Hand</span>
                <select
                  className="mahjong-blocked-modal__select"
                  aria-label="Practice card hand line"
                  value={effectiveId}
                  onChange={(e) => setSelectedId(e.target.value)}
                >
                  {handsInActiveSection.map((l) => (
                    <option key={l.id} value={l.id}>
                      {suggestedHandCategoryDashCardRef(l)} — {l.title}
                      {l.closed ? ' (C)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {selected ? (
              <div className="mahjong-blocked-modal__white-panel">
                <p className="mahjong-blocked-modal__line-summary">
                  {suggestedHandCategoryDashCardRef(selected)} — {selected.tilesNeededRough} tiles away (
                  {selected.closed ? 'Concealed' : 'Exposed'}, {selected.points}
                  pt)
                </p>
                <div className="mahjong-blocked-modal__pattern-title" aria-label={selected.title}>
                  {selected.titleSegments?.length ? (
                    <CardColoredText segments={selected.titleSegments} />
                  ) : (
                    selected.title
                  )}
                  {selected.closed ? (
                    <span className="mahjong-blocked-modal__c-mark" aria-label="Concealed line on card">
                      C
                    </span>
                  ) : null}
                </div>
                <p className="mahjong-blocked-modal__unused-label">
                  Tiles in your rack that do not increase this line’s greedy match (heuristic — not league
                  officiating):
                </p>
                <div className="mahjong-blocked-modal__tiles" role="list">
                  {unusedTiles.length ? (
                    unusedTiles.map((t) => (
                      <div key={t.id} className="mahjong-blocked-modal__tile-wrap" role="listitem">
                        <TileFace def={t.def} />
                      </div>
                    ))
                  ) : (
                    <p className="mahjong-blocked-modal__unused-empty">
                      Under this heuristic, every rack tile either contributes to the match count or is tied
                      with duplicates — you still need different tiles or structure to reach Mah Jongg.
                    </p>
                  )}
                </div>
              </div>
            ) : null}
          </>
        )}

        <p className="mahjong-blocked-modal__league">{PRACTICE_CARD_CAPTION}</p>

        {pattern ? (
          <div className="mahjong-blocked-modal__rules">
            <h3 className="mahjong-blocked-modal__rules-heading">Rules for this hand (coach summary)</h3>
            <ul className="mahjong-blocked-modal__rules-list">
              {rules.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <div className="charleston-error-dialog__actions charleston-error-dialog__actions--center">
        <button type="button" className="btn game-blocking-dialog__ok-btn" onClick={onDismiss}>
          OK
        </button>
      </div>
    </>
  )
}
