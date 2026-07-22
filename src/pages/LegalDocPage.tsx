import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import appIconSrc from '../assets/mahjlogic-app-icon.svg?url'
import '../styles/legal.css'

type LegalDocPageProps = {
  title: string
  children: ReactNode
}

export function LegalDocPage({ title, children }: LegalDocPageProps) {
  return (
    <main className="legal">
      <div className="legal__atmosphere" aria-hidden="true" />
      <div className="legal__shell">
        <header className="legal__header">
          <Link className="legal__brand" to="/">
            <img src={appIconSrc} alt="" width={36} height={36} decoding="async" draggable={false} />
            <span>Mahj Logic</span>
          </Link>
          <nav className="legal__nav" aria-label="Legal">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
          </nav>
        </header>

        <article className="legal__doc">
          <h1>{title}</h1>
          <p className="legal__updated">Last updated: July 21, 2026</p>
          {children}
        </article>

        <p className="legal__back">
          <Link to="/">← Back to sign in</Link>
        </p>
      </div>
    </main>
  )
}
