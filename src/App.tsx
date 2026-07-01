import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'
import { flushSync } from 'react-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  useDndContext,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  americanDeckTileCount,
  BLANK_TILE_COUNT_OPTIONS,
  BLANK_TILE_DEF,
  buildAmericanDeck,
  dealOpeningFour,
  DEFAULT_BLANK_TILE_COUNT,
  isBlankTileCount,
  shuffle,
  STANDARD_JOKER_COUNT,
  TEN_JOKERS_COUNT,
} from './mahjong/deck'
import type { BlankTileCount } from './mahjong/deck'
import type { ClaimType, DiscardEntry, EastExposure, Seat, TileDef, TileInstance } from './mahjong/types'
import { formatMahjongWinDescription, tileAriaLabel, tileSuitRackWord } from './mahjong/labels'
import {
  findFocusedPatternDeadCause,
  type DeadCauseHint,
} from './mahjong/deadCauseHint'
import {
  addDeadHintNeed,
  copyDeadHintNeeds,
  deadHintDefKey,
  deadHintGroupNeedVariants,
  patternNeedVariantIsSatisfiable,
  type DeadHintNeedMap,
} from './mahjong/deadHintVariants'
import {
  countDiscardEntriesMatchingDef,
  findExactMatches,
  sortTiles,
  tileDefsEqual,
  type SortMode,
} from './mahjong/tileUtils'
import {
  PASS_BOX_ID,
  compactPassSlotsToRight,
  firstEmptyPassSlotIndex,
  passDropIndex,
  reorderPassSlots,
  type PassSlots,
} from './mahjong/passTargets'
import {
  applyCharlestonExchange,
  charlestonAllowsBlind,
  charlestonMahjongButtonPhase,
  charlestonPassBlockedMessage,
  charlestonPassDirections,
  charlestonPassEligible,
  charlestonPassButtonLabel,
  charlestonPassStripInstructionAria,
  charlestonRackRoundTitle,
  nextCharlestonPhase,
  type CharlestonPhase,
  type FourHands,
} from './mahjong/charleston'
import type { HandTileFlyIn, HandTileFlyInFrom } from './mahjong/handTileFlyIn'
import { handTileFlyInFromBotSeat, handTileFlyInFromCharlestonPhase } from './mahjong/handTileFlyIn'
import { SortableHand } from './components/SortableHand'
import { PassStrip, type PassStripFlyOutFrom } from './components/PassStrip'
import { HandBank, HAND_BANK_ID } from './components/HandBank'
import { TileFace } from './components/TileFace'
import { ExposureRack } from './components/ExposureRack'
import {
  PLAYABLE_CARD_IDS,
  PLAYABLE_CARD_LABEL,
  type PlayableCardId,
  cardSectionOrderFromPatterns,
  patternsForCard,
  playableCardShortLabel,
  readPlayableCardFromStorage,
  writePlayableCardToStorage,
} from './card/cardCatalog'
import type { PatternGroup, PracticePattern } from './card/practicePatterns'
import { getActiveCardPatterns, setActiveCardPatterns } from './card/activeCardPatternsScope'
import {
  buildPinnedPatternsFromFocusKey,
  computeRackPatternHighlightIds,
  computeBlankExchangeFills,
  greedyPatternMatchDetail,
  jokerSwapHandHintUsesSingleBounceIteration,
  rankSuggestedHands,
  focusKeyForSuggestedHandLine,
  focusKeyPatternId,
  sortHandForSuggestedPattern,
  sortFullRackTilesForPattern,
  suggestedHandsTiedAtBest,
  summarizeRackTowardWin,
  computeSuggestedDiscardNeedHighlightIds,
  computeSuggestedDiscardTrackerNeedDefs,
  computeBotExposureSuggestedBestIds,
  findInfeasibleBestIds,
  buildUnavailableTileDefCounts,
  type RankSuggestedHandsInput,
} from './analysis/suggestedHands'
import { tileInstancesWithClaimMeldJokersResolved } from './analysis/eastExposurePatternFit'
import { CharlestonPassStripInstructionMain } from './components/CharlestonPassStripInstructionLabel'
import { PostGameLoserRackRow } from './components/PostGameLoserRackRow'
import { IllegalMahjongDialog } from './components/IllegalMahjongDialog'
import { SuggestedHandsPanel } from './components/SuggestedHandsPanel'
import { WallTilesRemainCell } from './components/WallTilesRemainCell'
import { RackLogoWatermark } from './components/RackLogoWatermark'
import {
  HIDE_CONCEALED_HANDS_STORAGE_KEY,
  readHideConcealedHandsFromStorage,
  writeHideConcealedHandsToStorage,
  readUncheckedSectionsFromStorage,
  writeUncheckedSectionsToStorage,
  suggestedHandsFilterMenuColumns,
  SUGGESTED_HANDS_UNCHECKED_SECTIONS_KEY,
  suggestedHandSectionMenuLabel,
  suggestedHandSectionsAvailableWithClaimMelds,
  isSuggestedHandSectionFilterEnabled,
  toggledSuggestedHandSectionFilter,
} from './suggestedHands/filterSettings'
import type { BotExposure, BotSeat } from './analysis/types'
import {
  BOT_DIFFICULTIES,
  type BotDifficulty,
  chooseBotCharlestonPass,
  chooseBotDiscard,
  botCallStrategicProbability,
  tryBotBlankExchange,
  DEFAULT_BOT_DIFFICULTY,
  isBotDifficulty,
  type BotRankContext,
} from './analysis/botAI'
import {
  getCallInitiateBlockMessage,
  getCallCapacityFlags,
  maxOpenClaimHandTiles,
  claimTypeForHandTilesFromDiscard,
  BLOCKING_TITLE_SWAP_ERROR,
  hasLegalMahjongOnBotDiscard,
  isMahjongWinOnLiveBotDiscard,
  isSelfDrawMahjongWin,
  MSG_CALL_DEAD_JOKER,
  MSG_CALL_INSUFFICIENT_TILES,
  MSG_MAHJONG_DURING_CHARLESTON,
  MSG_DISCARD_BLANK_USE_SWAP,
  MSG_SWAP_BLANK_NO_DISCARDS,
  MSG_SWAP_NO_EXPOSED_JOKERS,
  MSG_SWAP_NO_LEGAL_FOR_TILE,
  MSG_SWAP_NOTHING_AVAILABLE,
  MSG_SWAP_PICK_TILE_FIRST,
  type CallValidationRoundSlice,
} from './mahjong/callValidation'
import { deadHandExplanation, type DeadHandReason } from './mahjong/deadHandReason'
import {
  BLANK_EXCHANGE_DROP_ID,
  CALL_INITIATE_FIRST_SLOT_ID,
  EAST_DISCARD_STAGING_ID,
  incomingBotDiscardDragId,
  JOKER_SWAP_STAGING_ID,
  parseIncomingBotDiscardDragId,
} from './mahjong/jokerSwapIds'
import { discardedDefsForBlankExchange } from './mahjong/blankExchange'
import {
  botExposureSwapDropId,
  botSeatSwapDropId,
  eastExposureSwapDropId,
  EAST_SEAT_SWAP_ID,
  findJokerSwapTargetAtEastExposure,
  findJokerSwapTargetInEastRack,
  findNextBotJokerSwapTarget,
  findNextJokerSwapTarget,
  collectHandTileIdsSwappableForJokers,
  collectSwappableJokerTileIds,
  representativeDefInExposedMeld,
  parseBotSeatSwapDropId,
  parseBotExposureSwapDropId,
  parseEastExposureSwapDropId,
  type JokerSwapTargetPick,
} from './mahjong/jokerSwapTarget'
import {
  openClaimMeldsFitSomePracticeLine,
  reorderEastExposuresToPatternGroupOrder,
} from './analysis/eastExposurePatternFit'
import logicLogoSrc from './assets/logic-logo.svg?url'
import mahjLogoSrc from './assets/mahj-logo.svg?url'
import {
  DEFAULT_TILE_GRAPHICS,
  isTileGraphics,
  MENU_TILE_GRAPHICS,
  TILE_GRAPHICS_LABEL,
  type TileGraphics,
} from './tiles/tileGraphics'
import { TileGraphicsProvider } from './tiles/TileGraphicsContext'
import './styles/style.css'

/** Conservative floor used while the suggested-hands sheet is remeasured during orientation changes. */
const SUGGESTED_DISCARD_OVERLAY_MIN_SHEET_PX = 112

/** Stable empty list so blank-exchange inputs keep a constant identity when no blank is held. */
const EMPTY_TILE_DEF_LIST: readonly TileDef[] = []

/** Wall-heat gradient: flat green at opening count; slides toward red after the first tile leaves the wall. */
function wallRemainHeatStyle(
  wallLen: number,
  openingWallLen: number,
): CSSProperties | undefined {
  if (wallLen >= openingWallLen || wallLen === 0 || openingWallLen <= 1) return undefined
  return {
    '--wall-t': String(Math.max(0, Math.min(1, wallLen / (openingWallLen - 1)))),
  } as CSSProperties
}

const BOT_DIFFICULTY_LABEL: Record<BotDifficulty, string> = {
  easy: 'Novice',
  normal: 'Advanced',
  hard: 'Expert',
}

const LS_KEY_BOT_WINS = 'mahjlogic.botWinsEnabled'

const BOT_WINS_LABEL = 'Bot wins'
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
const LS_KEY_DEAD_HAND_WARNINGS = 'mahjlogic.deadHandWarningsEnabled'
const DEAD_HAND_WARNINGS_LABEL = 'Dead hand warnings'
/** Highlight the Mah Jongg rack button when a declaration would succeed (self-draw or on a live discard). */
const LS_KEY_MAHJONG_HINT = 'mahjlogic.mahjongHintEnabled'
const MAHJONG_HINT_LABEL = 'Mah Jongg hint'
const LS_KEY_DEAD_TILE_HINT = 'mahjlogic.deadTileHintEnabled'
const DEAD_TILE_HINT_LABEL = 'Dead tile(s) hint'
const LS_KEY_CONCEALED_HAND_REMINDER = 'mahjlogic.concealedHandReminderEnabled'

const LS_KEY_BLANK_TILES = 'mahjlogic.blankTilesEnabled'
const LS_KEY_BLANK_TILE_COUNT = 'mahjlogic.blankTileCount'
const LS_KEY_TEN_JOKERS = 'mahjlogic.tenJokersEnabled'
const BLANK_TILES_LABEL = 'Blank tiles'
const TEN_JOKERS_LABEL = '10 Jokers'
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

