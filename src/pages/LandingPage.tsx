import { useLayoutEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { markPlayEnterFastPath } from '../app/playLocationState'
import mahjLogoSrc from '../assets/mahj-logo.svg?url'
import logicLogoSrc from '../assets/logic-logo.svg?url'
import { applyAppThemeToDocument, DEFAULT_APP_THEME } from '../app/appTheme'
import { useAuth } from '../auth/AuthProvider'
import { LandingTileAtmosphere } from '../components/LandingTileAtmosphere'
import { usePageMeta } from '../seo/usePageMeta'
import '../styles/landing.css'

export function LandingPage() {
  usePageMeta({
    title: 'MahjLogic: American Mah Jongg Intelligence',
    description:
      'MahjLogic helps you practice American Mah Jongg (Mahjong) with suggested hands and tiles, tile probabilities, and stats — smart guidance in one console.',
    path: '/',
  })

  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const [signOutBusy, setSignOutBusy] = useState(false)

  /** Marketing always paints Abyss; do not rewrite localStorage (cloud restores on sign-in). */
  useLayoutEffect(() => {
    applyAppThemeToDocument(DEFAULT_APP_THEME)
  }, [])

  async function onSignOut() {
    if (signOutBusy) return
    setSignOutBusy(true)
    try {
      await signOut()
    } finally {
      setSignOutBusy(false)
    }
  }

  function goPlay() {
    markPlayEnterFastPath()
    navigate('/play', { state: { playIntent: 'enter' } })
  }

  return (
    <main className="landing">
      <div className="landing__atmosphere" aria-hidden="true" />
      <div className="landing__glow landing__glow--cyan" aria-hidden="true" />
      <div className="landing__glow landing__glow--gold" aria-hidden="true" />
      <LandingTileAtmosphere />

      <header className="landing__header">
        <div className="landing__header-inner">
          <div className="landing__brand-mark" aria-label="Mahj Logic">
            <img
              className="landing__mark-logo landing__mark-logo--mahj"
              src={mahjLogoSrc}
              alt=""
              decoding="async"
              draggable={false}
            />
            <img
              className="landing__mark-logo landing__mark-logo--logic"
              src={logicLogoSrc}
              alt=""
              decoding="async"
              draggable={false}
            />
            <span className="landing__tagline-sep" aria-hidden="true">
              —
            </span>
            <p className="landing__tagline">American Mah Jongg Intelligence</p>
          </div>
          <nav className="landing__top-nav" aria-label="Site">
            <Link to={user ? '/home' : '/'} aria-current={user ? undefined : 'page'}>
              Home
            </Link>
            <Link to="/learn">Learn</Link>
            {user ? <Link to="/rack-checker">Rack Checker</Link> : null}
            {user ? (
              <Link
                to="/play"
                onClick={(e) => {
                  e.preventDefault()
                  goPlay()
                }}
              >
                Play
              </Link>
            ) : (
              <Link to="/login">Login</Link>
            )}
          </nav>
        </div>
      </header>

      <div className="landing__shell">
        <div className="landing__frame landing__frame--signed-in">
          <section className="landing__features" aria-label="Mahj Logic modes">
            <article className="landing__feature">
              <div className="landing__feature-media">
                <img
                  className="landing__feature-img"
                  src="/marketing/practice.jpg"
                  alt="Mahj Logic practice table"
                  decoding="async"
                  draggable={false}
                />
              </div>
              <div className="landing__feature-body">
                <h2 className="landing__feature-title">Practice</h2>
                <p className="landing__feature-copy">
                  Play against bots and practice American Mah Jongg in an Intelligent All-In-One
                  Console with guidance — suggested hands, highlighted tiles, discard tracking,
                  opponent hand identification, and other hints.
                </p>
                <div className="landing__feature-actions">
                  {user ? (
                    <button
                      type="button"
                      className="btn landing-auth__action-btn landing-auth__action-btn--primary landing__feature-cta"
                      onClick={goPlay}
                    >
                      Play
                    </button>
                  ) : (
                    <Link
                      className="btn landing-auth__action-btn landing-auth__action-btn--primary landing__feature-cta"
                      to="/login"
                      state={{ from: '/play' }}
                    >
                      Login to Play
                    </Link>
                  )}
                </div>
              </div>
            </article>

            <article className="landing__feature">
              <div className="landing__feature-media">
                <img
                  className="landing__feature-img"
                  src="/marketing/rack-checker.jpg"
                  alt="Mahj Logic Rack Checker"
                  decoding="async"
                  draggable={false}
                />
              </div>
              <div className="landing__feature-body">
                <h2 className="landing__feature-title">Rack Checker</h2>
                <p className="landing__feature-copy">
                  Enter your tiles to see the closest matching hands on the card. See
                  probabilities of finishing your hand before the wall runs out. Spot overlaps
                  and sections you might have overlooked.
                </p>
                <div className="landing__feature-actions">
                  {user ? (
                    <Link
                      className="btn landing-auth__action-btn landing-auth__action-btn--primary landing__feature-cta"
                      to="/rack-checker"
                    >
                      Open Rack Checker
                    </Link>
                  ) : (
                    <Link
                      className="btn landing-auth__action-btn landing-auth__action-btn--primary landing__feature-cta"
                      to="/login"
                      state={{ from: '/rack-checker' }}
                    >
                      Login for Rack Checker
                    </Link>
                  )}
                </div>
              </div>
            </article>
          </section>

          {user ? (
            <div className="landing__account-footer">
              <div className="landing__account">
                <p className="landing__account-status">
                  Signed in as{' '}
                  <span className="landing__account-email">{user.email ?? 'account'}</span>
                </p>
                <Link className="landing__sign-out" to="/home">
                  Home setup
                </Link>
                <button
                  type="button"
                  className="landing__sign-out"
                  disabled={signOutBusy}
                  onClick={() => void onSignOut()}
                >
                  {signOutBusy ? 'Signing out…' : 'Sign out'}
                </button>
              </div>
              <p className="landing__legal-links">
                <a href="mailto:support@mahjlogic.com">support@mahjlogic.com</a>
                <span aria-hidden="true">·</span>
                <Link to="/american-mah-jongg-practice">Practice</Link>
                <span aria-hidden="true">·</span>
                <Link to="/mah-jongg-tile-checker">Rack Checker</Link>
                <span aria-hidden="true">·</span>
                <Link to="/privacy">Privacy</Link>
                <span aria-hidden="true">·</span>
                <Link to="/terms">Terms</Link>
              </p>
            </div>
          ) : (
            <p className="landing__legal-links landing__legal-links--solo">
              <a href="mailto:support@mahjlogic.com">support@mahjlogic.com</a>
              <span aria-hidden="true">·</span>
              <Link to="/american-mah-jongg-practice">Practice</Link>
              <span aria-hidden="true">·</span>
              <Link to="/mah-jongg-tile-checker">Rack Checker</Link>
              <span aria-hidden="true">·</span>
              <Link to="/privacy">Privacy</Link>
              <span aria-hidden="true">·</span>
              <Link to="/terms">Terms</Link>
            </p>
          )}
        </div>
      </div>
    </main>
  )
}
