import { useEffect, useLayoutEffect } from 'react'
import { flushSync } from 'react-dom'
import { Link } from 'react-router-dom'
import mahjLogoSrc from '../assets/mahj-logo.svg?url'
import logicLogoSrc from '../assets/logic-logo.svg?url'
import { applyAppThemeToDocument, DEFAULT_APP_THEME } from '../app/appTheme'
import { beginPlayEnterLoader, endPlayEnterLoader } from '../auth/playEnterLoader'
import { useAuth } from '../auth/AuthProvider'
import { LandingTileAtmosphere } from '../components/LandingTileAtmosphere'
import { SEO_TOPICS, type SeoTopicId } from '../seo/topicPages'
import { usePageMeta } from '../seo/usePageMeta'
import '../styles/seo.css'

type Props = {
  topicId: SeoTopicId
}

export function SeoTopicPage({ topicId }: Props) {
  const topic = SEO_TOPICS[topicId]
  const { user } = useAuth()

  useLayoutEffect(() => {
    applyAppThemeToDocument(DEFAULT_APP_THEME)
  }, [])

  useEffect(() => {
    endPlayEnterLoader()
  }, [])

  usePageMeta({
    title: topic.title,
    description: topic.description,
    path: topic.path,
    image: topic.image,
  })

  return (
    <main className="seo-topic">
      <div className="seo-topic__atmosphere" aria-hidden="true" />
      <LandingTileAtmosphere />
      <div className="seo-topic__shell">
        <header className="seo-topic__header">
          <Link className="seo-topic__brand" to="/" aria-label="Mahj Logic home">
            <img
              className="seo-topic__mark-logo seo-topic__mark-logo--mahj"
              src={mahjLogoSrc}
              alt=""
              decoding="async"
              draggable={false}
            />
            <img
              className="seo-topic__mark-logo seo-topic__mark-logo--logic"
              src={logicLogoSrc}
              alt=""
              decoding="async"
              draggable={false}
            />
            <span className="seo-topic__tagline-sep" aria-hidden="true">
              —
            </span>
            <span className="seo-topic__tagline">American Mah Jongg Intelligence</span>
          </Link>
          <nav className="seo-topic__top-nav" aria-label="Site">
            <Link to={user ? '/home' : '/'}>Home</Link>
            {user ? (
              <Link
                to="/play"
                state={{ playIntent: 'enter' }}
                onClick={() => {
                  flushSync(() => {
                    beginPlayEnterLoader()
                  })
                }}
              >
                Play
              </Link>
            ) : (
              <Link to="/login">Login</Link>
            )}
            {user ? <Link to="/rack-checker">Rack Checker</Link> : null}
            <Link to="/learn">Learn</Link>
          </nav>
        </header>

        <article className="seo-topic__doc">
          <div className="seo-topic__hero">
            <img
              className="seo-topic__hero-img"
              src={topic.heroImage}
              alt={topic.heroAlt}
              decoding="async"
              draggable={false}
            />
          </div>

          <h1>{topic.h1}</h1>
          <p className="seo-topic__lead">{topic.lead}</p>

          <p className="seo-topic__cta-wrap">
            <Link className="btn seo-topic__cta" to={topic.ctaTo}>
              {topic.ctaLabel}
            </Link>
          </p>

          {topic.sections.map((section) => (
            <section key={section.heading}>
              <h2>{section.heading}</h2>
              {section.paragraphs.map((p) => (
                <p key={p.slice(0, 48)}>{p}</p>
              ))}
              {section.bullets?.length ? (
                <ul>
                  {section.bullets.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}

          <nav className="seo-topic__related" aria-label="Related">
            <h2>Related</h2>
            <ul>
              {topic.related.map((r) => (
                <li key={r.to}>
                  <Link to={r.to}>{r.label}</Link>
                </li>
              ))}
              <li>
                <Link to="/home">Open Mahj Logic home</Link>
              </li>
              <li>
                <Link to="/">Sign in</Link>
              </li>
            </ul>
          </nav>
        </article>

        <p className="seo-topic__back">
          <Link to="/home">← Open app</Link>
          <span aria-hidden="true"> · </span>
          <Link to="/">Sign in</Link>
          <span aria-hidden="true"> · </span>
          <Link to="/privacy">Privacy</Link>
          <span aria-hidden="true"> · </span>
          <Link to="/terms">Terms</Link>
        </p>
      </div>
    </main>
  )
}