function readDeadTileHintFromStorage(): boolean {
  try {
    const v = localStorage.getItem(LS_KEY_DEAD_TILE_HINT)
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

/**
 * east-discard      East has 14 tiles and must discard one.
 * bot-turn          A bot just drew and discarded; player can Call (claim discard), declare Mah Jongg, or skip.
 * call-staging      Player tapped Call; called tile is staged in the exposure rack; player chooses meld tiles.
 * mahjong-declared  Player declared Mah Jongg on a bot's discard.
 * bot-mahjong       A bot won by self-draw; game over, show bot win screen.
 */
type MainPhase = 'east-discard' | 'bot-turn' | 'call-staging' | 'mahjong-declared' | 'dead-hand' | 'wall-game' | 'bot-mahjong'

/**
 * Fixed full-screen overlay: `card` matches Charleston/call; `table` is felt + gold for swap;
 * `mahjong-blocked` is the coach modal for illegal Mah Jongg on a discard.
 */
type GameBlockingDialog =
  | { variant: 'card'; message: string }
  | { variant: 'table'; title: string; message: string }
  | { variant: 'mahjong-blocked'; rankInput: RankSuggestedHandsInput }
  | { variant: 'dead-hand-warning' }
  | { variant: 'mahjong-dead-warning'; rankInput: RankSuggestedHandsInput; deadHandReason: DeadHandReason }
  | { variant: 'call-exposure-dead-warning'; rankInput: RankSuggestedHandsInput }
  | {
      variant: 'call-meld-size-warning'
      rankInput: RankSuggestedHandsInput
      neededHandTiles: 3 | 4 | 5
    }
  | { variant: 'discard-dead-warning'; rankInput: RankSuggestedHandsInput }
  | { variant: 'different-card-requires-new-game'; pendingCardId: PlayableCardId }
  | { variant: 'concealed-call-warning' }

const CALL_STAGING_DROP_ID = 'call-staging-meld-drop'
const EAST_EXPOSURE_MELD_SORT_ID_PREFIX = 'east-exposure-meld:'

function eastExposureMeldSortId(exposureIdx: number): string {
  return `${EAST_EXPOSURE_MELD_SORT_ID_PREFIX}${exposureIdx}`
}

function parseEastExposureMeldSortId(id: string): number | null {
  if (!id.startsWith(EAST_EXPOSURE_MELD_SORT_ID_PREFIX)) return null
  const raw = id.slice(EAST_EXPOSURE_MELD_SORT_ID_PREFIX.length)
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null
}

/** Rack drop boxes highlight and accept drops when the dragged tile overlaps them, not the pointer. */
function collisionHitsForTileOverlappingZones(
  args: Parameters<CollisionDetection>[0],
  zoneIds: readonly string[],
): ReturnType<CollisionDetection> {
  const containers = args.droppableContainers.filter((c) => zoneIds.includes(String(c.id)))
  if (containers.length === 0) return []
  return rectIntersection({ ...args, droppableContainers: containers })
}

function pointerOverCallInitiateTarget(pointer: { x: number; y: number }): boolean {
  const el = document.querySelector<HTMLElement>('.exposure-rack__call-initiate-target')
  if (!el) return false
  const rect = el.getBoundingClientRect()
  if (rect.width < 1 || rect.height < 1) return false
  return (
    pointer.x >= rect.left &&
    pointer.x <= rect.left + rect.width &&
    pointer.y >= rect.top &&
    pointer.y <= rect.top + rect.height
  )
}

/** True when the pointer is anywhere over the top discard tracker section (blank-exchange drop). */
function pointerOverBlankExchangeTarget(pointer: { x: number; y: number }): boolean {
  const el = document.querySelector<HTMLElement>(
    '.blank-exchange-dropzone, .panel--discard-tracker--top',
  )
  if (!el) return false
  const rect = el.getBoundingClientRect()
  if (rect.width < 1 || rect.height < 1) return false
  return (
    pointer.x >= rect.left &&
    pointer.x <= rect.left + rect.width &&
    pointer.y >= rect.top &&
    pointer.y <= rect.top + rect.height
  )
}

function pointerOverPassBoxTarget(pointer: { x: number; y: number }): boolean {
  const el = document.querySelector<HTMLElement>('.pass-strip-tail__inner, .pass-box')
  if (!el) return false
  const rect = el.getBoundingClientRect()
  if (rect.width < 1 || rect.height < 1) return false
  return (
    pointer.x >= rect.left &&
    pointer.x <= rect.left + rect.width &&
    pointer.y >= rect.top &&
    pointer.y <= rect.top + rect.height
  )
}

function isActiveBotDiscardDrag(
  dragId: string,
  activeBotDiscard: TileInstance | null,
): boolean {
  const tileId = parseIncomingBotDiscardDragId(dragId)
  return tileId != null && tileId === activeBotDiscard?.id
}

/**
 * Call drop target — only mounted while the opponent discard is being dragged out of its slot.
 * Teal box chrome matches Charleston / discard staging.
 */
function CallInitiateFirstEmptyTarget() {
  const { setNodeRef, isOver } = useDroppable({ id: CALL_INITIATE_FIRST_SLOT_ID })
  return (
    <div
      ref={setNodeRef}
      role="listitem"
      aria-label="Call — drop the discard here to start a claim"
      className={[
        'exposure-rack__slot',
        'exposure-rack__slot--empty',
        'exposure-rack__call-initiate-target',
        'exposure-rack__call-initiate-target--near',
        isOver ? 'exposure-rack__call-initiate-target--over' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    />
  )
}

/** Droppable wrapper around the exposure rack during call-staging — drop a tile to add it to the staged meld. */
function StagingMeldDropZone({
  active,
  children,
}: {
  active: boolean
  children: ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: CALL_STAGING_DROP_ID, disabled: !active })
  return (
    <div
      ref={setNodeRef}
      className={['staging-meld-drop-zone', isOver ? 'staging-meld-drop-zone--over' : '']
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  )
}

/** Invisible drop target: whole discard panel (same box as discards — no swap-only chrome). */
function DiscardPileDropZone({
  swapDropActive,
  children,
  onContainerNode,
}: {
  swapDropActive: boolean
  children: ReactNode
  onContainerNode?: (node: HTMLDivElement | null) => void
}) {
  const { setNodeRef } = useDroppable({
    id: JOKER_SWAP_STAGING_ID,
    disabled: !swapDropActive,
  })
  return (
    <div
      ref={(node) => {
        setNodeRef(node)
        onContainerNode?.(node)
      }}
      className="discard-pile-drop-zone"
    >
      {children}
    </div>
  )
}

/** Whole-opponent-rack drop target: allows joker swap by dropping anywhere in that seat's row. */
function OpponentExposureDropZone({
  seat,
  active,
  showWatermark = true,
  watermarkLabel,
  tag = 'li',
  children,
}: {
  seat: BotSeat
  active: boolean
  showWatermark?: boolean
  /** Compass seat name when `watermarkLabel` is omitted (legacy bot column). */
  watermarkLabel?: string
  tag?: 'li' | 'div'
  children: ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: botSeatSwapDropId(seat),
    disabled: !active,
  })
  const label = watermarkLabel ?? seat
  const Tag = tag
  return (
    <Tag
      ref={setNodeRef}
      className={[
        'app-opponents-rail__cell',
        active ? 'app-opponents-rail__cell--swap-drop' : '',
        isOver ? 'app-opponents-rail__cell--swap-over' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={watermarkLabel ?? undefined}
    >
      {showWatermark ? (
        <span className="bot-exposure-row__watermark" aria-hidden="true">{label}</span>
      ) : null}
      {children}
    </Tag>
  )
}

/** Hand / Charleston action bar: column 2 menu. */
function HandRackMenuAnchor({
  menuOpen,
  onToggle,
  menuContainerRef,
}: {
  menuOpen: boolean
  onToggle: () => void
  menuContainerRef: RefObject<HTMLDivElement | null>
}) {
  return (
    <div
      ref={menuContainerRef}
      className="app-menu-anchor app-menu-anchor--hand-rack rack-bottom-tile-cell rack-bottom-tile-cell--c2"
    >
      <button
        type="button"
        className={[
          'btn btn--rack-neutral app-bottom-center-controls__menu-btn',
          menuOpen ? 'app-bottom-center-controls__menu-btn--open' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label="Menu"
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? 'app-menu-modal' : undefined}
        onClick={onToggle}
      >
        Menu
      </button>
    </div>
  )
}

/** First column of the discard-tracker bot band: compass initial (S / W / N). */
function DiscardTrackerBotSeatLabel({
  seat,
  isActiveTurn = false,
  isCalledThrower = false,
}: {
  seat: BotSeat
  isActiveTurn?: boolean
  isCalledThrower?: boolean
}) {
  const label = seat[0]
  return (
    <div
      className="exposure-rack exposure-rack--discard-tracker-opponent exposure-rack--discard-tracker-prefix exposure-rack--discard-tracker-bot-seat-label"
      role="presentation"
      aria-label={`${seat} seat`}
    >
      <div
        className={[
          'exposure-rack__slot',
          'sorted-discard-tray__slot',
          'sorted-discard-tray__slot--seat-label',
          isActiveTurn ? 'sorted-discard-tray__slot--seat-turn' : '',
          isCalledThrower ? 'sorted-discard-tray__slot--seat-called' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="presentation"
      >
        <span className="sorted-discard-tray__seat-label" aria-hidden>
          {label}
        </span>
      </div>
    </div>
  )
}

/** Discard tray overlay per row: 1 prefix + 14 bot exposure + 13 sorted = 28 content slots (+29 for tile sizing). */
const DISCARD_TRACKER_SLOTS_ACROSS = 29
const DISCARD_TRACKER_BOT_PREFIX_SLOTS = 1
const DISCARD_TRACKER_BOT_ROW_SLOTS = 14
const DISCARD_TRACKER_SORTED_ROW_SLOTS = 13
/**
 * Sorted B/C/D band width in tile-width units: the suit-label chip is 1.75× a tile + 12 rank tiles
 * = 13.75. Used as the popup's `--discard-tracker-slots-across` divisor so the @container sizes
 * tiles to fill the grid almost exactly (an integer 14 left ~half a tile of centered slack each
 * side, which read as the box being too wide). Popup-only; the on-board grid uses 29.
 */
const DISCARD_TRACKER_SORTED_BAND_COLS = 13.75

/** Row 1 of sorted discard: bams 1–9, green dragon (G), North, South. */
const SORTED_DISCARD_ROW1_TILES: readonly TileInstance[] = [
  ...([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((rank) => ({
    id: `sorted-discard-r1-b${rank}`,
    def: { cat: 'suit' as const, suit: 'bam' as const, rank },
  })),
  {
    id: 'sorted-discard-r1-green',
    def: { cat: 'dragon' as const, dragon: 'green' as const },
  },
  {
    id: 'sorted-discard-r1-n',
    def: { cat: 'wind' as const, wind: 'N' },
  },
  {
    id: 'sorted-discard-r1-s',
    def: { cat: 'wind' as const, wind: 'S' },
  },
]

/** Row 2 of sorted discard: dots 1–9, soap (0), East, West. */
const SORTED_DISCARD_ROW2_TILES: readonly TileInstance[] = [
  ...([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((rank) => ({
    id: `sorted-discard-r2-d${rank}`,
    def: { cat: 'suit' as const, suit: 'dot' as const, rank },
  })),
  {
    id: 'sorted-discard-r2-soap',
    def: { cat: 'dragon' as const, dragon: 'soap' as const },
  },
  {
    id: 'sorted-discard-r2-e',
    def: { cat: 'wind' as const, wind: 'E' },
  },
  {
    id: 'sorted-discard-r2-w',
    def: { cat: 'wind' as const, wind: 'W' },
  },
]

/** Row 3 of sorted discard: craks 1–9, red dragon (R), flower (F), blank (B) or joker (J) when blanks off. */
const SORTED_DISCARD_ROW3_TILES: readonly TileInstance[] = [
  ...([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((rank) => ({
    id: `sorted-discard-r3-c${rank}`,
    def: { cat: 'suit' as const, suit: 'crak' as const, rank },
  })),
  {
    id: 'sorted-discard-r3-red',
    def: { cat: 'dragon' as const, dragon: 'red' as const },
  },
  {
    id: 'sorted-discard-r3-f',
    def: { cat: 'flower' as const, flower: 1 },
  },
  {
    id: 'sorted-discard-r3-blank',
    def: BLANK_TILE_DEF,
  },
]

function sortedDiscardTrayTileFaceProps(
  def: TileDef,
  hasBeenDiscarded: boolean,
): {
  compactRankOnly: boolean
  sortedDiscardGlyph: true
  sortedDiscardGlyphCenter: true
  sortedDiscardDotBlue: boolean
  sortedDiscardBamGreen: boolean
  sortedDiscardCrakRed: boolean
} {
  const isDot =
    (def.cat === 'suit' && def.suit === 'dot') ||
    (def.cat === 'dragon' && def.dragon === 'soap')
  const isBam =
    (def.cat === 'suit' && def.suit === 'bam') ||
    (def.cat === 'dragon' && def.dragon === 'green')
  const isCrak =
    (def.cat === 'suit' && def.suit === 'crak') ||
    (def.cat === 'dragon' && def.dragon === 'red')
  return {
    compactRankOnly: def.cat === 'suit',
    sortedDiscardGlyph: true,
    sortedDiscardGlyphCenter: true,
    sortedDiscardDotBlue: hasBeenDiscarded && isDot,
    sortedDiscardBamGreen: hasBeenDiscarded && isBam,
    sortedDiscardCrakRed: hasBeenDiscarded && isCrak,
  }
}

function sortedDiscardTrackerSlotNeedsHighlight(
  def: TileDef,
  needDefs: readonly TileDef[] | null | undefined,
): boolean {
  if (!needDefs || needDefs.length === 0) return false
  return needDefs.some((d) => tileDefsEqual(d, def))
}

function SortedDiscardTrayRow({
  tiles,
  slotCount,
  leadingEmptySlots = 0,
  leadingSuitLabel,
  leadingSuitLabelTone = 'dot',
  trailingGlyphSlots = [],
  ariaLabel,
  discardPile,
  blankTilesEnabled = true,
  suggestedNeedDefs = null,
  onSlotActivate = null,
  pickableDefs = null,
}: {
  tiles: readonly TileInstance[]
  slotCount: number
  leadingEmptySlots?: number
  /** One leading slot with the suit name (BAM, CRK, DOT). */
  leadingSuitLabel?: string
  leadingSuitLabelTone?: 'dot' | 'bam' | 'crak'
  /** Glyph-only slots after `tiles` (no matching discard count). */
  trailingGlyphSlots?: readonly { id: string; label: string; ariaLabel: string }[]
  ariaLabel: string
  discardPile: readonly DiscardEntry[]
  /** When false, the blank tracker slot shows joker (J) instead (blank tiles off in menu). */
  blankTilesEnabled?: boolean
  /** Focused suggested hand: defs still short — inner ring on matching tracker slots. */
  suggestedNeedDefs?: readonly TileDef[] | null
  /** Blank-exchange popup: tap a discarded tile type to redeem the blank for it. */
  onSlotActivate?: ((def: TileDef) => void) | null
  /** Blank-exchange popup: defs eligible to pick (present in the discard pile). */
  pickableDefs?: readonly TileDef[] | null
}) {
  const leadingSlots = (leadingSuitLabel ? 1 : 0) + leadingEmptySlots
  const emptyCount = Math.max(0, slotCount - leadingSlots - tiles.length - trailingGlyphSlots.length)
  return (
    <div
      className="exposure-rack exposure-rack--discard-tracker-opponent exposure-rack--discard-tracker-sorted-row"
      role="list"
      aria-label={ariaLabel}
    >
      {leadingSuitLabel ? (
        <div
          className={[
            'exposure-rack__slot',
            'sorted-discard-tray__slot',
            'sorted-discard-tray__slot--discarded',
            'sorted-discard-tray__slot--suit-label',
            `sorted-discard-tray__slot--suit-label-${leadingSuitLabelTone}`,
          ].join(' ')}
          role="presentation"
          aria-label={`${leadingSuitLabel} suit`}
        >
          <div
            className={[
              'tile-face',
              'tile-face--sorted-discard-glyph',
              'tile-face--sorted-discard-glyph-center',
              leadingSuitLabelTone === 'dot'
                ? 'tile-face--sorted-discard-dot'
                : leadingSuitLabelTone === 'bam'
                  ? 'tile-face--sorted-discard-bam'
                  : 'tile-face--sorted-discard-crak',
            ].join(' ')}
            aria-hidden
          >
            <span
              className={[
                'sorted-discard-tray__suit-label',
                `sorted-discard-tray__suit-label--${leadingSuitLabelTone}`,
              ].join(' ')}
            >
              {leadingSuitLabel}
            </span>
          </div>
        </div>
      ) : null}
      {Array.from({ length: leadingEmptySlots }, (_, i) => (
        <div
          key={`sorted-discard-lead-empty-${i}`}
          className="exposure-rack__slot exposure-rack__slot--empty"
          aria-hidden
        />
      ))}
      {tiles.map((tile) => {
        const isBlankSlot = tile.def.cat === 'blank'
        const blankReplacedByJoker = isBlankSlot && !blankTilesEnabled
        const trackerDef: TileDef = blankReplacedByJoker
          ? { cat: 'joker' }
          : tile.def
        const discardCount = countDiscardEntriesMatchingDef(discardPile, trackerDef)
        const hasBeenDiscarded = discardCount > 0
        const suggestGuideOn = suggestedNeedDefs !== null
        const suggestNeed =
          suggestGuideOn && sortedDiscardTrackerSlotNeedsHighlight(trackerDef, suggestedNeedDefs)
        const suggestDim = suggestGuideOn && !suggestNeed
        const awaitingDiscard = !suggestGuideOn && !hasBeenDiscarded
        const exchangeMode = onSlotActivate !== null
        const isPickable =
          exchangeMode &&
          !blankReplacedByJoker &&
          (pickableDefs?.some((d) => tileDefsEqual(d, trackerDef)) ?? false)
        const isUnpickable = exchangeMode && !isPickable
        return (
          <div
            key={tile.id}
            className={[
              'exposure-rack__slot',
              'sorted-discard-tray__slot',
              isBlankSlot && blankTilesEnabled ? 'sorted-discard-tray__slot--blank' : '',
              hasBeenDiscarded ? 'sorted-discard-tray__slot--discarded' : '',
              awaitingDiscard ? 'sorted-discard-tray__slot--awaiting-discard' : '',
              suggestDim ? 'sorted-discard-tray__slot--suggest-dim' : '',
              suggestNeed ? 'sorted-discard-tray__slot--suggest-need' : '',
              isPickable ? 'sorted-discard-tray__slot--pickable' : '',
              isUnpickable ? 'sorted-discard-tray__slot--unpickable' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            role={isPickable ? 'button' : 'listitem'}
            tabIndex={isPickable ? 0 : undefined}
            onClick={isPickable ? () => onSlotActivate?.(trackerDef) : undefined}
            onKeyDown={
              isPickable
                ? (ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault()
                      onSlotActivate?.(trackerDef)
                    }
                  }
                : undefined
            }
            aria-label={
              isPickable
                ? `Exchange blank for ${tileAriaLabel(trackerDef)}${
                    discardCount > 0 ? `, ${discardCount} discarded` : ''
                  }`
                : suggestNeed
                ? `${tileAriaLabel(trackerDef)}, needed for focused hand${
                    discardCount > 0 ? `, ${discardCount} discarded` : ''
                  }`
                : discardCount > 0
                  ? `${tileAriaLabel(trackerDef)}, ${discardCount} discarded`
                  : tileAriaLabel(trackerDef)
            }
          >
            <TileFace
              def={trackerDef}
              {...sortedDiscardTrayTileFaceProps(trackerDef, hasBeenDiscarded || suggestNeed)}
            />
            <span className="sorted-discard-tray__count" aria-hidden>
              {discardCount > 0 ? discardCount : null}
            </span>
          </div>
        )
      })}
      {trailingGlyphSlots.map((slot) => (
        <div
          key={slot.id}
          className="exposure-rack__slot sorted-discard-tray__slot sorted-discard-tray__slot--blank"
          role="listitem"
          aria-label={slot.ariaLabel}
        >
          <div
            className={[
              'tile-face',
              'tile-face--sorted-discard-glyph',
              'tile-face--sorted-discard-glyph-center',
            ].join(' ')}
            aria-hidden
          >
            <span className="tile-face__glyph">
              <span className="tile-face__glyph-letter">{slot.label}</span>
            </span>
          </div>
        </div>
      ))}
      {Array.from({ length: emptyCount }, (_, i) => (
        <div
          key={`sorted-discard-empty-${i}`}
          className="exposure-rack__slot exposure-rack__slot--empty"
          aria-hidden
        />
      ))}
    </div>
  )
}

/**
 * Wraps the sorted discard tracker so a blank dragged from the rack (your turn) can be dropped
 * anywhere over the tracker boundary. The droppable is only live while `active`.
 */
function BlankExchangeDropZone({
  active,
  children,
}: {
  active: boolean
  children: ReactNode
}) {
  // Mount the droppable only while a blank is in hand-drag (your turn). Mounting it mid-drag — the
  // same pattern as the Call drop target — guarantees dnd-kit measures its rect, so `isOver`
  // (orange outline) and `over` (drop) both fire reliably.
  if (!active) return <>{children}</>
  return <ArmedBlankExchangeDropZone>{children}</ArmedBlankExchangeDropZone>
}

function ArmedBlankExchangeDropZone({ children }: { children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: BLANK_EXCHANGE_DROP_ID })
  return (
    <div
      ref={setNodeRef}
      className={[
        'blank-exchange-dropzone',
        isOver ? 'blank-exchange-dropzone--over' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  )
}

/**
 * The popup is one horizontal band of {@link DISCARD_TRACKER_SORTED_BAND_COLS} slot-columns. We size
 * it relative to whatever the on-board sorted discard band currently measures in this window: the
 * popup band is exactly {@link BLANK_EXCHANGE_POPUP_SCALE}× that width, so the popup always looks the
 * same proportion bigger than the tracker regardless of window/PWA size. The shared
 * `top-exposure-band` @container then sizes every tile to fill the band — just like the on-board
 * tracker. A viewport-fit clamp keeps it from ever overflowing on very small/short screens.
 */
const BLANK_EXCHANGE_POPUP_FACE_GAP = 3
const BLANK_EXCHANGE_POPUP_ROW_GAP = 4
/** Popup band is this multiple of the on-board sorted discard band (≈50% larger). */
const BLANK_EXCHANGE_POPUP_SCALE = 1.5

/** Width the popup grid should take: 1.5× the on-board band, clamped so the 3-row band + Cancel fit. */
function computeBlankExchangePopupBandWidth(): number {
  const panelPad = 48 // panel inline padding + border, both sides
  const cancelReserve = 64 // gap + Cancel button row beneath the band
  const gap = BLANK_EXCHANGE_POPUP_FACE_GAP
  const cols = DISCARD_TRACKER_SORTED_BAND_COLS
  // Largest width that still fits the viewport on both axes (incl. the Cancel row beneath the band).
  const availW = window.innerWidth * 0.94 - panelPad
  const availH = window.innerHeight * 0.92 - panelPad - cancelReserve
  // tileW = (W - (cols-1)*gap) / cols; band height = 3*(tileW*4/3) + 2*rowGap = 4*tileW + 2*rowGap.
  // Solve the widest W whose band height still fits availH so tall layouts never clip vertically.
  const maxWByHeight =
    ((availH - 2 * BLANK_EXCHANGE_POPUP_ROW_GAP) * cols) / 4 + (cols - 1) * gap
  const fitCap = Math.min(availW, maxWByHeight)

  // Preferred: exactly 1.5× the on-board sorted discard band as rendered right now in this window.
  const onboardRow = Array.from(
    document.querySelectorAll('.exposure-rack--discard-tracker-sorted-row'),
  ).find((el) => !el.closest('.blank-exchange-overlay'))
  const onboardW = onboardRow ? onboardRow.getBoundingClientRect().width : 0
  const preferred = onboardW > 1 ? onboardW * BLANK_EXCHANGE_POPUP_SCALE : fitCap

  return Math.max(120, Math.min(preferred, fitCap))
}

/**
 * Centered, enlarged copy of the sorted discard tracker, shown after a blank is dropped on the
 * tracker. It keeps the exact look of the on-board tracker; each already-discarded tile type can
 * be tapped to redeem the blank for it.
 */
function BlankExchangeOverlay({
  discardPile,
  blankTilesEnabled,
  suggestedNeedDefs,
  onPick,
  onCancel,
}: {
  discardPile: readonly DiscardEntry[]
  blankTilesEnabled: boolean
  /** Mirrors the on-board tracker's suggested-hand guide: needed tiles lit, others dimmed. */
  suggestedNeedDefs: readonly TileDef[] | null
  onPick: (def: TileDef) => void
  onCancel: () => void
}) {
  const pickableDefs = useMemo(
    () => discardedDefsForBlankExchange(discardPile),
    [discardPile],
  )
  /** Width handed to the band grid; the `top-exposure-band` @container sizes tiles to fill it. */
  const [bandW, setBandW] = useState<number | null>(null)
  /** Width/height of the action-row Call/Swap button so Cancel matches its shape. */
  const [actionBtnSize, setActionBtnSize] = useState<{ w: number; h: number } | null>(null)
  /** Horizontal shift (px) so the panel centers on the playing area, not the whole viewport. */
  const [centerOffsetX, setCenterOffsetX] = useState(0)

  useLayoutEffect(() => {
    const measure = () => {
      const w = computeBlankExchangePopupBandWidth()
      setBandW((prev) => (prev !== null && Math.abs(prev - w) < 0.5 ? prev : w))

      const actionBtn = document.querySelector(
        '.panel--hand .rack-bottom-bar--main .btn--joker-swap-action.rack-bottom-tile-cell--c9-10',
      )
      if (actionBtn) {
        const r = actionBtn.getBoundingClientRect()
        if (r.width > 1 && r.height > 1) setActionBtnSize({ w: r.width, h: r.height })
      }

      // Center on the main rack / action-button area (shifted right by the device cutout's safe
      // inset) rather than the whole window. Offset = play-area center − viewport center.
      const playArea =
        document.querySelector('.panel--hand') ??
        document.querySelector('.app-rack-stage') ??
        document.querySelector('.app-play-split')
      if (playArea) {
        const pr = playArea.getBoundingClientRect()
        if (pr.width > 1) {
          let offset = pr.left + pr.width / 2 - window.innerWidth / 2
          // Clamp so the (centered) panel never spills past either viewport edge once shifted.
          const panelEl = document.querySelector('.blank-exchange-overlay__panel')
          const panelW = panelEl ? panelEl.getBoundingClientRect().width : 0
          if (panelW > 1) {
            const margin = 6
            const half = panelW / 2
            const winCenter = window.innerWidth / 2
            const minOffset = margin + half - winCenter
            const maxOffset = window.innerWidth - margin - half - winCenter
            if (minOffset <= maxOffset) offset = Math.min(Math.max(offset, minOffset), maxOffset)
          }
          setCenterOffsetX((prev) => (Math.abs(prev - offset) < 0.5 ? prev : offset))
        }
      }
    }
    measure()
    requestAnimationFrame(measure)
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const overlayGridStyle: CSSProperties = {
    ['--discard-tracker-slots-across' as string]: DISCARD_TRACKER_SORTED_BAND_COLS,
    ...(bandW !== null
      ? {
          width: bandW,
          gap: `${BLANK_EXCHANGE_POPUP_ROW_GAP}px`,
          ['--player-rack-face-gap' as string]: `${BLANK_EXCHANGE_POPUP_FACE_GAP}px`,
        }
      : {}),
  }
  const scaleHostStyle: CSSProperties = bandW !== null ? { opacity: 1 } : { opacity: 0 }
  // No transform: the grid is sized directly and its @container fills it with tiles. Flow the mirror
  // in-line (override the absolute board-mirror positioning) so the panel sizes to the band. Zero the
  // padding so the board's `.app-play-split` horizontal inset doesn't pad the popup wider than its band.
  const mirrorStyle: CSSProperties = { position: 'static', padding: 0 }

  return (
    <div
      className="blank-exchange-overlay"
      role="dialog"
      aria-modal
      aria-labelledby="blank-exchange-overlay-title"
      onClick={onCancel}
    >
      <div
        className="blank-exchange-overlay__panel"
        onClick={(e) => e.stopPropagation()}
        style={centerOffsetX ? { transform: `translateX(${centerOffsetX}px)` } : undefined}
      >
        <h2 id="blank-exchange-overlay-title" className="blank-exchange-overlay__title">
          Select a tile to recover.
        </h2>
        <div className="blank-exchange-overlay__scale-host" style={scaleHostStyle}>
          <div
            className="blank-exchange-overlay__tracker-mirror app-play-split app-top-exposure-container"
            style={mirrorStyle}
          >
            <div className="discard-tracker__shell">
              <div className="discard-tracker__content discard-tracker__content--tile-groups-only">
                <div className="discard-tracker__tile-groups-container">
                  <div
                    className="discard-tracker__overlay-grid"
                    aria-label="Discard tracker exchange"
                    style={overlayGridStyle}
                  >
                    <div className="discard-tracker__overlay-row">
                      <SortedDiscardTrayRow
                        tiles={SORTED_DISCARD_ROW1_TILES}
                        slotCount={DISCARD_TRACKER_SORTED_ROW_SLOTS}
                        leadingSuitLabel={tileSuitRackWord('bam')}
                        leadingSuitLabelTone="bam"
                        ariaLabel="Exchange row 1"
                        discardPile={discardPile}
                        suggestedNeedDefs={suggestedNeedDefs}
                        onSlotActivate={onPick}
                        pickableDefs={pickableDefs}
                      />
                    </div>
                    <div className="discard-tracker__overlay-row">
                      <SortedDiscardTrayRow
                        tiles={SORTED_DISCARD_ROW2_TILES}
                        slotCount={DISCARD_TRACKER_SORTED_ROW_SLOTS}
                        leadingSuitLabel={tileSuitRackWord('dot')}
                        leadingSuitLabelTone="dot"
                        ariaLabel="Exchange row 2"
                        discardPile={discardPile}
                        suggestedNeedDefs={suggestedNeedDefs}
                        onSlotActivate={onPick}
                        pickableDefs={pickableDefs}
                      />
                    </div>
                    <div className="discard-tracker__overlay-row">
                      <SortedDiscardTrayRow
                        tiles={SORTED_DISCARD_ROW3_TILES}
                        slotCount={DISCARD_TRACKER_SORTED_ROW_SLOTS}
                        leadingSuitLabel={tileSuitRackWord('crak')}
                        leadingSuitLabelTone="crak"
                        ariaLabel="Exchange row 3"
                        discardPile={discardPile}
                        blankTilesEnabled={blankTilesEnabled}
                        suggestedNeedDefs={suggestedNeedDefs}
                        onSlotActivate={onPick}
                        pickableDefs={pickableDefs}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <button
          type="button"
          className="btn btn--joker-swap-action blank-exchange-overlay__cancel"
          onClick={onCancel}
          style={
            actionBtnSize
              ? {
                  width: actionBtnSize.w,
                  height: actionBtnSize.h,
                  minHeight: actionBtnSize.h,
                }
              : undefined
          }
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

/** 3 rows: 13-column sorted discard grid (inset) + prefix + 14-column bot exposures. */
function DiscardTrackerSlotGrid({
  discardPile,
  botExposures,
  mainPhase,
  activeBotIndex,
  calledThrowerRowIdx,
  jokerSwapUiActive,
  animationsEnabled,
  botExposureFlyInTileIds,
  exposureJokerSwapFlyInTileIds,
  botExposureSuggestedTileGuide,
  botExposureDeadIds,
  jokerSwapHintBounceTileIds,
  jokerSwapHintBounceEpoch,
  blankTilesEnabled,
  suggestedDiscardTrackerNeedDefs,
}: {
  discardPile: readonly DiscardEntry[]
  botExposures: BotExposure[]
  mainPhase: MainPhase
  activeBotIndex: number | null
  /** Seat row (0=South, 1=West, 2=North) that threw the tile currently being called. */
  calledThrowerRowIdx: number | null
  jokerSwapUiActive: boolean
  animationsEnabled: boolean
  botExposureFlyInTileIds: ReadonlySet<string> | null
  exposureJokerSwapFlyInTileIds: ReadonlySet<string> | null
  botExposureSuggestedTileGuide: { bestIds: ReadonlySet<string> } | null
  botExposureDeadIds: ReadonlySet<string> | null
  jokerSwapHintBounceTileIds: ReadonlySet<string> | null
  jokerSwapHintBounceEpoch: number
  blankTilesEnabled: boolean
  suggestedDiscardTrackerNeedDefs: readonly TileDef[] | null
}) {
  const botBandSlots =
    DISCARD_TRACKER_BOT_PREFIX_SLOTS + DISCARD_TRACKER_BOT_ROW_SLOTS

  return (
    <div
      className="discard-tracker__overlay-grid"
      aria-label="Discard tracker slot grid"
      style={
        {
          ['--discard-tracker-slots-across' as string]: DISCARD_TRACKER_SLOTS_ACROSS,
          ['--discard-tracker-bot-band-slots' as string]: botBandSlots,
        } as CSSProperties
      }
    >
      {OPPONENT_EXPOSURE_SEATS.map((seat, rowIdx) => {
        const melds = botExposures
          .map((exp, globalIdx) => ({ exp, globalIdx }))
          .filter(({ exp }) => exp.seat === seat)
          .filter(
            ({ exp }) =>
              mainPhase !== 'wall-game' || exp.tiles.length <= WALL_GAME_MAX_EXPOSURE_MELD_TILES,
          )
          .map(({ exp, globalIdx }) => ({
            tiles: exp.tiles,
            dropZoneId:
              jokerSwapUiActive && exp.tiles.some((t) => t.def.cat === 'joker')
                ? botExposureSwapDropId(globalIdx)
                : undefined,
          }))
        return (
          <div key={seat} className="discard-tracker__overlay-row">
            {rowIdx === 0 ? (
              <SortedDiscardTrayRow
                tiles={SORTED_DISCARD_ROW1_TILES}
                slotCount={DISCARD_TRACKER_SORTED_ROW_SLOTS}
                leadingSuitLabel={tileSuitRackWord('bam')}
                leadingSuitLabelTone="bam"
                ariaLabel="Sorted discard row 1"
                discardPile={discardPile}
                suggestedNeedDefs={suggestedDiscardTrackerNeedDefs}
              />
            ) : rowIdx === 1 ? (
              <SortedDiscardTrayRow
                tiles={SORTED_DISCARD_ROW2_TILES}
                slotCount={DISCARD_TRACKER_SORTED_ROW_SLOTS}
                leadingSuitLabel={tileSuitRackWord('dot')}
                leadingSuitLabelTone="dot"
                ariaLabel="Sorted discard row 2"
                discardPile={discardPile}
                suggestedNeedDefs={suggestedDiscardTrackerNeedDefs}
              />
            ) : (
              <SortedDiscardTrayRow
                tiles={SORTED_DISCARD_ROW3_TILES}
                slotCount={DISCARD_TRACKER_SORTED_ROW_SLOTS}
                leadingSuitLabel={tileSuitRackWord('crak')}
                leadingSuitLabelTone="crak"
                ariaLabel="Sorted discard row 3"
                discardPile={discardPile}
                blankTilesEnabled={blankTilesEnabled}
                suggestedNeedDefs={suggestedDiscardTrackerNeedDefs}
              />
            )}
            <DiscardTrackerBotSeatLabel
              seat={seat}
              isActiveTurn={mainPhase === 'bot-turn' && activeBotIndex === rowIdx}
              isCalledThrower={calledThrowerRowIdx === rowIdx}
            />
            <OpponentExposureDropZone
              seat={seat}
              active={jokerSwapUiActive}
              showWatermark={false}
              tag="div"
            >
              <ExposureRack
                melds={melds}
                slotCount={DISCARD_TRACKER_BOT_ROW_SLOTS}
                className="exposure-rack--discard-tracker-opponent exposure-rack--discard-tracker-bot-row"
                gridMeldColumnSpans
                ariaLabel={`${seat} exposures`}
                stackSuitTiles
                flyInTileIds={animationsEnabled ? botExposureFlyInTileIds : null}
                flyInFromBelowTileIds={animationsEnabled ? exposureJokerSwapFlyInTileIds : null}
                suggestedTileGuide={botExposureSuggestedTileGuide}
                suggestedDeadTileIds={botExposureDeadIds}
                suppressDim
                botJokerBorderMenuOn={false}
                jokerSwapHintBounceTileIds={jokerSwapHintBounceTileIds}
                jokerSwapHintBounceEpoch={jokerSwapHintBounceEpoch}
              />
            </OpponentExposureDropZone>
          </div>
        )
      })}
    </div>
  )
}

/** East’s own exposure row: joker swap by dropping anywhere on your melds (same as a bot seat). */
function EastOwnJokerSwapDropZone({ active, children }: { active: boolean; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: EAST_SEAT_SWAP_ID,
    disabled: !active,
  })
  return (
    <div
      ref={setNodeRef}
      className={[
        'east-own-exposure-swap-wrap',
        active ? 'east-own-exposure-swap-wrap--active' : '',
        isOver ? 'east-own-exposure-swap-wrap--over' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  )
}

/** Staged East discard tile: `useSortable` (same `SortableContext` as the hand) so rack neighbours slide like in-hand drags. */
function EastDiscardStagingSortableFace({
  tile,
  suggestBest,
  suggestBlankExchange,
  jokerSwapHintBounce = false,
  jokerSwapHintBounceEpoch = 0,
  onTileClickReturn,
}: {
  tile: TileInstance
  suggestBest?: boolean
  /** Blank could be redeemed for a discard this line still needs — Simple joker yellow ring. */
  suggestBlankExchange?: boolean
  jokerSwapHintBounce?: boolean
  jokerSwapHintBounceEpoch?: number
  onTileClickReturn: () => void
}) {
  const { active } = useDndContext()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
    id: tile.id,
    animateLayoutChanges: () => false,
  })
  const dragStyle: CSSProperties = {
    transform: isDragging ? undefined : CSS.Transform.toString(transform),
    transition:
      isDragging
        ? 'none'
        : active
          ? 'transform 0.14s cubic-bezier(0.2, 0, 0.2, 1)'
          : 'none',
    touchAction: 'none',
  }
  return (
    <div
      ref={setNodeRef}
      style={dragStyle}
      className={[
        'east-discard-staging__tile',
        isDragging ? 'east-discard-staging__tile--dragging' : '',
        suggestBest ? 'east-discard-staging__tile--suggest-best' : '',
        suggestBlankExchange ? 'east-discard-staging__tile--blank-exchange-hint' : '',
        jokerSwapHintBounce ? 'east-discard-staging__tile--joker-swap-hint-bounce' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        e.stopPropagation()
        onTileClickReturn()
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onTileClickReturn()
        }
      }}
    >
      <div
        key={jokerSwapHintBounce ? `jsb-ed-${jokerSwapHintBounceEpoch}` : 'ed-face'}
      >
        <TileFace def={tile.def} elevated={isDragging} rackSuitStacked />
      </div>
    </div>
  )
}

function EastDiscardStagingSlot({
  enabled,
  compact,
  tile,
  sortableSuppressed,
  onTileClickReturn,
  suggestBest,
  suggestBlankExchange,
  jokerSwapHintBounce = false,
  jokerSwapHintBounceEpoch = 0,
}: {
  enabled: boolean
  /** Single-cell layout on the exposure rack row (vs. larger panel slot). */
  compact?: boolean
  tile: TileInstance | null
  /**
   * While the tile id is preview-inserted into the hand list (drag over rack), unmount the
   * staging `useSortable` so only the hand phantom registers — same pattern as Charleston pass.
   */
  sortableSuppressed?: boolean
  onTileClickReturn: () => void
  /** Tile matches the focused suggested hand — show white inset ring. */
  suggestBest?: boolean
  /** Blank could be redeemed for a discard this line still needs — Simple joker yellow ring. */
  suggestBlankExchange?: boolean
  /** Joker swap hint: dock-bounce the staged tile when it can redeem an exposed joker. */
  jokerSwapHintBounce?: boolean
  jokerSwapHintBounceEpoch?: number
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: EAST_DISCARD_STAGING_ID,
    disabled: !enabled,
  })

  return (
    <div
      ref={setNodeRef}
      className={[
        'east-discard-staging',
        compact ? 'east-discard-staging--inline' : '',
        isOver ? 'east-discard-staging--over' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Staged discard"
    >
      {tile && !sortableSuppressed ? (
        <EastDiscardStagingSortableFace
          tile={tile}
          suggestBest={suggestBest}
          suggestBlankExchange={suggestBlankExchange}
          jokerSwapHintBounce={jokerSwapHintBounce}
          jokerSwapHintBounceEpoch={jokerSwapHintBounceEpoch}
          onTileClickReturn={onTileClickReturn}
        />
      ) : (
        <span className="east-discard-staging__placeholder" aria-hidden="true" />
      )}
    </div>
  )
}

/** When a bot claimed another bot's discard after East skipped — drives call-prompt headline. */
type BotTurnBanner = {
  callerBotIndex: 0 | 1 | 2
  calledDef: TileDef
  /** Seat (0=South, 1=West, 2=North) that threw the tile the caller claimed. */
  discarderBotIndex: 0 | 1 | 2
}

type RoundState = {
  hand: TileInstance[]
  bots: [TileInstance[], TileInstance[], TileInstance[]]
  wall: TileInstance[]
  /** Wall length right after opening deal — drives the rack wall-heat meter for this hand. */
  openingWallTileCount: number
  passSlots: PassSlots
  selectedHandTileId: string | null
  charlestonPhase: CharlestonPhase
  charlestonSkippedSecondRound: boolean
  awaitingSecondCharlestonChoice: boolean
  mainPhase: MainPhase
  discardPile: DiscardEntry[]
  /** Id of the most recent tile added to East's hand (draw or discard claim); shown with a green ring. */
  drawnTileId: string | null
  /** Index (0=South, 1=West, 2=North) of the bot whose discard is awaiting a Call (claim) decision. */
  activeBotIndex: number | null
  /** The tile the active bot just discarded; player can Call to claim it or skip. */
  activeBotDiscard: TileInstance | null
  /** Narration when the live discard came from a bot-on-bot claim (East had skipped the prior discard). */
  botTurnBanner: BotTurnBanner | null
  /** East's face-up melds accumulated this round. */
  eastExposures: EastExposure[]
  /** Bot face-up melds (calls on East's discards). */
  botExposures: BotExposure[]
  /** Tile removed from hand, awaiting Discard — main game East only. */
  pendingEastDiscardTile: TileInstance | null
  /** Original hand index of pendingEastDiscardTile — used to restore position on return. */
  pendingEastDiscardIdx: number | null
  /** Original hand indices of each pass-slot tile — used to restore position on return. */
  passSlotOrigins: [number | null, number | null, number | null]
  /** After each Charleston receive: hand tile ids not present before that pass (thin white edge line until next pass). */
  charlestonNewTileIds: string[]
  /**
   * One-shot fly-in toward the rack for tiles in `ids` (cleared after animation).
   * Opening deal uses `from: 'across'` so every hand tile drops in from above its slot.
   */
  handTileFlyIn: HandTileFlyIn | null
  /**
   * One hand tile id: play the wall-draw keyframes from **below** that rack slot (same as call tiles
   * into exposure). Set when a joker is redeemed from the table into your hand; cleared after the fly.
   */
  handJokerSwapFlyInFromBelowId: string | null
  /**
   * One exposure tile id: play the drop-in from **below** that rack slot when a natural replaces an
   * exposed joker during joker swap. Cleared after the fly.
   */
  exposureJokerSwapFlyInTileId: string | null
  /** Ids of hand tiles the player has selected to join the staged call meld (call-staging phase only). */
  stagedCallTileIds: string[]
  /**
   * After committing a claim (pung/kong/quint) while East is still in east-discard (has not
   * discarded): id of the called tile in the meld the player may tap to re-enter call-staging
   * and change non-called tiles. Cleared when East’s discard is committed.
   */
  callAmendableAfterClaimTileId: string | null
  /** Legacy call-amend fields kept null for older saved rounds. */
  callAmendFromBotIndex: 0 | 1 | 2 | null
  /** Non-null when a bot won. Drives the bot-mahjong end screen. */
  botWin:
    | ({ botIndex: 0 | 1 | 2 } & (
        | { how: 'self-draw'; tile: TileDef }
        | { how: 'called-discard'; tile: TileDef; discardFrom: 'east' | (typeof BOT_LABELS)[number] }
      ))
    | null
  /** How the player won Mah Jongg (set when mainPhase becomes 'mahjong-declared'). */
  playerWinMethod:
    | { type: 'self-draw'; tile: TileDef }
    | { type: 'called-discard'; botLabel: (typeof BOT_LABELS)[number]; tile: TileDef }
    | null
  /** Set when mainPhase becomes 'dead-hand' — drives the end-game explanation. */
  deadHandReason: DeadHandReason | null
}

/**
 * Discard pile entries shown in the strip / tracker counts — excludes a bot discard still
 * claimable during `bot-turn` or `call-staging` until all players pass or someone claims it.
 */
function discardPileCommittedForDisplay(
  r: Pick<RoundState, 'discardPile' | 'mainPhase' | 'activeBotDiscard'>,
): RoundState['discardPile'] {
  if (
    (r.mainPhase === 'bot-turn' || r.mainPhase === 'call-staging') &&
    r.activeBotDiscard
  ) {
    return r.discardPile.filter((e) => e.tile.id !== r.activeBotDiscard!.id)
  }
  return r.discardPile
}

/**
 * Tiles in the discard pile that count as “dead” for practice-card table visibility / coach hints.
 * Matches the discard strip: while a bot’s discard is still claimable (`bot-turn` / `call-staging`),
 * that tile is omitted until the claim resolves — it must not read as already in your rack or as a
 * settled dead copy for `rankSuggestedHands` / strip need highlights.
 */
function deadDiscardTilesForRanking(
  r: Pick<RoundState, 'discardPile' | 'mainPhase' | 'activeBotDiscard'>,
): TileInstance[] {
  return discardPileCommittedForDisplay(r).map((e) => e.tile)
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
): boolean {
  if (!focusKey) return false
  const variantSep = ['::tier::', '::oc::', '::ocall::']
    .map((s) => focusKey.indexOf(s))
    .filter((i) => i >= 0)
    .reduce((m, i) => (m < 0 ? i : Math.min(m, i)), -1)
  const patternId = variantSep >= 0 ? focusKey.slice(0, variantSep) : focusKey
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
      if (patternNeedVariantIsSatisfiable(needs, unavailableByKey, totalCopiesForDeadHintDef)) {
        return true
      }
    }
  }

  return false
}

function minPositiveNeed(...counts: Array<number | null | undefined>): number | null {
  let min: number | null = null
  for (const count of counts) {
    if (count == null || count <= 0) continue
    min = min == null ? count : Math.min(min, count)
  }
  return min
}

function groupNeedForDeadHintDef(group: PatternGroup, def: TileDef): number | null {
  switch (group.kind) {
    case 'fixed':
    case 'rank':
    case 'suit-locked-rank':
      return group.test(def) ? group.need : null
    case 'consec':
      return group.test(def) ? Math.min(group.need1, group.need2) : null
    case 'shared-rank':
    case 'shared-rank-suits':
    case 'consec-multi':
    case 'suit-locked-consec-multi':
      return group.test(def) ? minPositiveNeed(...group.needs) : null
    case 'suit-locked':
      if (def.cat === 'suit') {
        return group.rankNeeds.find((n) => n.rank === def.rank)?.need ?? null
      }
      if (def.cat === 'dragon') {
        return minPositiveNeed(group.dragonCount, group.opposingDragons?.need ?? null)
      }
      return null
    case 'suit-locked-consec':
      if (def.cat === 'suit') return group.rankCount
      if (def.cat === 'dragon') return group.dragonCount || null
      return null
    case 'suit-permute':
      if (def.cat === 'suit') {
        let need: number | null = null
        for (const colorGroup of group.colorGroups) {
          for (const part of colorGroup) {
            if (part.rank !== def.rank || part.need <= 0) continue
            need = need == null ? part.need : Math.min(need, part.need)
          }
        }
        return need
      }
      if (def.cat === 'dragon') {
        return minPositiveNeed(...(group.colorGroupDragonCounts ?? []), group.trailingDragonCount ?? null)
      }
      return null
    case 'dragon-meld-permute':
      if (def.cat !== 'dragon') return null
      for (let i = 0; i < group.needs.length; i++) {
        if (group.cardDragons[i] === def.dragon) return group.needs[i]
      }
      return null
    case 'odd-pair-kongs-triple':
      if (def.cat !== 'suit' || !group.odds.includes(def.rank)) return null
      return 4
    default:
      return null
  }
}

function focusedPatternNeedForDeadHintDef(
  focusKey: string | null,
  def: TileDef,
  patterns: PracticePattern[],
): number | null {
  if (!focusKey) return null
  const variantSep = ['::tier::', '::oc::', '::ocall::']
    .map((s) => focusKey.indexOf(s))
    .filter((i) => i >= 0)
    .reduce((m, i) => (m < 0 ? i : Math.min(m, i)), -1)
  const patternId = variantSep >= 0 ? focusKey.slice(0, variantSep) : focusKey
  const pattern = patterns.find((p) => p.id === patternId)
  if (!pattern) return null
  const pinnedPatterns = buildPinnedPatternsFromFocusKey(pattern, focusKey)
  const candidates = pinnedPatterns.length > 0 ? pinnedPatterns : [pattern]
  let need: number | null = null
  for (const candidate of candidates) {
    for (const group of candidate.groups ?? []) {
      const groupNeed = groupNeedForDeadHintDef(group, def)
      if (groupNeed == null || groupNeed > 2) continue
      need = need == null ? groupNeed : Math.min(need, groupNeed)
    }
  }
  return need
}

/** Pre-Charleston wall order: East 14, South/West/North 13 each, then wall — matches `dealOpeningFour` on the shuffled deck. */
function roundOpeningDeckOrder(r: Pick<RoundState, 'hand' | 'bots' | 'wall'>): TileInstance[] {
  return [...r.hand, ...r.bots[0], ...r.bots[1], ...r.bots[2], ...r.wall]
}

function roundStateFromOpeningDeck(deck: TileInstance[]): RoundState {
  const { east, south, west, north, wall } = dealOpeningFour(deck)
  return {
    hand: east,
    bots: [south, west, north],
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
      ids: east.map((t) => t.id),
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

function applyDeadHand(r: RoundState, reason: DeadHandReason): RoundState {
  return { ...r, mainPhase: 'dead-hand', deadHandReason: reason }
}

function createNewRound(
  tenJokersEnabled: boolean,
  blankTilesEnabled: boolean,
  blankTileCount: BlankTileCount,
): RoundState {
  return roundStateFromOpeningDeck(
    shuffle(
      buildAmericanDeck({
        jokerCount: tenJokersEnabled ? TEN_JOKERS_COUNT : STANDARD_JOKER_COUNT,
        blankTileCount: blankTilesEnabled ? blankTileCount : 0,
      }),
    ),
  )
}

function charlestonIncomingHandTileIds(
  prevHand: TileInstance[],
  nextHand: TileInstance[],
): string[] {
  const prev = new Set(prevHand.map((t) => t.id))
  return nextHand.filter((t) => !prev.has(t.id)).map((t) => t.id)
}

/** Bot exposures with this many tiles in one meld are treated as wall-game hand dumps, not real calls. */
const WALL_GAME_MAX_EXPOSURE_MELD_TILES = 10

const BOT_LABELS = ['South', 'West', 'North'] as const
/** Discard tracker bot rows top→bottom: South, West, North — matches `BOT_LABELS`. */
const OPPONENT_EXPOSURE_SEATS: readonly BotSeat[] = ['South', 'West', 'North']
const BOT_SEATS: Seat[] = ['south', 'west', 'north']

function toFourHands(r: Pick<RoundState, 'hand' | 'bots'>): FourHands {
  return {
    east: r.hand,
    south: r.bots[0],
    west: r.bots[1],
    north: r.bots[2],
  }
}

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
function applyBotTurnSwapsAndBlankExchange(
  hand: TileInstance[],
  discardPile: DiscardEntry[],
  seat: Seat,
  botSeat: BotSeat,
  wall: TileInstance[],
  eastExposures: EastExposure[],
  botExposures: BotExposure[],
  difficulty: BotDifficulty,
): {
  hand: TileInstance[]
  discardPile: DiscardEntry[]
  eastExposures: EastExposure[]
  botExposures: BotExposure[]
} {
  const swapped = performBotPreDiscardSwaps(hand, eastExposures, botExposures, difficulty)
  const ctx: BotRankContext = {
    hand: swapped.hand,
    botSeat,
    wall,
    discardPile,
    eastExposures: swapped.eastExposures,
    botExposures: swapped.botExposures,
  }
  const exchanged = tryBotBlankExchange(ctx, seat, difficulty)
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
function runOneBotTurn(
  botHand: TileInstance[],
  wall: TileInstance[],
  discardPile: DiscardEntry[],
  seat: Seat,
  eastExposures: EastExposure[],
  botExposures: BotExposure[],
  botDifficulty: BotDifficulty,
  /** When false, a bot that could win on the draw does not self-declare Mah Jongg and discards instead (practice). */
  botWinsEnabled: boolean,
): BotTurnResult {
  if (wall.length === 0) {
    return { botHand, wall, discardPile, discarded: null, eastExposuresOut: eastExposures, botExposuresOut: botExposures, botMahjong: false, mahjongTile: null }
  }
  const [drawn, ...wallNext] = wall
  const handWithDraw = [...botHand, drawn]
  const botSeat = (seat.charAt(0).toUpperCase() + seat.slice(1)) as BotSeat
  const swapped = applyBotTurnSwapsAndBlankExchange(
    handWithDraw,
    discardPile,
    seat,
    botSeat,
    wallNext,
    eastExposures,
    botExposures,
    botDifficulty,
  )
  const handAfterSwaps = swapped.hand
  const discardPileAfterSwaps = swapped.discardPile
  const nonJokers = handAfterSwaps.filter((t) => t.def.cat !== 'joker')
  const jokers = handAfterSwaps.filter((t) => t.def.cat === 'joker')

  // ── Self-draw Mah Jongg check ───────────────────────────────────────────────
  const botSeatLabel = botSeat as typeof BOT_LABELS[number]
  const thisBotExposures = swapped.botExposures.filter((e) => e.seat === botSeatLabel)
  const mjRankInput: RankSuggestedHandsInput = {
    hand: handAfterSwaps,
    wallRemaining: wallNext.length,
    discards: discardPileAfterSwaps.map((e) => e.tile),
    exposures: swapped.botExposures,
    playerClaimMelds: thisBotExposures,
    eastTableClaimMelds: swapped.eastExposures,
    patterns: getActiveCardPatterns(),
  }
  if (summarizeRackTowardWin(mjRankInput).bestTilesAway === 0) {
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
    pick = chooseBotDiscard(ctx, botDifficulty)
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

/** Draw one tile from the wall and add it to the end of East's hand. */
function autoDrawFromWall(
  hand: TileInstance[],
  wall: TileInstance[],
): { hand: TileInstance[]; wall: TileInstance[]; drawnTileId: string | null } {
  if (wall.length === 0) return { hand, wall, drawnTileId: null }
  const [drawn, ...wallNext] = wall
  return { hand: [...hand, drawn], wall: wallNext, drawnTileId: drawn.id }
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
  const botSeat = BOT_LABELS[botIdx]! as BotSeat
  return {
    hand: botHand,
    botSeat,
    wall: r.wall,
    discardPile: r.discardPile,
    eastExposures: exposureOverride?.east ?? r.eastExposures,
    botExposures: exposureOverride?.bot ?? r.botExposures,
  }
}

function findBotCallOnDiscard(
  bots: [TileInstance[], TileInstance[], TileInstance[]],
  discard: TileInstance,
  r: RoundState,
  botDifficulty: BotDifficulty,
): { botIndex: 0 | 1 | 2; claimType: ClaimType; matches: TileInstance[] } | null {
  for (let i = 0; i < 3; i++) {
    const ctx = buildBotContext(r, bots[i]!, i)
    const prob = botCallStrategicProbability(ctx, discard, botDifficulty)
    const hit = trySingleBotCall(bots[i]!, discard.def, prob)
    if (!hit) continue
    const seat = BOT_LABELS[i]! as (typeof BOT_LABELS)[number]
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
function findBotCallAfterEastSkipped(
  bots: [TileInstance[], TileInstance[], TileInstance[]],
  discard: TileInstance,
  discarderIndex: number,
  r: RoundState,
  botDifficulty: BotDifficulty,
): { botIndex: 0 | 1 | 2; claimType: ClaimType; matches: TileInstance[] } | null {
  for (let step = 1; step <= 2; step++) {
    const bi = (discarderIndex + step) % 3
    const ctx = buildBotContext(r, bots[bi]!, bi)
    const prob = botCallStrategicProbability(ctx, discard, botDifficulty)
    const hit = trySingleBotCall(bots[bi]!, discard.def, prob)
    if (!hit) continue
    const seat = BOT_LABELS[bi]! as (typeof BOT_LABELS)[number]
    const prior = r.botExposures.filter((e) => e.seat === seat)
    const newExposure: BotExposure = {
      seat,
      tiles: [...hit.matches, discard],
      claimType: hit.claimType,
    }
    if (!openClaimMeldsFitSomePracticeLine([...prior, newExposure])) continue
    return { botIndex: bi as 0 | 1 | 2, ...hit }
  }
  return null
}

/** `bestTilesAway` for `botHand` + `calledTile` as the claimed discard (14th tile), same rack model as self-draw. */
function botTilesAwayWithCalledDiscard(
  botHand: TileInstance[],
  calledTile: TileInstance,
  botIndex: 0 | 1 | 2,
  r: Pick<RoundState, 'wall' | 'discardPile' | 'eastExposures' | 'botExposures'>,
): number {
  if (calledTile.def.cat === 'joker') return 99
  const botSeatLabel = BOT_LABELS[botIndex]!
  const thisBotExposures = r.botExposures.filter((e) => e.seat === botSeatLabel)
  const handWithCalled = [...botHand, calledTile]
  return summarizeRackTowardWin({
    hand: handWithCalled,
    wallRemaining: r.wall.length,
    discards: r.discardPile.map((e) => e.tile),
    exposures: r.botExposures,
    playerClaimMelds: thisBotExposures,
    eastTableClaimMelds: r.eastExposures,
    patterns: getActiveCardPatterns(),
  }).bestTilesAway
}

/** South → West → North: first bot who wins on this discard (including pair/single 14th tile). */
function findFirstBotMahjongOnDiscard(
  bots: [TileInstance[], TileInstance[], TileInstance[]],
  calledTile: TileInstance,
  r: Pick<RoundState, 'wall' | 'discardPile' | 'eastExposures' | 'botExposures'>,
  /** If set, only these indices in order (e.g. next two after a skip). */
  candidateIndices?: readonly (0 | 1 | 2)[],
): 0 | 1 | 2 | null {
  const order = candidateIndices ?? ([0, 1, 2] as const)
  for (const bi of order) {
    if (botTilesAwayWithCalledDiscard(bots[bi]!, calledTile, bi, r) === 0) return bi
  }
  return null
}

function getRepDefForExposedJoker(
  r: RoundState,
  parsed: { rack: 'bot' | 'east'; exposureIdx: number },
): TileDef | null {
  if (parsed.rack === 'bot') {
    const exp = r.botExposures[parsed.exposureIdx]
    return exp ? representativeDefInExposedMeld(exp.tiles) : null
  }
  const exp = r.eastExposures[parsed.exposureIdx]
  return exp ? representativeDefInExposedMeld(exp.tiles) : null
}

/**
 * East trades a natural from their hand for an exposed joker (on any rack). The natural
 * replaces the joker in the meld; East receives the joker.
 */
function applyEastNaturalForExposedJoker(
  r: RoundState,
  p: { rack: 'bot' | 'east'; exposureIdx: number; jokerTileId: string; eastTileId: string },
): RoundState {
  if (r.mainPhase !== 'east-discard' && r.mainPhase !== 'call-staging') return r
  // Don't pull a tile out of the call you're currently staging — it would leave a dangling id
  // in stagedCallTileIds and break the call meld.
  if (r.mainPhase === 'call-staging' && r.stagedCallTileIds.includes(p.eastTileId)) return r
  const handIdx = r.hand.findIndex((t) => t.id === p.eastTileId)
  // Also accept tiles staged in the discard tray (pendingEastDiscardTile).
  const fromPending = handIdx < 0 && r.pendingEastDiscardTile?.id === p.eastTileId
  if (handIdx < 0 && !fromPending) return r
  const eastTile = handIdx >= 0 ? r.hand[handIdx]! : r.pendingEastDiscardTile!
  if (eastTile.def.cat === 'joker') return r

  const rep = getRepDefForExposedJoker(r, p)
  if (!rep || !tileDefsEqual(eastTile.def, rep)) return r

  // Build the updated hand: if the tile came from hand, replace it with the joker in-place;
  // if it came from pendingEastDiscardTile, append the joker to the current hand.
  function buildHandAndPending(joker: TileInstance): { handNext: TileInstance[]; pendingNext: TileInstance | null } {
    if (handIdx >= 0) {
      const handNext = [...r.hand]
      handNext[handIdx] = joker
      return { handNext, pendingNext: r.pendingEastDiscardTile }
    }
    return { handNext: [...r.hand, joker], pendingNext: null }
  }

  if (p.rack === 'bot') {
    const exp = r.botExposures[p.exposureIdx]
    if (!exp) return r
    const joker = exp.tiles.find((t) => t.id === p.jokerTileId)
    if (!joker || joker.def.cat !== 'joker') return r
    const { handNext, pendingNext } = buildHandAndPending(joker)
    const botExposuresNext = [...r.botExposures]
    botExposuresNext[p.exposureIdx] = {
      ...exp,
      tiles: exp.tiles.map((t) => (t.id === p.jokerTileId ? eastTile : t)),
    }
    return applyBotsJokerSwapsFromEast({
      ...r,
      hand: handNext,
      botExposures: botExposuresNext,
      pendingEastDiscardTile: pendingNext,
      drawnTileId: joker.id,
      handTileFlyIn: null,
      handJokerSwapFlyInFromBelowId: joker.id,
      exposureJokerSwapFlyInTileId: eastTile.id,
      selectedHandTileId: null,
    })
  }

  const exp = r.eastExposures[p.exposureIdx]
  if (!exp) return r
  const joker = exp.tiles.find((t) => t.id === p.jokerTileId)
  if (!joker || joker.def.cat !== 'joker') return r
  const { handNext, pendingNext } = buildHandAndPending(joker)
  const eastExposuresNext = [...r.eastExposures]
  eastExposuresNext[p.exposureIdx] = {
    ...exp,
    tiles: exp.tiles.map((t) => (t.id === p.jokerTileId ? eastTile : t)),
  }
  return applyBotsJokerSwapsFromEast({
    ...r,
    hand: handNext,
    eastExposures: eastExposuresNext,
    pendingEastDiscardTile: pendingNext,
    drawnTileId: joker.id,
    handTileFlyIn: null,
    handJokerSwapFlyInFromBelowId: joker.id,
    exposureJokerSwapFlyInTileId: eastTile.id,
    selectedHandTileId: null,
  })
}

/**
 * Bot joker redemptions run only in {@link performBotPreDiscardSwaps} on that seat’s own turn
 * (E → S → W → N), before they discard — not during `bot-turn` while another seat’s discard is
 * claimable. East uses {@link applyEastNaturalForExposedJoker} on `east-discard` / `call-staging`.
 */
function applyBotsJokerSwapsFromEast(r: RoundState): RoundState {
  return r
}

/**
 * East commits a discard already taken out of the hand (`pendingEastDiscardTile` or staging flow).
 */
function commitEastDiscardWithHand(
  r: RoundState,
  discardedTile: TileInstance,
  handNext: TileInstance[],
  botWinsEnabled = false,
  botDifficulty: BotDifficulty = 'normal',
): RoundState {
  if (r.mainPhase !== 'east-discard') return r

  const clearCallAmend: Pick<RoundState, 'callAmendableAfterClaimTileId' | 'callAmendFromBotIndex'> = {
    callAmendableAfterClaimTileId: null,
    callAmendFromBotIndex: null,
  }

  // ── Mah Jongg on East's discard (pair / single 14th tile — no exposure) ──
  const mjBot = botWinsEnabled ? findFirstBotMahjongOnDiscard(r.bots, discardedTile, r) : null
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
      botWin: { botIndex: mjBot, how: 'called-discard', tile: discardedTile.def, discardFrom: 'east' },
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
      discardPile: [...r.discardPile, { tile: discardedTile, seat: 'east' }],
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
  const botCall = findBotCallOnDiscard(r.bots, discardedTile, r, botDifficulty)
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
      seat: (['South', 'West', 'North'] as const)[botIndex],
      tiles: [...matches, discardedTile],
      claimType,
    }

    // Before discarding, let the bot redeem any available jokers from exposures.
    // The called tile is already locked in the newExposure — only hand tiles are eligible for swaps.
    const allBotExposuresWithNew = [...r.botExposures, newExposure]
    const postCallPrep = applyBotTurnSwapsAndBlankExchange(
      botsNext[botIndex]!,
      r.discardPile,
      BOT_SEATS[botIndex]!,
      BOT_LABELS[botIndex]! as BotSeat,
      r.wall,
      r.eastExposures,
      allBotExposuresWithNew,
      botDifficulty,
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
      ? chooseBotDiscard(afterCallCtx, botDifficulty)
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
      { tile: pick, seat: BOT_SEATS[botIndex]! },
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
      botTurnBanner: null,
      pendingEastDiscardTile: null,
      drawnTileId: null,
      selectedHandTileId: null,
    })
  }

  // ── Normal flow: no bot called, South draws from wall ────────────────────
  const pileAfterEast: DiscardEntry[] = [...r.discardPile, { tile: discardedTile, seat: 'east' }]
  const botsNext: [TileInstance[], TileInstance[], TileInstance[]] = [
    [...r.bots[0]],
    [...r.bots[1]],
    [...r.bots[2]],
  ]
  const result = runOneBotTurn(
    botsNext[0],
    r.wall,
    pileAfterEast,
    'south',
    r.eastExposures,
    r.botExposures,
    botDifficulty,
    botWinsEnabled,
  )
  botsNext[0] = result.botHand

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
      botWin: { botIndex: 0, how: 'self-draw', tile: result.mahjongTile!.def },
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
    activeBotIndex: 0,
    activeBotDiscard: result.discarded,
    botTurnBanner: null,
    pendingEastDiscardTile: null,
    drawnTileId: null,
    selectedHandTileId: null,
  })
}

function commitEastDiscardAfterStaged(
  r: RoundState,
  botWinsEnabled = false,
  botDifficulty: BotDifficulty = 'normal',
): RoundState {
  const staged = r.pendingEastDiscardTile
  if (!staged || r.mainPhase !== 'east-discard') return r
  if (r.hand.some((t) => t.id === staged.id)) return { ...r, pendingEastDiscardTile: null }
  return commitEastDiscardWithHand(r, staged, r.hand, botWinsEnabled, botDifficulty)
}

/**
 * Player skips the current bot's discard.
 * Remaining bots (in turn) may claim that discard; otherwise the next bot draws and discards,
 * or East draws when all have passed.
 */
function applySkipBotDiscard(
  r: RoundState,
  botWinsEnabled = false,
  botDifficulty: BotDifficulty = 'normal',
): RoundState {
  if (r.mainPhase !== 'bot-turn' || r.activeBotIndex === null || !r.activeBotDiscard) return r

  const fromIdx = r.activeBotIndex
  const calledTile = r.activeBotDiscard
  const nextBotIndex = fromIdx + 1

  if (nextBotIndex > 2) {
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

  const botsNext: [TileInstance[], TileInstance[], TileInstance[]] = [
    [...r.bots[0]],
    [...r.bots[1]],
    [...r.bots[2]],
  ]

  const skipOrder = [1, 2].map((step) => (fromIdx + step) % 3) as (0 | 1 | 2)[]
  const mjCaller = botWinsEnabled ? findFirstBotMahjongOnDiscard(botsNext, calledTile, r, skipOrder) : null
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
        discardFrom: BOT_LABELS[fromIdx]!,
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

  const botClaim = findBotCallAfterEastSkipped(botsNext, calledTile, fromIdx, r, botDifficulty)

  if (botClaim) {
    const { botIndex: callerIdx, claimType, matches } = botClaim
    const matchIds = new Set(matches.map((t) => t.id))
    botsNext[callerIdx] = botsNext[callerIdx]!.filter((t) => !matchIds.has(t.id))

    const newExposure: BotExposure = {
      seat: BOT_LABELS[callerIdx],
      tiles: [...matches, calledTile],
      claimType,
    }

    const pileWithoutClaimed = r.discardPile.filter((e) => e.tile.id !== calledTile.id)

    // Before discarding, let the calling bot redeem any available jokers.
    // The called tile is locked in newExposure — only remaining hand tiles are eligible.
    const allBotExposuresSkip = [...r.botExposures, newExposure]
    const postCallPrepSkip = applyBotTurnSwapsAndBlankExchange(
      botsNext[callerIdx]!,
      pileWithoutClaimed,
      BOT_SEATS[callerIdx]!,
      BOT_LABELS[callerIdx]! as BotSeat,
      r.wall,
      r.eastExposures,
      allBotExposuresSkip,
      botDifficulty,
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
        ? chooseBotDiscard(afterSkipCtx, botDifficulty)
        : botsNext[callerIdx]![0]!

    if (!pick) {
      const draw = autoDrawFromWall(r.hand, r.wall)
      return applyBotsJokerSwapsFromEast({
        ...r,
        hand: draw.hand,
        wall: draw.wall,
        bots: botsNext,
        discardPile: discardPileAfterSkipPrep,
        eastExposures: eastExposuresAfterSkipSwap,
        botExposures: botExposuresAfterSkipSwap,
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

    botsNext[callerIdx] = botsNext[callerIdx]!.filter((t) => t.id !== pick.id)
    const discardPile: DiscardEntry[] = [
      ...discardPileAfterSkipPrep,
      { tile: pick, seat: BOT_SEATS[callerIdx]! },
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

  const seat = BOT_SEATS[nextBotIndex]!
  const result = runOneBotTurn(
    botsNext[nextBotIndex]!,
    r.wall,
    r.discardPile,
    seat,
    r.eastExposures,
    r.botExposures,
    botDifficulty,
    botWinsEnabled,
  )
  botsNext[nextBotIndex] = result.botHand

  if (result.botMahjong) {
    return {
      ...r,
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
      botWin: { botIndex: nextBotIndex as 0 | 1 | 2, how: 'self-draw', tile: result.mahjongTile!.def },
    }
  }

  if (!result.discarded) {
    const draw = autoDrawFromWall(r.hand, result.wall)
    return applyBotsJokerSwapsFromEast({
      ...r,
      bots: botsNext,
      hand: draw.hand,
      wall: result.wall,
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
    bots: botsNext,
    wall: result.wall,
    discardPile: result.discardPile,
    eastExposures: result.eastExposuresOut,
    botExposures: result.botExposuresOut,
    mainPhase: 'bot-turn',
    activeBotIndex: nextBotIndex,
    activeBotDiscard: result.discarded,
    botTurnBanner: null,
    drawnTileId: null,
    selectedHandTileId: null,
  })
}

/** Player decided to call — move called tile into staging exposure; player picks meld tiles. */
function applyInitiateCall(r: RoundState): RoundState {
  if (r.mainPhase !== 'bot-turn' || !r.activeBotDiscard) return r
  return { ...r, mainPhase: 'call-staging', stagedCallTileIds: [] }
}

/**
 * Auto-select `needed` hand tiles for the staged meld (naturals first, then jokers).
 * Replaces any prior staged selection.
 */
function applyAutoSelectCallTiles(r: RoundState, needed: number): RoundState {
  if (r.mainPhase !== 'call-staging' || !r.activeBotDiscard) return r
  const calledDef = r.activeBotDiscard.def
  const naturals = findExactMatches(r.hand, calledDef)
  const jokers = r.hand.filter((t) => t.def.cat === 'joker')
  const selected = [...naturals, ...jokers].slice(0, needed)
  return { ...r, stagedCallTileIds: selected.map((t) => t.id) }
}

/** Toggle a hand tile into/out of the staged call meld (any tile except the locked called tile). */
function applyToggleStagedCallTile(r: RoundState, tileId: string): RoundState {
  if (r.mainPhase !== 'call-staging' || !r.activeBotDiscard) return r
  if (r.stagedCallTileIds.includes(tileId)) {
    return { ...r, stagedCallTileIds: r.stagedCallTileIds.filter((id) => id !== tileId) }
  }
  const tile = r.hand.find((t) => t.id === tileId)
  if (!tile) return r
  if (r.stagedCallTileIds.length >= 5) return r
  return { ...r, stagedCallTileIds: [...r.stagedCallTileIds, tileId] }
}

/** After committing a new claim meld, left-to-right order of exposures matches the closest line’s group order when possible. */
function orderEastExposuresForClosestCardLine(
  r: RoundState,
  hand: TileInstance[],
  discardPile: RoundState['discardPile'],
  nextEast: EastExposure[],
): EastExposure[] {
  if (nextEast.length < 2) return nextEast
  const { closestLine } = summarizeRackTowardWin({
    hand,
    wallRemaining: r.wall.length,
    discards: discardPile.map((e) => e.tile),
    exposures: r.botExposures,
    playerClaimMelds: nextEast,
    eastTableClaimMelds: nextEast,
    patterns: getActiveCardPatterns(),
  })
  if (!closestLine) return nextEast
  const pat = getActiveCardPatterns().find((p) => p.id === closestLine.id)
  if (!pat) return nextEast
  const reordered = reorderEastExposuresToPatternGroupOrder(nextEast, pat)
  if (!reordered) return nextEast
  return reordered as EastExposure[]
}

function buildRankInputAfterStagedCall(
  r: RoundState,
  handNext: TileInstance[],
  pileNext: RoundState['discardPile'],
  eastMelds: EastExposure[],
): RankSuggestedHandsInput {
  return {
    hand: handNext,
    wallRemaining: r.wall.length,
    discards: pileNext.map((e) => e.tile),
    exposures: r.botExposures,
    playerClaimMelds: eastMelds,
    eastTableClaimMelds: eastMelds,
    patterns: getActiveCardPatterns(),
  }
}

/** Rank input after committing the currently staged call tiles, or `null` if not a committable meld. */
function previewStagedCallRankInput(r: RoundState): RankSuggestedHandsInput | null {
  if (r.mainPhase !== 'call-staging' || !r.activeBotDiscard) return null
  const calledTile = r.activeBotDiscard
  const stagedTiles = r.stagedCallTileIds
    .map((id) => r.hand.find((t) => t.id === id))
    .filter((t): t is TileInstance => !!t)
  if (stagedTiles.length === 0) return null
  if (stagedTiles.length > 5) return null
  if (stagedTiles.length === 1) {
    const meldOk = stagedTiles.every(
      (t) => t.def.cat === 'joker' || tileDefsEqual(t.def, calledTile.def),
    )
    if (!meldOk) return null
    const stagedIds = new Set(r.stagedCallTileIds)
    const handNext = r.hand.filter((t) => !stagedIds.has(t.id))
    const pileNext = r.discardPile.filter((e) => e.tile.id !== calledTile.id)
    const exposure: EastExposure = {
      tiles: [calledTile, ...stagedTiles],
      claimType: 'pung',
      calledTileId: calledTile.id,
    }
    return buildRankInputAfterStagedCall(r, handNext, pileNext, [...r.eastExposures, exposure])
  }
  if (stagedTiles.length < 2) return null
  const meldIsValid = stagedTiles.every(
    (t) => t.def.cat === 'joker' || tileDefsEqual(t.def, calledTile.def),
  )
  if (!meldIsValid) return null
  const claimType = claimTypeForHandTilesFromDiscard(stagedTiles.length)
  if (!claimType) return null
  const stagedIds = new Set(r.stagedCallTileIds)
  const handNext = r.hand.filter((t) => !stagedIds.has(t.id))
  const pileNext = r.discardPile.filter((e) => e.tile.id !== calledTile.id)
  const exposure: EastExposure = {
    tiles: [calledTile, ...stagedTiles],
    claimType,
    calledTileId: calledTile.id,
  }
  const nextEast = orderEastExposuresForClosestCardLine(r, handNext, pileNext, [
    ...r.eastExposures,
    exposure,
  ])
  return buildRankInputAfterStagedCall(r, handNext, pileNext, nextEast)
}

/**
 * `bestTilesAway` after committing the current staged call meld (pung+), or `null` if the staging
 * does not form a committable shape (invalid or incomplete mapping).
 */
function previewStagedCallBestTilesAway(r: RoundState): number | null {
  if (r.mainPhase !== 'call-staging' || !r.activeBotDiscard) return null
  const calledTile = r.activeBotDiscard
  const stagedTiles = r.stagedCallTileIds
    .map((id) => r.hand.find((t) => t.id === id))
    .filter((t): t is TileInstance => !!t)
  if (stagedTiles.length === 0) return null
  if (stagedTiles.length > 5) return null
  if (stagedTiles.length === 1) {
    const meldOk = stagedTiles.every(
      (t) => t.def.cat === 'joker' || tileDefsEqual(t.def, calledTile.def),
    )
    if (!meldOk) return null
    const stagedIds = new Set(r.stagedCallTileIds)
    const handNext = r.hand.filter((t) => !stagedIds.has(t.id))
    const pileNext = r.discardPile.filter((e) => e.tile.id !== calledTile.id)
    const exposure: EastExposure = {
      tiles: [calledTile, ...stagedTiles],
      claimType: 'pung',
      calledTileId: calledTile.id,
    }
    const input = buildRankInputAfterStagedCall(r, handNext, pileNext, [...r.eastExposures, exposure])
    return summarizeRackTowardWin(input).bestTilesAway
  }
  const input = previewStagedCallRankInput(r)
  if (!input) return null
  return summarizeRackTowardWin(input).bestTilesAway
}

function previewAutoSelectedCallRankInput(
  r: RoundState,
  needed: number,
): RankSuggestedHandsInput | null {
  if (
    (r.mainPhase !== 'bot-turn' && r.mainPhase !== 'call-staging') ||
    !r.activeBotDiscard
  ) {
    return null
  }
  if (needed < 2 || needed > 5) return null
  const calledTile = r.activeBotDiscard
  const naturals = findExactMatches(r.hand, calledTile.def)
  const jokers = r.hand.filter((t) => t.def.cat === 'joker')
  const stagedTiles = [...naturals, ...jokers].slice(0, needed)
  if (stagedTiles.length < needed) return null

  const stagedIds = new Set(stagedTiles.map((t) => t.id))
  const handNext = r.hand.filter((t) => !stagedIds.has(t.id))
  const pileNext = r.discardPile.filter((e) => e.tile.id !== calledTile.id)
  const claimType = claimTypeForHandTilesFromDiscard(needed)
  if (!claimType) return null
  const exposure: EastExposure = {
    tiles: [calledTile, ...stagedTiles],
    claimType,
    calledTileId: calledTile.id,
  }
  const eastMelds = orderEastExposuresForClosestCardLine(r, handNext, pileNext, [
    ...r.eastExposures,
    exposure,
  ])

  return buildRankInputAfterStagedCall(r, handNext, pileNext, eastMelds)
}

/**
 * Commit the staged meld: remove staged tiles from hand, add the exposure, return to east-discard;
 * or complete Mah Jongg on the live discard (0 staged = tile to hand only; 1 staged = pair exposure win).
 *
 * Training mode: an invalid meld (mismatched non-joker tiles) is committed anyway so the player
 * sees a warning at discard time. Competition mode kills the hand on commit.
 */
function applyCommitStagedCall(
  r: RoundState,
  gameMode: 'training' | 'competition' = 'competition',
): RoundState {
  if (r.mainPhase !== 'call-staging' || !r.activeBotDiscard) return r
  const calledTile = r.activeBotDiscard
  const stagedTiles = r.stagedCallTileIds
    .map((id) => r.hand.find((t) => t.id === id))
    .filter((t): t is TileInstance => !!t)

  if (stagedTiles.length === 0) {
    const chk: CallValidationRoundSlice = {
      mainPhase: 'bot-turn',
      activeBotDiscard: calledTile,
      hand: r.hand,
      eastExposures: r.eastExposures,
      botExposures: r.botExposures,
      wall: r.wall,
      discardPile: r.discardPile,
    }
    if (hasLegalMahjongOnBotDiscard(chk)) {
      return applyDeclareMahjong({ ...r, mainPhase: 'bot-turn' })
    }
    return r
  }

  if (stagedTiles.length === 1) {
    const meldOk = stagedTiles.every(
      (t) => t.def.cat === 'joker' || tileDefsEqual(t.def, calledTile.def),
    )
    if (!meldOk) {
      if (gameMode === 'training') return r
      return applyDeadHand(r, 'invalid-call-meld')
    }
    const stagedIds = new Set(r.stagedCallTileIds)
    const handNext = r.hand.filter((t) => !stagedIds.has(t.id))
    const pileNext = r.discardPile.filter((e) => e.tile.id !== calledTile.id)
    const exposure: EastExposure = {
      tiles: [calledTile, ...stagedTiles],
      claimType: 'pung',
      calledTileId: calledTile.id,
    }
    const eastMelds = [...r.eastExposures, exposure]
    const { bestTilesAway } = summarizeRackTowardWin({
      hand: handNext,
      wallRemaining: r.wall.length,
      discards: pileNext.map((e) => e.tile),
      exposures: r.botExposures,
      playerClaimMelds: eastMelds,
      eastTableClaimMelds: eastMelds,
    })
    if (bestTilesAway !== 0) return r
    const eastOrdered = orderEastExposuresForClosestCardLine(r, handNext, pileNext, eastMelds)
    const botLabel = BOT_LABELS[r.activeBotIndex as 0 | 1 | 2]!
    return applyBotsJokerSwapsFromEast({
      ...r,
      hand: handNext,
      discardPile: pileNext,
      eastExposures: eastOrdered,
      mainPhase: 'mahjong-declared',
      activeBotIndex: null,
      activeBotDiscard: null,
      botTurnBanner: null,
      pendingEastDiscardTile: null,
      drawnTileId: null,
      selectedHandTileId: null,
      stagedCallTileIds: [],
      playerWinMethod: { type: 'called-discard', botLabel, tile: calledTile.def },
    })
  }

  if (stagedTiles.length < 2 || stagedTiles.length > 5) return r
  // Every staged hand tile must exactly match the called tile's def or be a joker. In competition
  // mode an invalid meld kills the hand immediately; training mode commits anyway so the player
  // sees a warning when they try to discard.
  const meldIsValid = stagedTiles.every(
    (t) => t.def.cat === 'joker' || tileDefsEqual(t.def, calledTile.def),
  )
  if (!meldIsValid && gameMode !== 'training') {
    return applyDeadHand(r, 'invalid-call-meld')
  }
  const claimType = claimTypeForHandTilesFromDiscard(stagedTiles.length)
  if (!claimType) return r
  const stagedIds = new Set(r.stagedCallTileIds)
  const handNext = r.hand.filter((t) => !stagedIds.has(t.id))
  const pileNext = r.discardPile.filter((e) => e.tile.id !== calledTile.id)
  const exposure: EastExposure = {
    tiles: [calledTile, ...stagedTiles],
    claimType,
    calledTileId: calledTile.id,
  }
  const nextEast = orderEastExposuresForClosestCardLine(r, handNext, pileNext, [
    ...r.eastExposures,
    exposure,
  ])
  const { bestTilesAway: awayOpen } = summarizeRackTowardWin({
    hand: handNext,
    wallRemaining: r.wall.length,
    discards: pileNext.map((e) => e.tile),
    exposures: r.botExposures,
    playerClaimMelds: nextEast,
    eastTableClaimMelds: nextEast,
  })
  if (awayOpen === 0) {
    const botLabel = BOT_LABELS[r.activeBotIndex as 0 | 1 | 2]!
    return applyBotsJokerSwapsFromEast({
      ...r,
      hand: handNext,
      discardPile: pileNext,
      eastExposures: nextEast,
      mainPhase: 'mahjong-declared',
      activeBotIndex: null,
      activeBotDiscard: null,
      botTurnBanner: null,
      pendingEastDiscardTile: null,
      drawnTileId: null,
      selectedHandTileId: null,
      stagedCallTileIds: [],
      callAmendableAfterClaimTileId: null,
      callAmendFromBotIndex: null,
      playerWinMethod: { type: 'called-discard', botLabel, tile: calledTile.def },
    })
  }
  return applyBotsJokerSwapsFromEast({
    ...r,
    hand: handNext,
    discardPile: pileNext,
    eastExposures: nextEast,
    mainPhase: 'east-discard',
    activeBotIndex: null,
    activeBotDiscard: null,
    botTurnBanner: null,
    pendingEastDiscardTile: null,
    drawnTileId: null,
    selectedHandTileId: null,
    stagedCallTileIds: [],
    callAmendableAfterClaimTileId: null,
    callAmendFromBotIndex: null,
  })
}


/**
 * Player declares Mah Jongg on the active bot's discard.
 * The discard is added to East's hand (completing the winning hand).
 * Win validation comes in a later step; this records the claim.
 */
function applyDeclareMahjong(r: RoundState): RoundState {
  if ((r.mainPhase !== 'bot-turn' && r.mainPhase !== 'call-staging') || !r.activeBotDiscard) return r
  const calledTile = r.activeBotDiscard
  const pileNext = r.discardPile.filter((e) => e.tile.id !== calledTile.id)
  const botLabel = BOT_LABELS[r.activeBotIndex as 0 | 1 | 2]!
  const flyFrom =
    r.activeBotIndex != null ? handTileFlyInFromBotSeat(r.activeBotIndex as 0 | 1 | 2) : ('across' as const)
  return {
    ...r,
    hand: [...r.hand, calledTile],
    discardPile: pileNext,
    mainPhase: 'mahjong-declared',
    activeBotIndex: null,
    activeBotDiscard: null,
    botTurnBanner: null,
    drawnTileId: null,
    selectedHandTileId: null,
    stagedCallTileIds: [],
    playerWinMethod: { type: 'called-discard', botLabel, tile: calledTile.def },
    handTileFlyIn: { ids: [calledTile.id], from: flyFrom },
  }
}

/** Self-draw Mah Jongg: player declares on their own drawn tile (east-discard phase). */
function applyDeclareMahjongSelfDraw(r: RoundState): RoundState {
  if (r.mainPhase !== 'east-discard' || !r.drawnTileId) return r
  const drawnTile = r.hand.find((t) => t.id === r.drawnTileId)
  if (!drawnTile) return r
  return {
    ...r,
    playerWinMethod: { type: 'self-draw', tile: drawnTile.def },
    mainPhase: 'mahjong-declared',
    drawnTileId: null,
    selectedHandTileId: null,
    pendingEastDiscardTile: null,
  }
}

/** Suggested-hand filter row: pressable pill with label inside (matches menu radio chips). */
function AppMenuFilterToggleButton({
  pressed,
  dimmed = false,
  onToggle,
  children,
}: {
  pressed: boolean
  dimmed?: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={[
        'btn',
        'app-menu-tray__diff-btn',
        'app-menu-modal__sh-filter-btn',
        pressed ? 'app-menu-tray__diff-btn--on' : '',
        dimmed ? 'app-menu-modal__sh-filter-btn--dimmed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-pressed={pressed}
      onClick={onToggle}
    >
      {children}
    </button>
  )
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
  const replayOpeningDeckRef = useRef<TileInstance[] | null>(null)
  const [round, setRound] = useState<RoundState>(() => {
    const r = createNewRound(
      readTenJokersEnabledFromStorage(),
      readBlankTilesEnabledFromStorage(),
      readBlankTileCountFromStorage(),
    )
    replayOpeningDeckRef.current = roundOpeningDeckOrder(r)
    return r
  })
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
  const [suggestedPanelHandsOn, setSuggestedPanelHandsOn] = useState(false)
  const suggestedHandsPopupRef = useRef<HTMLDivElement>(null)
  const eastExposureRackTopRef = useRef<HTMLDivElement>(null)
  const handPanelRef = useRef<HTMLElement>(null)
  /** While true, ResizeObserver / visualViewport must not rewrite `--hand-panel-cqw` (mobile drag). */
  const handPanelCqwFrozenRef = useRef(false)
  const refreshHandPanelCqwRef = useRef<() => void>(() => {})
  const [suggestedDiscardOverlayBounds, setSuggestedDiscardOverlayBounds] = useState({
    topExtendPx: 0,
    bottomExtendPx: 0,
    contentHeightPx: 0,
    viewportTopPx: 0,
    viewportLeftPx: 0,
    viewportWidthPx: 0,
    viewportBottomPx: 0,
  })
  const [suggestedPinnedHandKeys, setSuggestedPinnedHandKeys] = useState<string[]>([])
  const toggleSuggestedPinnedHandKey = useCallback((key: string) => {
    setSuggestedPinnedHandKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }, [])
  const [suggestedSuppressedHandKey, setSuggestedSuppressedHandKey] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuOpenPrevRef = useRef(false)
  const menuContainerRef = useRef<HTMLDivElement>(null)
  const [blankTilesEnabled, setBlankTilesEnabled] = useState(() => readBlankTilesEnabledFromStorage())
  const [blankTileCount, setBlankTileCount] = useState<BlankTileCount>(() =>
    readBlankTileCountFromStorage(),
  )
  const [tenJokersEnabled, setTenJokersEnabled] = useState(() => readTenJokersEnabledFromStorage())
  const [wallGameReviewing, setWallGameReviewing] = useState(false)
  const [mahjongWinReviewing, setMahjongWinReviewing] = useState(false)
  const [botMahjongWinReviewing, setBotMahjongWinReviewing] = useState(false)
  const [suggestedPanelTilesOn, setSuggestedPanelTilesOn] = useState(false)
  /** Strip slot rows in the suggested-hands tray are expensive; defer so the menu toggle paints first. */
  const deferredSuggestedPanelTilesOn = useDeferredValue(suggestedPanelTilesOn)
  const toggleSuggestedPanelTilesOn = useCallback(() => {
    setSuggestedPanelTilesOn((v) => !v)
  }, [])
  const [suggestedHandsUncheckedSections, setSuggestedHandsUncheckedSections] = useState<Set<string>>(
    () => readUncheckedSectionsFromStorage(),
  )
  const [suggestedHandsHideConcealed, setSuggestedHandsHideConcealed] = useState<boolean>(() =>
    readHideConcealedHandsFromStorage(),
  )

  // ── Game options (persisted) ──────────────────────────────────────────────
  const [botWinsEnabled, setBotWinsEnabled] = useState<boolean>(() => readBotWinsEnabledFromStorage())
  const animationsEnabled = true
  const [colorButtonsEnabled, setColorButtonsEnabled] = useState<boolean>(() => readColorButtonsFromStorage())

  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>(() => readBotDifficultyFromStorage())
  const botDifficultyRef = useRef(botDifficulty)
  botDifficultyRef.current = botDifficulty
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
  const [deadTileHintEnabled, setDeadTileHintEnabled] = useState<boolean>(() =>
    readDeadTileHintFromStorage(),
  )
  const [concealedHandReminderEnabled, setConcealedHandReminderEnabled] = useState<boolean>(() =>
    readConcealedHandReminderFromStorage(),
  )
  const [undoEnabled, setUndoEnabled] = useState<boolean>(() => readUndoFromStorage())
  const setTileGraphicsMode = useCallback((g: TileGraphics) => {
    setTileGraphics(g)
    persistTileGraphicsChoice(g)
  }, [])

  const setBotDifficultyLevel = useCallback((d: BotDifficulty) => {
    setBotDifficulty(d)
    try {
      localStorage.setItem(LS_KEY_BOT_DIFFICULTY, d)
    } catch {
      /* ignore */
    }
  }, [])

  const toggleBotWins = useCallback(() => {
    setBotWinsEnabled((v) => {
      const next = !v
      try {
        localStorage.setItem(LS_KEY_BOT_WINS, next ? 'true' : 'false')
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const toggleTenJokers = useCallback(() => {
    setTenJokersEnabled((v) => {
      const next = !v
      try {
        localStorage.setItem(LS_KEY_TEN_JOKERS, next ? 'true' : 'false')
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const toggleBlankTiles = useCallback(() => {
    setBlankTilesEnabled((v) => {
      const next = !v
      try {
        localStorage.setItem(LS_KEY_BLANK_TILES, next ? 'true' : 'false')
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const setBlankTileCountLevel = useCallback((count: BlankTileCount) => {
    setBlankTileCount(count)
    setBlankTilesEnabled(true)
    try {
      localStorage.setItem(LS_KEY_BLANK_TILE_COUNT, String(count))
      localStorage.setItem(LS_KEY_BLANK_TILES, 'true')
    } catch {
      /* ignore */
    }
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

  // Keep a ref so pure-function callbacks always see the current setting value.
  const botWinsEnabledRef = useRef(botWinsEnabled)
  const blankTilesEnabledRef = useRef(blankTilesEnabled)
  const blankTileCountRef = useRef(blankTileCount)
  const tenJokersEnabledRef = useRef(tenJokersEnabled)
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
    setDeadTileHintEnabled((prev) => {
      const d = readDeadTileHintFromStorage()
      return prev === d ? prev : d
    })
    setConcealedHandReminderEnabled((prev) => {
      const c = readConcealedHandReminderFromStorage()
      return prev === c ? prev : c
    })
    setUndoEnabled((prev) => {
      const u = readUndoFromStorage()
      return prev === u ? prev : u
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
      } else if (e.key === LS_KEY_DEAD_TILE_HINT) {
        if (e.newValue == null) return
        setDeadTileHintEnabled(e.newValue === 'true' || e.newValue === '1')
      } else if (e.key === LS_KEY_CONCEALED_HAND_REMINDER) {
        if (e.newValue == null) return
        setConcealedHandReminderEnabled(e.newValue === 'true' || e.newValue === '1')
      } else if (e.key === LS_KEY_UNDO) {
        if (e.newValue == null) return
        setUndoEnabled(e.newValue === 'true' || e.newValue === '1')
      } else if (e.key === SUGGESTED_HANDS_UNCHECKED_SECTIONS_KEY) {
        if (e.newValue == null) return
        setSuggestedHandsUncheckedSections(readUncheckedSectionsFromStorage())
      } else if (e.key === HIDE_CONCEALED_HANDS_STORAGE_KEY) {
        if (e.newValue == null) return
        setSuggestedHandsHideConcealed(readHideConcealedHandsFromStorage())
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
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const discardTrackerPanelRef = useRef<HTMLElement>(null)

  const lastSuggestedPanelOpenRef = useRef(suggestedPanelHandsOn)
  useEffect(() => {
    const wasOpen = lastSuggestedPanelOpenRef.current
    if (wasOpen && !suggestedPanelHandsOn) {
      if (suggestedFocusHandKeyRef.current) {
        const k = suggestedFocusHandKeyRef.current
        setSuggestedPinnedHandKeys((prev) => (prev.includes(k) ? prev : [...prev, k]))
      }
    }
    lastSuggestedPanelOpenRef.current = suggestedPanelHandsOn
  }, [suggestedPanelHandsOn])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  useEffect(() => {
    if (menuOpenPrevRef.current && !menuOpen) {
      setMenuCardId(committedCardIdRef.current)
    }
    menuOpenPrevRef.current = menuOpen
  }, [menuOpen])

  const {
    hand,
    wall,
    openingWallTileCount,
    bots,
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

  /** Columns reserved at the left for pinned call melds — hand row shifts right to match. */
  const callMeldInsetCols = useMemo(() => {
    if (mainPhase === 'mahjong-declared' || mainPhase === 'bot-mahjong') return 0
    let n = eastExposures.reduce((sum, exp) => sum + exp.tiles.length, 0)
    if (mainPhase === 'call-staging' && activeBotDiscard) {
      n += 1 + stagedCallTileIds.length
    }
    return n
  }, [eastExposures, mainPhase, activeBotDiscard, stagedCallTileIds])

  const requestPlayableCard = useCallback((next: PlayableCardId) => {
    if (next === menuCardId) return
    const committed = committedCardIdRef.current
    if (next !== committed) {
      const roundAlreadyOver =
        mainPhase === 'wall-game' ||
        mainPhase === 'mahjong-declared' ||
        mainPhase === 'bot-mahjong' ||
        mainPhase === 'dead-hand'
      if (!roundAlreadyOver) {
        setBlockingDialog({ variant: 'different-card-requires-new-game', pendingCardId: next })
        return
      }
    }
    setMenuCardId(next)
  }, [menuCardId, mainPhase])

  const charlestonGlowTileIds = useMemo(() => {
    if (charlestonDone || charlestonNewTileIds.length === 0) return null
    return new Set(charlestonNewTileIds)
  }, [charlestonDone, charlestonNewTileIds])

  /** Natural dragged into the joker swap slot (next to discards); tap Swap — not a discard. */
  const [pendingJokerSwapTileId, setPendingJokerSwapTileId] = useState<string | null>(null)
  const gameModeRef = useRef<'training' | 'competition'>('training')
  const lastDragPointerRef = useRef({ x: 0, y: 0 })
  const globalDragPointerCleanupRef = useRef<(() => void) | null>(null)
  /** Drop on call-initiate: animate the called tile from the release point into the exposure slot. */
  const [callEntryMagnet, setCallEntryMagnet] = useState<{ from: { x: number; y: number } } | null>(null)
  const [charlestonPassError, setCharlestonPassError] = useState<string | null>(null)
  /** Charleston pass button: exit animation on pass-strip before `sendCharlestonPass` runs. */
  const [passStripFlyOut, setPassStripFlyOut] = useState<PassStripFlyOutFrom | null>(null)
  const passStripFlyoutTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
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

  const undoAction = useCallback(() => {
    if (passStripFlyoutTimerRef.current) {
      clearTimeout(passStripFlyoutTimerRef.current)
      passStripFlyoutTimerRef.current = null
    }
    setPassStripFlyOut(null)
    const stack = historyRef.current
    if (stack.length === 0) return
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
    /** ~one `tile-drop-in` duration (340ms) after the last tile’s delay, plus buffer. */
    const clearMs = 340 + waveTailMs + 90
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
   * Deferred snapshots of the rack inputs that feed the heavy suggested-hands analysis
   * (`rankSuggestedHands` over the whole card book, plus the per-pattern greedy rack-highlight
   * passes). Tile clicks — staging a discard, returning it, skipping a bot discard — mutate `hand`
   * and `pendingEastDiscardTile`; reading them through `useDeferredValue` lets the tile movement
   * paint immediately on the urgent render while the analysis recomputes a frame later at low
   * priority. The rack itself still renders from the live `hand`, so only the panel/highlights lag.
   */
  const deferredHand = useDeferredValue(hand)
  const deferredPendingEastDiscardTile = useDeferredValue(pendingEastDiscardTile)

  /**
   * Same ids as `rackForSuggestedHandsUi` (below), but jokers in open melds use the tile they represent
   * for distance / strip matching (NMJL) — declared early for joker-swap hint bounce timing.
   */
  const rackForSuggestedPatternMatch = useMemo(
    () => {
      const exposureIds = new Set(eastExposures.flatMap((e) => e.tiles).map((t) => t.id))
      const rack = tileInstancesWithClaimMeldJokersResolved(
        [
          ...deferredHand,
          ...(deferredPendingEastDiscardTile ? [deferredPendingEastDiscardTile] : []),
          ...(passSlots.filter(Boolean) as TileInstance[]),
        ],
        eastExposures,
      )
      return [...rack].sort((a, b) => Number(exposureIds.has(b.id)) - Number(exposureIds.has(a.id)))
    },
    [deferredHand, deferredPendingEastDiscardTile, passSlots, eastExposures],
  )

  const suggestedHandsExposureTileIds = useMemo((): ReadonlySet<string> | undefined => {
    const ids = eastExposures.flatMap((e) => e.tiles).map((t) => t.id)
    return ids.length > 0 ? new Set(ids) : undefined
  }, [eastExposures])

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

  /** Joker swap hint (dock-bounce): same targets as `jokerSwapHintTargetIds`, animations only. */
  const activeJokerSwapHintBounceIds = useMemo(() => {
    if (!jokerSwapHintTargetIds || !animationsEnabled) return null
    return jokerSwapHintTargetIds
  }, [jokerSwapHintTargetIds, animationsEnabled])

  const suggestedLineFocusActiveForJokerSwapHint = useMemo(() => {
    if (!suggestedFocusHandKey) return false
    if (suggestedSuppressedHandKey === suggestedFocusHandKey) return false
    if (
      mainPhase === 'mahjong-declared' ||
      mainPhase === 'bot-mahjong' ||
      mainPhase === 'dead-hand' ||
      mainPhase === 'wall-game'
    )
      return false
    return true
  }, [suggestedFocusHandKey, suggestedSuppressedHandKey, mainPhase])

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
    const afterDelay = elapsed - JOKER_SWAP_HINT_BOUNCE_DELAY_MS
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
  }, [activeJokerSwapHintBounceIds])

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
      JOKER_SWAP_HINT_BOUNCE_DELAY_MS +
      JOKER_SWAP_HINT_BOUNCE_DURATION_MS * jokerSwapHintBounceIterationCount
    const t = window.setTimeout(() => setJokerSwapBounceAnimDone(true), totalMs)
    return () => window.clearTimeout(t)
  }, [jokerSwapBounceIsActive, jokerSwapHintBounceIterationCount])

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
    let handForRank = deferredHand
    if (mainPhase === 'call-staging' || mainPhase === 'bot-turn') {
      if (stagedCallTileIds.length > 0) {
        const staged = new Set(stagedCallTileIds)
        handForRank = handForRank.filter((t) => !staged.has(t.id))
      }
      // Hand jokers bound for an open claim must not reduce tiles-away until the exposure commits.
      if (activeBotDiscard) {
        handForRank = handForRank.filter((t) => t.def.cat !== 'joker')
      }
    }
    return {
      hand: handForRank,
      wallRemaining: wall.length,
      discards: discardTiles,
      exposures: botExposures,
      playerClaimMelds: eastExposures,
      eastTableClaimMelds: eastExposures,
      patterns: cardPatterns,
    }
  }, [
    deferredHand,
    mainPhase,
    stagedCallTileIds,
    activeBotDiscard,
    wall.length,
    discardTiles,
    botExposures,
    eastExposures,
    cardPatterns,
  ])

  const eastSuggestedHands = useMemo(() => {
    if (mainPhase === 'mahjong-declared' || mainPhase === 'bot-mahjong' || mainPhase === 'dead-hand' || mainPhase === 'wall-game') return []
    return rankSuggestedHands(suggestedRankInput)
  }, [mainPhase, suggestedRankInput])

  /** Menu category labels: still on, but muted when exposures rule out every hand in that section. */
  const suggestedHandsExposureAvailableSections = useMemo(
    () =>
      suggestedHandSectionsAvailableWithClaimMelds(cardPatterns, eastExposures, cardSectionOrder),
    [cardPatterns, eastExposures, cardSectionOrder],
  )

  /** Hand + staged tiles + East exposures — tile faces on the rack and strip (jokers stay jokers). */
  const rackForSuggestedHandsUi = useMemo(
    () => [
      ...hand,
      ...(pendingEastDiscardTile ? [pendingEastDiscardTile] : []),
      ...(passSlots.filter(Boolean) as TileInstance[]),
      ...eastExposures.flatMap((e) => e.tiles),
    ],
    [hand, pendingEastDiscardTile, passSlots, eastExposures],
  )

  /**
   * True when the focused suggested-hand line is concealed (NMJL "C") — drives the red CONCEALED
   * annotation under "Call" in the rack action well so the player sees they can't claim a discard
   * for an exposure on that line. Cleared with the focus, in win/dead/wall-game states.
   */
  const focusedHandIsConcealed = useMemo(() => {
    if (!suggestedFocusHandKey) return false
    if (
      mainPhase === 'mahjong-declared' ||
      mainPhase === 'bot-mahjong' ||
      mainPhase === 'dead-hand' ||
      mainPhase === 'wall-game'
    ) return false
    const variantSep = ['::tier::', '::oc::', '::ocall::']
      .map((s) => suggestedFocusHandKey.indexOf(s))
      .filter((i) => i >= 0)
      .reduce((m, i) => (m < 0 ? i : Math.min(m, i)), -1)
    const patternId =
      variantSep >= 0 ? suggestedFocusHandKey.slice(0, variantSep) : suggestedFocusHandKey
    const p = cardPatterns.find((x) => x.id === patternId)
    return !!p?.closed
  }, [suggestedFocusHandKey, mainPhase, cardPatterns])
  focusedHandIsConcealedRef.current = focusedHandIsConcealed

  const suggestedTileGuide = useMemo(() => {
    // Rack + exposure highlights follow the focused line whenever one is selected — independent of
    // the "Tiles" toggle (that toggle only adds pattern previews inside the suggested-hands list).
    // Reads the DEFERRED focus key so this greedy recompute does not stall rapid taps (see decl).
    if (!deferredSuggestedFocusHandKey || mainPhase === 'mahjong-declared' || mainPhase === 'bot-mahjong' || mainPhase === 'dead-hand' || mainPhase === 'wall-game') return null
    if (suggestedSuppressedHandKey === deferredSuggestedFocusHandKey) return null
    const greedyUiOpts =
      suggestedHandsExposureTileIds && suggestedHandsExposureTileIds.size > 0
        ? { exposureTileIds: suggestedHandsExposureTileIds }
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
    const p = cardPatterns.find((x) => x.id === patternId)
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

    const computeBlankExchangeIds = (pinnedP: PracticePattern): Set<string> => {
      const blankIds = new Set<string>()
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
        }
      }
      return blankIds
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
        for (const pinnedP of pinnedPatterns) {
          const ids = computeAvailableRackHighlightIds(pinnedP)
          for (const id of ids) unionIds.add(id)
          for (const id of computeBlankExchangeIds(pinnedP)) unionBlankIds.add(id)
        }
        return { bestIds: unionIds, blankExchangeIds: unionBlankIds }
      }
    }

    return {
      bestIds: computeAvailableRackHighlightIds(p),
      blankExchangeIds: computeBlankExchangeIds(p),
    }
  }, [deferredSuggestedFocusHandKey, suggestedSuppressedHandKey, mainPhase, rackForSuggestedPatternMatch, suggestedHandsExposureTileIds, cardPatterns, deadTileHintEnabled, discardTiles, botExposures, blankExchangeEligibleDiscardDefs])

  /**
   * Bot exposure rings for the focused line: naturals that match strip “need” slots (dead tiles you
   * want), plus exposed jokers you can redeem with a matching natural in hand (joker swap).
   */
  const botExposureSuggestedTileGuide = useMemo(() => {
    if (!deferredSuggestedFocusHandKey || mainPhase === 'mahjong-declared' || mainPhase === 'bot-mahjong' || mainPhase === 'dead-hand' || mainPhase === 'wall-game') return null
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
    )
    // Belt-and-suspenders: keep bot joker rings in sync with joker-swap eligibility on your rack.
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
    mainPhase,
    rackForSuggestedPatternMatch,
    botExposures,
    deferredHand,
    deferredPendingEastDiscardTile,
    eastExposures,
    suggestedHandsExposureTileIds,
    cardPatterns,
  ])

  const suggestedDiscardGuideActive = useMemo(() => {
    if (!deferredSuggestedFocusHandKey) return false
    if (suggestedSuppressedHandKey === deferredSuggestedFocusHandKey) return false
    if (
      mainPhase === 'mahjong-declared' ||
      mainPhase === 'bot-mahjong' ||
      mainPhase === 'dead-hand' ||
      mainPhase === 'wall-game'
    ) {
      return false
    }
    return true
  }, [deferredSuggestedFocusHandKey, suggestedSuppressedHandKey, mainPhase])

  /** Discards that match naturals the focused line is still short (incoming slot + discard strip). */
  const suggestedDiscardNeedIds = useMemo(() => {
    if (!suggestedDiscardGuideActive) return null
    return computeSuggestedDiscardNeedHighlightIds(
      deferredSuggestedFocusHandKey,
      rackForSuggestedPatternMatch,
      discardPile.map((e) => e.tile),
      suggestedHandsExposureTileIds,
      cardPatterns,
    )
  }, [
    suggestedDiscardGuideActive,
    deferredSuggestedFocusHandKey,
    rackForSuggestedPatternMatch,
    discardPile,
    suggestedHandsExposureTileIds,
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
    )
  }, [
    suggestedDiscardGuideActive,
    deferredSuggestedFocusHandKey,
    rackForSuggestedPatternMatch,
    suggestedHandsExposureTileIds,
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
      return { bestIds: merged, blankExchangeIds: suggestedTileGuide.blankExchangeIds }
    }
    return {
      bestIds: suggestedTileGuide.bestIds,
      blankExchangeIds: suggestedTileGuide.blankExchangeIds,
    }
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
      const focusedPattern = cardPatterns.find((p) => p.id === patternId)
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
        const p = cardPatterns.find((x) => x.id === patternId)
        return !p || isSuggestedHandSectionFilterEnabled(p.section, suggestedHandsUncheckedSections)
      })
      return next.length === prev.length ? prev : next
    })
  }, [suggestedHandsUncheckedSections, cardPatterns, clearSuggestedDeadGuidesForHandKey])

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
        ? focusedPatternNeedForDeadHintDef(suggestedFocusHandKey, lastDiscard.def, cardPatterns)
        : null
    const unavailableDeadHintTiles = [
      ...discardPile.map((e) => e.tile),
      ...botExposures.flatMap((e) => e.tiles),
    ]
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
      focusedPatternNeedForDeadHintDef(suggestedFocusHandKey, def, cardPatterns) != null

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
    rackForSuggestedHandsUi,
    cardPatterns,
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
    const out: Record<string, DeadCauseHint> = {}
    const keysToProbe = new Set<string>([
      ...Object.keys(suggestedDeadTileGuidesByKey),
      ...(suggestedFocusHandKey ? [suggestedFocusHandKey] : []),
    ])
    for (const key of keysToProbe) {
      const live = findFocusedPatternDeadCause(
        key,
        unavailableByKey,
        cardPatterns,
        totalCopiesForDeadHintDef,
        {
          rack: rackForSuggestedPatternMatch,
          exposureTileIds: suggestedHandsExposureTileIds,
        },
      )
      if (live) out[key] = live
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
  ])

  useEffect(() => {
    if (mainPhase === 'mahjong-declared' || mainPhase === 'bot-mahjong' || mainPhase === 'dead-hand' || mainPhase === 'wall-game') {
      setSuggestedFocusHandKey(null)
      setSuggestedPinnedHandKeys([])
      setSuggestedSuppressedHandKey(null)
      setSuggestedDeadTileGuidesByKey({})
      setSuggestedDeadTableGuidesByKey({})
      setSuggestedPanelHandsOn(false)
    }
  }, [mainPhase])

  const handsButtonLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handsButtonLongPressFired = useRef(false)

  const onHandsButtonPointerDown = useCallback(() => {
    if (mainPhase === 'mahjong-declared') return
    handsButtonLongPressFired.current = false
    handsButtonLongPressTimer.current = setTimeout(() => {
      handsButtonLongPressFired.current = true
      setSuggestedFocusHandKey(null)
      setSuggestedPinnedHandKeys([])
      setSuggestedSuppressedHandKey(null)
      setSuggestedDeadTileGuidesByKey({})
      setSuggestedDeadTableGuidesByKey({})
    }, 500)
  }, [mainPhase])

  const onHandsButtonPointerUpOrLeave = useCallback(() => {
    if (handsButtonLongPressTimer.current != null) {
      clearTimeout(handsButtonLongPressTimer.current)
      handsButtonLongPressTimer.current = null
    }
  }, [])

  const onHandsButtonClick = useCallback(() => {
    if (mainPhase === 'mahjong-declared') return
    if (handsButtonLongPressFired.current) {
      handsButtonLongPressFired.current = false
      return
    }
    setSuggestedPanelHandsOn((v) => !v)
  }, [mainPhase])

  const onSuggestedPatternClick = useCallback((handKey: string) => {
    const isDeselect = suggestedFocusHandKeyRef.current === handKey
    setSuggestedFocusHandKey(isDeselect ? null : handKey)
    setSuggestedSuppressedHandKey(null)
    if (isDeselect) clearSuggestedDeadGuidesForHandKey(handKey)
  }, [clearSuggestedDeadGuidesForHandKey])

  const onSuggestedFocusKeyMigrate = useCallback((nextKey: string | null) => {
    const prevKey = suggestedFocusHandKeyRef.current
    if (nextKey === prevKey) return
    if (nextKey == null) {
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

  const playerWinIntro = useMemo(() => {
    if (!playerWinMethod) return 'You (East) won.'
    const winMethod =
      playerWinMethod.type === 'self-draw'
        ? { how: 'self-draw' as const, tile: playerWinMethod.tile }
        : {
            how: 'called-discard' as const,
            tile: playerWinMethod.tile,
            discardFrom: playerWinMethod.botLabel,
          }
    return formatMahjongWinDescription('You (East)', winMethod)
  }, [playerWinMethod])

  const postGameBotReview = useMemo(() => {
    if (mainPhase !== 'mahjong-declared') return null
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
    const eastRow = {
      label: 'You (East)',
      bestTilesAway: eastAway,
      linesAtMin: eastLines,
      rankInput: eastRankInput,
    }
    const botRows = BOT_LABELS.map((label, idx) => {
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
  }, [mainPhase, bots, hand, wall.length, discardTiles, botExposures, eastExposures, cardPatterns])

  /**
   * On win: full 14 (concealed + exposures) left-to-right in the order of the winning
   * practice line — shown on the main hand row (not the exposure/call strip above it).
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
   * Bot-mahjong end screen: same per-seat layout as Wall Game (East + three bots).
   */
  const postGameBotMahjongReview = useMemo(() => {
    if (mainPhase !== 'bot-mahjong' || !botWin) return null
    const { botIndex, how, tile } = botWin
    const winnerSeat = BOT_LABELS[botIndex]!
    const winnerLabel = `Bot ${botIndex + 1} (${winnerSeat})`
    const winMethod =
      how === 'self-draw'
        ? { how: 'self-draw' as const, tile }
        : { how: 'called-discard' as const, tile, discardFrom: botWin.discardFrom }
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
      label: 'You (East)',
      bestTilesAway: eastAway,
      linesAtMin: eastLines,
      rankInput: eastRankInput,
    }

    const botRows: SeatRow[] = BOT_LABELS.map((label, idx) => {
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
  }, [mainPhase, botWin, bots, hand, wall.length, discardTiles, botExposures, eastExposures, cardPatterns])

  /**
   * Wall game: same per-seat practice-card readout as the Mah Jongg overlays (tiles away,
   * closest line, exposures + concealed sorted). Used only in the wall-game dialog — bot
   * racks stay as called exposures on the table (no full-hand dump into the rail).
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
    const eastRow: WRow = { label: 'You (East)', bestTilesAway: eastAway, linesAtMin: eastLines, rankInput: eastRankInput }

    const botRows: WRow[] = BOT_LABELS.map((label, idx) => {
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
  }, [mainPhase, bots, hand, wall.length, discardTiles, botExposures, eastExposures, cardPatterns])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const [dragOverlayTile, setDragOverlayTile] = useState<TileInstance | null>(null)
  const [dragOverlayMeldTiles, setDragOverlayMeldTiles] = useState<TileInstance[] | null>(null)
  const [dragOverlayRackSuitStacked, setDragOverlayRackSuitStacked] = useState(false)
  /** Set when a blank is dropped on the tracker: the centered tracker becomes tappable to pick a discard. */
  const [blankExchangeOpen, setBlankExchangeOpen] = useState<{ blankTileId: string } | null>(null)
  /** A blank tile is being dragged on your turn — from the rack OR staged in the discard slot —
   * arms the tracker drop zone (shows the orange outline + enables the drop). */
  const blankExchangeDragArmed =
    charlestonDone &&
    mainPhase === 'east-discard' &&
    dragOverlayTile?.def.cat === 'blank' &&
    (hand.some((t) => t.id === dragOverlayTile.id) ||
      pendingEastDiscardTile?.id === dragOverlayTile.id)

  const closeBlankExchange = useCallback(() => {
    setBlankExchangeOpen(null)
  }, [])

  const performBlankExchange = useCallback(
    (chosenDef: TileDef) => {
      const target = blankExchangeOpen
      if (!target) return
      pushRound((r) => {
        if (r.mainPhase !== 'east-discard') return r
        const eligible = discardedDefsForBlankExchange(r.discardPile)
        if (!eligible.some((d) => tileDefsEqual(d, chosenDef))) return r
        const newTile: TileInstance = { id: crypto.randomUUID(), def: chosenDef }

        // The redeemed tile is taken out of the discards: drop one matching entry so its tracker
        // count falls by one (and it stops being exchangeable once none of that type remain).
        const takenIdx = r.discardPile.findIndex(({ tile }) => tileDefsEqual(tile.def, chosenDef))
        const discardWithoutTaken =
          takenIdx >= 0
            ? [...r.discardPile.slice(0, takenIdx), ...r.discardPile.slice(takenIdx + 1)]
            : [...r.discardPile]

        // The blank can be in the hand (dragged to the tracker) or staged in the discard slot
        // (tapped in, then Swap). Either way the redeemed tile lands back in the hand.
        const handIdx = r.hand.findIndex(
          (t) => t.id === target.blankTileId && t.def.cat === 'blank',
        )
        if (handIdx >= 0) {
          const blankTile = r.hand[handIdx]!
          const handNext = [...r.hand]
          handNext[handIdx] = newTile
          return {
            ...r,
            hand: handNext,
            // The given-up blank goes face-up into the discards — shows under B in the tracker.
            discardPile: [...discardWithoutTaken, { tile: blankTile, seat: 'east' }],
            drawnTileId: newTile.id,
            selectedHandTileId: null,
          }
        }
        if (
          r.pendingEastDiscardTile?.id === target.blankTileId &&
          r.pendingEastDiscardTile.def.cat === 'blank'
        ) {
          const blankTile = r.pendingEastDiscardTile
          const insertIdx = Math.min(r.pendingEastDiscardIdx ?? r.hand.length, r.hand.length)
          const handNext = [...r.hand]
          handNext.splice(insertIdx, 0, newTile)
          return {
            ...r,
            hand: handNext,
            // The given-up blank goes face-up into the discards — shows under B in the tracker.
            discardPile: [...discardWithoutTaken, { tile: blankTile, seat: 'east' }],
            pendingEastDiscardTile: null,
            pendingEastDiscardIdx: null,
            drawnTileId: newTile.id,
            selectedHandTileId: null,
          }
        }
        return r
      })
      closeBlankExchange()
    },
    [blankExchangeOpen, pushRound, closeBlankExchange],
  )

  // If the player's turn ends (e.g. undo, new deal) close any open exchange popup.
  useEffect(() => {
    if (mainPhase !== 'east-discard') {
      setBlankExchangeOpen(null)
    }
  }, [mainPhase])
  /** While dragging a Charleston pass tile over the hand, lift it into the hand sortable list so neighbours slide. */
  const [charlestonPassIntoHandPreview, setCharlestonPassIntoHandPreview] = useState<{
    tileId: string
    handPreviewIndex: number
  } | null>(null)
  /**
   * While dragging a hand tile up onto a Charleston pass slot, the pass box wins the drop target so
   * dnd-kit clears the hand's reorder transforms — the slid neighbours would otherwise snap back to
   * their home columns ("slide right"). Holding the lifted tile's id here tells the hand to preview
   * the rack *compacted* (as if the tile were already removed), which matches the dropped state, so
   * there is no jarring snap.
   */
  const [charlestonHandPassStageTileId, setCharlestonHandPassStageTileId] = useState<string | null>(null)
  /** Same idea as Charleston: while dragging staged East discard over the rack, hand list preview + phantom so neighbours slide. */
  const [eastDiscardIntoHandPreview, setEastDiscardIntoHandPreview] = useState<{
    tileId: string
    handPreviewIndex: number
  } | null>(null)

  /** While dragging the live bot discard — mounts the teal call drop box on the exposure row. */
  const [incomingBotDiscardCallDragActive, setIncomingBotDiscardCallDragActive] = useState(false)

  useEffect(() => {
    if (mainPhase !== 'bot-turn' || !activeBotDiscard) {
      setIncomingBotDiscardCallDragActive(false)
    }
  }, [mainPhase, activeBotDiscard])

  const tileDragCollisionDetection = useMemo<CollisionDetection>(
    () => (args) => {
      const aid = String(args.active.id)
      if (parseEastExposureMeldSortId(aid) != null) {
        const meldContainers = args.droppableContainers.filter(
          (c) => parseEastExposureMeldSortId(String(c.id)) != null,
        )
        if (meldContainers.length === 0) return []
        const pointerX = args.pointerCoordinates?.x ?? lastDragPointerRef.current.x
        const activeMeldContainer = meldContainers.find((c) => String(c.id) === aid)
        const activeMeldRect = activeMeldContainer ? args.droppableRects.get(activeMeldContainer.id) : null
        if (
          activeMeldContainer &&
          activeMeldRect &&
          Number.isFinite(pointerX) &&
          pointerX >= activeMeldRect.left &&
          pointerX <= activeMeldRect.left + activeMeldRect.width
        ) {
          // Keep the lifted meld's original slot reachable so neighbours can reopen around it.
          return [
            {
              id: activeMeldContainer.id,
              data: {
                droppableContainer: activeMeldContainer,
                value: 0,
              },
            },
          ]
        }
        const otherMeldContainers = meldContainers.filter((c) => String(c.id) !== aid)
        if (otherMeldContainers.length > 0 && Number.isFinite(pointerX)) {
          const byCenterX = otherMeldContainers
            .map((container) => {
              const rect = args.droppableRects.get(container.id)
              if (!rect) return null
              return {
                container,
                centerX: rect.left + rect.width / 2,
              }
            })
            .filter((x): x is { container: (typeof otherMeldContainers)[number]; centerX: number } => x != null)
            .sort((a, b) => a.centerX - b.centerX)
          const target = byCenterX.find((x) => pointerX < x.centerX) ?? byCenterX[byCenterX.length - 1]
          if (target) {
            return [
              {
                id: target.container.id,
                data: {
                  droppableContainer: target.container,
                  value: Math.abs(pointerX - target.centerX),
                },
              },
            ]
          }
        }
        return closestCenter({
          ...args,
          droppableContainers: otherMeldContainers.length > 0 ? otherMeldContainers : meldContainers,
        })
      }
      const fromPassSlot = passSlots.some((s) => s?.id === aid)
      const fromStagedDiscard = pendingEastDiscardTile?.id === aid
      const fromHandTile = hand.some((t) => t.id === aid)
      const fromBotDiscardForCall = isActiveBotDiscardDrag(aid, activeBotDiscard ?? null)
      const botSeatOverlapHits = (): ReturnType<CollisionDetection> => {
        if (!charlestonDone || !jokerSwapUiActive || (!fromHandTile && !fromStagedDiscard)) return []
        const botSeatContainers = args.droppableContainers.filter(
          (c) => parseBotSeatSwapDropId(String(c.id)) !== null,
        )
        if (botSeatContainers.length === 0) return []
        return rectIntersection({ ...args, droppableContainers: botSeatContainers })
      }

      if (fromBotDiscardForCall && charlestonDone && mainPhase === 'bot-turn') {
        const callContainers = args.droppableContainers.filter(
          (c) => String(c.id) === CALL_INITIATE_FIRST_SLOT_ID,
        )
        const callHits = collisionHitsForTileOverlappingZones(args, [CALL_INITIATE_FIRST_SLOT_ID])
        if (callHits.length > 0) return callHits
        if (callContainers.length > 0) {
          const pointerCall = pointerWithin({ ...args, droppableContainers: callContainers })
          if (pointerCall.length > 0) return pointerCall
        }
        return []
      }

      // Blank tile dragged on your turn — from the rack OR staged in the discard slot — → the sorted
      // discard tracker wins as soon as the tile overlaps it (so it can be dropped anywhere over the
      // tracker boundary). The staged path mirrors how a blank drags out of the main rack.
      if (
        charlestonDone &&
        mainPhase === 'east-discard' &&
        ((fromHandTile && hand.some((t) => t.id === aid && t.def.cat === 'blank')) ||
          (fromStagedDiscard && pendingEastDiscardTile?.def.cat === 'blank'))
      ) {
        const trackerHits = collisionHitsForTileOverlappingZones(args, [BLANK_EXCHANGE_DROP_ID])
        if (trackerHits.length > 0) return trackerHits
      }

      if (fromHandTile || fromBotDiscardForCall || fromPassSlot || fromStagedDiscard) {
        if (!charlestonDone && fromHandTile) {
          // The pass strip is a thin (~1/3-tile) slot strip sitting just above the hand row, with the
          // slots hovering over the right-most hand tiles. Claiming it on any rect overlap let it
          // steal the `over` the instant a tile was lifted slightly toward it — collapsing the in-rack
          // reorder so neighbours (including the tiles under the slots) snapped back to their home
          // columns. Instead, claim once the dragged tile is horizontally over the slot strip AND
          // nudged up onto it — the tile's top edge rising above the slot strip's mid-line. At rack
          // height the tile's top sits at the hand-row top (below that line), so the in-rack reorder
          // keeps running and every tile slides as the drag crosses it; lift the tile onto a slot and
          // the pass box grabs it so it drops straight in.
          const passContainer = args.droppableContainers.find((c) => String(c.id) === PASS_BOX_ID)
          const passRect = passContainer ? args.droppableRects.get(passContainer.id) : null
          const dragRect = args.collisionRect
          if (passContainer && passRect && dragRect) {
            const cx = dragRect.left + dragRect.width / 2
            const horizontallyOverSlots = cx >= passRect.left && cx <= passRect.left + passRect.width
            const slotGrabLine = passRect.top + passRect.height / 2
            const liftedOntoSlots = dragRect.top < slotGrabLine
            if (horizontallyOverSlots && liftedOntoSlots) {
              return [
                {
                  id: passContainer.id,
                  data: { droppableContainer: passContainer, value: 0 },
                },
              ]
            }
          }
        }
        if (charlestonDone && mainPhase === 'east-discard' && (fromHandTile || fromStagedDiscard)) {
          const pointerX = args.pointerCoordinates?.x ?? lastDragPointerRef.current.x
          const pointerY = args.pointerCoordinates?.y ?? lastDragPointerRef.current.y
          const handBankContainer = args.droppableContainers.find((c) => String(c.id) === HAND_BANK_ID)
          const handBankRect = handBankContainer ? args.droppableRects.get(handBankContainer.id) : null
          const pointerOverHandBankHorizontally =
            handBankRect != null &&
            Number.isFinite(pointerX) &&
            pointerX >= handBankRect.left &&
            pointerX <= handBankRect.left + handBankRect.width
          const pointerInHandBank =
            pointerOverHandBankHorizontally &&
            handBankRect != null &&
            Number.isFinite(pointerY) &&
            pointerY >= handBankRect.top &&
            pointerY <= handBankRect.top + handBankRect.height
          // Hand → staging: accept as soon as the dragged tile overlaps the slot (pointer can
          // still be in the hand row while the tile has moved up into the exposure row).
          // Column 14 shares the rack width with the discard slot above — a horizontal-only test
          // wrongly blocked staging until the pointer moved past the right edge of the rack, so
          // this direction uses the full (both-axes) hand-bank test for the fallback.
          if (fromHandTile) {
            const stagingOverlap = collisionHitsForTileOverlappingZones(args, [EAST_DISCARD_STAGING_ID])
            if (stagingOverlap.length > 0) return stagingOverlap
            if (!pointerInHandBank) {
              const stagingContainers = args.droppableContainers.filter(
                (c) => String(c.id) === EAST_DISCARD_STAGING_ID,
              )
              if (stagingContainers.length > 0) {
                const pointerStaging = pointerWithin({ ...args, droppableContainers: stagingContainers })
                if (pointerStaging.length > 0) return pointerStaging
              }
            }
          }
          // Staging → hand (returning the staged tile to the rack): keep the hand reorder / insert
          // preview slide alive while the pointer is anywhere over the rack columns. The staged tile
          // starts out overlapping the discard slot, so a tile-overlap or vertical test would
          // suppress the rack slide for most of the drag (the tile just snaps in on release). Staging
          // only wins again once the pointer leaves the hand row horizontally.
          if (fromStagedDiscard && !pointerOverHandBankHorizontally) {
            const stagingHits = collisionHitsForTileOverlappingZones(args, [EAST_DISCARD_STAGING_ID])
            if (stagingHits.length > 0) return stagingHits
            const stagingContainers = args.droppableContainers.filter(
              (c) => String(c.id) === EAST_DISCARD_STAGING_ID,
            )
            if (stagingContainers.length > 0) {
              const pointerStaging = pointerWithin({ ...args, droppableContainers: stagingContainers })
              if (pointerStaging.length > 0) return pointerStaging
            }
          }
        }
        if (
          charlestonDone &&
          mainPhase === 'bot-turn' &&
          fromHandTile
        ) {
          const callContainers = args.droppableContainers.filter(
            (c) => String(c.id) === CALL_INITIATE_FIRST_SLOT_ID,
          )
          const callHits = collisionHitsForTileOverlappingZones(args, [CALL_INITIATE_FIRST_SLOT_ID])
          if (callHits.length > 0) return callHits
          if (callContainers.length > 0) {
            const pointerCall = pointerWithin({ ...args, droppableContainers: callContainers })
            if (pointerCall.length > 0) return pointerCall
          }
        }
      }

      const hits = pointerWithin(args)
      if (hits.length > 0) {
        const pick = (id: string | number) => hits.find((c) => c.id === id)
        if (!charlestonDone) {
          const fromHand = fromHandTile
          const passOccupant = hits.find((h) => passSlots.some((s) => s?.id === h.id))
          if (fromHand && passOccupant) {
            return [passOccupant]
          }
          if (
            fromPassSlot &&
            passOccupant &&
            String(passOccupant.id) !== aid
          ) {
            return [passOccupant]
          }
          const passBoxHit = hits.find((h) => String(h.id) === PASS_BOX_ID)
          if (fromPassSlot && passBoxHit) {
            return [passBoxHit]
          }
        }
        if (fromPassSlot || fromStagedDiscard) {
          const handTileIds = new Set(hand.map((t) => t.id))
          const overHandTile = hits.find((h) => handTileIds.has(String(h.id)))
          const handBankHit = pick(HAND_BANK_ID)
          if (overHandTile || handBankHit) {
            const pointerX = args.pointerCoordinates?.x ?? lastDragPointerRef.current.x
            const handTileContainers = args.droppableContainers.filter((c) => handTileIds.has(String(c.id)))
            if (Number.isFinite(pointerX) && handTileContainers.length > 0) {
              const byCenterX = handTileContainers
                .map((container) => {
                  const rect = args.droppableRects.get(container.id)
                  if (!rect) return null
                  return {
                    container,
                    centerX: rect.left + rect.width / 2,
                  }
                })
                .filter((x): x is { container: (typeof handTileContainers)[number]; centerX: number } => x != null)
                .sort((a, b) => a.centerX - b.centerX)
              const target = byCenterX.find((x) => pointerX < x.centerX)
              if (target) {
                return [
                  {
                    id: target.container.id,
                    data: {
                      droppableContainer: target.container,
                      value: Math.abs(pointerX - target.centerX),
                    },
                  },
                ]
              }
              // Pointer is to the right of every tile centre → appending past the last tile.
              // Resolve to the hand-bank zone (not the last tile) so crossing the last tile's
              // centre actually changes `over` and re-fires `onDragOver`. If both zones map to
              // the last tile, dnd-kit never re-fires while the pointer stays over it and the
              // gap between the two right-most tiles can never open.
              if (handBankHit) return [handBankHit]
            }
            if (overHandTile) return [overHandTile]
            if (handBankHit) return [handBankHit]
          }
        }
        // call-staging: staged tiles are useSortable, so hand↔exposure drag is
        // handled by closestCenter detecting staged tile IDs as drop targets.
        // Only fall back to the zone id when no staged tile is under the pointer
        // (e.g. dragging over the called tile or empty exposure space).
        if (
          charlestonDone &&
          mainPhase === 'call-staging' &&
          !stagedCallTileIds.includes(aid) &&
          pick(CALL_STAGING_DROP_ID) &&
          !hits.some((h) => stagedCallTileIds.includes(String(h.id)))
        ) {
          return [pick(CALL_STAGING_DROP_ID)!]
        }
        // Prefer bot/East exposure melds over the discard-tray staging zone (full-area droppable under the overlay).
        if (charlestonDone && jokerSwapUiActive) {
          const eastMeldHit = hits.find((h) => parseEastExposureSwapDropId(String(h.id)) !== null)
          if (eastMeldHit) return [eastMeldHit]
          const eastSeatHit = hits.find((h) => String(h.id) === EAST_SEAT_SWAP_ID)
          if (eastSeatHit) return [eastSeatHit]
          const meldHit = hits.find((h) => parseBotExposureSwapDropId(String(h.id)) !== null)
          if (meldHit) return [meldHit]
          const seatHit = hits.find((h) => parseBotSeatSwapDropId(String(h.id)) !== null)
          if (seatHit) return [seatHit]
        }
        const botSeatOverlap = botSeatOverlapHits()
        if (botSeatOverlap.length > 0) return [botSeatOverlap[0]!]
        if (hand.some((t) => t.id === aid)) {
          const handTileIds = new Set(hand.map((t) => t.id))
          const overHandRack =
            hits.some((h) => handTileIds.has(String(h.id))) ||
            hits.some((h) => String(h.id) === HAND_BANK_ID)
          if (overHandRack) {
            // Rack reorder is driven off the lifted tile's *edges* crossing neighbour *centres*,
            // not off the finger position or a "left my home column" test. The dragged tile's
            // measured rect (collisionRect) is the visible lifted tile translated by the drag; the
            // neighbour rects stay at their original (pre-shift) positions while dragging, so their
            // centres are stable thresholds. A neighbour only yields once the dragged tile's leading
            // edge has travelled *past that neighbour's centre* — i.e. the tile is more than half
            // overlapped — instead of jumping the instant the two tiles touch.
            type RackEntry = { id: string; container: (typeof args.droppableContainers)[number]; centerX: number }
            const rackTiles: RackEntry[] = hand
              .map((t): RackEntry | null => {
                const container = args.droppableContainers.find((c) => String(c.id) === t.id)
                const rect = container ? args.droppableRects.get(container.id) : null
                if (!container || !rect) return null
                return { id: t.id, container, centerX: rect.left + rect.width / 2 }
              })
              .filter((x): x is RackEntry => x != null)
              .sort((a, b) => a.centerX - b.centerX)

            const activeIdx = rackTiles.findIndex((x) => x.id === aid)
            const activeEntry = activeIdx >= 0 ? rackTiles[activeIdx] : null
            const activeHandRect = activeEntry ? args.droppableRects.get(activeEntry.container.id) : null

            if (activeEntry && activeHandRect) {
              const halfW = activeHandRect.width / 2
              const centerX =
                args.collisionRect != null
                  ? args.collisionRect.left + args.collisionRect.width / 2
                  : args.pointerCoordinates?.x ?? lastDragPointerRef.current.x
              const rightEdge =
                args.collisionRect != null ? args.collisionRect.left + args.collisionRect.width : centerX + halfW
              const leftEdge = args.collisionRect != null ? args.collisionRect.left : centerX - halfW

              let newIdx = activeIdx
              if (Number.isFinite(rightEdge)) {
                for (let i = activeIdx + 1; i < rackTiles.length; i++) {
                  if (rightEdge > rackTiles[i]!.centerX) newIdx = i
                  else break
                }
              }
              if (newIdx === activeIdx && Number.isFinite(leftEdge)) {
                for (let i = activeIdx - 1; i >= 0; i--) {
                  if (leftEdge < rackTiles[i]!.centerX) newIdx = i
                  else break
                }
              }
              // newIdx === activeIdx returns the lifted tile's own slot (no shift) and keeps the
              // home column reachable so neighbours can reopen around it.
              const overEntry = rackTiles[newIdx] ?? activeEntry
              return [
                {
                  id: overEntry.container.id,
                  data: {
                    droppableContainer: overEntry.container,
                    value: Number.isFinite(centerX) ? Math.abs(centerX - overEntry.centerX) : 0,
                  },
                },
              ]
            }
          }
        }
        // Seat-wide joker swap when the pointer is just outside the meld rect but the tile overlaps.
        if (charlestonDone && jokerSwapUiActive) {
          const seatContainers = args.droppableContainers.filter(
            (c) =>
              parseBotSeatSwapDropId(String(c.id)) !== null || String(c.id) === EAST_SEAT_SWAP_ID,
          )
          if (seatContainers.length > 0) {
            const overlapHits = rectIntersection({ ...args, droppableContainers: seatContainers })
            if (overlapHits.length > 0) return [overlapHits[0]!]
          }
        }
      }
      const botSeatOverlap = botSeatOverlapHits()
      if (botSeatOverlap.length > 0) return [botSeatOverlap[0]!]
      return closestCenter(args)
    },
    [
      charlestonDone,
      mainPhase,
      jokerSwapUiActive,
      passSlots,
      hand,
      pendingEastDiscardTile,
      stagedCallTileIds,
      activeBotDiscard?.id,
    ],
  )

  const pinHandRackGeometryForMobileDrag = useCallback(() => {
    if (typeof window === 'undefined' || !window.matchMedia('(pointer: coarse)').matches) return
    // Freeze panel width tokens only. Height pins on `.rack-stage__rack-top` / `.hand-bank` caused
    // a persistent dead band between the green exposure slots and the hand row when the pinned box
    // was taller than the compact strip (inline height stuck or content top-aligned in the box).
    // The jog is handled by composited tile faces (part-0008) + this cqw freeze.
    handPanelCqwFrozenRef.current = true
  }, [])

  const releaseHandRackGeometryAfterMobileDrag = useCallback(() => {
    handPanelCqwFrozenRef.current = false
    refreshHandPanelCqwRef.current()
  }, [])

  const onDragStart = useCallback(
    (e: DragStartEvent) => {
      pinHandRackGeometryForMobileDrag()
      setCharlestonPassIntoHandPreview(null)
      setEastDiscardIntoHandPreview(null)
      globalDragPointerCleanupRef.current?.()
      const aev = e.activatorEvent
      if (aev && 'clientX' in aev) {
        const pe = aev as PointerEvent
        lastDragPointerRef.current = { x: pe.clientX, y: pe.clientY }
      }
      const onGlobalPtr = (ev: PointerEvent) => {
        lastDragPointerRef.current = { x: ev.clientX, y: ev.clientY }
      }
      window.addEventListener('pointermove', onGlobalPtr, { passive: true })
      globalDragPointerCleanupRef.current = () => {
        window.removeEventListener('pointermove', onGlobalPtr)
        globalDragPointerCleanupRef.current = null
      }
      const id = String(e.active.id)
      const exposureMeldIdx = parseEastExposureMeldSortId(id)
      if (exposureMeldIdx != null) {
        const exp = eastExposures[exposureMeldIdx]
        setDragOverlayTile(null)
        setDragOverlayMeldTiles(exp ? exp.tiles : null)
        setDragOverlayRackSuitStacked(true)
        return
      }
      const fromHand = hand.find((t) => t.id === id)
      const fromLiveBotDiscard = isActiveBotDiscardDrag(id, activeBotDiscard ?? null)
      if (fromLiveBotDiscard) {
        setIncomingBotDiscardCallDragActive(true)
      }
      if (fromHand || fromLiveBotDiscard) {
        setDragOverlayTile(fromHand ?? activeBotDiscard ?? null)
        setDragOverlayMeldTiles(null)
        setDragOverlayRackSuitStacked(true)
        return
      }
      for (const s of passSlots) {
        if (s?.id === id) {
          setDragOverlayTile(s)
          setDragOverlayMeldTiles(null)
          setDragOverlayRackSuitStacked(true)
          return
        }
      }
      if (pendingEastDiscardTile?.id === id) {
        setDragOverlayTile(pendingEastDiscardTile)
        setDragOverlayMeldTiles(null)
        setDragOverlayRackSuitStacked(true)
        return
      }
      setDragOverlayTile(null)
      setDragOverlayMeldTiles(null)
      setDragOverlayRackSuitStacked(false)
    },
    [
      hand,
      passSlots,
      pendingEastDiscardTile,
      charlestonDone,
      mainPhase,
      activeBotDiscard,
      eastExposures,
      pinHandRackGeometryForMobileDrag,
    ],
  )

  const handVisualInsertIndexFromPointer = useCallback(() => {
    const pointerX = lastDragPointerRef.current.x
    if (!Number.isFinite(pointerX)) return null
    const elementsById = new Map<string, HTMLElement>()
    document.querySelectorAll<HTMLElement>('.hand-row [data-hand-tile-id]').forEach((el) => {
      const id = el.dataset.handTileId
      if (id) elementsById.set(id, el)
    })
    const centers = hand
      .map((tile, index) => {
        const el = elementsById.get(tile.id)
        if (!el) return null
        const rect = el.getBoundingClientRect()
        if (rect.width < 1) return null
        return { index, centerX: rect.left + rect.width / 2 }
      })
      .filter((x): x is { index: number; centerX: number } => x != null)
      .sort((a, b) => a.centerX - b.centerX)
    if (centers.length === 0) return null
    return centers.find((x) => pointerX < x.centerX)?.index ?? hand.length
  }, [hand])

  const handInsertIndexFromOver = useCallback(
    (over: { rect: { left: number; width: number } }, overHandIdx: number) => {
      const visualIndex = handVisualInsertIndexFromPointer()
      if (visualIndex != null) return visualIndex

      const rect = over.rect
      const centerX = rect.left + rect.width / 2
      const pointerX = lastDragPointerRef.current.x
      return pointerX > centerX ? Math.min(overHandIdx + 1, hand.length) : overHandIdx
    },
    [hand.length, handVisualInsertIndexFromPointer],
  )

  const onDragOver = useCallback(
    (e: DragOverEvent) => {
      const aid = String(e.active.id)
      if (charlestonDone) {
        if (mainPhase === 'east-discard' && pendingEastDiscardTile && aid === pendingEastDiscardTile.id) {
          const over = e.over
          if (!over) {
            setEastDiscardIntoHandPreview(null)
            return
          }
          const oid = String(over.id)
          if (oid === HAND_BANK_ID) {
            const handPreviewIndex = handVisualInsertIndexFromPointer() ?? hand.length
            setEastDiscardIntoHandPreview((prev) =>
              prev?.tileId === aid && prev.handPreviewIndex === handPreviewIndex
                ? prev
                : { tileId: aid, handPreviewIndex },
            )
            return
          }
          const overHandIdx = hand.findIndex((t) => t.id === oid)
          if (overHandIdx >= 0) {
            const handPreviewIndex = handInsertIndexFromOver(over, overHandIdx)
            setEastDiscardIntoHandPreview((prev) =>
              prev?.tileId === aid && prev.handPreviewIndex === handPreviewIndex
                ? prev
                : { tileId: aid, handPreviewIndex },
            )
            return
          }
          setEastDiscardIntoHandPreview(null)
        } else {
          setEastDiscardIntoHandPreview(null)
        }
        return
      }
      const passFromIdx = passSlots.findIndex((s) => s?.id === aid)
      if (passFromIdx < 0) {
        setCharlestonPassIntoHandPreview(null)
        // Hand tile lifted onto a pass slot → preview the rack compacting (tile removed) so the slid
        // neighbours don't snap back to home when the pass box takes the drop target.
        const overId = e.over ? String(e.over.id) : null
        setCharlestonHandPassStageTileId(
          overId === PASS_BOX_ID && hand.some((t) => t.id === aid) ? aid : null,
        )
        return
      }
      setCharlestonHandPassStageTileId(null)
      const over = e.over
      if (!over) {
        setCharlestonPassIntoHandPreview(null)
        return
      }
      const oid = String(over.id)
      if (oid === HAND_BANK_ID) {
        const handPreviewIndex = handVisualInsertIndexFromPointer() ?? hand.length
        setCharlestonPassIntoHandPreview((prev) =>
          prev?.tileId === aid && prev.handPreviewIndex === handPreviewIndex
            ? prev
            : { tileId: aid, handPreviewIndex },
        )
        return
      }
      const overHandIdx = hand.findIndex((t) => t.id === oid)
      if (overHandIdx >= 0) {
        const handPreviewIndex = handInsertIndexFromOver(over, overHandIdx)
        setCharlestonPassIntoHandPreview((prev) =>
          prev?.tileId === aid && prev.handPreviewIndex === handPreviewIndex
            ? prev
            : { tileId: aid, handPreviewIndex },
        )
        return
      }
      setCharlestonPassIntoHandPreview(null)
    },
    [
      charlestonDone,
      mainPhase,
      pendingEastDiscardTile,
      passSlots,
      hand,
      handInsertIndexFromOver,
      handVisualInsertIndexFromPointer,
    ],
  )

  const onDragCancel = useCallback(() => {
    releaseHandRackGeometryAfterMobileDrag()
    setIncomingBotDiscardCallDragActive(false)
    setCharlestonPassIntoHandPreview(null)
    setEastDiscardIntoHandPreview(null)
    setCharlestonHandPassStageTileId(null)
    setDragOverlayTile(null)
    setDragOverlayMeldTiles(null)
    setDragOverlayRackSuitStacked(false)
  }, [releaseHandRackGeometryAfterMobileDrag])

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

  const performNewHandDeal = useCallback((opts?: { replayLastOpening?: boolean }) => {
    const m = menuCardIdRef.current
    const c = committedCardIdRef.current

    setPendingJokerSwapTileId(null)
    setCharlestonPassError(null)
    setCallRuleError(null)
    setBlockingDialog(null)
    setDragOverlayTile(null)
    setDragOverlayMeldTiles(null)
    setDragOverlayRackSuitStacked(false)
    setCharlestonPassIntoHandPreview(null)
    setEastDiscardIntoHandPreview(null)
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
    // Most menu prefs persist across hands; suggested-hand category filters + Concealed (C) reset below.
    const w = readBotWinsEnabledFromStorage()
    setBotWinsEnabled((prev) => (prev === w ? prev : w))
    botWinsEnabledRef.current = w
    const tenJokersOn = readTenJokersEnabledFromStorage()
    setTenJokersEnabled((prev) => (prev === tenJokersOn ? prev : tenJokersOn))
    tenJokersEnabledRef.current = tenJokersOn
    const blankOn = readBlankTilesEnabledFromStorage()
    setBlankTilesEnabled((prev) => (prev === blankOn ? prev : blankOn))
    blankTilesEnabledRef.current = blankOn
    const blankCount = readBlankTileCountFromStorage()
    setBlankTileCount((prev) => (prev === blankCount ? prev : blankCount))
    blankTileCountRef.current = blankCount
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
      ? roundStateFromOpeningDeck([...snap])
      : (() => {
          const r = createNewRound(tenJokersOn, blankOn, blankCount)
          replayOpeningDeckRef.current = roundOpeningDeckOrder(r)
          return r
        })()
    setRound(nextRound)
  }, [])

  /** @returns true (menu may close); card-change warning is shown from `requestPlayableCard` when needed. */
  const newHand = useCallback((): boolean => {
    performNewHandDeal()
    return true
  }, [performNewHandDeal])

  const canEndGame =
    charlestonDone &&
    mainPhase !== 'wall-game' &&
    mainPhase !== 'mahjong-declared' &&
    mainPhase !== 'bot-mahjong' &&
    mainPhase !== 'dead-hand'

  const endGame = useCallback(() => {
    if (!charlestonDone) return
    setCharlestonPassError(null)
    setCallRuleError(null)
    setBlockingDialog(null)
    setPendingJokerSwapTileId(null)
    setWallGameReviewing(false)
    setMahjongWinReviewing(false)
    setBotMahjongWinReviewing(false)
    setRound((r) => {
      if (
        r.mainPhase === 'wall-game' ||
        r.mainPhase === 'mahjong-declared' ||
        r.mainPhase === 'bot-mahjong' ||
        r.mainPhase === 'dead-hand'
      ) {
        return r
      }
      return {
        ...r,
        mainPhase: 'wall-game',
        activeBotIndex: null,
        activeBotDiscard: null,
        botTurnBanner: null,
        pendingEastDiscardTile: null,
        pendingEastDiscardIdx: null,
        drawnTileId: null,
        handTileFlyIn: null,
        selectedHandTileId: null,
        stagedCallTileIds: [],
        callAmendableAfterClaimTileId: null,
        callAmendFromBotIndex: null,
        botWin: null,
        playerWinMethod: null,
      }
    })
    setMenuOpen(false)
  }, [charlestonDone])

  /** Same shuffled deck + opening deal as before Charleston on the last fresh deal (reshuffle only via New Game). */
  const replayHand = useCallback((): boolean => {
    performNewHandDeal({ replayLastOpening: true })
    return true
  }, [performNewHandDeal])

  const sendCharlestonPass = useCallback(() => {
    const charlestonBotPassOpts = {
      pickBotPass: (hand: TileInstance[], n: number, botIndex: 0 | 1 | 2) =>
        chooseBotCharlestonPass(hand, n, BOT_LABELS[botIndex] as BotSeat, botDifficultyRef.current),
    }
    let passBlockedCat: 'joker' | 'blank' | null = null
    pushRound((r) => {
      if (r.charlestonPhase === 'done') return r
      const phase = r.charlestonPhase
      const eastRack = r.passSlots.filter(Boolean) as TileInstance[]
      const blocked = eastRack.find((t) => !charlestonPassEligible(t.def))
      if (blocked) {
        passBlockedCat = blocked.def.cat === 'blank' ? 'blank' : 'joker'
        return r
      }

      const flyDir = handTileFlyInFromCharlestonPhase(phase)

      if (phase === 'courtesy') {
        if (eastRack.length > 3) return r
        const nextHands = applyCharlestonExchange(phase, toFourHands(r), eastRack, 0, charlestonBotPassOpts)
        const nextPhase = nextCharlestonPhase(phase)
        // Courtesy always advances to `done`; still compute incoming so receive fly-in matches other across passes.
        const incoming = charlestonIncomingHandTileIds(r.hand, nextHands.east)
        const incomingFly =
          incoming.length > 0 && flyDir != null
            ? { ids: [...incoming], from: flyDir }
            : null
        return {
          ...r,
          hand: nextHands.east,
          bots: [nextHands.south, nextHands.west, nextHands.north],
          passSlots: [null, null, null],
          passSlotOrigins: [null, null, null],
          selectedHandTileId: null,
          charlestonPhase: nextPhase,
          awaitingSecondCharlestonChoice: false,
          charlestonNewTileIds: incoming,
          handTileFlyIn: incomingFly,
        }
      }

      const blindOk = charlestonAllowsBlind(phase)
      if (blindOk) {
        const blindCount = 3 - eastRack.length
        if (blindCount < 0 || blindCount > 3) return r
        const nextHands = applyCharlestonExchange(
          phase,
          toFourHands(r),
          eastRack,
          blindCount,
          charlestonBotPassOpts,
        )
        const nextPhase = nextCharlestonPhase(phase)
        const incoming =
          nextPhase === 'done'
            ? []
            : charlestonIncomingHandTileIds(r.hand, nextHands.east)
        return {
          ...r,
          hand: nextHands.east,
          bots: [nextHands.south, nextHands.west, nextHands.north],
          passSlots: [null, null, null],
          passSlotOrigins: [null, null, null],
          selectedHandTileId: null,
          charlestonPhase: nextPhase,
          awaitingSecondCharlestonChoice: nextPhase === 'left2',
          charlestonNewTileIds: incoming,
          handTileFlyIn:
            incoming.length > 0 && flyDir != null ? { ids: [...incoming], from: flyDir } : null,
        }
      }

      if (eastRack.length !== 3) return r
      const nextHands = applyCharlestonExchange(phase, toFourHands(r), eastRack, 0, charlestonBotPassOpts)
      const nextPhase = nextCharlestonPhase(phase)
      const incoming =
        nextPhase === 'done' ? [] : charlestonIncomingHandTileIds(r.hand, nextHands.east)
      return {
        ...r,
        hand: nextHands.east,
        bots: [nextHands.south, nextHands.west, nextHands.north],
        passSlots: [null, null, null],
        passSlotOrigins: [null, null, null],
        selectedHandTileId: null,
        charlestonPhase: nextPhase,
        awaitingSecondCharlestonChoice: nextPhase === 'left2',
        charlestonNewTileIds: incoming,
        handTileFlyIn:
          incoming.length > 0 && flyDir != null ? { ids: [...incoming], from: flyDir } : null,
      }
    })
    if (passBlockedCat) {
      setCharlestonPassError(charlestonPassBlockedMessage(passBlockedCat))
    }
  }, [pushRound])

  const skipToCourtesyPass = useCallback(() => {
    if (passStripFlyoutTimerRef.current) {
      clearTimeout(passStripFlyoutTimerRef.current)
      passStripFlyoutTimerRef.current = null
    }
    setPassStripFlyOut(null)
    pushRound((r) => {
      if (r.charlestonPhase !== 'left2' || !r.awaitingSecondCharlestonChoice) return r
      // Return any tiles currently parked in the pass slots back to the hand so
      // stopping the Charleston never silently drops the player's tiles.
      const returning = r.passSlots.filter(Boolean) as TileInstance[]
      const handNext = returning.length > 0 ? [...r.hand, ...returning] : r.hand
      return {
        ...r,
        hand: handNext,
        charlestonPhase: 'courtesy',
        charlestonSkippedSecondRound: true,
        awaitingSecondCharlestonChoice: false,
        passSlots: [null, null, null],
        passSlotOrigins: [null, null, null],
        selectedHandTileId: null,
      }
    })
  }, [pushRound])

  const onCharlestonPassButtonClick = useCallback(() => {
    const passSlotCount = passSlots.filter(Boolean).length
    const blindPhaseLocal = !charlestonDone && charlestonAllowsBlind(charlestonPhase)
    const courtesyPhaseLocal = charlestonPhase === 'courtesy'
    const secondCharlestonLeftChoiceLocal = charlestonPhase === 'left2'
    const ready =
      secondCharlestonLeftChoiceLocal
        ? passSlotCount === 0 || passSlotCount === 3
        : courtesyPhaseLocal
          ? passSlotCount <= 3
          : blindPhaseLocal
            ? passSlotCount <= 3
            : passSlotCount === 3
    if (!ready) return
    if (secondCharlestonLeftChoiceLocal && passSlotCount === 0) {
      skipToCourtesyPass()
      return
    }
    const eastRack = passSlots.filter(Boolean) as TileInstance[]
    if (eastRack.some((t) => !charlestonPassEligible(t.def))) {
      sendCharlestonPass()
      return
    }
    const flyOutDir: PassStripFlyOutFrom | null = courtesyPhaseLocal
      ? 'courtesy-top'
      : handTileFlyInFromCharlestonPhase(charlestonPhase)
    if (!flyOutDir) {
      sendCharlestonPass()
      return
    }
    if (passStripFlyoutTimerRef.current) {
      clearTimeout(passStripFlyoutTimerRef.current)
      passStripFlyoutTimerRef.current = null
    }
    setPassStripFlyOut(flyOutDir)
    passStripFlyoutTimerRef.current = window.setTimeout(() => {
      passStripFlyoutTimerRef.current = null
      setPassStripFlyOut(null)
      sendCharlestonPass()
    }, 350)
  }, [passSlots, charlestonPhase, charlestonDone, sendCharlestonPass, skipToCourtesyPass])

  const skipBotDiscard = useCallback(
    () =>
      pushRound((r) => applySkipBotDiscard(r, botWinsEnabledRef.current, botDifficultyRef.current)),
    [pushRound],
  )
  const commitEastDiscard = useCallback(() => {
    const cur = roundRef.current
    const pendingTile = cur.pendingEastDiscardTile
    if (cur.mainPhase === 'east-discard' && pendingTile?.def.cat === 'blank') {
      const rankInput: RankSuggestedHandsInput = {
        hand: [...cur.hand, pendingTile],
        wallRemaining: cur.wall.length,
        discards: cur.discardPile.map((e) => e.tile),
        exposures: cur.botExposures,
        playerClaimMelds: cur.eastExposures,
        eastTableClaimMelds: cur.eastExposures,
        patterns: getActiveCardPatterns(),
      }
      if (summarizeRackTowardWin(rankInput).bestTilesAway < 14) {
        queueMicrotask(() =>
          setBlockingDialog({
            variant: 'table',
            title: BLOCKING_TITLE_SWAP_ERROR,
            message: MSG_DISCARD_BLANK_USE_SWAP,
          }),
        )
        return
      }
    }
    if (gameModeRef.current === 'training') {
      // Post-discard rack: the parked discard is leaving the hand and becomes table-visible.
      if (cur.mainPhase === 'east-discard' && pendingTile) {
        const rankInput: RankSuggestedHandsInput = {
          hand: cur.hand,
          wallRemaining: cur.wall.length,
          discards: [...cur.discardPile.map((e) => e.tile), pendingTile],
          exposures: cur.botExposures,
          playerClaimMelds: cur.eastExposures,
          eastTableClaimMelds: cur.eastExposures,
          patterns: getActiveCardPatterns(),
        }
        const { bestTilesAway, closestLine } = summarizeRackTowardWin(rankInput)
        // No line on the card can complete from this rack — discarding will lock in a dead hand.
        if (!closestLine || bestTilesAway >= 14) {
          if (deadHandWarningsEnabledRef.current) {
            queueMicrotask(() =>
              setBlockingDialog({ variant: 'discard-dead-warning', rankInput }),
            )
            return
          }
        }
      }
    }
    pushRound((r) =>
      commitEastDiscardAfterStaged(r, botWinsEnabledRef.current, botDifficultyRef.current),
    )
  }, [pushRound])
  const returnStagedEastDiscard = useCallback(() => {
    pushRound((r) => {
      if (!r.pendingEastDiscardTile) return r
      const t = r.pendingEastDiscardTile
      return {
        ...r,
        hand: [...r.hand, t],
        pendingEastDiscardTile: null,
        pendingEastDiscardIdx: null,
        selectedHandTileId: null,
      }
    })
  }, [pushRound])
  const declareMahjong = useCallback(() => {
    pushRound((cur) => {
      if (cur.charlestonPhase !== 'done') {
        if (charlestonMahjongButtonPhase(cur.charlestonPhase)) {
          queueMicrotask(() =>
            setBlockingDialog({ variant: 'card', message: MSG_MAHJONG_DURING_CHARLESTON }),
          )
        }
        return cur
      }
      if (cur.mainPhase === 'east-discard') {
        // Self-draw Mah Jongg: player declares on their own drawn tile.
        const rankInput: RankSuggestedHandsInput = {
          hand: cur.hand,
          wallRemaining: cur.wall.length,
          discards: cur.discardPile.map((e) => e.tile),
          exposures: cur.botExposures,
          playerClaimMelds: cur.eastExposures,
          eastTableClaimMelds: cur.eastExposures,
          patterns: getActiveCardPatterns(),
        }
        const { bestTilesAway } = summarizeRackTowardWin(rankInput)
        if (bestTilesAway !== 0) {
          if (gameModeRef.current === 'training' && deadHandWarningsEnabledRef.current) {
            queueMicrotask(() =>
              setBlockingDialog({
                variant: 'mahjong-dead-warning',
                rankInput,
                deadHandReason: 'illegal-mahjong-self-draw',
              }),
            )
            return cur
          }
          return applyDeadHand(cur, 'illegal-mahjong-self-draw')
        }
        return applyDeclareMahjongSelfDraw(cur)
      }
      if (cur.mainPhase === 'call-staging' && cur.activeBotDiscard) {
        if (cur.stagedCallTileIds.length > 0) {
          const away = previewStagedCallBestTilesAway(cur)
          if (away === 0) {
            return applyCommitStagedCall(cur, gameModeRef.current)
          }
          const called = cur.activeBotDiscard
          const rankInput: RankSuggestedHandsInput = {
            hand: [...cur.hand, called],
            wallRemaining: cur.wall.length,
            discards: cur.discardPile.filter((e) => e.tile.id !== called.id).map((e) => e.tile),
            exposures: cur.botExposures,
            playerClaimMelds: cur.eastExposures,
            eastTableClaimMelds: cur.eastExposures,
            patterns: getActiveCardPatterns(),
          }
          if (gameModeRef.current === 'training' && deadHandWarningsEnabledRef.current) {
            queueMicrotask(() =>
              setBlockingDialog({
                variant: 'mahjong-dead-warning',
                rankInput,
                deadHandReason: 'illegal-mahjong-call-staged',
              }),
            )
            return cur
          }
          return applyDeadHand(cur, 'illegal-mahjong-call-staged')
        }
        const slice: CallValidationRoundSlice = {
          mainPhase: 'call-staging',
          activeBotDiscard: cur.activeBotDiscard,
          hand: cur.hand,
          eastExposures: cur.eastExposures,
          botExposures: cur.botExposures,
          wall: cur.wall,
          discardPile: cur.discardPile,
        }
        if (!hasLegalMahjongOnBotDiscard(slice)) {
          const called = cur.activeBotDiscard
          const rankInput: RankSuggestedHandsInput = {
            hand: [...cur.hand, called],
            wallRemaining: cur.wall.length,
            discards: cur.discardPile.filter((e) => e.tile.id !== called.id).map((e) => e.tile),
            exposures: cur.botExposures,
            playerClaimMelds: cur.eastExposures,
            eastTableClaimMelds: cur.eastExposures,
            patterns: getActiveCardPatterns(),
          }
          if (gameModeRef.current === 'training' && deadHandWarningsEnabledRef.current) {
            queueMicrotask(() =>
              setBlockingDialog({
                variant: 'mahjong-dead-warning',
                rankInput,
                deadHandReason: 'illegal-mahjong-call-discard',
              }),
            )
            return cur
          }
          return applyDeadHand(cur, 'illegal-mahjong-call-discard')
        }
        return applyDeclareMahjong({ ...cur, mainPhase: 'bot-turn' })
      }
      if (cur.mainPhase !== 'bot-turn' || !cur.activeBotDiscard) return cur
      const slice = {
        mainPhase: cur.mainPhase,
        activeBotDiscard: cur.activeBotDiscard,
        hand: cur.hand,
        eastExposures: cur.eastExposures,
        botExposures: cur.botExposures,
        wall: cur.wall,
        discardPile: cur.discardPile,
      }
      if (!hasLegalMahjongOnBotDiscard(slice)) {
        const called = cur.activeBotDiscard!
        const rankInput: RankSuggestedHandsInput = {
          hand: [...cur.hand, called],
          wallRemaining: cur.wall.length,
          discards: cur.discardPile.filter((e) => e.tile.id !== called.id).map((e) => e.tile),
          exposures: cur.botExposures,
          playerClaimMelds: cur.eastExposures,
          eastTableClaimMelds: cur.eastExposures,
          patterns: getActiveCardPatterns(),
        }
        if (gameModeRef.current === 'training' && deadHandWarningsEnabledRef.current) {
          // Training mode: warn before committing to dead hand
          queueMicrotask(() =>
            setBlockingDialog({
              variant: 'mahjong-dead-warning',
              rankInput,
              deadHandReason: 'illegal-mahjong-bot-discard',
            }),
          )
          return cur
        }
        return applyDeadHand(cur, 'illegal-mahjong-bot-discard')
      }
      return applyDeclareMahjong(cur)
    })
  }, [pushRound])

  const executeJokerSwapFromSlot = useCallback(() => {
    if (!jokerSwapUiActive) {
      setBlockingDialog({
        variant: 'table',
        title: BLOCKING_TITLE_SWAP_ERROR,
        message: MSG_SWAP_NO_EXPOSED_JOKERS,
      })
      return
    }
    // Accept the explicitly-staged swap tile, or fall back to the discard-tray tile.
    const pid = pendingJokerSwapTileId ?? pendingEastDiscardTile?.id ?? null
    if (!pid) {
      setBlockingDialog({
        variant: 'table',
        title: BLOCKING_TITLE_SWAP_ERROR,
        message: MSG_SWAP_PICK_TILE_FIRST,
      })
      return
    }
    if (!jokerSwapPick) {
      setBlockingDialog({
        variant: 'table',
        title: BLOCKING_TITLE_SWAP_ERROR,
        message: MSG_SWAP_NO_LEGAL_FOR_TILE,
      })
      return
    }
    const pick = jokerSwapPick
    setPendingJokerSwapTileId(null)
    pushRound((r) => applyEastNaturalForExposedJoker(r, { ...pick, eastTileId: pid }))
  }, [jokerSwapUiActive, pendingJokerSwapTileId, pendingEastDiscardTile, jokerSwapPick, pushRound])

  /**
   * The shared "Swap" button on your turn. Routes to whichever swap applies:
   *  1. A staged/selected blank → open the discard-tracker exchange popup (any discard except jokers).
   *  2. A staged natural matching an exposed joker → redeem that joker.
   *  3. A blank anywhere in hand (nothing staged) → open the exchange popup.
   *  4. An exposed joker with no valid staging → delegate to the joker-swap validator (shows guidance).
   *  5. Nothing to swap → explain the two swap paths.
   */
  const executeSwapFromSlot = useCallback(() => {
    const canBlankExchange = charlestonDone && mainPhase === 'east-discard'
    const selectedTile =
      (pendingJokerSwapTileId
        ? hand.find((t) => t.id === pendingJokerSwapTileId)
        : selectedHandTileId
          ? hand.find((t) => t.id === selectedHandTileId)
          : null) ?? null
    const eligibleDiscards = discardedDefsForBlankExchange(discardPile)

    const openBlankExchange = (blankTileId: string) => {
      if (eligibleDiscards.length === 0) {
        setBlockingDialog({
          variant: 'table',
          title: BLOCKING_TITLE_SWAP_ERROR,
          message: MSG_SWAP_BLANK_NO_DISCARDS,
        })
        return
      }
      setBlankExchangeOpen({ blankTileId })
    }

    // 1) A blank is staged in the discard slot, or selected in the hand — exchange it.
    const stagedBlank =
      pendingEastDiscardTile?.def.cat === 'blank'
        ? pendingEastDiscardTile
        : selectedTile?.def.cat === 'blank'
          ? selectedTile
          : null
    if (canBlankExchange && stagedBlank) {
      openBlankExchange(stagedBlank.id)
      return
    }

    // 2) A natural is staged that can redeem an exposed joker.
    const jokerSwapReady =
      jokerSwapUiActive &&
      (pendingJokerSwapTileId != null || pendingEastDiscardTile != null) &&
      jokerSwapPick != null
    if (jokerSwapReady) {
      executeJokerSwapFromSlot()
      return
    }

    // 3) Nothing staged, but a blank is in hand — exchange the first one.
    if (
      canBlankExchange &&
      !pendingEastDiscardTile &&
      !pendingJokerSwapTileId &&
      !selectedHandTileId
    ) {
      const anyBlank = hand.find((t) => t.def.cat === 'blank')
      if (anyBlank) {
        openBlankExchange(anyBlank.id)
        return
      }
    }

    // 4) An exposed joker exists but the staging isn't valid — let the joker validator explain.
    if (jokerSwapUiActive) {
      executeJokerSwapFromSlot()
      return
    }

    // 5) Neither path is available.
    setBlockingDialog({
      variant: 'table',
      title: BLOCKING_TITLE_SWAP_ERROR,
      message: MSG_SWAP_NOTHING_AVAILABLE,
    })
  }, [
    charlestonDone,
    mainPhase,
    pendingJokerSwapTileId,
    selectedHandTileId,
    pendingEastDiscardTile,
    hand,
    discardPile,
    jokerSwapUiActive,
    jokerSwapPick,
    executeJokerSwapFromSlot,
    setBlankExchangeOpen,
    setBlockingDialog,
  ])

  const sortHand = useCallback(() => {
    const focusKey = suggestedFocusHandKeyRef.current
    if (focusKey && focusKey !== suggestedSuppressedHandKey) {
      const variantSep = ['::tier::', '::oc::', '::ocall::']
        .map((s) => focusKey.indexOf(s))
        .filter((i) => i >= 0)
        .reduce((m, i) => (m < 0 ? i : Math.min(m, i)), -1)
      const patternId =
        variantSep >= 0 ? focusKey.slice(0, variantSep) : focusKey
      sortModeRef.current = null
      pushRound((r) => ({
        ...r,
        hand: sortHandForSuggestedPattern(
          r.hand,
          patternId,
          {
            hand: r.hand,
            wallRemaining: r.wall.length,
            discards: deadDiscardTilesForRanking(r),
            exposures: r.botExposures,
            playerClaimMelds: r.eastExposures,
            eastTableClaimMelds: r.eastExposures,
            patterns: getActiveCardPatterns(),
          },
          focusKey,
        ),
      }))
      return
    }
    const nextMode: SortMode = sortModeRef.current === 'suit' ? 'number' : 'suit'
    sortModeRef.current = nextMode
    pushRound((r) => ({ ...r, hand: sortTiles(r.hand, nextMode) }))
  }, [pushRound, suggestedSuppressedHandKey])

  const proceedWithCallRef = useRef<(() => void) | null>(null)

  const initiateCall = useCallback(() => {
    if (
      concealedHandReminderEnabledRef.current &&
      focusedHandIsConcealedRef.current
    ) {
      setBlockingDialog({ variant: 'concealed-call-warning' })
      return
    }
    proceedWithCallRef.current?.()
  }, [])

  const proceedWithCall = useCallback(() => {
    // Always validate from the latest committed round (same as commitStagedCall). Render
    // closures can lag on mobile/PWA taps right after a draw or pass animation.
    const cur = roundRef.current
    const callSlice: CallValidationRoundSlice = {
      mainPhase: cur.mainPhase,
      activeBotDiscard: cur.activeBotDiscard,
      hand: cur.hand,
      eastExposures: cur.eastExposures,
      botExposures: cur.botExposures,
      wall: cur.wall,
      discardPile: cur.discardPile,
    }
    const err = getCallInitiateBlockMessage(callSlice)
    if (err === MSG_CALL_DEAD_JOKER) {
      setCallRuleError(null)
      setBlockingDialog({
        variant: 'table',
        title: 'Dead joker',
        message: err,
      })
    } else if (err === MSG_CALL_INSUFFICIENT_TILES) {
      if (deadHandWarningsEnabledRef.current) {
        setCallRuleError(null)
        setBlockingDialog({
          variant: 'dead-hand-warning',
        })
      } else {
        setBlockingDialog(null)
        setCallRuleError(MSG_CALL_INSUFFICIENT_TILES)
      }
    } else if (err) {
      setBlockingDialog(null)
      setCallRuleError(err)
    } else {
      setBlockingDialog(null)
      setCallRuleError(null)
      const flags = getCallCapacityFlags(cur.hand, cur.activeBotDiscard)
      const maxClaimHand = maxOpenClaimHandTiles(flags)
      const stagingNeeded =
        flags.canPung
          ? 2
          : hasLegalMahjongOnBotDiscard({
              ...callSlice,
              mainPhase: 'bot-turn',
            })
            ? 0
            : 2
      // Training: warn only when **every** exposure size you could legally commit with this discard
      // fits no playable line. If a pung satisfies part of the card but a kong would not, no warning.
      // Conversely, if the card needs a kong for that meld and you can only form a pung, every preview fails → warning.
      const rankInputWorstCase =
        gameModeRef.current === 'training' && flags.canPung
          ? previewAutoSelectedCallRankInput(cur, maxClaimHand)
          : null
      if (gameModeRef.current === 'training' && flags.canPung) {
        const candidateSizes: Array<2 | 3 | 4 | 5> = []
        if (flags.canPung) candidateSizes.push(2)
        if (flags.canKong) candidateSizes.push(3)
        if (flags.canQuint) candidateSizes.push(4)
        if (flags.canSextet) candidateSizes.push(5)

        let anyCallableLineFits = false
        for (const n of candidateSizes) {
          const input = previewAutoSelectedCallRankInput(cur, n)
          if (!input) continue
          if (summarizeRackTowardWin(input).closestLine) {
            anyCallableLineFits = true
            break
          }
        }
        if (!anyCallableLineFits && rankInputWorstCase) {
          if (deadHandWarningsEnabledRef.current) {
            setBlockingDialog({
              variant: 'call-exposure-dead-warning',
              rankInput: rankInputWorstCase,
            })
            return
          }
        }
      }
      setEastCallStagedWaveFlyIn(
        animationsEnabled
          ? {
              staggerDelayMs: 44,
              baseDelayMs: 0,
            }
          : null,
      )
      pushRound((r) => applyAutoSelectCallTiles(applyInitiateCall(r), stagingNeeded))
    }
  }, [animationsEnabled, pushRound])
  proceedWithCallRef.current = proceedWithCall

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
  const commitStagedCall = useCallback(() => {
    setCallRuleError(null)
    const cur = roundRef.current
    if (
      gameModeRef.current === 'training' &&
      deadHandWarningsEnabledRef.current &&
      cur.mainPhase === 'call-staging' &&
      cur.activeBotDiscard &&
      cur.stagedCallTileIds.length >= 2
    ) {
      const rankInput = previewStagedCallRankInput(cur)
      const stagedN = cur.stagedCallTileIds.length
      if (rankInput && !summarizeRackTowardWin(rankInput).closestLine) {
        const flags = getCallCapacityFlags(cur.hand, cur.activeBotDiscard)
        const largerSizes: Array<3 | 4 | 5> = []
        if (flags.canKong && stagedN < 3) largerSizes.push(3)
        if (flags.canQuint && stagedN < 4) largerSizes.push(4)
        if (flags.canSextet && stagedN < 5) largerSizes.push(5)
        for (const n of largerSizes) {
          const alt = previewAutoSelectedCallRankInput(cur, n)
          if (alt && summarizeRackTowardWin(alt).closestLine) {
            queueMicrotask(() =>
              setBlockingDialog({
                variant: 'call-meld-size-warning',
                rankInput: alt,
                neededHandTiles: n,
              }),
            )
            return
          }
        }
      }
    }
    pushRound((r) => applyCommitStagedCall(r, gameModeRef.current))
  }, [pushRound])

  const onHandTileActivate = useCallback((id: string) => {
    let passBlockedCat: 'joker' | 'blank' | null = null
    pushRound((r) => {
      if (r.charlestonPhase === 'done') {
        if (r.mainPhase === 'east-discard') {
          const handIdx = r.hand.findIndex((t) => t.id === id)
          if (handIdx < 0) return r
          const picked = r.hand[handIdx]!
          const handNext = [...r.hand]
          handNext.splice(handIdx, 1)
          const prior = r.pendingEastDiscardTile
          const priorIdx = r.pendingEastDiscardIdx
          let handAfter: TileInstance[]
          if (prior) {
            const insertIdx = Math.min(priorIdx ?? handNext.length, handNext.length)
            handAfter = [...handNext]
            handAfter.splice(insertIdx, 0, prior)
          } else {
            handAfter = handNext
          }
          return {
            ...r,
            hand: handAfter,
            pendingEastDiscardTile: picked,
            pendingEastDiscardIdx: handIdx,
            selectedHandTileId: null,
          }
        }
        if (r.mainPhase === 'call-staging') {
          return applyToggleStagedCallTile(r, id)
        }
        return r  // bot-turn: hand clicks do nothing
      }

      const emptyIdx = firstEmptyPassSlotIndex(r.passSlots)
      if (emptyIdx >= 0) {
        const handIdx = r.hand.findIndex((t) => t.id === id)
        if (handIdx < 0) return r
        const tile = r.hand[handIdx]!
        if (!charlestonPassEligible(tile.def)) {
          passBlockedCat = tile.def.cat === 'blank' ? 'blank' : 'joker'
          return r
        }
        const handNext = [...r.hand]
        const passNext: PassSlots = [...r.passSlots]
        handNext.splice(handIdx, 1)
        const bumped = passNext[emptyIdx]
        passNext[emptyIdx] = tile
        if (bumped) handNext.push(bumped)
        const passOriginsNext: [number | null, number | null, number | null] = [...r.passSlotOrigins]
        passOriginsNext[emptyIdx] = handIdx
        lastPassReturnTileIdRef.current = null
        return { ...r, hand: handNext, passSlots: passNext, passSlotOrigins: passOriginsNext, selectedHandTileId: null }
      }
      return r
    })
    if (passBlockedCat) {
      setCharlestonPassError(charlestonPassBlockedMessage(passBlockedCat))
    }
  }, [setCharlestonPassError, pushRound])

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      const { active, over } = e
      const aid = String(active.id)
      const passTileStillOverPassBox =
        !charlestonDone &&
        passSlots.some((s) => s?.id === aid) &&
        pointerOverPassBoxTarget(lastDragPointerRef.current)
      try {
        // Blank dropped anywhere over the discard tracker (your turn) → open the centered exchange
        // popup. Accepts a blank dragged from the hand OR one staged in the discard slot. Checked
        // first (with a pointer-position fallback) so it works even if dnd-kit hasn't measured the
        // tracker droppable for this drag.
        const draggedBlankForExchange =
          hand.some((t) => t.id === aid && t.def.cat === 'blank') ||
          (pendingEastDiscardTile?.id === aid && pendingEastDiscardTile.def.cat === 'blank')
        if (
          charlestonDone &&
          mainPhase === 'east-discard' &&
          draggedBlankForExchange &&
          (String(over?.id) === BLANK_EXCHANGE_DROP_ID ||
            pointerOverBlankExchangeTarget(lastDragPointerRef.current))
        ) {
          setBlankExchangeOpen({ blankTileId: aid })
          return
        }
        if (!over) {
          if (
            isActiveBotDiscardDrag(aid, activeBotDiscard ?? null) &&
            pointerOverCallInitiateTarget(lastDragPointerRef.current)
          ) {
            initiateCall()
            return
          }
          if (passTileStillOverPassBox) {
            return
          }
          if (!charlestonDone && passSlots.some((s) => s?.id === aid)) {
            pushRound((r) => {
              if (r.charlestonPhase === 'done') return r
              const passFromIdx = r.passSlots.findIndex((s) => s?.id === aid)
              if (passFromIdx < 0) return r
              const passSlotsNext: PassSlots = [...r.passSlots]
              const passOriginsNext: [number | null, number | null, number | null] = [...r.passSlotOrigins]
              const tile = passSlotsNext[passFromIdx]
              passSlotsNext[passFromIdx] = null
              passOriginsNext[passFromIdx] = null
              const handNext = [...r.hand]
              if (tile) handNext.push(tile)
              const compacted = compactPassSlotsToRight(passSlotsNext, passOriginsNext)
              return {
                ...r,
                hand: handNext,
                passSlots: compacted.passSlots,
                passSlotOrigins: compacted.passSlotOrigins,
                selectedHandTileId: null,
              }
            })
            return
          }
          /* Charleston: release outside any droppable → park tile on the right end of the rack. */
          if (!charlestonDone && hand.some((t) => t.id === aid)) {
            pushRound((r) => {
              if (r.charlestonPhase === 'done') return r
              const idx = r.hand.findIndex((t) => t.id === aid)
              if (idx < 0) return r
              const hn = [...r.hand]
              const [tile] = hn.splice(idx, 1)
              hn.push(tile)
              return { ...r, hand: hn, selectedHandTileId: null }
            })
          }
          return
        }
        const oid = String(over.id)

        const exposureFromIdx = parseEastExposureMeldSortId(aid)
        const exposureToIdx = parseEastExposureMeldSortId(oid)
        if (exposureFromIdx != null && exposureToIdx != null) {
          if (exposureFromIdx !== exposureToIdx) {
            pushRound((r) => {
              if (exposureFromIdx >= r.eastExposures.length || exposureToIdx >= r.eastExposures.length) {
                return r
              }
              return {
                ...r,
                eastExposures: arrayMove(r.eastExposures, exposureFromIdx, exposureToIdx),
              }
            })
          }
          return
        }

        if (
          oid === CALL_INITIATE_FIRST_SLOT_ID ||
          (isActiveBotDiscardDrag(aid, activeBotDiscard ?? null) &&
            pointerOverCallInitiateTarget(lastDragPointerRef.current))
        ) {
          if (hand.some((t) => t.id === aid) || isActiveBotDiscardDrag(aid, activeBotDiscard ?? null)) {
            initiateCall()
          }
          return
        }

        // ── call-staging cross-zone drag ──────────────────────────────────────────
        if (mainPhase === 'call-staging') {
          const aidStaged = stagedCallTileIds.includes(aid)
          const oidStaged = stagedCallTileIds.includes(oid)
          const oidIsHandTile = !oidStaged && hand.some((t) => t.id === oid)

          // Staged tile dragged down to a hand tile position → un-stage + reorder
          if (aidStaged && oidIsHandTile) {
            pushRound((r) => {
              const unstagedR = applyToggleStagedCallTile(r, aid)
              const fromIdx = unstagedR.hand.findIndex((t) => t.id === aid)
              const toIdx = unstagedR.hand.findIndex((t) => t.id === oid)
              if (fromIdx >= 0 && toIdx >= 0 && fromIdx !== toIdx) {
                return { ...unstagedR, hand: arrayMove(unstagedR.hand, fromIdx, toIdx) }
              }
              return unstagedR
            })
            return
          }
          // Staged tile dropped on hand bank (no specific tile target) → un-stage in place
          if (aidStaged && oid === HAND_BANK_ID) {
            pushRound((r) => applyToggleStagedCallTile(r, aid))
            return
          }
          // Hand tile dragged up to a staged slot or exposure zone → stage it
          if (!aidStaged && (oidStaged || oid === CALL_STAGING_DROP_ID)) {
            pushRound((r) => applyToggleStagedCallTile(r, aid))
            return
          }
        }

        // Joker swap: your exposures, your row, or any bot exposure rack (same rules: natural for joker).
        const eastExposureSwapIdx = parseEastExposureSwapDropId(oid)
        const eastSeat = oid === EAST_SEAT_SWAP_ID
        const exposureSwapIdx = parseBotExposureSwapDropId(oid)
        const seatSwap = parseBotSeatSwapDropId(oid)
        if (jokerSwapUiActive && (eastExposureSwapIdx !== null || eastSeat || exposureSwapIdx !== null || seatSwap)) {
          pushRound((r) => {
            const fromHand = r.hand.find((t) => t.id === aid)
            const fromPending = !fromHand && r.pendingEastDiscardTile?.id === aid
              ? r.pendingEastDiscardTile
              : null
            const natural = fromHand ?? fromPending
            if (!natural || natural.def.cat === 'joker') return r

            let pick: JokerSwapTargetPick | null = null
            if (eastExposureSwapIdx !== null) {
              pick = findJokerSwapTargetAtEastExposure(
                r.eastExposures,
                eastExposureSwapIdx,
                natural.def,
              )
            } else if (eastSeat) {
              pick = findJokerSwapTargetInEastRack(r.eastExposures, natural.def)
            } else if (exposureSwapIdx !== null) {
              pick = findNextBotJokerSwapTarget(r.botExposures, natural.def)
            } else if (seatSwap) {
              pick = findNextBotJokerSwapTarget(r.botExposures, natural.def)
            }
            if (!pick) return r
            return applyEastNaturalForExposedJoker(r, { ...pick, eastTileId: aid })
          })
          setPendingJokerSwapTileId(null)
          return
        }

        let passBlockedCat: 'joker' | 'blank' | null = null
        pushRound((r) => {
      const passSlotsNext: PassSlots = [...r.passSlots]
      const handNext = [...r.hand]
      const handIdx = handNext.findIndex((t) => t.id === aid)
      const passFromIdx = passSlotsNext.findIndex((s) => s?.id === aid)
      const overHandIdx = handNext.findIndex((t) => t.id === oid)
      const passToIdx =
        passFromIdx >= 0 && oid === PASS_BOX_ID
          ? null
          : passDropIndex(oid, passSlotsNext)
      const blockPass = r.charlestonPhase === 'done'

      if (!blockPass && passFromIdx >= 0 && passTileStillOverPassBox && passToIdx === null) {
        return r
      }

      if (r.mainPhase === 'east-discard' && r.pendingEastDiscardTile?.id === aid && oid === HAND_BANK_ID) {
        const t = r.pendingEastDiscardTile
        const handNext2 = [...r.hand]
        const insertIdx = Math.min(
          handVisualInsertIndexFromPointer() ?? r.pendingEastDiscardIdx ?? handNext2.length,
          handNext2.length,
        )
        handNext2.splice(insertIdx, 0, t)
        return { ...r, hand: handNext2, pendingEastDiscardTile: null, pendingEastDiscardIdx: null, selectedHandTileId: null }
      }
      if (
        r.mainPhase === 'east-discard' &&
        r.pendingEastDiscardTile?.id === aid &&
        overHandIdx >= 0
      ) {
        const t = r.pendingEastDiscardTile
        const hn = [...r.hand]
        const insertIdx = handInsertIndexFromOver(over, overHandIdx)
        hn.splice(insertIdx, 0, t)
        return { ...r, hand: hn, pendingEastDiscardTile: null, pendingEastDiscardIdx: null, selectedHandTileId: null }
      }
      if (r.mainPhase === 'east-discard' && oid === EAST_DISCARD_STAGING_ID && handIdx >= 0) {
        const moved = handNext[handIdx]!
        handNext.splice(handIdx, 1)
        const prior = r.pendingEastDiscardTile
        const priorIdx = r.pendingEastDiscardIdx
        let handAfter: TileInstance[]
        if (prior) {
          const insertIdx = Math.min(priorIdx ?? handNext.length, handNext.length)
          handAfter = [...handNext]
          handAfter.splice(insertIdx, 0, prior)
        } else {
          handAfter = handNext
        }
        return { ...r, hand: handAfter, pendingEastDiscardTile: moved, pendingEastDiscardIdx: handIdx, selectedHandTileId: null }
      }
      if (r.mainPhase === 'call-staging' && oid === CALL_STAGING_DROP_ID && handIdx >= 0) {
        return applyToggleStagedCallTile(r, aid)
      }

      if (handIdx >= 0 && overHandIdx >= 0 && handIdx !== overHandIdx) {
        return { ...r, hand: arrayMove(handNext, handIdx, overHandIdx), selectedHandTileId: null }
      }

      /* Charleston: dropped on hand bank or full pass box → cancel pass, tile to rack end. */
      if (!blockPass && handIdx >= 0 && oid === HAND_BANK_ID) {
        const moved = handNext[handIdx]!
        handNext.splice(handIdx, 1)
        handNext.push(moved)
        return { ...r, hand: handNext, selectedHandTileId: null }
      }
      if (!blockPass && handIdx >= 0 && oid === PASS_BOX_ID && passToIdx === null) {
        const moved = handNext[handIdx]!
        handNext.splice(handIdx, 1)
        handNext.push(moved)
        return { ...r, hand: handNext, selectedHandTileId: null }
      }

      if (!blockPass && passFromIdx >= 0 && passToIdx !== null && handIdx < 0) {
        if (passFromIdx === passToIdx) return { ...r, selectedHandTileId: null }
        const reordered = reorderPassSlots(r.passSlots, r.passSlotOrigins, passFromIdx, passToIdx)
        return {
          ...r,
          passSlots: reordered.passSlots,
          passSlotOrigins: reordered.passSlotOrigins,
          selectedHandTileId: null,
        }
      }

      if (!blockPass && handIdx >= 0 && passToIdx !== null) {
        const moved = handNext[handIdx]!
        if (!charlestonPassEligible(moved.def)) {
          passBlockedCat = moved.def.cat === 'blank' ? 'blank' : 'joker'
          return r
        }
        handNext.splice(handIdx, 1)
        const bumped = passSlotsNext[passToIdx]
        const passOriginsNext: [number | null, number | null, number | null] = [...r.passSlotOrigins]
        if (bumped) {
          handNext.push(bumped)
        }
        passSlotsNext[passToIdx] = moved
        passOriginsNext[passToIdx] = handIdx
        return { ...r, hand: handNext, passSlots: passSlotsNext, passSlotOrigins: passOriginsNext, selectedHandTileId: null }
      }

      if (passFromIdx >= 0 && oid === HAND_BANK_ID) {
        const t = passSlotsNext[passFromIdx]
        passSlotsNext[passFromIdx] = null
        const passOriginsNext: [number | null, number | null, number | null] = [...r.passSlotOrigins]
        passOriginsNext[passFromIdx] = null
        const insertIdx = Math.min(handVisualInsertIndexFromPointer() ?? handNext.length, handNext.length)
        if (t) handNext.splice(insertIdx, 0, t)
        const compacted = compactPassSlotsToRight(passSlotsNext, passOriginsNext)
        return {
          ...r,
          hand: handNext,
          passSlots: compacted.passSlots,
          passSlotOrigins: compacted.passSlotOrigins,
        }
      }

      if (passFromIdx >= 0 && overHandIdx >= 0) {
        const t = passSlotsNext[passFromIdx]
        passSlotsNext[passFromIdx] = null
        const passOriginsNext: [number | null, number | null, number | null] = [...r.passSlotOrigins]
        passOriginsNext[passFromIdx] = null
        const insertIdx = handInsertIndexFromOver(over, overHandIdx)
        if (t) handNext.splice(insertIdx, 0, t)
        const compacted = compactPassSlotsToRight(passSlotsNext, passOriginsNext)
        return {
          ...r,
          hand: handNext,
          passSlots: compacted.passSlots,
          passSlotOrigins: compacted.passSlotOrigins,
        }
      }

      return r
    })
        if (passBlockedCat) {
          setCharlestonPassError(charlestonPassBlockedMessage(passBlockedCat))
        }
      } finally {
        releaseHandRackGeometryAfterMobileDrag()
        globalDragPointerCleanupRef.current?.()
        setIncomingBotDiscardCallDragActive(false)
        setDragOverlayTile(null)
        setDragOverlayMeldTiles(null)
        setDragOverlayRackSuitStacked(false)
        setCharlestonPassIntoHandPreview(null)
        setEastDiscardIntoHandPreview(null)
        setCharlestonHandPassStageTileId(null)
      }
    },
    [
      hand,
      charlestonDone,
      releaseHandRackGeometryAfterMobileDrag,
      jokerSwapUiActive,
      mainPhase,
      passSlots,
      pendingEastDiscardTile,
      setBlankExchangeOpen,
      stagedCallTileIds,
      pushRound,
      initiateCall,
      activeBotDiscard?.id,
      handInsertIndexFromOver,
      handVisualInsertIndexFromPointer,
    ],
  )

  const onPassBoxClick = useCallback(() => {
    let passBlockedCat: 'joker' | 'blank' | null = null
    pushRound((r) => {
      if (r.charlestonPhase === 'done') return r
      const emptyIdx = firstEmptyPassSlotIndex(r.passSlots)
      if (emptyIdx < 0) return r
      const tileId = r.selectedHandTileId ?? lastPassReturnTileIdRef.current
      if (!tileId) return r
      const handIdx = r.hand.findIndex((t) => t.id === tileId)
      if (handIdx < 0) return { ...r, selectedHandTileId: null }
      const tileDef = r.hand[handIdx]!.def
      if (!charlestonPassEligible(tileDef)) {
        passBlockedCat = tileDef.cat === 'blank' ? 'blank' : 'joker'
        return { ...r, selectedHandTileId: null }
      }

      const passSlotsNext: PassSlots = [...r.passSlots]
      const handNext = [...r.hand]
      const [moved] = handNext.splice(handIdx, 1)
      const bumped = passSlotsNext[emptyIdx]
      passSlotsNext[emptyIdx] = moved
      if (bumped) handNext.push(bumped)
      const passOriginsNext: [number | null, number | null, number | null] = [...r.passSlotOrigins]
      passOriginsNext[emptyIdx] = handIdx
      lastPassReturnTileIdRef.current = null

      return { ...r, hand: handNext, passSlots: passSlotsNext, passSlotOrigins: passOriginsNext, selectedHandTileId: null }
    })
    if (passBlockedCat) {
      setCharlestonPassError(charlestonPassBlockedMessage(passBlockedCat))
    }
  }, [setCharlestonPassError, pushRound])

  const onPassTileClickReturn = useCallback((slotIndex: number) => {
    pushRound((r) => {
      if (r.charlestonPhase === 'done') return r
      const t = r.passSlots[slotIndex]
      if (!t) return r
      lastPassReturnTileIdRef.current = t.id
      const passSlotsNext: PassSlots = [...r.passSlots]
      passSlotsNext[slotIndex] = null
      const passOriginsNext: [number | null, number | null, number | null] = [...r.passSlotOrigins]
      passOriginsNext[slotIndex] = null
      const handNext = [...r.hand]
      handNext.push(t)
      const compacted = compactPassSlotsToRight(passSlotsNext, passOriginsNext)
      return {
        ...r,
        hand: handNext,
        passSlots: compacted.passSlots,
        passSlotOrigins: compacted.passSlotOrigins,
        selectedHandTileId:
          r.selectedHandTileId != null && handNext.some((tile) => tile.id === r.selectedHandTileId)
            ? r.selectedHandTileId
            : null,
      }
    })
  }, [pushRound])

  /*
   * Freeze the hand panel's container-query width to a px value (`--hand-panel-cqw`, consumed by
   * part-0117.css). WKWebView re-evaluates live `100cqi` while a transformed descendant animates
   * (the post-removal slide / drag), which momentarily shrinks every cqi-derived height — the tile
   * faces AND the dark-tray bank. Because the rack column is bottom-anchored, a bank shrink slides
   * the top-pinned tiles down toward the action row (the "tiles get pushed down" report). A
   * ResizeObserver only fires on a REAL box change (resize / orientation / sibling-panel relayout),
   * never during a transient transform, so the frozen px stays put and the dip can't happen. The
   * measured content-box inline size equals what `100cqi` resolves to at rest → pixel-identical.
   */
  useLayoutEffect(() => {
    const el = handPanelRef.current
    if (!el) return
    const dndFrame = el.closest('.app-dnd-frame') as HTMLElement | null
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
      const next = `${w}px`
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
    const onViewportChange = () => refresh()
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver((entries) => {
        const inline = entries[0]?.contentBoxSize?.[0]?.inlineSize
        setVar(inline ?? contentWidth())
      })
      ro.observe(el)
    } else {
      window.addEventListener('resize', onViewportChange)
    }
    window.addEventListener('orientationchange', onViewportChange)
    window.visualViewport?.addEventListener('resize', onViewportChange)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('orientationchange', onViewportChange)
      window.visualViewport?.removeEventListener('resize', onViewportChange)
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
  const visibleHandTiles =
    mainPhase === 'call-staging' && stagedCallTileIds.length > 0
      ? hand.filter((t) => !stagedCallTileIds.includes(t.id))
      : hand
  const handIds = visibleHandTiles.map((t) => t.id)
  /** Pass strip and hand are separate sortable contexts (same DndContext) so rectSortingStrategy does not treat them as one row. */
  const charlestonPassSortableItems = useMemo(() => {
    return passSlots.map((s) => s?.id).filter((id): id is string => id != null)
  }, [passSlots])
  /** Keep Charleston hand sortables stable; cross-zone preview gap is a visual transform in `SortableHand`. */
  const charlestonHandSortableIds = useMemo(() => {
    return handIds
  }, [handIds])
  const charlestonPassPhantomTile = useMemo(() => {
    if (!charlestonPassIntoHandPreview) return null
    return passSlots.find((s) => s?.id === charlestonPassIntoHandPreview.tileId) ?? null
  }, [charlestonPassIntoHandPreview, passSlots])
  /** East discard + pending: keep active id stable in its staging slot; hand preview gap is visual only. */
  const eastMainSortableIds = useMemo(() => {
    if (mainPhase !== 'east-discard' || !pendingEastDiscardTile) return null
    const pid = pendingEastDiscardTile.id
    if (handIds.includes(pid)) return null
    return [pid, ...handIds]
  }, [mainPhase, pendingEastDiscardTile, handIds])
  // Staged tiles share the same SortableContext as hand tiles so dragging animates both zones.
  const sortableItems = mainPhase === 'call-staging'
    ? [...stagedCallTileIds, ...handIds]
    : mainPhase === 'bot-turn' && activeBotDiscard
      ? [incomingBotDiscardDragId(activeBotDiscard.id), ...handIds]
      : eastMainSortableIds ?? handIds

  const mainGameCallDisabled = mainPhase !== 'bot-turn' || !activeBotDiscard
  /**
   * Shared c9–10 cell: on your turn (East discard) the control is always "Swap" — it redeems an
   * exposed joker (staged natural) or exchanges a blank for a discarded tile. Joker-swap UI also
   * makes it "Swap" during call-staging. Otherwise it's "Call" (active only on a bot's discard).
   */
  const mainBarSharedSlotIsSwap =
    jokerSwapUiActive || mainPhase === 'east-discard'
  /** Dim Swap until joker redemption or blank exchange is actually possible (matches Charleston). */
  const hasBlankForExchange =
    hand.some((t) => t.def.cat === 'blank') || pendingEastDiscardTile?.def.cat === 'blank'
  const mainGameSwapDisabled =
    !jokerSwapUiActive &&
    !(
      charlestonDone &&
      mainPhase === 'east-discard' &&
      blankTilesEnabled &&
      hasBlankForExchange &&
      discardedDefsForBlankExchange(discardPile).length > 0
    )
  const mahjongButtonEnabled =
    charlestonDone &&
    (mainPhase === 'east-discard' ||
      ((mainPhase === 'bot-turn' || mainPhase === 'call-staging') && !!activeBotDiscard))
  const mainGamePrimaryIsDone =
    mainPhase === 'call-staging' && showCallStagingDoneButton
  const mainGamePrimaryDisabled =
    mainPhase === 'east-discard'
      ? !pendingEastDiscardTile
      : mainPhase === 'call-staging'
        ? mainGamePrimaryIsDone
          ? !canCommitStagedCallDone
          : true
        : mainPhase === 'bot-turn'
          ? !activeBotDiscard
          : true
  const mainGamePrimaryLabel = mainGamePrimaryIsDone
    ? 'Done'
    : mainPhase === 'east-discard' || mainPhase === 'call-staging'
      ? 'Discard'
      : 'Ignore'

  const showJokerSwapRackHint = !!jokerSwapHintTargetIds && mainBarSharedSlotIsSwap

  const showMahjongRackHint = useMemo(() => {
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

  /** Discard tracker + suggested hands row below rack (always on so layout is visible during Charleston). */
  const showPlaySplitRow = true

  /** Suggested-hands tab + popup shell: hidden only on dead hand / bot Mah Jongg (no rack action row). */
  const showSuggestedHandsPanel =
    mainPhase !== 'dead-hand' && mainPhase !== 'bot-mahjong'

  const updateSuggestedDiscardOverlayBounds = useCallback(() => {
    const popup = suggestedHandsPopupRef.current
    const exposureTopEl = eastExposureRackTopRef.current
    const discardPanel = discardTrackerPanelRef.current

    const content = popup?.parentElement
    if (!content || !exposureTopEl || !discardPanel) {
      setSuggestedDiscardOverlayBounds((prev) =>
        prev.topExtendPx === 0 &&
          prev.bottomExtendPx === 0 &&
          prev.contentHeightPx === 0 &&
          prev.viewportTopPx === 0 &&
          prev.viewportLeftPx === 0 &&
          prev.viewportWidthPx === 0 &&
          prev.viewportBottomPx === 0
          ? prev
          : {
              topExtendPx: 0,
              bottomExtendPx: 0,
              contentHeightPx: 0,
              viewportTopPx: 0,
              viewportLeftPx: 0,
              viewportWidthPx: 0,
              viewportBottomPx: 0,
            },
      )
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
    const next = {
      topExtendPx: Math.max(0, Math.ceil(contentRect.top - exposureRect.top)),
      bottomExtendPx: Math.max(0, Math.ceil(discardRect.bottom - contentRect.bottom)),
      contentHeightPx: Math.max(1, Math.ceil(contentRect.height)),
      viewportTopPx: Math.max(0, Math.floor(exposureRect.top)),
      viewportLeftPx: Math.max(0, Math.floor(contentRect.left)),
      viewportWidthPx: Math.max(1, Math.ceil(contentRect.width)),
      viewportBottomPx: Math.max(0, Math.ceil(viewportH - discardRect.bottom)),
    }
    setSuggestedDiscardOverlayBounds((prev) =>
      prev.topExtendPx === next.topExtendPx &&
        prev.bottomExtendPx === next.bottomExtendPx &&
        prev.contentHeightPx === next.contentHeightPx &&
        prev.viewportTopPx === next.viewportTopPx &&
        prev.viewportLeftPx === next.viewportLeftPx &&
        prev.viewportWidthPx === next.viewportWidthPx &&
        prev.viewportBottomPx === next.viewportBottomPx
        ? prev
        : next,
    )
  }, [])

  useLayoutEffect(() => {
    if (!showSuggestedHandsPanel || !showPlaySplitRow) {
      setSuggestedDiscardOverlayBounds((prev) =>
        prev.topExtendPx === 0 &&
          prev.bottomExtendPx === 0 &&
          prev.contentHeightPx === 0 &&
          prev.viewportTopPx === 0 &&
          prev.viewportLeftPx === 0 &&
          prev.viewportWidthPx === 0 &&
          prev.viewportBottomPx === 0
          ? prev
          : {
              topExtendPx: 0,
              bottomExtendPx: 0,
              contentHeightPx: 0,
              viewportTopPx: 0,
              viewportLeftPx: 0,
              viewportWidthPx: 0,
              viewportBottomPx: 0,
            },
      )
      return
    }

    updateSuggestedDiscardOverlayBounds()
    let raf = 0
    const settleTimers: number[] = []
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(raf)
      raf = window.requestAnimationFrame(updateSuggestedDiscardOverlayBounds)
    }
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
      window.cancelAnimationFrame(raf)
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
    suggestedPanelHandsOn,
  ])

  /** Post-game rack review: New Game sits on a second row under Pass / Discard (cols 12–14). */
  const showReviewNewGameBelowDiscard =
    (mainPhase === 'wall-game' && wallGameReviewing) ||
    (mainPhase === 'mahjong-declared' && mahjongWinReviewing)

  const renderSuggestedHandsPopup = () => {
    if (!showSuggestedHandsPanel) return null

    const overlayStyle: CSSProperties = {
      ['--suggested-overlay-top-peek' as string]: '0px',
      ['--suggested-overlay-content-h' as string]: `${suggestedDiscardOverlayBounds.contentHeightPx}px`,
      ['--suggested-overlay-top-extend' as string]: `${suggestedDiscardOverlayBounds.topExtendPx}px`,
      ['--suggested-overlay-bottom-extend' as string]: `${suggestedDiscardOverlayBounds.bottomExtendPx}px`,
      ['--suggested-overlay-viewport-top' as string]: `${suggestedDiscardOverlayBounds.viewportTopPx}px`,
      ['--suggested-overlay-viewport-left' as string]: `${suggestedDiscardOverlayBounds.viewportLeftPx}px`,
      ['--suggested-overlay-viewport-width' as string]: `${suggestedDiscardOverlayBounds.viewportWidthPx}px`,
      ['--suggested-overlay-viewport-bottom' as string]: `${suggestedDiscardOverlayBounds.viewportBottomPx}px`,
    }

    return (
      <div
        ref={suggestedHandsPopupRef}
        id="suggested-hands-popup"
        className={[
          'suggested-hands-popup',
          'suggested-hands-popup--discard-overlay',
          suggestedPanelHandsOn ? 'suggested-hands-popup--open' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="dialog"
        aria-label="Suggested Hands"
        aria-modal="false"
        aria-hidden={!suggestedPanelHandsOn}
        style={overlayStyle}
      >
        <SuggestedHandsPanel
          discardTraySurface
          onPinnedPatternChange={toggleSuggestedPinnedHandKey}
          hands={eastSuggestedHands}
          activePatternId={suggestedFocusHandKey}
          pinnedHandKeys={suggestedPinnedHandKeys}
          onPatternClick={onSuggestedPatternClick}
          onFocusKeyMigrate={onSuggestedFocusKeyMigrate}
          tilesGuideOn={deferredSuggestedPanelTilesOn}
          rackTilesForSuggestedStrip={rackForSuggestedHandsUi}
          rackTilesForPatternMatch={rackForSuggestedPatternMatch}
          exposureTileIdsForSuggestedStrip={suggestedHandsExposureTileIds}
          uncheckedSections={suggestedHandsUncheckedSections}
          hideConcealedHands={suggestedHandsHideConcealed}
          cardPatterns={cardPatterns}
          cardSectionOrder={cardSectionOrder}
          deadCauseByFocusKey={suggestedDeadCauseByFocusKey}
        />
      </div>
    )
  }

  return (
    <TileGraphicsProvider tileGraphics={tileGraphics}>
    <div
      className="app"
      data-tile-graphics={tileGraphics}
      data-color-buttons={colorButtonsEnabled ? 'on' : 'off'}
      data-animations={animationsEnabled ? 'on' : 'off'}
    >
      {menuOpen ? (
        <div
          className="app-menu-modal-layer"
          role="presentation"
        >
          <button
            type="button"
            className="app-menu-modal__backdrop"
            tabIndex={-1}
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <div
            id="app-menu-modal"
            className="app-menu-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
          >
            <header className="app-menu-modal__header">
              <button
                type="button"
                className="app-menu-modal__close"
                aria-label="Close"
                onClick={() => setMenuOpen(false)}
              >
                ✕
              </button>
            </header>
            <div className="app-menu-modal__body">
              <div className="app-menu-modal__diff-block">
                <div className="app-menu-modal__subhead" id="app-menu-playable-card-label">
                  Select card
                </div>
                <div
                  className="app-menu-tray__diff-row app-menu-modal__diff-row"
                  role="radiogroup"
                  aria-labelledby="app-menu-playable-card-label"
                >
                  {PLAYABLE_CARD_IDS.map((id) => (
                    <button
                      key={id}
                      type="button"
                      className={[
                        'btn',
                        'app-menu-tray__diff-btn',
                        menuCardId === id ? 'app-menu-tray__diff-btn--on' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      role="radio"
                      aria-checked={menuCardId === id}
                      onClick={() => requestPlayableCard(id)}
                    >
                      {PLAYABLE_CARD_LABEL[id]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="app-menu-modal__diff-block app-menu-modal__diff-block--game-actions">
                <div className="app-menu-modal__game-actions-row app-menu-tray__diff-row app-menu-modal__diff-row">
                  <button
                    type="button"
                    className="btn app-menu-tray__diff-btn app-menu-modal__end-game"
                    disabled={!canEndGame}
                    onClick={endGame}
                  >
                    End Game
                  </button>
                  <button
                    type="button"
                    className="btn app-menu-tray__diff-btn app-menu-modal__new-game"
                    onClick={() => {
                      if (newHand()) setMenuOpen(false)
                    }}
                  >
                    New Game
                  </button>
                </div>
              </div>
              <div className="app-menu-modal__diff-block">
                <div className="app-menu-modal__subhead" id="bot-difficulty-menu-label">
                  Bot difficulty
                </div>
                <div
                  className="app-menu-tray__diff-row app-menu-modal__diff-row"
                  role="radiogroup"
                  aria-labelledby="bot-difficulty-menu-label"
                >
                  {BOT_DIFFICULTIES.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={['btn', 'app-menu-tray__diff-btn', botDifficulty === d ? 'app-menu-tray__diff-btn--on' : ''].filter(Boolean).join(' ')}
                      role="radio"
                      aria-checked={botDifficulty === d}
                      onClick={() => setBotDifficultyLevel(d)}
                    >
                      {BOT_DIFFICULTY_LABEL[d]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="app-menu-modal__diff-block app-menu-modal__diff-block--tile-graphics">
                <div className="app-menu-modal__tile-graphics-category">
                  <hr className="app-menu-modal__tile-graphics-category__line" aria-hidden="true" />
                  <span
                    className="app-menu-modal__tile-graphics-category__label"
                    id="tile-graphics-menu-label"
                  >
                    Tile graphics
                  </span>
                  <hr className="app-menu-modal__tile-graphics-category__line" aria-hidden="true" />
                </div>
                <div
                  className="app-menu-modal__tile-graphics-modes app-menu-tray__diff-row app-menu-modal__diff-row"
                  role="radiogroup"
                  aria-labelledby="tile-graphics-menu-label"
                >
                  {MENU_TILE_GRAPHICS.map((g) => (
                    <button
                      key={g}
                      type="button"
                      className={[
                        'btn',
                        'app-menu-tray__diff-btn',
                        tileGraphics === g ? 'app-menu-tray__diff-btn--on' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      role="radio"
                      aria-checked={tileGraphics === g}
                      onClick={() => setTileGraphicsMode(g)}
                    >
                      {TILE_GRAPHICS_LABEL[g]}
                    </button>
                  ))}
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
              </div>
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
                          return (
                            <AppMenuFilterToggleButton
                              key={section}
                              pressed={shown}
                              dimmed={dimmed}
                              onToggle={() =>
                                setSuggestedHandsUncheckedSections((prev) =>
                                  toggledSuggestedHandSectionFilter(section, prev, !shown),
                                )
                              }
                            >
                              {suggestedHandSectionMenuLabel(section)}
                            </AppMenuFilterToggleButton>
                          )
                        })}
                        {ci === suggestedHandsFilterColumns.length - 1 ? (
                          <AppMenuFilterToggleButton
                            pressed={!suggestedHandsHideConcealed}
                            onToggle={() => setSuggestedHandsHideConcealed((v) => !v)}
                          >
                            Concealed (C)
                          </AppMenuFilterToggleButton>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="app-menu-tray__divider app-menu-modal__section-rule" role="separator" />
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
                <div className="app-menu-modal__row app-menu-modal__row--toggle">
                  <AppMenuSettingSwitch
                    labelId="app-menu-label-bot-wins"
                    pressed={botWinsEnabled}
                    onToggle={toggleBotWins}
                  />
                  <span
                    className="app-menu-modal__label"
                    id="app-menu-label-bot-wins"
                  >
                    {BOT_WINS_LABEL}
                  </span>
                </div>
                <div className="app-menu-modal__row app-menu-modal__row--toggle">
                  <AppMenuSettingSwitch
                    labelId="app-menu-label-suggested-tiles"
                    pressed={suggestedPanelTilesOn}
                    onToggle={toggleSuggestedPanelTilesOn}
                  />
                  <span className="app-menu-modal__label" id="app-menu-label-suggested-tiles">
                    Show suggested tiles
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
                    labelId="app-menu-label-concealed-hand-reminder"
                    pressed={concealedHandReminderEnabled}
                    onToggle={toggleConcealedHandReminder}
                  />
                  <span className="app-menu-modal__label" id="app-menu-label-concealed-hand-reminder">
                    {CONCEALED_HAND_REMINDER_LABEL}
                  </span>
                </div>
                <div className="app-menu-modal__row app-menu-modal__row--toggle">
                  <AppMenuSettingSwitch
                    labelId="app-menu-label-ten-jokers"
                    pressed={tenJokersEnabled}
                    onToggle={toggleTenJokers}
                  />
                  <span className="app-menu-modal__label" id="app-menu-label-ten-jokers">
                    {TEN_JOKERS_LABEL}
                  </span>
                </div>
                <div
                  className="app-menu-modal__row app-menu-modal__row--toggle app-menu-modal__row--blank-tiles"
                >
                  <AppMenuSettingSwitch
                    labelId="app-menu-label-blank-tiles"
                    pressed={blankTilesEnabled}
                    onToggle={toggleBlankTiles}
                  />
                  <div className="app-menu-modal__blank-tiles-trail">
                    <span className="app-menu-modal__label" id="app-menu-label-blank-tiles">
                      {BLANK_TILES_LABEL}
                    </span>
                    <div
                      className="app-menu-modal__blank-tile-counts"
                      role="radiogroup"
                      aria-labelledby="app-menu-label-blank-tiles"
                    >
                      {BLANK_TILE_COUNT_OPTIONS.map((n) => (
                        <button
                          key={n}
                          type="button"
                          className={[
                            'btn',
                            'app-menu-modal__blank-tile-count-btn',
                            blankTilesEnabled && blankTileCount === n
                              ? 'app-menu-modal__blank-tile-count-btn--on'
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          role="radio"
                          aria-checked={blankTilesEnabled && blankTileCount === n}
                          disabled={!blankTilesEnabled}
                          onClick={() => setBlankTileCountLevel(n)}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {charlestonPassError || callRuleError || blockingDialog ? (
        <div
          className="charleston-error-overlay"
          role="presentation"
          onClick={() => {
            // Warnings that require an explicit choice — backdrop click does nothing
            if (blockingDialog?.variant === 'different-card-requires-new-game') return
            if (blockingDialog?.variant === 'dead-hand-warning') return
            if (blockingDialog?.variant === 'mahjong-dead-warning') return
            if (blockingDialog?.variant === 'call-exposure-dead-warning') return
            if (blockingDialog?.variant === 'call-meld-size-warning') return
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
              charlestonPassError
                ? 'charleston-error-dialog--menu-shell'
                : '',
              blockingDialog?.variant === 'concealed-call-warning'
                ? 'charleston-error-dialog--concealed-call-warning'
                : '',
              blockingDialog?.variant === 'dead-hand-warning'
                ? 'charleston-error-dialog--dead-hand-warning'
                : '',
              blockingDialog?.variant === 'different-card-requires-new-game'
                ? 'charleston-error-dialog--blocking-neutral'
                : '',
              blockingDialog?.variant === 'mahjong-dead-warning'
                ? 'charleston-error-dialog--blocking-neutral charleston-error-dialog--mahjong-dead-warning'
                : '',
              blockingDialog?.variant === 'call-exposure-dead-warning' ||
              blockingDialog?.variant === 'call-meld-size-warning' ||
              blockingDialog?.variant === 'discard-dead-warning'
                ? 'charleston-error-dialog--blocking-neutral charleston-error-dialog--mahjong-dead-warning'
                : '',
              blockingDialog?.variant === 'mahjong-blocked'
                ? 'charleston-error-dialog--table charleston-error-dialog--mahjong-blocked'
                : '',
              blockingDialog?.variant === 'different-card-requires-new-game'
                ? 'charleston-error-dialog--new-game-warning'
                : '',
              callRuleError ? 'charleston-error-dialog--call-warning' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={
              blockingDialog?.variant === 'table' ||
              blockingDialog?.variant === 'different-card-requires-new-game' ||
              blockingDialog?.variant === 'dead-hand-warning' ||
              blockingDialog?.variant === 'mahjong-dead-warning' ||
              blockingDialog?.variant === 'call-exposure-dead-warning' ||
              blockingDialog?.variant === 'call-meld-size-warning' ||
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
              blockingDialog?.variant === 'discard-dead-warning' ||
              blockingDialog?.variant === 'concealed-call-warning'
                ? 'game-blocking-error-body'
                : undefined
            }
            onClick={(e) => e.stopPropagation()}
          >
            {blockingDialog?.variant === 'different-card-requires-new-game' ? (
              <>
                <h2 id="game-blocking-error-title" className="charleston-error-dialog__title">
                  Selecting a different card will require a New Game.
                </h2>
                <div className="charleston-error-dialog__actions charleston-error-dialog__actions--spread">
                  <button
                    type="button"
                    className="btn charleston-error-dialog__rack-action"
                    onClick={(e) => {
                      e.stopPropagation()
                      setBlockingDialog(null)
                      setMenuCardId(committedCardIdRef.current)
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary charleston-error-dialog__rack-action"
                    onClick={() => {
                      const id = blockingDialog.pendingCardId
                      setBlockingDialog(null)
                      setMenuCardId(id)
                    }}
                  >
                    OK
                  </button>
                </div>
              </>
            ) : blockingDialog?.variant === 'concealed-call-warning' ? (
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
                      proceedWithCallRef.current?.()
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
                  Your current tiles do not complete any legal hand on the{' '}
                  <strong>2026 NMJL card</strong>. If you proceed with this Mah Jongg declaration,
                  your hand will be officially dead and the game will end immediately.
                </p>
                <div className="charleston-error-dialog__actions charleston-error-dialog__actions--spread">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setBlockingDialog(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn--danger"
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
                    className="btn"
                    onClick={() => setBlockingDialog(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => {
                      const n = blockingDialog.neededHandTiles
                      setBlockingDialog(null)
                      pushRound((r) =>
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
                    className="btn btn--danger"
                    onClick={() => {
                      setBlockingDialog(null)
                      pushRound((r) => applyCommitStagedCall(r, gameModeRef.current))
                    }}
                  >
                    Expose pung anyway
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
                    ? 'Calling this tile would expose a meld that does not fit any remaining playable hand on the 2026 NMJL card. If you proceed, your hand will be officially dead and the game will end immediately.'
                    : 'Your current exposures do not fit any remaining playable hand on the 2026 NMJL card. Proceeding will end the game with a dead hand.'}
                </p>
                <div className="charleston-error-dialog__actions charleston-error-dialog__actions--spread">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setBlockingDialog(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn--danger"
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
              <IllegalMahjongDialog
                rankInput={blockingDialog.rankInput}
                onDismiss={() => {
                  setCharlestonPassError(null)
                  setCallRuleError(null)
                  setBlockingDialog(null)
                }}
              />
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
                <div className="charleston-error-dialog__actions">
                  <button
                    type="button"
                    className="btn btn--primary"
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
      {mainPhase === 'wall-game' && !wallGameReviewing ? (
        <div className="wall-game-overlay" role="dialog" aria-modal="true" aria-labelledby="wall-game-title">
          <div
            className="wall-game-dialog wall-game-dialog--wall-seats"
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
                onClick={() => { setWallGameReviewing(true); setMenuOpen(true) }}
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
          </div>
        </div>
      ) : null}
      {charlestonDone && mainPhase === 'mahjong-declared' && !mahjongWinReviewing && (
        <div className="wall-game-overlay" role="dialog" aria-modal="true" aria-labelledby="mj-win-title">
          <div
            className="wall-game-dialog wall-game-dialog--wall-seats"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="mj-win-title" className="wall-game-dialog__title">
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
                onClick={() => { setMahjongWinReviewing(true); setMenuOpen(true) }}
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
          </div>
        </div>
      )}
      {charlestonDone && mainPhase === 'bot-mahjong' && postGameBotMahjongReview && !botMahjongWinReviewing && (
        <div className="wall-game-overlay" role="dialog" aria-modal="true" aria-labelledby="bot-mj-win-title">
          <div
            className="wall-game-dialog wall-game-dialog--wall-seats"
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
                onClick={() => { setBotMahjongWinReviewing(true); setMenuOpen(true) }}
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
          </div>
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={tileDragCollisionDetection}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragCancel={onDragCancel}
        onDragEnd={onDragEnd}
      >
      <div
        className="app-layout"
        data-animations={animationsEnabled ? 'on' : 'off'}
        data-joker-swap-hint={jokerSwapHintEnabled ? 'on' : 'off'}
        data-joker-swap-hint-iter={jokerSwapHandHintSingleBounce ? '1' : '4'}
      >
        <div className="app-main">
          <div
            className={[
              'app-main__scroll',
              charlestonDone && mainPhase !== 'east-discard' && mainPhase !== 'bot-mahjong'
                ? ''
                : 'app-main__scroll--collapsed',
            ]
              .filter(Boolean)
              .join(' ')}
          >
          </div>

            <div
              className={[
                'app-dnd-frame',
                suggestedPanelHandsOn ? 'app-dnd-frame--suggested-hands-open' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
            {showPlaySplitRow ? (
                <div className="app-play-split app-top-exposure-container">
                <div className="app-play-split__left">
                  <section
                    className="panel panel--discard-tracker panel--discard-tracker--top"
                    aria-label="Discard tracker"
                  >
                    <div className="discard-tracker__shell">
                      <div className="discard-tracker__content discard-tracker__content--tile-groups-only">
                        <BlankExchangeDropZone active={!!blankExchangeDragArmed}>
                        <div className="discard-tracker__tile-groups-container">
                        <DiscardTrackerSlotGrid
                          discardPile={displayedDiscardPile}
                          botExposures={botExposures}
                          mainPhase={mainPhase}
                          activeBotIndex={activeBotIndex}
                          calledThrowerRowIdx={
                            mainPhase === 'call-staging' && activeBotIndex != null
                              ? activeBotIndex
                              : botTurnBanner?.discarderBotIndex ?? null
                          }
                          jokerSwapUiActive={jokerSwapUiActive}
                          animationsEnabled={animationsEnabled}
                          botExposureFlyInTileIds={botExposureFlyInTileIds}
                          exposureJokerSwapFlyInTileIds={exposureJokerSwapFlyInTileIds}
                          botExposureSuggestedTileGuide={botExposureSuggestedTileGuide}
                          botExposureDeadIds={
                            suggestedDeadTableGuideForView?.botExposureDeadIds ?? null
                          }
                          jokerSwapHintBounceTileIds={jokerSwapHintBounceIds?.jokers ?? null}
                          jokerSwapHintBounceEpoch={jokerSwapHintBounceEpoch}
                          blankTilesEnabled={blankTilesEnabled}
                          suggestedDiscardTrackerNeedDefs={suggestedDiscardTrackerNeedDefs}
                        />
                        </div>
                        </BlankExchangeDropZone>
                      </div>
                    </div>
                  </section>
                </div>
                </div>
            ) : null}
              <div className="app-rack-stage">
            {/* ── Hand ── */}
            <section ref={handPanelRef} className="panel panel--hand" aria-label="Your hand, East">
              <div className="panel-hand-rack">
                <div className="panel-hand-rack__column">
                  {!charlestonDone ? (
                    <>
                      <div className="rack-stage rack-stage--charleston" role="group">
                        <div className="rack-stage__rack-col">
                          <div ref={eastExposureRackTopRef} className="rack-stage__rack-top">
                            <SortableContext items={charlestonPassSortableItems} strategy={rectSortingStrategy}>
                            <ExposureRack
                              className="exposure-rack--charleston-pass"
                              stackSuitTiles
                              melds={eastExposures.map((exp) => ({
                                tiles: exp.tiles,
                                calledTileId: exp.calledTileId,
                              }))}
                              suggestedTileGuide={suggestedTileGuideForRack}
                              slotCount={14}
                              reserveTrailingSlots={3}
                              ariaLabel="Your exposures and Charleston pass"
                              trailingSuffix={
                                <PassStrip
                                  variant="inlineTail"
                                  slots={passSlots}
                                  onPassBoxClick={onPassBoxClick}
                                  onPassTileClickReturn={onPassTileClickReturn}
                                  suggestedBestIds={suggestedTileGuideForRack?.bestIds}
                                  flyOutFrom={passStripFlyOut}
                                  hiddenSortableTileId={null}
                                  returningTileId={charlestonPassIntoHandPreview?.tileId ?? null}
                                  inlineHeaderTitle={charlestonRackRoundTitleText}
                                  inlineHeaderInstruction={
                                    <CharlestonPassStripInstructionMain phase={charlestonPhase} />
                                  }
                                  inlineHeaderInstructionAria={charlestonPassStripInstructionAria(
                                    charlestonPhase,
                                  )}
                                />
                              }
                            />
                            </SortableContext>
                          </div>
                          <div className="panel-hand-rack__hand-tray">
                            <div className="rack-stage__rack-bottom">
                                <HandBank>
                                  <SortableContext items={charlestonHandSortableIds} strategy={rectSortingStrategy}>
                                  <SortableHand
                                    tiles={hand}
                                    sortableOrder={charlestonHandSortableIds}
                                    charlestonPassPhantomTile={charlestonPassPhantomTile}
                                    externalInsertPreviewIndex={charlestonPassIntoHandPreview?.handPreviewIndex ?? null}
                                    passStageTileId={charlestonHandPassStageTileId}
                                    selectedTileId={selectedHandTileId}
                                    onTileActivate={onHandTileActivate}
                                    highlightedTileId={drawnTileId}
                                    charlestonGlowTileIds={charlestonGlowTileIds ?? undefined}
                                    handTileFlyIn={animationsEnabled ? handTileFlyIn : null}
                                    handJokerSwapFlyInFromBelowId={
                                      animationsEnabled ? handJokerSwapFlyInFromBelowId : null
                                    }
                                    suggestedTileGuide={suggestedTileGuideForRack}
                                    suggestedDeadTileGuide={suggestedDeadTileGuideForRack}
                                    discardMode={false}
                                    animationsEnabled={animationsEnabled}
                                    jokerSwapHintBounceTileIds={jokerSwapHintBounceIds?.hand ?? null}
                                    jokerSwapHintBounceEpoch={jokerSwapHintBounceEpoch}
                                  />
                                  </SortableContext>
                                </HandBank>
                            </div>
                            <div
                              className="panel-hand-rack__charleston-actions-well"
                            >
                            <div
                              className="rack-bottom-bar rack-bottom-bar--charleston rack-bottom-bar--tile-grid"
                              role="group"
                              aria-label="Charleston pass"
                            >
                              <button
                                type="button"
                                className="btn btn--rack-neutral rack-bottom-tile-cell rack-bottom-tile-cell--c1"
                                onClick={sortHand}
                              >
                                Sort
                              </button>
                              <HandRackMenuAnchor
                                menuOpen={menuOpen}
                                onToggle={() => setMenuOpen((v) => !v)}
                                menuContainerRef={menuContainerRef}
                              />
                              <WallTilesRemainCell
                                count={wall.length}
                                className={`rack-hand-tools__wall rack-bottom-wall rack-bottom-tile-cell rack-bottom-tile-cell--c3${
                                  wall.length >= openingWallTileCount ? ' rack-bottom-wall--full' : ''
                                }${wall.length === 0 ? ' rack-bottom-wall--empty' : ''}`}
                                style={wallRemainHeatStyle(wall.length, openingWallTileCount)}
                              />
                              {showSuggestedHandsPanel ? (
                                <button
                                  type="button"
                                  className={[
                                    'btn',
                                    'btn--primary',
                                    'charleston-pass-btn',
                                    'suggested-hands-tab',
                                    'rack-bottom-tile-cell',
                                    'rack-bottom-tile-cell--c4-5',
                                    suggestedPanelHandsOn && mainPhase !== 'mahjong-declared'
                                      ? 'suggested-hands-tab--open'
                                      : '',
                                  ]
                                    .filter(Boolean)
                                    .join(' ')}
                                  aria-label="Suggested hands"
                                  onClick={onHandsButtonClick}
                                  onPointerDown={onHandsButtonPointerDown}
                                  onPointerUp={onHandsButtonPointerUpOrLeave}
                                  onPointerLeave={onHandsButtonPointerUpOrLeave}
                                  onPointerCancel={onHandsButtonPointerUpOrLeave}
                                  aria-expanded={mainPhase !== 'mahjong-declared' && suggestedPanelHandsOn}
                                  aria-controls="suggested-hands-popup"
                                >
                                  Hands
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className={[
                                  'btn btn--mahjong rack-bottom-tile-cell rack-bottom-tile-cell--c5-6',
                                  showMahjongRackHint ? 'btn--mahjong-hint' : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                                disabled={!mahjongButtonEnabled}
                                onClick={declareMahjong}
                                aria-label="Mah Jongg"
                              >
                                <span className="btn--mahj__logo-stack">
                                  <span className="btn--mahj__logo-stack__well" aria-hidden />
                                  <img className="btn--mahj__img" src={mahjLogoSrc} alt="" draggable={false} />
                                </span>
                              </button>
                              <button
                                type="button"
                                className="btn btn--rack-neutral btn--logic rack-bottom-tile-cell rack-bottom-tile-cell--c7-8"
                                aria-label="Logic"
                                onClick={() => {}}
                              >
                                <img className="btn--logic__img" src={logicLogoSrc} alt="Logic" draggable={false} />
                              </button>
                              <button
                                type="button"
                                className="btn btn--joker-swap-action rack-bottom-tile-cell rack-bottom-tile-cell--c9-10"
                                disabled
                                aria-label="Swap"
                              >
                                Swap
                              </button>
                              <button
                                type="button"
                                className="btn btn--primary charleston-pass-btn rack-bottom-tile-cell rack-bottom-tile-cell--c12-14"
                                aria-label={charlestonPassDirections(charlestonPhase)}
                                disabled={!passReady || passStripFlyOut != null}
                                aria-disabled={!passReady || passStripFlyOut != null}
                                onClick={onCharlestonPassButtonClick}
                              >
                                {charlestonPassButtonLabel()}
                              </button>
                              {undoEnabled && canUndo ? (
                                <span
                                  className="btn__undo-inset rack-bottom-tile-cell rack-bottom-tile-cell--c12-14"
                                  role="button"
                                  tabIndex={0}
                                  aria-label="Undo"
                                  onClick={() => undoAction()}
                                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); undoAction() } }}
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <polyline points="1 4 1 10 7 10" />
                                    <path d="M6 18a9 9 0 1 0-.36-12.36L1 10" />
                                  </svg>
                                </span>
                              ) : null}
                            </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="rack-stage rack-stage--main-rack">
                        <div
                          className={[
                            'rack-stage__rack-col',
                            callMeldInsetCols > 0 ? 'rack-stage__rack-col--call-meld-inset' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          style={
                            callMeldInsetCols > 0
                              ? ({
                                  ['--call-meld-inset-cols' as string]: callMeldInsetCols,
                                } as CSSProperties)
                              : undefined
                          }
                        >
                          <SortableContext items={sortableItems} strategy={rectSortingStrategy}>
                          <div ref={eastExposureRackTopRef} className="rack-stage__rack-top">
                            <StagingMeldDropZone active={mainPhase === 'call-staging'}>
                            <EastOwnJokerSwapDropZone active={jokerSwapUiActive}>
                            <ExposureRack
                              stackSuitTiles
                              callStagingWaveFlyIn={
                                animationsEnabled ? eastCallStagedWaveFlyIn : null
                              }
                              flyInTileIds={exposureJokerSwapFlyInTileIds}
                              flyInFromBelowTileIds={exposureJokerSwapFlyInTileIds}
                              jokerSwapHintBounceTileIds={jokerSwapHintBounceIds?.jokers ?? null}
                              jokerSwapHintBounceEpoch={jokerSwapHintBounceEpoch}
                              melds={
                                mainPhase === 'mahjong-declared'
                                  ? []
                                  : mainPhase === 'bot-mahjong'
                                    ? [{ tiles: hand }]
                                  : [
                                ...eastExposures
                                  .map((exp, exposureIdx) => ({ exp, exposureIdx }))
                                  .filter(
                                    ({ exp }) =>
                                      mainPhase !== 'wall-game' ||
                                      exp.tiles.length <= WALL_GAME_MAX_EXPOSURE_MELD_TILES,
                                  )
                                  .map(({ exp, exposureIdx }) => ({
                                    tiles: exp.tiles,
                                    calledTileId: exp.calledTileId,
                                    sortableMeldId:
                                      (mainPhase === 'east-discard' || mainPhase === 'bot-turn') &&
                                      eastExposures.length > 1
                                        ? eastExposureMeldSortId(exposureIdx)
                                        : undefined,
                                    dropZoneId:
                                      jokerSwapUiActive &&
                                      exp.tiles.some((t) => t.def.cat === 'joker')
                                        ? eastExposureSwapDropId(exposureIdx)
                                        : undefined,
                                  })),
                                ...(mainPhase === 'call-staging' && activeBotDiscard
                                  ? [{
                                      tiles: [
                                        activeBotDiscard,
                                        ...hand.filter((t) => stagedCallTileIds.includes(t.id)),
                                      ],
                                      calledTileId: activeBotDiscard.id,
                                      onTileClick: (id: string) =>
                                        pushRound((r) => applyToggleStagedCallTile(r, id)),
                                    }]
                                  : []),
                                  ]
                              }
                              suggestedTileGuide={suggestedTileGuideForRack}
                              highlightCalledTile={mainPhase === 'call-staging'}
                              ariaLabel="Your exposures"
                              reserveLastSlotForDiscard={mainPhase !== 'call-staging' && mainPhase !== 'mahjong-declared' && mainPhase !== 'bot-mahjong'}
                              lastSlotTile={
                                activeBotDiscard && mainPhase === 'bot-turn'
                                  ? activeBotDiscard
                                  : null
                              }
                              incomingBotDiscardFlyFrom={
                                animationsEnabled ? incomingBotDiscardFlyFrom : null
                              }
                              lastSlotDraggableForCallInit={
                                mainPhase === 'bot-turn' && activeBotDiscard != null
                              }
                              lastSlotLabel={
                                mainPhase === 'bot-turn' &&
                                activeBotDiscard != null &&
                                activeBotIndex != null
                                  ? `${BOT_LABELS[activeBotIndex]?.charAt(0) ?? ''} >`
                                  : undefined
                              }
                              lastSlotClassName={
                                [
                                  mainPhase === 'east-discard'
                                    ? 'exposure-rack__slot--east-discard-instructed'
                                    : '',
                                  pendingEastDiscardTile &&
                                  suggestedTileGuideForRack?.bestIds.has(pendingEastDiscardTile.id)
                                    ? 'exposure-rack__slot--suggest-best'
                                    : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ') || undefined
                              }
                              lastSlotReplace={
                                mainPhase === 'east-discard' ? (
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
                                      jokerSwapHintBounce={
                                        !!pendingEastDiscardTile &&
                                        !!jokerSwapHintBounceIds?.hand.has(pendingEastDiscardTile.id)
                                      }
                                      jokerSwapHintBounceEpoch={jokerSwapHintBounceEpoch}
                                    />
                                  </>
                                ) : null
                              }
                              firstEmptyOverride={
                                charlestonDone &&
                                mainPhase === 'bot-turn' &&
                                activeBotDiscard &&
                                incomingBotDiscardCallDragActive ? (
                                  <CallInitiateFirstEmptyTarget />
                                ) : undefined
                              }
                            />
                            </EastOwnJokerSwapDropZone>
                            </StagingMeldDropZone>
                          </div>
                          <div className="panel-hand-rack__hand-tray">
                            {mainPhase !== 'bot-mahjong' && (
                            <div className="rack-stage__rack-bottom">
                                <HandBank>
                                  <SortableHand
                                    tiles={
                                      mainPhase === 'mahjong-declared'
                                        ? (winHandSortedTiles ?? [])
                                        : visibleHandTiles
                                    }
                                    sortableOrder={undefined}
                                    externalInsertPreviewIndex={eastDiscardIntoHandPreview?.handPreviewIndex ?? null}
                                    selectedTileId={
                                      mainPhase === 'east-discard' ? null : selectedHandTileId
                                    }
                                    onTileActivate={onHandTileActivate}
                                    highlightedTileId={drawnTileId}
                                    charlestonGlowTileIds={charlestonGlowTileIds ?? undefined}
                                    handTileFlyIn={animationsEnabled ? handTileFlyIn : null}
                                    handJokerSwapFlyInFromBelowId={
                                      animationsEnabled ? handJokerSwapFlyInFromBelowId : null
                                    }
                                    suggestedTileGuide={suggestedTileGuideForRack}
                                    suggestedDeadTileGuide={suggestedDeadTileGuideForRack}
                                    discardMode={false}
                                    animationsEnabled={animationsEnabled}
                                    jokerSwapHintBounceTileIds={jokerSwapHintBounceIds?.hand ?? null}
                                    jokerSwapHintBounceEpoch={jokerSwapHintBounceEpoch}
                                  />
                                </HandBank>
                            </div>
                            )}
                            {mainPhase !== 'bot-mahjong' && mainPhase !== 'dead-hand' ? (
                              <div
                                className="panel-hand-rack__action-well"
                              >
                              <div
                                className="rack-bottom-bar rack-bottom-bar--main rack-bottom-bar--tile-grid"
                                role="group"
                                aria-label="Table actions"
                              >
                                <button
                                  type="button"
                                  className="btn btn--rack-neutral rack-bottom-tile-cell rack-bottom-tile-cell--c1"
                                  onClick={sortHand}
                                >
                                  Sort
                                </button>
                                <HandRackMenuAnchor
                                  menuOpen={menuOpen}
                                  onToggle={() => setMenuOpen((v) => !v)}
                                  menuContainerRef={menuContainerRef}
                                />
                                <WallTilesRemainCell
                                  count={wall.length}
                                  className={`rack-hand-tools__wall rack-bottom-wall rack-bottom-tile-cell rack-bottom-tile-cell--c3${
                                    wall.length >= openingWallTileCount ? ' rack-bottom-wall--full' : ''
                                  }${wall.length === 0 ? ' rack-bottom-wall--empty' : ''}`}
                                  style={wallRemainHeatStyle(wall.length, openingWallTileCount)}
                                />
                                {showSuggestedHandsPanel ? (
                                  <button
                                    type="button"
                                    className={[
                                      'btn',
                                      'btn--primary',
                                      'charleston-pass-btn',
                                      'suggested-hands-tab',
                                      'rack-bottom-tile-cell',
                                      'rack-bottom-tile-cell--c4-5',
                                      suggestedPanelHandsOn && mainPhase !== 'mahjong-declared'
                                        ? 'suggested-hands-tab--open'
                                        : '',
                                    ]
                                      .filter(Boolean)
                                      .join(' ')}
                                    aria-label="Suggested hands"
                                    onClick={onHandsButtonClick}
                                    onPointerDown={onHandsButtonPointerDown}
                                    onPointerUp={onHandsButtonPointerUpOrLeave}
                                    onPointerLeave={onHandsButtonPointerUpOrLeave}
                                    onPointerCancel={onHandsButtonPointerUpOrLeave}
                                    aria-expanded={mainPhase !== 'mahjong-declared' && suggestedPanelHandsOn}
                                    aria-controls="suggested-hands-popup"
                                  >
                                    Hands
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className={[
                                    'btn btn--mahjong rack-bottom-tile-cell rack-bottom-tile-cell--c5-6',
                                    showMahjongRackHint ? 'btn--mahjong-hint' : '',
                                    mainPhase === 'mahjong-declared' && mahjongWinReviewing
                                      ? 'btn--mahjong-rack-pressed-in'
                                      : '',
                                  ]
                                    .filter(Boolean)
                                    .join(' ')}
                                  disabled={!mahjongButtonEnabled}
                                  aria-label="Mah Jongg"
                                  onClick={declareMahjong}
                                >
                                  <span className="btn--mahj__logo-stack">
                                    <span className="btn--mahj__logo-stack__well" aria-hidden />
                                    <img className="btn--mahj__img" src={mahjLogoSrc} alt="" draggable={false} />
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  className="btn btn--rack-neutral btn--logic rack-bottom-tile-cell rack-bottom-tile-cell--c7-8"
                                  aria-label="Logic"
                                  onClick={() => {}}
                                >
                                  <img className="btn--logic__img" src={logicLogoSrc} alt="Logic" draggable={false} />
                                </button>
                                {mainBarSharedSlotIsSwap ? (
                                  <button
                                    type="button"
                                    className={[
                                      'btn btn--joker-swap-action rack-bottom-tile-cell rack-bottom-tile-cell--c9-10',
                                      showJokerSwapRackHint ? 'btn--joker-swap-hint' : '',
                                    ]
                                      .filter(Boolean)
                                      .join(' ')}
                                    disabled={mainGameSwapDisabled}
                                    aria-disabled={mainGameSwapDisabled}
                                    onClick={executeSwapFromSlot}
                                    aria-label="Swap"
                                  >
                                    Swap
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className={[
                                      'btn btn--joker-swap-action rack-bottom-tile-cell rack-bottom-tile-cell--c9-10',
                                      concealedHandReminderEnabled && focusedHandIsConcealed ? 'btn--call-concealed' : '',
                                    ]
                                      .filter(Boolean)
                                      .join(' ')}
                                    disabled={mainGameCallDisabled}
                                    onClick={initiateCall}
                                    aria-label="Call discard"
                                  >
                                    {concealedHandReminderEnabled && focusedHandIsConcealed ? (
                                      <>
                                        <span
                                          className="hands-list__card-c"
                                          aria-label="Concealed hand"
                                        >C</span>all
                                      </>
                                    ) : 'Call'}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className={[
                                    'btn rack-bottom-tile-cell rack-bottom-tile-cell--c12-14',
                                    mainPhase === 'east-discard' || mainGamePrimaryIsDone ? 'btn--discard' : '',
                                  ]
                                    .filter(Boolean)
                                    .join(' ')}
                                  disabled={mainGamePrimaryDisabled}
                                  aria-disabled={mainGamePrimaryDisabled}
                                  aria-label={
                                    mainGamePrimaryIsDone
                                      ? 'Commit meld and proceed to discard'
                                      : mainGamePrimaryLabel
                                  }
                                  onClick={() => {
                                    if (mainGamePrimaryIsDone) commitStagedCall()
                                    else if (mainPhase === 'east-discard') commitEastDiscard()
                                    else if (mainPhase === 'bot-turn') skipBotDiscard()
                                  }}
                                >
                                  {mainGamePrimaryLabel}
                                </button>
                                {undoEnabled && canUndo ? (
                                  <span
                                    className="btn__undo-inset rack-bottom-tile-cell rack-bottom-tile-cell--c12-14"
                                    role="button"
                                    tabIndex={0}
                                    aria-label="Undo"
                                    onClick={() => undoAction()}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); undoAction() } }}
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <polyline points="1 4 1 10 7 10" />
                                      <path d="M6 18a9 9 0 1 0-.36-12.36L1 10" />
                                    </svg>
                                  </span>
                                ) : null}
                              </div>
                              {showReviewNewGameBelowDiscard ? (
                                <div
                                  className="rack-bottom-bar rack-bottom-bar--main rack-bottom-bar--tile-grid panel-hand-rack__review-new-game-row"
                                  role="group"
                                  aria-label={
                                    mainPhase === 'wall-game'
                                      ? 'Wall game review actions'
                                      : 'Mah Jongg review actions'
                                  }
                                >
                                  <div
                                    className="panel-hand-rack__review-new-game-spacer"
                                    aria-hidden
                                  />
                                  <button
                                    type="button"
                                    className="btn btn--rack-neutral rack-bottom-tile-cell rack-bottom-tile-cell--c12-14"
                                    onClick={() => {
                                      void newHand()
                                    }}
                                  >
                                    New Game
                                  </button>
                                </div>
                              ) : null}
                              </div>
                            ) : null}
                          </div>
                          </SortableContext>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </section>
            </div>
            {showPlaySplitRow ? (
              <div className="app-discard-bottom-container">
                <section
                  ref={discardTrackerPanelRef}
                  className="panel panel--discard-tracker panel--discard-tracker--bottom"
                  aria-label="Discard tray"
                  data-joker-swap-dnd={jokerSwapUiActive ? 'on' : 'off'}
                  data-suggested-hands-open={suggestedPanelHandsOn ? 'on' : 'off'}
                >
                  <div className="discard-tracker__shell">
                    <div className="discard-tracker__content">
                      <div className="discard-tracker__watermark" aria-hidden>
                        <RackLogoWatermark />
                      </div>
                      <div className="discard-tracker__discard-container">
                        <DiscardPileDropZone
                          swapDropActive={false}
                          onContainerNode={(node) => {
                            discardPileScrollElRef.current = node
                          }}
                        >
                          <div className="discard-pile" role="list" aria-label="Committed discards" />
                        </DiscardPileDropZone>
                      </div>
                      {renderSuggestedHandsPopup()}
                    </div>
                  </div>
                </section>
              </div>
            ) : null}
              {blankExchangeOpen ? (
                <BlankExchangeOverlay
                  discardPile={displayedDiscardPile}
                  blankTilesEnabled={blankTilesEnabled}
                  suggestedNeedDefs={suggestedDiscardTrackerNeedDefs}
                  onPick={performBlankExchange}
                  onCancel={closeBlankExchange}
                />
              ) : null}
              <DragOverlay dropAnimation={null}>
                {dragOverlayMeldTiles ? (
                  <div className="drag-overlay-meld">
                    {dragOverlayMeldTiles.map((tile) => (
                      <div
                        key={tile.id}
                        className={[
                          'drag-overlay-tile',
                          suggestedTileGuideForRack?.blankExchangeIds?.has(tile.id)
                            ? 'sortable-tile-wrap--blank-exchange-hint'
                            : suggestedTileGuideForRack?.bestIds.has(tile.id)
                              ? 'sortable-tile-wrap--suggest-best'
                              : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <TileFace
                          def={tile.def}
                          elevated
                          rackSuitStacked={dragOverlayRackSuitStacked}
                        />
                      </div>
                    ))}
                  </div>
                ) : dragOverlayTile ? (
                  <div
                    className={[
                      'drag-overlay-tile',
                      suggestedTileGuideForRack?.blankExchangeIds?.has(dragOverlayTile.id)
                        ? 'sortable-tile-wrap--blank-exchange-hint'
                        : suggestedTileGuideForRack?.bestIds.has(dragOverlayTile.id)
                          ? 'sortable-tile-wrap--suggest-best'
                          : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <TileFace
                      def={dragOverlayTile.def}
                      elevated
                      rackSuitStacked={dragOverlayRackSuitStacked}
                    />
                  </div>
                ) : null}
              </DragOverlay>
            </div>
        </div>
      </div>
    </DndContext>
    </div>
    </TileGraphicsProvider>
  )
}
