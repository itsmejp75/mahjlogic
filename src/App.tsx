import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { LandingTileAtmosphere } from './components/LandingTileAtmosphere'
import { flushSync } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { RackCheckerPage } from './pages/RackCheckerPage'
import { americanDeckTileCount, buildAmericanDeck, dealOpeningFour, DEFAULT_BLANK_TILE_COUNT, isBlankTileCount, shuffle, STANDARD_JOKER_COUNT, TEN_JOKERS_COUNT } from './mahjong/deck'
import type { BlankTileCount } from './mahjong/deck'
import type { ClaimType, DiscardEntry, EastExposure, Seat, TileDef, TileInstance } from './mahjong/types'
import { formatMahjongWinDescription } from './mahjong/labels'
import { findFocusedPatternDeadCause, focusedLineJokerIneligibleNeedForDef, type DeadCauseHint } from './mahjong/deadCauseHint'
import { addDeadHintNeed, copyDeadHintNeeds, deadHintDefKey, deadHintGroupNeedVariants, patternNeedVariantIsSatisfiable, type DeadHintNeedMap } from './mahjong/deadHintVariants'
import { findExactMatches, sortTiles, tileDefsEqual, type SortMode } from './mahjong/tileUtils'
import { charlestonAllowsBlind, charlestonPassStripInstructionAria, charlestonRackRoundTitle, type CharlestonPhase } from './mahjong/charleston'
import type { HandTileFlyInFrom } from './mahjong/handTileFlyIn'
import { handTileFlyInFromBotSeat } from './mahjong/handTileFlyIn'
import { assignOpeningHands, botIndicesAfterCompassSeat, botIndicesAfterPlayerDiscard, botIndicesInCompassPlayOrder, botIndexForCompassSeat, DEFAULT_BOT_SLOT_SEATS, nextCompassSeat, playerYouLabel, seatLabel, toFourHands as fourHandsFromRound, type BotSlotSeats } from './mahjong/seats'
import { type PassStripFlyOutFrom } from './components/PassStrip'
import { AppMenuAccountFooter } from './components/AppMenuAccountFooter'
import { GameHistoryStatsOverlay } from './components/GameHistoryStatsOverlays'
import { TileFace } from './components/TileFace'
import { useAuth } from './auth/AuthProvider'
import { useSessionBoot } from './auth/sessionBoot'
import {
  recordGameResult,
  type GameAssistKey,
  type GameOutcome,
  type GameWinMethod,
} from './lib/gameResults'
import {
  buildInProgressSnapshot,
  clearInProgressGame,
  createDebouncedInProgressGameSaver,
  loadInProgressGame,
  saveInProgressGame,
  type InProgressGameSnapshot,
} from './lib/inProgressGame'
import {
  createDebouncedPrefsSaver,
  loadUserPreferences,
  saveUserPreferences,
  type SyncedUserPreferences,
} from './lib/userPreferences'
import { LS_KEY_HELP_PRESET, readHelpPresetFromStorage } from './lib/helpPreset'
import { clearPlayEnterFastPath, readPlayLocationState } from './app/playLocationState'
import { PLAYABLE_CARD_IDS, PLAYABLE_CARD_LABEL, type PlayableCardId, cardSectionOrderFromPatterns, patternsForCard, playableCardShortLabel, readPlayableCardFromStorage, writePlayableCardToStorage } from './card/cardCatalog'
import type { PracticePattern } from './card/practicePatterns'
import { patternByIdLookup, setActiveCardPatterns } from './card/activeCardPatternsScope'
import { buildPinnedPatternsFromFocusKey, computeRackPatternHighlightIds, computeBlankExchangeFills, greedyPatternMatchDetail, jokerSwapHandHintUsesSingleBounceIteration, focusKeyForSuggestedHandLine, focusKeyPatternId, segmentRackIntoExposureRuns, sortFullRackTilesForPattern, suggestedHandsTiedAtBest, summarizeRackTowardWin, computeSuggestedDiscardNeedHighlightIds, computeSuggestedDiscardTrackerNeedDefs, computeBotExposureSuggestedBestIds, findInfeasibleBestIds, buildUnavailableTileDefCounts, tileMultisetSignature, type RankSuggestedHandsInput } from './analysis/suggestedHands'
import { tileInstancesWithClaimMeldJokersResolved, listOpenHandsFittingClaimMelds, openClaimMeldsFitSomePracticeLine } from './analysis/eastExposurePatternFit'
import { useRankSuggestedHandsWorker } from './analysis/rankSuggestedHandsAsync'
import { CharlestonPassStripInstructionMain } from './components/CharlestonPassStripInstructionLabel'
import { BotExposureHandsPanel } from './components/BotExposureHandsPanel'
import { SuggestedHandsPanel } from './components/SuggestedHandsPanel'
import { PostGameLoserRackRow } from './components/PostGameLoserRackRow'
import { HIDE_CONCEALED_HANDS_STORAGE_KEY, readHideConcealedHandsFromStorage, writeHideConcealedHandsToStorage, readUncheckedSectionsFromStorage, writeUncheckedSectionsToStorage, suggestedHandsFilterMenuColumns, SUGGESTED_HANDS_UNCHECKED_SECTIONS_KEY, suggestedHandSectionMenuLabel, suggestedHandSectionsAvailableWithClaimMelds, isSuggestedHandSectionFilterEnabled, resolveHideConcealedHands, SHOW_SUGGESTED_HAND_FILTERS_IN_MENU, toggledSuggestedHandSectionFilter } from './suggestedHands/filterSettings'

/** Rare overlays — keep analysis-heavy dialogs out of the initial play bundle. */
const IllegalMahjongDialog = lazy(() =>
  import('./components/IllegalMahjongDialog').then((m) => ({ default: m.IllegalMahjongDialog })),
)
import type { BotExposure, BotSeat } from './analysis/types'
import { BOT_DIFFICULTIES, type BotDifficulty, chooseBotDiscard, botCallStrategicProbability, botBestTilesAway, tryBotBlankExchange, DEFAULT_BOT_DIFFICULTY, isBotDifficulty, type BotRankContext } from './analysis/botAI'
import { hasLegalMahjongOnBotDiscard, isMahjongWinOnLiveBotDiscard, isSelfDrawMahjongWin, type CallValidationRoundSlice } from './mahjong/callValidation'
import { deadHandExplanation } from './mahjong/deadHandReason'
import {
  isPlayerTheDiscarder,
  nonWinnerPaysPoints,
  winnerCollectsPoints,
} from './mahjong/payouts'
import { incomingBotDiscardDragId } from './mahjong/jokerSwapIds'
import { discardedDefsForBlankExchange } from './mahjong/blankExchange'
import { eastExposureSwapDropId, findNextJokerSwapTarget, collectHandTileIdsSwappableForJokers, collectSwappableJokerTileIds } from './mahjong/jokerSwapTarget'
import { preloadClassicTileArt } from './tiles/classicTileArt'
import {
  DEFAULT_TILE_GRAPHICS,
  isIllustrativeTileGraphics,
  isTileGraphics,
  MENU_TILE_GRAPHICS,
  TILE_GRAPHICS_LABEL,
  type TileGraphics,
} from './tiles/tileGraphics'
import {
  APP_THEMES,
  APP_THEME_LABEL,
  applyAppThemeToDocument,
  isAppTheme,
  LS_KEY_APP_THEME,
  persistAppTheme,
  readAppThemeFromStorage,
  type AppTheme,
} from './app/appTheme'
import { TileGraphicsProvider } from './tiles/TileGraphicsContext'
import { AppMenuOpenGate, AppMenuOpenProvider, appMenuOpenApiRef, useAppMenuOpen } from './app/AppMenuOpenContext'
import { SuggestedHandsTrayProvider, suggestedHandsTrayApiRef } from './app/SuggestedHandsTrayContext'
import { EastDiscardStagingSlot, SuggestedHandsBoundsOnTrayChange, SuggestedHandsPinOnTrayClose, SuggestedHandsPopupChrome, WALL_GAME_MAX_EXPOSURE_MELD_TILES, type MainPhase } from './app/playSurfaceUi'
import { createResizeScheduler } from './lib/resizeSchedule'
import type { RoundState } from './app/roundState'
import { eastExposureMeldSortId } from './app/playSurfaceDnDHelpers'
import { PlaySurface, type PlaySurfaceDnDApi } from './app/PlaySurface'
import { WallGameDialogPanel } from './components/WallGameDialogPanel'
import {
  buildPlaySurfaceActionBarProps,
  buildPlayerSeatLabelProps,
  type PlaySurfaceCoachProps,
  type PlaySurfaceRackChromeProps,
} from './app/playSurfaceViewProps'
import type { GameBlockingDialog } from './app/gameDialog'
import {
  applyBotsJokerSwapsFromEast,
  applyCommitStagedCall,
  applyDeadHand,
  applyEastNaturalForExposedJoker,
  applyAutoSelectCallTiles,
  applyToggleStagedCallTile,
  botLabelAt,
  botSeatAt,
  buildCallStagingPreview,
  deadDiscardTilesForRanking,
  discardPileCommittedForDisplay,
  playerClaimMeldsForRound,
  playerExposureMeldsForRound,
  previewStagedCallBestTilesAway,
  rankInputDuringCallStaging,
} from './app/roundMutations'
import { useRoundActions } from './app/useRoundActions'
import './styles/style.css'

/** Conservative floor used while the suggested-hands sheet is remeasured during orientation changes. */
const SUGGESTED_DISCARD_OVERLAY_MIN_SHEET_PX = 112

/** Survives React Strict Mode remounts so a finished hand is not inserted twice. */
const recordedGameResultRoundIds = new Set<string>()

/** Stable empty list so blank-exchange inputs keep a constant identity when no blank is held. */
const EMPTY_TILE_DEF_LIST: readonly TileDef[] = []


const BOT_DIFFICULTY_LABEL: Record<BotDifficulty, string> = {
  easy: 'Novice',
  normal: 'Advanced',
  hard: 'Expert',
}

const LS_KEY_BOT_WINS = 'mahjlogic.botWinsEnabled'

/** When false, rack / table action buttons use neutral gray (like Sort) instead of teal, purple, etc. */
const LS_KEY_COLOR_BUTTONS = 'mahjlogic.colorButtonsEnabled'
const LS_KEY_BOT_DIFFICULTY = 'mahjlogic.botDifficulty'
/**
 * Tile face style (`TILE_GRAPHICS` / `data-tile-graphics`). Product default is Illustrative Classic.
 * Today: persisted in localStorage only. When accounts exist, the player’s choice should live in
 * their server-side settings (and can sync down to replace or seed this key on login).
 */
const LS_KEY_TILE_GRAPHICS = 'mahjlogic.tileGraphics'
/** Set when the player picks Classic or Prism in the menu (not a legacy default). */
const LS_KEY_TILE_GRAPHICS_USER_PICKED = 'mahjlogic.tileGraphicsUserPicked'
/** One-time migration: legacy Ivory (`classic`) / Obsidian (`dark`) defaults → Illustrative Classic. */
const LS_KEY_TILE_GRAPHICS_DEFAULT_MIGRATED = 'mahjlogic.tileGraphicsDefaultMigrated'
/** One-time migration: Prism (`solid-color`) was the prior product default → Illustrative Classic. */
const LS_KEY_TILE_GRAPHICS_PRISM_LEGACY_MIGRATED = 'mahjlogic.tileGraphicsPrismLegacyMigrated'
const LS_KEY_JOKER_SWAP_HINT = 'mahjlogic.jokerSwapHintEnabled'
/** Former “Joker Flash” preference; read once to seed `LS_KEY_JOKER_SWAP_HINT` if missing. */
const LS_KEY_JOKER_FLASH_LEGACY = 'mahjlogic.jokerFlashEnabled'
const JOKER_SWAP_HINT_LABEL = 'Joker swap hint'
/** Training / practice: confirm before dead hand from bad call, bad Mah Jongg, or hopeless discard. */
const LS_KEY_UNDO = 'mahjlogic.undoEnabled'
const UNDO_LABEL = 'Undo'
const LS_KEY_ANIMATIONS = 'mahjlogic.animationsEnabled'
const ANIMATIONS_LABEL = 'Animations'
/**
 * When false, the Animations toggle is omitted from the app menu.
 * Flip to `true` to restore; storage + setters stay wired for that.
 */
const SHOW_ANIMATIONS_TOGGLE_IN_MENU = false
const LS_KEY_DEAD_HAND_WARNINGS = 'mahjlogic.deadHandWarningsEnabled'
const DEAD_HAND_WARNINGS_LABEL = 'Dead hand warnings'
/** Highlight the Mah Jongg rack button when a declaration would succeed (self-draw or on a live discard). */
const LS_KEY_MAHJONG_HINT = 'mahjlogic.mahjongHintEnabled'
const MAHJONG_HINT_LABEL = 'Mah Jongg hint'
/** Seconds to wait before showing each hint (0 / 2 / 4; blank-tiles-style chips in the menu). */
const LS_KEY_MAHJONG_HINT_DELAY_SECONDS = 'mahjlogic.mahjongHintDelaySeconds'
const LS_KEY_JOKER_SWAP_HINT_DELAY_SECONDS = 'mahjlogic.jokerSwapHintDelaySeconds'
/** Former boolean delay toggles; read once to seed the seconds keys if missing. */
const LS_KEY_MAHJONG_HINT_DELAY_3S_LEGACY = 'mahjlogic.mahjongHintDelay3SecondsEnabled'
const LS_KEY_JOKER_SWAP_HINT_DELAY_3S_LEGACY = 'mahjlogic.jokerSwapHintDelay3SecondsEnabled'
const LS_KEY_HINT_DELAY_3S_LEGACY = 'mahjlogic.hintDelay3SecondsEnabled'
const HINT_DELAY_SECONDS_OPTIONS = [0, 2, 4] as const
type HintDelaySeconds = (typeof HINT_DELAY_SECONDS_OPTIONS)[number]
const DEFAULT_HINT_DELAY_SECONDS: HintDelaySeconds = 0
/**
 * When false, delay-second chips are omitted from the Mah Jongg / Joker swap hint menu rows
 * and delays use {@link DEFAULT_HINT_DELAY_SECONDS}. Flip to `true` to restore the chips;
 * storage + setters stay wired for that.
 */
const SHOW_HINT_DELAY_IN_MENU = false

function isHintDelaySeconds(n: number): n is HintDelaySeconds {
  return (HINT_DELAY_SECONDS_OPTIONS as readonly number[]).includes(n)
}

/** Map retired 3s/5s choices onto the current 2s/4s options. */
function normalizeHintDelaySeconds(n: number): HintDelaySeconds | null {
  if (isHintDelaySeconds(n)) return n
  if (n === 3) return 2
  if (n === 5) return 4
  return null
}
const LS_KEY_DEAD_TILE_HINT = 'mahjlogic.deadTileHintEnabled'
const DEAD_TILE_HINT_LABEL = 'Dead tile(s) hint'
const LS_KEY_BOT_HANDS_IDENTIFIER = 'mahjlogic.botHandsIdentifierEnabled'
const BOT_HANDS_IDENTIFIER_LABEL = 'Bot hands identifier'
const LS_KEY_CONCEALED_HAND_REMINDER = 'mahjlogic.concealedHandReminderEnabled'

const LS_KEY_BLANK_TILES = 'mahjlogic.blankTilesEnabled'
const LS_KEY_BLANK_TILE_COUNT = 'mahjlogic.blankTileCount'
const LS_KEY_TEN_JOKERS = 'mahjlogic.tenJokersEnabled'
const LS_KEY_PLAY_AS_EAST = 'mahjlogic.playAsEastEnabled'
/** Seat picker values — maps onto `playAsEastEnabled` (east = true, random = false). */
const SEAT_MODES = ['east', 'random'] as const
type SeatMode = (typeof SEAT_MODES)[number]
const SEAT_MODE_LABEL: Record<SeatMode, string> = {
  east: 'East',
  random: 'Random',
}
/**
 * When false, the legacy Play as East toggle is omitted from the settings list
 * (Seat dropdown owns the control). Flip to `true` to restore both.
 */
const SHOW_PLAY_AS_EAST_TOGGLE_IN_MENU = false
const LS_KEY_SUGGESTED_HANDS_TRAY = 'mahjlogic.suggestedHandsTrayDefaultOpen'
/**
 * When false, the Suggested hands tray toggle is omitted from the app menu.
 * Flip to `true` to restore; storage + setters stay wired for that.
 */
const SHOW_SUGGESTED_HANDS_TRAY_TOGGLE_IN_MENU = false
const LS_KEY_HAND_PROBABILITY = 'mahjlogic.handProbabilityEnabled'
/** Stable empty section filter for player Mah Jongg Hands review (avoids per-render `new Set()`). */
const EMPTY_SUGGESTED_HAND_SECTIONS = new Set<string>()
const SUGGESTED_HANDS_TRAY_LABEL = 'Suggested hands'
const HAND_PROBABILITY_LABEL = 'Hand Probability %'
const PLAY_AS_EAST_LABEL = 'Play as East only'
const CONCEALED_HAND_REMINDER_LABEL = 'Concealed hand reminder'
const JOKER_SWAP_HINT_BOUNCE_DELAY_MS = 500
const JOKER_SWAP_HINT_BOUNCE_DURATION_MS = 1700
/** One full keyframe cycle of `joker-swap-hint-dock-bounce` (matches CSS `animation-duration`). */
const JOKER_SWAP_HINT_BOUNCE_ITERATIONS_FULL = 4
const JOKER_SWAP_HINT_BOUNCE_ITERATIONS_SINGLE = 1
/** The keyframe has returned to translateY(0) at 52%; the rest of the iteration is idle. */
const JOKER_SWAP_HINT_BOUNCE_VISIBLE_MS = JOKER_SWAP_HINT_BOUNCE_DURATION_MS * 0.52

/** Menu Tile graphics sample row: same `TileFace` layout as the main hand rack (stacked suit tiles). */
const MENU_TILE_GRAPHICS_PREVIEW: readonly { label: string; def: TileDef }[] = [
  { label: '1d', def: { cat: 'suit', suit: 'dot', rank: 1 } },
  { label: '2d', def: { cat: 'suit', suit: 'dot', rank: 2 } },
  { label: '3b', def: { cat: 'suit', suit: 'bam', rank: 3 } },
  { label: '4b', def: { cat: 'suit', suit: 'bam', rank: 4 } },
  { label: '5c', def: { cat: 'suit', suit: 'crak', rank: 5 } },
  { label: '6c', def: { cat: 'suit', suit: 'crak', rank: 6 } },
  { label: 'F', def: { cat: 'flower', flower: 1 } },
  { label: 'G', def: { cat: 'dragon', dragon: 'green' } },
  { label: 'N', def: { cat: 'wind', wind: 'N' } },
  { label: 'J', def: { cat: 'joker' } },
]

function readTileGraphicsFromStorage(): TileGraphics {
  try {
    const v = localStorage.getItem(LS_KEY_TILE_GRAPHICS)
    const userPicked = localStorage.getItem(LS_KEY_TILE_GRAPHICS_USER_PICKED) === 'true'
    if (userPicked && v != null && isTileGraphics(v)) return v
    /** Obsidian (`dark`) and Ivory (`classic`) removed from the menu → Illustrative Classic. */
    if (v === 'dark' || v === 'classic') {
      localStorage.setItem(LS_KEY_TILE_GRAPHICS, DEFAULT_TILE_GRAPHICS)
      localStorage.setItem(LS_KEY_TILE_GRAPHICS_DEFAULT_MIGRATED, 'true')
      return DEFAULT_TILE_GRAPHICS
    }
    /** Sorbet, Jewel, Autumn removed from the menu → Prism. */
    if (v === 'light' || v === 'designer' || v === 'bakelite') {
      localStorage.setItem(LS_KEY_TILE_GRAPHICS, 'solid-color')
      localStorage.setItem(LS_KEY_TILE_GRAPHICS_DEFAULT_MIGRATED, 'true')
      localStorage.setItem(LS_KEY_TILE_GRAPHICS_PRISM_LEGACY_MIGRATED, 'true')
      return 'solid-color'
    }
    /**
     * Prism was the product default before Illustrative Classic; sessions that still have
     * `solid-color` from that era (not an explicit menu pick since) move to Classic once.
     */
    if (v === 'solid-color' && localStorage.getItem(LS_KEY_TILE_GRAPHICS_PRISM_LEGACY_MIGRATED) !== 'true') {
      localStorage.setItem(LS_KEY_TILE_GRAPHICS, DEFAULT_TILE_GRAPHICS)
      localStorage.setItem(LS_KEY_TILE_GRAPHICS_PRISM_LEGACY_MIGRATED, 'true')
      return DEFAULT_TILE_GRAPHICS
    }
    if (v != null && isTileGraphics(v)) return v
  } catch {
    /* ignore */
  }
  return DEFAULT_TILE_GRAPHICS
}

function persistTileGraphicsChoice(g: TileGraphics): void {
  try {
    // Mark explicit choice + migration flags before the mode value so any storage sync read
    // cannot treat a fresh Prism pick as a legacy default and revert to Classic.
    localStorage.setItem(LS_KEY_TILE_GRAPHICS_USER_PICKED, 'true')
    localStorage.setItem(LS_KEY_TILE_GRAPHICS_DEFAULT_MIGRATED, 'true')
    localStorage.setItem(LS_KEY_TILE_GRAPHICS_PRISM_LEGACY_MIGRATED, 'true')
    localStorage.setItem(LS_KEY_TILE_GRAPHICS, g)
  } catch {
    /* ignore */
  }
}

function readBotWinsEnabledFromStorage(): boolean {
  try {
    const v = localStorage.getItem(LS_KEY_BOT_WINS)
    return v === 'true' || v === '1'
  } catch {
    return false
  }
}

function readColorButtonsFromStorage(): boolean {
  try {
    const v = localStorage.getItem(LS_KEY_COLOR_BUTTONS)
    if (v === null) return false
    return v === 'true' || v === '1'
  } catch {
    return false
  }
}

function readBotDifficultyFromStorage(): BotDifficulty {
  try {
    const v = localStorage.getItem(LS_KEY_BOT_DIFFICULTY)
    if (v === 'unfair') return 'hard'
    if (v != null && isBotDifficulty(v)) return v
  } catch {
    /* ignore */
  }
  return DEFAULT_BOT_DIFFICULTY
}

function readJokerSwapHintFromStorage(): boolean {
  try {
    const v = localStorage.getItem(LS_KEY_JOKER_SWAP_HINT)
    if (v != null) return v === 'true' || v === '1'
    const legacy = localStorage.getItem(LS_KEY_JOKER_FLASH_LEGACY)
    if (legacy != null) {
      const on = legacy === 'true' || legacy === '1'
      localStorage.setItem(LS_KEY_JOKER_SWAP_HINT, on ? 'true' : 'false')
      return on
    }
  } catch {
    /* ignore */
  }
  return true
}

function readDeadHandWarningsFromStorage(): boolean {
  try {
    const v = localStorage.getItem(LS_KEY_DEAD_HAND_WARNINGS)
    if (v === null) return true
    return v === 'true' || v === '1'
  } catch {
    return true
  }
}

function readMahjongHintFromStorage(): boolean {
  try {
    const v = localStorage.getItem(LS_KEY_MAHJONG_HINT)
    if (v === null) return true
    return v === 'true' || v === '1'
  } catch {
    return true
  }
}

function readLegacyHintDelayEnabled(key: string): boolean | null {
  try {
    const v = localStorage.getItem(key)
    if (v == null) return null
    return v === 'true' || v === '1'
  } catch {
    return null
  }
}

function migrateLegacyHintDelaySeconds(perHintKey: string): HintDelaySeconds | null {
  const perHint = readLegacyHintDelayEnabled(perHintKey)
  if (perHint != null) return perHint ? 2 : 0
  const shared = readLegacyHintDelayEnabled(LS_KEY_HINT_DELAY_3S_LEGACY)
  if (shared != null) return shared ? 2 : 0
  return null
}

function readMahjongHintDelaySecondsFromStorage(): HintDelaySeconds {
  try {
    const v = localStorage.getItem(LS_KEY_MAHJONG_HINT_DELAY_SECONDS)
    if (v != null) {
      const normalized = normalizeHintDelaySeconds(Number(v))
      if (normalized != null) {
        if (String(normalized) !== v) {
          localStorage.setItem(LS_KEY_MAHJONG_HINT_DELAY_SECONDS, String(normalized))
        }
        return normalized
      }
    }
    const migrated = migrateLegacyHintDelaySeconds(LS_KEY_MAHJONG_HINT_DELAY_3S_LEGACY)
    if (migrated != null) {
      localStorage.setItem(LS_KEY_MAHJONG_HINT_DELAY_SECONDS, String(migrated))
      return migrated
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_HINT_DELAY_SECONDS
}

function readJokerSwapHintDelaySecondsFromStorage(): HintDelaySeconds {
  try {
    const v = localStorage.getItem(LS_KEY_JOKER_SWAP_HINT_DELAY_SECONDS)
    if (v != null) {
      const normalized = normalizeHintDelaySeconds(Number(v))
      if (normalized != null) {
        if (String(normalized) !== v) {
          localStorage.setItem(LS_KEY_JOKER_SWAP_HINT_DELAY_SECONDS, String(normalized))
        }
        return normalized
      }
    }
    const migrated = migrateLegacyHintDelaySeconds(LS_KEY_JOKER_SWAP_HINT_DELAY_3S_LEGACY)
    if (migrated != null) {
      localStorage.setItem(LS_KEY_JOKER_SWAP_HINT_DELAY_SECONDS, String(migrated))
      return migrated
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_HINT_DELAY_SECONDS
}

/** When `delayMs` is 0, mirrors `active` immediately; otherwise becomes true after the wait. */
function useDelayedReady(active: boolean, delayMs: number): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!active || delayMs <= 0) {
      setReady(false)
      return
    }
    setReady(false)
    const t = window.setTimeout(() => setReady(true), delayMs)
    return () => window.clearTimeout(t)
  }, [active, delayMs])
  if (delayMs <= 0) return active
  return active && ready
}

function readDeadTileHintFromStorage(): boolean {
  try {
    const v = localStorage.getItem(LS_KEY_DEAD_TILE_HINT)
    if (v === null) return true
    return v === 'true' || v === '1'
  } catch {
    return true
  }
}

function readBotHandsIdentifierFromStorage(): boolean {
  try {
    const v = localStorage.getItem(LS_KEY_BOT_HANDS_IDENTIFIER)
    if (v === null) return true
    return v === 'true' || v === '1'
  } catch {
    return true
  }
}

function readUndoFromStorage(): boolean {
  try {
    const v = localStorage.getItem(LS_KEY_UNDO)
    if (v === null) return true
    return v === 'true' || v === '1'
  } catch {
    return true
  }
}

function readAnimationsFromStorage(): boolean {
  try {
    const v = localStorage.getItem(LS_KEY_ANIMATIONS)
    if (v === null) return true
    return v === 'true' || v === '1'
  } catch {
    return true
  }
}

function readConcealedHandReminderFromStorage(): boolean {
  try {
    const v = localStorage.getItem(LS_KEY_CONCEALED_HAND_REMINDER)
    if (v === null) return true
    return v === 'true' || v === '1'
  } catch {
    return true
  }
}

function readBlankTilesEnabledFromStorage(): boolean {
  try {
    const v = localStorage.getItem(LS_KEY_BLANK_TILES)
    if (v === null) return false
    return v === 'true' || v === '1'
  } catch {
    return false
  }
}

function readBlankTileCountFromStorage(): BlankTileCount {
  try {
    const v = localStorage.getItem(LS_KEY_BLANK_TILE_COUNT)
    if (v != null) {
      const n = Number(v)
      if (isBlankTileCount(n)) return n
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_BLANK_TILE_COUNT
}

function readTenJokersEnabledFromStorage(): boolean {
  try {
    const v = localStorage.getItem(LS_KEY_TEN_JOKERS)
    if (v === null) return false
    return v === 'true' || v === '1'
  } catch {
    return false
  }
}

/** Default on: always sit East unless the player turns this off (random seat). */
function readPlayAsEastEnabledFromStorage(): boolean {
  try {
    const v = localStorage.getItem(LS_KEY_PLAY_AS_EAST)
    if (v === null) return true
    return v === 'true' || v === '1'
  } catch {
    return true
  }
}

function readSuggestedHandsTrayDefaultOpenFromStorage(): boolean {
  try {
    const v = localStorage.getItem(LS_KEY_SUGGESTED_HANDS_TRAY)
    if (v === null) return true
    return v === 'true' || v === '1'
  } catch {
    return true
  }
}

function readHandProbabilityEnabledFromStorage(): boolean {
  try {
    const v = localStorage.getItem(LS_KEY_HAND_PROBABILITY)
    if (v === null) return true
    return v === 'true' || v === '1'
  } catch {
    return true
  }
}

/**
 * east-discard      East has 14 tiles and must discard one.
 * bot-turn          A bot just drew and discarded; player can Call (claim discard), declare Mah Jongg, or skip.
 * call-staging      Player tapped Call; called tile is staged in the exposure rack; player chooses meld tiles.
 * mahjong-declared  Player declared Mah Jongg on a bot's discard.
 * bot-mahjong       A bot won by self-draw; game over, show bot win screen.
 */

/** Resets the menu’s draft card id when the menu closes — must be a context consumer so `App` does not. */
function MenuCardDraftOnClose({ onClosed }: { onClosed: () => void }) {
  const { menuOpen } = useAppMenuOpen()
  const prevRef = useRef(false)
  useEffect(() => {
    if (prevRef.current && !menuOpen) onClosed()
    prevRef.current = menuOpen
  }, [menuOpen, onClosed])
  return null
}

/** Closing the menu while a reload resume is pending continues the autosaved hand. */
function ResumePromptOnMenuClose({
  resumePromptActive,
  onContinue,
}: {
  resumePromptActive: boolean
  onContinue: () => void
}) {
  const { menuOpen } = useAppMenuOpen()
  const prevRef = useRef(false)
  useEffect(() => {
    if (prevRef.current && !menuOpen && resumePromptActive) onContinue()
    prevRef.current = menuOpen
  }, [menuOpen, resumePromptActive, onContinue])
  return null
}

/** Settings modal with Menu (lobby) slide panel — owns lobbyOpen so App does not re-render on toggle. */
function AppMenuSlideShell({
  children,
  onOpenRackChecker,
  onOpenStats,
  onResume,
  onNewGame,
  openToMenu = false,
  onOpenToMenuApplied,
}: {
  children: ReactNode
  onOpenRackChecker: () => void
  onOpenStats: () => void
  onResume: () => void
  onNewGame: () => void
  /** When the modal opens, show the Menu pane first (e.g. Resume / New Game). */
  openToMenu?: boolean
  /** Fired after `openToMenu` is applied so one-shot parents can clear their flag. */
  onOpenToMenuApplied?: () => void
}) {
  const { menuOpen } = useAppMenuOpen()
  const [lobbyOpen, setLobbyOpen] = useState(() => menuOpen && openToMenu)
  const slideTrackRef = useRef<HTMLDivElement>(null)
  const menuPaneRef = useRef<HTMLDivElement>(null)
  const prevLobbyOpenRef = useRef(lobbyOpen)
  const onOpenToMenuAppliedRef = useRef(onOpenToMenuApplied)
  onOpenToMenuAppliedRef.current = onOpenToMenuApplied

  useEffect(() => {
    if (!menuOpen) {
      setLobbyOpen(false)
      return
    }
    if (openToMenu) {
      setLobbyOpen(true)
      onOpenToMenuAppliedRef.current?.()
    }
  }, [menuOpen, openToMenu])

  /**
   * After Settings → Menu settles, pin the settings body to the top (off-screen) so
   * returning to Settings does not mid-slide jump.
   */
  useEffect(() => {
    const wasLobbyOpen = prevLobbyOpenRef.current
    prevLobbyOpenRef.current = lobbyOpen
    if (wasLobbyOpen || !lobbyOpen) return

    const track = slideTrackRef.current
    const body = menuPaneRef.current?.querySelector<HTMLElement>('.app-menu-modal__body')
    if (!body) return

    let done = false
    const resetScroll = () => {
      if (done) return
      done = true
      body.scrollTop = 0
    }

    if (!track) {
      resetScroll()
      return
    }

    const onEnd = (event: TransitionEvent) => {
      if (event.target !== track || event.propertyName !== 'transform') return
      resetScroll()
    }
    track.addEventListener('transitionend', onEnd)
    const fallbackId = window.setTimeout(resetScroll, 700)
    return () => {
      track.removeEventListener('transitionend', onEnd)
      window.clearTimeout(fallbackId)
    }
  }, [lobbyOpen])

  return (
    <div
      id="app-menu-modal"
      className={['app-menu-modal', lobbyOpen ? 'app-menu-modal--lobby' : ''].filter(Boolean).join(' ')}
      role="dialog"
      aria-modal="true"
      aria-label={lobbyOpen ? 'Menu' : 'Game Settings'}
    >
      {/* Outside the slide track so it stays put across Menu ↔ Settings. */}
      <LandingTileAtmosphere className="app-menu-modal__lobby-tiles" />
      <div className="app-menu-modal__slide-viewport">
        <div
          ref={slideTrackRef}
          className={[
            'app-menu-modal__slide-track',
            lobbyOpen ? 'app-menu-modal__slide-track--lobby' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <div
            className="app-menu-modal__lobby"
            aria-hidden={!lobbyOpen}
            {...(!lobbyOpen ? ({ inert: '' } as Record<string, string>) : {})}
          >
            <div className="app-menu-modal__lobby-modes" aria-label="Menu">
              <div className="app-menu-modal__diff-block app-menu-modal__diff-block--game-actions">
                <div className="app-menu-modal__section-frame">
                  <div className="app-menu-modal__game-actions-row app-menu-tray__diff-row app-menu-modal__diff-row">
                    <button
                      type="button"
                      className="btn app-menu-tray__diff-btn app-menu-modal__new-game"
                      onClick={onNewGame}
                    >
                      New Game
                    </button>
                    <button
                      type="button"
                      className="btn app-menu-tray__diff-btn"
                      onClick={onResume}
                    >
                      Resume
                    </button>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn app-menu-tray__diff-btn app-menu-modal__lobby-play"
                onClick={() => setLobbyOpen(false)}
              >
                Game Settings
              </button>
              <button
                type="button"
                className="btn app-menu-tray__diff-btn app-menu-modal__lobby-mode-btn"
                onClick={() => {
                  setLobbyOpen(false)
                  appMenuOpenApiRef.current.setMenuOpen(false)
                  onOpenRackChecker()
                }}
              >
                Rack Checker
              </button>
              <button
                type="button"
                className="btn app-menu-tray__diff-btn app-menu-modal__lobby-mode-btn"
                onClick={() => {
                  setLobbyOpen(false)
                  appMenuOpenApiRef.current.setMenuOpen(false)
                  onOpenStats()
                }}
              >
                Stats
              </button>
              <button
                type="button"
                className="btn app-menu-tray__diff-btn app-menu-modal__lobby-mode-btn"
                disabled
                title="Coming soon"
              >
                Help / Tutorial
                <span className="app-menu-modal__lobby-soon">Soon</span>
              </button>
            </div>
            <div className="app-menu-modal__lobby-footer">
              <AppMenuAccountFooter />
            </div>
          </div>
          <div
            ref={menuPaneRef}
            className="app-menu-modal__menu-pane"
            aria-hidden={lobbyOpen}
            {...(lobbyOpen ? ({ inert: '' } as Record<string, string>) : {})}
          >
            <header className="app-menu-modal__header">
              <button
                type="button"
                className="btn app-menu-tray__diff-btn app-menu-modal__lobby-open"
                aria-label="Menu"
                title="Menu"
                onClick={() => setLobbyOpen(true)}
              >
                <span className="app-menu-modal__lobby-open-label">Menu</span>
              </button>
              <h2 className="app-menu-modal__title">Game Settings</h2>
              <button
                type="button"
                className="app-menu-modal__close"
                aria-label="Close"
                onClick={() => appMenuOpenApiRef.current.setMenuOpen(false)}
              >
                ✕
              </button>
            </header>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Menu listbox dropdown — native `<select>` popups cannot be centered with the trigger.
 * Reuses the Select card chrome (`.app-menu-modal__card-select-*`).
 * Title sits left of the trigger; the trigger centers the selected value only.
 */
function MenuSelectDropdown<T extends string>({
  value,
  options,
  labels,
  title,
  onChange,
}: {
  value: T
  options: readonly T[]
  labels: Record<T, string>
  title: string
  onChange: (next: T) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const listId = useId()
  const { menuOpen } = useAppMenuOpen()
  const valueLabel = labels[value]

  useEffect(() => {
    if (!menuOpen) setOpen(false)
  }, [menuOpen])

  useEffect(() => {
    if (!open) return
    const onDocMouseDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div
      className={[
        'app-menu-tray__diff-row',
        'app-menu-modal__diff-row',
        'app-menu-modal__card-select-row',
        open ? 'app-menu-modal__card-select-row--open' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      ref={rootRef}
    >
      <span className="app-menu-modal__card-select-title" id={titleId}>
        {title}:
      </span>
      <div className="app-menu-modal__card-select-picker">
        <button
          type="button"
          className={[
            'btn',
            'app-menu-tray__diff-btn',
            'app-menu-modal__card-select-trigger',
            open ? 'app-menu-modal__card-select-trigger--open' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-labelledby={titleId}
          onClick={() => setOpen((wasOpen) => !wasOpen)}
        >
          <span className="app-menu-modal__card-select-trigger-label">
            {valueLabel}
          </span>
        </button>
        {open ? (
          <ul
            id={listId}
            className="app-menu-modal__card-select-menu"
            role="listbox"
            aria-labelledby={titleId}
          >
            {options.map((id) => {
              const selected = id === value
              return (
                <li
                  key={id}
                  role="option"
                  aria-selected={selected}
                  className={[
                    'app-menu-modal__card-select-option',
                    selected ? 'app-menu-modal__card-select-option--selected' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => {
                    onChange(id)
                    setOpen(false)
                  }}
                >
                  <span className="app-menu-modal__card-select-option-label">
                    {labels[id]}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>
    </div>
  )
}

/** Bot wins menu dropdown — Enabled / Disabled. */
const BOT_WINS_MODES = ['enabled', 'disabled'] as const
type BotWinsMode = (typeof BOT_WINS_MODES)[number]
const BOT_WINS_MODE_LABEL: Record<BotWinsMode, string> = {
  enabled: 'Enabled',
  disabled: 'Disabled',
}

/** 10 Jokers menu dropdown — On / Off. */
const TEN_JOKERS_MODES = ['on', 'off'] as const
type TenJokersMode = (typeof TEN_JOKERS_MODES)[number]
const TEN_JOKERS_MODE_LABEL: Record<TenJokersMode, string> = {
  on: 'On',
  off: 'Off',
}

/** Blanks menu dropdown — None turns blanks off; 2 / 4 / 6 enables that count. */
const BLANK_MENU_MODES = ['none', '2', '4', '6'] as const
type BlankMenuMode = (typeof BLANK_MENU_MODES)[number]
const BLANK_MENU_MODE_LABEL: Record<BlankMenuMode, string> = {
  none: 'None',
  '2': '2',
  '4': '4',
  '6': '6',
}

function blankMenuModeFromState(
  blankTilesEnabled: boolean,
  blankTileCount: BlankTileCount,
): BlankMenuMode {
  if (!blankTilesEnabled) return 'none'
  return String(blankTileCount) as BlankMenuMode
}




function totalCopiesForDeadHintDef(def: TileDef): number {
  if (def.cat === 'flower' || def.cat === 'joker') return 8
  if (def.cat === 'blank') return 6
  return 4
}

function focusedPatternHasAvailableDeadHintVariant(
  focusKey: string | null,
  triggerDef: TileDef,
  unavailableTiles: readonly TileInstance[],
  patterns: PracticePattern[],
  redeemableExposedJokers = 0,
): boolean {
  if (!focusKey) return false
  const variantSep = ['::tier::', '::oc::', '::ocall::']
    .map((s) => focusKey.indexOf(s))
    .filter((i) => i >= 0)
    .reduce((m, i) => (m < 0 ? i : Math.min(m, i)), -1)
  const patternId = variantSep >= 0 ? focusKey.slice(0, variantSep) : focusKey
  // Single lookup — linear find is cheaper than building a Map for one id.
  const pattern = patterns.find((p) => p.id === patternId)
  if (!pattern?.groups?.length) return false
  const pinnedPatterns = buildPinnedPatternsFromFocusKey(pattern, focusKey)
  const candidates = pinnedPatterns.length > 0 ? pinnedPatterns : [pattern]

  const unavailableByKey = new Map<string, number>()
  for (const tile of unavailableTiles) {
    const key = deadHintDefKey(tile.def)
    unavailableByKey.set(key, (unavailableByKey.get(key) ?? 0) + 1)
  }

  for (const candidate of candidates) {
    let variants: DeadHintNeedMap[] = [new Map()]
    for (const group of candidate.groups ?? []) {
      const groupVariants = deadHintGroupNeedVariants(group, triggerDef)
      const next: DeadHintNeedMap[] = []
      for (const base of variants) {
        for (const groupVariant of groupVariants) {
          const merged = copyDeadHintNeeds(base)
          for (const { def, need, canUseJoker } of groupVariant.values()) {
            addDeadHintNeed(merged, def, need, canUseJoker)
          }
          next.push(merged)
        }
      }
      variants = next
    }

    for (const needs of variants) {
      if (
        patternNeedVariantIsSatisfiable(
          needs,
          unavailableByKey,
          totalCopiesForDeadHintDef,
          redeemableExposedJokers,
        )
      ) {
        return true
      }
    }
  }

  return false
}

/** Pre-Charleston wall order: East 14, South/West/North 13 each, then wall — matches `dealOpeningFour` on the shuffled deck. */
function roundOpeningDeckOrder(r: Pick<RoundState, 'hand' | 'bots' | 'wall' | 'playerSeat' | 'botSlotSeats'>): TileInstance[] {
  const four = fourHandsFromRound(r.hand, r.bots, r.playerSeat, r.botSlotSeats)
  return [...four.east, ...four.south, ...four.west, ...four.north, ...r.wall]
}

function discardFromSeat(seat: Seat): 'east' | 'South' | 'West' | 'North' {
  return seat === 'east' ? 'east' : (seatLabel(seat) as 'South' | 'West' | 'North')
}

function toWinDiscardFrom(seat: Seat | BotSeat): 'east' | 'South' | 'West' | 'North' {
  const normalized: Seat =
    seat === 'East'
      ? 'east'
      : seat === 'South'
        ? 'south'
        : seat === 'West'
          ? 'west'
          : seat === 'North'
            ? 'north'
            : seat
  return discardFromSeat(normalized)
}

type OpeningDealMeta = {
  deck: TileInstance[]
  playerSeat: Seat
  botSlotSeats: BotSlotSeats
}

function roundStateFromOpeningDeck(
  deck: TileInstance[],
  randomSeatEnabled: boolean,
  replayMeta?: Pick<OpeningDealMeta, 'playerSeat' | 'botSlotSeats'>,
): RoundState {
  const deal = dealOpeningFour(deck)
  const assigned = replayMeta
    ? {
        hand: deal[replayMeta.playerSeat],
        bots: [
          deal[replayMeta.botSlotSeats[0]],
          deal[replayMeta.botSlotSeats[1]],
          deal[replayMeta.botSlotSeats[2]],
        ] as [TileInstance[], TileInstance[], TileInstance[]],
        botSlotSeats: replayMeta.botSlotSeats,
        playerSeat: replayMeta.playerSeat,
      }
    : assignOpeningHands(deal, randomSeatEnabled)
  const { hand, bots, botSlotSeats, playerSeat } = assigned
  const { wall } = deal
  return {
    hand,
    bots,
    playerSeat,
    botSlotSeats,
    wall,
    openingWallTileCount: wall.length,
    passSlots: [null, null, null],
    passSlotOrigins: [null, null, null],
    selectedHandTileId: null,
    charlestonPhase: 'right1',
    charlestonSkippedSecondRound: false,
    awaitingSecondCharlestonChoice: false,
    mainPhase: 'east-discard',
    discardPile: [],
    drawnTileId: null,
    activeBotIndex: null,
    activeBotDiscard: null,
    botTurnBanner: null,
    eastExposures: [],
    botExposures: [],
    pendingEastDiscardTile: null,
    pendingEastDiscardIdx: null,
    charlestonNewTileIds: [],
    handTileFlyIn: {
      ids: hand.map((t) => t.id),
      from: 'across',
      staggerWaveDelayMs: 44,
    },
    handJokerSwapFlyInFromBelowId: null,
    exposureJokerSwapFlyInTileId: null,
    stagedCallTileIds: [],
    callAmendableAfterClaimTileId: null,
    callAmendFromBotIndex: null,
    botWin: null,
    playerWinMethod: null,
    deadHandReason: null,
  }
}


function createNewRound(
  tenJokersEnabled: boolean,
  blankTilesEnabled: boolean,
  blankTileCount: BlankTileCount,
  randomSeatEnabled: boolean,
): RoundState {
  return roundStateFromOpeningDeck(
    shuffle(
      buildAmericanDeck({
        jokerCount: tenJokersEnabled ? TEN_JOKERS_COUNT : STANDARD_JOKER_COUNT,
        blankTileCount: blankTilesEnabled ? blankTileCount : 0,
      }),
    ),
    randomSeatEnabled,
  )
}

/** Empty table until hydrate finishes — avoids flashing a mount deal before the opening fly-in. */
function createPendingOpeningRound(): RoundState {
  return {
    hand: [],
    bots: [[], [], []],
    playerSeat: 'east',
    botSlotSeats: DEFAULT_BOT_SLOT_SEATS,
    wall: [],
    openingWallTileCount: 0,
    passSlots: [null, null, null],
    passSlotOrigins: [null, null, null],
    selectedHandTileId: null,
    charlestonPhase: 'right1',
    charlestonSkippedSecondRound: false,
    awaitingSecondCharlestonChoice: false,
    mainPhase: 'east-discard',
    discardPile: [],
    drawnTileId: null,
    activeBotIndex: null,
    activeBotDiscard: null,
    botTurnBanner: null,
    eastExposures: [],
    botExposures: [],
    pendingEastDiscardTile: null,
    pendingEastDiscardIdx: null,
    charlestonNewTileIds: [],
    handTileFlyIn: null,
    handJokerSwapFlyInFromBelowId: null,
    exposureJokerSwapFlyInTileId: null,
    stagedCallTileIds: [],
    callAmendableAfterClaimTileId: null,
    callAmendFromBotIndex: null,
    botWin: null,
    playerWinMethod: null,
    deadHandReason: null,
  }
}

/**
 * Dev preview (`?previewWinHand=1`): seed 1 exposure + concealed hand, then (after paint)
 * flip to `mahjong-declared` so the hand→exposure FLIP can be seen / Replay’d.
 */
function createPreviewWinHandRound(phase: 'pre' | 'won' = 'pre'): RoundState {
  let n = 0
  const id = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? `preview-win-${crypto.randomUUID()}`
      : `preview-win-${Date.now()}-${++n}`
  const t = (def: TileDef): TileInstance => ({ id: id(), def })
  const pung = (def: TileDef) => [t(def), t(def), t(def)]
  const expTiles = pung({ cat: 'suit', suit: 'dot', rank: 2 })
  const hand = [
    ...pung({ cat: 'suit', suit: 'bam', rank: 1 }),
    ...pung({ cat: 'suit', suit: 'bam', rank: 3 }),
    ...pung({ cat: 'suit', suit: 'crak', rank: 5 }),
    t({ cat: 'dragon', dragon: 'soap' }),
    t({ cat: 'dragon', dragon: 'soap' }),
  ]
  return {
    ...createPendingOpeningRound(),
    charlestonPhase: 'done',
    mainPhase: phase === 'won' ? 'mahjong-declared' : 'east-discard',
    hand,
    eastExposures: [
      {
        tiles: expTiles,
        claimType: 'pung',
        calledTileId: expTiles[2]!.id,
      },
    ],
    playerWinMethod:
      phase === 'won' ? { type: 'self-draw', tile: hand[0]!.def } : null,
    openingWallTileCount: 40,
  }
}


/** Stable empty melds for memo(ExposureRack) when there is nothing to show. */
const EMPTY_EXPOSURE_RACK_MELDS: { tiles: TileInstance[] }[] = []

/**
 * Hand → call-strip FLIP. CSS `tile-flip-in` is 0.82s (part-0075); settle/dialog use the
 * visual park time so we don’t wait on the ease-out tail.
 *
 * Stagger restarts per call-meld strip (groups fly in parallel) — settle must use the
 * largest flying group, not total flying tiles, or the dialog lags after the last land.
 */
const WIN_HAND_FLY_STAGGER_MS = 52
const WIN_HAND_FLY_VISUAL_MS = 420
type WinHandDumpPhase = 'off' | 'measure' | 'flying' | 'settled'

type BotTurnResult = {
  botHand: TileInstance[]
  wall: TileInstance[]
  discardPile: DiscardEntry[]
  /** Null when the wall was empty and the bot couldn't draw. */
  discarded: TileInstance | null
  /** East exposures after any pre-discard joker swaps the bot performed. */
  eastExposuresOut: EastExposure[]
  /** Bot exposures after any pre-discard joker swaps the bot performed. */
  botExposuresOut: BotExposure[]
  /** True when the bot drew their winning tile (self-draw Mah Jongg). */
  botMahjong: boolean
  /** The tile that completed the hand when `botMahjong` is true. */
  mahjongTile: TileInstance | null
}

/**
 * On this bot’s own turn only (before discard): redeem any joker it can by placing a matching
 * natural into an exposed meld (East’s or any other bot’s). Sole bot joker-swap path (NMJL).
 * Returns the updated hand and exposures; up to 5 swaps per call.
 * Difficulty softens or sharpens how often the bot “sees” a redeem in the first pass.
 */
function performBotPreDiscardSwaps(
  hand: TileInstance[],
  eastExposures: EastExposure[],
  botExposures: BotExposure[],
  difficulty: BotDifficulty = 'normal',
): { hand: TileInstance[]; eastExposures: EastExposure[]; botExposures: BotExposure[] } {
  // Easy: often fail to redeem (discards a natural that could have swapped first)
  if (difficulty === 'easy' && Math.random() < 0.3) {
    return { hand, eastExposures, botExposures }
  }

  let curHand = [...hand]
  let curEast = eastExposures
  let curBots = botExposures
  for (let pass = 0; pass < 5; pass++) {
    // Normal: first outer pass sometimes misses; the next pass catches the same joker
    if (difficulty === 'normal' && pass === 0 && Math.random() < 0.32) {
      continue
    }
    if (difficulty === 'easy' && pass > 0 && Math.random() < 0.24) {
      break
    }
    let swapped = false
    // Scan East's exposures first
    for (let ei = 0; ei < curEast.length && !swapped; ei++) {
      const meld = curEast[ei]!
      const rep = meld.tiles.find((t) => t.def.cat !== 'joker')
      if (!rep) continue
      const jo = meld.tiles.find((t) => t.def.cat === 'joker')
      if (!jo) continue
      const ti = curHand.findIndex((t) => t.def.cat !== 'joker' && tileDefsEqual(t.def, rep.def))
      if (ti < 0) continue
      const natural = curHand[ti]!
      curHand = [...curHand.slice(0, ti), jo, ...curHand.slice(ti + 1)]
      curEast = curEast.map((exp, idx) =>
        idx !== ei ? exp : { ...exp, tiles: exp.tiles.map((t) => (t.id === jo.id ? natural : t)) },
      )
      swapped = true
    }
    // Scan bot exposures (any seat, including own — valid in NMJL)
    for (let ei = 0; ei < curBots.length && !swapped; ei++) {
      const meld = curBots[ei]!
      const rep = meld.tiles.find((t) => t.def.cat !== 'joker')
      if (!rep) continue
      const jo = meld.tiles.find((t) => t.def.cat === 'joker')
      if (!jo) continue
      const ti = curHand.findIndex((t) => t.def.cat !== 'joker' && tileDefsEqual(t.def, rep.def))
      if (ti < 0) continue
      const natural = curHand[ti]!
      curHand = [...curHand.slice(0, ti), jo, ...curHand.slice(ti + 1)]
      curBots = curBots.map((exp, idx) =>
        idx !== ei ? exp : { ...exp, tiles: exp.tiles.map((t) => (t.id === jo.id ? natural : t)) },
      )
      swapped = true
    }
    if (!swapped) break
  }
  return { hand: curHand, eastExposures: curEast, botExposures: curBots }
}

/** Joker redemptions then blank-for-discard exchange — both on this bot's own turn only. */
async function applyBotTurnSwapsAndBlankExchange(
  hand: TileInstance[],
  discardPile: DiscardEntry[],
  seat: Seat,
  botSeat: BotSeat,
  wall: TileInstance[],
  eastExposures: EastExposure[],
  botExposures: BotExposure[],
  difficulty: BotDifficulty,
  cardId: PlayableCardId,
): Promise<{
  hand: TileInstance[]
  discardPile: DiscardEntry[]
  eastExposures: EastExposure[]
  botExposures: BotExposure[]
}> {
  const swapped = performBotPreDiscardSwaps(hand, eastExposures, botExposures, difficulty)
  const ctx: BotRankContext = {
    hand: swapped.hand,
    botSeat,
    wall,
    discardPile,
    eastExposures: swapped.eastExposures,
    botExposures: swapped.botExposures,
  }
  const exchanged = await tryBotBlankExchange(ctx, seat, difficulty, cardId)
  return {
    hand: exchanged.hand,
    discardPile: exchanged.discardPile,
    eastExposures: swapped.eastExposures,
    botExposures: swapped.botExposures,
  }
}

/**
 * Tiles remaining threshold below which a bot may discard a joker as a deliberate
 * defensive play. Discarded jokers are dead — no opponent can call them — making
 * them the safest possible discard when protecting live tiles matters more than
 * holding the joker for a future meld.
 */
const BOT_DEFENSIVE_JOKER_WALL_THRESHOLD = 10

/** One bot draws from the wall, redeems any available jokers, then discards intelligently. */
async function runOneBotTurn(
  botHand: TileInstance[],
  wall: TileInstance[],
  discardPile: DiscardEntry[],
  seat: Seat,
  eastExposures: EastExposure[],
  botExposures: BotExposure[],
  botDifficulty: BotDifficulty,
  /** When false, a bot that could win on the draw does not self-declare Mah Jongg and discards instead (practice). */
  botWinsEnabled: boolean,
  cardId: PlayableCardId,
): Promise<BotTurnResult> {
  if (wall.length === 0) {
    return { botHand, wall, discardPile, discarded: null, eastExposuresOut: eastExposures, botExposuresOut: botExposures, botMahjong: false, mahjongTile: null }
  }
  const [drawn, ...wallNext] = wall
  const handWithDraw = [...botHand, drawn]
  const botSeat = (seat.charAt(0).toUpperCase() + seat.slice(1)) as BotSeat
  const swapped = await applyBotTurnSwapsAndBlankExchange(
    handWithDraw,
    discardPile,
    seat,
    botSeat,
    wallNext,
    eastExposures,
    botExposures,
    botDifficulty,
    cardId,
  )
  const handAfterSwaps = swapped.hand
  const discardPileAfterSwaps = swapped.discardPile
  const nonJokers = handAfterSwaps.filter((t) => t.def.cat !== 'joker')
  const jokers = handAfterSwaps.filter((t) => t.def.cat === 'joker')

  // ── Self-draw Mah Jongg check ───────────────────────────────────────────────
  const botSeatLabel = botSeat as BotSeat
  const mjAway = await botBestTilesAway(
    {
      hand: handAfterSwaps,
      botSeat: botSeatLabel,
      wall: wallNext,
      discardPile: discardPileAfterSwaps,
      eastExposures: swapped.eastExposures,
      botExposures: swapped.botExposures,
    },
    cardId,
  )
  if (mjAway === 0) {
    if (botWinsEnabled) {
      return {
        botHand: handAfterSwaps,
        wall: wallNext,
        discardPile: discardPileAfterSwaps,
        discarded: null,
        eastExposuresOut: swapped.eastExposures,
        botExposuresOut: swapped.botExposures,
        botMahjong: true,
        mahjongTile: drawn,
      }
    }
    // Practice: bot does not self-declare — pick a normal discard and keep the round going.
  }

  let pick: TileInstance
  if (nonJokers.length === 0) {
    // Edge case: all jokers
    pick = jokers[0]!
  } else if (
    jokers.length > 0 &&
    wallNext.length < BOT_DEFENSIVE_JOKER_WALL_THRESHOLD &&
    Math.random() < 0.55
  ) {
    // End-game defensive play: discard a joker so opponents cannot call it.
    pick = jokers[Math.floor(Math.random() * jokers.length)]!
  } else {
    // Strategic discard: drop the tile that hurts the best hand least.
    const ctx: BotRankContext = {
      hand: handAfterSwaps,
      botSeat,
      wall: wallNext,
      discardPile: discardPileAfterSwaps,
      eastExposures: swapped.eastExposures,
      botExposures: swapped.botExposures,
    }
    pick = await chooseBotDiscard(ctx, botDifficulty, cardId)
  }
  const handNext = handAfterSwaps.filter((t) => t.id !== pick.id)
  return {
    botHand: handNext,
    wall: wallNext,
    discardPile: [...discardPileAfterSwaps, { tile: pick, seat }],
    discarded: pick,
    eastExposuresOut: swapped.eastExposures,
    botExposuresOut: swapped.botExposures,
    botMahjong: false,
    mahjongTile: null,
  }
}

/** Draw one tile from the wall and add it to the end of the player's hand. */
function autoDrawFromWall(
  hand: TileInstance[],
  wall: TileInstance[],
): { hand: TileInstance[]; wall: TileInstance[]; drawnTileId: string | null } {
  if (wall.length === 0) return { hand, wall, drawnTileId: null }
  const [drawn, ...wallNext] = wall
  return { hand: [...hand, drawn], wall: wallNext, drawnTileId: drawn.id }
}

/** East (or any bot) opening discard from a full concealed rack — no wall draw. */
async function runBotOpeningDiscard(
  botHand: TileInstance[],
  discardPile: DiscardEntry[],
  seat: Seat,
  botSeat: BotSeat,
  wall: TileInstance[],
  eastExposures: EastExposure[],
  botExposures: BotExposure[],
  botDifficulty: BotDifficulty,
  cardId: PlayableCardId,
): Promise<BotTurnResult> {
  const swapped = await applyBotTurnSwapsAndBlankExchange(
    botHand,
    discardPile,
    seat,
    botSeat,
    wall,
    eastExposures,
    botExposures,
    botDifficulty,
    cardId,
  )
  const handAfterSwaps = swapped.hand
  const nonJokers = handAfterSwaps.filter((t) => t.def.cat !== 'joker')
  const jokers = handAfterSwaps.filter((t) => t.def.cat === 'joker')
  let pick: TileInstance
  if (nonJokers.length === 0) {
    pick = jokers[0]!
  } else {
    const ctx: BotRankContext = {
      hand: handAfterSwaps,
      botSeat,
      wall,
      discardPile: swapped.discardPile,
      eastExposures: swapped.eastExposures,
      botExposures: swapped.botExposures,
    }
    pick = await chooseBotDiscard(ctx, botDifficulty, cardId)
  }
  const handNext = handAfterSwaps.filter((t) => t.id !== pick.id)
  return {
    botHand: handNext,
    wall,
    discardPile: [...swapped.discardPile, { tile: pick, seat }],
    discarded: pick,
    eastExposuresOut: swapped.eastExposures,
    botExposuresOut: swapped.botExposures,
    botMahjong: false,
    mahjongTile: null,
  }
}

function startPlayerTurnDraw(r: RoundState): RoundState {
  const draw = autoDrawFromWall(r.hand, r.wall)
  return applyBotsJokerSwapsFromEast({
    ...r,
    hand: draw.hand,
    wall: draw.wall,
    mainPhase: draw.drawnTileId === null ? 'wall-game' : 'east-discard',
    activeBotIndex: null,
    activeBotDiscard: null,
    botTurnBanner: null,
    pendingEastDiscardTile: null,
    drawnTileId: draw.drawnTileId,
    handTileFlyIn: null,
    selectedHandTileId: null,
  })
}

/** After `afterSeat` acted, run the next compass seat (player draw or bot turn). */
async function advanceToNextActorAfter(
  r: RoundState,
  afterSeat: Seat,
  botsNext: [TileInstance[], TileInstance[], TileInstance[]],
  botWinsEnabled: boolean,
  botDifficulty: BotDifficulty,
  cardId: PlayableCardId,
): Promise<RoundState> {
  let nextSeat = nextCompassSeat(afterSeat)
  for (let step = 0; step < 4; step++) {
    if (nextSeat === r.playerSeat) {
      return startPlayerTurnDraw({ ...r, bots: botsNext })
    }
    const bi = botIndexForCompassSeat(r.botSlotSeats, nextSeat)
    if (bi != null) {
      const result = await runOneBotTurn(
        botsNext[bi]!,
        r.wall,
        r.discardPile,
        nextSeat,
        r.eastExposures,
        r.botExposures,
        botDifficulty,
        botWinsEnabled,
        cardId,
      )
      const botsAfter: [TileInstance[], TileInstance[], TileInstance[]] = [
        [...botsNext[0]],
        [...botsNext[1]],
        [...botsNext[2]],
      ]
      botsAfter[bi] = result.botHand
      if (result.botMahjong) {
        return {
          ...r,
          bots: botsAfter,
          wall: result.wall,
          discardPile: result.discardPile,
          eastExposures: result.eastExposuresOut,
          botExposures: result.botExposuresOut,
          mainPhase: 'bot-mahjong',
          activeBotIndex: null,
          activeBotDiscard: null,
          botTurnBanner: null,
          pendingEastDiscardTile: null,
          drawnTileId: null,
          selectedHandTileId: null,
          botWin: { botIndex: bi, how: 'self-draw', tile: result.mahjongTile!.def },
        }
      }
      if (!result.discarded) {
        return startPlayerTurnDraw({
          ...r,
          bots: botsAfter,
          wall: result.wall,
          discardPile: result.discardPile,
          eastExposures: result.eastExposuresOut,
          botExposures: result.botExposuresOut,
        })
      }
      return applyBotsJokerSwapsFromEast({
        ...r,
        bots: botsAfter,
        wall: result.wall,
        discardPile: result.discardPile,
        eastExposures: result.eastExposuresOut,
        botExposures: result.botExposuresOut,
        mainPhase: 'bot-turn',
        activeBotIndex: bi,
        activeBotDiscard: result.discarded,
        botTurnBanner: null,
        pendingEastDiscardTile: null,
        drawnTileId: null,
        selectedHandTileId: null,
      })
    }
    nextSeat = nextCompassSeat(nextSeat)
  }
  return r
}

/** Charleston complete: East discards first; if the player is not East, bots act until the player can call or draw. */
async function beginMainPlayAfterCharleston(
  r: RoundState,
  _botWinsEnabled: boolean,
  botDifficulty: BotDifficulty,
  cardId: PlayableCardId,
): Promise<RoundState> {
  if (r.playerSeat === 'east') {
    return { ...r, mainPhase: 'east-discard' }
  }
  const eastIdx = botIndexForCompassSeat(r.botSlotSeats, 'east')
  if (eastIdx == null) {
    return { ...r, mainPhase: 'east-discard' }
  }
  const result = await runBotOpeningDiscard(
    r.bots[eastIdx]!,
    r.discardPile,
    'east',
    'East',
    r.wall,
    r.eastExposures,
    r.botExposures,
    botDifficulty,
    cardId,
  )
  const botsNext: [TileInstance[], TileInstance[], TileInstance[]] = [
    [...r.bots[0]],
    [...r.bots[1]],
    [...r.bots[2]],
  ]
  botsNext[eastIdx] = result.botHand
  if (!result.discarded) {
    return startPlayerTurnDraw({
      ...r,
      bots: botsNext,
      wall: result.wall,
      discardPile: result.discardPile,
      eastExposures: result.eastExposuresOut,
      botExposures: result.botExposuresOut,
    })
  }
  return applyBotsJokerSwapsFromEast({
    ...r,
    bots: botsNext,
    wall: result.wall,
    discardPile: result.discardPile,
    eastExposures: result.eastExposuresOut,
    botExposures: result.botExposuresOut,
    mainPhase: 'bot-turn',
    activeBotIndex: eastIdx,
    activeBotDiscard: result.discarded,
    botTurnBanner: null,
    pendingEastDiscardTile: null,
    drawnTileId: null,
    selectedHandTileId: null,
  })
}

async function applyCharlestonDoneIfNeeded(
  r: RoundState,
  nextPhase: CharlestonPhase,
  botWinsEnabled: boolean,
  botDifficulty: BotDifficulty,
  cardId: PlayableCardId,
): Promise<RoundState> {
  if (nextPhase !== 'done') return r
  return beginMainPlayAfterCharleston(r, botWinsEnabled, botDifficulty, cardId)
}

/**
 * Check if a bot can form a meld from `discard` + their hand tiles.
 * `strategicProb` (0–1) scales all call thresholds: bots are far more likely
 * to call tiles that advance their best hand than tiles that don't.
 *
 * NMJL-style opens: pung through sextet (≥2 tiles from hand + discard). Not a pair from the discard.
 * Jokers in the bot's hand count toward larger melds.
 *
 * A separate gate (`openClaimMeldsFitSomePracticeLine` in the find* callers) requires that
 * the new exposure, together with this bot’s prior exposures, fits at least one non–closed
 * practice line — so open melds stay interpretable on the book like human play.
 */
function trySingleBotCall(
  botHand: TileInstance[],
  discard: TileDef,
  strategicProb: number = 0.82,
): { claimType: ClaimType; matches: TileInstance[] } | null {
  if (discard.cat === 'joker') return null
  const realMatches = findExactMatches(botHand, discard)
  const jokers = botHand.filter((t) => t.def.cat === 'joker')
  const total = realMatches.length + jokers.length

  if (total >= 5 && Math.random() < strategicProb) {
    const realsToUse = realMatches.slice(0, Math.min(5, realMatches.length))
    const jokersToUse = jokers.slice(0, 5 - realsToUse.length)
    return { claimType: 'sextet', matches: [...realsToUse, ...jokersToUse] }
  }
  if (total >= 4 && Math.random() < strategicProb) {
    const realsToUse = realMatches.slice(0, Math.min(4, realMatches.length))
    const jokersToUse = jokers.slice(0, 4 - realsToUse.length)
    return { claimType: 'quint', matches: [...realsToUse, ...jokersToUse] }
  }
  if (total >= 3 && Math.random() < strategicProb * 0.88) {
    const realsToUse = realMatches.slice(0, Math.min(3, realMatches.length))
    const jokersToUse = jokers.slice(0, 3 - realsToUse.length)
    return { claimType: 'kong', matches: [...realsToUse, ...jokersToUse] }
  }
  if (total >= 2 && Math.random() < strategicProb * 0.65) {
    const realsToUse = realMatches.slice(0, Math.min(2, realMatches.length))
    const jokersToUse = jokers.slice(0, 2 - realsToUse.length)
    return { claimType: 'pung', matches: [...realsToUse, ...jokersToUse] }
  }
  return null
}

/**
 * Scan bots in seat order (South → West → North) to see if any wants to call East's discard.
 * Higher claim types take priority within the same bot; first eligible bot wins.
 */
type BotContextExposureOverride = { east: EastExposure[]; bot: BotExposure[] }

/** Build the strategic context for a single bot at a given index. */
function buildBotContext(
  r: RoundState,
  botHand: TileInstance[],
  botIdx: number,
  exposureOverride?: BotContextExposureOverride,
): BotRankContext {
  const botSeat = botLabelAt(r, botIdx as 0 | 1 | 2)
  return {
    hand: botHand,
    botSeat,
    wall: r.wall,
    discardPile: r.discardPile,
    eastExposures: exposureOverride?.east ?? r.eastExposures,
    botExposures: exposureOverride?.bot ?? r.botExposures,
  }
}

async function findBotCallOnDiscard(
  bots: [TileInstance[], TileInstance[], TileInstance[]],
  discard: TileInstance,
  r: RoundState,
  botDifficulty: BotDifficulty,
  cardId: PlayableCardId,
): Promise<{ botIndex: 0 | 1 | 2; claimType: ClaimType; matches: TileInstance[] } | null> {
  const order = botIndicesInCompassPlayOrder(r.playerSeat, r.botSlotSeats)
  for (const i of order) {
    const ctx = buildBotContext(r, bots[i]!, i)
    const prob = await botCallStrategicProbability(ctx, discard, botDifficulty, cardId)
    const hit = trySingleBotCall(bots[i]!, discard.def, prob)
    if (!hit) continue
    const seat = botLabelAt(r, i)
    const prior = r.botExposures.filter((e) => e.seat === seat)
    const newExposure: BotExposure = {
      seat,
      tiles: [...hit.matches, discard],
      claimType: hit.claimType,
    }
    if (!openClaimMeldsFitSomePracticeLine([...prior, newExposure])) continue
    return { botIndex: i as 0 | 1 | 2, ...hit }
  }
  return null
}

/**
 * After East skipped `discarderIndex`'s discard, only the next two bots (in turn) may claim.
 */
async function findBotCallAfterEastSkipped(
  bots: [TileInstance[], TileInstance[], TileInstance[]],
  discard: TileInstance,
  discarderIndex: number,
  r: RoundState,
  botDifficulty: BotDifficulty,
  cardId: PlayableCardId,
): Promise<{ botIndex: 0 | 1 | 2; claimType: ClaimType; matches: TileInstance[] } | null> {
  const discarderSeat = botSeatAt(r, discarderIndex as 0 | 1 | 2)
  const candidates = botIndicesAfterCompassSeat(discarderSeat, r.playerSeat, r.botSlotSeats)
  for (const bi of candidates) {
    const ctx = buildBotContext(r, bots[bi]!, bi)
    const prob = await botCallStrategicProbability(ctx, discard, botDifficulty, cardId)
    const hit = trySingleBotCall(bots[bi]!, discard.def, prob)
    if (!hit) continue
    const seat = botLabelAt(r, bi)
    const prior = r.botExposures.filter((e) => e.seat === seat)
    const newExposure: BotExposure = {
      seat,
      tiles: [...hit.matches, discard],
      claimType: hit.claimType,
    }
    if (!openClaimMeldsFitSomePracticeLine([...prior, newExposure])) continue
    return { botIndex: bi, ...hit }
  }
  return null
}

/** `bestTilesAway` for `botHand` + `calledTile` as the claimed discard (14th tile), same rack model as self-draw. */
async function botTilesAwayWithCalledDiscard(
  botHand: TileInstance[],
  calledTile: TileInstance,
  botIndex: 0 | 1 | 2,
  r: Pick<RoundState, 'wall' | 'discardPile' | 'eastExposures' | 'botExposures' | 'botSlotSeats'>,
  cardId: PlayableCardId,
): Promise<number> {
  if (calledTile.def.cat === 'joker') return 99
  const botSeatLabel = botLabelAt(r, botIndex)
  return botBestTilesAway(
    {
      hand: [...botHand, calledTile],
      botSeat: botSeatLabel,
      wall: r.wall,
      discardPile: r.discardPile,
      eastExposures: r.eastExposures,
      botExposures: r.botExposures,
    },
    cardId,
  )
}

/** South → West → North: first bot who wins on this discard (including pair/single 14th tile). */
async function findFirstBotMahjongOnDiscard(
  bots: [TileInstance[], TileInstance[], TileInstance[]],
  calledTile: TileInstance,
  r: Pick<RoundState, 'wall' | 'discardPile' | 'eastExposures' | 'botExposures' | 'botSlotSeats'>,
  cardId: PlayableCardId,
  /** If set, only these indices in order (e.g. next two after a skip). */
  candidateIndices?: readonly (0 | 1 | 2)[],
): Promise<0 | 1 | 2 | null> {
  const order = candidateIndices ?? ([0, 1, 2] as const)
  for (const bi of order) {
    if ((await botTilesAwayWithCalledDiscard(bots[bi]!, calledTile, bi, r, cardId)) === 0) return bi
  }
  return null
}

/**
 * East commits a discard already taken out of the hand (`pendingEastDiscardTile` or staging flow).
 */
async function commitEastDiscardWithHand(
  r: RoundState,
  discardedTile: TileInstance,
  handNext: TileInstance[],
  botWinsEnabled = false,
  botDifficulty: BotDifficulty = 'normal',
  cardId: PlayableCardId,
): Promise<RoundState> {
  if (r.mainPhase !== 'east-discard') return r

  const clearCallAmend: Pick<RoundState, 'callAmendableAfterClaimTileId' | 'callAmendFromBotIndex'> = {
    callAmendableAfterClaimTileId: null,
    callAmendFromBotIndex: null,
  }

  // ── Mah Jongg on East's discard (pair / single 14th tile — no exposure) ──
  const mjBot = botWinsEnabled
    ? await findFirstBotMahjongOnDiscard(r.bots, discardedTile, r, cardId)
    : null
  if (mjBot !== null) {
    const botsNext: [TileInstance[], TileInstance[], TileInstance[]] = [
      [...r.bots[0]],
      [...r.bots[1]],
      [...r.bots[2]],
    ]
    botsNext[mjBot] = [...botsNext[mjBot]!, discardedTile]
    return applyBotsJokerSwapsFromEast({
      ...r,
      ...clearCallAmend,
      hand: handNext,
      bots: botsNext,
      wall: r.wall,
      discardPile: r.discardPile,
      eastExposures: r.eastExposures,
      botExposures: r.botExposures,
      mainPhase: 'bot-mahjong',
      activeBotIndex: null,
      activeBotDiscard: null,
      botTurnBanner: null,
      pendingEastDiscardTile: null,
      drawnTileId: null,
      handTileFlyIn: null,
      selectedHandTileId: null,
      botWin: { botIndex: mjBot, how: 'called-discard', tile: discardedTile.def, discardFrom: discardFromSeat(r.playerSeat) },
    })
  }

  // If East drew the last wall tile, East's discard is the final live discard.
  // Opponents may still win on it (handled above), but they should not call it
  // only to make an exposure and throw another discard when no wall tiles remain.
  if (r.wall.length === 0) {
    return applyBotsJokerSwapsFromEast({
      ...r,
      ...clearCallAmend,
      hand: handNext,
      wall: r.wall,
      discardPile: [...r.discardPile, { tile: discardedTile, seat: r.playerSeat }],
      eastExposures: r.eastExposures,
      botExposures: r.botExposures,
      mainPhase: 'wall-game',
      activeBotIndex: null,
      activeBotDiscard: null,
      botTurnBanner: null,
      pendingEastDiscardTile: null,
      drawnTileId: null,
      handTileFlyIn: null,
      selectedHandTileId: null,
    })
  }

  // ── Check if a bot wants to call East's discard ──────────────────────────
  const botCall = await findBotCallOnDiscard(r.bots, discardedTile, r, botDifficulty, cardId)
  if (botCall) {
    const { botIndex, claimType, matches } = botCall
    const botsNext: [TileInstance[], TileInstance[], TileInstance[]] = [
      [...r.bots[0]],
      [...r.bots[1]],
      [...r.bots[2]],
    ]
    const matchIds = new Set(matches.map((t) => t.id))
    botsNext[botIndex] = botsNext[botIndex].filter((t) => !matchIds.has(t.id))

    const newExposure: BotExposure = {
      seat: botLabelAt(r, botIndex),
      tiles: [...matches, discardedTile],
      claimType,
    }

    // Before discarding, let the bot redeem any available jokers from exposures.
    // The called tile is already locked in the newExposure — only hand tiles are eligible for swaps.
    const allBotExposuresWithNew = [...r.botExposures, newExposure]
    const postCallPrep = await applyBotTurnSwapsAndBlankExchange(
      botsNext[botIndex]!,
      r.discardPile,
      botSeatAt(r, botIndex),
      botLabelAt(r, botIndex),
      r.wall,
      r.eastExposures,
      allBotExposuresWithNew,
      botDifficulty,
      cardId,
    )
    botsNext[botIndex] = postCallPrep.hand
    const eastExposuresAfterCallSwap = postCallPrep.eastExposures
    const botExposuresAfterCallSwap = postCallPrep.botExposures
    const discardPileAfterCallPrep = postCallPrep.discardPile

    const afterCallCtx = buildBotContext(
      r,
      botsNext[botIndex]!,
      botIndex,
      { east: eastExposuresAfterCallSwap, bot: botExposuresAfterCallSwap },
    )
    afterCallCtx.discardPile = discardPileAfterCallPrep
    const nonJokersAfterCall = botsNext[botIndex]!.filter((t) => t.def.cat !== 'joker')
    const pick = nonJokersAfterCall.length > 0
      ? await chooseBotDiscard(afterCallCtx, botDifficulty, cardId)
      : botsNext[botIndex]![0]! // fallback: all jokers, shouldn't happen

    if (!pick) {
      // Bot can't discard (empty hand) — edge case, just advance
      const draw = autoDrawFromWall(handNext, r.wall)
      return applyBotsJokerSwapsFromEast({
        ...r,
        ...clearCallAmend,
        hand: draw.hand,
        bots: botsNext,
        wall: draw.wall,
        eastExposures: eastExposuresAfterCallSwap,
        botExposures: botExposuresAfterCallSwap,
        mainPhase: 'east-discard',
        activeBotIndex: null,
        activeBotDiscard: null,
        botTurnBanner: null,
        pendingEastDiscardTile: null,
        drawnTileId: draw.drawnTileId,
        /* Wall draw for East: no seat-based fly-in — use default top-center drop-in in SortableHand. */
        handTileFlyIn: null,
        selectedHandTileId: null,
      })
    }

    botsNext[botIndex] = botsNext[botIndex].filter((t) => t.id !== pick.id)
    // East's discard was called — it goes into the exposure, not the pile
    const pileWithCallerDiscard: DiscardEntry[] = [
      ...discardPileAfterCallPrep,
      { tile: pick, seat: botSeatAt(r, botIndex) },
    ]

    // Show the calling bot's new discard to the player (same bot-turn flow)
    return applyBotsJokerSwapsFromEast({
      ...r,
      ...clearCallAmend,
      hand: handNext,
      bots: botsNext,
      wall: r.wall,
      discardPile: pileWithCallerDiscard,
      eastExposures: eastExposuresAfterCallSwap,
      botExposures: botExposuresAfterCallSwap,
      mainPhase: 'bot-turn',
      activeBotIndex: botIndex,
      activeBotDiscard: pick,
      botTurnBanner: {
        callerBotIndex: botIndex as 0 | 1 | 2,
        calledDef: discardedTile.def,
        discarderBotIndex: null,
      },
      pendingEastDiscardTile: null,
      drawnTileId: null,
      selectedHandTileId: null,
    })
  }

  // ── Normal flow: no bot called, next compass bot draws from wall ─────────
  const pileAfterPlayer: DiscardEntry[] = [...r.discardPile, { tile: discardedTile, seat: r.playerSeat }]
  const botsNext: [TileInstance[], TileInstance[], TileInstance[]] = [
    [...r.bots[0]],
    [...r.bots[1]],
    [...r.bots[2]],
  ]
  const playOrder = botIndicesAfterPlayerDiscard(r.playerSeat, r.botSlotSeats)
  const firstBotIdx = playOrder[0]!
  const result = await runOneBotTurn(
    botsNext[firstBotIdx],
    r.wall,
    pileAfterPlayer,
    botSeatAt(r, firstBotIdx),
    r.eastExposures,
    r.botExposures,
    botDifficulty,
    botWinsEnabled,
    cardId,
  )
  botsNext[firstBotIdx] = result.botHand

  if (result.botMahjong) {
    return {
      ...r,
      ...clearCallAmend,
      hand: handNext,
      bots: botsNext,
      wall: result.wall,
      discardPile: result.discardPile,
      eastExposures: result.eastExposuresOut,
      botExposures: result.botExposuresOut,
      mainPhase: 'bot-mahjong',
      activeBotIndex: null,
      activeBotDiscard: null,
      botTurnBanner: null,
      pendingEastDiscardTile: null,
      drawnTileId: null,
      selectedHandTileId: null,
      botWin: { botIndex: firstBotIdx, how: 'self-draw', tile: result.mahjongTile!.def },
    }
  }

  if (!result.discarded) {
    const draw = autoDrawFromWall(handNext, result.wall)
    return applyBotsJokerSwapsFromEast({
      ...r,
      ...clearCallAmend,
      hand: draw.hand,
      bots: botsNext,
      wall: draw.wall,
      discardPile: result.discardPile,
      eastExposures: result.eastExposuresOut,
      botExposures: result.botExposuresOut,
      mainPhase: draw.drawnTileId === null ? 'wall-game' : 'east-discard',
      activeBotIndex: null,
      activeBotDiscard: null,
      botTurnBanner: null,
      pendingEastDiscardTile: null,
      drawnTileId: draw.drawnTileId,
      handTileFlyIn: null,
      selectedHandTileId: null,
    })
  }

  return applyBotsJokerSwapsFromEast({
    ...r,
    ...clearCallAmend,
    hand: handNext,
    bots: botsNext,
    wall: result.wall,
    discardPile: result.discardPile,
    eastExposures: result.eastExposuresOut,
    botExposures: result.botExposuresOut,
    mainPhase: 'bot-turn',
    activeBotIndex: firstBotIdx,
    activeBotDiscard: result.discarded,
    botTurnBanner: null,
    pendingEastDiscardTile: null,
    drawnTileId: null,
    selectedHandTileId: null,
  })
}

async function commitEastDiscardAfterStaged(
  r: RoundState,
  botWinsEnabled = false,
  botDifficulty: BotDifficulty = 'normal',
  cardId: PlayableCardId = '2026',
): Promise<RoundState> {
  const staged = r.pendingEastDiscardTile
  if (!staged || r.mainPhase !== 'east-discard') return r
  if (r.hand.some((t) => t.id === staged.id)) return { ...r, pendingEastDiscardTile: null }
  return commitEastDiscardWithHand(r, staged, r.hand, botWinsEnabled, botDifficulty, cardId)
}

/**
 * Player skips the current bot's discard.
 * Remaining bots (in turn) may claim that discard; otherwise the next bot draws and discards,
 * or East draws when all have passed.
 */
async function applySkipBotDiscard(
  r: RoundState,
  botWinsEnabled = false,
  botDifficulty: BotDifficulty = 'normal',
  cardId: PlayableCardId = '2026',
): Promise<RoundState> {
  if (r.mainPhase !== 'bot-turn' || r.activeBotIndex === null || !r.activeBotDiscard) return r

  const fromIdx = r.activeBotIndex as 0 | 1 | 2
  const calledTile = r.activeBotDiscard
  const fromSeat = botSeatAt(r, fromIdx)

  const botsNext: [TileInstance[], TileInstance[], TileInstance[]] = [
    [...r.bots[0]],
    [...r.bots[1]],
    [...r.bots[2]],
  ]

  const skipOrder = botIndicesAfterCompassSeat(fromSeat, r.playerSeat, r.botSlotSeats)
  const mjCaller = botWinsEnabled
    ? await findFirstBotMahjongOnDiscard(botsNext, calledTile, r, cardId, skipOrder)
    : null
  if (mjCaller !== null) {
    botsNext[mjCaller] = [...botsNext[mjCaller]!, calledTile]
    const pileWithoutClaimed = r.discardPile.filter((e) => e.tile.id !== calledTile.id)
    return applyBotsJokerSwapsFromEast({
      ...r,
      bots: botsNext,
      wall: r.wall,
      discardPile: pileWithoutClaimed,
      eastExposures: r.eastExposures,
      botExposures: r.botExposures,
      mainPhase: 'bot-mahjong',
      activeBotIndex: null,
      activeBotDiscard: null,
      botTurnBanner: null,
      pendingEastDiscardTile: null,
      drawnTileId: null,
      handTileFlyIn: null,
      selectedHandTileId: null,
      botWin: {
        botIndex: mjCaller,
        how: 'called-discard',
        tile: calledTile.def,
        discardFrom: toWinDiscardFrom(botSeatAt(r, fromIdx)),
      },
    })
  }

  // Empty wall: once the live discard has made it past East and no remaining bot
  // can declare Mah Jongg on it, no one should call it merely to expose and discard.
  if (r.wall.length === 0) {
    return applyBotsJokerSwapsFromEast({
      ...r,
      bots: botsNext,
      wall: r.wall,
      mainPhase: 'wall-game',
      activeBotIndex: null,
      activeBotDiscard: null,
      botTurnBanner: null,
      pendingEastDiscardTile: null,
      drawnTileId: null,
      handTileFlyIn: null,
      selectedHandTileId: null,
    })
  }

  const botClaim = await findBotCallAfterEastSkipped(
    botsNext,
    calledTile,
    fromIdx,
    r,
    botDifficulty,
    cardId,
  )

  if (botClaim) {
    const { botIndex: callerIdx, claimType, matches } = botClaim
    const matchIds = new Set(matches.map((t) => t.id))
    botsNext[callerIdx] = botsNext[callerIdx]!.filter((t) => !matchIds.has(t.id))

    const newExposure: BotExposure = {
      seat: botLabelAt(r, callerIdx as 0 | 1 | 2),
      tiles: [...matches, calledTile],
      claimType,
    }

    const pileWithoutClaimed = r.discardPile.filter((e) => e.tile.id !== calledTile.id)

    // Before discarding, let the calling bot redeem any available jokers.
    // The called tile is locked in newExposure — only remaining hand tiles are eligible.
    const allBotExposuresSkip = [...r.botExposures, newExposure]
    const postCallPrepSkip = await applyBotTurnSwapsAndBlankExchange(
      botsNext[callerIdx]!,
      pileWithoutClaimed,
      botSeatAt(r, callerIdx as 0 | 1 | 2),
      botLabelAt(r, callerIdx as 0 | 1 | 2),
      r.wall,
      r.eastExposures,
      allBotExposuresSkip,
      botDifficulty,
      cardId,
    )
    botsNext[callerIdx] = postCallPrepSkip.hand
    const eastExposuresAfterSkipSwap = postCallPrepSkip.eastExposures
    const botExposuresAfterSkipSwap = postCallPrepSkip.botExposures
    const discardPileAfterSkipPrep = postCallPrepSkip.discardPile

    const afterSkipCtx = buildBotContext(
      r,
      botsNext[callerIdx]!,
      callerIdx,
      { east: eastExposuresAfterSkipSwap, bot: botExposuresAfterSkipSwap },
    )
    afterSkipCtx.discardPile = discardPileAfterSkipPrep
    const nonJokersSkip = botsNext[callerIdx]!.filter((t) => t.def.cat !== 'joker')
    const pick =
      nonJokersSkip.length > 0
        ? await chooseBotDiscard(afterSkipCtx, botDifficulty, cardId)
        : botsNext[callerIdx]![0]!

    if (!pick) {
      return advanceToNextActorAfter(
        {
          ...r,
          bots: botsNext,
          discardPile: discardPileAfterSkipPrep,
          eastExposures: eastExposuresAfterSkipSwap,
          botExposures: botExposuresAfterSkipSwap,
        },
        botSeatAt(r, callerIdx),
        botsNext,
        botWinsEnabled,
        botDifficulty,
        cardId,
      )
    }

    botsNext[callerIdx] = botsNext[callerIdx]!.filter((t) => t.id !== pick.id)
    const discardPile: DiscardEntry[] = [
      ...discardPileAfterSkipPrep,
      { tile: pick, seat: botSeatAt(r, callerIdx as 0 | 1 | 2) },
    ]

    return applyBotsJokerSwapsFromEast({
      ...r,
      bots: botsNext,
      wall: r.wall,
      discardPile,
      eastExposures: eastExposuresAfterSkipSwap,
      botExposures: botExposuresAfterSkipSwap,
      mainPhase: 'bot-turn',
      activeBotIndex: callerIdx,
      activeBotDiscard: pick,
      botTurnBanner: {
        callerBotIndex: callerIdx,
        calledDef: calledTile.def,
        discarderBotIndex: fromIdx as 0 | 1 | 2,
      },
      drawnTileId: null,
      selectedHandTileId: null,
    })
  }

  return advanceToNextActorAfter(r, fromSeat, botsNext, botWinsEnabled, botDifficulty, cardId)
}

/** Settings menu: horizontal on/off switch (see `.app-menu-tray__toggle-slider` in `src/styles`). */
function AppMenuSettingSwitch({
  labelId,
  pressed,
  onToggle,
}: {
  labelId: string
  pressed: boolean
  onToggle: () => void
}) {
  const [displayPressed, setDisplayPressed] = useState(pressed)

  useEffect(() => {
    setDisplayPressed(pressed)
  }, [pressed])

  const handleClick = () => {
    flushSync(() => {
      setDisplayPressed((v) => !v)
    })
    onToggle()
  }

  return (
    <button
      type="button"
      className="btn app-menu-tray__item app-menu-tray__item--toggle app-menu-tray__item--switch app-menu-modal__toggle"
      aria-labelledby={labelId}
      aria-pressed={displayPressed}
      onClick={handleClick}
    >
      <span className="app-menu-sr-only">{displayPressed ? 'On' : 'Off'}</span>
      <span
        className={['app-menu-tray__toggle-slider', displayPressed ? 'app-menu-tray__toggle-slider--on' : '']
          .filter(Boolean)
          .join(' ')}
        aria-hidden="true"
      >
        <span className="app-menu-tray__toggle-slider__thumb" />
      </span>
    </button>
  )
}

export default function App() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  /** Captured once from Home → Play navigation (cleared from location.state after mount). */
  const homePlayIntentRef = useRef(
    readPlayLocationState(location.state).playIntent ??
      (new URLSearchParams(location.search).get('previewEndDialog') != null ? 'new' : undefined),
  )
  /** Home → Play (new): deal in useLayoutEffect before first paint — do not wait on cloud hydrate. */
  const eagerNewDealDoneRef = useRef(false)
  const [rackCheckerOpen, setRackCheckerOpen] = useState(false)
  /** One-shot: reopen the Menu pane after closing Rack Checker (not Game Settings). */
  const [openMenuToLobby, setOpenMenuToLobby] = useState(false)
  const replayOpeningDeckRef = useRef<TileInstance[] | null>(null)
  const gameResultRecordedRef = useRef(false)
  /** Helper tools actually used during the current hand (reset on each new deal). */
  const handAssistsRef = useRef<Set<GameAssistKey>>(new Set())
  const clientRoundIdRef = useRef(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `round-${Date.now()}`,
  )
  const wallGameEndedByRef = useRef<'natural' | 'manual_end'>('natural')
  const cloudPrefsHydratedRef = useRef(false)
  const prefsSaverRef = useRef(createDebouncedPrefsSaver(400))
  const inProgressSaverRef = useRef(createDebouncedInProgressGameSaver(800))
  /** False until cloud resume check finishes (or user picks Resume / New Game). */
  const sessionReadyRef = useRef(false)
  const [sessionReady, setSessionReady] = useState(false)
  const [resumePrompt, setResumePrompt] = useState<InProgressGameSnapshot | null>(null)
  const sessionBoot = useSessionBoot()
  /** Cold-start opening deal: arm fly-in only after the boot load screen dismisses. */
  const pendingOpeningDealFlyInRef = useRef(false)
  /** Reload / login (no Home play intent): open the menu once the boot loader is gone. */
  const pendingOpenMenuAfterBootRef = useRef(false)
  const [gameMetaPanel, setGameMetaPanel] = useState<'stats' | 'history' | null>(null)
  const replayOpeningMetaRef = useRef<Pick<OpeningDealMeta, 'playerSeat' | 'botSlotSeats'>>({
    playerSeat: 'east',
    botSlotSeats: DEFAULT_BOT_SLOT_SEATS,
  })
  const [round, setRound] = useState<RoundState>(() => createPendingOpeningRound())
  const [suggestedFocusHandKey, setSuggestedFocusHandKey] = useState<string | null>(null)
  const suggestedFocusHandKeyRef = useRef<string | null>(null)
  suggestedFocusHandKeyRef.current = suggestedFocusHandKey
  /**
   * Deferred copy of the focused suggested-hand key for the EXPENSIVE rack/discard coaching
   * highlights only. On a tap, `suggestedFocusHandKey` updates urgently (the tapped row + panel
   * highlight instantly), while the greedy pattern-match recomputation that paints rack/discard
   * tiles runs at lower priority off this deferred value — so it can be interrupted by a rapid
   * second tap instead of stalling input on slower mobile/PWA hardware. In steady state this
   * equals `suggestedFocusHandKey`, so coaching behavior is unchanged; it only lags by one commit
   * immediately after a focus change. Dead-tile detection stays on the urgent key because it only
   * does heavy work when a discard advances (never on a focus-only change).
   */
  const deferredSuggestedFocusHandKey = useDeferredValue(suggestedFocusHandKey)
  const [suggestedDeadTileGuidesByKey, setSuggestedDeadTileGuidesByKey] = useState<
    Record<
      string,
      {
        phase: MainPhase
        suppressAfterPhase: boolean
        deadIds: ReadonlySet<string>
        skullIds: ReadonlySet<string>
        deadCause: DeadCauseHint | null
      }
    >
  >({})
  const [suggestedDeadTableGuidesByKey, setSuggestedDeadTableGuidesByKey] = useState<
    Record<
      string,
      {
        botExposureDeadIds: ReadonlySet<string>
        discardDeadIds: ReadonlySet<string>
      }
    >
  >({})
  const [suggestedHandsTrayDefaultOpen, setSuggestedHandsTrayDefaultOpen] = useState(() =>
    readSuggestedHandsTrayDefaultOpenFromStorage(),
  )
  const [handProbabilityEnabled, setHandProbabilityEnabled] = useState(() =>
    readHandProbabilityEnabledFromStorage(),
  )
  const handProbabilityEnabledRef = useRef(handProbabilityEnabled)
  handProbabilityEnabledRef.current = handProbabilityEnabled
  const markSuggestedHandsAssist = useCallback(() => {
    handAssistsRef.current.add('suggested_hands')
    if (handProbabilityEnabledRef.current) {
      handAssistsRef.current.add('hand_probability')
    }
  }, [])
  const suggestedHandsPopupRef = useRef<HTMLDivElement>(null)
  const eastExposureRackTopRef = useRef<HTMLDivElement>(null)
  const playerHandRackBottomRef = useRef<HTMLDivElement>(null)
  const topDiscardTrackerPanelRef = useRef<HTMLElement>(null)
  const handPanelRef = useRef<HTMLElement>(null)
  /** While true, ResizeObserver / visualViewport must not rewrite `--hand-panel-cqw` (mobile drag). */
  const handPanelCqwFrozenRef = useRef(false)
  const refreshHandPanelCqwRef = useRef<() => void>(() => {})
  const playSurfaceDnDApiRef = useRef<PlaySurfaceDnDApi | null>(null)
  const [suggestedPinnedHandKeys, setSuggestedPinnedHandKeys] = useState<string[]>([])
  const toggleSuggestedPinnedHandKey = useCallback(
    (key: string) => {
      markSuggestedHandsAssist()
      setSuggestedPinnedHandKeys((prev) =>
        prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
      )
    },
    [markSuggestedHandsAssist],
  )
  const [suggestedSuppressedHandKey, setSuggestedSuppressedHandKey] = useState<string | null>(null)
  const menuContainerRef = useRef<HTMLDivElement>(null)
  const [blankTilesEnabled, setBlankTilesEnabled] = useState(() => readBlankTilesEnabledFromStorage())
  const [blankTileCount, setBlankTileCount] = useState<BlankTileCount>(() =>
    readBlankTileCountFromStorage(),
  )
  const [tenJokersEnabled, setTenJokersEnabled] = useState(() => readTenJokersEnabledFromStorage())
  const [playAsEastEnabled, setPlayAsEastEnabled] = useState(() => readPlayAsEastEnabledFromStorage())
  const [wallGameReviewing, setWallGameReviewing] = useState(false)
  const [mahjongWinReviewing, setMahjongWinReviewing] = useState(false)
  const [botMahjongWinReviewing, setBotMahjongWinReviewing] = useState(false)
  /**
   * Win dialog mounts after concealed tiles settle into the exposure strip when
   * animations are on; immediate otherwise.
   */
  const [mahjongWinDialogShown, setMahjongWinDialogShown] = useState(false)
  /**
   * Player Mah Jongg dump: measure hand → opaque FLIP onto the call strip → settle.
   * `measure` keeps tiles in the hand one frame for rect reads.
   */
  const [winHandDumpPhase, setWinHandDumpPhase] = useState<WinHandDumpPhase>('off')
  const [winHandFlyOrigins, setWinHandFlyOrigins] = useState<ReadonlyMap<
    string,
    { x: number; y: number }
  > | null>(null)
  /**
   * Dev preview: `?previewMenu=1` — open the in-game menu on mount for cleanup work.
   */
  const previewMenuActive =
    new URLSearchParams(location.search).get('previewMenu') != null
  /**
   * Dev preview: `?previewEndDialog=1` (or `wall` / `bot`) — drop-in end dialogs without
   * finishing a hand. Replay remounts the panel to re-run `--end-enter`.
   */
  const previewEndDialogActive =
    new URLSearchParams(location.search).get('previewEndDialog') != null
  const [previewEndKind, setPreviewEndKind] = useState<'wall' | 'bot'>(() =>
    new URLSearchParams(location.search).get('previewEndDialog') === 'bot' ? 'bot' : 'wall',
  )
  const [previewEndBurst, setPreviewEndBurst] = useState(0)
  /**
   * Dev preview: `?previewWinHand=1` — seed a win with one exposure and replay the
   * exposure-strip dump + delayed win dialog.
   */
  const previewWinHandActive =
    new URLSearchParams(location.search).get('previewWinHand') != null
  const [previewWinHandBurst, setPreviewWinHandBurst] = useState(0)
  /** Overlay dismissed — table review after wall game / mahjong; hands tray + focus highlights stay available. */
  const postGameTableReviewing =
    wallGameReviewing || mahjongWinReviewing || botMahjongWinReviewing
  const [suggestedPanelTilesOn, setSuggestedPanelTilesOn] = useState(false)
  const toggleSuggestedPanelTilesOn = useCallback(() => {
    markSuggestedHandsAssist()
    setSuggestedPanelTilesOn((v) => !v)
  }, [markSuggestedHandsAssist])
  const toggleSuggestedHandsTrayDefaultOpen = useCallback(() => {
    setSuggestedHandsTrayDefaultOpen((prev) => {
      const next = !prev
      suggestedHandsTrayApiRef.current.setTrayOpen(next)
      try {
        localStorage.setItem(LS_KEY_SUGGESTED_HANDS_TRAY, next ? 'true' : 'false')
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])
  const toggleHandProbability = useCallback(() => {
    setHandProbabilityEnabled((v) => {
      const next = !v
      try {
        localStorage.setItem(LS_KEY_HAND_PROBABILITY, next ? 'true' : 'false')
      } catch {
        /* ignore */
      }
      if (next && handAssistsRef.current.has('suggested_hands')) {
        handAssistsRef.current.add('hand_probability')
      }
      return next
    })
  }, [])
  const [suggestedHandsUncheckedSections, setSuggestedHandsUncheckedSections] = useState<Set<string>>(
    () => readUncheckedSectionsFromStorage(),
  )
  const [suggestedHandsHideConcealed, setSuggestedHandsHideConcealed] = useState<boolean>(() =>
    readHideConcealedHandsFromStorage(),
  )

  // ── Game options (persisted) ──────────────────────────────────────────────
  const [botWinsEnabled, setBotWinsEnabled] = useState<boolean>(() => readBotWinsEnabledFromStorage())
  const [animationsEnabled, setAnimationsEnabled] = useState<boolean>(() => readAnimationsFromStorage())
  const [colorButtonsEnabled, setColorButtonsEnabled] = useState<boolean>(() => readColorButtonsFromStorage())

  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>(() => readBotDifficultyFromStorage())
  const botDifficultyRef = useRef(botDifficulty)
  botDifficultyRef.current = botDifficulty
  const [appTheme, setAppTheme] = useState<AppTheme>(() => readAppThemeFromStorage())
  const [committedCardId, setCommittedCardId] = useState<PlayableCardId>(() => {
    const id = readPlayableCardFromStorage()
    setActiveCardPatterns(patternsForCard(id))
    return id
  })
  const [menuCardId, setMenuCardId] = useState<PlayableCardId>(() => readPlayableCardFromStorage())
  const committedCardIdRef = useRef(committedCardId)
  const menuCardIdRef = useRef(menuCardId)
  committedCardIdRef.current = committedCardId
  menuCardIdRef.current = menuCardId
  const cardPatterns = useMemo(() => patternsForCard(committedCardId), [committedCardId])
  const cardPatternsById = useMemo(() => patternByIdLookup(cardPatterns), [cardPatterns])
  const cardSectionOrder = useMemo(() => [...cardSectionOrderFromPatterns(cardPatterns)], [cardPatterns])

  const suggestedHandsFilterColumns = useMemo(
    () => suggestedHandsFilterMenuColumns(cardSectionOrder),
    [cardSectionOrder],
  )

  useLayoutEffect(() => {
    setActiveCardPatterns(cardPatterns)
  }, [cardPatterns])

  const [tileGraphics, setTileGraphics] = useState<TileGraphics>(() => readTileGraphicsFromStorage())
  const [jokerSwapHintEnabled, setJokerSwapHintEnabled] = useState<boolean>(() =>
    readJokerSwapHintFromStorage(),
  )
  const [deadHandWarningsEnabled, setDeadHandWarningsEnabled] = useState<boolean>(() =>
    readDeadHandWarningsFromStorage(),
  )
  const [mahjongHintEnabled, setMahjongHintEnabled] = useState<boolean>(() => readMahjongHintFromStorage())
  const [mahjongHintDelaySeconds, setMahjongHintDelaySeconds] = useState<HintDelaySeconds>(() =>
    readMahjongHintDelaySecondsFromStorage(),
  )
  const [jokerSwapHintDelaySeconds, setJokerSwapHintDelaySeconds] = useState<HintDelaySeconds>(() =>
    readJokerSwapHintDelaySecondsFromStorage(),
  )
  const [deadTileHintEnabled, setDeadTileHintEnabled] = useState<boolean>(() =>
    readDeadTileHintFromStorage(),
  )
  const [botHandsIdentifierEnabled, setBotHandsIdentifierEnabled] = useState<boolean>(() =>
    readBotHandsIdentifierFromStorage(),
  )
  /** When set, the hands tray shows that seat’s possible open card hands instead of East’s list. */
  const [botHandsIdentifierFocusSeat, setBotHandsIdentifierFocusSeat] = useState<BotSeat | null>(null)
  /** Tray open state before bot possible-hands was shown; restored when that view closes. */
  const trayOpenBeforeBotHandsRef = useRef<boolean | null>(null)
  const [concealedHandReminderEnabled, setConcealedHandReminderEnabled] = useState<boolean>(() =>
    readConcealedHandReminderFromStorage(),
  )
  const [undoEnabled, setUndoEnabled] = useState<boolean>(() => readUndoFromStorage())
  const setTileGraphicsMode = useCallback((g: TileGraphics) => {
    setTileGraphics(g)
    persistTileGraphicsChoice(g)
    if (isIllustrativeTileGraphics(g)) {
      preloadClassicTileArt({ graphics: g, immediate: true })
    }
  }, [])

  const setBotDifficultyLevel = useCallback((d: BotDifficulty) => {
    setBotDifficulty(d)
    try {
      localStorage.setItem(LS_KEY_BOT_DIFFICULTY, d)
    } catch {
      /* ignore */
    }
  }, [])

  const setAppThemeMode = useCallback((t: AppTheme) => {
    setAppTheme(t)
    persistAppTheme(t)
  }, [])

  useLayoutEffect(() => {
    applyAppThemeToDocument(appTheme)
  }, [appTheme])

  const setBotWinsMode = useCallback((mode: BotWinsMode) => {
    const next = mode === 'enabled'
    setBotWinsEnabled((v) => {
      if (v === next) return v
      try {
        localStorage.setItem(LS_KEY_BOT_WINS, next ? 'true' : 'false')
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const toggleDeadHandWarnings = useCallback(() => {
    setDeadHandWarningsEnabled((v) => {
      const next = !v
      try {
        localStorage.setItem(LS_KEY_DEAD_HAND_WARNINGS, next ? 'true' : 'false')
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const toggleJokerSwapHint = useCallback(() => {
    setJokerSwapHintEnabled((v) => {
      const next = !v
      try {
        localStorage.setItem(LS_KEY_JOKER_SWAP_HINT, next ? 'true' : 'false')
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const toggleMahjongHint = useCallback(() => {
    setMahjongHintEnabled((v) => {
      const next = !v
      try {
        localStorage.setItem(LS_KEY_MAHJONG_HINT, next ? 'true' : 'false')
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const setMahjongHintDelaySecondsLevel = useCallback((seconds: HintDelaySeconds) => {
    setMahjongHintDelaySeconds(seconds)
    setMahjongHintEnabled(true)
    try {
      localStorage.setItem(LS_KEY_MAHJONG_HINT_DELAY_SECONDS, String(seconds))
      localStorage.setItem(LS_KEY_MAHJONG_HINT, 'true')
    } catch {
      /* ignore */
    }
  }, [])

  const setJokerSwapHintDelaySecondsLevel = useCallback((seconds: HintDelaySeconds) => {
    setJokerSwapHintDelaySeconds(seconds)
    setJokerSwapHintEnabled(true)
    try {
      localStorage.setItem(LS_KEY_JOKER_SWAP_HINT_DELAY_SECONDS, String(seconds))
      localStorage.setItem(LS_KEY_JOKER_SWAP_HINT, 'true')
    } catch {
      /* ignore */
    }
  }, [])

  const toggleDeadTileHint = useCallback(() => {
    setDeadTileHintEnabled((v) => {
      const next = !v
      try {
        localStorage.setItem(LS_KEY_DEAD_TILE_HINT, next ? 'true' : 'false')
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const restoreTrayAfterBotHands = useCallback(() => {
    const prior = trayOpenBeforeBotHandsRef.current
    if (prior === null) return
    trayOpenBeforeBotHandsRef.current = null
    suggestedHandsTrayApiRef.current.setTrayOpen(prior)
  }, [])

  const clearBotHandsIdentifierFocus = useCallback(() => {
    setBotHandsIdentifierFocusSeat(null)
    restoreTrayAfterBotHands()
  }, [restoreTrayAfterBotHands])

  const toggleBotHandsIdentifier = useCallback(() => {
    setBotHandsIdentifierEnabled((v) => {
      const next = !v
      if (!next) clearBotHandsIdentifierFocus()
      try {
        localStorage.setItem(LS_KEY_BOT_HANDS_IDENTIFIER, next ? 'true' : 'false')
      } catch {
        /* ignore */
      }
      return next
    })
  }, [clearBotHandsIdentifierFocus])

  const onBotExposureRowClick = useCallback((seat: BotSeat) => {
    setBotHandsIdentifierFocusSeat((prev) => {
      const next = prev === seat ? null : seat
      if (next != null) {
        handAssistsRef.current.add('bot_hands')
        if (prev == null) {
          trayOpenBeforeBotHandsRef.current = suggestedHandsTrayApiRef.current.trayOpen
        }
        suggestedHandsTrayApiRef.current.setTrayOpen(true)
      } else {
        restoreTrayAfterBotHands()
      }
      return next
    })
  }, [restoreTrayAfterBotHands])

  const toggleConcealedHandReminder = useCallback(() => {
    setConcealedHandReminderEnabled((v) => {
      const next = !v
      try {
        localStorage.setItem(LS_KEY_CONCEALED_HAND_REMINDER, next ? 'true' : 'false')
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const toggleUndo = useCallback(() => {
    setUndoEnabled((v) => {
      const next = !v
      try {
        localStorage.setItem(LS_KEY_UNDO, next ? 'true' : 'false')
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const toggleAnimations = useCallback(() => {
    setAnimationsEnabled((v) => {
      const next = !v
      try {
        localStorage.setItem(LS_KEY_ANIMATIONS, next ? 'true' : 'false')
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  // Keep a ref so pure-function callbacks always see the current setting value.
  const botWinsEnabledRef = useRef(botWinsEnabled)
  const blankTilesEnabledRef = useRef(blankTilesEnabled)
  const blankTileCountRef = useRef(blankTileCount)
  const tenJokersEnabledRef = useRef(tenJokersEnabled)
  const playAsEastEnabledRef = useRef(playAsEastEnabled)
  useEffect(() => {
    botWinsEnabledRef.current = botWinsEnabled
  }, [botWinsEnabled])
  useEffect(() => {
    blankTilesEnabledRef.current = blankTilesEnabled
  }, [blankTilesEnabled])
  useEffect(() => {
    blankTileCountRef.current = blankTileCount
  }, [blankTileCount])
  useEffect(() => {
    tenJokersEnabledRef.current = tenJokersEnabled
  }, [tenJokersEnabled])
  useEffect(() => {
    playAsEastEnabledRef.current = playAsEastEnabled
  }, [playAsEastEnabled])

  /** Deep link / Home handoff — open overlays and clear one-shot navigation state. */
  useEffect(() => {
    const st = readPlayLocationState(location.state)
    if (!st.openRackChecker && !st.openStats && !st.playIntent) return
    if (st.openRackChecker) setRackCheckerOpen(true)
    if (st.openStats) setGameMetaPanel('stats')
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.state, location.pathname, navigate])

  const deadHandWarningsEnabledRef = useRef(deadHandWarningsEnabled)
  useEffect(() => {
    deadHandWarningsEnabledRef.current = deadHandWarningsEnabled
  }, [deadHandWarningsEnabled])

  const concealedHandReminderEnabledRef = useRef(concealedHandReminderEnabled)
  useEffect(() => {
    concealedHandReminderEnabledRef.current = concealedHandReminderEnabled
  }, [concealedHandReminderEnabled])

  const focusedHandIsConcealedRef = useRef(false)

  /** Re-read on mount: guarantees UI matches `localStorage` after refresh. */
  useEffect(() => {
    const w = readBotWinsEnabledFromStorage()
    setBotWinsEnabled((prev) => (prev === w ? prev : w))
    botWinsEnabledRef.current = w
    setColorButtonsEnabled((prev) => {
      const c = readColorButtonsFromStorage()
      return prev === c ? prev : c
    })
    setBotDifficulty((prev) => {
      const b = readBotDifficultyFromStorage()
      return prev === b ? prev : b
    })
    setAppTheme((prev) => {
      const t = readAppThemeFromStorage()
      return prev === t ? prev : t
    })
    setTileGraphics((prev) => {
      const t = readTileGraphicsFromStorage()
      return prev === t ? prev : t
    })
    setJokerSwapHintEnabled((prev) => {
      const h = readJokerSwapHintFromStorage()
      return prev === h ? prev : h
    })
    setDeadHandWarningsEnabled((prev) => {
      const d = readDeadHandWarningsFromStorage()
      return prev === d ? prev : d
    })
    setMahjongHintEnabled((prev) => {
      const m = readMahjongHintFromStorage()
      return prev === m ? prev : m
    })
    setMahjongHintDelaySeconds((prev) => {
      const d = readMahjongHintDelaySecondsFromStorage()
      return prev === d ? prev : d
    })
    setJokerSwapHintDelaySeconds((prev) => {
      const d = readJokerSwapHintDelaySecondsFromStorage()
      return prev === d ? prev : d
    })
    setDeadTileHintEnabled((prev) => {
      const d = readDeadTileHintFromStorage()
      return prev === d ? prev : d
    })
    setBotHandsIdentifierEnabled((prev) => {
      const b = readBotHandsIdentifierFromStorage()
      return prev === b ? prev : b
    })
    setConcealedHandReminderEnabled((prev) => {
      const c = readConcealedHandReminderFromStorage()
      return prev === c ? prev : c
    })
    setUndoEnabled((prev) => {
      const u = readUndoFromStorage()
      return prev === u ? prev : u
    })
    setAnimationsEnabled((prev) => {
      const a = readAnimationsFromStorage()
      return prev === a ? prev : a
    })
    setSuggestedHandsUncheckedSections(() => readUncheckedSectionsFromStorage())
    setSuggestedHandsHideConcealed((prev) => {
      const h = readHideConcealedHandsFromStorage()
      return prev === h ? prev : h
    })
  }, [])

  useEffect(() => {
    writeUncheckedSectionsToStorage(suggestedHandsUncheckedSections)
  }, [suggestedHandsUncheckedSections])

  useEffect(() => {
    writeHideConcealedHandsToStorage(suggestedHandsHideConcealed)
  }, [suggestedHandsHideConcealed])

  /** If another tab changes a preference, stay in sync. */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.storageArea !== localStorage) return
      if (e.key === LS_KEY_BOT_WINS) {
        if (e.newValue == null) return
        const on = e.newValue === 'true' || e.newValue === '1'
        setBotWinsEnabled(on)
        botWinsEnabledRef.current = on
      } else if (e.key === LS_KEY_COLOR_BUTTONS) {
        if (e.newValue == null) return
        setColorButtonsEnabled(e.newValue === 'true' || e.newValue === '1')
      } else if (e.key === LS_KEY_BOT_DIFFICULTY) {
        if (e.newValue == null) return
        if (isBotDifficulty(e.newValue)) setBotDifficulty(e.newValue)
        else if (e.newValue === 'unfair') setBotDifficulty('hard')
      } else if (e.key === LS_KEY_APP_THEME) {
        if (e.newValue == null || !isAppTheme(e.newValue)) return
        setAppTheme(e.newValue)
      } else if (e.key === LS_KEY_TILE_GRAPHICS) {
        if (e.newValue == null || !isTileGraphics(e.newValue)) return
        setTileGraphics(e.newValue)
      } else if (e.key === LS_KEY_DEAD_HAND_WARNINGS) {
        if (e.newValue == null) return
        const on = e.newValue === 'true' || e.newValue === '1'
        setDeadHandWarningsEnabled(on)
        deadHandWarningsEnabledRef.current = on
      } else if (e.key === LS_KEY_JOKER_SWAP_HINT) {
        if (e.newValue == null) return
        setJokerSwapHintEnabled(e.newValue === 'true' || e.newValue === '1')
      } else if (e.key === LS_KEY_MAHJONG_HINT) {
        if (e.newValue == null) return
        setMahjongHintEnabled(e.newValue === 'true' || e.newValue === '1')
      } else if (e.key === LS_KEY_MAHJONG_HINT_DELAY_SECONDS) {
        if (e.newValue == null) return
        const n = normalizeHintDelaySeconds(Number(e.newValue))
        if (n != null) setMahjongHintDelaySeconds(n)
      } else if (e.key === LS_KEY_JOKER_SWAP_HINT_DELAY_SECONDS) {
        if (e.newValue == null) return
        const n = normalizeHintDelaySeconds(Number(e.newValue))
        if (n != null) setJokerSwapHintDelaySeconds(n)
      } else if (e.key === LS_KEY_DEAD_TILE_HINT) {
        if (e.newValue == null) return
        setDeadTileHintEnabled(e.newValue === 'true' || e.newValue === '1')
      } else if (e.key === LS_KEY_BOT_HANDS_IDENTIFIER) {
        if (e.newValue == null) return
        setBotHandsIdentifierEnabled(e.newValue === 'true' || e.newValue === '1')
      } else if (e.key === LS_KEY_CONCEALED_HAND_REMINDER) {
        if (e.newValue == null) return
        setConcealedHandReminderEnabled(e.newValue === 'true' || e.newValue === '1')
      } else if (e.key === LS_KEY_UNDO) {
        if (e.newValue == null) return
        setUndoEnabled(e.newValue === 'true' || e.newValue === '1')
      } else if (e.key === LS_KEY_ANIMATIONS) {
        if (e.newValue == null) return
        setAnimationsEnabled(e.newValue === 'true' || e.newValue === '1')
      } else if (e.key === SUGGESTED_HANDS_UNCHECKED_SECTIONS_KEY) {
        if (e.newValue == null) return
        setSuggestedHandsUncheckedSections(readUncheckedSectionsFromStorage())
      } else if (e.key === HIDE_CONCEALED_HANDS_STORAGE_KEY) {
        if (e.newValue == null) return
        setSuggestedHandsHideConcealed(readHideConcealedHandsFromStorage())
      } else if (e.key === LS_KEY_PLAY_AS_EAST) {
        if (e.newValue == null) return
        const on = e.newValue === 'true' || e.newValue === '1'
        setPlayAsEastEnabled(on)
        playAsEastEnabledRef.current = on
      } else if (e.key === LS_KEY_TEN_JOKERS) {
        if (e.newValue == null) return
        const on = e.newValue === 'true' || e.newValue === '1'
        setTenJokersEnabled(on)
        tenJokersEnabledRef.current = on
      } else if (e.key === LS_KEY_BLANK_TILES) {
        if (e.newValue == null) return
        const on = e.newValue === 'true' || e.newValue === '1'
        setBlankTilesEnabled(on)
        blankTilesEnabledRef.current = on
      } else if (e.key === LS_KEY_BLANK_TILE_COUNT) {
        if (e.newValue == null) return
        const n = Number(e.newValue)
        if (isBlankTileCount(n)) {
          setBlankTileCount(n)
          blankTileCountRef.current = n
        }
      } else if (e.key === LS_KEY_SUGGESTED_HANDS_TRAY) {
        if (e.newValue == null) return
        const on = e.newValue === 'true' || e.newValue === '1'
        setSuggestedHandsTrayDefaultOpen(on)
        suggestedHandsTrayApiRef.current.setTrayOpen(on)
      } else if (e.key === LS_KEY_HAND_PROBABILITY) {
        if (e.newValue == null) return
        const on = e.newValue === 'true' || e.newValue === '1'
        setHandProbabilityEnabled(on)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const discardTrackerPanelRef = useRef<HTMLElement>(null)

  const resetMenuCardDraftOnClose = useCallback(() => {
    setMenuCardId(committedCardIdRef.current)
  }, [])

  const {
    hand,
    wall,
    openingWallTileCount,
    bots,
    playerSeat,
    botSlotSeats,
    passSlots,
    selectedHandTileId,
    charlestonPhase,
    mainPhase,
    discardPile,
    drawnTileId,
    activeBotIndex,
    activeBotDiscard,
    botTurnBanner,
    eastExposures,
    botExposures,
    pendingEastDiscardTile,
    charlestonNewTileIds,
    handTileFlyIn,
    handJokerSwapFlyInFromBelowId,
    exposureJokerSwapFlyInTileId,
    stagedCallTileIds,
    botWin,
    playerWinMethod,
  } = round
  const charlestonDone = charlestonPhase === 'done'
  /**
   * Hands tray ranking + focus highlights: live phases, or table review after wall/mahjong overlays.
   * Dead hand never restores the tray. While an end-game overlay is up (not yet reviewing), coach is off.
   */
  const suggestedHandsCoachActive =
    mainPhase !== 'dead-hand' &&
    (postGameTableReviewing ||
      (mainPhase !== 'mahjong-declared' &&
        mainPhase !== 'bot-mahjong' &&
        mainPhase !== 'wall-game'))

  const playerExposureMelds = useMemo(
    () => playerExposureMeldsForRound({ playerSeat, eastExposures, botExposures }),
    [playerSeat, eastExposures, botExposures],
  )

  /** Columns reserved at the left for pinned call melds — hand row shifts right to match. */
  const callMeldInsetCols = useMemo(() => {
    if (mainPhase === 'bot-mahjong') return 0
    // Keep inset while measuring hand rects so FLIP origins match on-table columns.
    if (
      mainPhase === 'mahjong-declared' &&
      (winHandDumpPhase === 'flying' ||
        winHandDumpPhase === 'settled' ||
        !animationsEnabled)
    ) {
      return 0
    }
    let n = playerExposureMelds.reduce((sum, exp) => sum + exp.tiles.length, 0)
    if (mainPhase === 'call-staging' && activeBotDiscard) {
      n += 1 + stagedCallTileIds.length
    }
    return n
  }, [
    playerExposureMelds,
    mainPhase,
    activeBotDiscard,
    stagedCallTileIds,
    winHandDumpPhase,
    animationsEnabled,
  ])

  const charlestonGlowTileIds = useMemo(() => {
    if (charlestonDone || charlestonNewTileIds.length === 0) return null
    return new Set(charlestonNewTileIds)
  }, [charlestonDone, charlestonNewTileIds])

  /** Natural dragged into the joker swap slot (next to discards); tap Swap — not a discard. */
  const [pendingJokerSwapTileId, setPendingJokerSwapTileId] = useState<string | null>(null)
  const gameModeRef = useRef<'training' | 'competition'>('training')
  /** Drop on call-initiate: animate the called tile from the release point into the exposure slot. */
  const [callEntryMagnet, setCallEntryMagnet] = useState<{ from: { x: number; y: number } } | null>(null)
  const [charlestonPassError, setCharlestonPassError] = useState<string | null>(null)
  /** Charleston pass button: exit animation on pass-strip before `sendCharlestonPass` runs. */
  const [passStripFlyOut, setPassStripFlyOut] = useState<PassStripFlyOutFrom | null>(null)
  const passStripFlyoutTimerRef = useRef<number | null>(null)
  /** Hand tile id last returned from pass box — invisible fallback target for pass-box click. */
  const lastPassReturnTileIdRef = useRef<string | null>(null)
  const [callRuleError, setCallRuleError] = useState<string | null>(null)
  /** Mah Jongg / joker-swap validation — same fixed overlay as Charleston & call errors. */
  const [blockingDialog, setBlockingDialog] = useState<GameBlockingDialog | null>(null)
  const sortModeRef = useRef<SortMode | null>(null)

  // ── Undo history (rack Undo removed; menu exposes Undo) ─────────────────────
  const roundRef = useRef(round)
  roundRef.current = round
  type HistoryEntry = { round: RoundState; sortMode: SortMode | null }
  const historyRef = useRef<HistoryEntry[]>([])
  const [canUndo, setCanUndo] = useState(false)

  /** Commit a game move — snapshots current round onto the undo stack. */
  const pushRound = useCallback(
    (updater: RoundState | ((prev: RoundState) => RoundState)) => {
      historyRef.current = [
        ...historyRef.current,
        { round: roundRef.current, sortMode: sortModeRef.current },
      ]
      setCanUndo(true)
      setRound(updater)
    },
    [],
  )

  /** Rack / staging edits that should not create undo history. */
  const updateRound = useCallback(
    (updater: RoundState | ((prev: RoundState) => RoundState)) => {
      setRound(updater)
    },
    [],
  )

  /** Await bot ranking (worker) then commit — drops the result if the round changed meanwhile. */
  const pushRoundAsync = useCallback(
    async (compute: (r: RoundState) => Promise<RoundState>) => {
      const base = roundRef.current
      const next = await compute(base)
      if (roundRef.current !== base) return
      pushRound(next)
    },
    [pushRound],
  )

  const undoAction = useCallback(() => {
    if (passStripFlyoutTimerRef.current) {
      clearTimeout(passStripFlyoutTimerRef.current)
      passStripFlyoutTimerRef.current = null
    }
    setPassStripFlyOut(null)
    const stack = historyRef.current
    if (stack.length === 0) return
    handAssistsRef.current.add('undo')
    const entry = stack[stack.length - 1]
    historyRef.current = stack.slice(0, -1)
    sortModeRef.current = entry.sortMode
    setCanUndo(stack.length > 1)
    setRound(entry.round)
  }, [])

  useEffect(() => {
    if (mainPhase !== 'east-discard' && mainPhase !== 'call-staging') setPendingJokerSwapTileId(null)
  }, [mainPhase])

  useEffect(() => {
    if (charlestonDone) setCharlestonPassError(null)
  }, [charlestonDone])

  useEffect(() => {
    if (!charlestonDone) return
    lastPassReturnTileIdRef.current = null
    setPassStripFlyOut(null)
    if (passStripFlyoutTimerRef.current) {
      clearTimeout(passStripFlyoutTimerRef.current)
      passStripFlyoutTimerRef.current = null
    }
  }, [charlestonDone])

  useEffect(
    () => () => {
      if (passStripFlyoutTimerRef.current) clearTimeout(passStripFlyoutTimerRef.current)
    },
    [],
  )

  const handTileFlyInKey = handTileFlyIn
    ? `${handTileFlyIn.from}:${[...handTileFlyIn.ids].sort().join(',')}:${handTileFlyIn.staggerWaveDelayMs ?? 0}`
    : ''
  const handTileFlyInCount = handTileFlyIn?.ids.length ?? 0
  const handTileFlyInStaggerMs = handTileFlyIn?.staggerWaveDelayMs ?? 0
  useEffect(() => {
    if (!handTileFlyInKey) return
    const stagger = handTileFlyInStaggerMs
    const n = handTileFlyInCount
    const waveTailMs = n > 0 && stagger > 0 ? (n - 1) * stagger : 0
    /** Multi-tile receive waits ~2 frames before starting `tile-drop-in`. */
    const measureDeferMs = n > 1 ? 40 : 0
    /** ~one `tile-drop-in` duration (340ms) after the last tile’s delay, plus buffer. */
    const clearMs = 340 + waveTailMs + measureDeferMs + 90
    const t = window.setTimeout(() => {
      setRound((r) => (r.handTileFlyIn ? { ...r, handTileFlyIn: null } : r))
    }, clearMs)
    return () => window.clearTimeout(t)
  }, [handTileFlyInKey, handTileFlyInCount, handTileFlyInStaggerMs])

  useEffect(() => {
    if (!handJokerSwapFlyInFromBelowId) return
    const id = handJokerSwapFlyInFromBelowId
    const t = window.setTimeout(() => {
      setRound((r) => (r.handJokerSwapFlyInFromBelowId === id ? { ...r, handJokerSwapFlyInFromBelowId: null } : r))
    }, 400)
    return () => window.clearTimeout(t)
  }, [handJokerSwapFlyInFromBelowId])

  useEffect(() => {
    if (!exposureJokerSwapFlyInTileId) return
    const id = exposureJokerSwapFlyInTileId
    const t = window.setTimeout(() => {
      setRound((r) => (r.exposureJokerSwapFlyInTileId === id ? { ...r, exposureJokerSwapFlyInTileId: null } : r))
    }, 380)
    return () => window.clearTimeout(t)
  }, [exposureJokerSwapFlyInTileId])

  const exposureJokerSwapFlyInTileIds = useMemo((): ReadonlySet<string> | null => {
    if (!animationsEnabled || !exposureJokerSwapFlyInTileId) return null
    return new Set([exposureJokerSwapFlyInTileId])
  }, [animationsEnabled, exposureJokerSwapFlyInTileId])

  /**
   * Bot exposure drop-in: detect new tile ids during render so the first paint already
   * has `animate` — useEffect ran after paint and made tiles pop in then jump into motion.
   */
  const pendingBotExposureFlyInIdsRef = useRef(new Set<string>())
  const prevBotExposureTileIdsSnapshotRef = useRef<string[]>([])
  // Per-tile clear timers so a later exposure never resets or prematurely clears an earlier
  // meld's fly-in (rapid Ignore taps used to skip or double the drop-in with one shared timer).
  const botExposureFlyInTimersRef = useRef(new Map<string, number>())
  const [botExposureFlyInClearEpoch, setBotExposureFlyInClearEpoch] = useState(0)

  const botExposureTileIdsNow = useMemo(
    () => botExposures.flatMap((e) => e.tiles.map((t) => t.id)),
    [botExposures],
  )

  const botExposureFlyInTileIds = useMemo((): ReadonlySet<string> | null => {
    void botExposureFlyInClearEpoch
    const now = botExposureTileIdsNow
    const pending = pendingBotExposureFlyInIdsRef.current
    const prev = prevBotExposureTileIdsSnapshotRef.current

    for (const id of [...pending]) {
      if (!now.includes(id)) pending.delete(id)
    }

    if (animationsEnabled) {
      for (const id of now) {
        if (!prev.includes(id)) pending.add(id)
      }
    }

    prevBotExposureTileIdsSnapshotRef.current = now
    return pending.size > 0 ? pending : null
  }, [botExposureTileIdsNow, animationsEnabled, botExposureFlyInClearEpoch])

  useEffect(() => {
    const timers = botExposureFlyInTimersRef.current
    const pending = pendingBotExposureFlyInIdsRef.current

    if (!animationsEnabled) {
      for (const tid of timers.values()) window.clearTimeout(tid)
      timers.clear()
      if (pending.size > 0) {
        pending.clear()
        setBotExposureFlyInClearEpoch((epoch) => epoch + 1)
      }
      return
    }

    // Each pending tile gets its own 380ms timer, scheduled once when it first appears so its
    // drop-in always runs to completion regardless of how quickly the next meld is exposed.
    for (const id of pending) {
      if (timers.has(id)) continue
      const tid = window.setTimeout(() => {
        timers.delete(id)
        pendingBotExposureFlyInIdsRef.current.delete(id)
        setBotExposureFlyInClearEpoch((epoch) => epoch + 1)
      }, 380)
      timers.set(id, tid)
    }

    // Cancel timers for tiles that left the table (e.g. undo) before their drop-in finished.
    for (const [id, tid] of [...timers]) {
      if (!pending.has(id)) {
        window.clearTimeout(tid)
        timers.delete(id)
      }
    }
  }, [botExposureTileIdsNow, animationsEnabled, botExposureFlyInClearEpoch])

  useEffect(
    () => () => {
      for (const tid of botExposureFlyInTimersRef.current.values()) window.clearTimeout(tid)
      botExposureFlyInTimersRef.current.clear()
    },
    [],
  )

  /** Claimed discard + staged hand tiles — shared upward wave into the meld (opening-deal stagger). */
  const [eastCallStagedWaveFlyIn, setEastCallStagedWaveFlyIn] = useState<{
    staggerDelayMs: number
    baseDelayMs: number
  } | null>(null)

  useEffect(() => {
    if (mainPhase !== 'call-staging') setEastCallStagedWaveFlyIn(null)
  }, [mainPhase])

  /** Opening-deal wave only on entry — drop fly-in wrappers after the stagger finishes so staging
     meld tiles aren’t clipped under `overflow: hidden` for the whole call (WKWebView repaints them
     in halves when suggest-guide classes change). */
  useEffect(() => {
    if (!eastCallStagedWaveFlyIn || !animationsEnabled) return
    const { staggerDelayMs, baseDelayMs } = eastCallStagedWaveFlyIn
    const clearMs = baseDelayMs + 4 * staggerDelayMs + 400
    const tid = window.setTimeout(() => setEastCallStagedWaveFlyIn(null), clearMs)
    return () => window.clearTimeout(tid)
  }, [eastCallStagedWaveFlyIn, animationsEnabled])

  useEffect(() => {
    if (mainPhase === 'east-discard') return
    setRound((r) => {
      if (!r.pendingEastDiscardTile) return r
      return {
        ...r,
        hand: [...r.hand, r.pendingEastDiscardTile],
        pendingEastDiscardTile: null,
      }
    })
  }, [mainPhase])

  const anyExposedJoker = useMemo(() => {
    for (const exp of botExposures) {
      if (exp.tiles.some((t) => t.def.cat === 'joker')) return true
    }
    for (const exp of eastExposures) {
      if (exp.tiles.some((t) => t.def.cat === 'joker')) return true
    }
    return false
  }, [botExposures, eastExposures])

  const jokerSwapUiActive =
    charlestonDone &&
    (mainPhase === 'east-discard' || mainPhase === 'call-staging') &&
    anyExposedJoker

  const jokerSwapPick = useMemo(() => {
    // Prefer an explicitly staged tile; fall back to the discard-tray tile.
    const candidate = pendingJokerSwapTileId
      ? hand.find((t) => t.id === pendingJokerSwapTileId)
      : pendingEastDiscardTile ?? undefined
    if (!candidate || candidate.def.cat === 'joker') return null
    return findNextJokerSwapTarget(botExposures, eastExposures, candidate.def)
  }, [pendingJokerSwapTileId, pendingEastDiscardTile, hand, botExposures, eastExposures])

  /**
   * Deferred snapshots of the rack inputs that feed suggested-hands analysis and highlights.
   * Full-card ranking runs in a Web Worker ({@link useRankSuggestedHandsWorker}); these deferred
   * values still keep greedy rack-highlight / strip inputs off the urgent path so tile clicks
   * paint immediately while coaching catches up a frame later.
   */
  const deferredHand = useDeferredValue(hand)
  const deferredPendingEastDiscardTile = useDeferredValue(pendingEastDiscardTile)
  // Charleston/discard moves shift a tile between `hand` and `passSlots` in one atomic commit.
  // The pattern-match rack below reads the DEFERRED hand, so `passSlots` must be deferred in the
  // same snapshot — otherwise a placed/removed tile is momentarily counted in both (or neither),
  // and the greedy matcher lights the wrong tracker/rack tiles for a frame before snapping back.
  const deferredPassSlots = useDeferredValue(passSlots)

  const callStagingSuggestedPreview = useMemo(() => {
    if (mainPhase !== 'call-staging' || !activeBotDiscard) return null
    return buildCallStagingPreview({
      hand,
      discardPile,
      eastExposures,
      activeBotDiscard,
      stagedCallTileIds,
    }, round)
  }, [mainPhase, hand, discardPile, eastExposures, activeBotDiscard, stagedCallTileIds, round])

  /**
   * Same ids as `rackForSuggestedHandsUi` (below), but jokers in open melds use the tile they represent
   * for distance / strip matching (NMJL) — declared early for joker-swap hint bounce timing.
   */
  const rackForSuggestedPatternMatch = useMemo(
    () => {
      const exposuresForMatch = callStagingSuggestedPreview?.eastMelds ?? eastExposures
      const exposureIds = new Set(exposuresForMatch.flatMap((e) => e.tiles).map((t) => t.id))
      // Wall-draw: match live `hand` so lit/dim seams land with the new tile (deferredHand lags
      // a frame and side-glow clips snap). Charleston keeps deferredHand + deferredPassSlots paired.
      const handForMatch =
        callStagingSuggestedPreview?.handNext ?? (drawnTileId != null ? hand : deferredHand)
      const rack = tileInstancesWithClaimMeldJokersResolved(
        [
          ...handForMatch,
          ...(deferredPendingEastDiscardTile ? [deferredPendingEastDiscardTile] : []),
          ...(deferredPassSlots.filter(Boolean) as TileInstance[]),
        ],
        exposuresForMatch,
      )
      return [...rack].sort((a, b) => Number(exposureIds.has(b.id)) - Number(exposureIds.has(a.id)))
    },
    [
      callStagingSuggestedPreview,
      deferredHand,
      deferredPendingEastDiscardTile,
      deferredPassSlots,
      drawnTileId,
      eastExposures,
      hand,
    ],
  )

  const suggestedHandsExposureMelds = useMemo(() => {
    const exposuresForUi = callStagingSuggestedPreview?.eastMelds ?? eastExposures
    return exposuresForUi.length > 0 ? exposuresForUi : undefined
  }, [callStagingSuggestedPreview, eastExposures])

  const suggestedHandsExposureTileIds = useMemo((): ReadonlySet<string> | undefined => {
    if (!suggestedHandsExposureMelds?.length) return undefined
    return new Set(suggestedHandsExposureMelds.flatMap((e) => e.tiles).map((t) => t.id))
  }, [suggestedHandsExposureMelds])

  /**
   * Discarded tile defs (with multiplicity — one entry per copy) a blank in hand could be redeemed
   * for. Mirrors {@link discardedDefsForBlankExchange} eligibility (jokers/blanks excluded) but
   * keeps duplicates so multiple blanks can each claim a distinct discarded tile. Empty (stable
   * identity) unless the hand holds a blank, so non-blank racks pay no extra ranking/highlight cost.
   */
  const blankExchangeEligibleDiscardDefs = useMemo((): readonly TileDef[] => {
    if (!deferredHand.some((t) => t.def.cat === 'blank')) return EMPTY_TILE_DEF_LIST
    // Only count discards committed to the tracker — a bot's live discard is still claimable
    // and can't back a blank exchange yet, so it must not light the blank in the rack.
    return discardPileCommittedForDisplay({ discardPile, mainPhase, activeBotDiscard })
      .map((e) => e.tile.def)
      .filter((d) => d.cat !== 'joker' && d.cat !== 'blank')
  }, [deferredHand, discardPile, mainPhase, activeBotDiscard])

  /** Hand naturals / exposed jokers that can swap during East's discard when the hint is on. */
  const jokerSwapHintTargetIds = useMemo(() => {
    if (mainPhase !== 'east-discard' || !jokerSwapHintEnabled || !jokerSwapUiActive) {
      return null
    }
    const hand_ = collectHandTileIdsSwappableForJokers(
      hand,
      botExposures,
      eastExposures,
      pendingEastDiscardTile,
    )
    const jokers = collectSwappableJokerTileIds(
      hand,
      pendingEastDiscardTile,
      botExposures,
      eastExposures,
    )
    if (hand_.size === 0 && jokers.size === 0) return null
    return { hand: hand_, jokers }
  }, [
    mainPhase,
    jokerSwapHintEnabled,
    jokerSwapUiActive,
    hand,
    pendingEastDiscardTile,
    botExposures,
    eastExposures,
  ])

  const effectiveMahjongHintDelaySeconds = SHOW_HINT_DELAY_IN_MENU
    ? mahjongHintDelaySeconds
    : DEFAULT_HINT_DELAY_SECONDS
  const effectiveJokerSwapHintDelaySeconds = SHOW_HINT_DELAY_IN_MENU
    ? jokerSwapHintDelaySeconds
    : DEFAULT_HINT_DELAY_SECONDS
  const mahjongHintDelayMs = effectiveMahjongHintDelaySeconds * 1000
  const jokerSwapHintDelayMs = effectiveJokerSwapHintDelaySeconds * 1000
  const jokerSwapHintBounceDelayMs =
    effectiveJokerSwapHintDelaySeconds > 0
      ? jokerSwapHintDelayMs
      : JOKER_SWAP_HINT_BOUNCE_DELAY_MS
  /** Rack Swap button purple border waits for the chosen joker-swap delay. */
  const jokerSwapHintTargetsReady = useDelayedReady(
    !!jokerSwapHintTargetIds,
    jokerSwapHintDelayMs,
  )
  const jokerSwapHintTargetIdsForRackHint = jokerSwapHintTargetsReady
    ? jokerSwapHintTargetIds
    : null

  /** Joker swap hint (dock-bounce): same targets as `jokerSwapHintTargetIds`, animations only. */
  const activeJokerSwapHintBounceIds = useMemo(() => {
    if (!jokerSwapHintTargetIds || !animationsEnabled) return null
    return jokerSwapHintTargetIds
  }, [jokerSwapHintTargetIds, animationsEnabled])

  const suggestedLineFocusActiveForJokerSwapHint = useMemo(() => {
    if (!suggestedFocusHandKey) return false
    if (suggestedSuppressedHandKey === suggestedFocusHandKey) return false
    if (!suggestedHandsCoachActive) return false
    return true
  }, [suggestedFocusHandKey, suggestedSuppressedHandKey, suggestedHandsCoachActive])

  const jokerSwapHandHintSingleBounce = useMemo(
    () =>
      jokerSwapHandHintUsesSingleBounceIteration({
        focusKey: suggestedFocusHandKey,
        suppressedFocusKey: suggestedSuppressedHandKey,
        lineFocusActive: suggestedLineFocusActiveForJokerSwapHint,
        patterns: cardPatterns,
        rack: rackForSuggestedPatternMatch,
        bounceHandIds: activeJokerSwapHintBounceIds?.hand,
        exposureTileIds: suggestedHandsExposureTileIds,
      }),
    [
      suggestedFocusHandKey,
      suggestedSuppressedHandKey,
      suggestedLineFocusActiveForJokerSwapHint,
      cardPatterns,
      rackForSuggestedPatternMatch,
      activeJokerSwapHintBounceIds,
      suggestedHandsExposureTileIds,
    ],
  )

  const jokerSwapHintBounceIterationCount = jokerSwapHandHintSingleBounce
    ? JOKER_SWAP_HINT_BOUNCE_ITERATIONS_SINGLE
    : JOKER_SWAP_HINT_BOUNCE_ITERATIONS_FULL

  const [settlingJokerSwapHintBounceIds, setSettlingJokerSwapHintBounceIds] = useState<{
    hand: ReadonlySet<string>
    jokers: ReadonlySet<string>
  } | null>(null)
  const prevActiveJokerSwapHintBounceIdsRef = useRef<typeof activeJokerSwapHintBounceIds>(null)
  const activeJokerSwapHintBounceStartedAtRef = useRef<number | null>(null)

  useEffect(() => {
    if (activeJokerSwapHintBounceIds) {
      prevActiveJokerSwapHintBounceIdsRef.current = activeJokerSwapHintBounceIds
      if (activeJokerSwapHintBounceStartedAtRef.current == null) {
        activeJokerSwapHintBounceStartedAtRef.current = performance.now()
      }
      setSettlingJokerSwapHintBounceIds(null)
      return
    }

    const prior = prevActiveJokerSwapHintBounceIdsRef.current
    if (!prior) {
      activeJokerSwapHintBounceStartedAtRef.current = null
      setSettlingJokerSwapHintBounceIds(null)
      return
    }

    const startedAt = activeJokerSwapHintBounceStartedAtRef.current
    const elapsed = startedAt == null ? Number.POSITIVE_INFINITY : performance.now() - startedAt
    const afterDelay = elapsed - jokerSwapHintBounceDelayMs
    const phase =
      afterDelay >= 0
        ? afterDelay % JOKER_SWAP_HINT_BOUNCE_DURATION_MS
        : Number.POSITIVE_INFINITY
    const settleMs =
      phase < JOKER_SWAP_HINT_BOUNCE_VISIBLE_MS
        ? JOKER_SWAP_HINT_BOUNCE_VISIBLE_MS - phase
        : 0

    if (settleMs <= 0) {
      prevActiveJokerSwapHintBounceIdsRef.current = null
      activeJokerSwapHintBounceStartedAtRef.current = null
      setSettlingJokerSwapHintBounceIds(null)
      return
    }

    setSettlingJokerSwapHintBounceIds(prior)
    const t = window.setTimeout(() => {
      if (prevActiveJokerSwapHintBounceIdsRef.current === prior) {
        prevActiveJokerSwapHintBounceIdsRef.current = null
      }
      activeJokerSwapHintBounceStartedAtRef.current = null
      setSettlingJokerSwapHintBounceIds((cur) => (cur === prior ? null : cur))
    }, settleMs)
    return () => window.clearTimeout(t)
  }, [activeJokerSwapHintBounceIds, jokerSwapHintBounceDelayMs])

  const rawJokerSwapHintBounceIds = activeJokerSwapHintBounceIds ?? settlingJokerSwapHintBounceIds

  /** Increment when your turn starts again so the dock-bounce animation can replay if swap is still available. */
  const [jokerSwapHintBounceEpoch, setJokerSwapHintBounceEpoch] = useState(0)
  const prevMainPhaseForJokerHintRef = useRef<MainPhase | null>(null)
  useEffect(() => {
    const prev = prevMainPhaseForJokerHintRef.current
    if (mainPhase === 'east-discard' && prev != null && prev !== 'east-discard') {
      setJokerSwapHintBounceEpoch((e) => e + 1)
    } else if (prev === 'east-discard' && mainPhase !== 'east-discard') {
      setJokerSwapBounceAnimDone(true)
    }
    prevMainPhaseForJokerHintRef.current = mainPhase
  }, [mainPhase])

  const [jokerSwapBounceAnimDone, setJokerSwapBounceAnimDone] = useState(false)
  const jokerSwapBounceIsActive = !!rawJokerSwapHintBounceIds && !jokerSwapBounceAnimDone

  useEffect(() => {
    if (!jokerSwapBounceIsActive) return
    const totalMs =
      jokerSwapHintBounceDelayMs +
      JOKER_SWAP_HINT_BOUNCE_DURATION_MS * jokerSwapHintBounceIterationCount
    const t = window.setTimeout(() => setJokerSwapBounceAnimDone(true), totalMs)
    return () => window.clearTimeout(t)
  }, [jokerSwapBounceIsActive, jokerSwapHintBounceIterationCount, jokerSwapHintBounceDelayMs])

  useEffect(() => {
    setJokerSwapBounceAnimDone(false)
  }, [jokerSwapHintBounceEpoch])

  const jokerSwapHintBounceIds = jokerSwapBounceAnimDone ? null : rawJokerSwapHintBounceIds

  const discardTiles = useMemo(
    () => deadDiscardTilesForRanking({ discardPile, mainPhase, activeBotDiscard }),
    [discardPile, mainPhase, activeBotDiscard],
  )

  /** Shown in the discard strip only after all passes / claims resolve — not while East (or bots) may still claim it. */
  const displayedDiscardPile = useMemo(
    () => discardPileCommittedForDisplay({ discardPile, mainPhase, activeBotDiscard }),
    [discardPile, mainPhase, activeBotDiscard],
  )

  /**
   * Discard-tracker fly-in: detect newly displayed tile ids **during render** so the first paint
   * already has `animate` — layout effects run too late relative to parent state otherwise (tile
   * looked like it popped in instantly).
   */
  const pendingDiscardFlyInIdsRef = useRef(new Set<string>())
  const prevDiscardIdsSnapshotRef = useRef<string[]>([])

  useMemo(() => {
    const now = displayedDiscardPile.map((e) => e.tile.id)
    const pending = pendingDiscardFlyInIdsRef.current
    for (const id of [...pending]) {
      if (!now.includes(id)) pending.delete(id)
    }
    if (now.length === 0) {
      prevDiscardIdsSnapshotRef.current = []
      return
    }
    const prev = prevDiscardIdsSnapshotRef.current
    const added = now.filter((id) => !prev.includes(id))
    prevDiscardIdsSnapshotRef.current = now
    if (animationsEnabled && added.length > 0) {
      for (const id of added) pending.add(id)
    }
  }, [displayedDiscardPile, animationsEnabled])

  const incomingBotDiscardFlyFrom = useMemo((): HandTileFlyInFrom | null => {
    if (mainPhase !== 'bot-turn' || !activeBotDiscard || activeBotIndex == null) return null
    if (activeBotIndex < 0 || activeBotIndex > 2) return 'across'
    return handTileFlyInFromBotSeat(activeBotIndex as 0 | 1 | 2)
  }, [mainPhase, activeBotDiscard, activeBotIndex])

  const discardPileScrollElRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = discardPileScrollElRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [displayedDiscardPile.length])

  const canCommitStagedCallDone = useMemo(() => {
    if (mainPhase !== 'call-staging' || !activeBotDiscard) return false
    if (stagedCallTileIds.length >= 2) return true
    if (stagedCallTileIds.length === 0) {
      return hasLegalMahjongOnBotDiscard({
        mainPhase: 'bot-turn',
        activeBotDiscard,
        hand,
        eastExposures,
        botExposures,
        wall,
        discardPile,
      })
    }
    if (stagedCallTileIds.length === 1) return true
    return false
  }, [
    mainPhase,
    activeBotDiscard,
    stagedCallTileIds,
    hand,
    eastExposures,
    botExposures,
    wall,
    discardPile,
  ])

  /**
   * Hide the Done control when the correct next step is only Mah Jongg: either the discard
   * completes the hand with no new exposure, or the staged claim would go directly to 0 away.
   */
  const shouldHideCallStagingDoneButton = useMemo(() => {
    if (mainPhase !== 'call-staging' || !activeBotDiscard) return false
    if (stagedCallTileIds.length === 0) {
      return hasLegalMahjongOnBotDiscard({
        mainPhase: 'bot-turn',
        activeBotDiscard,
        hand,
        eastExposures,
        botExposures,
        wall,
        discardPile,
      })
    }
    return previewStagedCallBestTilesAway(round) === 0
  }, [
    mainPhase,
    activeBotDiscard,
    stagedCallTileIds,
    hand,
    eastExposures,
    botExposures,
    wall,
    discardPile,
    round,
  ])

  const showCallStagingDoneButton = canCommitStagedCallDone && !shouldHideCallStagingDoneButton

  const suggestedRankInput = useMemo((): RankSuggestedHandsInput => {
    const deckSettings = {
      totalJokersInGame: tenJokersEnabled ? TEN_JOKERS_COUNT : STANDARD_JOKER_COUNT,
      totalBlanksInGame: blankTilesEnabled ? blankTileCount : 0,
    }
    // Swap availability for Prob: post-Charleston whenever exposed jokers exist and the rack
    // can redeem them — not gated on East's turn. UI swap chrome still uses jokerSwapUiActive.
    // Per-line math only counts swaps that help that line (see swappableExposedJokersBeneficialForLine).
    const jokerSwapHintForProb =
      charlestonDone && anyExposedJoker
        ? {
            enabled: true as const,
            hand,
            pendingDiscard: pendingEastDiscardTile,
            botExposures,
            eastExposures,
          }
        : undefined

    if (mainPhase === 'call-staging' && activeBotDiscard) {
      const stagingInput = rankInputDuringCallStaging({
        mainPhase,
        hand,
        wall,
        discardPile,
        botExposures,
        eastExposures,
        activeBotDiscard,
        stagedCallTileIds,
      })
      if (stagingInput) {
        return { ...stagingInput, patterns: cardPatterns, deckSettings, jokerSwapHintForProb }
      }
    }

    const handForRank = deferredHand
    // Staged discard stays out of Away matching (not in `hand`) but still counts as owned in
    // Prob rack size so tray bookkeeping matches the 14-tile discard state.
    return {
      hand: handForRank,
      wallRemaining: wall.length,
      discards: discardTiles,
      exposures: botExposures,
      playerClaimMelds: eastExposures,
      eastTableClaimMelds: eastExposures,
      patterns: cardPatterns,
      deckSettings,
      jokerSwapHintForProb,
      pendingDiscardTile: pendingEastDiscardTile,
      // Boost Prob % when this unreclaimed discard already wins a line (Away stays pre-call).
      liveClaimableDiscard:
        mainPhase === 'bot-turn' && activeBotDiscard ? activeBotDiscard : null,
    }
  }, [
    mainPhase,
    hand,
    activeBotDiscard,
    stagedCallTileIds,
    deferredHand,
    wall,
    discardPile,
    discardTiles,
    botExposures,
    eastExposures,
    cardPatterns,
    tenJokersEnabled,
    blankTilesEnabled,
    blankTileCount,
    charlestonDone,
    anyExposedJoker,
    pendingEastDiscardTile,
  ])

  /**
   * Order-independent signature of the ranking rack. A pure rack reorder changes
   * `suggestedRankInput`'s identity but not its tile multiset, and every ranking output
   * (tiles-away, points, sort order) is order-independent — so key the heavy re-rank on this
   * signature to reuse the cached result and skip the full suggested-list rebuild on rearrange.
   */
  const suggestedRankHandSignature = useMemo(
    () => tileMultisetSignature(suggestedRankInput.hand),
    [suggestedRankInput.hand],
  )

  /**
   * Full-card ranking runs in a Web Worker so rack interactions stay on the urgent path.
   * Same content gates as the former sync `useMemo` (hand multiset signature, not array identity).
   * Stale-while-revalidate: the panel keeps the previous lines until the worker replies.
   */
  const eastSuggestedHands = useRankSuggestedHandsWorker({
    input: suggestedRankInput,
    enabled: suggestedHandsCoachActive,
    cardId: committedCardId,
    handSignature: suggestedRankHandSignature,
  })

  /** Menu category labels: still on, but muted when exposures rule out every hand in that section. */
  const suggestedHandsExposureAvailableSections = useMemo(
    () =>
      suggestedHandSectionsAvailableWithClaimMelds(cardPatterns, eastExposures, cardSectionOrder),
    [cardPatterns, eastExposures, cardSectionOrder],
  )

  /** Hand + staged tiles + East exposures — tile faces on the rack and strip (jokers stay jokers). */
  const rackForSuggestedHandsUi = useMemo(
    () => {
      const exposuresForUi = callStagingSuggestedPreview?.eastMelds ?? eastExposures
      const handForUi = callStagingSuggestedPreview?.handNext ?? hand
      return [
        ...handForUi,
        ...(pendingEastDiscardTile ? [pendingEastDiscardTile] : []),
        ...(passSlots.filter(Boolean) as TileInstance[]),
        ...exposuresForUi.flatMap((e) => e.tiles),
      ]
    },
    [callStagingSuggestedPreview, hand, pendingEastDiscardTile, passSlots, eastExposures],
  )

  /**
   * Deferred rack snapshots that feed ONLY the per-hand suggested-tiles strip preview (the
   * ~80-hand `stripSlotRowsByKey` loop in SuggestedHandsPanel). Dragging/reordering/discarding a
   * tile mutates `hand`; reading the strip inputs through `useDeferredValue` keeps that heavy
   * recompute off the urgent render, so the rack snaps into place (drop, reorder, discard) and
   * paints immediately while the strip previews catch up a frame later at low priority. The live
   * rack and its highlight rings still read `rackForSuggestedHandsUi` / `rackForSuggestedPatternMatch`
   * directly (the ring pass is a single focused-hand greedy match — cheap), so only the multi-hand
   * strip previews lag.
   */
  const deferredRackForSuggestedStrip = useDeferredValue(rackForSuggestedHandsUi)
  const deferredRackForSuggestedPatternMatch = useDeferredValue(rackForSuggestedPatternMatch)

  /**
   * True when the focused suggested-hand line is concealed (NMJL "C") — drives the red CONCEALED
   * annotation under "Call" in the rack action well so the player sees they can't claim a discard
   * for an exposure on that line. Off while end-game overlays are up; available again in table review.
   */
  const focusedHandIsConcealed = useMemo(() => {
    if (!suggestedFocusHandKey) return false
    if (!suggestedHandsCoachActive) return false
    const variantSep = ['::tier::', '::oc::', '::ocall::']
      .map((s) => suggestedFocusHandKey.indexOf(s))
      .filter((i) => i >= 0)
      .reduce((m, i) => (m < 0 ? i : Math.min(m, i)), -1)
    const patternId =
      variantSep >= 0 ? suggestedFocusHandKey.slice(0, variantSep) : suggestedFocusHandKey
    const p = cardPatternsById.get(patternId)
    return !!p?.closed
  }, [suggestedFocusHandKey, suggestedHandsCoachActive, cardPatternsById])
  focusedHandIsConcealedRef.current = focusedHandIsConcealed

  const suggestedTileGuide = useMemo(() => {
    // Rack + exposure highlights follow the focused line whenever one is selected — independent of
    // the "Tiles" toggle (that toggle only adds pattern previews inside the suggested-hands list).
    // Reads the DEFERRED focus key so this greedy recompute does not stall rapid taps (see decl).
    if (!deferredSuggestedFocusHandKey || !suggestedHandsCoachActive) return null
    if (suggestedSuppressedHandKey === deferredSuggestedFocusHandKey) return null
    const greedyUiOpts =
      (suggestedHandsExposureTileIds && suggestedHandsExposureTileIds.size > 0) ||
      (suggestedHandsExposureMelds && suggestedHandsExposureMelds.length > 0)
        ? {
            ...(suggestedHandsExposureTileIds && suggestedHandsExposureTileIds.size > 0
              ? { exposureTileIds: suggestedHandsExposureTileIds }
              : {}),
            ...(suggestedHandsExposureMelds && suggestedHandsExposureMelds.length > 0
              ? { claimMelds: suggestedHandsExposureMelds }
              : {}),
          }
        : undefined
    // Focus key format:
    //   `<patternId>`                                  — base focus
    //   `<patternId>::tier::<base>:<perm>|...`         — suit-permute consecRanks tier (single or multi)
    //   `<patternId>::oc::<r>-<s1>-<s2>`               — opposing-consec single variant
    //   `<patternId>::ocall::<r1>-<s1a>-<s1b>|...`     — opposing-consec "all" / category
    const variantSep = ['::tier::', '::oc::', '::ocall::']
      .map((s) => deferredSuggestedFocusHandKey.indexOf(s))
      .filter((i) => i >= 0)
      .reduce((m, i) => (m < 0 ? i : Math.min(m, i)), -1)
    const patternId = variantSep >= 0 ? deferredSuggestedFocusHandKey.slice(0, variantSep) : deferredSuggestedFocusHandKey
    const p = cardPatternsById.get(patternId)
    if (!p) return null

    // Variant key: pin the pattern per combo so highlights match the selected variant row.
    // - Single combo (individual variant click): use strip-aware highlighting so the rack lit
    //   tiles match exactly what the panel row shows.
    // - Multi combo (title row click — "all"): UNION of contributing rack tiles across every
    //   combo so the rack lights up every tile that helps any variant in the stack.
    const unavailableCounts = deadTileHintEnabled
      ? buildUnavailableTileDefCounts([
          ...discardTiles,
          ...botExposures.flatMap((e) => e.tiles),
        ])
      : null

    const computeBlankExchange = (
      pinnedP: PracticePattern,
    ): { ids: Set<string>; targets: TileDef[] } => {
      const blankIds = new Set<string>()
      const targets: TileDef[] = []
      if (
        blankExchangeEligibleDiscardDefs.length > 0 &&
        rackForSuggestedPatternMatch.some((t) => t.def.cat === 'blank')
      ) {
        for (const fill of computeBlankExchangeFills(
          rackForSuggestedPatternMatch,
          pinnedP,
          blankExchangeEligibleDiscardDefs,
          greedyUiOpts,
        )) {
          blankIds.add(fill.blankTileId)
          targets.push(fill.targetDef)
        }
      }
      return { ids: blankIds, targets }
    }

    const computeAvailableRackHighlightIds = (pinnedP: PracticePattern) => {
      let rack = rackForSuggestedPatternMatch
      let detail = greedyPatternMatchDetail(rack, pinnedP, greedyUiOpts)
      let bestIds = computeRackPatternHighlightIds(
        rack,
        pinnedP,
        detail,
        suggestedHandsExposureTileIds,
      )

      if (unavailableCounts && pinnedP.groups) {
        for (let pass = 0; pass < 4; pass++) {
          const infeasible = findInfeasibleBestIds(
            rack, pinnedP.groups, detail.usedMeta, bestIds, unavailableCounts,
          )
          if (infeasible.size === 0) break
          rack = rack.filter((t) => !infeasible.has(t.id))
          detail = greedyPatternMatchDetail(rack, pinnedP, greedyUiOpts)
          bestIds = computeRackPatternHighlightIds(
            rack,
            pinnedP,
            detail,
            suggestedHandsExposureTileIds,
          )
        }
      }

      return bestIds
    }

    if (variantSep >= 0) {
      const pinnedPatterns = buildPinnedPatternsFromFocusKey(p, deferredSuggestedFocusHandKey)
      if (pinnedPatterns.length > 0) {
        const unionIds = new Set<string>()
        const unionBlankIds = new Set<string>()
        const unionTargets: TileDef[] = []
        for (const pinnedP of pinnedPatterns) {
          const ids = computeAvailableRackHighlightIds(pinnedP)
          for (const id of ids) unionIds.add(id)
          const bx = computeBlankExchange(pinnedP)
          for (const id of bx.ids) unionBlankIds.add(id)
          for (const def of bx.targets) unionTargets.push(def)
        }
        return {
          bestIds: unionIds,
          blankExchangeIds: unionBlankIds,
          blankExchangeTargetDefs:
            unionTargets.length > 0 ? unionTargets : EMPTY_TILE_DEF_LIST,
        }
      }
    }

    const blankExchange = computeBlankExchange(p)
    return {
      bestIds: computeAvailableRackHighlightIds(p),
      blankExchangeIds: blankExchange.ids,
      blankExchangeTargetDefs:
        blankExchange.targets.length > 0 ? blankExchange.targets : EMPTY_TILE_DEF_LIST,
    }
  }, [deferredSuggestedFocusHandKey, suggestedSuppressedHandKey, suggestedHandsCoachActive, rackForSuggestedPatternMatch, suggestedHandsExposureTileIds, suggestedHandsExposureMelds, cardPatternsById, deadTileHintEnabled, discardTiles, botExposures, blankExchangeEligibleDiscardDefs])

  /**
   * Bot exposure rings for the focused line: naturals that match strip “need” slots (dead tiles you
   * want), swappable jokers you can redeem with a natural in hand, and — while the line can still
   * use jokers — every bot meld joker (see shouldHighlightBotExposureJokers).
   */
  const botExposureSuggestedTileGuide = useMemo(() => {
    if (!deferredSuggestedFocusHandKey || !suggestedHandsCoachActive) return null
    if (suggestedSuppressedHandKey === deferredSuggestedFocusHandKey) return null
    const bestIds = computeBotExposureSuggestedBestIds(
      deferredSuggestedFocusHandKey,
      rackForSuggestedPatternMatch,
      botExposures,
      deferredHand,
      deferredPendingEastDiscardTile,
      eastExposures,
      suggestedHandsExposureTileIds,
      cardPatterns,
      suggestedHandsExposureMelds,
    )
    // Belt-and-suspenders: swappable jokers always get suggest-best (swap path + strip-wanted path).
    for (const id of collectSwappableJokerTileIds(
      deferredHand,
      deferredPendingEastDiscardTile,
      botExposures,
      eastExposures,
    )) {
      bestIds.add(id)
    }
    return { bestIds }
  }, [
    deferredSuggestedFocusHandKey,
    suggestedSuppressedHandKey,
    suggestedHandsCoachActive,
    rackForSuggestedPatternMatch,
    botExposures,
    deferredHand,
    deferredPendingEastDiscardTile,
    eastExposures,
    suggestedHandsExposureTileIds,
    suggestedHandsExposureMelds,
    cardPatterns,
  ])

  const suggestedDiscardGuideActive = useMemo(() => {
    if (!deferredSuggestedFocusHandKey) return false
    if (suggestedSuppressedHandKey === deferredSuggestedFocusHandKey) return false
    if (!suggestedHandsCoachActive) return false
    return true
  }, [deferredSuggestedFocusHandKey, suggestedSuppressedHandKey, suggestedHandsCoachActive])

  /** Discards that match naturals the focused line is still short (incoming slot + discard strip). */
  const suggestedDiscardNeedIds = useMemo(() => {
    if (!suggestedDiscardGuideActive) return null
    return computeSuggestedDiscardNeedHighlightIds(
      deferredSuggestedFocusHandKey,
      rackForSuggestedPatternMatch,
      discardPile.map((e) => e.tile),
      suggestedHandsExposureTileIds,
      cardPatterns,
      suggestedHandsExposureMelds,
    )
  }, [
    suggestedDiscardGuideActive,
    deferredSuggestedFocusHandKey,
    rackForSuggestedPatternMatch,
    discardPile,
    suggestedHandsExposureTileIds,
    suggestedHandsExposureMelds,
    cardPatterns,
  ])

  /** Sorted discard tracker: highlight slot types still needed for the focused hand. */
  const suggestedDiscardTrackerNeedDefs = useMemo(() => {
    if (!suggestedDiscardGuideActive) return null
    // Keep `[]` (not `null`) while a hand stays focused so the tracker stays in suggest-dim
    // mode. `null` turns the guide off and every discarded slot lights up at full brightness.
    return computeSuggestedDiscardTrackerNeedDefs(
      deferredSuggestedFocusHandKey,
      rackForSuggestedPatternMatch,
      suggestedHandsExposureTileIds,
      cardPatterns,
      suggestedHandsExposureMelds,
    )
  }, [
    suggestedDiscardGuideActive,
    deferredSuggestedFocusHandKey,
    rackForSuggestedPatternMatch,
    suggestedHandsExposureTileIds,
    suggestedHandsExposureMelds,
    cardPatterns,
  ])

  /**
   * Incoming bot discard: ring when strip needs match ({@link suggestedDiscardNeedIds}) — coach-only like
   * discard-tracker glow. **Tiles-away** uses only {@link suggestedRankInput.hand} + exposures; unreclaimed
   * disc never increases `matchedInHand`. Leaving staging / committing discard removes naturals from
   * `hand`, so tiles away bumps while that copy can still glow in the tracker strip.
   */
  const suggestedTileGuideForRack = useMemo(() => {
    if (!suggestedTileGuide) return null
    // Pass-box / discard-staging tiles are already part of `rackForSuggestedPatternMatch`, so the
    // matcher decides whether each staged tile counts toward the focused line. Use `bestIds`
    // directly — don't re-light a staged tile just because its type matches a lit rack tile, or an
    // extra copy (e.g. a 3rd soap when the line only needs the pair) would highlight in the discard
    // slot even though it's correctly dim on the rack.
    const activeDeadTableGuide = deferredSuggestedFocusHandKey
      ? suggestedDeadTableGuidesByKey[deferredSuggestedFocusHandKey]
      : undefined
    const activeDeadTileGuide = deferredSuggestedFocusHandKey
      ? suggestedDeadTileGuidesByKey[deferredSuggestedFocusHandKey]
      : undefined
    const activeDiscardIsDead =
      !!activeBotDiscard &&
      !!activeDeadTableGuide &&
      activeDeadTableGuide.discardDeadIds.has(activeBotDiscard.id)
    const selectedHandIsDying = !!activeDeadTileGuide?.suppressAfterPhase
    if (
      (mainPhase === 'bot-turn' || mainPhase === 'call-staging') &&
      activeBotDiscard &&
      !activeDiscardIsDead &&
      !selectedHandIsDying &&
      suggestedDiscardNeedIds?.has(activeBotDiscard.id)
    ) {
      const merged = new Set(suggestedTileGuide.bestIds)
      merged.add(activeBotDiscard.id)
      return {
        bestIds: merged,
        blankExchangeIds: suggestedTileGuide.blankExchangeIds,
        blankExchangeTargetDefs: suggestedTileGuide.blankExchangeTargetDefs,
      }
    }
    // Keep the upstream object identity so memoized racks can bail across App re-renders.
    return suggestedTileGuide
  }, [
    suggestedTileGuide,
    mainPhase,
    activeBotDiscard,
    suggestedDiscardNeedIds,
    suggestedDeadTableGuidesByKey,
    suggestedDeadTileGuidesByKey,
    deferredSuggestedFocusHandKey,
  ])

  const prevSuggestedFocusForDeadGuideRef = useRef<string | null>(null)
  const prevSuggestedBestIdsForDeadGuideRef = useRef<ReadonlySet<string>>(new Set())
  const prevBotExposureBestIdsForDeadGuideRef = useRef<ReadonlySet<string>>(new Set())
  const prevDiscardNeedIdsForDeadGuideRef = useRef<ReadonlySet<string>>(new Set())
  const prevDiscardSnapshotForDeadGuideRef = useRef('0:')

  const clearSuggestedDeadGuidesForHandKey = useCallback((handKey: string) => {
    setSuggestedDeadTileGuidesByKey((byKey) => {
      if (!(handKey in byKey)) return byKey
      const { [handKey]: _removed, ...rest } = byKey
      return rest
    })
    setSuggestedDeadTableGuidesByKey((byKey) => {
      if (!(handKey in byKey)) return byKey
      const { [handKey]: _removed, ...rest } = byKey
      return rest
    })
  }, [])

  /** Drop focus / pins when their category is turned off in the menu. */
  useEffect(() => {
    const focusKey = suggestedFocusHandKeyRef.current
    if (focusKey) {
      const patternId = focusKeyPatternId(focusKey)
      const focusedPattern = cardPatternsById.get(patternId)
      if (
        focusedPattern &&
        !isSuggestedHandSectionFilterEnabled(focusedPattern.section, suggestedHandsUncheckedSections)
      ) {
        setSuggestedFocusHandKey(null)
        setSuggestedSuppressedHandKey(null)
        clearSuggestedDeadGuidesForHandKey(focusKey)
      }
    }
    setSuggestedPinnedHandKeys((prev) => {
      if (prev.length === 0) return prev
      const next = prev.filter((key) => {
        const patternId = focusKeyPatternId(key)
        const p = cardPatternsById.get(patternId)
        return !p || isSuggestedHandSectionFilterEnabled(p.section, suggestedHandsUncheckedSections)
      })
      return next.length === prev.length ? prev : next
    })
  }, [suggestedHandsUncheckedSections, cardPatternsById, clearSuggestedDeadGuidesForHandKey])

  useEffect(() => {
    const prevFocus = prevSuggestedFocusForDeadGuideRef.current
    if (prevFocus && prevFocus !== suggestedFocusHandKey) {
      // Drop persisted dead-tile flash state when leaving a line so reselecting (or switching
      // back) replays rack highlights from the current rack — e.g. exposed 4s — without re-flashing
      // tiles that were marked dead for an old variant (9s before the exposure pivot).
      clearSuggestedDeadGuidesForHandKey(prevFocus)
    }
    const prevBestIds = prevSuggestedBestIdsForDeadGuideRef.current
    const prevBotBestIds = prevBotExposureBestIdsForDeadGuideRef.current
    const prevDiscardNeedIds = prevDiscardNeedIdsForDeadGuideRef.current
    const prevDiscardSnapshot = prevDiscardSnapshotForDeadGuideRef.current
    const currentBestIds = suggestedTileGuideForRack?.bestIds ?? null
    const currentBotBestIds = botExposureSuggestedTileGuide?.bestIds ?? null
    const currentDiscardNeedIds = suggestedDiscardNeedIds ?? null
    const lastDiscard = discardPile.length > 0 ? discardPile[discardPile.length - 1]!.tile : null
    const discardSnapshot = lastDiscard ? `${discardPile.length}:${lastDiscard.id}` : '0:'
    const discardAdvanced = discardSnapshot !== prevDiscardSnapshot
    const focusChanged = prevFocus !== suggestedFocusHandKey
    const shouldSkipDeadDetection =
      !deadTileHintEnabled || !suggestedFocusHandKey || !currentBestIds || focusChanged
    const lastDiscardNeed =
      lastDiscard
        ? focusedLineJokerIneligibleNeedForDef(
            suggestedFocusHandKey,
            lastDiscard.def,
            cardPatterns,
            rackForSuggestedHandsUi,
            suggestedHandsExposureTileIds,
          )
        : null
    const unavailableDeadHintTiles = [
      ...discardPile.map((e) => e.tile),
      ...botExposures.flatMap((e) => e.tiles),
    ]
    const redeemableExposedJokers = collectSwappableJokerTileIds(
      hand,
      pendingEastDiscardTile,
      botExposures,
      eastExposures,
    ).size
    const unavailableLastDiscardCopies =
      lastDiscard
        ? unavailableDeadHintTiles.filter((tile) => tileDefsEqual(tile.def, lastDiscard.def)).length
        : 0
    const ownedLastDiscardCopies =
      lastDiscard
        ? rackForSuggestedHandsUi.filter((tile) => tileDefsEqual(tile.def, lastDiscard.def)).length
        : 0
    const lastDiscardJokerableVariantStillAvailable =
      !!lastDiscard &&
      lastDiscardNeed != null &&
      lastDiscardNeed >= 3 &&
      focusedPatternHasAvailableDeadHintVariant(
        suggestedFocusHandKey,
        lastDiscard.def,
        unavailableDeadHintTiles,
        cardPatterns,
        redeemableExposedJokers,
      )
    const discardExhaustedNeededDef =
      !!lastDiscard &&
      discardAdvanced &&
      !!currentDiscardNeedIds?.has(lastDiscard.id) &&
      lastDiscardNeed != null &&
      !lastDiscardJokerableVariantStillAvailable &&
      ownedLastDiscardCopies < lastDiscardNeed &&
      totalCopiesForDeadHintDef(lastDiscard.def) - unavailableLastDiscardCopies < lastDiscardNeed
    const deadHintAppliesToDef = (def: TileDef) =>
      focusedLineJokerIneligibleNeedForDef(
        suggestedFocusHandKey,
        def,
        cardPatterns,
        rackForSuggestedHandsUi,
        suggestedHandsExposureTileIds,
      ) != null

    if (!shouldSkipDeadDetection && discardAdvanced && prevBestIds.size > 0) {
      const rackById = new Map(rackForSuggestedHandsUi.map((t) => [t.id, t] as const))
      const deadIds = new Set<string>()
      const stillHasUsablePivot =
        discardExhaustedNeededDef && lastDiscard
          ? focusedPatternHasAvailableDeadHintVariant(
              suggestedFocusHandKey,
              lastDiscard.def,
              unavailableDeadHintTiles,
              cardPatterns,
              redeemableExposedJokers,
            )
          : currentBestIds.size > 0
      if (discardExhaustedNeededDef) {
        const exhaustedPrevIds = new Set<string>()
        for (const id of prevBestIds) {
          const tile = rackById.get(id)
          if (tile && lastDiscard && tileDefsEqual(tile.def, lastDiscard.def)) {
            exhaustedPrevIds.add(id)
          }
        }
        const idsToMarkDead = stillHasUsablePivot ? exhaustedPrevIds : prevBestIds
        for (const id of idsToMarkDead) {
          deadIds.add(id)
        }
      } else {
        for (const id of prevBestIds) {
          const tile = rackById.get(id)
          if (tile && !currentBestIds.has(id) && deadHintAppliesToDef(tile.def)) deadIds.add(id)
        }
      }
      if (deadIds.size > 0) {
        const suppressAfterPhase = deadIds.size >= prevBestIds.size
        const skullIds = new Set<string>()
        if (discardAdvanced && lastDiscard) {
          for (const id of deadIds) {
            const tile = rackById.get(id)
            if (tile && tileDefsEqual(tile.def, lastDiscard.def)) skullIds.add(id)
          }
        }
        const deadCause: DeadCauseHint | null =
          discardExhaustedNeededDef &&
          lastDiscard &&
          lastDiscardNeed != null &&
          lastDiscardNeed <= 2 &&
          !stillHasUsablePivot
            ? {
                defs: [lastDiscard.def],
                need: lastDiscardNeed,
                available:
                  totalCopiesForDeadHintDef(lastDiscard.def) - unavailableLastDiscardCopies,
              }
            : null
        setSuggestedDeadTileGuidesByKey((byKey) => {
          const cur = byKey[suggestedFocusHandKey]
          if (cur) {
            const nextDeadIds = new Set(cur.deadIds)
            for (const id of deadIds) nextDeadIds.add(id)
            const nextSkullIds = new Set(cur.skullIds)
            for (const id of skullIds) nextSkullIds.add(id)
            return {
              ...byKey,
              [suggestedFocusHandKey]: {
                phase: cur.phase,
                suppressAfterPhase: cur.suppressAfterPhase || suppressAfterPhase,
                deadIds: nextDeadIds,
                skullIds: nextSkullIds,
                deadCause: stillHasUsablePivot ? null : deadCause ?? cur.deadCause,
              },
            }
          }
          return {
            ...byKey,
            [suggestedFocusHandKey]: {
              phase: mainPhase,
              suppressAfterPhase,
              deadIds,
              skullIds,
              deadCause,
            },
          }
        })
      }

      const botExposureDeadIds = new Set<string>()
      if (discardExhaustedNeededDef) {
        if (stillHasUsablePivot && lastDiscard) {
          for (const exp of botExposures) {
            for (const tile of exp.tiles) {
              if (prevBotBestIds.has(tile.id) && tileDefsEqual(tile.def, lastDiscard.def)) {
                botExposureDeadIds.add(tile.id)
              }
            }
          }
        } else {
          for (const id of prevBotBestIds) botExposureDeadIds.add(id)
        }
      } else if (currentBotBestIds) {
        for (const id of prevBotBestIds) {
          const tile = botExposures.flatMap((e) => e.tiles).find((t) => t.id === id)
          if (tile && !currentBotBestIds.has(id) && deadHintAppliesToDef(tile.def)) {
            botExposureDeadIds.add(id)
          }
        }
      }
      const discardDeadIds = new Set<string>()
      if (discardExhaustedNeededDef) {
        if (stillHasUsablePivot && lastDiscard) {
          for (const entry of discardPile) {
            if (
              (prevDiscardNeedIds.has(entry.tile.id) || currentDiscardNeedIds?.has(entry.tile.id)) &&
              tileDefsEqual(entry.tile.def, lastDiscard.def)
            ) {
              discardDeadIds.add(entry.tile.id)
            }
          }
        } else {
          for (const id of prevDiscardNeedIds) discardDeadIds.add(id)
          for (const id of currentDiscardNeedIds ?? []) discardDeadIds.add(id)
        }
      } else if (currentDiscardNeedIds) {
        for (const id of prevDiscardNeedIds) {
          const tile = discardPile.find((entry) => entry.tile.id === id)?.tile
          if (tile && !currentDiscardNeedIds.has(id) && deadHintAppliesToDef(tile.def)) {
            discardDeadIds.add(id)
          }
        }
      }
      if (botExposureDeadIds.size > 0 || discardDeadIds.size > 0) {
        setSuggestedDeadTableGuidesByKey((byKey) => {
          const cur = byKey[suggestedFocusHandKey]
          if (cur) {
            const nextBotExposureDeadIds = new Set(cur.botExposureDeadIds)
            for (const id of botExposureDeadIds) nextBotExposureDeadIds.add(id)
            const nextDiscardDeadIds = new Set(cur.discardDeadIds)
            for (const id of discardDeadIds) nextDiscardDeadIds.add(id)
            return {
              ...byKey,
              [suggestedFocusHandKey]: {
                botExposureDeadIds: nextBotExposureDeadIds,
                discardDeadIds: nextDiscardDeadIds,
              },
            }
          }
          return {
            ...byKey,
            [suggestedFocusHandKey]: {
              botExposureDeadIds,
              discardDeadIds,
            },
          }
        })
      }
    }

    prevSuggestedFocusForDeadGuideRef.current = suggestedFocusHandKey
    prevSuggestedBestIdsForDeadGuideRef.current = currentBestIds ? new Set(currentBestIds) : new Set()
    prevBotExposureBestIdsForDeadGuideRef.current = currentBotBestIds
      ? new Set(currentBotBestIds)
      : new Set()
    prevDiscardNeedIdsForDeadGuideRef.current = currentDiscardNeedIds
      ? new Set(currentDiscardNeedIds)
      : new Set()
    prevDiscardSnapshotForDeadGuideRef.current = discardSnapshot
  }, [
    deadTileHintEnabled,
    suggestedFocusHandKey,
    suggestedTileGuideForRack,
    botExposureSuggestedTileGuide,
    suggestedDiscardNeedIds,
    discardPile,
    botExposures,
    hand,
    pendingEastDiscardTile,
    eastExposures,
    rackForSuggestedHandsUi,
    cardPatterns,
    suggestedHandsExposureTileIds,
    mainPhase,
    clearSuggestedDeadGuidesForHandKey,
  ])

  useEffect(() => {
    if (!suggestedFocusHandKey) return
    const guide = suggestedDeadTileGuidesByKey[suggestedFocusHandKey]
    if (!guide) return
    if (guide.phase === mainPhase) return

    setSuggestedDeadTileGuidesByKey((prev) => {
      const cur = prev[suggestedFocusHandKey]
      if (!cur) return prev
      return {
        ...prev,
        [suggestedFocusHandKey]: { ...cur, phase: mainPhase },
      }
    })
  }, [mainPhase, suggestedFocusHandKey, suggestedDeadTileGuidesByKey])

  const suggestedDeadTileGuideForRack = useMemo(() => {
    if (!deadTileHintEnabled) return null
    if (!suggestedFocusHandKey) return null
    const guide = suggestedDeadTileGuidesByKey[suggestedFocusHandKey]
    if (!guide) return null
    return {
      deadIds: guide.deadIds,
      skullIds: guide.skullIds,
    }
  }, [deadTileHintEnabled, suggestedFocusHandKey, suggestedDeadTileGuidesByKey])

  const suggestedDeadTableGuideForView = useMemo(() => {
    if (!deadTileHintEnabled) return null
    if (!suggestedFocusHandKey) return null
    const guide = suggestedDeadTableGuidesByKey[suggestedFocusHandKey]
    if (!guide) return null
    return {
      botExposureDeadIds: guide.botExposureDeadIds,
      discardDeadIds: guide.discardDeadIds,
    }
  }, [deadTileHintEnabled, suggestedFocusHandKey, suggestedDeadTableGuidesByKey])

  const suggestedDeadCauseByFocusKey = useMemo(() => {
    if (!deadTileHintEnabled) return {} as Record<string, DeadCauseHint>
    const unavailableByKey = new Map<string, number>()
    // Use the committed pile (same as the tracker) — a bot's live, still-claimable discard isn't
    // settled yet, so it must not count against copies-left and dead-flag a rack tile prematurely.
    for (const tile of [
      ...discardPileCommittedForDisplay({ discardPile, mainPhase, activeBotDiscard }).map((e) => e.tile),
      ...botExposures.flatMap((e) => e.tiles),
    ]) {
      const key = deadHintDefKey(tile.def)
      unavailableByKey.set(key, (unavailableByKey.get(key) ?? 0) + 1)
    }
    const redeemableExposedJokers = collectSwappableJokerTileIds(
      deferredHand,
      deferredPendingEastDiscardTile,
      botExposures,
      eastExposures,
    ).size
    const out: Record<string, DeadCauseHint> = {}
    const keysToProbe = new Set<string>([
      ...Object.keys(suggestedDeadTileGuidesByKey),
      ...(suggestedFocusHandKey ? [suggestedFocusHandKey] : []),
    ])
    for (const key of keysToProbe) {
      const guideCause = suggestedDeadTileGuidesByKey[key]?.deadCause ?? null
      const live = findFocusedPatternDeadCause(
        key,
        unavailableByKey,
        cardPatterns,
        totalCopiesForDeadHintDef,
        {
          rack: rackForSuggestedPatternMatch,
          exposureTileIds: suggestedHandsExposureTileIds,
          redeemableExposedJokers,
        },
      )
      if (live) out[key] = live
      else if (guideCause && guideCause.need <= 2) out[key] = guideCause
    }
    for (const [key, cause] of Object.entries(out)) {
      const patternId = focusKeyPatternId(key)
      if (!(patternId in out)) out[patternId] = cause
    }
    return out
  }, [
    deadTileHintEnabled,
    suggestedDeadTileGuidesByKey,
    suggestedFocusHandKey,
    discardPile,
    mainPhase,
    activeBotDiscard,
    botExposures,
    cardPatterns,
    rackForSuggestedPatternMatch,
    suggestedHandsExposureTileIds,
    deferredHand,
    deferredPendingEastDiscardTile,
    eastExposures,
  ])

  /** Dead-cause hint for the focused line — independent of the Tiles panel toggle. */
  const suggestedFocusedHandDeadCause = useMemo((): DeadCauseHint | null => {
    if (!deadTileHintEnabled || !suggestedFocusHandKey) return null
    const direct = suggestedDeadCauseByFocusKey[suggestedFocusHandKey]
    if (direct) return direct
    const patternId = focusKeyPatternId(suggestedFocusHandKey)
    const byPattern = suggestedDeadCauseByFocusKey[patternId]
    if (byPattern) return byPattern
    for (const [key, cause] of Object.entries(suggestedDeadCauseByFocusKey)) {
      if (focusKeyPatternId(key) === patternId) return cause
    }
    return (() => {
      const guide = suggestedDeadTileGuidesByKey[suggestedFocusHandKey]?.deadCause ?? null
      return guide && guide.need <= 2 ? guide : null
    })()
  }, [
    deadTileHintEnabled,
    suggestedFocusHandKey,
    suggestedDeadCauseByFocusKey,
    suggestedDeadTileGuidesByKey,
  ])

  useEffect(() => {
    if (mainPhase === 'mahjong-declared' || mainPhase === 'bot-mahjong' || mainPhase === 'dead-hand' || mainPhase === 'wall-game') {
      setSuggestedFocusHandKey(null)
      setSuggestedPinnedHandKeys([])
      setSuggestedSuppressedHandKey(null)
      setSuggestedDeadTileGuidesByKey({})
      setSuggestedDeadTableGuidesByKey({})
      trayOpenBeforeBotHandsRef.current = null
      setBotHandsIdentifierFocusSeat(null)
      // Close Hands (CSS slide) on every end — reopen after a win still lists the winning line.
      suggestedHandsTrayApiRef.current.setTrayOpen(false)
    }
  }, [mainPhase])

  /** Cyan MahJ glyph stays lit for the whole win (including Review). */
  const mahjongWinGlyphLit = charlestonDone && mainPhase === 'mahjong-declared'

  useLayoutEffect(() => {
    if (mainPhase !== 'mahjong-declared') {
      setWinHandDumpPhase('off')
      setWinHandFlyOrigins(null)
      return
    }
    if (!animationsEnabled) {
      setWinHandDumpPhase('settled')
      setWinHandFlyOrigins(null)
      return
    }
    setWinHandDumpPhase('measure')
    setWinHandFlyOrigins(null)
  }, [mainPhase, animationsEnabled, previewWinHandBurst])

  /** Read hand centers, then FLIP those tiles onto the existing call/exposure strip. */
  useLayoutEffect(() => {
    if (winHandDumpPhase !== 'measure' || mainPhase !== 'mahjong-declared') return
    const origins = new Map<string, { x: number; y: number }>()
    for (const tile of hand) {
      const el = playerHandRackBottomRef.current?.querySelector(
        `[data-hand-tile-id="${CSS.escape(tile.id)}"]`,
      )
      if (!(el instanceof HTMLElement)) continue
      const r = el.getBoundingClientRect()
      if (r.width < 4 || r.height < 4) continue
      origins.set(tile.id, { x: r.left + r.width / 2, y: r.top + r.height / 2 })
    }
    setWinHandFlyOrigins(origins.size > 0 ? origins : null)
    setWinHandDumpPhase('flying')
  }, [winHandDumpPhase, mainPhase, hand])

  const suggestedTilesButtonLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suggestedTilesButtonLongPressFired = useRef(false)

  const onSuggestedTilesButtonPointerDown = useCallback(() => {
    if (!suggestedHandsCoachActive) return
    suggestedTilesButtonLongPressFired.current = false
    suggestedTilesButtonLongPressTimer.current = setTimeout(() => {
      suggestedTilesButtonLongPressFired.current = true
      setSuggestedFocusHandKey(null)
      setSuggestedPinnedHandKeys([])
      setSuggestedSuppressedHandKey(null)
      setSuggestedDeadTileGuidesByKey({})
      setSuggestedDeadTableGuidesByKey({})
    }, 500)
  }, [suggestedHandsCoachActive])

  const onSuggestedTilesButtonPointerUpOrLeave = useCallback(() => {
    if (suggestedTilesButtonLongPressTimer.current != null) {
      clearTimeout(suggestedTilesButtonLongPressTimer.current)
      suggestedTilesButtonLongPressTimer.current = null
    }
  }, [])

  const onSuggestedTilesButtonClick = useCallback(() => {
    if (!suggestedHandsCoachActive) return
    if (suggestedTilesButtonLongPressFired.current) {
      suggestedTilesButtonLongPressFired.current = false
      return
    }
    const turningTilesOn = !suggestedPanelTilesOn
    toggleSuggestedPanelTilesOn()
    if (turningTilesOn && !suggestedHandsTrayApiRef.current.trayOpen) {
      suggestedHandsTrayApiRef.current.setTrayOpen(true)
    }
  }, [suggestedHandsCoachActive, suggestedPanelTilesOn, toggleSuggestedPanelTilesOn])

  const onSuggestedPatternClick = useCallback(
    (handKey: string) => {
      markSuggestedHandsAssist()
      const isDeselect = suggestedFocusHandKeyRef.current === handKey
      setSuggestedFocusHandKey(isDeselect ? null : handKey)
      setSuggestedSuppressedHandKey(null)
      if (isDeselect) clearSuggestedDeadGuidesForHandKey(handKey)
    },
    [clearSuggestedDeadGuidesForHandKey, markSuggestedHandsAssist],
  )

  const mainPhaseRef = useRef(mainPhase)
  mainPhaseRef.current = mainPhase

  const onSuggestedFocusKeyMigrate = useCallback((nextKey: string | null) => {
    const prevKey = suggestedFocusHandKeyRef.current
    if (nextKey === prevKey) return
    if (nextKey == null) {
      // Call-staging previews an incomplete meld that can temporarily drop the focused line
      // (kong size not staged yet). Keep focus + lit tiles until Done / cancel; clear after
      // commit when the panel reports the pattern is gone for real.
      if (mainPhaseRef.current === 'call-staging') return
      setSuggestedFocusHandKey(null)
      return
    }
    setSuggestedFocusHandKey(nextKey)
    setSuggestedSuppressedHandKey(null)
    if (prevKey && prevKey !== nextKey) {
      setSuggestedDeadTileGuidesByKey((byKey) => {
        const guide = byKey[prevKey]
        if (!guide) return byKey
        const { [prevKey]: _removed, ...rest } = byKey
        return { ...rest, [nextKey]: guide }
      })
      setSuggestedDeadTableGuidesByKey((byKey) => {
        const guide = byKey[prevKey]
        if (!guide) return byKey
        const { [prevKey]: _removed, ...rest } = byKey
        return { ...rest, [nextKey]: guide }
      })
    }
  }, [])

  const playerYouLabelText = playerYouLabel(playerSeat)

  const playerWinIntro = useMemo(() => {
    if (!playerWinMethod) return `${playerYouLabelText} won.`
    const winMethod =
      playerWinMethod.type === 'self-draw'
        ? { how: 'self-draw' as const, tile: playerWinMethod.tile }
        : {
            how: 'called-discard' as const,
            tile: playerWinMethod.tile,
            discardFrom: toWinDiscardFrom(playerWinMethod.botLabel),
          }
    return formatMahjongWinDescription(playerYouLabelText, winMethod)
  }, [playerWinMethod, playerYouLabelText])

  const postGameBotReview = useMemo(() => {
    if (mainPhase !== 'mahjong-declared') return null
    const playerClaims = playerClaimMeldsForRound({ playerSeat, eastExposures, botExposures })
    const eastRankInput: RankSuggestedHandsInput = {
      hand,
      wallRemaining: wall.length,
      discards: discardTiles,
      exposures: botExposures,
      playerClaimMelds: [...playerClaims],
      eastTableClaimMelds: eastExposures,
      patterns: cardPatterns,
    }
    const { bestTilesAway: eastAway, linesAtMin: eastLines } = suggestedHandsTiedAtBest(eastRankInput)
    const eastRow = {
      label: playerYouLabelText,
      bestTilesAway: eastAway,
      linesAtMin: eastLines,
      rankInput: eastRankInput,
    }
    const botRows = botSlotSeats.map((seat, idx) => {
      const label = seatLabel(seat)
      const botHand = bots[idx] ?? []
      const playerClaims = botExposures.filter((e) => e.seat === label)
      const rankInput: RankSuggestedHandsInput = {
        hand: botHand,
        wallRemaining: wall.length,
        discards: discardTiles,
        exposures: botExposures,
        playerClaimMelds: playerClaims,
        eastTableClaimMelds: eastExposures,
        patterns: cardPatterns,
      }
      const { bestTilesAway, linesAtMin } = suggestedHandsTiedAtBest(rankInput)
      return { label, bestTilesAway, linesAtMin, rankInput }
    })
    return [eastRow, ...botRows]
  }, [mainPhase, bots, hand, wall.length, discardTiles, botExposures, eastExposures, cardPatterns, botSlotSeats, playerYouLabelText])

  /**
   * On win: full 14 in winning practice-line order (used to order concealed tiles on the
   * exposure strip).
   */
  const winHandSortedTiles = useMemo(() => {
    if (mainPhase !== 'mahjong-declared') return null
    const rankInput: RankSuggestedHandsInput = {
      hand,
      wallRemaining: wall.length,
      discards: discardTiles,
      exposures: botExposures,
      playerClaimMelds: eastExposures,
      eastTableClaimMelds: eastExposures,
      patterns: cardPatterns,
    }
    const { closestLine } = summarizeRackTowardWin(rankInput)
    const allTiles = [...hand, ...eastExposures.flatMap((e) => e.tiles)]
    if (!closestLine) return allTiles
    return sortFullRackTilesForPattern(closestLine.id, rankInput, focusKeyForSuggestedHandLine(closestLine))
  }, [mainPhase, hand, eastExposures, wall.length, discardTiles, botExposures, cardPatterns])

  /**
   * Same CallMeldStrip path as normal exposures (`calledTileId` set) so the winning 14 sit
   * on the existing exposure↔hand divider — not a separate full-height flow row.
   */
  const winHandExposureMelds = useMemo(() => {
    if (mainPhase !== 'mahjong-declared') return null
    const ordered =
      winHandSortedTiles && winHandSortedTiles.length > 0
        ? winHandSortedTiles
        : [...playerExposureMelds.flatMap((e) => e.tiles), ...sortTiles(hand, 'suit')]
    if (ordered.length === 0) return EMPTY_EXPOSURE_RACK_MELDS
    return segmentRackIntoExposureRuns(ordered, playerExposureMelds).map((run) => {
      const claimCalled =
        run.meldIdx != null ? playerExposureMelds[run.meldIdx]?.calledTileId : undefined
      return {
        tiles: run.tiles,
        // Any calledTileId forces the locked call-meld strip (normal expose geometry).
        calledTileId: claimCalled ?? run.tiles[0]?.id,
      }
    })
  }, [mainPhase, winHandSortedTiles, playerExposureMelds, hand])

  useEffect(() => {
    if (winHandDumpPhase !== 'flying') return
    const flyIds = winHandFlyOrigins
    let maxGroupFly = flyIds?.size ?? hand.length
    if (flyIds && winHandExposureMelds && winHandExposureMelds.length > 0) {
      maxGroupFly = 1
      for (const meld of winHandExposureMelds) {
        let n = 0
        for (const t of meld.tiles) {
          if (flyIds.has(t.id)) n++
        }
        if (n > maxGroupFly) maxGroupFly = n
      }
    }
    const clearMs =
      WIN_HAND_FLY_VISUAL_MS + Math.max(0, maxGroupFly - 1) * WIN_HAND_FLY_STAGGER_MS
    const tid = window.setTimeout(() => setWinHandDumpPhase('settled'), clearMs)
    return () => window.clearTimeout(tid)
  }, [winHandDumpPhase, hand.length, winHandFlyOrigins, winHandExposureMelds])

  useEffect(() => {
    const canShow =
      charlestonDone && mainPhase === 'mahjong-declared' && !mahjongWinReviewing
    if (!canShow) {
      setMahjongWinDialogShown(false)
      return
    }
    // Right after the hand→exposure transfer visually finishes.
    if (!animationsEnabled || winHandDumpPhase === 'settled') {
      setMahjongWinDialogShown(true)
      return
    }
    setMahjongWinDialogShown(false)
  }, [
    charlestonDone,
    mainPhase,
    mahjongWinReviewing,
    animationsEnabled,
    winHandDumpPhase,
  ])

  /** Dump layout on the call strip (after measure, or immediately when animations are off). */
  const winHandDumpOnExposure =
    mainPhase === 'mahjong-declared' &&
    (winHandDumpPhase === 'flying' ||
      winHandDumpPhase === 'settled' ||
      (!animationsEnabled && winHandDumpPhase !== 'measure'))

  /** Former hand tiles only — opaque FLIP from measured hand centers; claims stay put. */
  const winHandFlyInTileIds = useMemo(() => {
    if (mainPhase !== 'mahjong-declared' || winHandDumpPhase !== 'flying' || !animationsEnabled) {
      return null
    }
    if (!winHandFlyOrigins || winHandFlyOrigins.size === 0) return null
    return new Set(winHandFlyOrigins.keys())
  }, [mainPhase, winHandDumpPhase, animationsEnabled, winHandFlyOrigins])

  const winHandFlyInOriginByTileId = winHandDumpPhase === 'flying' ? winHandFlyOrigins : null

  const winHandFlyWave = useMemo(() => {
    if (winHandDumpPhase !== 'flying' || !animationsEnabled) return null
    return { staggerDelayMs: WIN_HAND_FLY_STAGGER_MS, baseDelayMs: 0 }
  }, [winHandDumpPhase, animationsEnabled])

  /**
   * On player Mah Jongg (win popup or Review), Hands lists only the completed winning line
   * (same identity as win-rack sort / overlay closest line) — not the full ranked card.
   */
  const playerMahjongWinReviewHands = useMemo(() => {
    const row = postGameBotReview?.[0]
    if (!row || row.bestTilesAway !== 0 || row.linesAtMin.length === 0) return null
    // Prefer the primary winning line (same as summarizeRackTowardWin.closestLine).
    return [row.linesAtMin[0]!]
  }, [postGameBotReview])

  /**
   * Bot-mahjong end screen: same per-seat layout as Wall Game (East + three bots).
   */
  const postGameBotMahjongReview = useMemo(() => {
    if (mainPhase !== 'bot-mahjong' || !botWin) return null
    const { botIndex, how, tile } = botWin
    const winnerSeat = seatLabel(botSlotSeats[botIndex]!)
    const winnerLabel = `Bot ${botIndex + 1} (${winnerSeat})`
    const winMethod =
      how === 'self-draw'
        ? { how: 'self-draw' as const, tile }
        : { how: 'called-discard' as const, tile, discardFrom: toWinDiscardFrom(botWin.discardFrom) }
    const winDescription = formatMahjongWinDescription(winnerLabel, winMethod)

    type SeatRow = {
      label: string
      bestTilesAway: number
      linesAtMin: ReturnType<typeof suggestedHandsTiedAtBest>['linesAtMin']
      rankInput: RankSuggestedHandsInput
    }

    const eastRankInput: RankSuggestedHandsInput = {
      hand,
      wallRemaining: wall.length,
      discards: discardTiles,
      exposures: botExposures,
      playerClaimMelds: eastExposures,
      eastTableClaimMelds: eastExposures,
      patterns: cardPatterns,
    }
    const { bestTilesAway: eastAway, linesAtMin: eastLines } = suggestedHandsTiedAtBest(eastRankInput)
    const eastRow: SeatRow = {
      label: playerYouLabelText,
      bestTilesAway: eastAway,
      linesAtMin: eastLines,
      rankInput: eastRankInput,
    }

    const botRows: SeatRow[] = botSlotSeats.map((seat, idx) => {
      const label = seatLabel(seat)
      const botHand = bots[idx] ?? []
      const claims = botExposures.filter((e) => e.seat === label)
      const rankInput: RankSuggestedHandsInput = {
        hand: botHand,
        wallRemaining: wall.length,
        discards: discardTiles,
        exposures: botExposures,
        playerClaimMelds: claims,
        eastTableClaimMelds: eastExposures,
        patterns: cardPatterns,
      }
      const { bestTilesAway, linesAtMin } = suggestedHandsTiedAtBest(rankInput)
      return { label: `Bot ${idx + 1} (${label})`, bestTilesAway, linesAtMin, rankInput }
    })

    const winnerRow = botRows[botIndex]!
    const loserRows: SeatRow[] = [
      eastRow,
      ...botRows.filter((_, idx) => idx !== botIndex),
    ]

    return { how, winnerLabel, winDescription, winnerRow, loserRows }
  }, [mainPhase, botWin, bots, hand, wall.length, discardTiles, botExposures, eastExposures, cardPatterns, botSlotSeats, playerYouLabelText])

  /**
   * End-game table rails: dump each bot’s full hand into the exposure rail only after
   * Review/Menu (table review). Keep claim melds contiguous (table order) so exposed
   * groups stay together; concealed tiles follow, suit-sorted. Lit = exposed; dim =
   * concealed. Winner keeps every tile lit.
   */
  const postGameBotTableReviewRacks = useMemo(() => {
    if (!postGameTableReviewing) return null
    if (
      mainPhase !== 'wall-game' &&
      mainPhase !== 'mahjong-declared' &&
      mainPhase !== 'bot-mahjong'
    ) {
      return null
    }
    const winnerBotIndex =
      mainPhase === 'bot-mahjong' && botWin != null ? botWin.botIndex : null

    return botSlotSeats.map((seat, idx) => {
      const label = seatLabel(seat) as BotSeat
      const botHand = bots[idx] ?? []
      const claims = botExposures.filter((e) => e.seat === label)
      const rankInput: RankSuggestedHandsInput = {
        hand: botHand,
        wallRemaining: wall.length,
        discards: discardTiles,
        exposures: botExposures,
        playerClaimMelds: claims,
        eastTableClaimMelds: eastExposures,
        patterns: cardPatterns,
      }
      const { bestTilesAway, linesAtMin } = suggestedHandsTiedAtBest(rankInput)
      const line = linesAtMin[0]
      // Claim melds first (each intact), then suit-sorted concealed — never card-strip order,
      // which can split an exposure (e.g. soap kong) across the rail.
      const melds = [
        ...claims.map((c) => ({ tiles: c.tiles })),
        ...(botHand.length > 0 ? [{ tiles: sortTiles(botHand, 'suit') }] : []),
      ]
      const isWinner = winnerBotIndex === idx
      const exposedIds = new Set(claims.flatMap((c) => c.tiles.map((t) => t.id)))
      const winningPattern =
        isWinner && line ? (cardPatternsById.get(line.id) ?? null) : null
      return {
        seat: label,
        melds,
        litTileIds: isWinner ? null : exposedIds,
        bestTilesAway,
        claimMelds: claims.map((c) => ({ tiles: c.tiles })),
        closestLines: linesAtMin,
        isWinner,
        winningPattern,
      }
    })
  }, [
    postGameTableReviewing,
    mainPhase,
    botWin,
    botSlotSeats,
    bots,
    botExposures,
    wall.length,
    discardTiles,
    eastExposures,
    cardPatterns,
    cardPatternsById,
  ])

  /**
   * Wall game: same per-seat practice-card readout as the Mah Jongg overlays (tiles away,
   * closest line, exposures + concealed sorted). Used in the wall-game dialog; table Review
   * uses {@link postGameBotTableReviewRacks} for the full-hand exposure-rail dump.
   */
  const postGameWallGameReview = useMemo(() => {
    if (mainPhase !== 'wall-game') return null

    type WRow = {
      label: string
      bestTilesAway: number
      linesAtMin: ReturnType<typeof suggestedHandsTiedAtBest>['linesAtMin']
      rankInput: RankSuggestedHandsInput
    }

    const eastRankInput: RankSuggestedHandsInput = {
      hand,
      wallRemaining: wall.length,
      discards: discardTiles,
      exposures: botExposures,
      playerClaimMelds: eastExposures,
      eastTableClaimMelds: eastExposures,
      patterns: cardPatterns,
    }
    const { bestTilesAway: eastAway, linesAtMin: eastLines } = suggestedHandsTiedAtBest(eastRankInput)
    const eastRow: WRow = {
      label: playerYouLabelText,
      bestTilesAway: eastAway,
      linesAtMin: eastLines,
      rankInput: eastRankInput,
    }

    const botRows: WRow[] = botSlotSeats.map((seat, idx) => {
      const label = seatLabel(seat)
      const botHand = bots[idx] ?? []
      const claims = botExposures.filter((e) => e.seat === label)
      const rankInput: RankSuggestedHandsInput = {
        hand: botHand,
        wallRemaining: wall.length,
        discards: discardTiles,
        exposures: botExposures,
        playerClaimMelds: claims,
        eastTableClaimMelds: eastExposures,
        patterns: cardPatterns,
      }
      const { bestTilesAway, linesAtMin } = suggestedHandsTiedAtBest(rankInput)
      return {
        label: `Bot ${idx + 1} (${label})`,
        bestTilesAway,
        linesAtMin,
        rankInput,
      }
    })

    return { rows: [eastRow, ...botRows] }
  }, [mainPhase, bots, hand, wall.length, discardTiles, botExposures, eastExposures, cardPatterns, botSlotSeats, playerYouLabelText])

  /** Play DnD lives in PlaySurface; App only keeps round/handlers + thin API bridge. */
  const passSlotCount = passSlots.filter(Boolean).length
  const blindPhase = !charlestonDone && charlestonAllowsBlind(charlestonPhase)
  const courtesyPhase = charlestonPhase === 'courtesy'
  const secondCharlestonLeftChoice = charlestonPhase === 'left2'
  const passReady =
    secondCharlestonLeftChoice
      ? passSlotCount === 0 || passSlotCount === 3
      : courtesyPhase
        ? passSlotCount <= 3
        : blindPhase
          ? passSlotCount <= 3
          : passSlotCount === 3

  const charlestonRackRoundTitleText = charlestonRackRoundTitle(charlestonPhase)

  const performNewHandDeal = useCallback((opts?: {
    replayLastOpening?: boolean
    /** Deal tiles now but hold the rack fly-in (e.g. until boot loader dismisses). */
    deferOpeningFlyIn?: boolean
    /** Skip new_rack when replacing the ephemeral boot deal after prefs hydrate. */
    skipNewRackRecord?: boolean
  }) => {
    const phase = mainPhaseRef.current
    const terminal =
      phase === 'mahjong-declared' ||
      phase === 'bot-mahjong' ||
      phase === 'dead-hand' ||
      phase === 'wall-game'
    if (
      !opts?.skipNewRackRecord &&
      sessionReadyRef.current &&
      !gameResultRecordedRef.current &&
      !terminal
    ) {
      const roundKey = clientRoundIdRef.current
      if (!recordedGameResultRoundIds.has(roundKey)) {
        recordedGameResultRoundIds.add(roundKey)
        gameResultRecordedRef.current = true
        inProgressSaverRef.current.cancel()
        void clearInProgressGame()
        void recordGameResult({
          outcome: 'new_rack',
          cardId: committedCardIdRef.current,
          botDifficulty: botDifficultyRef.current,
          assists: [],
        })
      } else {
        gameResultRecordedRef.current = true
      }
    }

    const m = menuCardIdRef.current
    const c = committedCardIdRef.current

    setPendingJokerSwapTileId(null)
    setCharlestonPassError(null)
    setCallRuleError(null)
    setBlockingDialog(null)
    playSurfaceDnDApiRef.current?.resetDragUi()
    setPassStripFlyOut(null)
    setSuggestedFocusHandKey(null)
    setSuggestedPinnedHandKeys([])
    setSuggestedSuppressedHandKey(null)
    setSuggestedDeadTileGuidesByKey({})
    setSuggestedDeadTableGuidesByKey({})
    setSuggestedHandsUncheckedSections(new Set())
    setSuggestedHandsHideConcealed(false)
    if (passStripFlyoutTimerRef.current) {
      clearTimeout(passStripFlyoutTimerRef.current)
      passStripFlyoutTimerRef.current = null
    }
    setWallGameReviewing(false)
    setMahjongWinReviewing(false)
    setBotMahjongWinReviewing(false)
    historyRef.current = []
    sortModeRef.current = null
    setCanUndo(false)
    gameResultRecordedRef.current = false
    handAssistsRef.current = new Set()
    clientRoundIdRef.current =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `round-${Date.now()}`
    wallGameEndedByRef.current = 'natural'
    // Abandon any cloud autosave when dealing a fresh/replay hand.
    if (sessionReadyRef.current) {
      inProgressSaverRef.current.cancel()
      void clearInProgressGame()
    }
    // Most menu prefs persist across hands; suggested-hand category filters + Concealed (C) reset below.
    const w = readBotWinsEnabledFromStorage()
    setBotWinsEnabled((prev) => (prev === w ? prev : w))
    botWinsEnabledRef.current = w
    const playAsEastOn = readPlayAsEastEnabledFromStorage()
    setPlayAsEastEnabled((prev) => (prev === playAsEastOn ? prev : playAsEastOn))
    playAsEastEnabledRef.current = playAsEastOn
    const randomSeatOn = !playAsEastOn
    const tenJokersOn = readTenJokersEnabledFromStorage()
    setTenJokersEnabled((prev) => (prev === tenJokersOn ? prev : tenJokersOn))
    tenJokersEnabledRef.current = tenJokersOn
    const blankOn = readBlankTilesEnabledFromStorage()
    setBlankTilesEnabled((prev) => (prev === blankOn ? prev : blankOn))
    blankTilesEnabledRef.current = blankOn
    const blankCount = readBlankTileCountFromStorage()
    setBlankTileCount((prev) => (prev === blankCount ? prev : blankCount))
    blankTileCountRef.current = blankCount
    // New games always start with the Hands tray closed (menu default no longer auto-opens).
    suggestedHandsTrayApiRef.current.setTrayOpen(false)
    trayOpenBeforeBotHandsRef.current = null
    setBotHandsIdentifierFocusSeat(null)
    if (m !== c) {
      try {
        writePlayableCardToStorage(m)
      } catch {
        /* ignore */
      }
      setCommittedCardId(m)
      setActiveCardPatterns(patternsForCard(m))
    }
    const snap = replayOpeningDeckRef.current
    const expectedDeckSize = americanDeckTileCount(tenJokersOn, blankOn, blankCount)
    const replay =
      opts?.replayLastOpening === true &&
      snap != null &&
      snap.length === expectedDeckSize
    const nextRound = replay
      ? roundStateFromOpeningDeck([...snap], randomSeatOn, replayOpeningMetaRef.current)
      : (() => {
          const r = createNewRound(tenJokersOn, blankOn, blankCount, randomSeatOn)
          replayOpeningDeckRef.current = roundOpeningDeckOrder(r)
          replayOpeningMetaRef.current = { playerSeat: r.playerSeat, botSlotSeats: r.botSlotSeats }
          return r
        })()
    setRound(opts?.deferOpeningFlyIn ? { ...nextRound, handTileFlyIn: null } : nextRound)
  }, [])

  /** Seat / deck prefs: redeal a fresh rack behind the open menu (do not close it). */
  const setSeatMode = useCallback(
    (mode: SeatMode) => {
      const next = mode === 'east'
      if (next === playAsEastEnabledRef.current) return
      try {
        localStorage.setItem(LS_KEY_PLAY_AS_EAST, next ? 'true' : 'false')
      } catch {
        /* ignore */
      }
      setPlayAsEastEnabled(next)
      playAsEastEnabledRef.current = next
      performNewHandDeal()
    },
    [performNewHandDeal],
  )

  const togglePlayAsEast = useCallback(() => {
    setSeatMode(playAsEastEnabledRef.current ? 'random' : 'east')
  }, [setSeatMode])

  const setTenJokersMode = useCallback(
    (mode: TenJokersMode) => {
      const next = mode === 'on'
      if (next === tenJokersEnabledRef.current) return
      try {
        localStorage.setItem(LS_KEY_TEN_JOKERS, next ? 'true' : 'false')
      } catch {
        /* ignore */
      }
      setTenJokersEnabled(next)
      tenJokersEnabledRef.current = next
      performNewHandDeal()
    },
    [performNewHandDeal],
  )

  const setBlankTilesEnabledLevel = useCallback(
    (next: boolean) => {
      if (next === blankTilesEnabledRef.current) return
      try {
        localStorage.setItem(LS_KEY_BLANK_TILES, next ? 'true' : 'false')
      } catch {
        /* ignore */
      }
      setBlankTilesEnabled(next)
      blankTilesEnabledRef.current = next
      performNewHandDeal()
    },
    [performNewHandDeal],
  )

  const setBlankTileCountLevel = useCallback(
    (count: BlankTileCount) => {
      if (count === blankTileCountRef.current && blankTilesEnabledRef.current) return
      setBlankTileCount(count)
      setBlankTilesEnabled(true)
      blankTileCountRef.current = count
      blankTilesEnabledRef.current = true
      try {
        localStorage.setItem(LS_KEY_BLANK_TILE_COUNT, String(count))
        localStorage.setItem(LS_KEY_BLANK_TILES, 'true')
      } catch {
        /* ignore */
      }
      performNewHandDeal()
    },
    [performNewHandDeal],
  )

  const setBlankMenuMode = useCallback(
    (mode: BlankMenuMode) => {
      if (mode === 'none') {
        setBlankTilesEnabledLevel(false)
        return
      }
      const count = Number(mode)
      if (isBlankTileCount(count)) setBlankTileCountLevel(count)
    },
    [setBlankTileCountLevel, setBlankTilesEnabledLevel],
  )

  /** @returns true (menu may close). */
  const newHand = useCallback((): boolean => {
    performNewHandDeal()
    return true
  }, [performNewHandDeal])

  /** Selecting a different card during an active round deals a new hand with that card. */
  const requestPlayableCard = useCallback(
    (next: PlayableCardId) => {
      if (next === menuCardId) return
      const committed = committedCardIdRef.current
      if (next !== committed) {
        const roundAlreadyOver =
          mainPhase === 'wall-game' ||
          mainPhase === 'mahjong-declared' ||
          mainPhase === 'bot-mahjong' ||
          mainPhase === 'dead-hand'
        if (!roundAlreadyOver) {
          setMenuCardId(next)
          menuCardIdRef.current = next
          performNewHandDeal()
          return
        }
      }
      setMenuCardId(next)
    },
    [menuCardId, mainPhase, performNewHandDeal],
  )

  const collectSyncedPrefs = useCallback((): SyncedUserPreferences => {
    return {
      playableCardId: menuCardIdRef.current,
      botDifficulty: botDifficultyRef.current,
      appTheme,
      tileGraphics,
      botWinsEnabled,
      colorButtonsEnabled,
      undoEnabled,
      animationsEnabled,
      deadHandWarningsEnabled,
      jokerSwapHintEnabled,
      mahjongHintEnabled,
      mahjongHintDelaySeconds,
      jokerSwapHintDelaySeconds,
      deadTileHintEnabled,
      botHandsIdentifierEnabled,
      concealedHandReminderEnabled,
      blankTilesEnabled,
      blankTileCount,
      tenJokersEnabled,
      playAsEastEnabled,
      suggestedHandsTrayDefaultOpen,
      handProbabilityEnabled,
      helpPreset: readHelpPresetFromStorage(),
    }
  }, [
    appTheme,
    tileGraphics,
    botWinsEnabled,
    colorButtonsEnabled,
    undoEnabled,
    animationsEnabled,
    deadHandWarningsEnabled,
    jokerSwapHintEnabled,
    mahjongHintEnabled,
    mahjongHintDelaySeconds,
    jokerSwapHintDelaySeconds,
    deadTileHintEnabled,
    botHandsIdentifierEnabled,
    concealedHandReminderEnabled,
    blankTilesEnabled,
    blankTileCount,
    tenJokersEnabled,
    playAsEastEnabled,
    suggestedHandsTrayDefaultOpen,
    handProbabilityEnabled,
  ])

  /** Persist finished hands to Supabase once per round. */
  useEffect(() => {
    if (previewWinHandActive) return
    const terminal =
      mainPhase === 'mahjong-declared' ||
      mainPhase === 'bot-mahjong' ||
      mainPhase === 'dead-hand' ||
      mainPhase === 'wall-game'
    if (!terminal || gameResultRecordedRef.current) return
    const roundKey = clientRoundIdRef.current
    if (recordedGameResultRoundIds.has(roundKey)) {
      gameResultRecordedRef.current = true
      return
    }
    recordedGameResultRoundIds.add(roundKey)
    gameResultRecordedRef.current = true
    inProgressSaverRef.current.cancel()
    void clearInProgressGame()

    let outcome: GameOutcome
    if (mainPhase === 'mahjong-declared') outcome = 'player_win'
    else if (mainPhase === 'bot-mahjong') outcome = 'bot_win'
    else if (mainPhase === 'dead-hand') outcome = 'dead_hand'
    else outcome = 'wall_game'

    let patternId: string | null = null
    let handTitle: string | null = null
    let handSection: string | null = null
    let cardHandCode: string | null = null
    let points: number | null = null
    let closed: boolean | null = null
    let winMethod: GameWinMethod | null = null

    if (outcome === 'player_win') {
      const { closestLine } = summarizeRackTowardWin({
        hand,
        wallRemaining: wall.length,
        discards: discardTiles,
        exposures: botExposures,
        playerClaimMelds: eastExposures,
        eastTableClaimMelds: eastExposures,
        patterns: cardPatterns,
      })
      if (playerWinMethod?.type === 'self-draw') winMethod = 'self-draw'
      else if (playerWinMethod?.type === 'called-discard') winMethod = 'called-discard'
      if (closestLine) {
        patternId = closestLine.id
        handTitle = closestLine.title
        handSection = closestLine.section
        cardHandCode = closestLine.cardHandCode ?? null
        closed = closestLine.closed
        // Player collects 4× base on discard win, 6× on self-pick.
        points =
          winMethod != null ? winnerCollectsPoints(closestLine.points, winMethod) : closestLine.points
      }
    } else if (outcome === 'bot_win' && botWin) {
      const bi = botWin.botIndex
      const winnerSeat = seatLabel(botSlotSeats[bi]!)
      const botHand = bots[bi] ?? []
      const claims = botExposures.filter((e) => e.seat === winnerSeat)
      const { closestLine } = summarizeRackTowardWin({
        hand: botHand,
        wallRemaining: wall.length,
        discards: discardTiles,
        exposures: botExposures,
        playerClaimMelds: claims,
        eastTableClaimMelds: eastExposures,
        patterns: cardPatterns,
      })
      winMethod = botWin.how === 'self-draw' ? 'self-draw' : 'called-discard'
      if (closestLine) {
        patternId = closestLine.id
        handTitle = closestLine.title
        handSection = closestLine.section
        cardHandCode = closestLine.cardHandCode ?? null
        closed = closestLine.closed
        const threwWinningTile =
          botWin.how === 'called-discard' && isPlayerTheDiscarder(botWin.discardFrom, playerSeat)
        // What this player pays: 2× if self-pick or they discarded; else 1×.
        points = nonWinnerPaysPoints(closestLine.points, winMethod, threwWinningTile)
      }
    } else if (outcome === 'dead_hand') {
      // Solo app ends the round immediately → no payout. Future multi-player:
      // if play continues and someone else wins, dead seat pays like any other loser.
      points = 0
    }

    void recordGameResult({
      outcome,
      cardId: committedCardId,
      patternId,
      handTitle,
      handSection,
      cardHandCode,
      points,
      closed,
      winMethod,
      deadHandReason: outcome === 'dead_hand' ? round.deadHandReason : null,
      botDifficulty,
      endedBy: outcome === 'wall_game' ? wallGameEndedByRef.current : null,
      assists: [...handAssistsRef.current],
    })
  }, [
    previewWinHandActive,
    mainPhase,
    hand,
    wall.length,
    discardTiles,
    botExposures,
    eastExposures,
    cardPatterns,
    playerWinMethod,
    botWin,
    bots,
    botSlotSeats,
    playerSeat,
    committedCardId,
    botDifficulty,
    round.deadHandReason,
  ])

  const markSessionReady = useCallback(() => {
    sessionReadyRef.current = true
    setSessionReady(true)
  }, [])

  /** Apply deck/card settings from an autosave before restoring the round. */
  const applyResumeSettings = useCallback((snap: InProgressGameSnapshot) => {
    const s = snap.settings
    writePlayableCardToStorage(s.cardId)
    setMenuCardId(s.cardId)
    menuCardIdRef.current = s.cardId
    setCommittedCardId(s.cardId)
    committedCardIdRef.current = s.cardId
    setActiveCardPatterns(patternsForCard(s.cardId))

    setBotDifficulty(s.botDifficulty)
    botDifficultyRef.current = s.botDifficulty
    setBotWinsEnabled(s.botWinsEnabled)
    botWinsEnabledRef.current = s.botWinsEnabled
    setTenJokersEnabled(s.tenJokersEnabled)
    tenJokersEnabledRef.current = s.tenJokersEnabled
    setBlankTilesEnabled(s.blankTilesEnabled)
    blankTilesEnabledRef.current = s.blankTilesEnabled
    setBlankTileCount(s.blankTileCount)
    blankTileCountRef.current = s.blankTileCount
    setPlayAsEastEnabled(s.playAsEastEnabled)
    playAsEastEnabledRef.current = s.playAsEastEnabled
    try {
      localStorage.setItem(LS_KEY_BOT_DIFFICULTY, s.botDifficulty)
      localStorage.setItem(LS_KEY_BOT_WINS, s.botWinsEnabled ? 'true' : 'false')
      localStorage.setItem(LS_KEY_TEN_JOKERS, s.tenJokersEnabled ? 'true' : 'false')
      localStorage.setItem(LS_KEY_BLANK_TILES, s.blankTilesEnabled ? 'true' : 'false')
      localStorage.setItem(LS_KEY_BLANK_TILE_COUNT, String(s.blankTileCount))
      localStorage.setItem(LS_KEY_PLAY_AS_EAST, s.playAsEastEnabled ? 'true' : 'false')
    } catch {
      /* ignore */
    }
  }, [])

  /** Put the autosaved hand on the table (no fly-in). Optionally skip menu gate (Home → Resume). */
  const loadSavedGameOntoTable = useCallback(
    (snap: InProgressGameSnapshot, opts?: { autoContinue?: boolean }) => {
      applyResumeSettings(snap)
      clientRoundIdRef.current = snap.clientRoundId
      gameResultRecordedRef.current = false
      handAssistsRef.current = new Set()
      historyRef.current = []
      sortModeRef.current = null
      setCanUndo(false)
      setPendingJokerSwapTileId(null)
      setCharlestonPassError(null)
      setCallRuleError(null)
      setPassStripFlyOut(null)
      setSuggestedFocusHandKey(null)
      setSuggestedPinnedHandKeys([])
      setSuggestedSuppressedHandKey(null)
      setSuggestedDeadTileGuidesByKey({})
      setSuggestedDeadTableGuidesByKey({})
      if (snap.openingDeck?.length) {
        replayOpeningDeckRef.current = snap.openingDeck
      }
      if (snap.openingMeta) {
        replayOpeningMetaRef.current = snap.openingMeta
      }
      setRound(snap.round)
      // Restore live tray state from the save — do not re-open from the menu default.
      suggestedHandsTrayApiRef.current.setTrayOpen(snap.settings.suggestedHandsTrayOpen === true)
      if (opts?.autoContinue) {
        setResumePrompt(null)
        markSessionReady()
        return
      }
      setResumePrompt(snap)
      // Menu opens for Resume / New Game after the boot loader dismisses (see effect below).
    },
    [applyResumeSettings, markSessionReady],
  )

  /** Continue: table already shows the saved hand — just dismiss the prompt. */
  const confirmContinueSavedGame = useCallback(() => {
    setResumePrompt(null)
    markSessionReady()
  }, [markSessionReady])

  const declineResumeStartNewGame = useCallback(() => {
    setResumePrompt(null)
    inProgressSaverRef.current.cancel()
    void clearInProgressGame()
    // sessionReady must be true before performNewHandDeal so it clears the cloud row.
    markSessionReady()
    performNewHandDeal()
  }, [markSessionReady, performNewHandDeal])

  /** End-dialog preview: skip Resume/New Game and deal a fresh table under the panel. */
  useEffect(() => {
    if (!previewEndDialogActive || resumePrompt == null) return
    declineResumeStartNewGame()
  }, [previewEndDialogActive, resumePrompt, declineResumeStartNewGame])

  /** Win-hand dump preview: seed pre-win table, then declare so the FLIP can run. */
  useLayoutEffect(() => {
    if (!previewWinHandActive) return
    eagerNewDealDoneRef.current = true
    gameResultRecordedRef.current = true
    inProgressSaverRef.current.cancel()
    void clearInProgressGame()
    setResumePrompt(null)
    setBlockingDialog(null)
    setMahjongWinReviewing(false)
    setMahjongWinDialogShown(false)
    setWinHandDumpPhase('off')
    setWinHandFlyOrigins(null)
    setRound(createPreviewWinHandRound('pre'))
    markSessionReady()
    clearPlayEnterFastPath()
  }, [previewWinHandActive, previewWinHandBurst, markSessionReady])

  useEffect(() => {
    if (!previewWinHandActive) return
    let cancelled = false
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (cancelled) return
        setRound((r) => {
          if (r.mainPhase === 'mahjong-declared') return r
          const winTile = r.hand[0]?.def
          return {
            ...r,
            mainPhase: 'mahjong-declared',
            playerWinMethod: winTile
              ? { type: 'self-draw', tile: winTile }
              : r.playerWinMethod,
          }
        })
      })
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [previewWinHandActive, previewWinHandBurst])

  useEffect(() => {
    if (!previewWinHandActive || resumePrompt == null) return
    setResumePrompt(null)
    setBlockingDialog(null)
  }, [previewWinHandActive, resumePrompt])

  /**
   * Fresh session: deal once (committed before revealing), fly-in armed when the boot loader lifts.
   * flushSync so the loader never dismisses onto an empty rack / wall 0.
   */
  const beginFreshSessionWithOpeningFlyIn = useCallback(() => {
    pendingOpeningDealFlyInRef.current = true
    flushSync(() => {
      performNewHandDeal({ deferOpeningFlyIn: true, skipNewRackRecord: true })
    })
    markSessionReady()
  }, [markSessionReady, performNewHandDeal])

  /**
   * Home → Play: deal from local prefs immediately (Home already saved them).
   * Waiting on cloud hydrate was the empty-rack / wall-0 hesitation.
   */
  useLayoutEffect(() => {
    if (previewWinHandActive) return
    if (eagerNewDealDoneRef.current) return
    if (homePlayIntentRef.current !== 'new') return
    eagerNewDealDoneRef.current = true
    inProgressSaverRef.current.cancel()
    void clearInProgressGame()
    beginFreshSessionWithOpeningFlyIn()
    clearPlayEnterFastPath()
  }, [beginFreshSessionWithOpeningFlyIn, previewWinHandActive])

  /** Load cloud prefs + in-progress game on login; open menu for Resume / New Game when needed. */
  useEffect(() => {
    if (!user) {
      cloudPrefsHydratedRef.current = false
      prefsSaverRef.current.cancel()
      inProgressSaverRef.current.cancel()
      pendingOpenMenuAfterBootRef.current = false
      sessionReadyRef.current = true
      setSessionReady(true)
      setResumePrompt(null)
      return
    }

    let cancelled = false
    cloudPrefsHydratedRef.current = false
    // Keep sessionReady if Home → Play already dealt; otherwise wait for hydrate.
    if (!eagerNewDealDoneRef.current) {
      sessionReadyRef.current = false
      setSessionReady(false)
    }
    setResumePrompt(null)

    void (async () => {
      const [{ prefs, error }, { snapshot: savedGame }] = await Promise.all([
        loadUserPreferences(),
        loadInProgressGame(),
      ])
      if (cancelled) return

      if (error) {
        cloudPrefsHydratedRef.current = true
        const playIntent = homePlayIntentRef.current
        homePlayIntentRef.current = undefined
        const openMenuWhenReady = playIntent == null && !eagerNewDealDoneRef.current
        if (eagerNewDealDoneRef.current || playIntent === 'new') {
          inProgressSaverRef.current.cancel()
          void clearInProgressGame()
          if (!sessionReadyRef.current) beginFreshSessionWithOpeningFlyIn()
        } else if (savedGame) {
          loadSavedGameOntoTable(savedGame, { autoContinue: playIntent === 'resume' })
          if (openMenuWhenReady) pendingOpenMenuAfterBootRef.current = true
        } else {
          beginFreshSessionWithOpeningFlyIn()
          if (openMenuWhenReady) pendingOpenMenuAfterBootRef.current = true
        }
        return
      }

      if (!prefs) {
        await saveUserPreferences(collectSyncedPrefs())
        if (cancelled) return
      }

      if (prefs) {
        const prevCard = committedCardIdRef.current
        const prevBlank = blankTilesEnabledRef.current
        const prevBlankCount = blankTileCountRef.current
        const prevTen = tenJokersEnabledRef.current
        const prevEast = playAsEastEnabledRef.current

        if (prefs.playableCardId != null && prefs.playableCardId !== prevCard) {
          writePlayableCardToStorage(prefs.playableCardId)
          setMenuCardId(prefs.playableCardId)
          menuCardIdRef.current = prefs.playableCardId
          setCommittedCardId(prefs.playableCardId)
          committedCardIdRef.current = prefs.playableCardId
          setActiveCardPatterns(patternsForCard(prefs.playableCardId))
        }
        if (prefs.botDifficulty != null) {
          setBotDifficulty(prefs.botDifficulty)
          botDifficultyRef.current = prefs.botDifficulty
          try {
            localStorage.setItem(LS_KEY_BOT_DIFFICULTY, prefs.botDifficulty)
          } catch {
            /* ignore */
          }
        }
        if (prefs.appTheme != null && isAppTheme(prefs.appTheme)) {
          setAppTheme(prefs.appTheme)
          persistAppTheme(prefs.appTheme)
        }
        if (prefs.tileGraphics != null && isTileGraphics(prefs.tileGraphics)) {
          setTileGraphics(prefs.tileGraphics)
          persistTileGraphicsChoice(prefs.tileGraphics)
        }
        if (typeof prefs.botWinsEnabled === 'boolean') {
          setBotWinsEnabled(prefs.botWinsEnabled)
          botWinsEnabledRef.current = prefs.botWinsEnabled
          try {
            localStorage.setItem(LS_KEY_BOT_WINS, prefs.botWinsEnabled ? 'true' : 'false')
          } catch {
            /* ignore */
          }
        }
        if (typeof prefs.colorButtonsEnabled === 'boolean') {
          setColorButtonsEnabled(prefs.colorButtonsEnabled)
          try {
            localStorage.setItem(LS_KEY_COLOR_BUTTONS, prefs.colorButtonsEnabled ? 'true' : 'false')
          } catch {
            /* ignore */
          }
        }
        if (typeof prefs.undoEnabled === 'boolean') {
          setUndoEnabled(prefs.undoEnabled)
          try {
            localStorage.setItem(LS_KEY_UNDO, prefs.undoEnabled ? 'true' : 'false')
          } catch {
            /* ignore */
          }
        }
        if (typeof prefs.animationsEnabled === 'boolean') {
          setAnimationsEnabled(prefs.animationsEnabled)
          try {
            localStorage.setItem(LS_KEY_ANIMATIONS, prefs.animationsEnabled ? 'true' : 'false')
          } catch {
            /* ignore */
          }
        }
        if (typeof prefs.deadHandWarningsEnabled === 'boolean') {
          setDeadHandWarningsEnabled(prefs.deadHandWarningsEnabled)
          deadHandWarningsEnabledRef.current = prefs.deadHandWarningsEnabled
          try {
            localStorage.setItem(
              LS_KEY_DEAD_HAND_WARNINGS,
              prefs.deadHandWarningsEnabled ? 'true' : 'false',
            )
          } catch {
            /* ignore */
          }
        }
        if (typeof prefs.jokerSwapHintEnabled === 'boolean') {
          setJokerSwapHintEnabled(prefs.jokerSwapHintEnabled)
          try {
            localStorage.setItem(LS_KEY_JOKER_SWAP_HINT, prefs.jokerSwapHintEnabled ? 'true' : 'false')
          } catch {
            /* ignore */
          }
        }
        if (typeof prefs.mahjongHintEnabled === 'boolean') {
          setMahjongHintEnabled(prefs.mahjongHintEnabled)
          try {
            localStorage.setItem(LS_KEY_MAHJONG_HINT, prefs.mahjongHintEnabled ? 'true' : 'false')
          } catch {
            /* ignore */
          }
        }
        if (typeof prefs.mahjongHintDelaySeconds === 'number') {
          const delay = normalizeHintDelaySeconds(prefs.mahjongHintDelaySeconds)
          if (delay != null) {
            setMahjongHintDelaySeconds(delay)
            try {
              localStorage.setItem(LS_KEY_MAHJONG_HINT_DELAY_SECONDS, String(delay))
            } catch {
              /* ignore */
            }
          }
        }
        if (typeof prefs.jokerSwapHintDelaySeconds === 'number') {
          const delay = normalizeHintDelaySeconds(prefs.jokerSwapHintDelaySeconds)
          if (delay != null) {
            setJokerSwapHintDelaySeconds(delay)
            try {
              localStorage.setItem(LS_KEY_JOKER_SWAP_HINT_DELAY_SECONDS, String(delay))
            } catch {
              /* ignore */
            }
          }
        }
        if (typeof prefs.deadTileHintEnabled === 'boolean') {
          setDeadTileHintEnabled(prefs.deadTileHintEnabled)
          try {
            localStorage.setItem(LS_KEY_DEAD_TILE_HINT, prefs.deadTileHintEnabled ? 'true' : 'false')
          } catch {
            /* ignore */
          }
        }
        if (typeof prefs.botHandsIdentifierEnabled === 'boolean') {
          setBotHandsIdentifierEnabled(prefs.botHandsIdentifierEnabled)
          try {
            localStorage.setItem(
              LS_KEY_BOT_HANDS_IDENTIFIER,
              prefs.botHandsIdentifierEnabled ? 'true' : 'false',
            )
          } catch {
            /* ignore */
          }
        }
        if (typeof prefs.concealedHandReminderEnabled === 'boolean') {
          setConcealedHandReminderEnabled(prefs.concealedHandReminderEnabled)
          concealedHandReminderEnabledRef.current = prefs.concealedHandReminderEnabled
          try {
            localStorage.setItem(
              LS_KEY_CONCEALED_HAND_REMINDER,
              prefs.concealedHandReminderEnabled ? 'true' : 'false',
            )
          } catch {
            /* ignore */
          }
        }
        if (typeof prefs.blankTilesEnabled === 'boolean' && prefs.blankTilesEnabled !== prevBlank) {
          setBlankTilesEnabled(prefs.blankTilesEnabled)
          blankTilesEnabledRef.current = prefs.blankTilesEnabled
          try {
            localStorage.setItem(LS_KEY_BLANK_TILES, prefs.blankTilesEnabled ? 'true' : 'false')
          } catch {
            /* ignore */
          }
        }
        if (
          typeof prefs.blankTileCount === 'number' &&
          isBlankTileCount(prefs.blankTileCount) &&
          prefs.blankTileCount !== prevBlankCount
        ) {
          setBlankTileCount(prefs.blankTileCount)
          blankTileCountRef.current = prefs.blankTileCount
          try {
            localStorage.setItem(LS_KEY_BLANK_TILE_COUNT, String(prefs.blankTileCount))
          } catch {
            /* ignore */
          }
        }
        if (typeof prefs.tenJokersEnabled === 'boolean' && prefs.tenJokersEnabled !== prevTen) {
          setTenJokersEnabled(prefs.tenJokersEnabled)
          tenJokersEnabledRef.current = prefs.tenJokersEnabled
          try {
            localStorage.setItem(LS_KEY_TEN_JOKERS, prefs.tenJokersEnabled ? 'true' : 'false')
          } catch {
            /* ignore */
          }
        }
        if (typeof prefs.playAsEastEnabled === 'boolean' && prefs.playAsEastEnabled !== prevEast) {
          setPlayAsEastEnabled(prefs.playAsEastEnabled)
          playAsEastEnabledRef.current = prefs.playAsEastEnabled
          try {
            localStorage.setItem(LS_KEY_PLAY_AS_EAST, prefs.playAsEastEnabled ? 'true' : 'false')
          } catch {
            /* ignore */
          }
        }
        if (typeof prefs.suggestedHandsTrayDefaultOpen === 'boolean') {
          setSuggestedHandsTrayDefaultOpen(prefs.suggestedHandsTrayDefaultOpen)
          // Do not force the live tray open here — resume restores tray from the in-progress save.
          try {
            localStorage.setItem(
              LS_KEY_SUGGESTED_HANDS_TRAY,
              prefs.suggestedHandsTrayDefaultOpen ? 'true' : 'false',
            )
          } catch {
            /* ignore */
          }
        }
        if (typeof prefs.handProbabilityEnabled === 'boolean') {
          setHandProbabilityEnabled(prefs.handProbabilityEnabled)
          try {
            localStorage.setItem(
              LS_KEY_HAND_PROBABILITY,
              prefs.handProbabilityEnabled ? 'true' : 'false',
            )
          } catch {
            /* ignore */
          }
        }
      }

      if (prefs?.helpPreset) {
        try {
          localStorage.setItem(LS_KEY_HELP_PRESET, prefs.helpPreset)
        } catch {
          /* ignore */
        }
      }

      if (!cancelled) cloudPrefsHydratedRef.current = true

      const playIntent = homePlayIntentRef.current
      homePlayIntentRef.current = undefined
      const openMenuWhenReady = playIntent == null && !eagerNewDealDoneRef.current

      // Home → Play already dealt in useLayoutEffect — apply cloud prefs above, do not redeal.
      if (eagerNewDealDoneRef.current || playIntent === 'new') {
        inProgressSaverRef.current.cancel()
        void clearInProgressGame()
        if (!sessionReadyRef.current) beginFreshSessionWithOpeningFlyIn()
        return
      }

      // Restore the saved table first — never flash a new opening deal under a resume.
      if (savedGame) {
        loadSavedGameOntoTable(savedGame, { autoContinue: playIntent === 'resume' })
        if (openMenuWhenReady) pendingOpenMenuAfterBootRef.current = true
        return
      }

      beginFreshSessionWithOpeningFlyIn()
      if (openMenuWhenReady) pendingOpenMenuAfterBootRef.current = true
    })()

    return () => {
      cancelled = true
    }
    // Hydrate once per signed-in user; avoid re-running on every prefs toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: user id only
  }, [user?.id])

  /** Debounced cloud upsert when menu settings change (after hydrate). */
  useEffect(() => {
    if (!user || !cloudPrefsHydratedRef.current) return
    prefsSaverRef.current.schedule(collectSyncedPrefs())
  }, [user, collectSyncedPrefs])

  useEffect(() => {
    const saver = prefsSaverRef.current
    return () => saver.cancel()
  }, [])

  /** Tell the single boot loader (in RequireAuth) that cloud hydrate is finished. */
  useEffect(() => {
    if (!user) return
    if (!(sessionReady || resumePrompt != null)) return
    sessionBoot?.notifySessionBootReady()
    clearPlayEnterFastPath()
  }, [user, sessionReady, resumePrompt, sessionBoot])

  /** Reload / login: open the main Menu (lobby) after the load screen. */
  useEffect(() => {
    if (!pendingOpenMenuAfterBootRef.current) return
    if (!sessionReady && resumePrompt == null) return
    if (sessionBoot != null && !sessionBoot.bootLoaderDismissed) return
    pendingOpenMenuAfterBootRef.current = false
    setOpenMenuToLobby(true)
    appMenuOpenApiRef.current.setMenuOpen(true)
  }, [sessionReady, resumePrompt, sessionBoot, sessionBoot?.bootLoaderDismissed])

  /** Start the cold-start opening-deal fly-in only after the load screen lifts. */
  useLayoutEffect(() => {
    if (!pendingOpeningDealFlyInRef.current) return
    if (!sessionReady || resumePrompt) return
    // Outside SessionBootProvider (e.g. tests), treat the loader as already gone.
    if (sessionBoot != null && !sessionBoot.bootLoaderDismissed) return
    pendingOpeningDealFlyInRef.current = false
    flushSync(() => {
      setRound((r) => {
        if (r.handTileFlyIn || r.hand.length === 0) return r
        return {
          ...r,
          handTileFlyIn: {
            ids: r.hand.map((t) => t.id),
            from: 'across',
            staggerWaveDelayMs: 44,
          },
        }
      })
    })
  }, [sessionBoot, sessionBoot?.bootLoaderDismissed, sessionReady, resumePrompt])

  /** After bootstrap reveals the table, refresh hand-panel CQW (pass-slot / rack geometry). */
  useLayoutEffect(() => {
    if (!sessionReady && !resumePrompt) return
    refreshHandPanelCqwRef.current()
  }, [sessionReady, resumePrompt])

  /** Autosave in-progress hand for signed-in players (resume after reload). */
  useEffect(() => {
    if (!user || !sessionReady || resumePrompt) return
    const roundKey = clientRoundIdRef.current
    const snap = buildInProgressSnapshot({
      clientRoundId: roundKey,
      round,
      settings: {
        cardId: committedCardIdRef.current,
        botDifficulty: botDifficultyRef.current,
        botWinsEnabled: botWinsEnabledRef.current,
        tenJokersEnabled: tenJokersEnabledRef.current,
        blankTilesEnabled: blankTilesEnabledRef.current,
        blankTileCount: blankTileCountRef.current,
        playAsEastEnabled: playAsEastEnabledRef.current,
        suggestedHandsTrayOpen: suggestedHandsTrayApiRef.current.trayOpen,
      },
      openingDeck: replayOpeningDeckRef.current,
      openingMeta: replayOpeningMetaRef.current,
    })
    // Hand already finished (result recorded). Undo can restore a mid-hand phase — never
    // re-persist that as "in progress", or reload will offer Continue on an ended game.
    if (
      gameResultRecordedRef.current ||
      recordedGameResultRoundIds.has(roundKey)
    ) {
      inProgressSaverRef.current.cancel()
      if (snap) void clearInProgressGame()
      return
    }
    if (!snap) {
      // Fresh unplayed deal — do not upsert, and do not delete a cloud save we might
      // have failed to load (only New Game / hand-end / decline-resume clear).
      inProgressSaverRef.current.cancel()
      return
    }
    inProgressSaverRef.current.schedule(snap)
  }, [user, sessionReady, resumePrompt, round])

  useEffect(() => {
    const saver = inProgressSaverRef.current
    const persistWithLiveTray = () => {
      const snap = buildInProgressSnapshot({
        clientRoundId: clientRoundIdRef.current,
        round: roundRef.current,
        settings: {
          cardId: committedCardIdRef.current,
          botDifficulty: botDifficultyRef.current,
          botWinsEnabled: botWinsEnabledRef.current,
          tenJokersEnabled: tenJokersEnabledRef.current,
          blankTilesEnabled: blankTilesEnabledRef.current,
          blankTileCount: blankTileCountRef.current,
          playAsEastEnabled: playAsEastEnabledRef.current,
          suggestedHandsTrayOpen: suggestedHandsTrayApiRef.current.trayOpen,
        },
        openingDeck: replayOpeningDeckRef.current,
        openingMeta: replayOpeningMetaRef.current,
      })
      saver.cancel()
      if (snap) void saveInProgressGame(snap)
    }
    const onHide = () => {
      if (document.visibilityState === 'hidden') persistWithLiveTray()
    }
    const onPageHide = () => persistWithLiveTray()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onPageHide)
      // Leaving /play — persist with current Hands tray state before unmount.
      persistWithLiveTray()
    }
  }, [])

  /** Same shuffled deck + opening deal as before Charleston on the last fresh deal (reshuffle only via New Game). */
  const replayHand = useCallback((): boolean => {
    performNewHandDeal({ replayLastOpening: true })
    return true
  }, [performNewHandDeal])

  const {
    onCharlestonPassButtonClick,
    skipBotDiscard,
    commitEastDiscard,
    returnStagedEastDiscard,
    declareMahjong,
    executeSwapFromSlot,
    sortHand,
    initiateCall,
    proceedWithCall,
    commitStagedCall,
    onHandTileActivate,
    onPassBoxClick,
    onPassTileClickReturn,
  } = useRoundActions({
    roundRef,
    pushRound,
    updateRound,
    pushRoundAsync,
    applyCharlestonDoneIfNeeded,
    commitEastDiscardAfterStaged,
    applySkipBotDiscard,
    gameModeRef,
    botDifficultyRef,
    botWinsEnabledRef,
    committedCardIdRef,
    deadHandWarningsEnabledRef,
    concealedHandReminderEnabledRef,
    focusedHandIsConcealedRef,
    suggestedFocusHandKeyRef,
    sortModeRef,
    playSurfaceDnDApiRef,
    passStripFlyoutTimerRef,
    lastPassReturnTileIdRef,
    animationsEnabled,
    suggestedSuppressedHandKey,
    passSlots,
    charlestonPhase,
    charlestonDone,
    mainPhase,
    pendingJokerSwapTileId,
    selectedHandTileId,
    pendingEastDiscardTile,
    hand,
    discardPile,
    jokerSwapUiActive,
    jokerSwapPick,
    setBlockingDialog,
    setCharlestonPassError,
    setPendingJokerSwapTileId,
    setPassStripFlyOut,
    setCallRuleError,
    setEastCallStagedWaveFlyIn,
  })


  useLayoutEffect(() => {
    if (mainPhase !== 'call-staging' || !callEntryMagnet) return
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setCallEntryMagnet(null)
      return
    }
    const el = document.querySelector('[data-call-magnet-target]') as HTMLElement | null
    if (!el) {
      setCallEntryMagnet(null)
      return
    }
    const r = el.getBoundingClientRect()
    const toX = r.left + r.width / 2
    const toY = r.top + r.height / 2
    const { x: fromX, y: fromY } = callEntryMagnet.from
    const dx = fromX - toX
    const dy = fromY - toY
    el.style.transition = 'none'
    el.classList.remove('exposure-rack__call-magnet-anim')
    el.style.setProperty('--call-magnet-tx', `${dx}px`)
    el.style.setProperty('--call-magnet-ty', `${dy}px`)
    void el.offsetHeight
    el.classList.add('exposure-rack__call-magnet-anim')
    el.style.removeProperty('transition')
    let finished = false
    const done = () => {
      if (finished) return
      finished = true
      el.classList.remove('exposure-rack__call-magnet-anim')
      el.style.removeProperty('--call-magnet-tx')
      el.style.removeProperty('--call-magnet-ty')
      setCallEntryMagnet(null)
    }
    const id = requestAnimationFrame(() => {
      el.style.setProperty('--call-magnet-tx', '0px')
      el.style.setProperty('--call-magnet-ty', '0px')
    })
    el.addEventListener('transitionend', done, { once: true })
    const t = window.setTimeout(done, 650)
    return () => {
      cancelAnimationFrame(id)
      clearTimeout(t)
      el.removeEventListener('transitionend', done)
    }
  }, [mainPhase, callEntryMagnet])

  /** Commit the staged meld — removes tiles from hand and returns to east-discard. */


  const onToggleStagedCallTile = useCallback(
    (id: string) => {
      updateRound((r) => applyToggleStagedCallTile(r, id))
    },
    [updateRound],
  )



  /*
   * Freeze the hand panel's container-query width to a px value (`--hand-panel-cqw`, consumed by
   * part-0117.css). WKWebView re-evaluates live `100cqi` while a transformed descendant animates
   * (the post-removal slide / drag), which momentarily shrinks every cqi-derived height — the tile
   * faces AND the dark-tray bank. Because the rack column is bottom-anchored, a bank shrink slides
   * the top-pinned tiles down toward the action row (the "tiles get pushed down" report). A
   * ResizeObserver only fires on a REAL box change (resize / orientation / sibling-panel relayout),
   * never during a transient transform, so the frozen px stays put and the dip can't happen. The
   * measured content-box inline size equals what `100cqi` resolves to at rest → pixel-identical.
   *
   * Updates are rAF-coalesced and quantized to whole px so continuous window-drag resize does not
   * rewrite the full rack/action calc tree on every observer tick.
   */
  useLayoutEffect(() => {
    const el = handPanelRef.current
    if (!el) return
    const dndFrame = el.closest('.app-dnd-frame') as HTMLElement | null
    const scheduler = createResizeScheduler(120)
    let lastAppliedPx = Number.NaN
    // Content-box inline size == what `100cqi` used to resolve to. Written on `.panel--hand` (rack
    // tile math) and `.app-dnd-frame` (DragOverlay sizing). Neither element uses `container-type`
    // anymore — live cqi + per-frame drag transforms caused the mobile rack vertical jog on WKWebView.
    const contentWidth = () => {
      const cs = getComputedStyle(el)
      const padInline =
        parseFloat(cs.paddingLeft || '0') + parseFloat(cs.paddingRight || '0')
      return el.clientWidth - padInline
    }
    const setVar = (w: number) => {
      if (handPanelCqwFrozenRef.current) return
      if (!Number.isFinite(w) || w < 1) return
      const px = Math.round(w)
      if (px === lastAppliedPx) return
      lastAppliedPx = px
      const next = `${px}px`
      for (const target of [el, dndFrame]) {
        if (!target) continue
        if (target.style.getPropertyValue('--hand-panel-cqw') !== next) {
          target.style.setProperty('--hand-panel-cqw', next)
        }
      }
    }
    const refresh = () => setVar(contentWidth())
    refreshHandPanelCqwRef.current = refresh
    refresh()
    const scheduleRefresh = () => scheduler.live(refresh)
    let pendingInline: number | null = null
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver((entries) => {
        const inline = entries[0]?.contentBoxSize?.[0]?.inlineSize
        pendingInline = inline ?? null
        scheduler.live(() => {
          setVar(pendingInline ?? contentWidth())
          pendingInline = null
        })
      })
      ro.observe(el)
    } else {
      window.addEventListener('resize', scheduleRefresh)
    }
    // Orientation / visualViewport can change without a content-box RO tick (mobile chrome).
    // Coalesce; do not also run sync work on every desktop window-drag pixel.
    window.addEventListener('orientationchange', scheduleRefresh)
    window.visualViewport?.addEventListener('resize', scheduleRefresh)
    return () => {
      scheduler.cancel()
      ro?.disconnect()
      window.removeEventListener('resize', scheduleRefresh)
      window.removeEventListener('orientationchange', scheduleRefresh)
      window.visualViewport?.removeEventListener('resize', scheduleRefresh)
    }
  }, [])

  // Clear inline height locks left by an earlier rack-top / hand-bank pin (removed — they caused a
  // dead band between green exposure slots and the hand row when the box was taller than content).
  useLayoutEffect(() => {
    const rackTop = eastExposureRackTopRef.current
    if (rackTop) {
      rackTop.style.removeProperty('height')
      rackTop.style.removeProperty('min-height')
      rackTop.style.removeProperty('max-height')
    }
    const bank = handPanelRef.current?.querySelector('.hand-bank') as HTMLElement | null
    if (bank) {
      bank.style.removeProperty('height')
      bank.style.removeProperty('min-height')
    }
  }, [charlestonDone, mainPhase])

  // During call-staging, staged tiles are shown in the exposure rack — hide them from the hand.
  // Keep array identity stable when nothing is filtered so memo(SortableHand) can bail.
  const visibleHandTiles = useMemo(() => {
    if (mainPhase === 'call-staging' && stagedCallTileIds.length > 0) {
      const staged = new Set(stagedCallTileIds)
      return hand.filter((t) => !staged.has(t.id))
    }
    return hand
  }, [mainPhase, stagedCallTileIds, hand])
  const handIds = useMemo(() => visibleHandTiles.map((t) => t.id), [visibleHandTiles])
  /** Pass strip and hand are separate sortable contexts (same DndContext) so rectSortingStrategy does not treat them as one row. */
  const charlestonPassSortableItems = useMemo(() => {
    return passSlots.map((s) => s?.id).filter((id): id is string => id != null)
  }, [passSlots])
  /** Keep Charleston hand sortables stable; cross-zone preview gap is a visual transform in `SortableHand`. */
  const charlestonHandSortableIds = handIds
  /** East discard + pending: keep active id stable in its staging slot; hand preview gap is visual only. */
  const eastMainSortableIds = useMemo(() => {
    if (mainPhase !== 'east-discard' || !pendingEastDiscardTile) return null
    const pid = pendingEastDiscardTile.id
    if (handIds.includes(pid)) return null
    return [pid, ...handIds]
  }, [mainPhase, pendingEastDiscardTile, handIds])
  // Staged tiles share the same SortableContext as hand tiles so dragging animates both zones.
  const sortableItems = useMemo(() => {
    if (mainPhase === 'call-staging') return [...stagedCallTileIds, ...handIds]
    if (mainPhase === 'bot-turn' && activeBotDiscard) {
      return [incomingBotDiscardDragId(activeBotDiscard.id), ...handIds]
    }
    return eastMainSortableIds ?? handIds
  }, [mainPhase, stagedCallTileIds, handIds, activeBotDiscard, eastMainSortableIds])

  /** Stable meld props for memo(ExposureRack) — avoid new array/object identity every App render. */
  const charlestonEastExposureMelds = useMemo(
    () =>
      eastExposures.map((exp) => ({
        tiles: exp.tiles,
        calledTileId: exp.calledTileId,
      })),
    [eastExposures],
  )

  const eastPlayerExposureRackMelds = useMemo(() => {
    if (mainPhase === 'mahjong-declared' && winHandDumpOnExposure) {
      return winHandExposureMelds ?? EMPTY_EXPOSURE_RACK_MELDS
    }
    const allowSort =
      (mainPhase === 'east-discard' || mainPhase === 'bot-turn') &&
      playerExposureMelds.length > 1
    const committed = playerExposureMelds
      .map((exp, exposureIdx) => ({ exp, exposureIdx }))
      .filter(
        ({ exp }) =>
          mainPhase !== 'wall-game' ||
          exp.tiles.length <= WALL_GAME_MAX_EXPOSURE_MELD_TILES,
      )
      .map(({ exp, exposureIdx }) => ({
        tiles: exp.tiles,
        calledTileId: exp.calledTileId,
        sortableMeldId: allowSort ? eastExposureMeldSortId(exposureIdx) : undefined,
        dropZoneId:
          jokerSwapUiActive && exp.tiles.some((t) => t.def.cat === 'joker')
            ? eastExposureSwapDropId(exposureIdx)
            : undefined,
      }))
    if (mainPhase === 'call-staging' && activeBotDiscard) {
      const staged = new Set(stagedCallTileIds)
      return [
        ...committed,
        {
          tiles: [activeBotDiscard, ...hand.filter((t) => staged.has(t.id))],
          calledTileId: activeBotDiscard.id,
          onTileClick: onToggleStagedCallTile,
        },
      ]
    }
    return committed
  }, [
    mainPhase,
    hand,
    playerExposureMelds,
    activeBotDiscard,
    stagedCallTileIds,
    jokerSwapUiActive,
    onToggleStagedCallTile,
    winHandExposureMelds,
    winHandDumpOnExposure,
  ])

  const charlestonPassStrip = useMemo(
    () =>
      charlestonDone
        ? null
        : {
            slots: passSlots,
            onPassBoxClick,
            onPassTileClickReturn,
            flyOutFrom: passStripFlyOut,
            inlineHeaderTitle: charlestonRackRoundTitleText,
            inlineHeaderInstruction: (
              <CharlestonPassStripInstructionMain phase={charlestonPhase} />
            ),
            inlineHeaderInstructionAria: charlestonPassStripInstructionAria(charlestonPhase),
          },
    [
      charlestonDone,
      passSlots,
      onPassBoxClick,
      onPassTileClickReturn,
      passStripFlyOut,
      charlestonRackRoundTitleText,
      charlestonPhase,
    ],
  )

  const eastExposureLastSlotLabel =
    mainPhase === 'bot-turn' && activeBotDiscard != null && activeBotIndex != null
      ? `${seatLabel(botSlotSeats[activeBotIndex as 0 | 1 | 2]!).charAt(0)} >`
      : undefined

  const eastExposureLastSlotClassName = useMemo(() => {
    return (
      [
        mainPhase === 'east-discard' ? 'exposure-rack__slot--east-discard-instructed' : '',
        pendingEastDiscardTile &&
        suggestedTileGuideForRack?.bestIds.has(pendingEastDiscardTile.id)
          ? 'exposure-rack__slot--suggest-best'
          : '',
      ]
        .filter(Boolean)
        .join(' ') || undefined
    )
  }, [mainPhase, pendingEastDiscardTile, suggestedTileGuideForRack])

  const eastDiscardLastSlotReplace = useMemo(() => {
    if (mainPhase !== 'east-discard') return null
    return (
      <>
        <p className="east-discard-staging__instruction" aria-hidden="true">
          Discard &gt;
        </p>
        <EastDiscardStagingSlot
          enabled={charlestonDone}
          compact
          tile={pendingEastDiscardTile}
          onTileClickReturn={returnStagedEastDiscard}
          suggestBest={
            !!pendingEastDiscardTile &&
            !!suggestedTileGuideForRack?.bestIds.has(pendingEastDiscardTile.id)
          }
          suggestBlankExchange={
            !!pendingEastDiscardTile &&
            !!suggestedTileGuideForRack?.blankExchangeIds?.has(pendingEastDiscardTile.id)
          }
          suggestDim={
            !!pendingEastDiscardTile &&
            !!suggestedTileGuideForRack &&
            !suggestedTileGuideForRack.bestIds.has(pendingEastDiscardTile.id)
          }
          jokerSwapHintBounce={
            !!pendingEastDiscardTile &&
            !!jokerSwapHintBounceIds?.hand.has(pendingEastDiscardTile.id)
          }
          jokerSwapHintBounceEpoch={jokerSwapHintBounceEpoch}
        />
      </>
    )
  }, [
    mainPhase,
    charlestonDone,
    pendingEastDiscardTile,
    returnStagedEastDiscard,
    suggestedTileGuideForRack,
    jokerSwapHintBounceIds,
    jokerSwapHintBounceEpoch,
  ])

  const showMahjongRackHintRaw = useMemo(() => {
    if (!mahjongHintEnabled || !charlestonDone) return false
    if (mainPhase === 'east-discard') {
      return isSelfDrawMahjongWin(suggestedRankInput)
    }
    if (
      (mainPhase === 'bot-turn' || mainPhase === 'call-staging') &&
      activeBotDiscard
    ) {
      const slice: CallValidationRoundSlice = {
        mainPhase,
        activeBotDiscard,
        hand,
        eastExposures,
        botExposures,
        wall,
        discardPile,
      }
      const stagedAway =
        mainPhase === 'call-staging' ? previewStagedCallBestTilesAway(round) : null
      return isMahjongWinOnLiveBotDiscard(slice, stagedAway)
    }
    return false
  }, [
    mahjongHintEnabled,
    charlestonDone,
    mainPhase,
    activeBotDiscard,
    suggestedRankInput,
    hand,
    eastExposures,
    botExposures,
    wall,
    discardPile,
    round,
  ])
  const showMahjongRackHint = useDelayedReady(showMahjongRackHintRaw, mahjongHintDelayMs)

  useEffect(() => {
    if (showMahjongRackHint) handAssistsRef.current.add('mahjong_hint')
  }, [showMahjongRackHint])

  useEffect(() => {
    if (jokerSwapHintTargetIdsForRackHint) handAssistsRef.current.add('joker_swap_hint')
  }, [jokerSwapHintTargetIdsForRackHint])

  /** Discard tracker + suggested hands row below rack (always on so layout is visible during Charleston). */
  const showPlaySplitRow = true

  /** Suggested-hands tab + popup shell: hidden only on dead hand. */
  const showSuggestedHandsPanel = mainPhase !== 'dead-hand'

  const playSurfaceSeatLabel = useMemo(
    () =>
      buildPlayerSeatLabelProps({
        charlestonDone,
        mainPhase,
        botTurnBannerPresent: botTurnBanner != null,
        botTurnBannerDiscarderBotIndex: botTurnBanner?.discarderBotIndex,
      }),
    [charlestonDone, mainPhase, botTurnBanner],
  )

  const playSurfaceActionBar = useMemo(
    () =>
      buildPlaySurfaceActionBarProps({
        charlestonDone,
        mainPhase,
        activeBotDiscard,
        jokerSwapUiActive,
        hand,
        pendingEastDiscardTile,
        blankTilesEnabled,
        discardPile,
        showCallStagingDoneButton,
        canCommitStagedCallDone,
        jokerSwapHintTargetIds: jokerSwapHintTargetIdsForRackHint,
        showMahjongRackHint,
        showSuggestedHandsPanel,
        suggestedPanelTilesOn,
        concealedHandReminderEnabled,
        focusedHandIsConcealed,
        mahjongWinReviewing,
        undoEnabled,
        canUndo,
      }),
    [
      charlestonDone,
      mainPhase,
      activeBotDiscard,
      jokerSwapUiActive,
      hand,
      pendingEastDiscardTile,
      blankTilesEnabled,
      discardPile,
      showCallStagingDoneButton,
      canCommitStagedCallDone,
      jokerSwapHintTargetIdsForRackHint,
      showMahjongRackHint,
      showSuggestedHandsPanel,
      suggestedPanelTilesOn,
      concealedHandReminderEnabled,
      focusedHandIsConcealed,
      mahjongWinReviewing,
      undoEnabled,
      canUndo,
    ],
  )

  const playSurfaceCoach = useMemo((): PlaySurfaceCoachProps => {
    return {
      suggestedTileGuideForRack,
      suggestedDeadTileGuideForRack,
      botExposureSuggestedTileGuide,
      botExposureDeadIds: suggestedDeadTableGuideForView?.botExposureDeadIds ?? null,
      suggestedDiscardTrackerNeedDefs,
      jokerSwapHintBounceIds,
      jokerSwapHintBounceEpoch,
      charlestonGlowTileIds,
      handTileFlyIn,
      handJokerSwapFlyInFromBelowId,
      botExposureFlyInTileIds,
      exposureJokerSwapFlyInTileIds,
    }
  }, [
    suggestedTileGuideForRack,
    suggestedDeadTileGuideForRack,
    botExposureSuggestedTileGuide,
    suggestedDeadTableGuideForView?.botExposureDeadIds,
    suggestedDiscardTrackerNeedDefs,
    jokerSwapHintBounceIds,
    jokerSwapHintBounceEpoch,
    charlestonGlowTileIds,
    handTileFlyIn,
    handJokerSwapFlyInFromBelowId,
    botExposureFlyInTileIds,
    exposureJokerSwapFlyInTileIds,
  ])

  const playSurfaceRackChrome = useMemo((): PlaySurfaceRackChromeProps => {
    return {
      charlestonPassSortableItems,
      charlestonEastExposureMelds,
      charlestonPassStrip,
      charlestonHandSortableIds,
      sortableItems,
      eastPlayerExposureRackMelds,
      callMeldInsetCols,
      eastCallStagedWaveFlyIn,
      winHandFlyInTileIds,
      winHandFlyInOriginByTileId,
      winHandFlyWave,
      winHandDumpOnExposure,
      eastExposureLastSlotLabel,
      eastExposureLastSlotClassName,
      eastDiscardLastSlotReplace,
      visibleHandTiles,
    }
  }, [
    charlestonPassSortableItems,
    charlestonEastExposureMelds,
    charlestonPassStrip,
    charlestonHandSortableIds,
    sortableItems,
    eastPlayerExposureRackMelds,
    callMeldInsetCols,
    eastCallStagedWaveFlyIn,
    winHandFlyInTileIds,
    winHandFlyInOriginByTileId,
    winHandFlyWave,
    winHandDumpOnExposure,
    eastExposureLastSlotLabel,
    eastExposureLastSlotClassName,
    eastDiscardLastSlotReplace,
    visibleHandTiles,
  ])

  /** Write overlay CSS vars on the popup node — avoids App setState / re-render on every resize tick. */
  const updateSuggestedDiscardOverlayBounds = useCallback(() => {
    const popup = suggestedHandsPopupRef.current
    const exposureTopEl = eastExposureRackTopRef.current
    const discardPanel = discardTrackerPanelRef.current

    const clearOverlayVars = () => {
      if (!popup) return
      popup.style.setProperty('--suggested-overlay-top-peek', '0px')
      popup.style.setProperty('--suggested-overlay-content-h', '100%')
      popup.style.setProperty('--suggested-overlay-top-extend', '0px')
      popup.style.setProperty('--suggested-overlay-bottom-extend', '0px')
      popup.style.setProperty('--suggested-overlay-viewport-top', '0px')
      popup.style.setProperty('--suggested-overlay-viewport-left', '0px')
      popup.style.setProperty('--suggested-overlay-viewport-width', 'auto')
      popup.style.setProperty('--suggested-overlay-viewport-bottom', '0px')
    }

    const content = popup?.parentElement
    if (!popup || !content || !exposureTopEl || !discardPanel) {
      clearOverlayVars()
      return
    }

    const contentRect = content.getBoundingClientRect()
    const exposureRect = exposureTopEl.getBoundingClientRect()
    const discardRect = discardPanel.getBoundingClientRect()
    if (
      contentRect.width < 1 ||
      contentRect.height < SUGGESTED_DISCARD_OVERLAY_MIN_SHEET_PX ||
      discardRect.height < 1
    ) {
      return
    }
    const viewportH = window.visualViewport?.height ?? window.innerHeight
    const topExtendPx = Math.max(0, Math.ceil(contentRect.top - exposureRect.top))
    const bottomExtendPx = Math.max(0, Math.ceil(discardRect.bottom - contentRect.bottom))
    const contentHeightPx = Math.max(1, Math.ceil(contentRect.height))
    const viewportTopPx = Math.max(0, Math.floor(exposureRect.top))
    const viewportLeftPx = Math.max(0, Math.floor(contentRect.left))
    const viewportWidthPx = Math.max(1, Math.ceil(contentRect.width))
    const viewportBottomPx = Math.max(0, Math.ceil(viewportH - discardRect.bottom))

    popup.style.setProperty('--suggested-overlay-top-peek', '0px')
    /*
     * Never publish `0px` — that makes `.panel--hands` height 0 (flex-end), so only the
     * Away / Prob % / Points header strip paints at the bottom of an empty discard tray.
     */
    popup.style.setProperty('--suggested-overlay-content-h', `${contentHeightPx}px`)
    popup.style.setProperty('--suggested-overlay-top-extend', `${topExtendPx}px`)
    popup.style.setProperty('--suggested-overlay-bottom-extend', `${bottomExtendPx}px`)
    popup.style.setProperty('--suggested-overlay-viewport-top', `${viewportTopPx}px`)
    popup.style.setProperty('--suggested-overlay-viewport-left', `${viewportLeftPx}px`)
    popup.style.setProperty('--suggested-overlay-viewport-width', `${viewportWidthPx}px`)
    popup.style.setProperty('--suggested-overlay-viewport-bottom', `${viewportBottomPx}px`)
  }, [])

  useLayoutEffect(() => {
    if (!showSuggestedHandsPanel || !showPlaySplitRow) {
      updateSuggestedDiscardOverlayBounds()
      return
    }

    const scheduler = createResizeScheduler(120)
    updateSuggestedDiscardOverlayBounds()
    const settleTimers: number[] = []
    const scheduleUpdate = () => scheduler.live(updateSuggestedDiscardOverlayBounds)
    const scheduleSettledUpdate = () => {
      scheduleUpdate()
      for (const delay of [80, 180, 360]) {
        settleTimers.push(window.setTimeout(scheduleUpdate, delay))
      }
    }

    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleUpdate)
    const boundsObserveParent = suggestedHandsPopupRef.current?.parentElement
    for (const node of [
      boundsObserveParent,
      eastExposureRackTopRef.current,
      discardTrackerPanelRef.current,
    ]) {
      if (node) ro?.observe(node)
    }
    window.addEventListener('resize', scheduleUpdate)
    window.addEventListener('orientationchange', scheduleSettledUpdate)
    window.visualViewport?.addEventListener('resize', scheduleUpdate)
    return () => {
      scheduler.cancel()
      for (const t of settleTimers) window.clearTimeout(t)
      ro?.disconnect()
      window.removeEventListener('resize', scheduleUpdate)
      window.removeEventListener('orientationchange', scheduleSettledUpdate)
      window.visualViewport?.removeEventListener('resize', scheduleUpdate)
    }
  }, [
    updateSuggestedDiscardOverlayBounds,
    showPlaySplitRow,
    showSuggestedHandsPanel,
    mainPhase,
  ])

  const botHandsIdentifierFocusMelds = useMemo(() => {
    if (!botHandsIdentifierFocusSeat) return []
    if (postGameBotTableReviewRacks) {
      const row = postGameBotTableReviewRacks.find((r) => r.seat === botHandsIdentifierFocusSeat)
      return row?.claimMelds ?? []
    }
    return botExposures
      .filter((e) => e.seat === botHandsIdentifierFocusSeat)
      .filter(
        (e) =>
          mainPhase !== 'wall-game' || e.tiles.length <= WALL_GAME_MAX_EXPOSURE_MELD_TILES,
      )
      .map((e) => ({ tiles: e.tiles }))
  }, [
    botHandsIdentifierFocusSeat,
    botExposures,
    mainPhase,
    postGameBotTableReviewRacks,
  ])

  const botHandsIdentifierPatterns = useMemo(() => {
    if (!botHandsIdentifierFocusSeat) return []
    if (postGameBotTableReviewRacks) {
      const row = postGameBotTableReviewRacks.find((r) => r.seat === botHandsIdentifierFocusSeat)
      if (!row) return []
      if (row.isWinner) return row.winningPattern ? [row.winningPattern] : []
      if (row.claimMelds.length > 0) {
        return listOpenHandsFittingClaimMelds(row.claimMelds, cardPatterns)
      }
      // Concealed-only seat: show closest card lines from full-hand ranking.
      const seen = new Set<string>()
      const out: PracticePattern[] = []
      for (const line of row.closestLines) {
        if (seen.has(line.id)) continue
        const p = cardPatternsById.get(line.id)
        if (!p) continue
        seen.add(line.id)
        out.push(p)
      }
      return out
    }
    if (botHandsIdentifierFocusMelds.length === 0) return []
    return listOpenHandsFittingClaimMelds(botHandsIdentifierFocusMelds, cardPatterns)
  }, [
    botHandsIdentifierFocusSeat,
    botHandsIdentifierFocusMelds,
    cardPatterns,
    postGameBotTableReviewRacks,
    cardPatternsById,
  ])

  useEffect(() => {
    if (!botHandsIdentifierFocusSeat) return
    if (!botHandsIdentifierEnabled) {
      clearBotHandsIdentifierFocus()
      return
    }
    if (postGameBotTableReviewRacks) {
      const hasRow = postGameBotTableReviewRacks.some(
        (r) => r.seat === botHandsIdentifierFocusSeat && r.melds.some((m) => m.tiles.length > 0),
      )
      if (!hasRow) clearBotHandsIdentifierFocus()
      return
    }
    if (botHandsIdentifierFocusMelds.length === 0) {
      clearBotHandsIdentifierFocus()
    }
  }, [
    botHandsIdentifierFocusSeat,
    botHandsIdentifierEnabled,
    botHandsIdentifierFocusMelds.length,
    postGameBotTableReviewRacks,
    clearBotHandsIdentifierFocus,
  ])

  const suggestedHandsPopup = useMemo(() => {
    if (!showSuggestedHandsPanel) return null

    // Dynamic overlay geometry is written as CSS vars on the popup DOM node in
    // `updateSuggestedDiscardOverlayBounds` (rAF-coalesced) so window resize does not
    // re-render App. Do not put measured vars in React `style` — a later commit would
    // overwrite DOM writes with stale defaults.
    const overlayStyle: CSSProperties = {
      ['--suggested-overlay-top-peek' as string]: '0px',
    }

    return (
      <SuggestedHandsPopupChrome
        popupRef={suggestedHandsPopupRef}
        overlayStyle={overlayStyle}
      >
        {(trayOpen) =>
          botHandsIdentifierFocusSeat ? (
            <BotExposureHandsPanel
              seat={botHandsIdentifierFocusSeat}
              patterns={botHandsIdentifierPatterns}
              exposureMelds={botHandsIdentifierFocusMelds}
              discardTraySurface
              onClose={clearBotHandsIdentifierFocus}
              winningHandReview={
                !!postGameBotTableReviewRacks?.find(
                  (r) => r.seat === botHandsIdentifierFocusSeat && r.isWinner,
                )
              }
            />
          ) : (
            <SuggestedHandsPanel
              discardTraySurface
              trayOpen={trayOpen}
              onPinnedPatternChange={toggleSuggestedPinnedHandKey}
              hands={playerMahjongWinReviewHands ?? eastSuggestedHands}
              activePatternId={suggestedFocusHandKey}
              pinnedHandKeys={suggestedPinnedHandKeys}
              onPatternClick={onSuggestedPatternClick}
              onFocusKeyMigrate={onSuggestedFocusKeyMigrate}
              retainFocusWhenPatternMissing={mainPhase === 'call-staging'}
              tilesGuideOn={suggestedPanelTilesOn}
              showHandProbability={handProbabilityEnabled}
              rackTilesForSuggestedStrip={deferredRackForSuggestedStrip}
              rackTilesForPatternMatch={deferredRackForSuggestedPatternMatch}
              exposureTileIdsForSuggestedStrip={suggestedHandsExposureTileIds}
              exposureMeldsForSuggestedStrip={suggestedHandsExposureMelds}
              uncheckedSections={
                playerMahjongWinReviewHands
                  ? EMPTY_SUGGESTED_HAND_SECTIONS
                  : suggestedHandsUncheckedSections
              }
              hideConcealedHands={
                playerMahjongWinReviewHands
                  ? false
                  : resolveHideConcealedHands(suggestedHandsHideConcealed)
              }
              cardPatterns={cardPatterns}
              cardId={committedCardId}
              cardSectionOrder={cardSectionOrder}
              deadCauseByFocusKey={suggestedDeadCauseByFocusKey}
              focusedHandDeadCause={suggestedFocusedHandDeadCause}
              blankExchangeTargetDefs={
                suggestedTileGuideForRack?.blankExchangeTargetDefs ?? EMPTY_TILE_DEF_LIST
              }
            />
          )
        }
      </SuggestedHandsPopupChrome>
    )
  }, [
    showSuggestedHandsPanel,
    botHandsIdentifierFocusSeat,
    botHandsIdentifierPatterns,
    botHandsIdentifierFocusMelds,
    clearBotHandsIdentifierFocus,
    postGameBotTableReviewRacks,
    toggleSuggestedPinnedHandKey,
    playerMahjongWinReviewHands,
    eastSuggestedHands,
    suggestedFocusHandKey,
    suggestedPinnedHandKeys,
    onSuggestedPatternClick,
    onSuggestedFocusKeyMigrate,
    mainPhase,
    suggestedPanelTilesOn,
    handProbabilityEnabled,
    deferredRackForSuggestedStrip,
    deferredRackForSuggestedPatternMatch,
    suggestedHandsExposureTileIds,
    suggestedHandsExposureMelds,
    suggestedHandsUncheckedSections,
    suggestedHandsHideConcealed,
    cardPatterns,
    committedCardId,
    cardSectionOrder,
    suggestedDeadCauseByFocusKey,
    suggestedFocusedHandDeadCause,
    suggestedTileGuideForRack?.blankExchangeTargetDefs,
  ])

  return (
    <AppMenuOpenProvider initialOpen={previewMenuActive}>
    <TileGraphicsProvider tileGraphics={tileGraphics}>
    <SuggestedHandsTrayProvider initialOpen={false}>
    <MenuCardDraftOnClose onClosed={resetMenuCardDraftOnClose} />
    <ResumePromptOnMenuClose
      resumePromptActive={resumePrompt != null}
      onContinue={confirmContinueSavedGame}
    />
    <SuggestedHandsPinOnTrayClose
      focusKeyRef={suggestedFocusHandKeyRef}
      onClosedWithFocus={(k) => {
        setSuggestedPinnedHandKeys((prev) => (prev.includes(k) ? prev : [...prev, k]))
      }}
    />
    <SuggestedHandsBoundsOnTrayChange onChange={updateSuggestedDiscardOverlayBounds} />
    <div
      className="app"
      data-app-theme={appTheme}
      data-tile-graphics={tileGraphics}
      data-color-buttons={colorButtonsEnabled ? 'on' : 'off'}
      data-animations={animationsEnabled ? 'on' : 'off'}
      data-opening-pending={
        round.hand.length === 0 && resumePrompt == null ? 'true' : undefined
      }
      aria-hidden={rackCheckerOpen || undefined}
      {...(rackCheckerOpen ? ({ inert: '' } as Record<string, string>) : {})}
    >
      <AppMenuOpenGate>
        <div
          className="app-menu-modal-layer"
          role="presentation"
        >
          <button
            type="button"
            className="app-menu-modal__backdrop"
            tabIndex={-1}
            aria-label="Close menu"
            onClick={() => appMenuOpenApiRef.current.setMenuOpen(false)}
          />
          <AppMenuSlideShell
            onOpenRackChecker={() => setRackCheckerOpen(true)}
            onOpenStats={() => setGameMetaPanel('stats')}
            openToMenu={resumePrompt != null || openMenuToLobby}
            onOpenToMenuApplied={() => {
              if (openMenuToLobby) setOpenMenuToLobby(false)
            }}
            onResume={() => {
              if (resumePrompt != null) confirmContinueSavedGame()
              appMenuOpenApiRef.current.setMenuOpen(false)
            }}
            onNewGame={() => {
              if (resumePrompt != null) {
                declineResumeStartNewGame()
                appMenuOpenApiRef.current.setMenuOpen(false)
                return
              }
              if (newHand()) appMenuOpenApiRef.current.setMenuOpen(false)
            }}
          >
            <div className="app-menu-modal__body">
              <div className="app-menu-modal__diff-block app-menu-modal__diff-block--game-settings">
                <fieldset className="app-menu-modal__section-frame">
                  <legend className="app-menu-modal__section-frame-title">Game settings</legend>
                  <div className="app-menu-modal__select-pair-row">
                    <div className="app-menu-modal__select-pair-col">
                      <MenuSelectDropdown
                        title="Card"
                        value={menuCardId}
                        options={PLAYABLE_CARD_IDS}
                        labels={PLAYABLE_CARD_LABEL}
                        onChange={requestPlayableCard}
                      />
                    </div>
                  </div>
                  <div className="app-menu-modal__select-pair-row">
                    <div className="app-menu-modal__select-pair-col">
                      <MenuSelectDropdown
                        title="Seat"
                        value={playAsEastEnabled ? 'east' : 'random'}
                        options={SEAT_MODES}
                        labels={SEAT_MODE_LABEL}
                        onChange={setSeatMode}
                      />
                    </div>
                  </div>
                  <div className="app-menu-modal__select-pair-row">
                    <div className="app-menu-modal__select-pair-col">
                      <MenuSelectDropdown
                        title="Bots"
                        value={botDifficulty}
                        options={BOT_DIFFICULTIES}
                        labels={BOT_DIFFICULTY_LABEL}
                        onChange={setBotDifficultyLevel}
                      />
                    </div>
                  </div>
                  <div className="app-menu-modal__select-pair-row">
                    <div className="app-menu-modal__select-pair-col">
                      <MenuSelectDropdown
                        title="Bot wins"
                        value={botWinsEnabled ? 'enabled' : 'disabled'}
                        options={BOT_WINS_MODES}
                        labels={BOT_WINS_MODE_LABEL}
                        onChange={setBotWinsMode}
                      />
                    </div>
                  </div>
                </fieldset>
              </div>
              <div className="app-menu-modal__diff-block app-menu-modal__diff-block--house-rules">
                <fieldset className="app-menu-modal__section-frame">
                  <legend className="app-menu-modal__section-frame-title">House Rules</legend>
                  <div className="app-menu-modal__select-pair-row">
                    <div className="app-menu-modal__select-pair-col">
                      <MenuSelectDropdown
                        title="10 Jokers"
                        value={tenJokersEnabled ? 'on' : 'off'}
                        options={TEN_JOKERS_MODES}
                        labels={TEN_JOKERS_MODE_LABEL}
                        onChange={setTenJokersMode}
                      />
                    </div>
                  </div>
                  <div className="app-menu-modal__select-pair-row">
                    <div className="app-menu-modal__select-pair-col">
                      <MenuSelectDropdown
                        title="Blanks"
                        value={blankMenuModeFromState(blankTilesEnabled, blankTileCount)}
                        options={BLANK_MENU_MODES}
                        labels={BLANK_MENU_MODE_LABEL}
                        onChange={setBlankMenuMode}
                      />
                    </div>
                  </div>
                </fieldset>
              </div>
              <div className="app-menu-modal__diff-block app-menu-modal__diff-block--appearance">
                <fieldset className="app-menu-modal__section-frame">
                  <legend className="app-menu-modal__section-frame-title">Visuals</legend>
                  <div className="app-menu-modal__select-pair-row">
                    <div className="app-menu-modal__select-pair-col">
                      <MenuSelectDropdown
                        title="Theme"
                        value={appTheme}
                        options={APP_THEMES}
                        labels={APP_THEME_LABEL}
                        onChange={setAppThemeMode}
                      />
                    </div>
                  </div>
                  <div className="app-menu-modal__select-pair-row">
                    <div className="app-menu-modal__select-pair-col">
                      <MenuSelectDropdown
                        title="Tiles"
                        value={tileGraphics}
                        options={MENU_TILE_GRAPHICS}
                        labels={TILE_GRAPHICS_LABEL}
                        onChange={setTileGraphicsMode}
                      />
                    </div>
                  </div>
                  <div
                    key={tileGraphics}
                    className="app-menu-modal__tile-graphics-preview"
                    role="group"
                    aria-label="Sample tiles for the current tile graphics selection"
                  >
                    {MENU_TILE_GRAPHICS_PREVIEW.map((spec) => (
                      <TileFace
                        key={spec.label}
                        def={spec.def}
                        rackSuitStacked
                      />
                    ))}
                  </div>
                </fieldset>
              </div>
              {SHOW_SUGGESTED_HAND_FILTERS_IN_MENU ? (
              <div className="app-menu-modal__diff-block app-menu-modal__diff-block--suggested-hand-filters">
                <div className="app-menu-modal__tile-graphics-category">
                  <hr className="app-menu-modal__tile-graphics-category__line" aria-hidden="true" />
                  <span
                    className="app-menu-modal__tile-graphics-category__label"
                    id="app-menu-sh-filters-heading"
                  >
                    Suggested Hand Filters
                  </span>
                  <hr className="app-menu-modal__tile-graphics-category__line" aria-hidden="true" />
                </div>
                <div
                  className="app-menu-modal__suggested-hand-filters-inner"
                  role="group"
                  aria-labelledby="app-menu-sh-filters-heading"
                >
                  <div className="app-menu-modal__suggested-hand-filters-cols">
                    {suggestedHandsFilterColumns.map((col, ci) => (
                      <div key={ci} className="app-menu-modal__suggested-hand-filters-col">
                        {col.map((section) => {
                          const shown = isSuggestedHandSectionFilterEnabled(
                            section,
                            suggestedHandsUncheckedSections,
                          )
                          const dimmed =
                            !shown || !suggestedHandsExposureAvailableSections.has(section)
                          const labelId = `app-menu-label-sh-filter-${section
                            .replace(/[^a-zA-Z0-9]+/g, '-')
                            .toLowerCase()}`
                          return (
                            <div
                              key={section}
                              className="app-menu-modal__row app-menu-modal__row--toggle app-menu-modal__row--sh-filter"
                            >
                              <AppMenuSettingSwitch
                                labelId={labelId}
                                pressed={shown}
                                onToggle={() => {
                                  markSuggestedHandsAssist()
                                  setSuggestedHandsUncheckedSections((prev) =>
                                    toggledSuggestedHandSectionFilter(section, prev, !shown),
                                  )
                                }}
                              />
                              <span
                                className={[
                                  'app-menu-modal__label',
                                  dimmed ? 'app-menu-modal__label--exposure-unavailable' : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                                id={labelId}
                              >
                                {suggestedHandSectionMenuLabel(section)}
                              </span>
                            </div>
                          )
                        })}
                        {ci === suggestedHandsFilterColumns.length - 1 ? (
                          <div className="app-menu-modal__row app-menu-modal__row--toggle app-menu-modal__row--sh-filter">
                            <AppMenuSettingSwitch
                              labelId="app-menu-label-sh-filter-concealed"
                              pressed={!suggestedHandsHideConcealed}
                              onToggle={() => {
                                markSuggestedHandsAssist()
                                setSuggestedHandsHideConcealed((v) => !v)
                              }}
                            />
                            <span
                              className={[
                                'app-menu-modal__label',
                                suggestedHandsHideConcealed
                                  ? 'app-menu-modal__label--exposure-unavailable'
                                  : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                              id="app-menu-label-sh-filter-concealed"
                            >
                              Concealed (C)
                            </span>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              ) : null}
              <div className="app-menu-modal__diff-block app-menu-modal__diff-block--settings-toggles app-menu-modal__diff-block--helpers">
                <fieldset className="app-menu-modal__section-frame">
                  <legend className="app-menu-modal__section-frame-title">Helpers</legend>
                <div className="app-menu-modal__body-footer app-menu-modal__body-footer--settings-toggles">
                <div className="app-menu-modal__row app-menu-modal__row--toggle">
                  <AppMenuSettingSwitch
                    labelId="app-menu-label-undo"
                    pressed={undoEnabled}
                    onToggle={toggleUndo}
                  />
                  <span className="app-menu-modal__label" id="app-menu-label-undo">
                    {UNDO_LABEL}
                  </span>
                </div>
                {SHOW_ANIMATIONS_TOGGLE_IN_MENU ? (
                <div className="app-menu-modal__row app-menu-modal__row--toggle">
                  <AppMenuSettingSwitch
                    labelId="app-menu-label-animations"
                    pressed={animationsEnabled}
                    onToggle={toggleAnimations}
                  />
                  <span className="app-menu-modal__label" id="app-menu-label-animations">
                    {ANIMATIONS_LABEL}
                  </span>
                </div>
                ) : null}
                {SHOW_SUGGESTED_HANDS_TRAY_TOGGLE_IN_MENU ? (
                <div className="app-menu-modal__row app-menu-modal__row--toggle">
                  <AppMenuSettingSwitch
                    labelId="app-menu-label-suggested-hands-tray"
                    pressed={suggestedHandsTrayDefaultOpen}
                    onToggle={toggleSuggestedHandsTrayDefaultOpen}
                  />
                  <span className="app-menu-modal__label" id="app-menu-label-suggested-hands-tray">
                    {SUGGESTED_HANDS_TRAY_LABEL}
                  </span>
                </div>
                ) : null}
                <div className="app-menu-modal__row app-menu-modal__row--toggle">
                  <AppMenuSettingSwitch
                    labelId="app-menu-label-hand-probability"
                    pressed={handProbabilityEnabled}
                    onToggle={toggleHandProbability}
                  />
                  <span className="app-menu-modal__label" id="app-menu-label-hand-probability">
                    {HAND_PROBABILITY_LABEL}
                  </span>
                </div>
                <div className="app-menu-modal__row app-menu-modal__row--toggle">
                  <AppMenuSettingSwitch
                    labelId="app-menu-label-dead-hand-warnings"
                    pressed={deadHandWarningsEnabled}
                    onToggle={toggleDeadHandWarnings}
                  />
                  <span
                    className="app-menu-modal__label"
                    id="app-menu-label-dead-hand-warnings"
                  >
                    {DEAD_HAND_WARNINGS_LABEL}
                  </span>
                </div>
                {SHOW_HINT_DELAY_IN_MENU ? (
                <div className="app-menu-modal__row app-menu-modal__row--toggle app-menu-modal__row--blank-tiles">
                  <AppMenuSettingSwitch
                    labelId="app-menu-label-mahjong-hint"
                    pressed={mahjongHintEnabled}
                    onToggle={toggleMahjongHint}
                  />
                  <div className="app-menu-modal__blank-tiles-trail">
                    <span className="app-menu-modal__label" id="app-menu-label-mahjong-hint">
                      {MAHJONG_HINT_LABEL} - delay
                    </span>
                    <div
                      className="app-menu-modal__blank-tile-counts"
                      role="radiogroup"
                      aria-label="Mah Jongg hint delay in seconds"
                    >
                      {HINT_DELAY_SECONDS_OPTIONS.map((n) => (
                        <button
                          key={n}
                          type="button"
                          className={[
                            'btn',
                            'app-menu-modal__blank-tile-count-btn',
                            mahjongHintEnabled && mahjongHintDelaySeconds === n
                              ? 'app-menu-modal__blank-tile-count-btn--on'
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          role="radio"
                          aria-checked={mahjongHintEnabled && mahjongHintDelaySeconds === n}
                          disabled={!mahjongHintEnabled}
                          onClick={() => setMahjongHintDelaySecondsLevel(n)}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <span className="app-menu-modal__label app-menu-modal__label--hint-delay-unit">
                      seconds
                    </span>
                  </div>
                </div>
                ) : (
                <div className="app-menu-modal__row app-menu-modal__row--toggle">
                  <AppMenuSettingSwitch
                    labelId="app-menu-label-mahjong-hint"
                    pressed={mahjongHintEnabled}
                    onToggle={toggleMahjongHint}
                  />
                  <span className="app-menu-modal__label" id="app-menu-label-mahjong-hint">
                    {MAHJONG_HINT_LABEL}
                  </span>
                </div>
                )}
                {SHOW_HINT_DELAY_IN_MENU ? (
                <div className="app-menu-modal__row app-menu-modal__row--toggle app-menu-modal__row--blank-tiles">
                  <AppMenuSettingSwitch
                    labelId="app-menu-label-joker-swap-hint"
                    pressed={jokerSwapHintEnabled}
                    onToggle={toggleJokerSwapHint}
                  />
                  <div className="app-menu-modal__blank-tiles-trail">
                    <span
                      className="app-menu-modal__label"
                      id="app-menu-label-joker-swap-hint"
                    >
                      {JOKER_SWAP_HINT_LABEL} - delay
                    </span>
                    <div
                      className="app-menu-modal__blank-tile-counts"
                      role="radiogroup"
                      aria-label="Joker swap hint delay in seconds"
                    >
                      {HINT_DELAY_SECONDS_OPTIONS.map((n) => (
                        <button
                          key={n}
                          type="button"
                          className={[
                            'btn',
                            'app-menu-modal__blank-tile-count-btn',
                            jokerSwapHintEnabled && jokerSwapHintDelaySeconds === n
                              ? 'app-menu-modal__blank-tile-count-btn--on'
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          role="radio"
                          aria-checked={
                            jokerSwapHintEnabled && jokerSwapHintDelaySeconds === n
                          }
                          disabled={!jokerSwapHintEnabled}
                          onClick={() => setJokerSwapHintDelaySecondsLevel(n)}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <span className="app-menu-modal__label app-menu-modal__label--hint-delay-unit">
                      seconds
                    </span>
                  </div>
                </div>
                ) : (
                <div className="app-menu-modal__row app-menu-modal__row--toggle">
                  <AppMenuSettingSwitch
                    labelId="app-menu-label-joker-swap-hint"
                    pressed={jokerSwapHintEnabled}
                    onToggle={toggleJokerSwapHint}
                  />
                  <span
                    className="app-menu-modal__label"
                    id="app-menu-label-joker-swap-hint"
                  >
                    {JOKER_SWAP_HINT_LABEL}
                  </span>
                </div>
                )}
                <div className="app-menu-modal__row app-menu-modal__row--toggle">
                  <AppMenuSettingSwitch
                    labelId="app-menu-label-dead-tile-hint"
                    pressed={deadTileHintEnabled}
                    onToggle={toggleDeadTileHint}
                  />
                  <span className="app-menu-modal__label" id="app-menu-label-dead-tile-hint">
                    {DEAD_TILE_HINT_LABEL}
                  </span>
                </div>
                <div className="app-menu-modal__row app-menu-modal__row--toggle">
                  <AppMenuSettingSwitch
                    labelId="app-menu-label-bot-hands-identifier"
                    pressed={botHandsIdentifierEnabled}
                    onToggle={toggleBotHandsIdentifier}
                  />
                  <span className="app-menu-modal__label" id="app-menu-label-bot-hands-identifier">
                    {BOT_HANDS_IDENTIFIER_LABEL}
                  </span>
                </div>
                <div className="app-menu-modal__row app-menu-modal__row--toggle">
                  <AppMenuSettingSwitch
                    labelId="app-menu-label-concealed-hand-reminder"
                    pressed={concealedHandReminderEnabled}
                    onToggle={toggleConcealedHandReminder}
                  />
                  <span className="app-menu-modal__label" id="app-menu-label-concealed-hand-reminder">
                    {CONCEALED_HAND_REMINDER_LABEL}
                  </span>
                </div>
                {SHOW_PLAY_AS_EAST_TOGGLE_IN_MENU ? (
                <div className="app-menu-modal__row app-menu-modal__row--toggle">
                  <AppMenuSettingSwitch
                    labelId="app-menu-label-play-as-east"
                    pressed={playAsEastEnabled}
                    onToggle={togglePlayAsEast}
                  />
                  <span className="app-menu-modal__label" id="app-menu-label-play-as-east">
                    {PLAY_AS_EAST_LABEL}
                  </span>
                </div>
                ) : null}
                </div>
                </fieldset>
              </div>
            </div>
          </AppMenuSlideShell>
        </div>
      </AppMenuOpenGate>
      {gameMetaPanel ? (
        <GameHistoryStatsOverlay
          kind={gameMetaPanel}
          onClose={() => {
            setGameMetaPanel(null)
            appMenuOpenApiRef.current.setMenuOpen(true)
          }}
        />
      ) : null}
      {charlestonPassError || callRuleError || blockingDialog ? (
        <div
          className="charleston-error-overlay"
          role="presentation"
          onClick={() => {
            // Warnings that require an explicit choice — backdrop click does nothing
            if (blockingDialog?.variant === 'dead-hand-warning') return
            if (blockingDialog?.variant === 'mahjong-dead-warning') return
            if (blockingDialog?.variant === 'call-exposure-dead-warning') return
            if (blockingDialog?.variant === 'call-meld-size-warning') return
            if (blockingDialog?.variant === 'invalid-call-meld-warning') return
            if (blockingDialog?.variant === 'discard-dead-warning') return
            if (blockingDialog?.variant === 'concealed-call-warning') return
            setCharlestonPassError(null)
            setCallRuleError(null)
            setBlockingDialog(null)
          }}
        >
          <div
            className={[
              'charleston-error-dialog',
              blockingDialog?.variant === 'concealed-call-warning' ||
              blockingDialog?.variant === 'dead-hand-warning' ||
              blockingDialog?.variant === 'table' ||
              blockingDialog?.variant === 'mahjong-dead-warning' ||
              blockingDialog?.variant === 'call-exposure-dead-warning' ||
              blockingDialog?.variant === 'call-meld-size-warning' ||
              blockingDialog?.variant === 'invalid-call-meld-warning' ||
              blockingDialog?.variant === 'discard-dead-warning' ||
              charlestonPassError
                ? 'charleston-error-dialog--menu-shell'
                : '',
              blockingDialog?.variant === 'concealed-call-warning'
                ? 'charleston-error-dialog--concealed-call-warning'
                : '',
              blockingDialog?.variant === 'dead-hand-warning'
                ? 'charleston-error-dialog--dead-hand-warning'
                : '',
              blockingDialog?.variant === 'mahjong-dead-warning'
                ? 'charleston-error-dialog--blocking-neutral charleston-error-dialog--mahjong-dead-warning'
                : '',
              blockingDialog?.variant === 'call-exposure-dead-warning' ||
              blockingDialog?.variant === 'call-meld-size-warning' ||
              blockingDialog?.variant === 'invalid-call-meld-warning' ||
              blockingDialog?.variant === 'discard-dead-warning'
                ? 'charleston-error-dialog--blocking-neutral charleston-error-dialog--mahjong-dead-warning'
                : '',
              blockingDialog?.variant === 'mahjong-blocked'
                ? 'charleston-error-dialog--table charleston-error-dialog--mahjong-blocked'
                : '',
              callRuleError ? 'charleston-error-dialog--call-warning' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={
              blockingDialog?.variant === 'table' ||
              blockingDialog?.variant === 'dead-hand-warning' ||
              blockingDialog?.variant === 'mahjong-dead-warning' ||
              blockingDialog?.variant === 'call-exposure-dead-warning' ||
              blockingDialog?.variant === 'call-meld-size-warning' ||
              blockingDialog?.variant === 'invalid-call-meld-warning' ||
              blockingDialog?.variant === 'discard-dead-warning' ||
              blockingDialog?.variant === 'concealed-call-warning'
                ? 'game-blocking-error-title'
                : blockingDialog?.variant === 'mahjong-blocked'
                  ? 'mj-blocked-title'
                  : 'game-blocking-error-msg'
            }
            aria-describedby={
              blockingDialog?.variant === 'table' ||
              blockingDialog?.variant === 'dead-hand-warning' ||
              blockingDialog?.variant === 'mahjong-dead-warning' ||
              blockingDialog?.variant === 'call-exposure-dead-warning' ||
              blockingDialog?.variant === 'call-meld-size-warning' ||
              blockingDialog?.variant === 'invalid-call-meld-warning' ||
              blockingDialog?.variant === 'discard-dead-warning' ||
              blockingDialog?.variant === 'concealed-call-warning'
                ? 'game-blocking-error-body'
                : undefined
            }
            onClick={(e) => e.stopPropagation()}
          >
            {blockingDialog?.variant === 'concealed-call-warning' ? (
              <>
                <h2 id="game-blocking-error-title" className="charleston-error-dialog__title">
                  Concealed Hand Reminder
                </h2>
                <p id="game-blocking-error-body" className="charleston-error-dialog__body">
                  Are you sure you want to call?
                </p>
                <div className="charleston-error-dialog__actions charleston-error-dialog__actions--spread">
                  <button
                    type="button"
                    className="btn charleston-error-dialog__rack-action"
                    onClick={(e) => {
                      e.stopPropagation()
                      setBlockingDialog(null)
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn charleston-error-dialog__rack-action"
                    onClick={() => {
                      setBlockingDialog(null)
                      proceedWithCall()
                    }}
                  >
                    Call
                  </button>
                </div>
              </>
            ) : blockingDialog?.variant === 'dead-hand-warning' ? (
              <>
                <h2 id="game-blocking-error-title" className="charleston-error-dialog__title">
                  Dead Hand Warning
                </h2>
                <p id="game-blocking-error-body" className="charleston-error-dialog__body">
                  You do not have tiles to create a valid meld with this call. If you call, your hand
                  will be dead and this game will be over.
                </p>
                <div className="charleston-error-dialog__actions charleston-error-dialog__actions--spread">
                  <button
                    type="button"
                    className="btn charleston-error-dialog__rack-action"
                    onClick={() => {
                      setBlockingDialog(null)
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn charleston-error-dialog__rack-action"
                    onClick={() => {
                      setBlockingDialog(null)
                      pushRound((r) => applyDeadHand(r, 'call-insufficient-meld'))
                    }}
                  >
                    Call (Dead Hand)
                  </button>
                </div>
              </>
            ) : blockingDialog?.variant === 'table' ? (
              <>
                <h2 id="game-blocking-error-title" className="charleston-error-dialog__title">
                  {blockingDialog.title}
                </h2>
                <p id="game-blocking-error-body" className="charleston-error-dialog__body">
                  {blockingDialog.message}
                </p>
                <div className="charleston-error-dialog__actions charleston-error-dialog__actions--center">
                  <button
                    type="button"
                    className="btn charleston-error-dialog__rack-action"
                    onClick={() => {
                      setCharlestonPassError(null)
                      setCallRuleError(null)
                      setBlockingDialog(null)
                    }}
                  >
                    OK
                  </button>
                </div>
              </>
            ) : blockingDialog?.variant === 'mahjong-dead-warning' ? (
              <>
                <h2 id="game-blocking-error-title" className="charleston-error-dialog__title">
                  ⚠️ Not a legal Mah Jongg hand
                </h2>
                <p id="game-blocking-error-body" className="charleston-error-dialog__body">
                  Your tiles do not complete a winning hand on the{' '}
                  <strong>{playableCardShortLabel(committedCardId)}</strong>. Proceeding ends the game with a
                  dead hand.
                </p>
                <div className="charleston-error-dialog__actions charleston-error-dialog__actions--spread">
                  <button
                    type="button"
                    className="btn charleston-error-dialog__rack-action"
                    onClick={() => setBlockingDialog(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn charleston-error-dialog__rack-action"
                    onClick={() => {
                      setBlockingDialog(null)
                      pushRound((r) =>
                        applyDeadHand(r, blockingDialog.deadHandReason),
                      )
                    }}
                  >
                    Proceed (Dead Hand)
                  </button>
                </div>
              </>
            ) : blockingDialog?.variant === 'call-meld-size-warning' ? (
              <>
                <h2 id="game-blocking-error-title" className="charleston-error-dialog__title">
                  ⚠️ Wrong exposure size for the card
                </h2>
                <p id="game-blocking-error-body" className="charleston-error-dialog__body">
                  A pung (3 identical tiles) with this discard does not fit any playable line on the{' '}
                  {playableCardShortLabel(committedCardId)} — including when an earlier exposure used a
                  joker. The closest lines need a{' '}
                  {blockingDialog.neededHandTiles === 3
                    ? 'kong (4 tiles)'
                    : blockingDialog.neededHandTiles === 4
                      ? 'quint (5 tiles)'
                      : 'sextet (6 tiles)'}{' '}
                  here instead. Stage the extra matching tile(s) from your hand, or cancel and pick a
                  different call.
                </p>
                <div className="charleston-error-dialog__actions charleston-error-dialog__actions--spread">
                  <button
                    type="button"
                    className="btn charleston-error-dialog__rack-action"
                    onClick={() => setBlockingDialog(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary charleston-error-dialog__rack-action"
                    onClick={() => {
                      const n = blockingDialog.neededHandTiles
                      setBlockingDialog(null)
                      updateRound((r) =>
                        applyAutoSelectCallTiles(r, n),
                      )
                    }}
                  >
                    {blockingDialog.neededHandTiles === 3
                      ? 'Stage kong (3 tiles)'
                      : blockingDialog.neededHandTiles === 4
                        ? 'Stage quint (4 tiles)'
                        : 'Stage sextet (5 tiles)'}
                  </button>
                  <button
                    type="button"
                    className="btn charleston-error-dialog__rack-action"
                    onClick={() => {
                      setBlockingDialog(null)
                      pushRound((r) => applyCommitStagedCall(r, gameModeRef.current))
                    }}
                  >
                    Expose pung anyway
                  </button>
                </div>
              </>
            ) : blockingDialog?.variant === 'invalid-call-meld-warning' ? (
              <>
                <h2 id="game-blocking-error-title" className="charleston-error-dialog__title">
                  ⚠️ Invalid call meld
                </h2>
                <p id="game-blocking-error-body" className="charleston-error-dialog__body">
                  Your staged tiles do not match the called discard. A call meld must be the same
                  tile as the discard — jokers may substitute, but other tiles cannot. Cancel to
                  fix your selection, or proceed and your hand will be dead.
                </p>
                <div className="charleston-error-dialog__actions charleston-error-dialog__actions--spread">
                  <button
                    type="button"
                    className="btn charleston-error-dialog__rack-action"
                    onClick={() => setBlockingDialog(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn charleston-error-dialog__rack-action"
                    onClick={() => {
                      setBlockingDialog(null)
                      pushRound((r) => applyDeadHand(r, 'invalid-call-meld'))
                    }}
                  >
                    Proceed (Dead Hand)
                  </button>
                </div>
              </>
            ) : blockingDialog?.variant === 'call-exposure-dead-warning' ||
              blockingDialog?.variant === 'discard-dead-warning' ? (
              <>
                <h2 id="game-blocking-error-title" className="charleston-error-dialog__title">
                  ⚠️ This exposure will kill your hand
                </h2>
                <p id="game-blocking-error-body" className="charleston-error-dialog__body">
                  {blockingDialog.variant === 'call-exposure-dead-warning'
                    ? `Calling this tile would expose a meld that does not fit any remaining playable hand on the ${playableCardShortLabel(committedCardId)}. If you proceed, your hand will be officially dead and the game will end immediately.`
                    : `Your current exposures do not fit any remaining playable hand on the ${playableCardShortLabel(committedCardId)}. Proceeding will end the game with a dead hand.`}
                </p>
                <div className="charleston-error-dialog__actions charleston-error-dialog__actions--spread">
                  <button
                    type="button"
                    className="btn charleston-error-dialog__rack-action"
                    onClick={() => setBlockingDialog(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn charleston-error-dialog__rack-action"
                    onClick={() => {
                      setBlockingDialog(null)
                      pushRound((r) =>
                        applyDeadHand(
                          r,
                          blockingDialog.variant === 'call-exposure-dead-warning'
                            ? 'call-exposure-no-line'
                            : 'discard-no-line',
                        ),
                      )
                    }}
                  >
                    Proceed (Dead Hand)
                  </button>
                </div>
              </>
            ) : blockingDialog?.variant === 'mahjong-blocked' ? (
              <Suspense fallback={null}>
                <IllegalMahjongDialog
                  rankInput={blockingDialog.rankInput}
                  onDismiss={() => {
                    setCharlestonPassError(null)
                    setCallRuleError(null)
                    setBlockingDialog(null)
                  }}
                />
              </Suspense>
            ) : charlestonPassError ? (
              <>
                <p id="game-blocking-error-msg" className="charleston-error-dialog__body">
                  {charlestonPassError}
                </p>
                <div className="charleston-error-dialog__actions charleston-error-dialog__actions--center">
                  <button
                    type="button"
                    className="btn charleston-error-dialog__rack-action"
                    onClick={() => {
                      setCharlestonPassError(null)
                      setCallRuleError(null)
                      setBlockingDialog(null)
                    }}
                  >
                    OK
                  </button>
                </div>
              </>
            ) : (
              <>
                <p id="game-blocking-error-msg" className="charleston-error-dialog__message">
                  {callRuleError ?? blockingDialog?.message}
                </p>
                <div className="charleston-error-dialog__actions charleston-error-dialog__actions--center">
                  <button
                    type="button"
                    className="btn btn--primary charleston-error-dialog__rack-action"
                    onClick={() => {
                      setCharlestonPassError(null)
                      setCallRuleError(null)
                      setBlockingDialog(null)
                    }}
                  >
                    OK
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
      {mainPhase === 'dead-hand' ? (
        <div className="dead-hand-overlay" role="dialog" aria-modal="true" aria-labelledby="dead-hand-title">
          <div className="dead-hand-dialog" onClick={(e) => e.stopPropagation()}>
            <h2 id="dead-hand-title" className="dead-hand-dialog__title">
              <span className="dead-hand-dialog__title-text">
                <span className="dead-hand-dialog__skull" aria-hidden="true">💀</span>
                Dead Hand
              </span>
            </h2>
            <p className="dead-hand-dialog__body">
              {deadHandExplanation(round.deadHandReason, playableCardShortLabel(committedCardId))}
            </p>
            <div className="dead-hand-dialog__actions">
              <button
                type="button"
                className="btn charleston-error-dialog__rack-action"
                onClick={newHand}
              >
                New Game
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {previewWinHandActive ? (
        <div
          className="mahjong-win-confetti-preview-bar"
          role="region"
          aria-label="Win hand preview controls"
        >
          <button
            type="button"
            className="btn btn--primary rack-bottom-tile-cell wall-game-dialog__action-btn mahjong-win-confetti-preview-bar__btn"
            onClick={() => {
              setMahjongWinReviewing(false)
              setMahjongWinDialogShown(false)
              setPreviewWinHandBurst((n) => n + 1)
            }}
          >
            Replay
          </button>
          <button
            type="button"
            className="btn btn--primary rack-bottom-tile-cell wall-game-dialog__action-btn mahjong-win-confetti-preview-bar__btn"
            onClick={() => {
              const next = new URLSearchParams(location.search)
              next.delete('previewWinHand')
              const qs = next.toString()
              navigate({ pathname: location.pathname, search: qs ? `?${qs}` : '' }, { replace: true })
            }}
          >
            Close
          </button>
        </div>
      ) : null}
      {previewEndDialogActive ? (
        <>
          <div
            key={`end-preview-${previewEndKind}-${previewEndBurst}`}
            className="wall-game-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="end-dialog-preview-title"
          >
            <WallGameDialogPanel
              className="wall-game-dialog--wall-seats"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="end-dialog-preview-title" className="wall-game-dialog__title">
                {previewEndKind === 'wall' ? 'Wall Game' : 'Mah Jongg'}
              </h2>
              <p className="wall-game-dialog__intro">
                {previewEndKind === 'wall'
                  ? 'The wall ran out — no one drew a winning tile.'
                  : 'Bot 1 (West) wins — preview only, not a real loss.'}
              </p>
            </WallGameDialogPanel>
          </div>
          <div
            className="mahjong-win-confetti-preview-bar"
            role="region"
            aria-label="End dialog preview controls"
          >
            <button
              type="button"
              className="btn btn--primary rack-bottom-tile-cell wall-game-dialog__action-btn mahjong-win-confetti-preview-bar__btn"
              aria-pressed={previewEndKind === 'wall'}
              onClick={() => {
                setPreviewEndKind('wall')
                setPreviewEndBurst((n) => n + 1)
              }}
            >
              Wall
            </button>
            <button
              type="button"
              className="btn btn--primary rack-bottom-tile-cell wall-game-dialog__action-btn mahjong-win-confetti-preview-bar__btn"
              aria-pressed={previewEndKind === 'bot'}
              onClick={() => {
                setPreviewEndKind('bot')
                setPreviewEndBurst((n) => n + 1)
              }}
            >
              Bot
            </button>
            <button
              type="button"
              className="btn btn--primary rack-bottom-tile-cell wall-game-dialog__action-btn mahjong-win-confetti-preview-bar__btn"
              onClick={() => setPreviewEndBurst((n) => n + 1)}
            >
              Replay
            </button>
            <button
              type="button"
              className="btn btn--primary rack-bottom-tile-cell wall-game-dialog__action-btn mahjong-win-confetti-preview-bar__btn"
              onClick={() => {
                const next = new URLSearchParams(location.search)
                next.delete('previewEndDialog')
                const qs = next.toString()
                navigate({ pathname: location.pathname, search: qs ? `?${qs}` : '' }, { replace: true })
              }}
            >
              Close
            </button>
          </div>
        </>
      ) : null}
      {mainPhase === 'wall-game' && !wallGameReviewing ? (
        <div className="wall-game-overlay" role="dialog" aria-modal="true" aria-labelledby="wall-game-title">
          <WallGameDialogPanel
            className="wall-game-dialog--wall-seats"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="wall-game-title" className="wall-game-dialog__title">Wall Game</h2>
            <p className="wall-game-dialog__intro">
              The wall ran out — no one drew a winning tile.
            </p>
            {postGameWallGameReview ? (
              <div className="wall-game-dialog__review mahjong-win__bots-review" aria-labelledby="wall-game-title">
                <ul className="mahjong-win__bots-review-list">
                  {postGameWallGameReview.rows[0] ? (
                    <li key={postGameWallGameReview.rows[0].label} className="mahjong-win__bots-review-card">
                      <PostGameLoserRackRow
                        rowId={`wall-${postGameWallGameReview.rows[0].label}`}
                        label={postGameWallGameReview.rows[0].label}
                        bestTilesAway={postGameWallGameReview.rows[0].bestTilesAway}
                        linesAtMin={postGameWallGameReview.rows[0].linesAtMin}
                        rankInput={postGameWallGameReview.rows[0].rankInput}
                        showTiedLinePicker={postGameWallGameReview.rows[0].linesAtMin.length > 1}
                        cardVariant="wrapped"
                        trailingLabel="none"
                        playerSeatFocus
                      />
                    </li>
                  ) : null}
                  {postGameWallGameReview.rows.slice(1).map((row) => (
                    <li key={row.label} className="mahjong-win__bots-review-card">
                      <PostGameLoserRackRow
                        rowId={`wall-${row.label}`}
                        label={row.label}
                        bestTilesAway={row.bestTilesAway}
                        linesAtMin={row.linesAtMin}
                        rankInput={row.rankInput}
                        showTiedLinePicker={row.linesAtMin.length > 1}
                        cardVariant="wrapped"
                        trailingLabel="none"
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="wall-game-dialog__actions">
              <button
                type="button"
                className="btn btn--primary rack-bottom-tile-cell wall-game-dialog__action-btn"
                onClick={() => { setWallGameReviewing(true); appMenuOpenApiRef.current.setMenuOpen(true) }}
              >
                Menu
              </button>
              <button type="button" className="btn btn--primary rack-bottom-tile-cell wall-game-dialog__action-btn" onClick={newHand}>
                New Game
              </button>
              <button
                type="button"
                className="btn btn--primary rack-bottom-tile-cell wall-game-dialog__action-btn"
                onClick={() => setWallGameReviewing(true)}
              >
                Review
              </button>
              <button type="button" className="btn btn--primary rack-bottom-tile-cell wall-game-dialog__action-btn" onClick={replayHand}>
                Replay
              </button>
            </div>
          </WallGameDialogPanel>
        </div>
      ) : null}
      {mahjongWinDialogShown ? (
        <div
          key={previewWinHandActive ? `mj-win-preview-${previewWinHandBurst}` : 'mj-win'}
          className="wall-game-overlay wall-game-overlay--mahjong-win-enter"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mj-win-title"
        >
          <WallGameDialogPanel
            className="wall-game-dialog--wall-seats"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="mj-win-title" className="wall-game-dialog__title wall-game-dialog__title--mahjong-win">
              Mah Jongg!
            </h2>
            <p className="wall-game-dialog__intro">
              {playerWinIntro}
            </p>
            {postGameBotReview ? (
              <div className="wall-game-dialog__review mahjong-win__bots-review" aria-labelledby="mj-win-title">
                <ul className="mahjong-win__bots-review-list">
                  {postGameBotReview[0] ? (
                    <li key={postGameBotReview[0].label} className="mahjong-win__bots-review-card">
                      <PostGameLoserRackRow
                        rowId={`mj-win-${postGameBotReview[0].label}`}
                        label={postGameBotReview[0].label}
                        bestTilesAway={postGameBotReview[0].bestTilesAway}
                        linesAtMin={postGameBotReview[0].linesAtMin}
                        rankInput={postGameBotReview[0].rankInput}
                        showTiedLinePicker={postGameBotReview[0].linesAtMin.length > 1}
                        cardVariant="wrapped"
                        trailingLabel="none"
                        playerSeatFocus
                      />
                    </li>
                  ) : null}
                  {postGameBotReview.slice(1).map((row) => (
                    <li key={row.label} className="mahjong-win__bots-review-card">
                      <PostGameLoserRackRow
                        rowId={`mj-win-${row.label}`}
                        label={row.label}
                        bestTilesAway={row.bestTilesAway}
                        linesAtMin={row.linesAtMin}
                        rankInput={row.rankInput}
                        showTiedLinePicker={row.linesAtMin.length > 1}
                        cardVariant="wrapped"
                        trailingLabel="none"
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="wall-game-dialog__actions">
              <button
                type="button"
                className="btn btn--primary rack-bottom-tile-cell wall-game-dialog__action-btn"
                onClick={() => { setMahjongWinReviewing(true); appMenuOpenApiRef.current.setMenuOpen(true) }}
              >
                Menu
              </button>
              <button type="button" className="btn btn--primary rack-bottom-tile-cell wall-game-dialog__action-btn" onClick={newHand}>
                New Game
              </button>
              <button
                type="button"
                className="btn btn--primary rack-bottom-tile-cell wall-game-dialog__action-btn"
                onClick={() => setMahjongWinReviewing(true)}
              >
                Review
              </button>
              <button type="button" className="btn btn--primary rack-bottom-tile-cell wall-game-dialog__action-btn" onClick={replayHand}>
                Replay
              </button>
            </div>
          </WallGameDialogPanel>
        </div>
      ) : null}
      {charlestonDone && mainPhase === 'bot-mahjong' && postGameBotMahjongReview && !botMahjongWinReviewing && (
        <div className="wall-game-overlay" role="dialog" aria-modal="true" aria-labelledby="bot-mj-win-title">
          <WallGameDialogPanel
            className="wall-game-dialog--wall-seats"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="bot-mj-win-title" className="wall-game-dialog__title">
              Mah Jongg
            </h2>
            <p className="wall-game-dialog__intro">
              {postGameBotMahjongReview.winDescription}
            </p>
            <div className="wall-game-dialog__review mahjong-win__bots-review" aria-labelledby="bot-mj-win-title">
              <ul className="mahjong-win__bots-review-list">
                <li key={postGameBotMahjongReview.winnerRow.label} className="mahjong-win__bots-review-card">
                  <PostGameLoserRackRow
                    rowId={`bot-mj-${postGameBotMahjongReview.winnerRow.label}`}
                    label={postGameBotMahjongReview.winnerRow.label}
                    bestTilesAway={postGameBotMahjongReview.winnerRow.bestTilesAway}
                    linesAtMin={postGameBotMahjongReview.winnerRow.linesAtMin}
                    rankInput={postGameBotMahjongReview.winnerRow.rankInput}
                    showTiedLinePicker={postGameBotMahjongReview.winnerRow.linesAtMin.length > 1}
                    cardVariant="wrapped"
                    trailingLabel="none"
                    playerSeatFocus
                  />
                </li>
                {postGameBotMahjongReview.loserRows.map((row) => (
                  <li key={row.label} className="mahjong-win__bots-review-card">
                    <PostGameLoserRackRow
                      rowId={`bot-mj-${row.label}`}
                      label={row.label}
                      bestTilesAway={row.bestTilesAway}
                      linesAtMin={row.linesAtMin}
                      rankInput={row.rankInput}
                      showTiedLinePicker={row.linesAtMin.length > 1}
                      cardVariant="wrapped"
                      trailingLabel="none"
                    />
                  </li>
                ))}
              </ul>
            </div>
            <div className="wall-game-dialog__actions">
              <button
                type="button"
                className="btn btn--primary rack-bottom-tile-cell wall-game-dialog__action-btn"
                onClick={() => { setBotMahjongWinReviewing(true); appMenuOpenApiRef.current.setMenuOpen(true) }}
              >
                Menu
              </button>
              <button type="button" className="btn btn--primary rack-bottom-tile-cell wall-game-dialog__action-btn" onClick={newHand}>
                New Game
              </button>
              <button
                type="button"
                className="btn btn--primary rack-bottom-tile-cell wall-game-dialog__action-btn"
                onClick={() => setBotMahjongWinReviewing(true)}
              >
                Review
              </button>
              <button type="button" className="btn btn--primary rack-bottom-tile-cell wall-game-dialog__action-btn" onClick={replayHand}>
                Replay
              </button>
            </div>
          </WallGameDialogPanel>
        </div>
      )}
      <PlaySurface
        animationsEnabled={animationsEnabled}
        jokerSwapHintEnabled={jokerSwapHintEnabled}
        jokerSwapHintBounceDelayMs={jokerSwapHintBounceDelayMs}
        jokerSwapHandHintSingleBounce={jokerSwapHandHintSingleBounce}
        botHandsIdentifierEnabled={botHandsIdentifierEnabled}
        botHandsIdentifierFocusSeat={botHandsIdentifierFocusSeat}
        onBotExposureRowClick={onBotExposureRowClick}
        mahjongWinGlyphLit={mahjongWinGlyphLit}
        charlestonDone={charlestonDone}
        mainPhase={mainPhase}
        charlestonPhase={charlestonPhase}
        showPlaySplitRow={showPlaySplitRow}
        displayedDiscardPile={displayedDiscardPile}
        botExposures={botExposures}
        postGameBotReviewRacks={postGameBotTableReviewRacks}
        activeBotIndex={activeBotIndex}
        botTurnBannerDiscarderBotIndex={botTurnBanner?.discarderBotIndex ?? null}
        jokerSwapUiActive={jokerSwapUiActive}
        blankTilesEnabled={blankTilesEnabled}
        botSlotSeats={botSlotSeats}
        handPanelRef={handPanelRef}
        topDiscardTrackerPanelRef={topDiscardTrackerPanelRef}
        eastExposureRackTopRef={eastExposureRackTopRef}
        playerHandRackBottomRef={playerHandRackBottomRef}
        discardTrackerPanelRef={discardTrackerPanelRef}
        discardPileScrollElRef={discardPileScrollElRef}
        menuContainerRef={menuContainerRef}
        handPanelCqwFrozenRef={handPanelCqwFrozenRef}
        refreshHandPanelCqwRef={refreshHandPanelCqwRef}
        dndApiRef={playSurfaceDnDApiRef}
        playerSeat={playerSeat}
        seatLabel={playSurfaceSeatLabel}
        hasPlayerExposures={playerExposureMelds.length > 0}
        hand={hand}
        wall={wall}
        openingWallTileCount={openingWallTileCount}
        selectedHandTileId={selectedHandTileId}
        drawnTileId={drawnTileId}
        passSlots={passSlots}
        pendingEastDiscardTile={pendingEastDiscardTile}
        stagedCallTileIds={stagedCallTileIds}
        eastExposures={eastExposures}
        coach={playSurfaceCoach}
        rackChrome={playSurfaceRackChrome}
        actionBar={playSurfaceActionBar}
        activeBotDiscard={activeBotDiscard}
        incomingBotDiscardFlyFrom={incomingBotDiscardFlyFrom}
        passReady={passReady}
        suggestedHandsPopup={suggestedHandsPopup}
        pushRound={pushRound}
        updateRound={updateRound}
        setPendingJokerSwapTileId={setPendingJokerSwapTileId}
        setCharlestonPassError={setCharlestonPassError}
        applyToggleStagedCallTile={applyToggleStagedCallTile}
        applyEastNaturalForExposedJoker={applyEastNaturalForExposedJoker}
        onHandTileActivate={onHandTileActivate}
        sortHand={sortHand}
        newHand={newHand}
        declareMahjong={declareMahjong}
        onSuggestedTilesButtonClick={onSuggestedTilesButtonClick}
        onSuggestedTilesButtonPointerDown={onSuggestedTilesButtonPointerDown}
        onSuggestedTilesButtonPointerUpOrLeave={onSuggestedTilesButtonPointerUpOrLeave}
        onCharlestonPassButtonClick={onCharlestonPassButtonClick}
        undoAction={undoAction}
        executeSwapFromSlot={executeSwapFromSlot}
        initiateCall={initiateCall}
        commitStagedCall={commitStagedCall}
        commitEastDiscard={commitEastDiscard}
        skipBotDiscard={skipBotDiscard}
      />
    </div>
    {rackCheckerOpen ? (
      <RackCheckerPage
        overlay
        onClose={() => {
          setRackCheckerOpen(false)
          setOpenMenuToLobby(true)
          appMenuOpenApiRef.current.setMenuOpen(true)
        }}
      />
    ) : null}
    </SuggestedHandsTrayProvider>
    </TileGraphicsProvider>
    </AppMenuOpenProvider>
  )
}
