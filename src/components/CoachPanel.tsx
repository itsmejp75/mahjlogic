import type { CoachReport, EquityBand } from '../training/types'

type Props = {
  report: CoachReport
}

const bandLabel: Record<EquityBand, string> = {
  best: 'Best',
  close: 'Close',
  inaccuracy: 'Inaccuracy',
  blunder: 'Blunder',
  unknown: 'N/A',
}

export function CoachPanel({ report }: Props) {
  return (
    <aside className="coach-panel" aria-labelledby="coach-heading">
      <div className="coach-panel__stripe" aria-hidden />
      <div className="coach-panel__body">
        <h2 id="coach-heading" className="coach-panel__title">
          Training coach
        </h2>
        <p className="coach-panel__mode">
          Engine: <span className="coach-panel__mode-value">{report.engineMode}</span>
        </p>
        <p className="coach-panel__headline">{report.headline}</p>
        <ul className="coach-panel__list">
          {report.moves.map((m, i) => (
            <li
              key={`${m.label}-${i}`}
              className={`coach-panel__item coach-panel__item--${m.band}`}
            >
              <span className="coach-panel__band">{bandLabel[m.band]}</span>
              <span className="coach-panel__label">{m.label}</span>
              <span className="coach-panel__detail">{m.detail}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}
