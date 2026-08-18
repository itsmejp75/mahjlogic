import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import mahjLogoSrc from '../assets/mahj-logo.svg?url'
import logicLogoSrc from '../assets/logic-logo.svg?url'
import {
  applyAppThemeToDocument,
  persistAppTheme,
  readAppThemeFromStorage,
  type AppTheme,
} from '../app/appTheme'
import {
  readHomeLocationState,
  readPlayLocationState,
  type PlayIntent,
} from '../app/playLocationState'
import { beginPlayEnterLoader, endPlayEnterLoader } from '../auth/playEnterLoader'
import { useSessionBoot } from '../auth/sessionBoot'
import { useAuth } from '../auth/AuthProvider'
import {
  DEFAULT_BOT_DIFFICULTY,
  isBotDifficulty,
  type BotDifficulty,
} from '../analysis/botAI'
import {
  readPlayableCardFromStorage,
  writePlayableCardToStorage,
} from '../card/cardCatalog'
import { canPlayCardId } from '../card/cardContentAccess'
import {
  GameHistoryStatsOverlay,
  prefetchGameStatsSummary,
} from '../components/GameHistoryStatsOverlays'
import { LandingTileAtmosphere } from '../components/LandingTileAtmosphere'
import { StoreBadges } from '../components/StoreBadges'
import {
  DEFAULT_BLANK_TILE_COUNT,
  isBlankTileCount,
  type BlankTileCount,
} from '../mahjong/deck'
import { preloadClassicTileArt } from '../tiles/classicTileArt'
import {
  DEFAULT_TILE_GRAPHICS,
  isIllustrativeTileGraphics,
  type TileGraphics,
} from '../tiles/tileGraphics'
import {
  LS_KEY_HELP_PRESET,
  helpFlagsForPreset,
  readHelpPresetFromStorage,
} from '../lib/helpPreset'
import { clearHomeResumeCache, peekHomeResumeCache, setHomeResumeCache } from '../app/homeResumeCache'
import {
  isResumableSnapshot,
  loadInProgressGame,
} from '../lib/inProgressGame'
import {
  createDebouncedPrefsSaver,
  loadUserPreferences,
  saveUserPreferences,
  type SyncedUserPreferences,
} from '../lib/userPreferences'
import '../styles/home.css'

const LS_KEY_BOT_DIFFICULTY = 'mahjlogic.botDifficulty'
const LS_KEY_BLANK_TILES = 'mahjlogic.blankTilesEnabled'
const LS_KEY_BLANK_TILE_COUNT = 'mahjlogic.blankTileCount'
const LS_KEY_TEN_JOKERS = 'mahjlogic.tenJokersEnabled'
const LS_KEY_TILE_GRAPHICS = 'mahjlogic.tileGraphics'
const LS_KEY_BOT_WINS = 'mahjlogic.botWinsEnabled'
const LS_KEY_COLOR_BUTTONS = 'mahjlogic.colorButtonsEnabled'
const LS_KEY_UNDO = 'mahjlogic.undoEnabled'
const LS_KEY_ANIMATIONS = 'mahjlogic.animationsEnabled'
const LS_KEY_PLAY_AS_EAST = 'mahjlogic.playAsEastEnabled'
const LS_KEY_MAHJONG_HINT_DELAY = 'mahjlogic.mahjongHintDelaySeconds'
const LS_KEY_JOKER_SWAP_HINT_DELAY = 'mahjlogic.jokerSwapHintDelaySeconds'

function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    if (v != null) return v === 'true' || v === '1'
  } catch {
    /* ignore */
  }
  return fallback
}

function readBotDifficulty(): BotDifficulty {
  try {
    const v = localStorage.getItem(LS_KEY_BOT_DIFFICULTY)
    if (v === 'unfair') return 'hard'
    if (v != null && isBotDifficulty(v)) return v
  } catch {
    /* ignore */
  }
  return DEFAULT_BOT_DIFFICULTY
}

function readBlankTileCount(): BlankTileCount {
  try {
    const n = Number(localStorage.getItem(LS_KEY_BLANK_TILE_COUNT))
    if (isBlankTileCount(n)) return n
  } catch {
    /* ignore */
  }
  return DEFAULT_BLANK_TILE_COUNT
}

function readTileGraphics(): TileGraphics {
  try {
    const v = localStorage.getItem(LS_KEY_TILE_GRAPHICS)
    if (typeof v === 'string' && v) return v as TileGraphics
  } catch {
    /* ignore */
  }
  return DEFAULT_TILE_GRAPHICS
}

function readHintDelay(key: string): number {
  try {
    const n = Number(localStorage.getItem(key))
    if (Number.isFinite(n) && n >= 0) return Math.floor(n)
  } catch {
    /* ignore */
  }
  return 2
}

