import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import watermarkSrc from '../assets/mahjlogic-watermark.svg?url'
import {
  APP_THEME_BTN_PREVIEW,
  APP_THEME_LABEL,
  APP_THEMES,
  persistAppTheme,
  readAppThemeFromStorage,
  type AppTheme,
} from '../app/appTheme'
import { readPlayLocationState } from '../app/playLocationState'
import { useSessionBoot } from '../auth/sessionBoot'
import { useAuth } from '../auth/AuthProvider'
import {
  BOT_DIFFICULTIES,
  DEFAULT_BOT_DIFFICULTY,
  isBotDifficulty,
  type BotDifficulty,
} from '../analysis/botAI'
import {
  PLAYABLE_CARD_IDS,
  PLAYABLE_CARD_LABEL,
  readPlayableCardFromStorage,
  writePlayableCardToStorage,
  type PlayableCardId,
} from '../card/cardCatalog'
import { GameHistoryStatsOverlay } from '../components/GameHistoryStatsOverlays'
import {
  BLANK_TILE_COUNT_OPTIONS,
  DEFAULT_BLANK_TILE_COUNT,
  isBlankTileCount,
  type BlankTileCount,
} from '../mahjong/deck'
import { DEFAULT_TILE_GRAPHICS, type TileGraphics } from '../tiles/tileGraphics'
import {
  HELP_PRESET_LABEL,
  HELP_PRESETS,
  LS_KEY_HELP_PRESET,
  helpFlagsForPreset,
  readHelpPresetFromStorage,
  writeHelpPresetToStorage,
  type HelpPreset,
} from '../lib/helpPreset'
import {
  isResumableSnapshot,
  loadInProgressGame,
  type InProgressGameSnapshot,
} from '../lib/inProgressGame'
import {
  createDebouncedPrefsSaver,
  loadUserPreferences,
  saveUserPreferences,
  type SyncedUserPreferences,
} from '../lib/userPreferences'
import { RackCheckerPage } from './RackCheckerPage'
import '../styles/home.css'

const BOT_DIFFICULTY_LABEL: Record<BotDifficulty, string> = {
  easy: 'Novice',
  normal: 'Advanced',
  hard: 'Expert',
}

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

