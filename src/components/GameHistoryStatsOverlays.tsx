import { useCallback, useEffect, useState } from 'react'
import { PLAYABLE_CARD_LABEL, type PlayableCardId, isPlayableCardId } from '../card/cardCatalog'
import {
  assistLabels,
  clearGameResults,
  emptyGameStatsSummary,
  fetchGameResults,
  fetchStatsSummary,
  gameOutcomeLabel,
  type GameResultRow,
  type GameStatsSummary,
} from '../lib/gameResults'

function cardLabel(cardId: string): string {
  return isPlayableCardId(cardId) ? PLAYABLE_CARD_LABEL[cardId as PlayableCardId] : cardId
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function handRef(row: Pick<GameResultRow, 'hand_section' | 'card_hand_code' | 'hand_title'>): string {
  const bits: string[] = []
  if (row.hand_section) bits.push(row.hand_section)
  if (row.card_hand_code) bits.push(`#${row.card_hand_code}`)
  if (bits.length) return bits.join(' · ')
  return row.hand_title ?? ''
}

type PanelKind = 'stats' | 'history'

type Props = {
  kind: PanelKind
  onClose: () => void
}

export function GameHistoryStatsOverlay({ kind, onClose }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<GameStatsSummary | null>(null)
  const [rows, setRows] = useState<GameResultRow[]>([])
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    if (kind === 'stats') {
      const { summary: next, error: err } = await fetchStatsSummary({ limit: 5000 })
      setSummary(next)
      setError(err)
    } else {
      const { rows: next, error: err } = await fetchGameResults({ limit: 50 })
      setRows(next)
      setError(err)
    }
    setLoading(false)
  }, [kind])

  useEffect(() => {
    let cancelled = false
    setConfirmReset(false)
    void (async () => {
      setLoading(true)
      setError(null)
      if (kind === 'stats') {
        const { summary: next, error: err } = await fetchStatsSummary({ limit: 5000 })
        if (cancelled) return
        setSummary(next)
        setError(err)
      } else {
        const { rows: next, error: err } = await fetchGameResults({ limit: 50 })
        if (cancelled) return
        setRows(next)
        setError(err)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [kind])

  async function onConfirmReset() {
    if (resetBusy) return
    setResetBusy(true)
    const { error: err } = await clearGameResults()
    setResetBusy(false)
    if (err) {
      setError(err)
      setConfirmReset(false)
      return
    }
    setConfirmReset(false)
    setSummary(emptyGameStatsSummary())
    setRows([])
    await reload()
  }

  const title = kind === 'stats' ? 'Stats' : 'Game History'

  return (
    <div className="game-meta-overlay" role="presentation" onClick={onClose}>
      <div
        className="game-meta-dialog charleston-error-dialog--menu-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-meta-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="game-meta-dialog__header">
          <h2 id="game-meta-dialog-title" className="game-meta-dialog__title">
            {title}
          </h2>
          <button
            type="button"
            className="btn charleston-error-dialog__rack-action game-meta-dialog__close"
            aria-label="Close"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div
          className={[
            'game-meta-dialog__body',
            kind === 'stats' ? 'game-meta-dialog__body--stats' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {loading ? (
            <p className="game-meta-dialog__status">Loading…</p>
          ) : error ? (
            <p className="game-meta-dialog__status game-meta-dialog__status--error">
              {error.includes('relation') || error.includes('does not exist')
                ? 'Stats are not set up yet. Run the Supabase SQL migration, then try again.'
                : error}
            </p>
          ) : kind === 'stats' && summary ? (
            <StatsBody
              summary={summary}
              confirmReset={confirmReset}
              resetBusy={resetBusy}
              onRequestReset={() => setConfirmReset(true)}
              onCancelReset={() => setConfirmReset(false)}
              onConfirmReset={() => void onConfirmReset()}
            />
          ) : kind === 'history' ? (
            <HistoryBody rows={rows} />
          ) : null}
        </div>
      </div>
    </div>
  )
}

function StatsBody({
  summary,
  confirmReset,
  resetBusy,
  onRequestReset,
  onCancelReset,
  onConfirmReset,
}: {
  summary: GameStatsSummary
  confirmReset: boolean
  resetBusy: boolean
  onRequestReset: () => void
  onCancelReset: () => void
  onConfirmReset: () => void
}) {
  const hasAnyStarts = summary.finished + summary.newRacks > 0
  const canReset = hasAnyStarts

  return (
    <>
      {!hasAnyStarts ? (
        <p className="game-meta-dialog__status">
          No games yet. Finish a hand (or start a new rack) and your results will show up here.
        </p>
      ) : (
        <>
          <ul className="game-meta-stats">
            <li>
              <span className="game-meta-stats__label">Finished</span>
              <span className="game-meta-stats__value">
                {summary.finished}{' '}
                <span className="game-meta-stats__pct">({summary.finishedPercent}%)</span>
              </span>
            </li>
            <li>
              <span className="game-meta-stats__label">Finish streak</span>
              <span className="game-meta-stats__value">{summary.finishStreak}</span>
            </li>
            <li>
              <span className="game-meta-stats__label">Wins</span>
              <span className="game-meta-stats__value">
                {summary.wins}{' '}
                <span className="game-meta-stats__pct">({summary.winPercent}%)</span>
              </span>
            </li>
            <li>
              <span className="game-meta-stats__label">Losses</span>
              <span className="game-meta-stats__value">
                {summary.losses}{' '}
                <span className="game-meta-stats__pct">({summary.lossPercent}%)</span>
              </span>
            </li>
            <li>
              <span className="game-meta-stats__label">Wall games</span>
              <span className="game-meta-stats__value">
                {summary.wallGames}{' '}
                <span className="game-meta-stats__pct">({summary.wallPercent}%)</span>
              </span>
            </li>
            <li>
              <span className="game-meta-stats__label">Unassisted wins</span>
              <span className="game-meta-stats__value">{summary.unassistedWins}</span>
            </li>
            <li>
              <span className="game-meta-stats__label">Assisted wins</span>
              <span className="game-meta-stats__value">{summary.assistedWins}</span>
            </li>
            <li>
              <span className="game-meta-stats__label">Points won</span>
              <span className="game-meta-stats__value">{summary.pointsWon}</span>
            </li>
            <li>
              <span className="game-meta-stats__label">Points lost</span>
              <span className="game-meta-stats__value">{summary.pointsLost}</span>
            </li>
          </ul>
          <p className="game-meta-dialog__footnote">
            Finished % is hands played to a result (win, loss, or wall) out of all starts, including
            optional new-rack early exits — those are not losses. Win / loss / wall % are among
            finished hands only. Assisted means helper tools were used (see History for * details).
            Points use NMJL payouts: discard win collects 4× the card value; self-pick collects 6×.
            On a bot win you pay 2× if you discarded (or on a self-pick), otherwise 1×. Dead hands
            end the round here, so they do not add points won or lost.
          </p>

          <h3 className="game-meta-dialog__section-title">Hands you’ve won</h3>
          {summary.winningHands.length === 0 ? (
            <p className="game-meta-dialog__status">No recorded winning hands yet.</p>
          ) : (
            <ul className="game-meta-hands">
              {summary.winningHands.map((hand) => (
                <li key={`${hand.cardId}:${hand.patternId}`} className="game-meta-hands__row">
                  <div className="game-meta-hands__main">
                    <span className="game-meta-hands__title">{hand.handTitle}</span>
                    <span className="game-meta-hands__meta">
                      {cardLabel(hand.cardId)}
                      {hand.handSection ? ` · ${hand.handSection}` : ''}
                      {hand.cardHandCode ? ` · #${hand.cardHandCode}` : ''}
                    </span>
                  </div>
                  <span className="game-meta-hands__count">{hand.count}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <div className="game-meta-dialog__reset">
        {confirmReset ? (
          <>
            <p className="game-meta-dialog__status">
              Reset all stats, history, and points? This cannot be undone.
            </p>
            <div className="game-meta-dialog__reset-actions">
              <button
                type="button"
                className="btn charleston-error-dialog__rack-action"
                disabled={resetBusy}
                onClick={onCancelReset}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn charleston-error-dialog__rack-action game-meta-dialog__reset-confirm"
                disabled={resetBusy}
                onClick={onConfirmReset}
              >
                {resetBusy ? 'Resetting…' : 'Reset'}
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            className="btn charleston-error-dialog__rack-action game-meta-dialog__reset-btn"
            disabled={!canReset}
            onClick={onRequestReset}
          >
            Reset stats
          </button>
        )}
      </div>
    </>
  )
}

function HistoryBody({ rows }: { rows: GameResultRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="game-meta-dialog__status">
        No game history yet. Finished hands will appear here.
      </p>
    )
  }

  return (
    <ul className="game-meta-history">
      {rows.map((row) => {
        const tools = row.outcome === 'new_rack' ? [] : assistLabels(row.assists)
        const assisted = tools.length > 0
        return (
          <li key={row.id} className="game-meta-history__row">
            <div className="game-meta-history__top">
              <span
                className={[
                  'game-meta-history__outcome',
                  row.outcome === 'player_win' ? 'game-meta-history__outcome--win' : '',
                  row.outcome === 'wall_game' ? 'game-meta-history__outcome--wall' : '',
                  row.outcome === 'new_rack' ? 'game-meta-history__outcome--new-rack' : '',
                  row.outcome === 'bot_win' || row.outcome === 'dead_hand'
                    ? 'game-meta-history__outcome--loss'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {gameOutcomeLabel(row.outcome)}
                {assisted ? '*' : ''}
                {typeof row.points === 'number' &&
                (row.outcome === 'player_win' ||
                  row.outcome === 'bot_win' ||
                  row.outcome === 'dead_hand')
                  ? ` · ${row.points} pts`
                  : ''}
              </span>
              <span className="game-meta-history__when">{formatWhen(row.created_at)}</span>
            </div>
            <div className="game-meta-history__detail">
              <span>{cardLabel(row.card_id)}</span>
              {row.outcome === 'player_win' && row.hand_title ? (
                <span className="game-meta-history__hand">
                  {row.hand_title}
                  {handRef(row) ? ` (${handRef(row)})` : ''}
                </span>
              ) : null}
            </div>
            {assisted ? (
              <div className="game-meta-history__assists">{tools.join(' · ')}</div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
