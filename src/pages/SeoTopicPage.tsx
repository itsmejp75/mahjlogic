import { useLayoutEffect } from 'react'
import { Link } from 'react-router-dom'
import appIconSrc from '../assets/mahjlogic-app-icon.svg?url'
import { applyAppThemeToDocument, DEFAULT_APP_THEME } from '../app/appTheme'
import { SEO_TOPICS, type SeoTopicId } from '../seo/topicPages'
import { usePageMeta } from '../seo/usePageMeta'
import '../styles/seo.css'

type Props = {
  topicId: SeoTopicId
}

export function SeoTopicPage({ topicId }: Props) {
  const topic = SEO_TOPICS[topicId]

  useLayoutEffect(() => {
    applyAppThemeToDocument(DEFAULT_APP_THEME)
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
      <div className="seo-topic__shell">
        <header className="seo-topic__header">
          <Link className="seo-topic__brand" to="/">
            <img src={appIconSrc} alt="" width={36} height={36} decoding="async" draggable={false} />
            <span>Mahj Logic</span>
          </Link>
          <nav className="seo-topic__nav" aria-label="Product">
            <Link to="/american-mah-jongg-practice">Practice</Link>
            <Link to="/mah-jongg-tile-checker">Tile checker</Link>
            <Link to="/american-mahjong-app">App</Link>
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
            <Link className="btn seo-topic__cta" to="/">
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
                <Link to="/">Sign in to MahjLogic</Link>
              </li>
            </ul>
          </nav>
        </article>

        <p className="seo-topic__back">
          <Link to="/">← Back to sign in</Link>
          <span aria-hidden="true"> · </span>
          <Link to="/privacy">Privacy</Link>
          <span aria-hidden="true"> · </span>
          <Link to="/terms">Terms</Link>
        </p>
      </div>
    </main>
  )
}
