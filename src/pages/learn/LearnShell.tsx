import { useEffect, useLayoutEffect, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import mahjLogoSrc from '../../assets/mahj-logo.svg?url'
import logicLogoSrc from '../../assets/logic-logo.svg?url'
import { applyAppThemeToDocument, DEFAULT_APP_THEME } from '../../app/appTheme'
import { beginPlayEnterLoader, endPlayEnterLoader } from '../../auth/playEnterLoader'
import { useAuth } from '../../auth/AuthProvider'
import { LandingTileAtmosphere } from '../../components/LandingTileAtmosphere'
import '../../styles/learn.css'

type Props = {
  children: ReactNode
  /** Narrower column for long-form articles. */
  article?: boolean
}

export function LearnShell({ children, article = false }: Props) {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const onLearnHub = pathname === '/learn'

  useLayoutEffect(() => {
    applyAppThemeToDocument(DEFAULT_APP_THEME)
  }, [])

  useEffect(() => {
    endPlayEnterLoader()
  }, [])

  return (
    <main className="learn">
      <div className="landing__atmosphere" aria-hidden="true" />
      <div className="landing__glow landing__glow--cyan" aria-hidden="true" />
      <div className="landing__glow landing__glow--gold" aria-hidden="true" />
      <LandingTileAtmosphere />
      <header className="learn__top">
        <div className="learn__top-inner">
          <Link className="learn__brand" to="/" aria-label="Mahj Logic home">
            <img
              className="learn__mark-logo learn__mark-logo--mahj"
              src={mahjLogoSrc}
              alt=""
              decoding="async"
              draggable={false}
            />
            <img
              className="learn__mark-logo learn__mark-logo--logic"
              src={logicLogoSrc}
              alt=""
              decoding="async"
              draggable={false}
            />
            <span className="learn__tagline-sep" aria-hidden="true">
              —
            </span>
            <span className="learn__tagline">American Mah Jongg Intelligence</span>
          </Link>
          <nav className="learn__top-nav" aria-label="Site">
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
            <Link to="/learn" aria-current={onLearnHub || article ? 'page' : undefined}>
              Learn
            </Link>
          </nav>
        </div>
      </header>
      <div className="learn__shell">
        <p className="learn__back-wrap">
          {article ? (
            <Link className="learn__back" to="/learn">
              ← Learn
            </Link>
          ) : (
            <Link className="learn__back" to={user ? '/home' : '/'}>
              ← Home
            </Link>
          )}
        </p>
        {children}
        <p className="learn__footer">
          <Link to={user ? '/home' : '/'}>Home</Link>
          <span aria-hidden="true"> · </span>
          <Link to="/privacy">Privacy</Link>
          <span aria-hidden="true"> · </span>
          <Link to="/terms">Terms</Link>
        </p>
      </div>
    </main>
  )
}
