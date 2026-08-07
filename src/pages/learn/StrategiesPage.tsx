import { Link } from 'react-router-dom'
import { usePageMeta } from '../../seo/usePageMeta'
import { LearnShell } from './LearnShell'

export function StrategiesPage() {
  usePageMeta({
    title: 'American Mah Jongg Strategies | MahjLogic',
    description:
      'American Mah Jongg (Mahjong) strategy notes for NMJL-style play — coming soon in Mahj Logic Learn.',
    path: '/learn/strategies',
  })

  return (
    <LearnShell article>
      <article className="learn__doc">
        <h1>Strategies</h1>
        <p className="learn__lead">
          Practical tips for reading the card, pivoting during Charleston, and shaping a hand.
        </p>
        <p className="learn__note">
          This section is a placeholder for now. We&apos;ll add strategy notes here as we build them
          out — Charleston priorities, when to expose, joker timing, and more.
        </p>
        <p>
          Meanwhile, practice with helpers on in the App, or review{' '}
          <Link to="/learn/how-to-play">How to Play American Mah Jongg</Link>.
        </p>
        <p>
          <Link className="btn learn__open" to="/home">
            Play Now
          </Link>
        </p>
      </article>
    </LearnShell>
  )
}
