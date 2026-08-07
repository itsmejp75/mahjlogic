import { Link } from 'react-router-dom'
import { usePageMeta } from '../../seo/usePageMeta'
import { LearnShell } from './LearnShell'

const CARDS = [
  {
    to: '/learn/how-to-play',
    title: 'How to Play American Mah Jongg',
    description: 'Rules, Charleston, calls, jokers, and how a hand is won.',
  },
  {
    to: '/learn/app-guide',
    title: 'App Guide',
    description: 'How to use Practice, Rack Checker, suggested hands, and helpers in Mahj Logic.',
  },
  {
    to: '/learn/strategies',
    title: 'Strategies',
    description: 'Practical tips for reading the card and shaping a hand — coming soon.',
  },
] as const

export function LearnHubPage() {
  usePageMeta({
    title: 'Learn American Mah Jongg | MahjLogic',
    description:
      'Learn American Mah Jongg (Mahjong): how to play, Mahj Logic app guide, and strategies for NMJL-style practice.',
    path: '/learn',
  })

  return (
    <LearnShell>
      <h1 className="learn__title">Learn American Mah Jongg</h1>
      <p className="learn__lead">
        Start with the rules, then learn how Mahj Logic helps you practice. Strategies will grow here
        over time.
      </p>

      <h2 className="learn__section-title">Guides</h2>
      <div className="learn__cards">
        {CARDS.map((card) => (
          <article key={card.to} className="learn__card">
            <h2>{card.title}</h2>
            <p>{card.description}</p>
            <Link className="btn learn__open" to={card.to}>
              Open →
            </Link>
          </article>
        ))}
      </div>
    </LearnShell>
  )
}