function writeBool(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? 'true' : 'false')
  } catch {
    /* ignore */
  }
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

  const [cardId, setCardId] = useState<PlayableCardId>(() => readPlayableCardFromStorage())
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>(() => readBotDifficulty())
  const [blankTilesEnabled, setBlankTilesEnabled] = useState(() => readBool(LS_KEY_BLANK_TILES, false))
  const [blankTileCount, setBlankTileCount] = useState<BlankTileCount>(() => readBlankTileCount())
  const [tenJokersEnabled, setTenJokersEnabled] = useState(() => readBool(LS_KEY_TEN_JOKERS, false))
  const [helpPreset, setHelpPreset] = useState<HelpPreset>(() => readHelpPresetFromStorage())
  const [appTheme, setAppTheme] = useState<AppTheme>(() => readAppThemeFromStorage())
  const [resumeSnap, setResumeSnap] = useState<InProgressGameSnapshot | null>(null)
  const [resumeLoading, setResumeLoading] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [signOutBusy, setSignOutBusy] = useState(false)
  const [rackCheckerOpen, setRackCheckerOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)

  const schedulePrefs = useCallback((next: SyncedUserPreferences) => {
    prefsRef.current = next
    prefsSaverRef.current.schedule(next)
  }, [])

  const patchPrefs = useCallback(
    (patch: Partial<SyncedUserPreferences>) => {
      schedulePrefs({ ...prefsRef.current, ...patch })
    },
    [schedulePrefs],
  )

  // Home has no game bootstrap — dismiss the auth boot loader immediately.
  useEffect(() => {
    sessionBoot?.notifySessionBootReady()
  }, [sessionBoot])

  useEffect(() => {
    const saver = prefsSaverRef.current
    return () => saver.cancel()
  }, [])

  useEffect(() => {
    const st = readPlayLocationState(location.state)
    if (st.openRackChecker) setRackCheckerOpen(true)
    if (st.openStats) setStatsOpen(true)
    if (st.openRackChecker || st.openStats) {
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
        writePlayableCardToStorage(merged.playableCardId)
        try {
          localStorage.setItem(LS_KEY_HELP_PRESET, merged.helpPreset)
          localStorage.setItem(LS_KEY_BOT_DIFFICULTY, merged.botDifficulty)
          localStorage.setItem(LS_KEY_BLANK_TILES, merged.blankTilesEnabled ? 'true' : 'false')
          localStorage.setItem(LS_KEY_BLANK_TILE_COUNT, String(merged.blankTileCount))
          localStorage.setItem(LS_KEY_TEN_JOKERS, merged.tenJokersEnabled ? 'true' : 'false')
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
        prefsRef.current = merged
        setCardId(merged.playableCardId)
        setBotDifficulty(merged.botDifficulty)
        setBlankTilesEnabled(merged.blankTilesEnabled)
        setBlankTileCount(merged.blankTileCount)
        setTenJokersEnabled(merged.tenJokersEnabled)
        setHelpPreset(merged.helpPreset)
        setAppTheme(merged.appTheme)
        // Older cloud rows lack helpPreset — persist the resolved full prefs once.
        if (!prefs.helpPreset) {
          void saveUserPreferences(merged)
        }
      } else {
        const local = buildPrefsFromLocal()
        prefsRef.current = local
        void saveUserPreferences(local)
      }

      setResumeSnap(isResumableSnapshot(snapshot) ? snapshot : null)
      setResumeLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const onCard = (id: PlayableCardId) => {
    setCardId(id)
    writePlayableCardToStorage(id)
    patchPrefs({ playableCardId: id })
  }

  const onDifficulty = (d: BotDifficulty) => {
    setBotDifficulty(d)
    try {
      localStorage.setItem(LS_KEY_BOT_DIFFICULTY, d)
    } catch {
      /* ignore */
    }
    patchPrefs({ botDifficulty: d })
  }

  const onBlankTiles = (on: boolean) => {
    setBlankTilesEnabled(on)
    writeBool(LS_KEY_BLANK_TILES, on)
    patchPrefs({ blankTilesEnabled: on })
  }

  const onBlankCount = (n: BlankTileCount) => {
    setBlankTileCount(n)
    setBlankTilesEnabled(true)
    try {
      localStorage.setItem(LS_KEY_BLANK_TILE_COUNT, String(n))
      localStorage.setItem(LS_KEY_BLANK_TILES, 'true')
    } catch {
      /* ignore */
    }
    patchPrefs({ blankTileCount: n, blankTilesEnabled: true })
  }

  const onTenJokers = (on: boolean) => {
    setTenJokersEnabled(on)
    writeBool(LS_KEY_TEN_JOKERS, on)
    patchPrefs({ tenJokersEnabled: on })
  }

  const onHelpPreset = (preset: HelpPreset) => {
    setHelpPreset(preset)
    writeHelpPresetToStorage(preset)
    const flags = helpFlagsForPreset(preset)
    patchPrefs({ helpPreset: preset, ...flags })
  }

  const onTheme = (t: AppTheme) => {
    setAppTheme(t)
    persistAppTheme(t)
    patchPrefs({ appTheme: t })
  }

  const goPlay = (intent: 'new' | 'resume') => {
    prefsSaverRef.current.cancel()
    void saveUserPreferences(prefsRef.current)
    navigate('/play', { state: { playIntent: intent } })
  }

  async function onSignOut() {
    if (signOutBusy) return
    setSignOutBusy(true)
    try {
      prefsSaverRef.current.cancel()
      await signOut()
      navigate('/', { replace: true })
    } finally {
      setSignOutBusy(false)
    }
  }

  const hasResume = resumeSnap != null

  return (
    <main className="home-hub">
      <div className="home-hub__atmosphere" aria-hidden="true" />

      <header className="home-hub__header">
        <div className="home-hub__brand">
          <img className="home-hub__logo" src={watermarkSrc} alt="" />
          <div className="home-hub__brand-text">
            <h1 className="home-hub__title">Mahj Logic</h1>
            <p className="home-hub__tagline">American Mah Jongg Intelligence</p>
          </div>
        </div>
        <button
          type="button"
          className="btn home-hub__gear"
          aria-label="Settings"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((v) => !v)}
        >
          ⚙
        </button>
      </header>

      {settingsOpen ? (
        <div className="home-hub__settings" role="dialog" aria-label="Settings">
          <div className="home-hub__option-block">
            <div className="home-hub__subhead" id="home-theme-label">
              Theme
            </div>
            <div
              className="home-hub__chip-row"
              role="radiogroup"
              aria-labelledby="home-theme-label"
            >
              {APP_THEMES.map((t) => {
                const preview = APP_THEME_BTN_PREVIEW[t]
                return (
                  <button
                    key={t}
                    type="button"
                    className={[
                      'btn',
                      'home-hub__chip',
                      'home-hub__theme-chip',
                      appTheme === t ? 'home-hub__chip--on' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={
                      {
                        '--theme-btn-face': preview.face,
                        '--theme-btn-face-pressed': preview.facePressed,
                        '--theme-btn-border': preview.border,
                      } as CSSProperties
                    }
                    role="radio"
                    aria-checked={appTheme === t}
                    onClick={() => onTheme(t)}
                  >
                    {APP_THEME_LABEL[t]}
                  </button>
                )
              })}
            </div>
          </div>
          {user ? (
            <p className="home-hub__account">
              Signed in as <span>{user.email ?? 'account'}</span>
            </p>
          ) : null}
          <button
            type="button"
            className="btn home-hub__action-btn"
            disabled={signOutBusy}
            onClick={() => void onSignOut()}
          >
            {signOutBusy ? 'Signing out…' : 'Sign out'}
          </button>
          <footer className="home-hub__legal">
            <a href="mailto:support@mahjlogic.com">support@mahjlogic.com</a>
            <span aria-hidden="true">·</span>
            <Link to="/privacy">Privacy</Link>
            <span aria-hidden="true">·</span>
            <Link to="/terms">Terms</Link>
          </footer>
        </div>
      ) : null}

      <section className="home-hub__primary" aria-label="Play">
        {resumeLoading ? (
          <p className="home-hub__status">Checking for a saved game…</p>
        ) : hasResume ? (
          <div className="home-hub__cta-row">
            <button
              type="button"
              className="btn home-hub__action-btn home-hub__action-btn--primary"
              onClick={() => goPlay('resume')}
            >
              Resume
            </button>
            <button
              type="button"
              className="btn home-hub__action-btn"
              onClick={() => goPlay('new')}
            >
              New Game
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn home-hub__action-btn home-hub__action-btn--primary home-hub__action-btn--solo"
            onClick={() => goPlay('new')}
          >
            Play
          </button>
        )}
      </section>

      <section className="home-hub__options" aria-label="Game options">
        <div className="home-hub__option-block">
          <div className="home-hub__subhead" id="home-card-label">
            Card
          </div>
          <div className="home-hub__chip-row" role="radiogroup" aria-labelledby="home-card-label">
            {PLAYABLE_CARD_IDS.map((id) => (
              <button
                key={id}
                type="button"
                className={['btn', 'home-hub__chip', cardId === id ? 'home-hub__chip--on' : '']
                  .filter(Boolean)
                  .join(' ')}
                role="radio"
                aria-checked={cardId === id}
                onClick={() => onCard(id)}
              >
                {PLAYABLE_CARD_LABEL[id]}
              </button>
            ))}
          </div>
        </div>

        <div className="home-hub__option-block">
          <div className="home-hub__subhead" id="home-bot-label">
            Bot skill
          </div>
          <div className="home-hub__chip-row" role="radiogroup" aria-labelledby="home-bot-label">
            {BOT_DIFFICULTIES.map((d) => (
              <button
                key={d}
                type="button"
                className={[
                  'btn',
                  'home-hub__chip',
                  botDifficulty === d ? 'home-hub__chip--on' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                role="radio"
                aria-checked={botDifficulty === d}
                onClick={() => onDifficulty(d)}
              >
                {BOT_DIFFICULTY_LABEL[d]}
              </button>
            ))}
          </div>
        </div>

        <div className="home-hub__option-block home-hub__option-block--row">
          <div className="home-hub__toggle-group">
            <button
              type="button"
              className={[
                'btn',
                'home-hub__chip',
                blankTilesEnabled ? 'home-hub__chip--on' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-pressed={blankTilesEnabled}
              onClick={() => onBlankTiles(!blankTilesEnabled)}
            >
              Blank tiles
            </button>
            <div
              className="home-hub__chip-row home-hub__chip-row--counts"
              role="radiogroup"
              aria-label="Blank tile count"
            >
              {BLANK_TILE_COUNT_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={[
                    'btn',
                    'home-hub__chip',
                    'home-hub__chip--count',
                    blankTilesEnabled && blankTileCount === n ? 'home-hub__chip--on' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  role="radio"
                  aria-checked={blankTilesEnabled && blankTileCount === n}
                  disabled={!blankTilesEnabled}
                  onClick={() => onBlankCount(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className={[
              'btn',
              'home-hub__chip',
              tenJokersEnabled ? 'home-hub__chip--on' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-pressed={tenJokersEnabled}
            onClick={() => onTenJokers(!tenJokersEnabled)}
          >
            10 Jokers
          </button>
        </div>

        <div className="home-hub__option-block">
          <div className="home-hub__subhead" id="home-help-label">
            Help level
          </div>
          <div className="home-hub__chip-row" role="radiogroup" aria-labelledby="home-help-label">
            {HELP_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className={['btn', 'home-hub__chip', helpPreset === p ? 'home-hub__chip--on' : '']
                  .filter(Boolean)
                  .join(' ')}
                role="radio"
                aria-checked={helpPreset === p}
                onClick={() => onHelpPreset(p)}
              >
                {HELP_PRESET_LABEL[p]}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="home-hub__modes" aria-label="More">
        <button
          type="button"
          className="btn home-hub__action-btn home-hub__mode-btn"
          disabled
          title="Coming soon"
        >
          Rack of the Day
          <span className="home-hub__soon">Soon</span>
        </button>
        <button
          type="button"
          className="btn home-hub__action-btn home-hub__mode-btn"
          onClick={() => setRackCheckerOpen(true)}
        >
          Rack Checker
        </button>
        <button
          type="button"
          className="btn home-hub__action-btn home-hub__mode-btn"
          onClick={() => setStatsOpen(true)}
        >
          Stats
        </button>
      </section>

      {statsOpen ? (
        <GameHistoryStatsOverlay kind="stats" onClose={() => setStatsOpen(false)} />
      ) : null}
      {rackCheckerOpen ? (
        <RackCheckerPage overlay onClose={() => setRackCheckerOpen(false)} />
      ) : null}
    </main>
  )
}
