import { useEffect, useLayoutEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import mahjLogoSrc from '../assets/mahj-logo.svg?url'
import logicLogoSrc from '../assets/logic-logo.svg?url'
import { applyAppThemeToDocument, readAppThemeFromStorage } from '../app/appTheme'
import { beginPlayEnterLoader, endPlayEnterLoader } from '../auth/playEnterLoader'
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

  /** Same felt as Play — follow the saved theme, do not rewrite localStorage. */
  useLayoutEffect(() => {
    applyAppThemeToDocument(readAppThemeFromStorage())
  }, [])

  // Clear a Play-enter loader if the user navigates back to the landing page mid-boot.
  useEffect(() => {
    endPlayEnterLoader()
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
    flushSync(() => {
      beginPlayEnterLoader()
    })
    navigate('/play', { state: { playIntent: 'enter' } })
  }

  return (
    <main className="landing">
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
              <Link to="/login" state={{ from: '/home' }}>
                Login
              </Link>
            )}
            {user ? <Link to="/rack-checker">Rack Checker</Link> : null}
            <Link to="/learn">Learn</Link>
          </nav>
        </div>
      </header>

      <div className="landing__shell">
        <div className="landing__frame landing__frame--signed-in">
          <section className="landing__features" aria-label="Mahj Logic modes">
            <article className="landing__feature" aria-label="Play American Mah Jongg">
              <div className="landing__feature-body">
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
                <p className="landing__feature-copy">
                  Mahj Logic is an intelligent American Mah Jongg solo training tool against AI in a condensed
                  layout which allows for larger tiles in an efficient design so you can see all
                  information front and center — suggested hands, highlights, discard tracking,
                  exposures, and real-time probabilities of finishing before the wall runs out.
                  Learn and practice new cards, see which hands you win with the most, and warm up
                  before a live game. Use the helper tools as much or as little as you want.
                </p>
              </div>
              <div className="landing__feature-media">
                <img
                  className="landing__feature-img"
                  src="/marketing/practice.jpg"
                  alt="Mahj Logic practice table"
                  width={2560}
                  height={1318}
                  decoding="async"
                  draggable={false}
                />
              </div>
            </article>

            <article className="landing__feature" aria-label="Rack Checker">
              <div className="landing__feature-body">
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
                <p className="landing__feature-copy">
                  Enter your tiles to see the closest matching hands and probabilities of
                  finishing before the wall runs out.
                </p>
              </div>
              <div className="landing__feature-media">
                <img
                  className="landing__feature-img"
                  src="/marketing/rack-checker.jpg"
                  alt="Mahj Logic Rack Checker"
                  width={2560}
                  height={1313}
                  decoding="async"
                  draggable={false}
                />
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