function buildPrefsFromLocal(
  overrides: Partial<SyncedUserPreferences> = {},
): SyncedUserPreferences {
  const helpPreset = overrides.helpPreset ?? readHelpPresetFromStorage()
  const flags = helpFlagsForPreset(helpPreset)
  return {
    playableCardId: overrides.playableCardId ?? readPlayableCardFromStorage(),
    botDifficulty: overrides.botDifficulty ?? readBotDifficulty(),
    appTheme: overrides.appTheme ?? readAppThemeFromStorage(),
    tileGraphics: overrides.tileGraphics ?? readTileGraphics(),
    botWinsEnabled: overrides.botWinsEnabled ?? readBool(LS_KEY_BOT_WINS, true),
    colorButtonsEnabled: overrides.colorButtonsEnabled ?? readBool(LS_KEY_COLOR_BUTTONS, true),
    undoEnabled: overrides.undoEnabled ?? readBool(LS_KEY_UNDO, true),
    animationsEnabled: overrides.animationsEnabled ?? readBool(LS_KEY_ANIMATIONS, true),
    deadHandWarningsEnabled: overrides.deadHandWarningsEnabled ?? flags.deadHandWarningsEnabled,
    jokerSwapHintEnabled: overrides.jokerSwapHintEnabled ?? flags.jokerSwapHintEnabled,
    mahjongHintEnabled: overrides.mahjongHintEnabled ?? flags.mahjongHintEnabled,
    mahjongHintDelaySeconds: overrides.mahjongHintDelaySeconds ?? readHintDelay(LS_KEY_MAHJONG_HINT_DELAY),
    jokerSwapHintDelaySeconds:
      overrides.jokerSwapHintDelaySeconds ?? readHintDelay(LS_KEY_JOKER_SWAP_HINT_DELAY),
    deadTileHintEnabled: overrides.deadTileHintEnabled ?? flags.deadTileHintEnabled,
    botHandsIdentifierEnabled:
      overrides.botHandsIdentifierEnabled ?? flags.botHandsIdentifierEnabled,
    concealedHandReminderEnabled:
      overrides.concealedHandReminderEnabled ?? flags.concealedHandReminderEnabled,
    blankTilesEnabled: overrides.blankTilesEnabled ?? readBool(LS_KEY_BLANK_TILES, false),
    blankTileCount: overrides.blankTileCount ?? readBlankTileCount(),
    tenJokersEnabled: overrides.tenJokersEnabled ?? readBool(LS_KEY_TEN_JOKERS, false),
    playAsEastEnabled: overrides.playAsEastEnabled ?? readBool(LS_KEY_PLAY_AS_EAST, true),
    suggestedHandsTrayDefaultOpen:
      overrides.suggestedHandsTrayDefaultOpen ?? flags.suggestedHandsTrayDefaultOpen,
    handProbabilityEnabled: overrides.handProbabilityEnabled ?? flags.handProbabilityEnabled,
    helpPreset,
  }
}

