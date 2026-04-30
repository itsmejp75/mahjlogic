import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'
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
import { buildAmericanDeck, dealOpeningFour, shuffle } from './mahjong/deck'
import { tileShortLabel } from './mahjong/labels'
import type { ClaimType, DiscardEntry, EastExposure, Seat, TileDef, TileInstance } from './mahjong/types'
import { findExactMatches, sortTiles, tileDefsEqual, type SortMode } from './mahjong/tileUtils'
import { PASS_BOX_ID, passDropIndex, type PassSlots } from './mahjong/passTargets'
import {
  applyCharlestonExchange,
  charlestonAllowsBlind,
  charlestonMahjongButtonPhase,
  charlestonPassDirections,
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
import { DiscardPileFlyInTile } from './components/DiscardPileFlyInTile'
import { PRACTICE_PATTERNS } from './card/practicePatterns'
import {
  buildPinnedPatternsFromFocusKey,
  computeRackPatternHighlightIds,
  greedyPatternMatchDetail,
  isMultiComboFocusKey,
  rankSuggestedHands,
  focusKeyForSuggestedHandLine,
  sortHandForSuggestedPattern,
  sortFullRackTilesForPattern,
  suggestedHandsTiedAtBest,
  summarizeRackTowardWin,
  computeSuggestedDiscardNeedHighlightIds,
  type RankSuggestedHandsInput,
} from './analysis/suggestedHands'
import { tileInstancesWithClaimMeldJokersResolved } from './analysis/eastExposurePatternFit'
import { PostGameLoserRackRow } from './components/PostGameLoserRackRow'
import { IllegalMahjongDialog } from './components/IllegalMahjongDialog'
import { CardColoredText } from './components/CardColoredText'
import { SuggestedHandsPanel } from './components/SuggestedHandsPanel'
import type { BotExposure, BotSeat } from './analysis/types'
import {
  BOT_DIFFICULTIES,
  type BotDifficulty,
  chooseBotCharlestonPass,
  chooseBotDiscard,
  botCallStrategicProbability,
  DEFAULT_BOT_DIFFICULTY,
  isBotDifficulty,
  type BotRankContext,
} from './analysis/botAI'
import {
  getCallInitiateBlockMessage,
  getCallCapacityFlags,
  BLOCKING_TITLE_SWAP_ERROR,
  hasLegalMahjongOnBotDiscard,
  MSG_CALL_DEAD_JOKER,
  MSG_CALL_INSUFFICIENT_TILES,
  MSG_MAHJONG_DURING_CHARLESTON,
  MSG_SWAP_NO_EXPOSED_JOKERS,
  MSG_SWAP_NO_LEGAL_FOR_TILE,
  MSG_SWAP_PICK_TILE_FIRST,
  type CallValidationRoundSlice,
} from './mahjong/callValidation'
import {
  CALL_INITIATE_FIRST_SLOT_ID,
  EAST_DISCARD_STAGING_ID,
  JOKER_SWAP_STAGING_ID,
} from './mahjong/jokerSwapIds'
import {
  botExposureSwapDropId,
  botSeatSwapDropId,
  eastExposureSwapDropId,
  EAST_SEAT_SWAP_ID,
  findJokerSwapTargetAtEastExposure,
  findJokerSwapTargetAtExposure,
  findJokerSwapTargetAtSeat,
  findJokerSwapTargetInEastRack,
  findNextJokerSwapTarget,
  collectHandTileIdsSwappableForJokers,
  collectSwappableJokerTileIds,
  parseBotSeatSwapDropId,
  parseBotExposureSwapDropId,
  parseEastExposureSwapDropId,
  type JokerSwapTargetPick,
} from './mahjong/jokerSwapTarget'
import {
  openClaimMeldsFitSomePracticeLine,
  reorderEastExposuresToPatternGroupOrder,
} from './analysis/eastExposurePatternFit'
import './styles/style.css'

/** Tiles in wall after opening deal (`dealOpeningFour`); meter stays flat green until below this. */
const OPENING_WALL_TILES = 99

function wallRemainHeatStyle(wallLen: number): CSSProperties | undefined {
  if (wallLen >= OPENING_WALL_TILES || wallLen === 0) return undefined
  return {
    '--wall-t': String(Math.max(0, Math.min(1, wallLen / (OPENING_WALL_TILES - 1)))),
  } as CSSProperties
}

const BOT_DIFFICULTY_LABEL: Record<BotDifficulty, string> = {
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
  unfair: 'Unfair',
}

const SUGGESTED_HANDS_REMEMBER_SIZE_LABEL = 'Remember hands window size'

const LS_KEY_BOT_WINS = 'mahjlogic.botWinsEnabled'

const BOT_WINS_LABEL = 'Bot wins'
const LS_KEY_ANIMATIONS = 'mahjlogic.animationsEnabled'
/** When false, rack / table action buttons use neutral gray (like Sort) instead of teal, purple, etc. */
const LS_KEY_COLOR_BUTTONS = 'mahjlogic.colorButtonsEnabled'
const COLOR_BUTTONS_LABEL = 'Color buttons'
/** When true, height/width of Suggested hands panel are saved when closed and restored on next open. */
const LS_KEY_SUGGESTED_HANDS_REMEMBER_SIZE = 'mahjlogic.suggestedHandsRememberSize'
const LS_KEY_SUGGESTED_HANDS_PANEL_HEIGHT = 'mahjlogic.suggestedHandsPanelHeight'
const LS_KEY_SUGGESTED_HANDS_RIGHT_DELTA = 'mahjlogic.suggestedHandsRightDelta'
const LS_KEY_SUGGESTED_HANDS_LEFT_DELTA = 'mahjlogic.suggestedHandsLeftDelta'
const LS_KEY_SUGGESTED_HANDS_OFFSET_X = 'mahjlogic.suggestedHandsOffsetX'
const LS_KEY_SUGGESTED_HANDS_OFFSET_Y = 'mahjlogic.suggestedHandsOffsetY'
/** @deprecated Migrated to LS_KEY_SUGGESTED_HANDS_REMEMBER_SIZE; removed on read */
const LS_KEY_SUGGESTED_HANDS_RESIZE_LOCK_LEGACY = 'mahjlogic.suggestedHandsResizeLock'
const LS_KEY_BOT_DIFFICULTY = 'mahjlogic.botDifficulty'
/**
 * Tile face style (`TILE_GRAPHICS` / `data-tile-graphics`). Product default is Prism (`solid-color`).
 * Today: persisted in localStorage only. When accounts exist, the player’s choice should live in
 * their server-side settings (and can sync down to replace or seed this key on login).
 */
const LS_KEY_TILE_GRAPHICS = 'mahjlogic.tileGraphics'
/** One-time migration: users who had Classic as the old default are moved to Prism. */
const LS_KEY_TILE_GRAPHICS_DEFAULT_MIGRATED = 'mahjlogic.tileGraphicsDefaultMigrated'
const LS_KEY_JOKER_SWAP_HINT = 'mahjlogic.jokerSwapHintEnabled'
/** Former “Joker Flash” preference; read once to seed `LS_KEY_JOKER_SWAP_HINT` if missing. */
const LS_KEY_JOKER_FLASH_LEGACY = 'mahjlogic.jokerFlashEnabled'
const JOKER_SWAP_HINT_LABEL = 'Joker swap hint'
const JOKER_SWAP_HINT_BOUNCE_DELAY_MS = 500
const JOKER_SWAP_HINT_BOUNCE_DURATION_MS = 1700
/** The keyframe has returned to translateY(0) at 52%; the rest of the iteration is idle. */
const JOKER_SWAP_HINT_BOUNCE_VISIBLE_MS = JOKER_SWAP_HINT_BOUNCE_DURATION_MS * 0.52

/** Menu order: Prism first; Ivory (classic) last in the minimalist row. */
const TILE_GRAPHICS = ['solid-color', 'dark', 'light', 'designer', 'bakelite', 'classic'] as const
type TileGraphics = (typeof TILE_GRAPHICS)[number]

const TILE_GRAPHICS_LABEL: Record<TileGraphics, string> = {
  classic: 'Ivory',
  'solid-color': 'Prism',
  dark: 'Obsidian',
  light: 'Sorbet',
  designer: 'Jewel',
  bakelite: 'Autumn',
}

const TILE_GRAPHICS_CATEGORY_MINIMALIST_ID = 'tile-graphics-category-minimalist'
const TILE_GRAPHICS_CATEGORY_ILLUSTRATIVE_ID = 'tile-graphics-category-illustrative'

/** Invisible 10-up grid cells so the Illustrative strip matches the Minimalist preview height before real tiles exist. */
const ILLUSTRATIVE_PREVIEW_PLACEHOLDERS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const

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

function isTileGraphics(s: string): s is TileGraphics {
  return (TILE_GRAPHICS as readonly string[]).includes(s)
}

function readTileGraphicsFromStorage(): TileGraphics {
  try {
    const v = localStorage.getItem(LS_KEY_TILE_GRAPHICS)
    // Default for new players / missing key is Prism (`solid-color`). Older sessions may still
    // have Classic saved from when this menu first landed (see migration below). With login,
    // prefer the value from the user’s account settings when available.
    if (v === 'classic' && localStorage.getItem(LS_KEY_TILE_GRAPHICS_DEFAULT_MIGRATED) !== 'true') {
      localStorage.setItem(LS_KEY_TILE_GRAPHICS, 'solid-color')
      localStorage.setItem(LS_KEY_TILE_GRAPHICS_DEFAULT_MIGRATED, 'true')
      return 'solid-color'
    }
    if (v != null && isTileGraphics(v)) return v
  } catch {
    /* ignore */
  }
  return 'solid-color'
}

function readBotWinsEnabledFromStorage(): boolean {
  try {
    const v = localStorage.getItem(LS_KEY_BOT_WINS)
    return v === 'true' || v === '1'
  } catch {
    return false
  }
}

function readAnimationsEnabledFromStorage(): boolean {
  try {
    const v = localStorage.getItem(LS_KEY_ANIMATIONS)
    if (v === null) return true
    return v === 'true' || v === '1'
  } catch {
    return true
  }
}

function readColorButtonsFromStorage(): boolean {
  try {
    const v = localStorage.getItem(LS_KEY_COLOR_BUTTONS)
    if (v === null) return true
    return v === 'true' || v === '1'
  } catch {
    return true
  }
}

function readSuggestedHandsRememberSizeFromStorage(): boolean {
  try {
    const v = localStorage.getItem(LS_KEY_SUGGESTED_HANDS_REMEMBER_SIZE)
    if (v !== null) {
      return v === 'true' || v === '1'
    }
    try {
      localStorage.removeItem(LS_KEY_SUGGESTED_HANDS_RESIZE_LOCK_LEGACY)
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore */
  }
  return false
}

function readSuggestedPanelHeightFromStorage(): number | null {
  try {
    const v = localStorage.getItem(LS_KEY_SUGGESTED_HANDS_PANEL_HEIGHT)
    if (v == null) return null
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

function readSuggestedPanelRightDeltaFromStorage(): number | null {
  try {
    const v = localStorage.getItem(LS_KEY_SUGGESTED_HANDS_RIGHT_DELTA)
    if (v == null) return null
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

function readSuggestedPanelLeftDeltaFromStorage(): number | null {
  try {
    const v = localStorage.getItem(LS_KEY_SUGGESTED_HANDS_LEFT_DELTA)
    if (v == null) return null
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

/** Drag nudge (px) — stored when “Remember hands window size” is on. */
function readSuggestedPanelPositionOffsetFromStorage(): { x: number; y: number } | null {
  try {
    const xs = localStorage.getItem(LS_KEY_SUGGESTED_HANDS_OFFSET_X)
    const ys = localStorage.getItem(LS_KEY_SUGGESTED_HANDS_OFFSET_Y)
    if (xs == null && ys == null) return null
    const x = xs != null ? parseFloat(xs) : 0
    const y = ys != null ? parseFloat(ys) : 0
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    return { x, y }
  } catch {
    return null
  }
}

function readBotDifficultyFromStorage(): BotDifficulty {
  try {
    const v = localStorage.getItem(LS_KEY_BOT_DIFFICULTY)
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
  | { variant: 'mahjong-dead-warning'; rankInput: RankSuggestedHandsInput }
  | { variant: 'call-exposure-dead-warning'; rankInput: RankSuggestedHandsInput }
  | { variant: 'discard-dead-warning'; rankInput: RankSuggestedHandsInput }

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

/**
 * First empty exposure cell while a bot discard is live — within 3 tile-widths the shell
 * appears; drop a hand tile here to run the same path as the Call button.
 */
function CallInitiateFirstEmptyTarget({
  proximityActive,
  boxRef,
}: {
  proximityActive: boolean
  boxRef: RefObject<HTMLDivElement | null>
}) {
  const { setNodeRef, isOver } = useDroppable({ id: CALL_INITIATE_FIRST_SLOT_ID })
  const setRefs = (node: HTMLDivElement | null) => {
    setNodeRef(node)
    boxRef.current = node
  }
  return (
    <div
      ref={setRefs}
      role="listitem"
      aria-label="Call — drop a hand tile here to start a claim, same as the Call button"
      className={[
        'exposure-rack__slot',
        'exposure-rack__slot--empty',
        'exposure-rack__call-initiate-target',
        proximityActive ? 'exposure-rack__call-initiate-target--near' : '',
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
  children,
}: {
  seat: 'South' | 'West' | 'North'
  active: boolean
  children: ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: botSeatSwapDropId(seat),
    disabled: !active,
  })
  return (
    <li
      ref={setNodeRef}
      className={[
        'app-opponents-rail__cell',
        active ? 'app-opponents-rail__cell--swap-drop' : '',
        isOver ? 'app-opponents-rail__cell--swap-over' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="bot-exposure-row__watermark" aria-hidden="true">{seat}</span>
      {children}
    </li>
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
  jokerSwapHintBounce = false,
  jokerSwapHintBounceEpoch = 0,
  onTileClickReturn,
}: {
  tile: TileInstance
  suggestBest?: boolean
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
    transform: CSS.Transform.toString(transform),
    transition:
      isDragging
        ? 'none'
        : active
          ? 'transform 0.14s cubic-bezier(0.2, 0, 0.2, 1)'
          : 'none',
    opacity: isDragging ? 0 : undefined,
    touchAction: 'none',
  }
  return (
    <div
      ref={setNodeRef}
      style={dragStyle}
      className={[
        'east-discard-staging__tile',
        suggestBest ? 'east-discard-staging__tile--suggest-best' : '',
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
}

type RoundState = {
  hand: TileInstance[]
  bots: [TileInstance[], TileInstance[], TileInstance[]]
  wall: TileInstance[]
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
  /** Non-null when a bot won by self-draw. Drives the bot-mahjong end screen. */
  botWin: { botIndex: 0 | 1 | 2 } | null
  /** How the player won Mah Jongg (set when mainPhase becomes 'mahjong-declared'). */
  playerWinMethod: { type: 'self-draw' } | { type: 'called-discard'; botLabel: string } | null
}

function createNewRound(): RoundState {
  const deck = shuffle(buildAmericanDeck())
  const { east, south, west, north, wall } = dealOpeningFour(deck)
  return {
    hand: east,
    bots: [south, west, north],
    wall,
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
    stagedCallTileIds: [],
    callAmendableAfterClaimTileId: null,
    callAmendFromBotIndex: null,
    botWin: null,
    playerWinMethod: null,
  }
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
// Visual rail order (left→right) to match table seating around East.
const BOT_RAIL_LABELS = ['South', 'West', 'North'] as const
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
}

/**
 * Before discarding, a bot greedily claims any joker it can redeem by placing a
 * matching natural into an exposed meld (East's or any other bot's).
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
    return { botHand, wall, discardPile, discarded: null, eastExposuresOut: eastExposures, botExposuresOut: botExposures, botMahjong: false }
  }
  const [drawn, ...wallNext] = wall
  const handWithDraw = [...botHand, drawn]
  // Redeem any jokers available in exposed melds before deciding what to discard
  const swapped = performBotPreDiscardSwaps(handWithDraw, eastExposures, botExposures, botDifficulty)
  const handAfterSwaps = swapped.hand
  const nonJokers = handAfterSwaps.filter((t) => t.def.cat !== 'joker')
  const jokers = handAfterSwaps.filter((t) => t.def.cat === 'joker')

  // ── Self-draw Mah Jongg check ───────────────────────────────────────────────
  const botSeatLabel = (seat.charAt(0).toUpperCase() + seat.slice(1)) as typeof BOT_LABELS[number]
  const thisBotExposures = swapped.botExposures.filter((e) => e.seat === botSeatLabel)
  const mjRankInput: RankSuggestedHandsInput = {
    hand: handAfterSwaps,
    wallRemaining: wallNext.length,
    discards: discardPile.map((e) => e.tile),
    exposures: swapped.botExposures,
    playerClaimMelds: thisBotExposures,
    eastTableClaimMelds: swapped.eastExposures,
  }
  if (summarizeRackTowardWin(mjRankInput).bestTilesAway === 0) {
    if (botWinsEnabled) {
      return {
        botHand: handAfterSwaps,
        wall: wallNext,
        discardPile,
        discarded: null,
        eastExposuresOut: swapped.eastExposures,
        botExposuresOut: swapped.botExposures,
        botMahjong: true,
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
    const botSeat = (seat.charAt(0).toUpperCase() + seat.slice(1)) as BotSeat
    const ctx: BotRankContext = {
      hand: handAfterSwaps,
      botSeat,
      wall: wallNext,
      discardPile,
      eastExposures: swapped.eastExposures,
      botExposures: swapped.botExposures,
    }
    pick = chooseBotDiscard(ctx, botDifficulty)
  }
  const handNext = handAfterSwaps.filter((t) => t.id !== pick.id)
  return {
    botHand: handNext,
    wall: wallNext,
    discardPile: [...discardPile, { tile: pick, seat }],
    discarded: pick,
    eastExposuresOut: swapped.eastExposures,
    botExposuresOut: swapped.botExposures,
    botMahjong: false,
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
 * One bot's random willingness to claim a discard (quint / kong / pung).
 * Jokers in the bot's hand count toward quint/kong/pung totals.
 */
/**
 * Check if a bot can form a meld from `discard` + their hand tiles.
 * `strategicProb` (0–1) scales all call thresholds: bots are far more likely
 * to call tiles that advance their best hand than tiles that don't.
 *
 * NMJL: you may only open with pung (3+ tiles) / kong / quint — not a pair from the discard.
 * So we require ≥2 tiles from hand (naturals + jokers) plus the called tile. Flowers follow
 * the same rule: jokers may fill the meld as long as the exposure is 3+ tiles total.
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
    const rep = exp?.tiles.find((t) => t.def.cat !== 'joker')
    return rep?.def ?? null
  }
  const exp = r.eastExposures[parsed.exposureIdx]
  const rep = exp?.tiles.find((t) => t.def.cat !== 'joker')
  return rep?.def ?? null
}

/**
 * East trades a natural from their hand for an exposed joker (on any rack). The natural
 * replaces the joker in the meld; East receives the joker.
 */
function applyEastNaturalForExposedJoker(
  r: RoundState,
  p: { rack: 'bot' | 'east'; exposureIdx: number; jokerTileId: string; eastTileId: string },
): RoundState {
  if (
    r.mainPhase !== 'east-discard' &&
    r.mainPhase !== 'bot-turn' &&
    r.mainPhase !== 'call-staging'
  )
    return r
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
    selectedHandTileId: null,
  })
}

const MAX_BOT_JOKER_SWAP_PASSES = 24

/**
 * Other seats (bots) may redeem a joker in East’s or a bot’s exposure only on **a bot’s turn** —
 * not on East’s turn (`east-discard`, including immediately after a call is committed) and
 * not during `call-staging` while East is building a claim. East’s own joker redemptions use
 * {@link applyEastNaturalForExposedJoker} and do not run this pass.
 * Repeated until no more swaps, then the returned state is unchanged.
 */
function applyBotsJokerSwapsFromEast(r: RoundState): RoundState {
  if (r.mainPhase !== 'bot-turn') return r
  let cur = r
  for (let pass = 0; pass < MAX_BOT_JOKER_SWAP_PASSES; pass++) {
    let swapped = false
    // Bots swapping naturals into East's exposures
    outer: for (let ei = 0; ei < cur.eastExposures.length; ei++) {
      const meld = cur.eastExposures[ei]!
      const rep = meld.tiles.find((t) => t.def.cat !== 'joker')
      if (!rep) continue
      for (const jo of meld.tiles) {
        if (jo.def.cat !== 'joker') continue
        for (let bi = 0; bi < 3; bi++) {
          const bh = cur.bots[bi]!
          const ti = bh.findIndex((t) => t.def.cat !== 'joker' && tileDefsEqual(t.def, rep.def))
          if (ti < 0) continue
          const natural = bh[ti]!
          const newBotHand = [...bh.slice(0, ti), jo, ...bh.slice(ti + 1)]
          const newEastExposures = cur.eastExposures.map((exp, idx) =>
            idx !== ei
              ? exp
              : { ...exp, tiles: exp.tiles.map((t) => (t.id === jo.id ? natural : t)) },
          )
          const botsNext: [TileInstance[], TileInstance[], TileInstance[]] = [
            bi === 0 ? newBotHand : [...cur.bots[0]],
            bi === 1 ? newBotHand : [...cur.bots[1]],
            bi === 2 ? newBotHand : [...cur.bots[2]],
          ]
          cur = { ...cur, bots: botsNext, eastExposures: newEastExposures }
          swapped = true
          break outer
        }
      }
    }
    if (swapped) continue
    // Bots swapping naturals into other bots' exposures
    outer2: for (let ei = 0; ei < cur.botExposures.length; ei++) {
      const meld = cur.botExposures[ei]!
      const rep = meld.tiles.find((t) => t.def.cat !== 'joker')
      if (!rep) continue
      for (const jo of meld.tiles) {
        if (jo.def.cat !== 'joker') continue
        for (let bi = 0; bi < 3; bi++) {
          const bh = cur.bots[bi]!
          const ti = bh.findIndex((t) => t.def.cat !== 'joker' && tileDefsEqual(t.def, rep.def))
          if (ti < 0) continue
          const natural = bh[ti]!
          const newBotHand = [...bh.slice(0, ti), jo, ...bh.slice(ti + 1)]
          const newBotExposures = cur.botExposures.map((exp, idx) =>
            idx !== ei
              ? exp
              : { ...exp, tiles: exp.tiles.map((t) => (t.id === jo.id ? natural : t)) },
          )
          const botsNext: [TileInstance[], TileInstance[], TileInstance[]] = [
            bi === 0 ? newBotHand : [...cur.bots[0]],
            bi === 1 ? newBotHand : [...cur.bots[1]],
            bi === 2 ? newBotHand : [...cur.bots[2]],
          ]
          cur = { ...cur, bots: botsNext, botExposures: newBotExposures }
          swapped = true
          break outer2
        }
      }
    }
    if (!swapped) break
  }
  return cur
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
      botWin: { botIndex: mjBot },
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
    const postCallSwap = performBotPreDiscardSwaps(
      botsNext[botIndex],
      r.eastExposures,
      allBotExposuresWithNew,
      botDifficulty,
    )
    botsNext[botIndex] = postCallSwap.hand
    const eastExposuresAfterCallSwap = postCallSwap.eastExposures
    const botExposuresAfterCallSwap = postCallSwap.botExposures

    const afterCallCtx = buildBotContext(
      r,
      botsNext[botIndex]!,
      botIndex,
      { east: eastExposuresAfterCallSwap, bot: botExposuresAfterCallSwap },
    )
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
      ...r.discardPile,
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
      botWin: { botIndex: 0 },
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
      botWin: { botIndex: mjCaller },
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
    const postCallSwapSkip = performBotPreDiscardSwaps(
      botsNext[callerIdx]!,
      r.eastExposures,
      allBotExposuresSkip,
      botDifficulty,
    )
    botsNext[callerIdx] = postCallSwapSkip.hand
    const eastExposuresAfterSkipSwap = postCallSwapSkip.eastExposures
    const botExposuresAfterSkipSwap = postCallSwapSkip.botExposures

    const afterSkipCtx = buildBotContext(
      r,
      botsNext[callerIdx]!,
      callerIdx,
      { east: eastExposuresAfterSkipSwap, bot: botExposuresAfterSkipSwap },
    )
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
        discardPile: pileWithoutClaimed,
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
      ...pileWithoutClaimed,
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
      botWin: { botIndex: nextBotIndex as 0 | 1 | 2 },
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
  if (r.stagedCallTileIds.length >= 4) return r
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
  })
  if (!closestLine) return nextEast
  const pat = PRACTICE_PATTERNS.find((p) => p.id === closestLine.id)
  if (!pat) return nextEast
  const reordered = reorderEastExposuresToPatternGroupOrder(nextEast, pat)
  if (!reordered) return nextEast
  return reordered as EastExposure[]
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
  if (stagedTiles.length > 4) return null
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
    const eastMelds = [...r.eastExposures, exposure]
    return summarizeRackTowardWin({
      hand: handNext,
      wallRemaining: r.wall.length,
      discards: pileNext.map((e) => e.tile),
      exposures: r.botExposures,
      playerClaimMelds: eastMelds,
      eastTableClaimMelds: eastMelds,
    }).bestTilesAway
  }
  if (stagedTiles.length < 2) return null
  const meldIsValid = stagedTiles.every(
    (t) => t.def.cat === 'joker' || tileDefsEqual(t.def, calledTile.def),
  )
  if (!meldIsValid) return null
  const claimType: ClaimType =
    stagedTiles.length === 2 ? 'pung' : stagedTiles.length === 3 ? 'kong' : 'quint'
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
  return summarizeRackTowardWin({
    hand: handNext,
    wallRemaining: r.wall.length,
    discards: pileNext.map((e) => e.tile),
    exposures: r.botExposures,
    playerClaimMelds: nextEast,
    eastTableClaimMelds: nextEast,
  }).bestTilesAway
}

function previewAutoSelectedCallRankInput(
  r: RoundState,
  needed: number,
): RankSuggestedHandsInput | null {
  if (r.mainPhase !== 'bot-turn' || !r.activeBotDiscard) return null
  if (needed < 2 || needed > 4) return null
  const calledTile = r.activeBotDiscard
  const naturals = findExactMatches(r.hand, calledTile.def)
  const jokers = r.hand.filter((t) => t.def.cat === 'joker')
  const stagedTiles = [...naturals, ...jokers].slice(0, needed)
  if (stagedTiles.length < needed) return null

  const stagedIds = new Set(stagedTiles.map((t) => t.id))
  const handNext = r.hand.filter((t) => !stagedIds.has(t.id))
  const pileNext = r.discardPile.filter((e) => e.tile.id !== calledTile.id)
  const claimType: ClaimType =
    needed === 2 ? 'pung' : needed === 3 ? 'kong' : 'quint'
  const exposure: EastExposure = {
    tiles: [calledTile, ...stagedTiles],
    claimType,
    calledTileId: calledTile.id,
  }
  const eastMelds = orderEastExposuresForClosestCardLine(r, handNext, pileNext, [
    ...r.eastExposures,
    exposure,
  ])

  return {
    hand: handNext,
    wallRemaining: r.wall.length,
    discards: pileNext.map((e) => e.tile),
    exposures: r.botExposures,
    playerClaimMelds: eastMelds,
    eastTableClaimMelds: eastMelds,
  }
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
      return { ...r, mainPhase: 'dead-hand' }
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
    const botLabel = r.activeBotIndex != null ? (BOT_LABELS[r.activeBotIndex] ?? 'Bot') : 'Bot'
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
      playerWinMethod: { type: 'called-discard', botLabel },
    })
  }

  if (stagedTiles.length < 2 || stagedTiles.length > 4) return r
  // Every staged hand tile must exactly match the called tile's def or be a joker. In competition
  // mode an invalid meld kills the hand immediately; training mode commits anyway so the player
  // sees a warning when they try to discard.
  const meldIsValid = stagedTiles.every(
    (t) => t.def.cat === 'joker' || tileDefsEqual(t.def, calledTile.def),
  )
  if (!meldIsValid && gameMode !== 'training') {
    return { ...r, mainPhase: 'dead-hand' }
  }
  const claimType: ClaimType =
    stagedTiles.length === 2 ? 'pung' : stagedTiles.length === 3 ? 'kong' : 'quint'
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
    const botLabel = r.activeBotIndex != null ? (BOT_LABELS[r.activeBotIndex] ?? 'Bot') : 'Bot'
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
      playerWinMethod: { type: 'called-discard', botLabel },
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
  const botLabel = r.activeBotIndex != null ? (BOT_LABELS[r.activeBotIndex] ?? 'Bot') : 'Bot'
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
    playerWinMethod: { type: 'called-discard', botLabel },
    handTileFlyIn: { ids: [calledTile.id], from: flyFrom },
  }
}

/** Self-draw Mah Jongg: player declares on their own drawn tile (east-discard phase). */
function applyDeclareMahjongSelfDraw(r: RoundState): RoundState {
  if (r.mainPhase !== 'east-discard') return r
  return {
    ...r,
    playerWinMethod: { type: 'self-draw' },
    mainPhase: 'mahjong-declared',
    drawnTileId: null,
    selectedHandTileId: null,
    pendingEastDiscardTile: null,
  }
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
  return (
    <button
      type="button"
      className="btn app-menu-tray__item app-menu-tray__item--toggle app-menu-tray__item--switch app-menu-modal__toggle"
      aria-labelledby={labelId}
      aria-pressed={pressed}
      onClick={onToggle}
    >
      <span className="app-menu-sr-only">{pressed ? 'On' : 'Off'}</span>
      <span
        className={['app-menu-tray__toggle-slider', pressed ? 'app-menu-tray__toggle-slider--on' : '']
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
  const [round, setRound] = useState<RoundState>(() => createNewRound())
  const [suggestedFocusHandKey, setSuggestedFocusHandKey] = useState<string | null>(null)
  const [suggestedPanelHandsOn, setSuggestedPanelHandsOn] = useState(false)
  const [suggestedCategoryResetEpoch, setSuggestedCategoryResetEpoch] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuContainerRef = useRef<HTMLDivElement>(null)
  const botExposuresToolbarWellRef = useRef<HTMLDivElement>(null)
  const [suggestedHandsListOn, setSuggestedHandsListOn] = useState(true)
  const [wallGameReviewing, setWallGameReviewing] = useState(false)
  const [mahjongWinReviewing, setMahjongWinReviewing] = useState(false)
  const [botMahjongWinReviewing, setBotMahjongWinReviewing] = useState(false)
  const [suggestedPanelTilesOn, setSuggestedPanelTilesOn] = useState(false)
  const [filterBtnPortalEl, setFilterBtnPortalEl] = useState<HTMLDivElement | null>(null)
  const setFilterButtonPortalRef = useCallback((el: HTMLDivElement | null) => {
    setFilterBtnPortalEl((prev) => (prev === el ? prev : el))
  }, [])

  // ── Game options (persisted) ──────────────────────────────────────────────
  const [botWinsEnabled, setBotWinsEnabled] = useState<boolean>(() => readBotWinsEnabledFromStorage())
  const [animationsEnabled, setAnimationsEnabled] = useState<boolean>(() => readAnimationsEnabledFromStorage())
  const [colorButtonsEnabled, setColorButtonsEnabled] = useState<boolean>(() => readColorButtonsFromStorage())
  const [suggestedHandsRememberSize, setSuggestedHandsRememberSize] = useState<boolean>(() =>
    readSuggestedHandsRememberSizeFromStorage(),
  )
  const suggestedHandsRememberSizeRef = useRef(suggestedHandsRememberSize)
  suggestedHandsRememberSizeRef.current = suggestedHandsRememberSize
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>(() => readBotDifficultyFromStorage())
  const botDifficultyRef = useRef(botDifficulty)
  botDifficultyRef.current = botDifficulty
  const [tileGraphics, setTileGraphics] = useState<TileGraphics>(() => readTileGraphicsFromStorage())
  const [jokerSwapHintEnabled, setJokerSwapHintEnabled] = useState<boolean>(() => readJokerSwapHintFromStorage())
  const setTileGraphicsMode = useCallback((g: TileGraphics) => {
    setTileGraphics(g)
    try {
      localStorage.setItem(LS_KEY_TILE_GRAPHICS, g)
      localStorage.setItem(LS_KEY_TILE_GRAPHICS_DEFAULT_MIGRATED, 'true')
    } catch {
      /* ignore */
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

  const toggleColorButtons = useCallback(() => {
    setColorButtonsEnabled((v) => {
      const next = !v
      try {
        localStorage.setItem(LS_KEY_COLOR_BUTTONS, next ? 'true' : 'false')
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const toggleSuggestedHandsRememberSize = useCallback(() => {
    setSuggestedHandsRememberSize((v) => {
      const next = !v
      try {
        localStorage.setItem(LS_KEY_SUGGESTED_HANDS_REMEMBER_SIZE, next ? 'true' : 'false')
        if (!next) {
          localStorage.removeItem(LS_KEY_SUGGESTED_HANDS_PANEL_HEIGHT)
          localStorage.removeItem(LS_KEY_SUGGESTED_HANDS_RIGHT_DELTA)
          localStorage.removeItem(LS_KEY_SUGGESTED_HANDS_LEFT_DELTA)
          localStorage.removeItem(LS_KEY_SUGGESTED_HANDS_OFFSET_X)
          localStorage.removeItem(LS_KEY_SUGGESTED_HANDS_OFFSET_Y)
        }
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

  // Keep a ref so pure-function callbacks always see the current setting value.
  const botWinsEnabledRef = useRef(botWinsEnabled)
  useEffect(() => {
    botWinsEnabledRef.current = botWinsEnabled
  }, [botWinsEnabled])

  const animationsEnabledRef = useRef(animationsEnabled)
  useEffect(() => {
    animationsEnabledRef.current = animationsEnabled
  }, [animationsEnabled])

  /** Re-read on mount: guarantees UI matches `localStorage` after refresh. */
  useEffect(() => {
    const w = readBotWinsEnabledFromStorage()
    setBotWinsEnabled((prev) => (prev === w ? prev : w))
    botWinsEnabledRef.current = w
    setAnimationsEnabled((prev) => {
      const a = readAnimationsEnabledFromStorage()
      return prev === a ? prev : a
    })
    setColorButtonsEnabled((prev) => {
      const c = readColorButtonsFromStorage()
      return prev === c ? prev : c
    })
    setSuggestedHandsRememberSize((prev) => {
      const s = readSuggestedHandsRememberSizeFromStorage()
      return prev === s ? prev : s
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
  }, [])

  /** If another tab changes a preference, stay in sync. */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.storageArea !== localStorage) return
      if (e.key === LS_KEY_BOT_WINS) {
        if (e.newValue == null) return
        const on = e.newValue === 'true' || e.newValue === '1'
        setBotWinsEnabled(on)
        botWinsEnabledRef.current = on
      } else if (e.key === LS_KEY_ANIMATIONS) {
        if (e.newValue == null) return
        const on = e.newValue === 'true' || e.newValue === '1'
        setAnimationsEnabled(on)
        animationsEnabledRef.current = on
      } else if (e.key === LS_KEY_COLOR_BUTTONS) {
        if (e.newValue == null) return
        setColorButtonsEnabled(e.newValue === 'true' || e.newValue === '1')
      } else if (e.key === LS_KEY_SUGGESTED_HANDS_REMEMBER_SIZE) {
        if (e.newValue == null) return
        setSuggestedHandsRememberSize(e.newValue === 'true' || e.newValue === '1')
      } else if (e.key === LS_KEY_BOT_DIFFICULTY) {
        if (e.newValue == null) return
        if (isBotDifficulty(e.newValue)) setBotDifficulty(e.newValue)
      } else if (e.key === LS_KEY_TILE_GRAPHICS) {
        if (e.newValue == null) return
        if (isTileGraphics(e.newValue)) setTileGraphics(e.newValue)
      } else if (e.key === LS_KEY_JOKER_SWAP_HINT) {
        if (e.newValue == null) return
        setJokerSwapHintEnabled(e.newValue === 'true' || e.newValue === '1')
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Discard bottom edge + optional top from the rack action wells (so the tray can extend upward).
  const discardTrackerPanelRef = useRef<HTMLElement>(null)
  const suggestedPopupTopAnchorCharlestonRef = useRef<HTMLDivElement | null>(null)
  const suggestedPopupTopAnchorMainRef = useRef<HTMLDivElement | null>(null)
  const [suggestedPopupTop, setSuggestedPopupTop] = useState<number | null>(null)
  const [suggestedPopupBottom, setSuggestedPopupBottom] = useState<number | null>(null)
  const [suggestedPopupRight, setSuggestedPopupRight] = useState<number | null>(null)
  const [suggestedPanelHeight, setSuggestedPanelHeight] = useState<number | null>(null)
  /** Pixels added to the measured `right` (larger = narrower; smaller = wider). Cleared on panel close. */
  const [suggestedPanelRightDelta, setSuggestedPanelRightDelta] = useState<number | null>(null)
  /** Pixels added to `var(--app-h-pad)` on the left — drag the left edge or top-left / bottom-left corners. Cleared on close. */
  const [suggestedPanelLeftDelta, setSuggestedPanelLeftDelta] = useState(0)
  const suggestedPanelLeftDeltaRef = useRef(0)
  suggestedPanelLeftDeltaRef.current = suggestedPanelLeftDelta
  /**
   * User drag of the Suggested hands header: translate the fixed panel. Cleared when the panel
   * closes. Does not use the same persistence as width/height.
   */
  const [suggestedPanelPositionOffset, setSuggestedPanelPositionOffset] = useState<{
    x: number
    y: number
  }>({ x: 0, y: 0 })
  const suggestedPanelPositionOffsetRef = useRef(suggestedPanelPositionOffset)
  suggestedPanelPositionOffsetRef.current = suggestedPanelPositionOffset
  const suggestedPopupRef = useRef<HTMLDivElement>(null)
  const suggestedPopupRightRef = useRef<number | null>(null)
  suggestedPopupRightRef.current = suggestedPopupRight
  /** Top-edge resize (height) vs header drag (move) — do not use one ref for both behaviors. */
  const suggestedPanelDragRef = useRef<
    | {
        kind: 'resizeHeight'
        /** Top: drag the top border (grow upward). Bottom: drag the bottom border. */
        edge: 'top' | 'bottom'
        startY: number
        startHeight: number
        moved: boolean
      }
    | {
        kind: 'move'
        startPointerX: number
        startPointerY: number
        startOffsetX: number
        startOffsetY: number
        startRect: DOMRect
      }
    | null
  >(null)
  const rightEdgeDragRef = useRef<{
    startX: number
    startRightCss: number
    leftBound: number
    moved: boolean
  } | null>(null)
  const leftEdgeDragRef = useRef<{
    startX: number
    startLeftDelta: number
    startRect: DOMRect
    moved: boolean
  } | null>(null)
  /** One of four corners: combined horizontal + vertical resize. */
  const cornerResizeRef = useRef<{
    which: 'tr' | 'tl' | 'br' | 'bl'
    startX: number
    startY: number
    startHeight: number
    startRightCss: number
    startLeftDelta: number
    startRect: DOMRect
    leftBound: number
    moved: boolean
  } | null>(null)

  const onDragHandlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    const popup = suggestedPopupRef.current
    if (!popup) return
    const r = popup.getBoundingClientRect()
    const o = suggestedPanelPositionOffsetRef.current
    suggestedPanelDragRef.current = {
      kind: 'move',
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      startOffsetX: o.x,
      startOffsetY: o.y,
      startRect: r,
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const onTopEdgePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const popup = suggestedPopupRef.current
    if (!popup) return
    const shellH =
      popup.parentElement?.getBoundingClientRect().height ?? popup.getBoundingClientRect().height
    suggestedPanelDragRef.current = {
      kind: 'resizeHeight',
      edge: 'top',
      startY: e.clientY,
      startHeight: shellH,
      moved: false,
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const onBottomEdgePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const popup = suggestedPopupRef.current
    if (!popup) return
    const shellH =
      popup.parentElement?.getBoundingClientRect().height ?? popup.getBoundingClientRect().height
    suggestedPanelDragRef.current = {
      kind: 'resizeHeight',
      edge: 'bottom',
      startY: e.clientY,
      startHeight: shellH,
      moved: false,
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const onDragHandlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = suggestedPanelDragRef.current
    if (!drag) return
    if (drag.kind === 'resizeHeight') {
      const delta =
        drag.edge === 'top' ? drag.startY - e.clientY : e.clientY - drag.startY
      if (Math.abs(delta) > 4) drag.moved = true
      if (!drag.moved) return
      const minH = 120
      const maxH = window.innerHeight
      setSuggestedPanelHeight(Math.max(minH, Math.min(maxH, drag.startHeight + delta)))
      return
    }
    if (drag.kind === 'move') {
      const dX = e.clientX - drag.startPointerX
      const dY = e.clientY - drag.startPointerY
      const M = 6
      const iW = window.innerWidth
      const iH = window.innerHeight
      const w = drag.startRect.width
      const h = drag.startRect.height
      const cLeft = drag.startRect.left + dX
      const cTop = drag.startRect.top + dY
      const cLeftClamped = Math.max(M, Math.min(cLeft, iW - M - w))
      const cTopClamped = Math.max(M, Math.min(cTop, iH - M - h))
      const adjX = cLeftClamped - drag.startRect.left
      const adjY = cTopClamped - drag.startRect.top
      setSuggestedPanelPositionOffset({
        x: drag.startOffsetX + adjX,
        y: drag.startOffsetY + adjY,
      })
    }
  }, [])

  const onDragHandlePointerUp = useCallback(() => {
    const drag = suggestedPanelDragRef.current
    if (!drag) return
    suggestedPanelDragRef.current = null
    if (drag.kind === 'move') {
      const p = suggestedPanelPositionOffsetRef.current
      const T = 0.5
      if (
        Math.abs(p.x - drag.startOffsetX) < T &&
        Math.abs(p.y - drag.startOffsetY) < T
      ) {
        setSuggestedPanelHandsOn(false)
      }
    }
  }, [setSuggestedPanelHandsOn])

  const MIN_SUGGESTED_PANEL_PX = 200

  const onRightEdgePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const el = suggestedPopupRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    rightEdgeDragRef.current = {
      startX: e.clientX,
      startRightCss: window.innerWidth - r.right,
      leftBound: r.left,
      moved: false,
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const onRightEdgePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = rightEdgeDragRef.current
    if (!d) return
    const dx = e.clientX - d.startX
    if (Math.abs(dx) > 3) d.moved = true
    if (!d.moved) return
    const w = window.innerWidth
    const minR = 0
    const maxR = w - d.leftBound - MIN_SUGGESTED_PANEL_PX
    const newRight = Math.max(minR, Math.min(maxR, d.startRightCss - dx))
    const base = suggestedPopupRightRef.current
    if (base == null) return
    setSuggestedPanelRightDelta(Math.abs(newRight - base) < 0.5 ? null : newRight - base)
  }, [])

  const onRightEdgePointerUp = useCallback(() => {
    rightEdgeDragRef.current = null
  }, [])

  const onLeftEdgePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const el = suggestedPopupRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    leftEdgeDragRef.current = {
      startX: e.clientX,
      startLeftDelta: suggestedPanelLeftDeltaRef.current,
      startRect: r,
      moved: false,
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const onLeftEdgePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = leftEdgeDragRef.current
    if (!d) return
    const dx = e.clientX - d.startX
    if (Math.abs(dx) > 3) d.moved = true
    if (!d.moved) return
    const r0 = d.startRect
    const minDdx = 6 - r0.left
    const maxDdx = r0.width - MIN_SUGGESTED_PANEL_PX
    const ddx = Math.max(minDdx, Math.min(maxDdx, dx))
    setSuggestedPanelLeftDelta(d.startLeftDelta + ddx)
  }, [])

  const onLeftEdgePointerUp = useCallback(() => {
    leftEdgeDragRef.current = null
  }, [])

  const onCornerPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const which = (e.currentTarget as HTMLElement).getAttribute(
      'data-suggested-resize-corner',
    ) as 'tr' | 'tl' | 'br' | 'bl' | null
    if (which == null) return
    const popup = suggestedPopupRef.current
    if (!popup) return
    const r = popup.getBoundingClientRect()
    const shellH =
      popup.parentElement?.getBoundingClientRect().height ?? r.height
    cornerResizeRef.current = {
      which,
      startX: e.clientX,
      startY: e.clientY,
      startHeight: shellH,
      startRightCss: window.innerWidth - r.right,
      startLeftDelta: suggestedPanelLeftDeltaRef.current,
      startRect: r,
      leftBound: r.left,
      moved: false,
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const onCornerPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const c = cornerResizeRef.current
    if (!c) return
    const dx = e.clientX - c.startX
    const dyy = e.clientY - c.startY
    if (Math.abs(dx) > 3 || Math.abs(dyy) > 4) c.moved = true
    if (!c.moved) return
    const minH = 120
    const maxH = window.innerHeight
    const dyFromTop = c.startY - e.clientY
    const dyFromBottom = e.clientY - c.startY
    const baseR = suggestedPopupRightRef.current
    const wWin = window.innerWidth
    const minR = 0
    const maxR = wWin - c.leftBound - MIN_SUGGESTED_PANEL_PX

    const applyRight = () => {
      if (baseR == null) return
      const newRight = Math.max(minR, Math.min(maxR, c.startRightCss - dx))
      setSuggestedPanelRightDelta(
        Math.abs(newRight - baseR) < 0.5 ? null : newRight - baseR,
      )
    }

    const applyLeft = () => {
      const r0 = c.startRect
      const minDdx = 6 - r0.left
      const maxDdx = r0.width - MIN_SUGGESTED_PANEL_PX
      const ddx = Math.max(minDdx, Math.min(maxDdx, dx))
      setSuggestedPanelLeftDelta(c.startLeftDelta + ddx)
    }

    switch (c.which) {
      case 'tr':
        setSuggestedPanelHeight(Math.max(minH, Math.min(maxH, c.startHeight + dyFromTop)))
        applyRight()
        break
      case 'tl':
        setSuggestedPanelHeight(Math.max(minH, Math.min(maxH, c.startHeight + dyFromTop)))
        applyLeft()
        break
      case 'br':
        setSuggestedPanelHeight(Math.max(minH, Math.min(maxH, c.startHeight + dyFromBottom)))
        applyRight()
        break
      case 'bl':
        setSuggestedPanelHeight(Math.max(minH, Math.min(maxH, c.startHeight + dyFromBottom)))
        applyLeft()
        break
      default:
        break
    }
  }, [])

  const onCornerPointerUp = useCallback(() => {
    cornerResizeRef.current = null
  }, [])

  const lastSuggestedPanelOpenRef = useRef(suggestedPanelHandsOn)
  /** Defer `left` / nudge / height reset until the shell’s slide-down transition ends (avoids a flash to the default slot). */
  const suggestedPanelCloseLayoutResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const panelSizeOnLatestRenderRef = useRef({
    h: null as number | null,
    d: null as number | null,
    l: 0,
    px: 0,
    py: 0,
  })
  panelSizeOnLatestRenderRef.current = {
    h: suggestedPanelHeight,
    d: suggestedPanelRightDelta,
    l: suggestedPanelLeftDelta,
    px: suggestedPanelPositionOffset.x,
    py: suggestedPanelPositionOffset.y,
  }

  useEffect(() => {
    if (suggestedPanelHandsOn) {
      if (suggestedPanelCloseLayoutResetTimerRef.current != null) {
        clearTimeout(suggestedPanelCloseLayoutResetTimerRef.current)
        suggestedPanelCloseLayoutResetTimerRef.current = null
      }
    }
  }, [suggestedPanelHandsOn])

  useEffect(
    () => () => {
      if (suggestedPanelCloseLayoutResetTimerRef.current != null) {
        clearTimeout(suggestedPanelCloseLayoutResetTimerRef.current)
        suggestedPanelCloseLayoutResetTimerRef.current = null
      }
    },
    [],
  )

  useEffect(() => {
    const wasOpen = lastSuggestedPanelOpenRef.current
    if (wasOpen && !suggestedPanelHandsOn) {
      const { h, d, l, px, py } = panelSizeOnLatestRenderRef.current
      if (suggestedHandsRememberSizeRef.current) {
        try {
          if (h != null) {
            localStorage.setItem(LS_KEY_SUGGESTED_HANDS_PANEL_HEIGHT, String(h))
          } else {
            localStorage.removeItem(LS_KEY_SUGGESTED_HANDS_PANEL_HEIGHT)
          }
          if (d != null) {
            localStorage.setItem(LS_KEY_SUGGESTED_HANDS_RIGHT_DELTA, String(d))
          } else {
            localStorage.removeItem(LS_KEY_SUGGESTED_HANDS_RIGHT_DELTA)
          }
          if (l !== 0) {
            localStorage.setItem(LS_KEY_SUGGESTED_HANDS_LEFT_DELTA, String(l))
          } else {
            localStorage.removeItem(LS_KEY_SUGGESTED_HANDS_LEFT_DELTA)
          }
          if (px === 0 && py === 0) {
            localStorage.removeItem(LS_KEY_SUGGESTED_HANDS_OFFSET_X)
            localStorage.removeItem(LS_KEY_SUGGESTED_HANDS_OFFSET_Y)
          } else {
            localStorage.setItem(LS_KEY_SUGGESTED_HANDS_OFFSET_X, String(px))
            localStorage.setItem(LS_KEY_SUGGESTED_HANDS_OFFSET_Y, String(py))
          }
        } catch {
          /* ignore */
        }
      } else {
        try {
          localStorage.removeItem(LS_KEY_SUGGESTED_HANDS_PANEL_HEIGHT)
          localStorage.removeItem(LS_KEY_SUGGESTED_HANDS_RIGHT_DELTA)
          localStorage.removeItem(LS_KEY_SUGGESTED_HANDS_LEFT_DELTA)
          localStorage.removeItem(LS_KEY_SUGGESTED_HANDS_OFFSET_X)
          localStorage.removeItem(LS_KEY_SUGGESTED_HANDS_OFFSET_Y)
        } catch {
          /* ignore */
        }
      }
      if (suggestedPanelCloseLayoutResetTimerRef.current != null) {
        clearTimeout(suggestedPanelCloseLayoutResetTimerRef.current)
        suggestedPanelCloseLayoutResetTimerRef.current = null
      }
      const resetLayout = () => {
        setSuggestedPanelHeight(null)
        setSuggestedPanelRightDelta(null)
        setSuggestedPanelLeftDelta(0)
        setSuggestedPanelPositionOffset({ x: 0, y: 0 })
        suggestedPanelCloseLayoutResetTimerRef.current = null
      }
      const resetDelayMs = animationsEnabledRef.current ? 320 : 0
      if (resetDelayMs > 0) {
        suggestedPanelCloseLayoutResetTimerRef.current = setTimeout(resetLayout, resetDelayMs)
      } else {
        resetLayout()
      }
    } else if (!wasOpen && suggestedPanelHandsOn) {
      if (suggestedHandsRememberSize) {
        const h0 = readSuggestedPanelHeightFromStorage()
        const d0 = readSuggestedPanelRightDeltaFromStorage()
        const l0 = readSuggestedPanelLeftDeltaFromStorage()
        const pos0 = readSuggestedPanelPositionOffsetFromStorage()
        if (h0 != null) {
          setSuggestedPanelHeight(h0)
        }
        if (d0 != null) {
          setSuggestedPanelRightDelta(d0)
        }
        if (l0 != null) {
          setSuggestedPanelLeftDelta(l0)
        }
        if (pos0 != null) {
          setSuggestedPanelPositionOffset(pos0)
        } else {
          setSuggestedPanelPositionOffset({ x: 0, y: 0 })
        }
      }
    }
    lastSuggestedPanelOpenRef.current = suggestedPanelHandsOn
  }, [suggestedPanelHandsOn, suggestedHandsRememberSize])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  const {
    hand,
    wall,
    bots,
    passSlots,
    selectedHandTileId,
    charlestonPhase,
    awaitingSecondCharlestonChoice,
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
    stagedCallTileIds,
    botWin,
    playerWinMethod,
  } = round
  const charlestonDone = charlestonPhase === 'done'

  useEffect(() => {
    const disc = discardTrackerPanelRef.current
    if (!disc) return
    const update = () => {
      const dRect = disc.getBoundingClientRect()
      const topFromAction = charlestonDone
        ? suggestedPopupTopAnchorMainRef.current?.getBoundingClientRect().bottom
        : suggestedPopupTopAnchorCharlestonRef.current?.getBoundingClientRect().bottom
      const toolbarBorderLeft = botExposuresToolbarWellRef.current?.getBoundingClientRect().left
      setSuggestedPopupTop(topFromAction ?? dRect.top)
      setSuggestedPopupBottom(window.innerHeight - dRect.bottom)
      setSuggestedPopupRight(
        toolbarBorderLeft == null ? null : window.innerWidth - toolbarBorderLeft,
      )
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(disc)
    const a = charlestonDone
      ? suggestedPopupTopAnchorMainRef.current
      : suggestedPopupTopAnchorCharlestonRef.current
    if (a) ro.observe(a)
    if (botExposuresToolbarWellRef.current) ro.observe(botExposuresToolbarWellRef.current)
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update, { passive: true })
    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [charlestonDone, mainPhase])

  const charlestonGlowTileIds = useMemo(() => {
    if (charlestonDone || charlestonNewTileIds.length === 0) return null
    return new Set(charlestonNewTileIds)
  }, [charlestonDone, charlestonNewTileIds])

  const [mainRackNewDotTileIds, setMainRackNewDotTileIds] = useState<Set<string>>(() => new Set())
  const mainPhasePrevForRackNewDotRef = useRef<MainPhase>(mainPhase)
  const rackNewMarkTileIds = useMemo((): ReadonlySet<string> | null => {
    if (!charlestonDone) {
      return charlestonNewTileIds.length > 0 ? new Set(charlestonNewTileIds) : null
    }
    return mainRackNewDotTileIds
  }, [charlestonDone, charlestonNewTileIds, mainRackNewDotTileIds])

  const charlestonDonePrevForDotsRef = useRef(charlestonDone)
  useLayoutEffect(() => {
    if (charlestonDone && !charlestonDonePrevForDotsRef.current) {
      setMainRackNewDotTileIds(new Set())
    }
    charlestonDonePrevForDotsRef.current = charlestonDone
  }, [charlestonDone])

  useLayoutEffect(() => {
    if (!charlestonDone) {
      mainPhasePrevForRackNewDotRef.current = mainPhase
      return
    }
    const prev = mainPhasePrevForRackNewDotRef.current
    mainPhasePrevForRackNewDotRef.current = mainPhase
    const endEastPlay =
      mainPhase === 'bot-turn' ||
      mainPhase === 'wall-game' ||
      mainPhase === 'dead-hand' ||
      mainPhase === 'bot-mahjong' ||
      mainPhase === 'mahjong-declared'
    const endCallMeld = prev === 'call-staging' && mainPhase === 'east-discard'
    if (!endEastPlay && !endCallMeld) {
      if (drawnTileId) {
        setMainRackNewDotTileIds((s) => {
          if (s.has(drawnTileId)) return s
          const n = new Set(s)
          n.add(drawnTileId)
          return n
        })
      }
      return
    }
    // Turn ended, or new east-discard after a claim — only keep a dot for a fresh draw this frame.
    setMainRackNewDotTileIds(drawnTileId ? new Set([drawnTileId]) : new Set())
  }, [charlestonDone, mainPhase, drawnTileId])

  /** Natural dragged into the joker swap slot (next to discards); tap Swap — not a discard. */
  const [pendingJokerSwapTileId, setPendingJokerSwapTileId] = useState<string | null>(null)
  const gameModeRef = useRef<'training' | 'competition'>('training')
  const callInitiateBoxRef = useRef<HTMLDivElement | null>(null)
  const callInitiatePointerCleanup = useRef<(() => void) | null>(null)
  const lastDragPointerRef = useRef({ x: 0, y: 0 })
  const globalDragPointerCleanupRef = useRef<(() => void) | null>(null)
  const [callInitiateNear, setCallInitiateNear] = useState(false)
  /** Drop on call-initiate: animate the called tile from the release point into the exposure slot. */
  const [callEntryMagnet, setCallEntryMagnet] = useState<{ from: { x: number; y: number } } | null>(null)
  const [charlestonPassError, setCharlestonPassError] = useState<string | null>(null)
  /** Charleston pass button: exit animation on pass-strip before `sendCharlestonPass` runs. */
  const [passStripFlyOut, setPassStripFlyOut] = useState<PassStripFlyOutFrom | null>(null)
  const passStripFlyoutTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const [callRuleError, setCallRuleError] = useState<string | null>(null)
  /** Mah Jongg / joker-swap validation — same fixed overlay as Charleston & call errors. */
  const [blockingDialog, setBlockingDialog] = useState<GameBlockingDialog | null>(null)
  const sortModeRef = useRef<SortMode | null>(null)

  // ── Undo history ────────────────────────────────────────────────────────────
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
    if (mainPhase !== 'east-discard' && mainPhase !== 'bot-turn') setPendingJokerSwapTileId(null)
  }, [mainPhase])

  useEffect(() => {
    if (charlestonDone) setCharlestonPassError(null)
  }, [charlestonDone])

  useEffect(() => {
    if (!charlestonDone) return
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
  useEffect(() => {
    if (!handTileFlyInKey || !handTileFlyIn) return
    const stagger = handTileFlyIn.staggerWaveDelayMs ?? 0
    const n = handTileFlyIn.ids.length
    const waveTailMs = n > 0 && stagger > 0 ? (n - 1) * stagger : 0
    /** ~one `tile-drop-in` duration (340ms) after the last tile’s delay, plus buffer. */
    const clearMs = 340 + waveTailMs + 90
    const t = window.setTimeout(() => {
      setRound((r) => (r.handTileFlyIn ? { ...r, handTileFlyIn: null } : r))
    }, clearMs)
    return () => window.clearTimeout(t)
  }, [handTileFlyInKey])

  useEffect(() => {
    if (!handJokerSwapFlyInFromBelowId) return
    const id = handJokerSwapFlyInFromBelowId
    const t = window.setTimeout(() => {
      setRound((r) => (r.handJokerSwapFlyInFromBelowId === id ? { ...r, handJokerSwapFlyInFromBelowId: null } : r))
    }, 400)
    return () => window.clearTimeout(t)
  }, [handJokerSwapFlyInFromBelowId])

  const [botExposureFlyInTileIds, setBotExposureFlyInTileIds] = useState<ReadonlySet<string> | null>(
    null,
  )
  /** Claimed discard + staged hand tiles — shared upward wave into the meld (opening-deal stagger). */
  const [eastCallStagedWaveFlyIn, setEastCallStagedWaveFlyIn] = useState<{
    staggerDelayMs: number
    baseDelayMs: number
  } | null>(null)

  useEffect(() => {
    if (mainPhase !== 'call-staging') setEastCallStagedWaveFlyIn(null)
  }, [mainPhase])

  const prevBotExposureTileIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const current = new Set(botExposures.flatMap((e) => e.tiles.map((t) => t.id)))
    const prev = prevBotExposureTileIdsRef.current

    if (!animationsEnabled) {
      prevBotExposureTileIdsRef.current = current
      return
    }

    const added: string[] = []
    for (const id of current) {
      if (!prev.has(id)) added.push(id)
    }
    prevBotExposureTileIdsRef.current = current

    if (added.length === 0) return

    setBotExposureFlyInTileIds(new Set(added))
    const tid = window.setTimeout(() => setBotExposureFlyInTileIds(null), 380)
    return () => window.clearTimeout(tid)
  }, [botExposures, animationsEnabled])

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
    (mainPhase === 'east-discard' ||
      mainPhase === 'bot-turn' ||
      mainPhase === 'call-staging') &&
    anyExposedJoker

  const jokerSwapPick = useMemo(() => {
    // Prefer an explicitly staged tile; fall back to the discard-tray tile.
    const candidate = pendingJokerSwapTileId
      ? hand.find((t) => t.id === pendingJokerSwapTileId)
      : pendingEastDiscardTile ?? undefined
    if (!candidate || candidate.def.cat === 'joker') return null
    return findNextJokerSwapTarget(botExposures, eastExposures, candidate.def)
  }, [pendingJokerSwapTileId, pendingEastDiscardTile, hand, botExposures, eastExposures])

  /** Joker swap hint (dock-bounce): only starts during East's discard turn. */
  const activeJokerSwapHintBounceIds = useMemo(() => {
    if (
      mainPhase !== 'east-discard' ||
      !jokerSwapHintEnabled ||
      !jokerSwapUiActive ||
      !animationsEnabled
    ) {
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
    animationsEnabled,
    hand,
    pendingEastDiscardTile,
    botExposures,
    eastExposures,
  ])

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

  const jokerSwapHintBounceIds = activeJokerSwapHintBounceIds ?? settlingJokerSwapHintBounceIds

  /** Increment when your turn starts again so the dock-bounce animation can replay if swap is still available. */
  const [jokerSwapHintBounceEpoch, setJokerSwapHintBounceEpoch] = useState(0)
  const prevMainPhaseForJokerHintRef = useRef<MainPhase | null>(null)
  useEffect(() => {
    const prev = prevMainPhaseForJokerHintRef.current
    if (mainPhase === 'east-discard' && prev != null && prev !== 'east-discard') {
      setJokerSwapHintBounceEpoch((e) => e + 1)
    }
    prevMainPhaseForJokerHintRef.current = mainPhase
  }, [mainPhase])

  const discardTiles = useMemo(() => discardPile.map((e) => e.tile), [discardPile])

  /** Shown in the discard strip only after all passes / claims resolve — not while East (or bots) may still claim it. */
  const displayedDiscardPile = useMemo(() => {
    if (
      (mainPhase === 'bot-turn' || mainPhase === 'call-staging') &&
      activeBotDiscard
    ) {
      return discardPile.filter((e) => e.tile.id !== activeBotDiscard.id)
    }
    return discardPile
  }, [discardPile, mainPhase, activeBotDiscard])

  /**
   * Discard-tracker fly-in: detect newly displayed tile ids **during render** so the first paint
   * already has `animate` — layout effects run too late relative to parent state otherwise (tile
   * looked like it popped in instantly).
   */
  const pendingDiscardFlyInIdsRef = useRef(new Set<string>())
  const prevDiscardIdsSnapshotRef = useRef<string[]>([])
  const [discardFlyEndEpoch, setDiscardFlyEndEpoch] = useState(0)

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

  const popDiscardDropInId = useCallback((id: string) => {
    if (!pendingDiscardFlyInIdsRef.current.delete(id)) return
    setDiscardFlyEndEpoch((e) => e + 1)
  }, [])

  /** Bot-turn discard box: tile flies in from that seat’s direction (same 0.3s vector feel as Charleston pass fly-out). */
  const discardTrackerEntries = useMemo(
    () =>
      displayedDiscardPile.map((entry) => ({
        ...entry,
        flyAnimate: animationsEnabled && pendingDiscardFlyInIdsRef.current.has(entry.tile.id),
      })),
    [displayedDiscardPile, animationsEnabled, discardFlyEndEpoch],
  )

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

  const suggestedRankInput = useMemo(
    (): RankSuggestedHandsInput => ({
      hand,
      wallRemaining: wall.length,
      discards: discardTiles,
      exposures: botExposures,
      playerClaimMelds: eastExposures,
      eastTableClaimMelds: eastExposures,
    }),
    [hand, wall.length, discardTiles, botExposures, eastExposures],
  )

  const eastSuggestedHands = useMemo(() => {
    if (mainPhase === 'mahjong-declared' || mainPhase === 'bot-mahjong' || mainPhase === 'dead-hand' || mainPhase === 'wall-game') return []
    return rankSuggestedHands(suggestedRankInput)
  }, [mainPhase, suggestedRankInput])

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
   * Same ids as `rackForSuggestedHandsUi`, but jokers in open melds use the tile they represent
   * for distance / strip matching (NMJL) — do not use for `TileFace` (would draw the natural).
   */
  const rackForSuggestedPatternMatch = useMemo(
    () => {
      const exposureIds = new Set(eastExposures.flatMap((e) => e.tiles).map((t) => t.id))
      const rack = tileInstancesWithClaimMeldJokersResolved(
        [
          ...hand,
          ...(pendingEastDiscardTile ? [pendingEastDiscardTile] : []),
          ...(passSlots.filter(Boolean) as TileInstance[]),
        ],
        eastExposures,
      )
      // Focus/highlight matching should spend matching slots on locked exposure tiles before
      // identical loose hand tiles. This matters after a bot redeems one of East's exposed jokers:
      // the replacement natural in the exposure is now committed to that line.
      return [...rack].sort((a, b) => Number(exposureIds.has(b.id)) - Number(exposureIds.has(a.id)))
    },
    [hand, pendingEastDiscardTile, passSlots, eastExposures],
  )

  const suggestedHandsExposureTileIds = useMemo((): ReadonlySet<string> | undefined => {
    const ids = eastExposures.flatMap((e) => e.tiles).map((t) => t.id)
    return ids.length > 0 ? new Set(ids) : undefined
  }, [eastExposures])

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
    const p = PRACTICE_PATTERNS.find((x) => x.id === patternId)
    return !!p?.closed
  }, [suggestedFocusHandKey, mainPhase])

  const suggestedTileGuide = useMemo(() => {
    // Rack + exposure highlights follow the focused line whenever one is selected — independent of
    // the "Tiles" toggle (that toggle only adds pattern previews inside the suggested-hands list).
    if (!suggestedFocusHandKey || mainPhase === 'mahjong-declared' || mainPhase === 'bot-mahjong' || mainPhase === 'dead-hand' || mainPhase === 'wall-game') return null
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
      .map((s) => suggestedFocusHandKey.indexOf(s))
      .filter((i) => i >= 0)
      .reduce((m, i) => (m < 0 ? i : Math.min(m, i)), -1)
    const patternId = variantSep >= 0 ? suggestedFocusHandKey.slice(0, variantSep) : suggestedFocusHandKey
    const p = PRACTICE_PATTERNS.find((x) => x.id === patternId)
    if (!p) return null

    // Variant key: pin the pattern per combo so highlights match the selected variant row.
    // - Single combo (individual variant click): use strip-aware highlighting so the rack lit
    //   tiles match exactly what the panel row shows.
    // - Multi combo (title row click — "all"): UNION of contributing rack tiles across every
    //   combo so the rack lights up every tile that helps any variant in the stack.
    if (variantSep >= 0) {
      const pinnedPatterns = buildPinnedPatternsFromFocusKey(p, suggestedFocusHandKey)
      if (pinnedPatterns.length > 0) {
        const isMulti = isMultiComboFocusKey(suggestedFocusHandKey)
        const rackIdSet = new Set(rackForSuggestedPatternMatch.map((t) => t.id))
        const unionIds = new Set<string>()
        for (const pinnedP of pinnedPatterns) {
          const detail = greedyPatternMatchDetail(rackForSuggestedPatternMatch, pinnedP, greedyUiOpts)
          if (!isMulti) {
            const ids = computeRackPatternHighlightIds(
              rackForSuggestedPatternMatch,
              pinnedP,
              detail,
              suggestedHandsExposureTileIds,
            )
            for (const id of ids) unionIds.add(id)
          } else {
            for (const id of detail.usedOrder) {
              if (rackIdSet.has(id)) unionIds.add(id)
            }
          }
        }
        return { bestIds: unionIds }
      }
    }

    const detail = greedyPatternMatchDetail(rackForSuggestedPatternMatch, p, greedyUiOpts)
    const bestIds = computeRackPatternHighlightIds(
      rackForSuggestedPatternMatch,
      p,
      detail,
      suggestedHandsExposureTileIds,
    )
    return { bestIds }
  }, [suggestedFocusHandKey, mainPhase, rackForSuggestedPatternMatch, suggestedHandsExposureTileIds])

  /**
   * Bot-exposure highlights for the focused suggested line: dim tiles that don't fit the line,
   * leave matching tiles lit + bordered (same visual treatment as the player's own rack).
   *
   * Bot tile ids are unrelated to East's rack ids, so we can't reuse `suggestedTileGuide.bestIds`
   * directly. Instead we light any bot tile whose `def` matches the focused pattern's `matches()`
   * predicate — same predicate that drives the base hand-line definition, so the visual answers
   * "is this exposed bot tile part of the line you're studying?". Jokers are intentionally NOT
   * added here; `ExposureRack` itself never dims jokers (always-lit per design), so they appear
   * fully visible without the white ring (which is reserved for natural tile matches).
   */
  const botExposureSuggestedTileGuide = useMemo(() => {
    if (!suggestedFocusHandKey || mainPhase === 'mahjong-declared' || mainPhase === 'bot-mahjong' || mainPhase === 'dead-hand' || mainPhase === 'wall-game') return null
    const variantSep = ['::tier::', '::oc::', '::ocall::']
      .map((s) => suggestedFocusHandKey.indexOf(s))
      .filter((i) => i >= 0)
      .reduce((m, i) => (m < 0 ? i : Math.min(m, i)), -1)
    const patternId = variantSep >= 0 ? suggestedFocusHandKey.slice(0, variantSep) : suggestedFocusHandKey
    const p = PRACTICE_PATTERNS.find((x) => x.id === patternId)
    if (!p) return null
    const bestIds = new Set<string>()
    for (const exp of botExposures) {
      for (const t of exp.tiles) {
        if (t.def.cat === 'joker') continue
        if (p.matches(t.def)) bestIds.add(t.id)
      }
    }
    return { bestIds }
  }, [suggestedFocusHandKey, mainPhase, botExposures])

  /** Discards that match naturals the focused line is still short (Strip slots without highlight). */
  const suggestedDiscardNeedIds = useMemo(() => {
    if (!suggestedFocusHandKey) return null
    if (mainPhase === 'mahjong-declared' || mainPhase === 'bot-mahjong' || mainPhase === 'dead-hand' || mainPhase === 'wall-game')
      return null
    return computeSuggestedDiscardNeedHighlightIds(
      suggestedFocusHandKey,
      rackForSuggestedPatternMatch,
      discardTiles,
      suggestedHandsExposureTileIds,
    )
  }, [
    suggestedFocusHandKey,
    mainPhase,
    rackForSuggestedPatternMatch,
    discardTiles,
    suggestedHandsExposureTileIds,
  ])

  /** Suggest-dim the committed discard strip only when a “need” natural is actually visible there.
   * If the only matching discards are the live bot / call-staging tile (omitted from the strip until
   * resolved), dimming the rest would show an all-dim tray with no need highlight — don't dim. */
  const suggestedDiscardPileCanDim = useMemo(() => {
    const needIds = suggestedDiscardNeedIds
    if (!needIds || needIds.size === 0) return false
    const shownIds = new Set(displayedDiscardPile.map((e) => e.tile.id))
    for (const id of needIds) {
      if (shownIds.has(id)) return true
    }
    return false
  }, [suggestedDiscardNeedIds, displayedDiscardPile])

  useEffect(() => {
    if (mainPhase === 'mahjong-declared' || mainPhase === 'bot-mahjong' || mainPhase === 'dead-hand' || mainPhase === 'wall-game') setSuggestedFocusHandKey(null)
  }, [mainPhase])

  const onSuggestedPatternClick = useCallback((handKey: string) => {
    setSuggestedFocusHandKey((cur) => (cur === handKey ? null : handKey))
  }, [])

  const onSuggestedPatternDoubleClick = useCallback((patternId: string, focusKey?: string) => {
    // Double-click sorts the rack toward the pattern. Focus defaults to the bare pattern id
    // but a caller (e.g. tier variant row) can pin focus to a specific variant key so the
    // selected variant stays highlighted after the sort. The focusKey is also forwarded to
    // the sorter so it sorts toward that specific tier combo's pinned pattern.
    setSuggestedFocusHandKey(focusKey ?? patternId)
    pushRound((r) => ({
      ...r,
      hand: sortHandForSuggestedPattern(
        r.hand,
        patternId,
        {
          hand: r.hand,
          wallRemaining: r.wall.length,
          discards: r.discardPile.map((e) => e.tile),
          exposures: r.botExposures,
          playerClaimMelds: r.eastExposures,
          eastTableClaimMelds: r.eastExposures,
        },
        focusKey,
      ),
    }))
  }, [])

  const postGameBotReview = useMemo(() => {
    if (mainPhase !== 'mahjong-declared') return null
    const eastRankInput: RankSuggestedHandsInput = {
      hand,
      wallRemaining: wall.length,
      discards: discardTiles,
      exposures: botExposures,
      playerClaimMelds: eastExposures,
      eastTableClaimMelds: eastExposures,
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
      }
      const { bestTilesAway, linesAtMin } = suggestedHandsTiedAtBest(rankInput)
      return { label, bestTilesAway, linesAtMin, rankInput }
    })
    return [eastRow, ...botRows]
  }, [mainPhase, bots, hand, wall.length, discardTiles, botExposures, eastExposures])

  /**
   * On win: full 14 (concealed + exposures) left-to-right in the order of the winning
   * practice line — same rack model as in-play suggestions (`hand` + claim melds).
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
    }
    const { closestLine } = summarizeRackTowardWin(rankInput)
    const allTiles = [...hand, ...eastExposures.flatMap((e) => e.tiles)]
    if (!closestLine) return allTiles
    return sortFullRackTilesForPattern(closestLine.id, rankInput, focusKeyForSuggestedHandLine(closestLine))
  }, [mainPhase, hand, eastExposures, wall.length, discardTiles, botExposures])

  /** Winning pattern info shown on the player win screen. */
  const playerWinPattern = useMemo(() => {
    if (mainPhase !== 'mahjong-declared') return null
    const rankInput: RankSuggestedHandsInput = {
      hand,
      wallRemaining: wall.length,
      discards: discardTiles,
      exposures: botExposures,
      playerClaimMelds: eastExposures,
      eastTableClaimMelds: eastExposures,
    }
    const { closestLine } = summarizeRackTowardWin(rankInput)
    return closestLine ?? null
  }, [mainPhase, hand, eastExposures, wall.length, discardTiles, botExposures])

  /**
   * Bot-mahjong end screen: winner row + all other players (East + remaining bots)
   * each with tiles sorted toward their closest hand and tiles-away count.
   */
  const postGameBotMahjongReview = useMemo(() => {
    if (mainPhase !== 'bot-mahjong' || !botWin) return null
    const { botIndex } = botWin
    const winnerLabel = BOT_LABELS[botIndex]!
    const winnerHand = bots[botIndex] ?? []
    const winnerExposures = botExposures.filter((e) => e.seat === winnerLabel)
    const winnerRankInput: RankSuggestedHandsInput = {
      hand: winnerHand,
      wallRemaining: wall.length,
      discards: discardTiles,
      exposures: botExposures,
      playerClaimMelds: winnerExposures,
      eastTableClaimMelds: eastExposures,
    }
    const { closestLine: winnerLine } = summarizeRackTowardWin(winnerRankInput)

    const winner = {
      label: `Bot ${botIndex + 1} (${winnerLabel})`,
      closestTitle: winnerLine?.title ?? '—',
      titleSegments: winnerLine?.titleSegments,
    }

    type LoserRow = {
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
    }
    const { bestTilesAway: eastAway, linesAtMin: eastLines } = suggestedHandsTiedAtBest(eastRankInput)
    const eastRow: LoserRow = { label: 'You (East)', bestTilesAway: eastAway, linesAtMin: eastLines, rankInput: eastRankInput }

    const otherRows: LoserRow[] = BOT_LABELS.flatMap((label, idx) => {
      if (idx === botIndex) return []
      const botHand = bots[idx] ?? []
      const claims = botExposures.filter((e) => e.seat === label)
      const rankInput: RankSuggestedHandsInput = {
        hand: botHand,
        wallRemaining: wall.length,
        discards: discardTiles,
        exposures: botExposures,
        playerClaimMelds: claims,
        eastTableClaimMelds: eastExposures,
      }
      const { bestTilesAway, linesAtMin } = suggestedHandsTiedAtBest(rankInput)
      return [{ label: `Bot ${idx + 1} (${label})`, bestTilesAway, linesAtMin, rankInput }]
    })

    return { winner, rows: [eastRow, ...otherRows], winnerLine }
  }, [mainPhase, botWin, bots, hand, wall.length, discardTiles, botExposures, eastExposures])

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
  }, [mainPhase, bots, hand, wall.length, discardTiles, botExposures, eastExposures])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const [dragOverlayTile, setDragOverlayTile] = useState<TileInstance | null>(null)
  const [dragOverlayMeldTiles, setDragOverlayMeldTiles] = useState<TileInstance[] | null>(null)
  const [dragOverlayRackSuitStacked, setDragOverlayRackSuitStacked] = useState(false)
  /** While dragging a Charleston pass tile over the hand, lift it into the hand sortable list so neighbours slide. */
  const [charlestonPassIntoHandPreview, setCharlestonPassIntoHandPreview] = useState<{
    tileId: string
    handPreviewIndex: number
  } | null>(null)
  /** Same idea as Charleston: while dragging staged East discard over the rack, hand list preview + phantom so neighbours slide. */
  const [eastDiscardIntoHandPreview, setEastDiscardIntoHandPreview] = useState<{
    tileId: string
    handPreviewIndex: number
  } | null>(null)

  const tileDragCollisionDetection = useMemo<CollisionDetection>(
    () => (args) => {
      const aid = String(args.active.id)
      if (parseEastExposureMeldSortId(aid) != null) {
        const meldContainers = args.droppableContainers.filter(
          (c) => parseEastExposureMeldSortId(String(c.id)) != null,
        )
        return meldContainers.length > 0
          ? closestCenter({ ...args, droppableContainers: meldContainers })
          : []
      }
      const fromPassSlot = passSlots.some((s) => s?.id === aid)
      const fromStagedDiscard = pendingEastDiscardTile?.id === aid
      const hits = pointerWithin(args)
      if (hits.length > 0) {
        const pick = (id: string | number) => hits.find((c) => c.id === id)
        if (!charlestonDone) {
          const fromHand = hand.some((t) => t.id === aid)
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
          const pb = pick(PASS_BOX_ID)
          if (pb) return [pb]
        }
        if (fromPassSlot || fromStagedDiscard) {
          const overHandTile = hits.find((h) => hand.some((t) => t.id === h.id))
          if (overHandTile) return [overHandTile]
          const hb = pick(HAND_BANK_ID)
          if (hb) return [hb]
        }
        if (charlestonDone && mainPhase === 'east-discard' && pick(EAST_DISCARD_STAGING_ID)) {
          return [pick(EAST_DISCARD_STAGING_ID)!]
        }
        if (
          charlestonDone &&
          mainPhase === 'bot-turn' &&
          (hand.some((t) => t.id === aid) || aid === activeBotDiscard?.id) &&
          pick(CALL_INITIATE_FIRST_SLOT_ID)
        ) {
          return [pick(CALL_INITIATE_FIRST_SLOT_ID)!]
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
        if (charlestonDone && jokerSwapUiActive && pick(JOKER_SWAP_STAGING_ID)) {
          return [pick(JOKER_SWAP_STAGING_ID)!]
        }
        // Drag-to-bot-exposure joker swap: prefer a meld dropzone under the pointer,
        // otherwise the seat-wide dropzone. (Without this, closestCenter falls back to
        // the still-mounted hand-tile rect at the bottom of the screen.)
        if (charlestonDone && jokerSwapUiActive) {
          const eastMeldHit = hits.find((h) => parseEastExposureSwapDropId(String(h.id)) !== null)
          if (eastMeldHit) return [eastMeldHit]
          const eastSeatHit = hits.find((h) => String(h.id) === EAST_SEAT_SWAP_ID)
          if (eastSeatHit) return [eastSeatHit]
          const meldHit = hits.find((h) => parseBotExposureSwapDropId(String(h.id)) !== null)
          if (meldHit) return [meldHit]
          const seatHit = hits.find((h) => parseBotSeatSwapDropId(String(h.id)) !== null)
          if (seatHit) return [seatHit]
          // Pointer may be just outside the rect, but the tile visually overlaps the rack.
          // rectIntersection detects overlap between the dragged tile's rect and the drop
          // zone — matching the "when it touches the rack" expectation.
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

  const endCallInitiateTrack = useCallback(() => {
    callInitiatePointerCleanup.current?.()
    callInitiatePointerCleanup.current = null
    setCallInitiateNear(false)
  }, [])

  const onDragStart = useCallback(
    (e: DragStartEvent) => {
      setCharlestonPassIntoHandPreview(null)
      setEastDiscardIntoHandPreview(null)
      endCallInitiateTrack()
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
      const fromLiveBotDiscard = activeBotDiscard?.id === id
      if (fromHand || fromLiveBotDiscard) {
        setDragOverlayTile(fromHand ?? activeBotDiscard ?? null)
        setDragOverlayMeldTiles(null)
        setDragOverlayRackSuitStacked(true)
        if (charlestonDone && mainPhase === 'bot-turn' && activeBotDiscard) {
          const onMove = (ev: PointerEvent) => {
            const el = callInitiateBoxRef.current
            if (!el) return
            const r = el.getBoundingClientRect()
            if (r.width < 1 || r.height < 1) return
            const cx = (r.left + r.right) / 2
            const cy = (r.top + r.bottom) / 2
            const d = Math.hypot(ev.clientX - cx, ev.clientY - cy)
            const show = d < 3 * r.width
            setCallInitiateNear((prev) => (prev === show ? prev : show))
          }
          window.addEventListener('pointermove', onMove, { passive: true })
          callInitiatePointerCleanup.current = () => {
            window.removeEventListener('pointermove', onMove)
            setCallInitiateNear(false)
          }
        }
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
      endCallInitiateTrack,
      charlestonDone,
      mainPhase,
      activeBotDiscard,
      eastExposures,
    ],
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
            setEastDiscardIntoHandPreview((prev) =>
              prev?.tileId === aid && prev.handPreviewIndex === hand.length
                ? prev
                : { tileId: aid, handPreviewIndex: hand.length },
            )
            return
          }
          const overHandIdx = hand.findIndex((t) => t.id === oid)
          if (overHandIdx >= 0) {
            setEastDiscardIntoHandPreview((prev) =>
              prev?.tileId === aid && prev.handPreviewIndex === overHandIdx
                ? prev
                : { tileId: aid, handPreviewIndex: overHandIdx },
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
        return
      }
      const over = e.over
      if (!over) {
        setCharlestonPassIntoHandPreview(null)
        return
      }
      const oid = String(over.id)
      if (oid === HAND_BANK_ID) {
        setCharlestonPassIntoHandPreview((prev) =>
          prev?.tileId === aid && prev.handPreviewIndex === hand.length
            ? prev
            : { tileId: aid, handPreviewIndex: hand.length },
        )
        return
      }
      const overHandIdx = hand.findIndex((t) => t.id === oid)
      if (overHandIdx >= 0) {
        setCharlestonPassIntoHandPreview((prev) =>
          prev?.tileId === aid && prev.handPreviewIndex === overHandIdx
            ? prev
            : { tileId: aid, handPreviewIndex: overHandIdx },
        )
        return
      }
      setCharlestonPassIntoHandPreview(null)
    },
    [charlestonDone, mainPhase, pendingEastDiscardTile, passSlots, hand],
  )

  const onDragCancel = useCallback(() => {
    endCallInitiateTrack()
    setCharlestonPassIntoHandPreview(null)
    setEastDiscardIntoHandPreview(null)
    setDragOverlayTile(null)
    setDragOverlayMeldTiles(null)
    setDragOverlayRackSuitStacked(false)
  }, [endCallInitiateTrack])

  const passSlotCount = passSlots.filter(Boolean).length
  const blindPhase = !charlestonDone && charlestonAllowsBlind(charlestonPhase)
  const courtesyPhase = charlestonPhase === 'courtesy'
  const passReady =
    courtesyPhase
      ? passSlotCount <= 3
      : blindPhase
        ? passSlotCount <= 3
        : passSlotCount === 3

  const newHand = useCallback(() => {
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
    setSuggestedCategoryResetEpoch((epoch) => epoch + 1)
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
    setMainRackNewDotTileIds(new Set())
    mainPhasePrevForRackNewDotRef.current = 'east-discard'
    charlestonDonePrevForDotsRef.current = false
    // Menu preferences are not part of the round; keep from `localStorage` so a new hand never clears them.
    const w = readBotWinsEnabledFromStorage()
    setBotWinsEnabled((prev) => (prev === w ? prev : w))
    botWinsEnabledRef.current = w
    setRound(createNewRound())
  }, [])

  const sendCharlestonPass = useCallback(() => {
    const charlestonBotPassOpts = {
      pickBotPass: (hand: TileInstance[], n: number, botIndex: 0 | 1 | 2) =>
        chooseBotCharlestonPass(hand, n, BOT_LABELS[botIndex] as BotSeat, botDifficultyRef.current),
    }
    let blockedByJoker = false
    pushRound((r) => {
      if (r.charlestonPhase === 'done') return r
      const phase = r.charlestonPhase
      const eastRack = r.passSlots.filter(Boolean) as TileInstance[]
      if (eastRack.some((t) => t.def.cat === 'joker')) {
        blockedByJoker = true
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
    if (blockedByJoker) {
      setCharlestonPassError('Error: Jokers can not be passed during Charleston')
    }
  }, [])

  const onCharlestonPassButtonClick = useCallback(() => {
    const passSlotCount = passSlots.filter(Boolean).length
    const blindPhaseLocal = !charlestonDone && charlestonAllowsBlind(charlestonPhase)
    const courtesyPhaseLocal = charlestonPhase === 'courtesy'
    const ready =
      courtesyPhaseLocal
        ? passSlotCount <= 3
        : blindPhaseLocal
          ? passSlotCount <= 3
          : passSlotCount === 3
    if (!ready) return
    const eastRack = passSlots.filter(Boolean) as TileInstance[]
    if (eastRack.some((t) => t.def.cat === 'joker')) {
      sendCharlestonPass()
      return
    }
    if (!animationsEnabledRef.current) {
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
  }, [passSlots, charlestonPhase, charlestonDone, sendCharlestonPass])

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
  }, [])

  const skipBotDiscard = useCallback(
    () =>
      pushRound((r) => applySkipBotDiscard(r, botWinsEnabledRef.current, botDifficultyRef.current)),
    [pushRound],
  )
  const commitEastDiscard = useCallback(() => {
    if (gameModeRef.current === 'training') {
      const cur = roundRef.current
      // Post-discard rack: the parked discard is leaving the hand and becomes table-visible.
      const pendingTile = cur.pendingEastDiscardTile
      if (cur.mainPhase === 'east-discard' && pendingTile) {
        const rankInput: RankSuggestedHandsInput = {
          hand: cur.hand,
          wallRemaining: cur.wall.length,
          discards: [...cur.discardPile.map((e) => e.tile), pendingTile],
          exposures: cur.botExposures,
          playerClaimMelds: cur.eastExposures,
          eastTableClaimMelds: cur.eastExposures,
        }
        const { bestTilesAway, closestLine } = summarizeRackTowardWin(rankInput)
        // No line on the card can complete from this rack — discarding will lock in a dead hand.
        if (!closestLine || bestTilesAway >= 14) {
          queueMicrotask(() =>
            setBlockingDialog({ variant: 'discard-dead-warning', rankInput }),
          )
          return
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
        }
        const { bestTilesAway } = summarizeRackTowardWin(rankInput)
        if (bestTilesAway !== 0) {
          if (gameModeRef.current === 'training') {
            queueMicrotask(() => setBlockingDialog({ variant: 'mahjong-dead-warning', rankInput }))
            return cur
          }
          return { ...cur, mainPhase: 'dead-hand' }
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
          }
          if (gameModeRef.current === 'training') {
            queueMicrotask(() => setBlockingDialog({ variant: 'mahjong-dead-warning', rankInput }))
            return cur
          }
          return { ...cur, mainPhase: 'dead-hand' }
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
          }
          if (gameModeRef.current === 'training') {
            queueMicrotask(() => setBlockingDialog({ variant: 'mahjong-dead-warning', rankInput }))
            return cur
          }
          return { ...cur, mainPhase: 'dead-hand' }
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
        }
        if (gameModeRef.current === 'training') {
          // Training mode: warn before committing to dead hand
          queueMicrotask(() => setBlockingDialog({ variant: 'mahjong-dead-warning', rankInput }))
          return cur
        }
        return { ...cur, mainPhase: 'dead-hand' }
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
  }, [jokerSwapUiActive, pendingJokerSwapTileId, pendingEastDiscardTile, jokerSwapPick])

  const sortHand = useCallback(() => {
    const nextMode: SortMode = sortModeRef.current === 'suit' ? 'number' : 'suit'
    sortModeRef.current = nextMode
    pushRound((r) => ({ ...r, hand: sortTiles(r.hand, nextMode) }))
  }, [pushRound])

  const initiateCall = useCallback(() => {
    // Compute the error synchronously from the current render's state values — reading it
    // after setRound(updater) is unreliable in React 18 because updaters may be deferred.
    const err = getCallInitiateBlockMessage({
      mainPhase,
      activeBotDiscard,
      hand,
      eastExposures,
      botExposures,
      wall,
      discardPile,
    })
    if (err === MSG_CALL_DEAD_JOKER) {
      setCallRuleError(null)
      setBlockingDialog({
        variant: 'table',
        title: 'Dead joker',
        message: err,
      })
    } else if (err === MSG_CALL_INSUFFICIENT_TILES) {
      setCallRuleError(null)
      setBlockingDialog({ variant: 'dead-hand-warning' })
    } else if (err) {
      setBlockingDialog(null)
      setCallRuleError(err)
    } else {
      setBlockingDialog(null)
      setCallRuleError(null)
      const flags = getCallCapacityFlags(hand, activeBotDiscard)
      // Stage a pung first (2 from hand) when possible. Player can add tiles to the meld (e.g. kong) by hand before Done.
      // applyAutoSelectCallTiles uses naturals first, then jokers only to fill leftover slots.
      const needed =
        flags.canPung
          ? 2
          : hasLegalMahjongOnBotDiscard({
              mainPhase: 'bot-turn',
              activeBotDiscard,
              hand,
              eastExposures,
              botExposures,
              wall,
              discardPile,
            })
            ? 0
          : 2
      const callPreviewRankInput = previewAutoSelectedCallRankInput(roundRef.current, needed)
      if (gameModeRef.current === 'training' && callPreviewRankInput) {
        const { closestLine } = summarizeRackTowardWin(callPreviewRankInput)
        if (!closestLine) {
          setBlockingDialog({
            variant: 'call-exposure-dead-warning',
            rankInput: callPreviewRankInput,
          })
          return
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
      pushRound((r) => applyAutoSelectCallTiles(applyInitiateCall(r), needed))
    }
  }, [
    mainPhase,
    activeBotDiscard,
    hand,
    eastExposures,
    botExposures,
    wall,
    discardPile,
    animationsEnabled,
    pushRound,
  ])

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
    pushRound((r) => applyCommitStagedCall(r, gameModeRef.current))
  }, [pushRound])

  const onHandTileActivate = useCallback((id: string) => {
    let jokerClickBlocked = false
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

      const emptyIdx = r.passSlots.findIndex((s) => s == null)
      if (emptyIdx >= 0) {
        const handIdx = r.hand.findIndex((t) => t.id === id)
        if (handIdx < 0) return r
        const tile = r.hand[handIdx]!
        if (tile.def.cat === 'joker') {
          jokerClickBlocked = true
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
        return { ...r, hand: handNext, passSlots: passNext, passSlotOrigins: passOriginsNext, selectedHandTileId: null }
      }
      return { ...r, selectedHandTileId: r.selectedHandTileId === id ? null : id }
    })
    if (jokerClickBlocked) {
      setCharlestonPassError('Jokers cannot be passed during the Charleston.')
    }
  }, [setCharlestonPassError, pushRound])

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      const { active, over } = e
      const aid = String(active.id)
      try {
        if (!over) return
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

        if (oid === CALL_INITIATE_FIRST_SLOT_ID) {
          if (hand.some((t) => t.id === aid) || activeBotDiscard?.id === aid) {
            initiateCall()
          }
          return
        }

        if (
          jokerSwapUiActive &&
          oid === JOKER_SWAP_STAGING_ID &&
          hand.some((t) => t.id === aid && t.def.cat !== 'joker')
        ) {
          setPendingJokerSwapTileId(aid)
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

        // Joker swap: your exposures, your row, or a bot’s meld / seat (same rules: natural for joker).
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
              pick = findJokerSwapTargetAtExposure(r.botExposures, exposureSwapIdx, natural.def)
            }
            if (!pick && (seatSwap || exposureSwapIdx !== null)) {
              const seat =
                seatSwap ??
                (exposureSwapIdx !== null ? r.botExposures[exposureSwapIdx]?.seat : null) ??
                null
              if (seat) pick = findJokerSwapTargetAtSeat(r.botExposures, seat, natural.def)
            }
            if (!pick) return r
            return applyEastNaturalForExposedJoker(r, { ...pick, eastTileId: aid })
          })
          return
        }

        let jokerPassBlocked = false
        pushRound((r) => {
      const passSlotsNext: PassSlots = [...r.passSlots]
      const handNext = [...r.hand]
      const handIdx = handNext.findIndex((t) => t.id === aid)
      const passFromIdx = passSlotsNext.findIndex((s) => s?.id === aid)
      const overHandIdx = handNext.findIndex((t) => t.id === oid)
      const passToIdx = passDropIndex(oid, passSlotsNext)
      const blockPass = r.charlestonPhase === 'done'

      if (r.mainPhase === 'east-discard' && r.pendingEastDiscardTile?.id === aid && oid === HAND_BANK_ID) {
        const t = r.pendingEastDiscardTile
        const handNext2 = [...r.hand]
        const insertIdx = Math.min(r.pendingEastDiscardIdx ?? handNext2.length, handNext2.length)
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
        hn.splice(overHandIdx, 0, t)
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

      if (!blockPass && passFromIdx >= 0 && passToIdx !== null && handIdx < 0) {
        if (passFromIdx === passToIdx) return { ...r, selectedHandTileId: null }
        const moved = passSlotsNext[passFromIdx]!
        const target = passSlotsNext[passToIdx]
        if (target) {
          passSlotsNext[passFromIdx] = target
          passSlotsNext[passToIdx] = moved
        } else {
          passSlotsNext[passFromIdx] = null
          passSlotsNext[passToIdx] = moved
        }
        return { ...r, passSlots: passSlotsNext, selectedHandTileId: null }
      }

      if (!blockPass && handIdx >= 0 && passToIdx !== null) {
        const moved = handNext[handIdx]!
        if (moved.def.cat === 'joker') {
          jokerPassBlocked = true
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
        if (t) handNext.push(t)
        return { ...r, hand: handNext, passSlots: passSlotsNext, passSlotOrigins: passOriginsNext }
      }

      if (passFromIdx >= 0 && overHandIdx >= 0) {
        const t = passSlotsNext[passFromIdx]
        passSlotsNext[passFromIdx] = null
        if (t) handNext.splice(overHandIdx, 0, t)
        return { ...r, hand: handNext, passSlots: passSlotsNext }
      }

      return r
    })
        if (jokerPassBlocked) {
          setCharlestonPassError('Jokers cannot be passed during the Charleston.')
        }
      } finally {
        endCallInitiateTrack()
        globalDragPointerCleanupRef.current?.()
        setDragOverlayTile(null)
        setDragOverlayMeldTiles(null)
        setDragOverlayRackSuitStacked(false)
        setCharlestonPassIntoHandPreview(null)
        setEastDiscardIntoHandPreview(null)
      }
    },
    [
      hand,
      jokerSwapUiActive,
      mainPhase,
      stagedCallTileIds,
      pushRound,
      endCallInitiateTrack,
      initiateCall,
      activeBotDiscard?.id,
      eastExposures,
      botExposures,
      wall,
      discardPile,
    ],
  )

  const onPassBoxClick = useCallback(() => {
    let jokerClickBlocked = false
    pushRound((r) => {
      if (r.charlestonPhase === 'done') return r
      const emptyIdx = r.passSlots.findIndex((s) => s == null)
      if (emptyIdx < 0) return r
      if (!r.selectedHandTileId) return r
      const handIdx = r.hand.findIndex((t) => t.id === r.selectedHandTileId)
      if (handIdx < 0) return { ...r, selectedHandTileId: null }
      if (r.hand[handIdx]!.def.cat === 'joker') {
        jokerClickBlocked = true
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

      return { ...r, hand: handNext, passSlots: passSlotsNext, passSlotOrigins: passOriginsNext, selectedHandTileId: null }
    })
    if (jokerClickBlocked) {
      setCharlestonPassError('Jokers cannot be passed during the Charleston.')
    }
  }, [setCharlestonPassError, pushRound])

  const onPassTileClickReturn = useCallback((slotIndex: number) => {
    pushRound((r) => {
      if (r.charlestonPhase === 'done') return r
      const t = r.passSlots[slotIndex]
      if (!t) return r
      const passSlotsNext: PassSlots = [...r.passSlots]
      passSlotsNext[slotIndex] = null
      const passOriginsNext: [number | null, number | null, number | null] = [...r.passSlotOrigins]
      passOriginsNext[slotIndex] = null
      const handNext = [...r.hand]
      handNext.push(t)
      return { ...r, hand: handNext, passSlots: passSlotsNext, passSlotOrigins: passOriginsNext, selectedHandTileId: null }
    })
  }, [pushRound])

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
    : eastMainSortableIds ?? handIds

  const mainGameCallDisabled = mainPhase !== 'bot-turn' || !activeBotDiscard
  const mahjongButtonEnabled =
    charlestonDone &&
    (mainPhase === 'east-discard' ||
      (mainPhase === 'bot-turn' && !!activeBotDiscard))
  const mainGamePrimaryDisabled =
    mainPhase === 'east-discard'
      ? !pendingEastDiscardTile
      : mainPhase === 'call-staging'
        ? true  // always disabled — use inline Done button in the exposure rack
        : mainPhase === 'bot-turn'
          ? !activeBotDiscard
          : true
  const mainGamePrimaryLabel =
    mainPhase === 'east-discard' || mainPhase === 'call-staging'
      ? 'Discard'
      : 'Ignore'

  /** Discard tracker + suggested hands row below rack (always on so layout is visible during Charleston). */
  const showPlaySplitRow = true

  const showSuggestedHandsPanel = mainPhase !== 'mahjong-declared' && mainPhase !== 'bot-mahjong' && mainPhase !== 'dead-hand'

  /** Hand action bar is hidden in these phases; keep Menu on the bot column toolbar. */
  const menuInBotExposuresToolbar =
    mainPhase === 'wall-game' || mainPhase === 'bot-mahjong' || mainPhase === 'dead-hand'

  const botDiscardStatusLine =
    charlestonDone && mainPhase === 'bot-turn' && activeBotDiscard
      ? botTurnBanner
        ? `${BOT_LABELS[botTurnBanner.callerBotIndex]} called ${tileShortLabel(
            botTurnBanner.calledDef,
          )}, discarded ${tileShortLabel(activeBotDiscard.def)}`
        : `${BOT_LABELS[activeBotIndex ?? 0]} discarded ${tileShortLabel(activeBotDiscard.def)}`
      : null

  const suggestedPopupRightForStyle: number | undefined =
    suggestedPopupRight != null
      ? suggestedPopupRight + (suggestedPanelRightDelta ?? 0)
      : undefined

  return (
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
              <button
                type="button"
                className="btn app-menu-tray__item app-menu-modal__new-game"
                onClick={() => {
                  newHand()
                  setMenuOpen(false)
                }}
              >
                New Game
              </button>
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
                <div className="app-menu-modal__subhead" id="tile-graphics-menu-label">
                  Tile graphics
                </div>
                <div className="app-menu-modal__tile-graphics-category">
                  <hr className="app-menu-modal__tile-graphics-category__line" aria-hidden="true" />
                  <span
                    className="app-menu-modal__tile-graphics-category__label"
                    id={TILE_GRAPHICS_CATEGORY_MINIMALIST_ID}
                  >
                    Minimalist
                  </span>
                  <hr className="app-menu-modal__tile-graphics-category__line" aria-hidden="true" />
                </div>
                <div
                  className="app-menu-modal__tile-graphics-modes app-menu-tray__diff-row app-menu-modal__diff-row"
                  role="radiogroup"
                  aria-labelledby={['tile-graphics-menu-label', TILE_GRAPHICS_CATEGORY_MINIMALIST_ID].join(' ')}
                >
                  {TILE_GRAPHICS.map((g) => (
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
                  className="app-menu-modal__tile-graphics-preview"
                  role="group"
                  aria-label="Sample Minimalist-style tiles for the current selection"
                >
                  {MENU_TILE_GRAPHICS_PREVIEW.map((spec) => (
                    <TileFace
                      key={spec.label}
                      def={spec.def}
                      rackSuitStacked
                    />
                  ))}
                </div>
                <div
                  className="app-menu-modal__tile-graphics-category app-menu-modal__tile-graphics-category--illustrative"
                >
                  <hr className="app-menu-modal__tile-graphics-category__line" aria-hidden="true" />
                  <span
                    className="app-menu-modal__tile-graphics-category__label"
                    id={TILE_GRAPHICS_CATEGORY_ILLUSTRATIVE_ID}
                  >
                    Illustrative
                  </span>
                  <hr className="app-menu-modal__tile-graphics-category__line" aria-hidden="true" />
                </div>
                <div
                  className="app-menu-modal__tile-graphics-preview app-menu-modal__tile-graphics-preview--illustrative"
                  role="group"
                  aria-label="Illustrative tile styles (no samples yet)"
                >
                  {ILLUSTRATIVE_PREVIEW_PLACEHOLDERS.map((i) => (
                    <div
                      key={i}
                      className="app-menu-modal__tile-graphics-preview__sizer"
                      aria-hidden="true"
                    />
                  ))}
                </div>
              </div>
              <div className="app-menu-tray__divider app-menu-modal__section-rule" role="separator" />
              <div className="app-menu-modal__body-footer app-menu-modal__body-footer--settings-toggles">
                <div className="app-menu-modal__row app-menu-modal__row--toggle">
                  <AppMenuSettingSwitch
                    labelId="app-menu-label-remember-hands-size"
                    pressed={suggestedHandsRememberSize}
                    onToggle={toggleSuggestedHandsRememberSize}
                  />
                  <span className="app-menu-modal__label" id="app-menu-label-remember-hands-size">
                    {SUGGESTED_HANDS_REMEMBER_SIZE_LABEL}
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
                    labelId="app-menu-label-anim"
                    pressed={animationsEnabled}
                    onToggle={toggleAnimations}
                  />
                  <span className="app-menu-modal__label" id="app-menu-label-anim">
                    Animations
                  </span>
                </div>
                <div className="app-menu-modal__row app-menu-modal__row--toggle">
                  <AppMenuSettingSwitch
                    labelId="app-menu-label-color-buttons"
                    pressed={colorButtonsEnabled}
                    onToggle={toggleColorButtons}
                  />
                  <span
                    className="app-menu-modal__label"
                    id="app-menu-label-color-buttons"
                  >
                    {COLOR_BUTTONS_LABEL}
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
            if (blockingDialog?.variant === 'dead-hand-warning') return
            if (blockingDialog?.variant === 'mahjong-dead-warning') return
            if (blockingDialog?.variant === 'call-exposure-dead-warning') return
            if (blockingDialog?.variant === 'discard-dead-warning') return
            setCharlestonPassError(null)
            setCallRuleError(null)
            setBlockingDialog(null)
          }}
        >
          <div
            className={[
              'charleston-error-dialog',
              blockingDialog?.variant === 'table' ? 'charleston-error-dialog--table' : '',
              blockingDialog?.variant === 'dead-hand-warning'
                ? 'charleston-error-dialog--blocking-neutral charleston-error-dialog--dead-hand-warning'
                : '',
              blockingDialog?.variant === 'mahjong-dead-warning'
                ? 'charleston-error-dialog--blocking-neutral charleston-error-dialog--mahjong-dead-warning'
                : '',
              blockingDialog?.variant === 'call-exposure-dead-warning' ||
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
              blockingDialog?.variant === 'discard-dead-warning'
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
              blockingDialog?.variant === 'discard-dead-warning'
                ? 'game-blocking-error-body'
                : undefined
            }
            onClick={(e) => e.stopPropagation()}
          >
            {blockingDialog?.variant === 'dead-hand-warning' ? (
              <>
                <h2 id="game-blocking-error-title" className="charleston-error-dialog__title">
                  ⚠️ Proceeding will kill your hand
                </h2>
                <p id="game-blocking-error-body" className="charleston-error-dialog__body">
                  You do not have enough tiles to form a valid Pung, Kong, Quint, or Sextent with
                  this discard. If you call it, your hand will be officially dead and the game will
                  end immediately.
                </p>
                <div className="charleston-error-dialog__actions charleston-error-dialog__actions--spread">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setBlockingDialog(null)
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn--danger"
                    onClick={() => {
                      setBlockingDialog(null)
                      pushRound((r) => ({ ...r, mainPhase: 'dead-hand' }))
                    }}
                  >
                    Proceed (Dead Hand)
                  </button>
                </div>
              </>
            ) : blockingDialog?.variant === 'table' ? (
              <>
                <button
                  type="button"
                  className="charleston-error-dialog__dismiss"
                  aria-label="Close"
                  onClick={() => {
                    setCharlestonPassError(null)
                    setCallRuleError(null)
                    setBlockingDialog(null)
                  }}
                >
                  ×
                </button>
                <h2 id="game-blocking-error-title" className="charleston-error-dialog__title">
                  {blockingDialog.title}
                </h2>
                <p id="game-blocking-error-body" className="charleston-error-dialog__body">
                  {blockingDialog.message}
                </p>
                <div className="charleston-error-dialog__actions charleston-error-dialog__actions--center">
                  <button
                    type="button"
                    className="btn game-blocking-dialog__ok-btn"
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
                  Your current tiles do not complete any hand on the card. If you proceed with
                  this declaration, your hand will be officially dead and the game will end
                  immediately.
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
                      pushRound((r) => ({ ...r, mainPhase: 'dead-hand' }))
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
                    ? 'Calling this tile would expose a meld that does not fit any remaining playable hand on the card. If you proceed, your hand will be officially dead and the game will end immediately.'
                    : 'Your current exposures do not fit any remaining playable hand on the card. Proceeding will end the game with a dead hand.'}
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
                      pushRound((r) => ({ ...r, mainPhase: 'dead-hand' }))
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
            ) : (
              <>
                <p id="game-blocking-error-msg" className="charleston-error-dialog__message">
                  {charlestonPassError ?? callRuleError ?? blockingDialog?.message}
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
            <h2 id="dead-hand-title" className="dead-hand-dialog__title">💀 Dead Hand</h2>
            <p className="dead-hand-dialog__body">
              You called a tile but cannot form a valid Pung, Kong, Quint, or Sextent with
              your remaining tiles. Your hand is officially dead — the game is over.
            </p>
            <div className="dead-hand-dialog__actions">
              <button
                type="button"
                className="btn btn--primary"
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
              The wall ran out — no one drew a winning tile. Below is each seat&apos;s closest card line
              (fewest tiles away), tiles away, and full rack in that line&apos;s left-to-right card order.
            </p>
            {postGameWallGameReview ? (
              <div className="wall-game-dialog__review mahjong-win__bots-review" aria-labelledby="wall-game-review-heading">
                <h3 id="wall-game-review-heading" className="mahjong-win__bots-review-title">
                  All seats (practice card)
                </h3>
                <ul className="mahjong-win__bots-review-list">
                  {postGameWallGameReview.rows.map((row) => (
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
                className="btn btn--primary"
                onClick={newHand}
              >
                New Game
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setWallGameReviewing(true)}
              >
                Review
              </button>
              <button
                type="button"
                className="btn"
                onClick={newHand}
              >
                Replay
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {charlestonDone && mainPhase === 'mahjong-declared' && !mahjongWinReviewing && (
        <div className="wall-game-overlay" role="dialog" aria-modal="true" aria-labelledby="mj-win-title">
          <div className="wall-game-dialog" onClick={(e) => e.stopPropagation()}>
            <h2 id="mj-win-title" className="wall-game-dialog__title wall-game-dialog__title--mahjong-win">Mah Jongg!</h2>
            <p className="wall-game-dialog__intro">
              Your winning hand, how the hand was completed, and every seat&apos;s closest line on the practice
              card.
            </p>
            {winHandSortedTiles && (
              <div className="mahjong-win__player-tiles">
                {winHandSortedTiles.map((tile) => (
                  <div key={tile.id} className="mahjong-win__bots-review-tile">
                    <TileFace def={tile.def} />
                  </div>
                ))}
              </div>
            )}
            <div className="wall-game-dialog__win-meta">
              {playerWinPattern ? (
                <span className="mahjong-win__note">
                  {playerWinPattern.section && playerWinPattern.cardLineNumber != null
                    ? `${playerWinPattern.section} #${playerWinPattern.cardLineNumber} · `
                    : ''}
                  {playerWinPattern.titleSegments
                    ? <CardColoredText segments={playerWinPattern.titleSegments} />
                    : playerWinPattern.title}
                </span>
              ) : (
                <span className="mahjong-win__note">Hand validated</span>
              )}
              <span className="mahjong-win__player-meta-divider">·</span>
              <span className="mahjong-win__win-method">
                {playerWinMethod?.type === 'self-draw'
                  ? 'Drew own tile'
                  : playerWinMethod?.type === 'called-discard'
                    ? `Called ${playerWinMethod.botLabel}'s discard`
                    : null}
              </span>
              <span className="mahjong-win__player-meta-divider">·</span>
              <span className="mahjong-win__points">Points: TBD</span>
            </div>
            {postGameBotReview ? (
              <div className="wall-game-dialog__review mahjong-win__bots-review" aria-labelledby="bots-review-heading">
                <h3 id="bots-review-heading" className="mahjong-win__bots-review-title">
                  All seats (practice card)
                </h3>
                <ul className="mahjong-win__bots-review-list">
                  {postGameBotReview.map((row) => (
                    <li key={row.label} className="mahjong-win__bots-review-card">
                      <PostGameLoserRackRow
                        rowId={`mj-win-bots-${row.label}`}
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
              <button type="button" className="btn btn--primary" onClick={newHand}>
                New Game
              </button>
              <button type="button" className="btn" onClick={() => setMahjongWinReviewing(true)}>
                Review
              </button>
              <button type="button" className="btn" onClick={newHand}>
                Replay
              </button>
            </div>
          </div>
        </div>
      )}
      {charlestonDone && mainPhase === 'bot-mahjong' && postGameBotMahjongReview && !botMahjongWinReviewing && (
        <div className="wall-game-overlay" role="dialog" aria-modal="true" aria-labelledby="bot-mj-win-title">
          <div
            className="wall-game-dialog wall-game-dialog--bot-mahjong"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="bot-mj-win-title"
              className="wall-game-dialog__title wall-game-dialog__title--bot-mahjong"
            >
              {postGameBotMahjongReview.winner.label} got Mah Jongg!
            </h2>
            <p className="wall-game-dialog__intro">
              Winning hand and how they won, then each other seat&apos;s result on the practice card.
            </p>
            <div className="mahjong-win__bot-winner-info">
              <span className="mahjong-win__bot-winner-hand">
                {postGameBotMahjongReview.winner.titleSegments
                  ? <CardColoredText segments={postGameBotMahjongReview.winner.titleSegments} />
                  : postGameBotMahjongReview.winner.closestTitle}
              </span>
              <span className="mahjong-win__bot-winner-how"> · Mah Jongg · Drew Own Tile</span>
              <span className="mahjong-win__bot-winner-pts">+TBD pts</span>
            </div>
            <div className="wall-game-dialog__review mahjong-win__bots-review" aria-labelledby="bot-mj-others-heading">
              <h3 id="bot-mj-others-heading" className="mahjong-win__bots-review-title">
                Other seats
              </h3>
              <ul className="mahjong-win__bots-review-list">
                {postGameBotMahjongReview.rows.map((row) => (
                  <li key={row.label} className="mahjong-win__bots-review-card">
                    <PostGameLoserRackRow
                      rowId={`bot-mj-lose-${row.label}`}
                      label={row.label}
                      bestTilesAway={row.bestTilesAway}
                      linesAtMin={row.linesAtMin}
                      rankInput={row.rankInput}
                      showTiedLinePicker={row.linesAtMin.length > 1}
                      cardVariant="flat"
                      trailingLabel="bot-mj-loss-pts"
                    />
                  </li>
                ))}
              </ul>
            </div>
            <div className="wall-game-dialog__actions">
              <button type="button" className="btn btn--primary" onClick={newHand}>
                New Game
              </button>
              <button type="button" className="btn" onClick={() => setBotMahjongWinReviewing(true)}>
                Review
              </button>
              <button type="button" className="btn" onClick={newHand}>
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

            <div className="app-dnd-frame">
              <div className="app-rack-stage">
            {/* ── Hand ── */}
            <section className="panel panel--hand" aria-label="Your hand, East">
              <div className="panel-hand-rack">
                <div className="panel-hand-rack__column">
                  {!charlestonDone ? (
                    <>
                      <div className="rack-stage rack-stage--charleston" role="group">
                        <div className="rack-stage__rack-col">
                          <div className="rack-stage__rack-top">
                            <SortableContext items={charlestonPassSortableItems} strategy={rectSortingStrategy}>
                            <ExposureRack
                              className="exposure-rack--charleston-pass"
                              stackSuitTiles
                              melds={eastExposures.map((exp) => ({
                                tiles: exp.tiles,
                                calledTileId: exp.calledTileId,
                              }))}
                              watermark={(
                                <span className="rack-logo-watermark">
                                  <span className="rack-logo-watermark__mahj">Mahj</span>
                                  <span className="rack-logo-watermark__logic">Logic</span>
                                </span>
                              )}
                              suggestedTileGuide={suggestedTileGuide}
                              slotCount={14}
                              reserveTrailingSlots={3}
                              ariaLabel="Your exposures and Charleston pass"
                              trailingSuffix={
                                <PassStrip
                                  variant="inlineTail"
                                  slots={passSlots}
                                  onPassBoxClick={onPassBoxClick}
                                  onPassTileClickReturn={onPassTileClickReturn}
                                  suggestedBestIds={suggestedTileGuide?.bestIds}
                                  flyOutFrom={passStripFlyOut}
                                  hiddenSortableTileId={null}
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
                                    selectedTileId={selectedHandTileId}
                                    onTileActivate={onHandTileActivate}
                                    highlightedTileId={drawnTileId}
                                    charlestonGlowTileIds={charlestonGlowTileIds ?? undefined}
                                    handTileFlyIn={animationsEnabled ? handTileFlyIn : null}
                                    handJokerSwapFlyInFromBelowId={
                                      animationsEnabled ? handJokerSwapFlyInFromBelowId : null
                                    }
                                    suggestedTileGuide={suggestedTileGuide}
                                    discardMode={false}
                                    animationsEnabled={animationsEnabled}
                                    rackNewMarkTileIds={rackNewMarkTileIds}
                                    jokerSwapHintBounceTileIds={jokerSwapHintBounceIds?.hand ?? null}
                                    jokerSwapHintBounceEpoch={jokerSwapHintBounceEpoch}
                                  />
                                  </SortableContext>
                                </HandBank>
                            </div>
                            <div
                              className="panel-hand-rack__charleston-actions-well"
                              ref={suggestedPopupTopAnchorCharlestonRef}
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
                              <button
                                type="button"
                                className="btn btn--rack-neutral charleston-stop-btn rack-bottom-tile-cell rack-bottom-tile-cell--c2"
                                disabled={!canUndo}
                                onClick={undoAction}
                              >
                                Undo
                              </button>
                              <div
                                className={`rack-hand-tools__wall rack-bottom-wall rack-bottom-tile-cell rack-bottom-tile-cell--c3${
                                  wall.length >= OPENING_WALL_TILES ? ' rack-bottom-wall--full' : ''
                                }${wall.length === 0 ? ' rack-bottom-wall--empty' : ''}`}
                                style={wallRemainHeatStyle(wall.length)}
                                aria-label={`${wall.length} tiles remaining in wall`}
                              >
                                {wall.length}
                              </div>
                              <div
                                ref={menuContainerRef}
                                className="app-menu-anchor app-menu-anchor--hand-rack rack-bottom-tile-cell rack-bottom-tile-cell--c4-5"
                              >
                                <button
                                  type="button"
                                  className={['btn app-bottom-center-controls__menu-btn', menuOpen ? 'app-bottom-center-controls__menu-btn--open' : ''].filter(Boolean).join(' ')}
                                  aria-label="Menu"
                                  aria-haspopup="dialog"
                                  aria-expanded={menuOpen}
                                  aria-controls={menuOpen ? 'app-menu-modal' : undefined}
                                  onClick={() => setMenuOpen((v) => !v)}
                                >
                                  Menu
                                </button>
                              </div>
                              {mahjongButtonEnabled ? (
                                <button
                                  type="button"
                                  className="btn btn--mahjong rack-bottom-tile-cell rack-bottom-tile-cell--c6-7"
                                  onClick={declareMahjong}
                                >
                                  Mah
                                  <br />
                                  Jongg
                                </button>
                              ) : null}
                              {awaitingSecondCharlestonChoice ? (
                                <button
                                  type="button"
                                  className="btn charleston-stop-btn rack-bottom-tile-cell rack-bottom-tile-cell--c9-11"
                                  aria-label="Stop Charleston: skip to courtesy pass"
                                  onClick={skipToCourtesyPass}
                                >
                                  STOP
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="btn btn--primary charleston-pass-btn rack-bottom-tile-cell rack-bottom-tile-cell--c12-14"
                                aria-label={charlestonPassDirections(charlestonPhase)}
                                disabled={!passReady || passStripFlyOut != null}
                                aria-disabled={!passReady || passStripFlyOut != null}
                                onClick={onCharlestonPassButtonClick}
                              >
                                PASS
                              </button>
                            </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="rack-stage rack-stage--main-rack">
                        <div className="rack-stage__rack-col">
                          <SortableContext items={sortableItems} strategy={rectSortingStrategy}>
                          <div className="rack-stage__rack-top">
                            <StagingMeldDropZone active={mainPhase === 'call-staging'}>
                            <EastOwnJokerSwapDropZone active={jokerSwapUiActive}>
                            <ExposureRack
                              stackSuitTiles
                              callStagingWaveFlyIn={
                                animationsEnabled ? eastCallStagedWaveFlyIn : null
                              }
                              jokerSwapHintBounceTileIds={jokerSwapHintBounceIds?.jokers ?? null}
                              jokerSwapHintBounceEpoch={jokerSwapHintBounceEpoch}
                              melds={
                                mainPhase === 'mahjong-declared' && winHandSortedTiles
                                  ? [{ tiles: winHandSortedTiles }]
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
                              suggestedTileGuide={suggestedTileGuide}
                              highlightCalledTile={mainPhase === 'call-staging'}
                              watermark={(
                                <span className="rack-logo-watermark">
                                  <span className="rack-logo-watermark__mahj">Mahj</span>
                                  <span className="rack-logo-watermark__logic">Logic</span>
                                </span>
                              )}
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
                              lastSlotReplace={
                                mainPhase === 'east-discard' ? (
                                  <EastDiscardStagingSlot
                                    enabled={charlestonDone}
                                    compact
                                    tile={pendingEastDiscardTile}
                                    onTileClickReturn={returnStagedEastDiscard}
                                    suggestBest={
                                      !!pendingEastDiscardTile &&
                                      !!suggestedTileGuide?.bestIds.has(pendingEastDiscardTile.id)
                                    }
                                    jokerSwapHintBounce={
                                      !!pendingEastDiscardTile &&
                                      !!jokerSwapHintBounceIds?.hand.has(pendingEastDiscardTile.id)
                                    }
                                    jokerSwapHintBounceEpoch={jokerSwapHintBounceEpoch}
                                  />
                                ) : null
                              }
                              firstEmptyOverride={
                                charlestonDone && mainPhase === 'bot-turn' && activeBotDiscard ? (
                                  <CallInitiateFirstEmptyTarget
                                    proximityActive={callInitiateNear}
                                    boxRef={callInitiateBoxRef}
                                  />
                                ) : undefined
                              }
                              suffix={
                                mainPhase === 'call-staging' && showCallStagingDoneButton ? (
                                  <div className="exposure-rack__slot">
                                    <button
                                      type="button"
                                      className={[
                                        'exposure-rack__call-action-btn',
                                        canCommitStagedCallDone ? 'exposure-rack__call-action-btn--done' : '',
                                      ].filter(Boolean).join(' ')}
                                      disabled={!canCommitStagedCallDone}
                                      onClick={commitStagedCall}
                                      aria-label="Commit meld and proceed to discard"
                                    >
                                      Done
                                    </button>
                                  </div>
                                ) : null
                              }
                              suffixSlotCount={mainPhase === 'call-staging' && showCallStagingDoneButton ? 1 : 0}
                            />
                            </EastOwnJokerSwapDropZone>
                            </StagingMeldDropZone>
                          </div>
                          <div className="panel-hand-rack__hand-tray">
                            {mainPhase !== 'bot-mahjong' && (
                            <div className="rack-stage__rack-bottom">
                                <HandBank>
                                  <SortableHand
                                    tiles={mainPhase === 'mahjong-declared' ? [] : visibleHandTiles}
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
                                    suggestedTileGuide={suggestedTileGuide}
                                    discardMode={false}
                                    animationsEnabled={animationsEnabled}
                                    rackNewMarkTileIds={rackNewMarkTileIds}
                                    jokerSwapHintBounceTileIds={jokerSwapHintBounceIds?.hand ?? null}
                                    jokerSwapHintBounceEpoch={jokerSwapHintBounceEpoch}
                                  />
                                </HandBank>
                            </div>
                            )}
                            {mainPhase !== 'bot-mahjong' && mainPhase !== 'dead-hand' ? (
                              <div
                                className="panel-hand-rack__action-well"
                                ref={suggestedPopupTopAnchorMainRef}
                              >
                              {mainPhase === 'wall-game' ? (
                                <div
                                  className="rack-bottom-bar rack-bottom-bar--wall-game"
                                  role="group"
                                  aria-label="Wall game actions"
                                >
                                  <button
                                    type="button"
                                    className="btn rack-bottom-tile-cell rack-bottom-tile-cell--c1-7"
                                    onClick={newHand}
                                  >
                                    Replay
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn--primary rack-bottom-tile-cell rack-bottom-tile-cell--c8-14"
                                    onClick={newHand}
                                  >
                                    New Game
                                  </button>
                                </div>
                              ) : (
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
                                <button
                                  type="button"
                                  className="btn btn--rack-neutral charleston-stop-btn rack-bottom-tile-cell rack-bottom-tile-cell--c2"
                                  disabled={!canUndo}
                                  onClick={undoAction}
                                >
                                  Undo
                                </button>
                                <div
                                  className={`rack-hand-tools__wall rack-bottom-wall rack-bottom-tile-cell rack-bottom-tile-cell--c3${
                                    wall.length >= OPENING_WALL_TILES ? ' rack-bottom-wall--full' : ''
                                  }${wall.length === 0 ? ' rack-bottom-wall--empty' : ''}`}
                                  style={wallRemainHeatStyle(wall.length)}
                                  aria-label={`${wall.length} tiles remaining in wall`}
                                >
                                  {wall.length}
                                </div>
                                <div
                                  ref={menuContainerRef}
                                  className="app-menu-anchor app-menu-anchor--hand-rack rack-bottom-tile-cell rack-bottom-tile-cell--c4-5"
                                >
                                  <button
                                    type="button"
                                    className={['btn app-bottom-center-controls__menu-btn', menuOpen ? 'app-bottom-center-controls__menu-btn--open' : ''].filter(Boolean).join(' ')}
                                    aria-label="Menu"
                                    aria-haspopup="dialog"
                                    aria-expanded={menuOpen}
                                    aria-controls={menuOpen ? 'app-menu-modal' : undefined}
                                    onClick={() => setMenuOpen((v) => !v)}
                                  >
                                    Menu
                                  </button>
                                </div>
                                <button
                                  type="button"
                                  className="btn btn--mahjong rack-bottom-tile-cell rack-bottom-tile-cell--c6-7"
                                  disabled={!mahjongButtonEnabled}
                                  onClick={declareMahjong}
                                >
                                  Mah
                                  <br />
                                  Jongg
                                </button>
                                <button
                                  type="button"
                                  className="btn btn--rack-neutral rack-bottom-tile-cell rack-bottom-tile-cell--c8-9"
                                  onClick={executeJokerSwapFromSlot}
                                >
                                  Swap
                                </button>
                                <button
                                  type="button"
                                  className={[
                                    'btn rack-bottom-tile-cell rack-bottom-tile-cell--c10-11',
                                    focusedHandIsConcealed ? 'btn--call-concealed' : '',
                                  ]
                                    .filter(Boolean)
                                    .join(' ')}
                                  disabled={mainGameCallDisabled}
                                  onClick={initiateCall}
                                >
                                  Call
                                  {focusedHandIsConcealed ? (
                                    <span
                                      className="btn--call-concealed__note"
                                      aria-label="Focused line is a concealed hand"
                                    >
                                      CONCEALED
                                    </span>
                                  ) : null}
                                </button>
                                <button
                                  type="button"
                                  className={[
                                    'btn rack-bottom-tile-cell rack-bottom-tile-cell--c12-14',
                                    mainPhase === 'east-discard' ? 'btn--discard' : '',
                                  ]
                                    .filter(Boolean)
                                    .join(' ')}
                                  disabled={mainGamePrimaryDisabled}
                                  aria-disabled={mainGamePrimaryDisabled}
                                  onClick={() => {
                                    if (mainPhase === 'east-discard') commitEastDiscard()
                                    else if (mainPhase === 'bot-turn') skipBotDiscard()
                                  }}
                                >
                                  {mainGamePrimaryLabel}
                                </button>
                              </div>
                            )}
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
                <div className="app-play-split">
                <div className="app-play-split__left">
                  <section
                    ref={discardTrackerPanelRef}
                    className="panel panel--discard-tracker"
                    aria-labelledby="discard-heading"
                  >
                    <div className="panel__title-row panel__title-row--discard-tracker">
                      <h2 id="discard-heading" className="panel__title">
                        Discard Tracker
                      </h2>
                      {botDiscardStatusLine ? (
                        <p
                          id="discard-tracker-status"
                          className="discard-tracker__status"
                          aria-live="polite"
                        >
                          {botDiscardStatusLine}
                        </p>
                      ) : null}
                    </div>
                    <div className="discard-tracker__content">
                    <DiscardPileDropZone
                      swapDropActive={jokerSwapUiActive}
                      onContainerNode={(node) => {
                        discardPileScrollElRef.current = node
                      }}
                    >
                      {displayedDiscardPile.length > 0 ? (
                        <div className="discard-pile" role="list" aria-label="Committed discards">
                          {discardTrackerEntries.map(({ tile, seat, flyAnimate }) => {
                            const needRing =
                              suggestedDiscardNeedIds != null && suggestedDiscardNeedIds.has(tile.id)
                            const isDim = suggestedDiscardPileCanDim && !needRing
                            return (
                              <div
                                key={tile.id}
                                className={[
                                  'discard-entry',
                                  `discard-entry--${seat}`,
                                  needRing ? 'discard-entry--suggest-need' : '',
                                  isDim ? 'discard-entry--suggest-dim' : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                                role="listitem"
                                aria-label={`${seat} discard`}
                              >
                                <DiscardPileFlyInTile
                                  tileId={tile.id}
                                  animate={flyAnimate}
                                  onDropInEnd={() => {
                                    popDiscardDropInId(tile.id)
                                  }}
                                >
                                  <TileFace def={tile.def} />
                                </DiscardPileFlyInTile>
                              </div>
                            )
                          })}
                        </div>
                      ) : null}
                      {mainPhase === 'east-discard' && pendingJokerSwapTileId ? (
                        <div className="discard-pile__actions">
                          <button
                            type="button"
                            className="btn btn--rack-neutral"
                            onClick={executeJokerSwapFromSlot}
                          >
                            Swap
                          </button>
                        </div>
                      ) : null}
                    </DiscardPileDropZone>
                    </div>{/* discard-tracker__content */}
                  </section>
                </div>
                <div className="app-play-split__right">
                  <div className="app-play-split__right-stack">
                    <section
                      className="panel panel--bot-exposures"
                      aria-labelledby="bot-exposures-heading"
                    >
                      <div className="panel--bot-exposures__toolbar">
                        <div
                          ref={botExposuresToolbarWellRef}
                          className="panel--bot-exposures__toolbar-well"
                        >
                          {menuInBotExposuresToolbar ? (
                            <div ref={menuContainerRef} className="app-menu-anchor" role="group" aria-label="Menu">
                              <button
                                type="button"
                                className={['btn app-bottom-center-controls__menu-btn', menuOpen ? 'app-bottom-center-controls__menu-btn--open' : ''].filter(Boolean).join(' ')}
                                aria-label="Menu"
                                aria-haspopup="dialog"
                                aria-expanded={menuOpen}
                                aria-controls={menuOpen ? 'app-menu-modal' : undefined}
                                onClick={() => setMenuOpen((v) => !v)}
                              >
                                Menu
                              </button>
                            </div>
                          ) : null}
                          {showSuggestedHandsPanel ? (
                            <div className="app-bottom-center-controls" role="group" aria-label="Suggested hands controls">
                              <button
                                type="button"
                                className={['btn', 'btn--primary', 'charleston-pass-btn', 'suggested-hands-tab', suggestedPanelHandsOn ? 'suggested-hands-tab--open' : ''].filter(Boolean).join(' ')}
                                aria-label="Suggested hands"
                                onClick={() => setSuggestedPanelHandsOn((v) => !v)}
                                aria-expanded={suggestedPanelHandsOn}
                                aria-controls="suggested-hands-popup"
                              >
                                HANDS
                              </button>
                            </div>
                          ) : null}
                          <button
                            type="button"
                            className="btn btn--rack-neutral panel--bot-exposures__clear btn--label-wrap"
                            aria-label="Clear suggested hand focus and rack highlights"
                            disabled={suggestedFocusHandKey === null}
                            onClick={() => setSuggestedFocusHandKey(null)}
                          >
                            <span className="btn__label">CLR HL</span>
                          </button>
                          <button
                            type="button"
                            className={[
                              'btn panel--bot-exposures__hint',
                              jokerSwapHintEnabled ? 'panel--bot-exposures__hint--on' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            aria-pressed={jokerSwapHintEnabled}
                            onClick={toggleJokerSwapHint}
                          >
                            HINT
                          </button>
                        </div>
                      </div>
                      <div className="panel--bot-exposures__body">
                        <div className="panel__title-row">
                          <h2 id="bot-exposures-heading" className="panel__title">
                            Bot Exposure
                          </h2>
                        </div>
                        <ul className="bot-exposures__list">
                          {BOT_RAIL_LABELS.map((label) => {
                            const melds = botExposures
                              .map((exp, globalIdx) => ({ exp, globalIdx }))
                              .filter(({ exp }) => exp.seat === label)
                              .filter(
                                ({ exp }) =>
                                  mainPhase !== 'wall-game' ||
                                  exp.tiles.length <= WALL_GAME_MAX_EXPOSURE_MELD_TILES,
                              )
                              .map(({ exp, globalIdx }) => ({
                                tiles: exp.tiles,
                                dropZoneId:
                                  jokerSwapUiActive && exp.tiles.some((t) => t.def.cat === 'joker')
                                    ? botExposureSwapDropId(globalIdx)
                                    : undefined,
                              }))
                            return (
                              <OpponentExposureDropZone
                                key={label}
                                seat={label}
                                active={jokerSwapUiActive}
                              >
                                <ExposureRack
                                  melds={melds}
                                  slotCount={12}
                                  ariaLabel={`${label} exposures`}
                                  flyInTileIds={animationsEnabled ? botExposureFlyInTileIds : null}
                                  suggestedTileGuide={botExposureSuggestedTileGuide}
                                  botJokerBorderMenuOn={false}
                                  jokerSwapHintBounceTileIds={jokerSwapHintBounceIds?.jokers ?? null}
                                  jokerSwapHintBounceEpoch={jokerSwapHintBounceEpoch}
                                />
                              </OpponentExposureDropZone>
                            )
                          })}
                        </ul>
                        <div className="panel--bot-exposures__body-fill" aria-hidden="true" />
                      </div>
                    </section>
                  </div>
                  {showSuggestedHandsPanel ? (
                    <div
                      id="suggested-hands-popup"
                      className={['suggested-hands-popup', suggestedPanelHandsOn ? 'suggested-hands-popup--open' : ''].filter(Boolean).join(' ')}
                      style={{
                        left: `calc(var(--app-h-pad) + ${suggestedPanelLeftDelta}px)`,
                        ...(suggestedPanelHeight != null
                          ? {
                              top: 'auto',
                              right: suggestedPopupRightForStyle,
                              bottom: suggestedPopupBottom ?? undefined,
                              height: suggestedPanelHeight,
                            }
                          : {
                              top: suggestedPopupTop ?? undefined,
                              right: suggestedPopupRightForStyle,
                              bottom: suggestedPopupBottom ?? undefined,
                            }),
                      }}
                      role="dialog"
                      aria-label="Suggested Hands"
                      aria-modal="false"
                      aria-hidden={!suggestedPanelHandsOn}
                    >
                      <div
                        ref={suggestedPopupRef}
                        className="suggested-hands-popup__user-shift"
                        style={
                          suggestedPanelPositionOffset.x !== 0 || suggestedPanelPositionOffset.y !== 0
                            ? {
                                transform: `translate(${suggestedPanelPositionOffset.x}px, ${suggestedPanelPositionOffset.y}px)`,
                              }
                            : undefined
                        }
                      >
                      <div
                        className="suggested-hands-popup__top-edge"
                        role="separator"
                        aria-orientation="horizontal"
                        aria-label="Drag to resize height"
                        tabIndex={-1}
                        onPointerDown={onTopEdgePointerDown}
                        onPointerMove={onDragHandlePointerMove}
                        onPointerUp={onDragHandlePointerUp}
                        onPointerCancel={onDragHandlePointerUp}
                      />
                      <div
                        className="suggested-hands-popup__drag-handle"
                        role="button"
                        aria-label="Drag to move the window. Tap without dragging to close. Drag the top or bottom margin for height, the left or right edge for width, or any corner for both."
                        tabIndex={0}
                        onPointerDown={onDragHandlePointerDown}
                        onPointerMove={onDragHandlePointerMove}
                        onPointerUp={onDragHandlePointerUp}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setSuggestedPanelHandsOn(false) } }}
                      >
                        <span className="suggested-hands-popup__drag-pip" aria-hidden="true" />
                        <span className="suggested-hands-popup__drag-label">Suggested Hands</span>
                        <div className="suggested-hands-popup__header-controls" role="toolbar" aria-label="Suggested hands display">
                          <button
                            type="button"
                            className={['hands-panel__display-toggle', suggestedHandsListOn ? 'hands-panel__display-toggle--on' : ''].filter(Boolean).join(' ')}
                            aria-pressed={suggestedHandsListOn}
                            aria-label="Show suggested hand lines"
                            onClick={(e) => { e.stopPropagation(); setSuggestedHandsListOn((v) => !v) }}
                            onPointerDown={(e) => e.stopPropagation()}
                          >
                            Hands
                          </button>
                          <button
                            type="button"
                            className={['hands-panel__display-toggle', suggestedPanelTilesOn ? 'hands-panel__display-toggle--on' : ''].filter(Boolean).join(' ')}
                            aria-pressed={suggestedPanelTilesOn}
                            aria-label="Show tile patterns"
                            onClick={(e) => { e.stopPropagation(); setSuggestedPanelTilesOn((v) => !v) }}
                            onPointerDown={(e) => e.stopPropagation()}
                          >
                            Tiles
                          </button>
                          {/* Filter trigger portalled here by SuggestedHandsPanel */}
                          <div
                            ref={setFilterButtonPortalRef}
                            className="suggested-hands-popup__filter-portal"
                            onPointerDown={(e) => e.stopPropagation()}
                          />
                        </div>
                        <button
                          type="button"
                          className="suggested-hands-popup__close"
                          aria-label="Close suggested hands"
                          onClick={(e) => { e.stopPropagation(); setSuggestedPanelHandsOn(false) }}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          ✕
                        </button>
                      </div>
                      <SuggestedHandsPanel
                        hands={eastSuggestedHands}
                        activePatternId={suggestedFocusHandKey}
                        onPatternClick={onSuggestedPatternClick}
                        onPatternDoubleClick={onSuggestedPatternDoubleClick}
                        handsListOn={suggestedHandsListOn}
                        tilesGuideOn={suggestedPanelTilesOn}
                        onHandsListOnChange={setSuggestedHandsListOn}
                        onTilesGuideOnChange={setSuggestedPanelTilesOn}
                        rackTilesForSuggestedStrip={rackForSuggestedHandsUi}
                        rackTilesForPatternMatch={rackForSuggestedPatternMatch}
                        exposureTileIdsForSuggestedStrip={suggestedHandsExposureTileIds}
                        filterButtonPortal={filterBtnPortalEl}
                        isOpen={suggestedPanelHandsOn}
                        categoryResetEpoch={suggestedCategoryResetEpoch}
                      />
                      <div
                        className="suggested-hands-popup__right-edge"
                        role="separator"
                        aria-orientation="vertical"
                        aria-label="Drag to resize width"
                        tabIndex={-1}
                        onPointerDown={onRightEdgePointerDown}
                        onPointerMove={onRightEdgePointerMove}
                        onPointerUp={onRightEdgePointerUp}
                        onPointerCancel={onRightEdgePointerUp}
                      />
                      <div
                        className="suggested-hands-popup__bottom-edge"
                        role="separator"
                        aria-orientation="horizontal"
                        aria-label="Drag to resize height from the bottom"
                        tabIndex={-1}
                        onPointerDown={onBottomEdgePointerDown}
                        onPointerMove={onDragHandlePointerMove}
                        onPointerUp={onDragHandlePointerUp}
                        onPointerCancel={onDragHandlePointerUp}
                      />
                      <div
                        className="suggested-hands-popup__left-edge"
                        role="separator"
                        aria-orientation="vertical"
                        aria-label="Drag to resize width from the left"
                        tabIndex={-1}
                        onPointerDown={onLeftEdgePointerDown}
                        onPointerMove={onLeftEdgePointerMove}
                        onPointerUp={onLeftEdgePointerUp}
                        onPointerCancel={onLeftEdgePointerUp}
                      />
                      <div
                        className="suggested-hands-popup__resize-corner suggested-hands-popup__resize-corner--tr"
                        data-suggested-resize-corner="tr"
                        role="separator"
                        aria-label="Drag to resize width and height"
                        tabIndex={-1}
                        onPointerDown={onCornerPointerDown}
                        onPointerMove={onCornerPointerMove}
                        onPointerUp={onCornerPointerUp}
                        onPointerCancel={onCornerPointerUp}
                      />
                      <div
                        className="suggested-hands-popup__resize-corner suggested-hands-popup__resize-corner--tl"
                        data-suggested-resize-corner="tl"
                        role="separator"
                        aria-label="Drag to resize width and height"
                        tabIndex={-1}
                        onPointerDown={onCornerPointerDown}
                        onPointerMove={onCornerPointerMove}
                        onPointerUp={onCornerPointerUp}
                        onPointerCancel={onCornerPointerUp}
                      />
                      <div
                        className="suggested-hands-popup__resize-corner suggested-hands-popup__resize-corner--br"
                        data-suggested-resize-corner="br"
                        role="separator"
                        aria-label="Drag to resize width and height"
                        tabIndex={-1}
                        onPointerDown={onCornerPointerDown}
                        onPointerMove={onCornerPointerMove}
                        onPointerUp={onCornerPointerUp}
                        onPointerCancel={onCornerPointerUp}
                      />
                      <div
                        className="suggested-hands-popup__resize-corner suggested-hands-popup__resize-corner--bl"
                        data-suggested-resize-corner="bl"
                        role="separator"
                        aria-label="Drag to resize width and height"
                        tabIndex={-1}
                        onPointerDown={onCornerPointerDown}
                        onPointerMove={onCornerPointerMove}
                        onPointerUp={onCornerPointerUp}
                        onPointerCancel={onCornerPointerUp}
                      />
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
              <DragOverlay dropAnimation={null}>
                {dragOverlayMeldTiles ? (
                  <div className="drag-overlay-meld">
                    {dragOverlayMeldTiles.map((tile) => (
                      <div
                        key={tile.id}
                        className={[
                          'drag-overlay-tile',
                          suggestedTileGuide?.bestIds.has(tile.id)
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
                      suggestedTileGuide?.bestIds.has(dragOverlayTile.id)
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
  )
}