export function HomePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, signOut } = useAuth()
  const sessionBoot = useSessionBoot()
  const prefsSaverRef = useRef(createDebouncedPrefsSaver(400))
  const prefsRef = useRef<SyncedUserPreferences>(buildPrefsFromLocal())

  const [appTheme, setAppTheme] = useState<AppTheme>(() => readAppThemeFromStorage())
  const [signOutBusy, setSignOutBusy] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [hasResumableGame, setHasResumableGame] = useState(() => {
    const peeked = peekHomeResumeCache(user?.id)
    return peeked.status === 'ready' && peeked.snap != null
  })

  useLayoutEffect(() => {
    applyAppThemeToDocument(appTheme)
  }, [appTheme])

  // Clear a Play-enter loader if the user navigates back to Home mid-boot.
  useEffect(() => {
    endPlayEnterLoader()
  }, [])

  // Home has no game bootstrap — dismiss the auth boot loader immediately.
  useEffect(() => {
    sessionBoot?.notifySessionBootReady()
  }, [sessionBoot])

  // Warm Stats so the overlay opens with numbers instead of "Loading…".
  useEffect(() => {
    prefetchGameStatsSummary()
  }, [user?.id])

  useEffect(() => {
    const saver = prefsSaverRef.current
    return () => saver.cancel()
  }, [])

  useEffect(() => {
    const homeSt = readHomeLocationState(location.state)
    const playSt = readPlayLocationState(location.state)
    if (playSt.openRackChecker) {
      navigate('/rack-checker', { replace: true })
      return
    }
    if (homeSt.openStats || playSt.openStats) {
      setStatsOpen(true)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state, location.pathname, navigate])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [{ prefs }, { snapshot }] = await Promise.all([
        loadUserPreferences(),
        loadInProgressGame(),
      ])
      if (cancelled) return

      if (prefs) {
        const merged = buildPrefsFromLocal({
          ...prefs,
          helpPreset: prefs.helpPreset ?? readHelpPresetFromStorage(),
        })
        const playable = canPlayCardId(merged.playableCardId) ? merged.playableCardId : 'mock'
        writePlayableCardToStorage(playable)
        try {
          localStorage.setItem(LS_KEY_HELP_PRESET, merged.helpPreset)
          localStorage.setItem(LS_KEY_BOT_DIFFICULTY, merged.botDifficulty)
          localStorage.setItem(LS_KEY_BLANK_TILES, merged.blankTilesEnabled ? 'true' : 'false')
          localStorage.setItem(LS_KEY_BLANK_TILE_COUNT, String(merged.blankTileCount))
          localStorage.setItem(LS_KEY_TEN_JOKERS, merged.tenJokersEnabled ? 'true' : 'false')
          localStorage.setItem(LS_KEY_PLAY_AS_EAST, merged.playAsEastEnabled ? 'true' : 'false')
          localStorage.setItem(
            'mahjlogic.suggestedHandsTrayDefaultOpen',
            merged.suggestedHandsTrayDefaultOpen ? 'true' : 'false',
          )
          localStorage.setItem(
            'mahjlogic.mahjongHintEnabled',
            merged.mahjongHintEnabled ? 'true' : 'false',
          )
          localStorage.setItem(
            'mahjlogic.jokerSwapHintEnabled',
            merged.jokerSwapHintEnabled ? 'true' : 'false',
          )
          localStorage.setItem(
            'mahjlogic.deadTileHintEnabled',
            merged.deadTileHintEnabled ? 'true' : 'false',
          )
          localStorage.setItem(
            'mahjlogic.handProbabilityEnabled',
            merged.handProbabilityEnabled ? 'true' : 'false',
          )
          localStorage.setItem(
            'mahjlogic.deadHandWarningsEnabled',
            merged.deadHandWarningsEnabled ? 'true' : 'false',
          )
          localStorage.setItem(
            'mahjlogic.botHandsIdentifierEnabled',
            merged.botHandsIdentifierEnabled ? 'true' : 'false',
          )
          localStorage.setItem(
            'mahjlogic.concealedHandReminderEnabled',
            merged.concealedHandReminderEnabled ? 'true' : 'false',
          )
        } catch {
          /* ignore */
        }
        persistAppTheme(merged.appTheme)
        const nextPrefs = { ...merged, playableCardId: playable }
        prefsRef.current = nextPrefs
        setAppTheme(merged.appTheme)
        // Older cloud rows lack helpPreset — persist the resolved full prefs once.
        if (!prefs.helpPreset || prefs.playableCardId !== playable) {
          void saveUserPreferences(nextPrefs)
        }
      } else {
        const local = buildPrefsFromLocal()
        const playable = canPlayCardId(local.playableCardId) ? local.playableCardId : 'mock'
        const next = { ...local, playableCardId: playable }
        writePlayableCardToStorage(playable)
        prefsRef.current = next
        void saveUserPreferences(next)
      }

      if (user?.id) {
        const resumable = isResumableSnapshot(snapshot) ? snapshot : null
        setHomeResumeCache(user.id, resumable)
        setHasResumableGame(resumable != null)
      } else {
        setHasResumableGame(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const goPlay = (playIntent: PlayIntent) => {
    prefsSaverRef.current.cancel()
    void saveUserPreferences(prefsRef.current)
    // Start tile-face warm under the Play boot loader (before the route mounts App).
    const g = prefsRef.current.tileGraphics
    if (isIllustrativeTileGraphics(g)) {
      preloadClassicTileArt({ graphics: g, immediate: true })
    }
    // Route-survivable loader: paints this frame and keeps running across /play mount.
    flushSync(() => {
      beginPlayEnterLoader()
    })
    navigate('/play', {
      state: {
        playIntent,
      },
    })
  }

  async function onSignOut() {
    if (signOutBusy) return
    setSignOutBusy(true)
    try {
      prefsSaverRef.current.cancel()
      clearHomeResumeCache()
      await signOut()
      navigate('/', { replace: true })
    } finally {
      setSignOutBusy(false)
    }
  }

  return (
    <main className="app home-hub" data-app-theme={appTheme}>
      <LandingTileAtmosphere />
      <header className="home-hub__header">
        <div className="home-hub__header-inner">
          <div className="home-hub__brand" aria-label="Mahj Logic">
            <img
              className="home-hub__logo home-hub__logo--mahj"
              src={mahjLogoSrc}
              alt=""
              decoding="async"
              draggable={false}
            />
            <img
              className="home-hub__logo home-hub__logo--logic"
              src={logicLogoSrc}
              alt=""
              decoding="async"
              draggable={false}
            />
            <span className="home-hub__tagline-sep" aria-hidden="true">
              —
            </span>
            <p className="home-hub__tagline">American Mah Jongg Intelligence</p>
          </div>
          <nav className="home-hub__top-nav" aria-label="Site">
            <Link to="/home" aria-current="page">
              Home
            </Link>
            <Link
              to="/play"
              onClick={(e) => {
                e.preventDefault()
                goPlay(hasResumableGame ? 'resume' : 'enter')
              }}
            >
              Play
            </Link>
            <Link to="/rack-checker">Rack Checker</Link>
            <Link to="/learn">Learn</Link>
          </nav>
        </div>
      </header>

      <div className="home-hub__scroll">
        <div className="home-hub__shell">
          <section className="home-hub__features" aria-label="Modes">
            <article className="home-hub__feature" aria-label="Play American Mah Jongg">
              <div className="home-hub__feature-body">
                <div
                  className={
                    hasResumableGame
                      ? 'home-hub__feature-actions home-hub__feature-actions--split'
                      : 'home-hub__feature-actions'
                  }
                >
                  {hasResumableGame ? (
                    <button
                      type="button"
                      className="btn home-hub__action-btn home-hub__feature-cta"
                      onClick={() => goPlay('resume')}
                    >
                      Resume
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn home-hub__action-btn home-hub__feature-cta"
                    onClick={() => goPlay(hasResumableGame ? 'new' : 'enter')}
                  >
                    {hasResumableGame ? 'New game' : 'Play'}
                  </button>
                </div>
                <p className="home-hub__feature-copy">
                  Mahj Logic is an intelligent American Mah Jongg solo training tool against AI in a condensed
                  layout which allows for larger tiles in an efficient design so you can see all
                  information front and center — suggested hands, highlights, discard tracking,
                  exposures, and real-time probabilities of finishing before the wall runs out.
                  Learn and practice new cards, see which hands you win with the most, and warm up
                  before a live game. Use the helper tools as much or as little as you want.
                </p>
              </div>
              <div className="home-hub__feature-media">
                <img
                  className="home-hub__feature-img"
                  src="/marketing/practice.jpg"
                  alt="Mahj Logic practice table"
                  width={2560}
                  height={1318}
                  decoding="async"
                  fetchPriority="high"
                  draggable={false}
                />
              </div>
            </article>

            <article className="home-hub__feature" aria-label="Rack Checker">
              <div className="home-hub__feature-body">
                <div className="home-hub__feature-actions">
                  <button
                    type="button"
                    className="btn home-hub__action-btn home-hub__feature-cta"
                    onClick={() => navigate('/rack-checker')}
                  >
                    Open Rack Checker
                  </button>
                </div>
                <p className="home-hub__feature-copy">
                  Enter your tiles to see the closest matching hands and probabilities of
                  finishing before the wall runs out.
                </p>
              </div>
              <div className="home-hub__feature-media">
                <img
                  className="home-hub__feature-img"
                  src="/marketing/rack-checker.jpg"
                  alt="Mahj Logic Rack Checker"
                  width={2560}
                  height={1313}
                  decoding="async"
                  fetchPriority="high"
                  draggable={false}
                />
              </div>
            </article>
          </section>

          <div className="home-hub__modes" aria-label="More">
            <button
              type="button"
              className="btn home-hub__action-btn home-hub__mode-btn"
              onClick={() => setStatsOpen(true)}
            >
              Stats
            </button>
            <button
              type="button"
              className="btn home-hub__action-btn home-hub__mode-btn"
              disabled
              title="Coming soon"
            >
              Rack of the Day
              <span className="home-hub__soon">Soon</span>
            </button>
          </div>

          <StoreBadges className="home-hub__store-badges" />

          {user ? (
            <div className="home-hub__account-footer">
              <div className="home-hub__account">
                <p className="home-hub__account-status">
                  Signed in as{' '}
                  <span className="home-hub__account-email">{user.email ?? 'account'}</span>
                </p>
                <button
                  type="button"
                  className="home-hub__sign-out"
                  disabled={signOutBusy}
                  onClick={() => void onSignOut()}
                >
                  {signOutBusy ? 'Signing out…' : 'Sign out'}
                </button>
              </div>
              <p className="home-hub__legal">
                <a href="mailto:support@mahjlogic.com">support@mahjlogic.com</a>
                <span aria-hidden="true">·</span>
                <Link to="/privacy">Privacy</Link>
                <span aria-hidden="true">·</span>
                <Link to="/terms">Terms</Link>
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {statsOpen ? (
        <GameHistoryStatsOverlay kind="stats" onClose={() => setStatsOpen(false)} />
      ) : null}
    </main>
  )
}
