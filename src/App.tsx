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
  type DragStartEvent,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable'
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
  nextCharlestonPhase,
  type CharlestonPhase,
  type FourHands,
} from './mahjong/charleston'
import type { HandTileFlyIn, HandTileFlyInFrom } from './mahjong/handTileFlyIn'
import { handTileFlyInFromBotSeat, handTileFlyInFromCharlestonPhase } from './mahjong/handTileFlyIn'
import { SortableHand } from './components/SortableHand'
import { PassStrip } from './components/PassStrip'
import { HandBank, HAND_BANK_ID } from './components/HandBank'
import { TileFace } from './components/TileFace'
import { ExposureRack } from './components/ExposureRack'
import type { CardTextSeg } from './card/cardText'
import { PRACTICE_PATTERNS } from './card/practicePatterns'
import {
  buildPinnedPatternsFromFocusKey,
  buildSuggestedStripSlots,
  computeRackPatternHighlightIds,
  greedyPatternMatchDetail,
  isMultiComboFocusKey,
  rankSuggestedHands,
  sortHandForSuggestedPattern,
  summarizeRackTowardWin,
  type GreedyPatternMatchOpts,
  type RankSuggestedHandsInput,
  type SuggestedStripSlot,
} from './analysis/suggestedHands'
import { IllegalMahjongDialog } from './components/IllegalMahjongDialog'
import { CardColoredText } from './components/CardColoredText'
import { SuggestedHandsPanel } from './components/SuggestedHandsPanel'
import type { BotExposure, BotSeat } from './analysis/types'
import { chooseBotDiscard, botCallStrategicProbability, type BotRankContext } from './analysis/botAI'
import {
  getCallInitiateBlockMessage,
  getCallCapacityFlags,
  BLOCKING_TITLE_SWAP_ERROR,
  hasLegalMahjongOnBotDiscard,
  MSG_CALL_DEAD_JOKER,
  MSG_CALL_INSUFFICIENT_TILES,
  MSG_MAHJONG_AWAITING_BOT_DISCARD,
  MSG_MAHJONG_DURING_CHARLESTON,
  MSG_SWAP_NO_EXPOSED_JOKERS,
  MSG_SWAP_NO_LEGAL_FOR_TILE,
  MSG_SWAP_PICK_TILE_FIRST,
  simulateEastClaim,
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
  findJokerSwapTargetAtExposure,
  findJokerSwapTargetAtSeat,
  findNextJokerSwapTarget,
  parseBotSeatSwapDropId,
  parseBotExposureSwapDropId,
} from './mahjong/jokerSwapTarget'
import { openClaimMeldsFitSomePracticeLine } from './analysis/eastExposurePatternFit'
import './App.css'

const LS_KEY_BOT_WINS = 'mahjlogic.botWinsEnabled'
const LS_KEY_BOTS_CALL_EAST_DEAD = 'mahjlogic.botsCallDeadEnabled'
const LS_KEY_ANIMATIONS = 'mahjlogic.animationsEnabled'

function readBotWinsEnabledFromStorage(): boolean {
  try {
    const v = localStorage.getItem(LS_KEY_BOT_WINS)
    return v === 'true' || v === '1'
  } catch {
    return false
  }
}

function readBotsCallEastDeadFromStorage(): boolean {
  try {
    const v = localStorage.getItem(LS_KEY_BOTS_CALL_EAST_DEAD)
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

const CALL_STAGING_DROP_ID = 'call-staging-meld-drop'

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

function EastDiscardStagingSlot({
  enabled,
  compact,
  tile,
  onTileClickReturn,
  suggestBest,
}: {
  enabled: boolean
  /** Single-cell layout on the exposure rack row (vs. larger panel slot). */
  compact?: boolean
  tile: TileInstance | null
  onTileClickReturn: () => void
  /** Tile matches the focused suggested hand — show white inset ring. */
  suggestBest?: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: EAST_DISCARD_STAGING_ID,
    disabled: !enabled,
  })
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: tile?.id ?? '__east-discard-staging-empty',
    disabled: !tile,
  })
  const dragStyle: CSSProperties = {
    ...(transform ? { transform: CSS.Transform.toString(transform) } : {}),
    opacity: isDragging ? 0 : 1,
  }

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
      {tile ? (
        <div
          ref={setDragRef}
          style={dragStyle}
          className={[
            'east-discard-staging__tile',
            suggestBest ? 'east-discard-staging__tile--suggest-best' : '',
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
          <TileFace def={tile.def} elevated={isDragging} rackSuitStacked />
        </div>
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
  /** One-shot fly-in toward the rack for tiles in `ids` (cleared after animation). */
  handTileFlyIn: HandTileFlyIn | null
  /** Ids of hand tiles the player has selected to join the staged call meld (call-staging phase only). */
  stagedCallTileIds: string[]
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
    handTileFlyIn: null,
    stagedCallTileIds: [],
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
 */
function performBotPreDiscardSwaps(
  hand: TileInstance[],
  seat: Seat,
  eastExposures: EastExposure[],
  botExposures: BotExposure[],
): { hand: TileInstance[]; eastExposures: EastExposure[]; botExposures: BotExposure[] } {
  let curHand = [...hand]
  let curEast = eastExposures
  let curBots = botExposures
  for (let pass = 0; pass < 5; pass++) {
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
): BotTurnResult {
  if (wall.length === 0) {
    return { botHand, wall, discardPile, discarded: null, eastExposuresOut: eastExposures, botExposuresOut: botExposures, botMahjong: false }
  }
  const [drawn, ...wallNext] = wall
  const handWithDraw = [...botHand, drawn]
  // Redeem any jokers available in exposed melds before deciding what to discard
  const swapped = performBotPreDiscardSwaps(handWithDraw, seat, eastExposures, botExposures)
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
    pick = chooseBotDiscard(ctx)
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
/** Build the strategic context for a single bot at a given index. */
function buildBotContext(
  r: RoundState,
  botHand: TileInstance[],
  botIdx: number,
): BotRankContext {
  const botSeat = BOT_LABELS[botIdx]! as BotSeat
  return {
    hand: botHand,
    botSeat,
    wall: r.wall,
    discardPile: r.discardPile,
    eastExposures: r.eastExposures,
    botExposures: r.botExposures,
  }
}

function findBotCallOnDiscard(
  bots: [TileInstance[], TileInstance[], TileInstance[]],
  discard: TileInstance,
  r: RoundState,
): { botIndex: 0 | 1 | 2; claimType: ClaimType; matches: TileInstance[] } | null {
  for (let i = 0; i < 3; i++) {
    const ctx = buildBotContext(r, bots[i]!, i)
    const prob = botCallStrategicProbability(ctx, discard)
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
): { botIndex: 0 | 1 | 2; claimType: ClaimType; matches: TileInstance[] } | null {
  for (let step = 1; step <= 2; step++) {
    const bi = (discarderIndex + step) % 3
    const ctx = buildBotContext(r, bots[bi]!, bi)
    const prob = botCallStrategicProbability(ctx, discard)
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
    selectedHandTileId: null,
  })
}

const MAX_BOT_JOKER_SWAP_PASSES = 24

/**
 * Any bot holding the natural tile for an East exposure joker may exchange: natural
 * goes into East’s meld, joker into the bot’s hand (NMJL symmetric to East↔bot swaps).
 * Runs only in `east-discard` / `bot-turn`; repeated until no more swaps.
 */
function applyBotsJokerSwapsFromEast(r: RoundState): RoundState {
  if (
    r.mainPhase !== 'east-discard' &&
    r.mainPhase !== 'bot-turn' &&
    r.mainPhase !== 'call-staging'
  )
    return r
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
): RoundState {
  if (r.mainPhase !== 'east-discard') return r

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
  const botCall = findBotCallOnDiscard(r.bots, discardedTile, r)
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
      BOT_SEATS[botIndex]!,
      r.eastExposures,
      allBotExposuresWithNew,
    )
    botsNext[botIndex] = postCallSwap.hand
    const eastExposuresAfterCallSwap = postCallSwap.eastExposures
    const botExposuresAfterCallSwap = postCallSwap.botExposures

    // Bot discards a non-joker tile from their (now smaller) hand
    const nonJokersAfterCall = botsNext[botIndex].filter((t) => t.def.cat !== 'joker')
    const pick = nonJokersAfterCall.length > 0
      ? nonJokersAfterCall[Math.floor(Math.random() * nonJokersAfterCall.length)]!
      : botsNext[botIndex][0] // fallback: all jokers, shouldn't happen

    if (!pick) {
      // Bot can't discard (empty hand) — edge case, just advance
      const draw = autoDrawFromWall(handNext, r.wall)
      return applyBotsJokerSwapsFromEast({
        ...r,
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
  const result = runOneBotTurn(botsNext[0], r.wall, pileAfterEast, 'south', r.eastExposures, r.botExposures)
  botsNext[0] = result.botHand

  if (botWinsEnabled && result.botMahjong) {
    return {
      ...r,
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

function commitEastDiscardAfterStaged(r: RoundState, botWinsEnabled = false): RoundState {
  const staged = r.pendingEastDiscardTile
  if (!staged || r.mainPhase !== 'east-discard') return r
  if (r.hand.some((t) => t.id === staged.id)) return { ...r, pendingEastDiscardTile: null }
  return commitEastDiscardWithHand(r, staged, r.hand, botWinsEnabled)
}

/**
 * Player skips the current bot's discard.
 * Remaining bots (in turn) may claim that discard; otherwise the next bot draws and discards,
 * or East draws when all have passed.
 */
function applySkipBotDiscard(r: RoundState, botWinsEnabled = false): RoundState {
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

  const botClaim = findBotCallAfterEastSkipped(botsNext, calledTile, fromIdx, r)

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
      BOT_SEATS[callerIdx]!,
      r.eastExposures,
      allBotExposuresSkip,
    )
    botsNext[callerIdx] = postCallSwapSkip.hand
    const eastExposuresAfterSkipSwap = postCallSwapSkip.eastExposures
    const botExposuresAfterSkipSwap = postCallSwapSkip.botExposures

    const nonJokersSkip = botsNext[callerIdx]!.filter((t) => t.def.cat !== 'joker')
    const pick =
      nonJokersSkip.length > 0
        ? nonJokersSkip[Math.floor(Math.random() * nonJokersSkip.length)]!
        : botsNext[callerIdx]![0]

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
  const result = runOneBotTurn(botsNext[nextBotIndex]!, r.wall, r.discardPile, seat, r.eastExposures, r.botExposures)
  botsNext[nextBotIndex] = result.botHand

  if (botWinsEnabled && result.botMahjong) {
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

/**
 * Commit the staged meld: remove staged tiles from hand, add the exposure, return to east-discard;
 * or complete Mah Jongg on the live discard (0 staged = tile to hand only; 1 staged = pair exposure win).
 */
function applyCommitStagedCall(r: RoundState): RoundState {
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
    if (!meldOk) return { ...r, mainPhase: 'dead-hand' }
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
    const botLabel = r.activeBotIndex != null ? (BOT_LABELS[r.activeBotIndex] ?? 'Bot') : 'Bot'
    return applyBotsJokerSwapsFromEast({
      ...r,
      hand: handNext,
      discardPile: pileNext,
      eastExposures: eastMelds,
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
  // Every staged hand tile must exactly match the called tile's def or be a joker.
  // If any tile is invalid (wrong type, wrong rank) the meld is illegal → dead hand.
  const meldIsValid = stagedTiles.every(
    (t) => t.def.cat === 'joker' || tileDefsEqual(t.def, calledTile.def),
  )
  if (!meldIsValid) {
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
  return applyBotsJokerSwapsFromEast({
    ...r,
    hand: handNext,
    discardPile: pileNext,
    eastExposures: [...r.eastExposures, exposure],
    mainPhase: 'east-discard',
    activeBotIndex: null,
    activeBotDiscard: null,
    botTurnBanner: null,
    pendingEastDiscardTile: null,
    drawnTileId: null,
    selectedHandTileId: null,
    stagedCallTileIds: [],
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

function greedyMatchOptsFromClaimMelds(
  melds: ReadonlyArray<{ tiles: TileInstance[] }>,
): GreedyPatternMatchOpts | undefined {
  if (melds.length === 0) return undefined
  const exposureTileIds = new Set(melds.flatMap((e) => e.tiles).map((t) => t.id))
  return exposureTileIds.size > 0 ? { exposureTileIds } : undefined
}

export default function App() {
  const [round, setRound] = useState<RoundState>(() => createNewRound())
  const [suggestedFocusHandKey, setSuggestedFocusHandKey] = useState<string | null>(null)
  const [suggestedPanelHandsOn, setSuggestedPanelHandsOn] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuContainerRef = useRef<HTMLDivElement>(null)
  const [suggestedHandsListOn, setSuggestedHandsListOn] = useState(true)
  const [wallGameReviewing, setWallGameReviewing] = useState(false)
  const [suggestedPanelTilesOn, setSuggestedPanelTilesOn] = useState(false)
  const [filterBtnPortalEl, setFilterBtnPortalEl] = useState<HTMLDivElement | null>(null)

  // ── Game options (persisted) ──────────────────────────────────────────────
  const [botWinsEnabled, setBotWinsEnabled] = useState<boolean>(() => readBotWinsEnabledFromStorage())
  const [botsCallDeadEnabled, setBotsCallDeadEnabled] = useState<boolean>(() => readBotsCallEastDeadFromStorage())
  const [animationsEnabled, setAnimationsEnabled] = useState<boolean>(() => readAnimationsEnabledFromStorage())
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
  const toggleBotsCallDead = useCallback(() => {
    setBotsCallDeadEnabled((v) => {
      const next = !v
      try {
        localStorage.setItem(LS_KEY_BOTS_CALL_EAST_DEAD, next ? 'true' : 'false')
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
    setBotsCallDeadEnabled((prev) => {
      const b = readBotsCallEastDeadFromStorage()
      return prev === b ? prev : b
    })
    setAnimationsEnabled((prev) => {
      const a = readAnimationsEnabledFromStorage()
      return prev === a ? prev : a
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
      } else if (e.key === LS_KEY_BOTS_CALL_EAST_DEAD) {
        if (e.newValue == null) return
        const on = e.newValue === 'true' || e.newValue === '1'
        setBotsCallDeadEnabled(on)
      } else if (e.key === LS_KEY_ANIMATIONS) {
        if (e.newValue == null) return
        const on = e.newValue === 'true' || e.newValue === '1'
        setAnimationsEnabled(on)
        animationsEnabledRef.current = on
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Tracks the discard panel edges so the suggested tray docks exactly over it.
  const discardTrackerPanelRef = useRef<HTMLElement>(null)
  const [suggestedPopupTop, setSuggestedPopupTop] = useState<number | null>(null)
  const [suggestedPopupBottom, setSuggestedPopupBottom] = useState<number | null>(null)
  const [suggestedPanelHeight, setSuggestedPanelHeight] = useState<number | null>(null)
  const suggestedPopupRef = useRef<HTMLDivElement>(null)
  const dragStateRef = useRef<{ startY: number; startHeight: number; moved: boolean } | null>(null)

  const onDragHandlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    const popup = suggestedPopupRef.current
    if (!popup) return
    dragStateRef.current = { startY: e.clientY, startHeight: popup.getBoundingClientRect().height, moved: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const onDragHandlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current
    if (!drag) return
    const delta = drag.startY - e.clientY
    if (Math.abs(delta) > 4) drag.moved = true
    if (!drag.moved) return
    const minH = 120
    const maxH = window.innerHeight
    setSuggestedPanelHeight(Math.max(minH, Math.min(maxH, drag.startHeight + delta)))
  }, [])

  const onDragHandlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current
    if (!drag) return
    dragStateRef.current = null
    if (!drag.moved) {
      setSuggestedPanelHandsOn(false)
      setSuggestedPanelHeight(null)
    }
  }, [setSuggestedPanelHandsOn])
  useEffect(() => {
    const el = discardTrackerPanelRef.current
    if (!el) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      setSuggestedPopupTop(rect.top)
      setSuggestedPopupBottom(window.innerHeight - rect.bottom)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('scroll', update, { passive: true })
    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', update)
    }
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
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
    stagedCallTileIds,
    botWin,
    playerWinMethod,
  } = round
  const charlestonDone = charlestonPhase === 'done'
  const charlestonGlowTileIds = useMemo(() => {
    if (charlestonDone || charlestonNewTileIds.length === 0) return null
    return new Set(charlestonNewTileIds)
  }, [charlestonDone, charlestonNewTileIds])

  /** Natural dragged into the joker swap slot (next to discards); tap Swap — not a discard. */
  const [pendingJokerSwapTileId, setPendingJokerSwapTileId] = useState<string | null>(null)
  /** Captured viewport center of the joker's exposure slot, used to origin the draw-in animation. */
  const drawAnimOriginRef = useRef<{ x: number; y: number } | null>(null)
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
  const [passStripFlyOut, setPassStripFlyOut] = useState<HandTileFlyInFrom | null>(null)
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
    ? `${handTileFlyIn.from}:${[...handTileFlyIn.ids].sort().join(',')}`
    : ''
  useEffect(() => {
    if (!handTileFlyInKey || !handTileFlyIn) return
    const t = window.setTimeout(() => {
      setRound((r) => (r.handTileFlyIn ? { ...r, handTileFlyIn: null } : r))
    }, 420)
    return () => window.clearTimeout(t)
  }, [handTileFlyInKey])

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

  /** Bot-turn discard box: tile flies in from that seat’s direction (same 0.3s vector feel as Charleston pass fly-out). */
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

  /** Tiles in hand that exactly match the active bot's discard (used for pung/kong/quint eligibility). */
  const callMatches = useMemo(() => {
    if (!activeBotDiscard) return []
    return findExactMatches(hand, activeBotDiscard.def)
  }, [activeBotDiscard, hand])

  /** Jokers currently in hand (can substitute in any meld). */
  const handJokers = useMemo(() => hand.filter((t) => t.def.cat === 'joker'), [hand])

  const canPung  = callMatches.length + handJokers.length >= 2
  const canKong  = callMatches.length + handJokers.length >= 3
  const canQuint = callMatches.length + handJokers.length >= 4

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

  /** Hand + staged tiles + East exposures — same rack as suggested-hands strip and pattern matcher.
   *  Staged discard and pass-slot tiles are temporarily removed from `hand` but are still "in play",
   *  so include them so the guide highlight follows them into those slots. */
  const rackForSuggestedHandsUi = useMemo(
    () => [
      ...hand,
      ...(pendingEastDiscardTile ? [pendingEastDiscardTile] : []),
      ...(passSlots.filter(Boolean) as TileInstance[]),
      ...eastExposures.flatMap((e) => e.tiles),
    ],
    [hand, pendingEastDiscardTile, passSlots, eastExposures],
  )

  const suggestedHandsExposureTileIds = useMemo((): ReadonlySet<string> | undefined => {
    const ids = eastExposures.flatMap((e) => e.tiles).map((t) => t.id)
    return ids.length > 0 ? new Set(ids) : undefined
  }, [eastExposures])

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
        const rackIdSet = new Set(rackForSuggestedHandsUi.map((t) => t.id))
        const unionIds = new Set<string>()
        for (const pinnedP of pinnedPatterns) {
          const detail = greedyPatternMatchDetail(rackForSuggestedHandsUi, pinnedP, greedyUiOpts)
          if (!isMulti) {
            const ids = computeRackPatternHighlightIds(
              rackForSuggestedHandsUi,
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

    const detail = greedyPatternMatchDetail(rackForSuggestedHandsUi, p, greedyUiOpts)
    const bestIds = computeRackPatternHighlightIds(
      rackForSuggestedHandsUi,
      p,
      detail,
      suggestedHandsExposureTileIds,
    )
    return { bestIds }
  }, [suggestedFocusHandKey, mainPhase, rackForSuggestedHandsUi, suggestedHandsExposureTileIds])

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
    return BOT_LABELS.map((label, idx) => {
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
      const { bestTilesAway, closestLine } = summarizeRackTowardWin(rankInput)

      // Sort the bot's hand tiles into pattern order
      const sortedHand = closestLine
        ? sortHandForSuggestedPattern(botHand, closestLine.id, rankInput)
        : [...botHand]

      // Compute which tile ids count toward the closest hand (for lit/dim)
      let bestIds = new Set<string>()
      if (closestLine) {
        const p = PRACTICE_PATTERNS.find((x) => x.id === closestLine.id)
        if (p) {
          const rackForPattern = [...botHand, ...playerClaims.flatMap((e) => e.tiles)]
          const detail = greedyPatternMatchDetail(
            rackForPattern,
            p,
            greedyMatchOptsFromClaimMelds(playerClaims),
          )
          const rackIdSet = new Set(rackForPattern.map((t) => t.id))
          bestIds = new Set(detail.usedOrder.filter((id) => rackIdSet.has(id)))
          if (bestIds.size === 0) {
            for (const t of rackForPattern) {
              if (p.matches(t.def)) bestIds.add(t.id)
            }
          }
        }
      }

      return {
        label,
        bestTilesAway,
        section: closestLine?.section ?? '',
        cardLineNumber: closestLine?.cardLineNumber ?? null,
        titleSegments: closestLine?.titleSegments,
        closestTitle: closestLine?.title ?? '—',
        sortedHand,
        exposureGroups: playerClaims,
        bestIds,
      }
    })
  }, [mainPhase, bots, wall.length, discardTiles, botExposures, eastExposures])

  /**
   * On win: all 14 player tiles (exposed + concealed) sorted into card-pattern order
   * so they can be laid face-up in the correct hand sequence for other players to verify.
   */
  const winHandSortedTiles = useMemo(() => {
    if (mainPhase !== 'mahjong-declared') return null
    const exposedTiles = eastExposures.flatMap((e) => e.tiles)
    const allTiles = [...hand, ...exposedTiles]
    const rankInput: RankSuggestedHandsInput = {
      hand: allTiles,
      wallRemaining: wall.length,
      discards: discardTiles,
      exposures: botExposures,
      playerClaimMelds: [],
      eastTableClaimMelds: eastExposures,
    }
    const { closestLine } = summarizeRackTowardWin(rankInput)
    if (!closestLine) return allTiles
    return sortHandForSuggestedPattern(allTiles, closestLine.id, rankInput)
  }, [mainPhase, hand, eastExposures, wall.length, discardTiles, botExposures])

  /** Winning pattern info shown on the player win screen. */
  const playerWinPattern = useMemo(() => {
    if (mainPhase !== 'mahjong-declared') return null
    const exposedTiles = eastExposures.flatMap((e) => e.tiles)
    const allTiles = [...hand, ...exposedTiles]
    const rankInput: RankSuggestedHandsInput = {
      hand: allTiles,
      wallRemaining: wall.length,
      discards: discardTiles,
      exposures: botExposures,
      playerClaimMelds: [],
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
    const winnerSortedHand = winnerLine
      ? sortHandForSuggestedPattern(winnerHand, winnerLine.id, winnerRankInput)
      : [...winnerHand]
    let winnerBestIds = new Set<string>()
    if (winnerLine) {
      const p = PRACTICE_PATTERNS.find((x) => x.id === winnerLine.id)
      if (p) {
        const rack = [...winnerHand, ...winnerExposures.flatMap((e) => e.tiles)]
        const detail = greedyPatternMatchDetail(rack, p, greedyMatchOptsFromClaimMelds(winnerExposures))
        winnerBestIds = new Set(detail.usedOrder.filter((id) => rack.some((t) => t.id === id)))
      }
    }

    // Other players: East (player) + remaining bots
    type ReviewRow = { label: string; isWinner: boolean; sortedHand: TileInstance[]; exposureGroups: { tiles: TileInstance[] }[]; bestTilesAway: number; bestIds: Set<string>; closestTitle: string; titleSegments: typeof winnerLine extends { titleSegments?: infer S } ? S : undefined; section: string; cardLineNumber: number | null }
    const winner: ReviewRow = {
      label: `Bot ${botIndex + 1} (${winnerLabel})`,
      isWinner: true,
      sortedHand: winnerSortedHand,
      exposureGroups: winnerExposures,
      bestTilesAway: 0,
      bestIds: winnerBestIds,
      closestTitle: winnerLine?.title ?? '—',
      titleSegments: winnerLine?.titleSegments,
      section: winnerLine?.section ?? '',
      cardLineNumber: winnerLine?.cardLineNumber ?? null,
    }

    // East (player)
    const eastRankInput: RankSuggestedHandsInput = {
      hand,
      wallRemaining: wall.length,
      discards: discardTiles,
      exposures: botExposures,
      playerClaimMelds: eastExposures,
      eastTableClaimMelds: eastExposures,
    }
    const { bestTilesAway: eastAway, closestLine: eastLine } = summarizeRackTowardWin(eastRankInput)
    const eastSortedHand = eastLine ? sortHandForSuggestedPattern(hand, eastLine.id, eastRankInput) : [...hand]
    let eastBestIds = new Set<string>()
    if (eastLine) {
      const p = PRACTICE_PATTERNS.find((x) => x.id === eastLine.id)
      if (p) {
        const rack = [...hand, ...eastExposures.flatMap((e) => e.tiles)]
        const detail = greedyPatternMatchDetail(rack, p, greedyMatchOptsFromClaimMelds(eastExposures))
        eastBestIds = new Set(detail.usedOrder.filter((id) => rack.some((t) => t.id === id)))
      }
    }
    const eastRow: ReviewRow = {
      label: 'You (East)',
      isWinner: false,
      sortedHand: eastSortedHand,
      exposureGroups: eastExposures,
      bestTilesAway: eastAway,
      bestIds: eastBestIds,
      closestTitle: eastLine?.title ?? '—',
      titleSegments: eastLine?.titleSegments,
      section: eastLine?.section ?? '',
      cardLineNumber: eastLine?.cardLineNumber ?? null,
    }

    const otherRows = BOT_LABELS.map((label, idx) => {
      if (idx === botIndex) return null
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
      const { bestTilesAway, closestLine } = summarizeRackTowardWin(rankInput)
      const sortedHand = closestLine ? sortHandForSuggestedPattern(botHand, closestLine.id, rankInput) : [...botHand]
      let bestIds = new Set<string>()
      if (closestLine) {
        const p = PRACTICE_PATTERNS.find((x) => x.id === closestLine.id)
        if (p) {
          const rack = [...botHand, ...claims.flatMap((e) => e.tiles)]
          const detail = greedyPatternMatchDetail(rack, p, greedyMatchOptsFromClaimMelds(claims))
          bestIds = new Set(detail.usedOrder.filter((id) => rack.some((t) => t.id === id)))
        }
      }
      return {
        label: `Bot ${idx + 1} (${label})`,
        isWinner: false,
        sortedHand,
        exposureGroups: claims,
        bestTilesAway,
        bestIds,
        closestTitle: closestLine?.title ?? '—',
        titleSegments: closestLine?.titleSegments,
        section: closestLine?.section ?? '',
        cardLineNumber: closestLine?.cardLineNumber ?? null,
      } satisfies ReviewRow
    }).filter((r): r is ReviewRow => r !== null)

    return { winner, rows: [eastRow, ...otherRows], winnerLine }
  }, [mainPhase, botWin, bots, hand, wall.length, discardTiles, botExposures, eastExposures])

  /**
   * Wall game: same per-seat practice-card readout as the Mah Jongg overlays (tiles away,
   * closest line, exposures + concealed sorted). Used only in the wall-game dialog — bot
   * racks stay as called exposures on the table (no full-hand dump into the rail).
   */
  const postGameWallGameReview = useMemo(() => {
    if (mainPhase !== 'wall-game') return null

    type ReviewRow = {
      label: string
      sortedHand: TileInstance[]
      exposureGroups: { tiles: TileInstance[] }[]
      bestTilesAway: number
      bestIds: Set<string>
      closestTitle: string
      titleSegments?: CardTextSeg[]
      section: string
      cardLineNumber: number | null
    }

    const eastRankInput: RankSuggestedHandsInput = {
      hand,
      wallRemaining: wall.length,
      discards: discardTiles,
      exposures: botExposures,
      playerClaimMelds: eastExposures,
      eastTableClaimMelds: eastExposures,
    }
    const { bestTilesAway: eastAway, closestLine: eastLine } = summarizeRackTowardWin(eastRankInput)
    const eastSortedHand = eastLine ? sortHandForSuggestedPattern(hand, eastLine.id, eastRankInput) : [...hand]
    let eastBestIds = new Set<string>()
    if (eastLine) {
      const p = PRACTICE_PATTERNS.find((x) => x.id === eastLine.id)
      if (p) {
        const rack = [...hand, ...eastExposures.flatMap((e) => e.tiles)]
        const detail = greedyPatternMatchDetail(rack, p, greedyMatchOptsFromClaimMelds(eastExposures))
        eastBestIds = new Set(detail.usedOrder.filter((id) => rack.some((t) => t.id === id)))
      }
    }
    const eastRow: ReviewRow = {
      label: 'You (East)',
      sortedHand: eastSortedHand,
      exposureGroups: eastExposures,
      bestTilesAway: eastAway,
      bestIds: eastBestIds,
      closestTitle: eastLine?.title ?? '—',
      titleSegments: eastLine?.titleSegments,
      section: eastLine?.section ?? '',
      cardLineNumber: eastLine?.cardLineNumber ?? null,
    }

    const botRows: ReviewRow[] = BOT_LABELS.map((label, idx) => {
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
      const { bestTilesAway, closestLine } = summarizeRackTowardWin(rankInput)
      const sortedHand = closestLine ? sortHandForSuggestedPattern(botHand, closestLine.id, rankInput) : [...botHand]
      let bestIds = new Set<string>()
      if (closestLine) {
        const p = PRACTICE_PATTERNS.find((x) => x.id === closestLine.id)
        if (p) {
          const rack = [...botHand, ...claims.flatMap((e) => e.tiles)]
          const detail = greedyPatternMatchDetail(rack, p, greedyMatchOptsFromClaimMelds(claims))
          bestIds = new Set(detail.usedOrder.filter((id) => rack.some((t) => t.id === id)))
          if (bestIds.size === 0) {
            for (const t of rack) {
              if (p.matches(t.def)) bestIds.add(t.id)
            }
          }
        }
      }
      return {
        label: `Bot ${idx + 1} (${label})`,
        sortedHand,
        exposureGroups: claims,
        bestTilesAway,
        bestIds,
        closestTitle: closestLine?.title ?? '—',
        titleSegments: closestLine?.titleSegments,
        section: closestLine?.section ?? '',
        cardLineNumber: closestLine?.cardLineNumber ?? null,
      }
    })

    return { rows: [eastRow, ...botRows] }
  }, [mainPhase, bots, hand, wall.length, discardTiles, botExposures, eastExposures])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const [dragOverlayTile, setDragOverlayTile] = useState<TileInstance | null>(null)
  const [dragOverlayRackSuitStacked, setDragOverlayRackSuitStacked] = useState(false)

  const tileDragCollisionDetection = useMemo<CollisionDetection>(
    () => (args) => {
      const aid = String(args.active.id)
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
          const meldHit = hits.find((h) => parseBotExposureSwapDropId(String(h.id)) !== null)
          if (meldHit) return [meldHit]
          const seatHit = hits.find((h) => parseBotSeatSwapDropId(String(h.id)) !== null)
          if (seatHit) return [seatHit]
          // Pointer may be just outside the rect, but the tile visually overlaps the rack.
          // rectIntersection detects overlap between the dragged tile's rect and the drop
          // zone — matching the "when it touches the rack" expectation.
          const seatContainers = args.droppableContainers.filter(
            (c) => parseBotSeatSwapDropId(String(c.id)) !== null,
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
      const fromHand = hand.find((t) => t.id === id)
      const fromLiveBotDiscard = activeBotDiscard?.id === id
      if (fromHand || fromLiveBotDiscard) {
        setDragOverlayTile(fromHand ?? activeBotDiscard ?? null)
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
          setDragOverlayRackSuitStacked(true)
          return
        }
      }
      if (pendingEastDiscardTile?.id === id) {
        setDragOverlayTile(pendingEastDiscardTile)
        setDragOverlayRackSuitStacked(true)
        return
      }
      setDragOverlayTile(null)
      setDragOverlayRackSuitStacked(false)
    },
    [hand, passSlots, pendingEastDiscardTile, endCallInitiateTrack, charlestonDone, mainPhase, activeBotDiscard],
  )

  const onDragCancel = useCallback(() => {
    endCallInitiateTrack()
    setDragOverlayTile(null)
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

  const charlestonPassLabel: Record<string, string> = {
    right1:   'Pass 3 Right →',
    across1:  'Pass 3 Across',
    left1:    'Blind Pass 0–3 Left',
    left2:    'Pass 3 Left',
    across2:  'Pass 3 Across',
    right2:   'Blind Pass 0–3 Right',
    courtesy: 'Courtesy Pass 0–3',
  }
  const passButtonLabel = charlestonPassLabel[charlestonPhase] ?? 'Pass'

  const newHand = useCallback(() => {
    setPendingJokerSwapTileId(null)
    setCharlestonPassError(null)
    setCallRuleError(null)
    setBlockingDialog(null)
    setDragOverlayTile(null)
    setDragOverlayRackSuitStacked(false)
    setPassStripFlyOut(null)
    if (passStripFlyoutTimerRef.current) {
      clearTimeout(passStripFlyoutTimerRef.current)
      passStripFlyoutTimerRef.current = null
    }
    setWallGameReviewing(false)
    historyRef.current = []
    sortModeRef.current = null
    setCanUndo(false)
    // Menu preferences are not part of the round; keep from `localStorage` so a new hand never clears them.
    const w = readBotWinsEnabledFromStorage()
    setBotWinsEnabled((prev) => (prev === w ? prev : w))
    botWinsEnabledRef.current = w
    setBotsCallDeadEnabled((prev) => {
      const b = readBotsCallEastDeadFromStorage()
      return prev === b ? prev : b
    })
    setRound(createNewRound())
  }, [])

  const sendCharlestonPass = useCallback(() => {
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
        const nextHands = applyCharlestonExchange(phase, toFourHands(r), eastRack, 0)
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
          awaitingSecondCharlestonChoice: false,
          charlestonNewTileIds: incoming,
          handTileFlyIn:
            incoming.length > 0 && flyDir != null ? { ids: [...incoming], from: flyDir } : null,
        }
      }

      const blindOk = charlestonAllowsBlind(phase)
      if (blindOk) {
        const blindCount = 3 - eastRack.length
        if (blindCount < 0 || blindCount > 3) return r
        const nextHands = applyCharlestonExchange(phase, toFourHands(r), eastRack, blindCount)
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
      const nextHands = applyCharlestonExchange(phase, toFourHands(r), eastRack, 0)
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
    const dir = handTileFlyInFromCharlestonPhase(charlestonPhase)
    if (!dir) {
      sendCharlestonPass()
      return
    }
    if (passStripFlyoutTimerRef.current) {
      clearTimeout(passStripFlyoutTimerRef.current)
      passStripFlyoutTimerRef.current = null
    }
    setPassStripFlyOut(dir)
    passStripFlyoutTimerRef.current = window.setTimeout(() => {
      passStripFlyoutTimerRef.current = null
      setPassStripFlyOut(null)
      sendCharlestonPass()
    }, 320)
  }, [passSlots, charlestonPhase, charlestonDone, sendCharlestonPass])

  const skipToCourtesyPass = useCallback(() => {
    if (passStripFlyoutTimerRef.current) {
      clearTimeout(passStripFlyoutTimerRef.current)
      passStripFlyoutTimerRef.current = null
    }
    setPassStripFlyOut(null)
    pushRound((r) => {
      if (r.charlestonPhase !== 'left2' || !r.awaitingSecondCharlestonChoice) return r
      return {
        ...r,
        charlestonPhase: 'courtesy',
        charlestonSkippedSecondRound: true,
        awaitingSecondCharlestonChoice: false,
        passSlots: [null, null, null],
        passSlotOrigins: [null, null, null],
        selectedHandTileId: null,
      }
    })
  }, [])

  const skipBotDiscard = useCallback(() => pushRound((r) => applySkipBotDiscard(r, botWinsEnabledRef.current)), [pushRound])
  const commitEastDiscard = useCallback(() => {
    pushRound((r) => commitEastDiscardAfterStaged(r, botWinsEnabledRef.current))
  }, [pushRound])
  const returnStagedEastDiscard = useCallback(() => {
    pushRound((r) => {
      if (!r.pendingEastDiscardTile) return r
      const t = r.pendingEastDiscardTile
      const handNext = [...r.hand]
      const insertIdx = Math.min(r.pendingEastDiscardIdx ?? handNext.length, handNext.length)
      handNext.splice(insertIdx, 0, t)
      return {
        ...r,
        hand: handNext,
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

  /** Reads the center of a tile's exposure slot from the DOM before state changes it away. */
  const captureSwapOrigin = useCallback((jokerTileId: string) => {
    const el = document.querySelector<HTMLElement>(`[data-tile-id="${jokerTileId}"]`)
    if (!el) return
    const r = el.getBoundingClientRect()
    drawAnimOriginRef.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, [])

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
    captureSwapOrigin(pick.jokerTileId)
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
      const needed =
        flags.canQuint ? 4
        : flags.canKong ? 3
        : flags.canPung ? 2
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
      pushRound((r) => applyAutoSelectCallTiles(applyInitiateCall(r), needed))
    }
  }, [mainPhase, activeBotDiscard, hand, eastExposures, botExposures, wall, discardPile, pushRound])

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

  /** Auto-fill the staged meld with `needed` tiles (naturals first, then jokers). */
  const autoSelectCallMeld = useCallback((needed: number) => {
    pushRound((r) => applyAutoSelectCallTiles(r, needed))
  }, [pushRound])

  /** Commit the staged meld — removes tiles from hand and returns to east-discard. */
  const commitStagedCall = useCallback(() => {
    setCallRuleError(null)
    pushRound((r) => applyCommitStagedCall(r))
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

        if (oid === CALL_INITIATE_FIRST_SLOT_ID) {
          if (hand.some((t) => t.id === aid) || activeBotDiscard?.id === aid) {
            const block = getCallInitiateBlockMessage({
              mainPhase,
              activeBotDiscard,
              hand,
              eastExposures,
              botExposures,
              wall,
              discardPile,
            })
            if (block == null) {
              setCallEntryMagnet({ from: { ...lastDragPointerRef.current } })
            }
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

        // Drag a natural tile onto a bot exposure: try the specific meld first; if that
        // meld's joker can't be swapped with this tile, fall back to scanning every meld in
        // the same seat for the next swappable joker. Same for a seat-wide drop.
        const exposureSwapIdx = parseBotExposureSwapDropId(oid)
        const seatSwap = parseBotSeatSwapDropId(oid)
        if (jokerSwapUiActive && (exposureSwapIdx !== null || seatSwap)) {
          pushRound((r) => {
            const fromHand = r.hand.find((t) => t.id === aid)
            const fromPending = !fromHand && r.pendingEastDiscardTile?.id === aid
              ? r.pendingEastDiscardTile
              : null
            const natural = fromHand ?? fromPending
            if (!natural || natural.def.cat === 'joker') return r

            // 1) If dropped on a specific meld, try that meld first.
            let pick =
              exposureSwapIdx !== null
                ? findJokerSwapTargetAtExposure(r.botExposures, exposureSwapIdx, natural.def)
                : null
            // 2) Fall back to "next appropriate joker" anywhere in the bot's seat.
            if (!pick) {
              const seat =
                seatSwap ??
                (exposureSwapIdx !== null ? r.botExposures[exposureSwapIdx]?.seat : null) ??
                null
              if (seat) pick = findJokerSwapTargetAtSeat(r.botExposures, seat, natural.def)
            }
            if (!pick) return r
            captureSwapOrigin(pick.jokerTileId)
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
        setDragOverlayRackSuitStacked(false)
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
  // Staged tiles share the same SortableContext as hand tiles so dragging animates both zones.
  const sortableItems = mainPhase === 'call-staging'
    ? [...stagedCallTileIds, ...handIds]
    : handIds

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

  const botDiscardStatusLine =
    charlestonDone && mainPhase === 'bot-turn' && activeBotDiscard
      ? botTurnBanner
        ? `${BOT_LABELS[botTurnBanner.callerBotIndex]} called ${tileShortLabel(
            botTurnBanner.calledDef,
          )}, discarded ${tileShortLabel(activeBotDiscard.def)}`
        : `${BOT_LABELS[activeBotIndex ?? 0]} discarded ${tileShortLabel(activeBotDiscard.def)}`
      : null

  return (
    <div className="app">
      {charlestonPassError || callRuleError || blockingDialog ? (
        <div
          className="charleston-error-overlay"
          role="presentation"
          onClick={() => {
            // Warnings that require an explicit choice — backdrop click does nothing
            if (blockingDialog?.variant === 'dead-hand-warning') return
            if (blockingDialog?.variant === 'mahjong-dead-warning') return
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
                ? 'charleston-error-dialog--table charleston-error-dialog--dead-hand-warning'
                : '',
              blockingDialog?.variant === 'mahjong-dead-warning'
                ? 'charleston-error-dialog--table charleston-error-dialog--mahjong-dead-warning'
                : '',
              blockingDialog?.variant === 'mahjong-blocked'
                ? 'charleston-error-dialog--table charleston-error-dialog--mahjong-blocked'
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={
              blockingDialog?.variant === 'table' ||
              blockingDialog?.variant === 'dead-hand-warning' ||
              blockingDialog?.variant === 'mahjong-dead-warning'
                ? 'game-blocking-error-title'
                : blockingDialog?.variant === 'mahjong-blocked'
                  ? 'mj-blocked-title'
                  : 'game-blocking-error-msg'
            }
            aria-describedby={
              blockingDialog?.variant === 'table' ||
              blockingDialog?.variant === 'dead-hand-warning' ||
              blockingDialog?.variant === 'mahjong-dead-warning'
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
                  You do not have enough tiles to form a valid Pung, Kong, or Quint with this
                  discard. If you call it, your hand will be officially dead and the game will
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
              You called a tile but cannot form a valid Pung, Kong, or Quint with
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
          <div className="wall-game-dialog" onClick={(e) => e.stopPropagation()}>
            <h2 id="wall-game-title" className="wall-game-dialog__title">Wall Game</h2>
            <p className="wall-game-dialog__intro">
              The wall ran out — no one drew a winning tile. Below is each seat&apos;s closest card hand,
              tiles away, and full rack (exposures + concealed), same readout as after Mah Jongg.
            </p>
            {postGameWallGameReview ? (
              <div className="wall-game-dialog__review mahjong-win__bots-review" aria-labelledby="wall-game-review-heading">
                <h3 id="wall-game-review-heading" className="mahjong-win__bots-review-title">
                  All seats (practice card)
                </h3>
                <ul className="mahjong-win__bots-review-list">
                  {postGameWallGameReview.rows.map((row) => (
                    <li key={row.label} className="mahjong-win__bots-review-card">
                      <div className="mahjong-win__bots-review-inner">
                        <div className="mahjong-win__bots-review-header">
                          <span className="mahjong-win__bots-review-seat">{row.label}</span>
                          <span className="mahjong-win__bots-review-away">
                            {row.bestTilesAway === 0 ? '0 away' : `${row.bestTilesAway} away`}
                          </span>
                          {row.section && row.cardLineNumber != null && (
                            <span className="mahjong-win__bots-review-ref">
                              {row.section} #{row.cardLineNumber}
                            </span>
                          )}
                          <span className="mahjong-win__bots-review-pattern">
                            {row.titleSegments ? (
                              <CardColoredText segments={row.titleSegments} />
                            ) : (
                              row.closestTitle
                            )}
                          </span>
                        </div>
                        <div className="mahjong-win__bots-review-tiles">
                          {row.exposureGroups.map((exp, gi) => (
                            <div key={gi} className="mahjong-win__bots-review-meld">
                              {exp.tiles.map((tile) => (
                                <div
                                  key={tile.id}
                                  className={[
                                    'mahjong-win__bots-review-tile',
                                    row.bestIds.has(tile.id) ? '' : 'mahjong-win__bots-review-tile--dim',
                                  ]
                                    .filter(Boolean)
                                    .join(' ')}
                                >
                                  <TileFace def={tile.def} />
                                </div>
                              ))}
                            </div>
                          ))}
                          {row.sortedHand.map((tile) => (
                            <div
                              key={tile.id}
                              className={[
                                'mahjong-win__bots-review-tile',
                                row.bestIds.has(tile.id) ? '' : 'mahjong-win__bots-review-tile--dim',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                            >
                              <TileFace def={tile.def} />
                            </div>
                          ))}
                        </div>
                      </div>
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
      {charlestonDone && mainPhase === 'mahjong-declared' && (
        <div className="mahjong-win-overlay" role="dialog" aria-modal="true" aria-labelledby="mj-win-title">
          <div className="mahjong-win-dialog" onClick={(e) => e.stopPropagation()}>
            <p id="mj-win-title" className="mahjong-win__headline">Mah Jongg!</p>
            {winHandSortedTiles && (() => {
              const exposedIds = new Set(eastExposures.flatMap((e) => e.tiles.map((t) => t.id)))
              const concealedSorted = winHandSortedTiles.filter((t) => !exposedIds.has(t.id))
              return (
                <div className="mahjong-win__player-tiles">
                  {eastExposures.map((exp, gi) => (
                    <div key={gi} className="mahjong-win__bots-review-meld">
                      {exp.tiles.map((tile) => (
                        <div key={tile.id} className="mahjong-win__bots-review-tile">
                          <TileFace def={tile.def} />
                        </div>
                      ))}
                    </div>
                  ))}
                  {concealedSorted.map((tile) => (
                    <div key={tile.id} className="mahjong-win__bots-review-tile">
                      <TileFace def={tile.def} />
                    </div>
                  ))}
                </div>
              )
            })()}
            <div className="mahjong-win__player-meta">
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
              <div className="mahjong-win__bots-review" aria-labelledby="bots-review-heading">
                <h3 id="bots-review-heading" className="mahjong-win__bots-review-title">
                  Other seats (practice card)
                </h3>
                <ul className="mahjong-win__bots-review-list">
                  {postGameBotReview.map((row) => (
                    <li key={row.label} className="mahjong-win__bots-review-card">
                      <div className="mahjong-win__bots-review-inner">
                      <div className="mahjong-win__bots-review-header">
                        <span className="mahjong-win__bots-review-seat">{row.label}</span>
                        <span className="mahjong-win__bots-review-away">
                          {row.bestTilesAway === 0 ? '0 away' : `${row.bestTilesAway} away`}
                        </span>
                        {row.section && row.cardLineNumber != null && (
                          <span className="mahjong-win__bots-review-ref">
                            {row.section} #{row.cardLineNumber}
                          </span>
                        )}
                        <span className="mahjong-win__bots-review-pattern">
                          {row.titleSegments
                            ? <CardColoredText segments={row.titleSegments} />
                            : row.closestTitle}
                        </span>
                      </div>
                      <div className="mahjong-win__bots-review-tiles">
                        {row.exposureGroups.map((exp, gi) => (
                          <div key={gi} className="mahjong-win__bots-review-meld">
                            {exp.tiles.map((tile) => (
                              <div
                                key={tile.id}
                                className={[
                                  'mahjong-win__bots-review-tile',
                                  row.bestIds.has(tile.id) ? '' : 'mahjong-win__bots-review-tile--dim',
                                ].filter(Boolean).join(' ')}
                              >
                                <TileFace def={tile.def} />
                              </div>
                            ))}
                          </div>
                        ))}
                        {row.sortedHand.map((tile) => (
                          <div
                            key={tile.id}
                            className={[
                              'mahjong-win__bots-review-tile',
                              row.bestIds.has(tile.id) ? '' : 'mahjong-win__bots-review-tile--dim',
                            ].filter(Boolean).join(' ')}
                          >
                            <TileFace def={tile.def} />
                          </div>
                        ))}
                      </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="mahjong-win-dialog__actions">
              <button type="button" className="btn btn--primary mahjong-win__new-game-btn" onClick={newHand}>
                New Game
              </button>
            </div>
          </div>
        </div>
      )}
      {charlestonDone && mainPhase === 'bot-mahjong' && postGameBotMahjongReview && (
        <div className="mahjong-win-overlay mahjong-win-overlay--bot" role="dialog" aria-modal="true" aria-labelledby="bot-mj-win-title">
          <div className="mahjong-win-dialog mahjong-win-dialog--bot" onClick={(e) => e.stopPropagation()}>
            <p id="bot-mj-win-title" className="mahjong-win__headline mahjong-win__headline--bot">
              {postGameBotMahjongReview.winner.label} got Mah Jongg!
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
            <div className="mahjong-win__bots-review" aria-labelledby="bot-mj-others-heading">
              <h3 id="bot-mj-others-heading" className="mahjong-win__bots-review-title">
                Other seats
              </h3>
              <ul className="mahjong-win__bots-review-list">
                {postGameBotMahjongReview.rows.map((row) => (
                  <li key={row.label} className="mahjong-win__bots-review-card">
                    <div className="mahjong-win__bots-review-header">
                      <span className="mahjong-win__bots-review-seat">{row.label}</span>
                      <span className="mahjong-win__bots-review-away">
                        {row.bestTilesAway === 0 ? '0 away' : `${row.bestTilesAway} away`}
                      </span>
                      {row.section && row.cardLineNumber != null && (
                        <span className="mahjong-win__bots-review-ref">
                          {row.section} #{row.cardLineNumber}
                        </span>
                      )}
                      <span className="mahjong-win__bots-review-pattern">
                        {row.titleSegments
                          ? <CardColoredText segments={row.titleSegments} />
                          : row.closestTitle}
                      </span>
                      <span className="mahjong-win__bot-mj-pts">−TBD pts</span>
                    </div>
                    <div className="mahjong-win__bots-review-tiles">
                      {row.exposureGroups.map((exp, gi) => (
                        <div key={gi} className="mahjong-win__bots-review-meld">
                          {exp.tiles.map((tile) => (
                            <div
                              key={tile.id}
                              className={[
                                'mahjong-win__bots-review-tile',
                                row.bestIds.has(tile.id) ? '' : 'mahjong-win__bots-review-tile--dim',
                              ].filter(Boolean).join(' ')}
                            >
                              <TileFace def={tile.def} />
                            </div>
                          ))}
                        </div>
                      ))}
                      {row.sortedHand.map((tile) => (
                        <div
                          key={tile.id}
                          className={[
                            'mahjong-win__bots-review-tile',
                            row.bestIds.has(tile.id) ? '' : 'mahjong-win__bots-review-tile--dim',
                          ].filter(Boolean).join(' ')}
                        >
                          <TileFace def={tile.def} />
                        </div>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mahjong-win-dialog__actions">
              <button type="button" className="btn btn--primary mahjong-win__new-game-btn" onClick={newHand}>
                New Game
              </button>
            </div>
          </div>
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={tileDragCollisionDetection}
        onDragStart={onDragStart}
        onDragCancel={onDragCancel}
        onDragEnd={onDragEnd}
      >
      <div className="app-layout" data-animations={animationsEnabled ? 'on' : 'off'}>
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
                              suppressDim
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
                                />
                              }
                            />
                          </div>
                          <div className="panel-hand-rack__hand-tray">
                            <div className="rack-stage__rack-bottom">
                              <SortableContext items={handIds} strategy={rectSortingStrategy}>
                                <HandBank>
                                  <SortableHand
                                    tiles={hand}
                                    selectedTileId={selectedHandTileId}
                                    onTileActivate={onHandTileActivate}
                                    highlightedTileId={drawnTileId}
                                    charlestonGlowTileIds={charlestonGlowTileIds ?? undefined}
                                    handTileFlyIn={animationsEnabled ? handTileFlyIn : null}
                                    suggestedTileGuide={suggestedTileGuide}
                                    discardMode={false}
                                    suppressLayoutAnimation={!charlestonDone}
                                    drawAnimOriginRef={drawAnimOriginRef}
                                    animationsEnabled={animationsEnabled}
                                  />
                                </HandBank>
                              </SortableContext>
                            </div>
                            <div className="panel-hand-rack__charleston-actions-well">
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
                              {mahjongButtonEnabled ? (
                                <button
                                  type="button"
                                  className="btn btn--mahjong rack-bottom-tile-cell rack-bottom-tile-cell--c6-7"
                                  onClick={declareMahjong}
                                >
                                  Mah Jongg
                                </button>
                              ) : null}
                              {awaitingSecondCharlestonChoice ? (
                                <button
                                  type="button"
                                  className="btn charleston-stop-btn rack-bottom-tile-cell rack-bottom-tile-cell--c9-11"
                                  title="Skip the rest of the second Charleston and go to courtesy pass"
                                  onClick={skipToCourtesyPass}
                                >
                                  Stop Charleston
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="btn btn--primary charleston-pass-btn rack-bottom-tile-cell rack-bottom-tile-cell--c12-14"
                                disabled={!passReady || passStripFlyOut != null}
                                aria-disabled={!passReady || passStripFlyOut != null}
                                onClick={onCharlestonPassButtonClick}
                              >
                                {passButtonLabel}
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
                            <ExposureRack
                              stackSuitTiles
                              melds={
                                mainPhase === 'mahjong-declared' && winHandSortedTiles
                                  ? [{ tiles: winHandSortedTiles }]
                                  : mainPhase === 'bot-mahjong'
                                    ? [{ tiles: hand }]
                                  : [
                                ...(mainPhase === 'wall-game'
                                  ? eastExposures.filter(
                                      (exp) => exp.tiles.length <= WALL_GAME_MAX_EXPOSURE_MELD_TILES,
                                    )
                                  : eastExposures
                                ).map((exp) => ({
                                  tiles: exp.tiles,
                                  calledTileId: exp.calledTileId,
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
                              suppressDim
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
                                mainPhase === 'call-staging' ? (
                                  <>
                                    {/*
                                      Optional column after the pung: Kong only if a kong is possible.
                                      If not, skip this column so Done sits directly after the pung.
                                      Once 4 tiles are staged for kong, this column is omitted; Done follows the meld.
                                    */}
                                    {stagedCallTileIds.length < 3 && canKong && (
                                      <div className="exposure-rack__slot">
                                        <button
                                          type="button"
                                          className="exposure-rack__call-action-btn"
                                          onClick={() => autoSelectCallMeld(3)}
                                          aria-label="Quick-fill Kong (4 tiles)"
                                        >
                                          Kong
                                        </button>
                                      </div>
                                    )}
                                    {/* Done — next slot after pung, or after Kong column when that exists. */}
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
                                  </>
                                ) : null
                              }
                              suffixSlotCount={
                                mainPhase === 'call-staging'
                                  ? stagedCallTileIds.length < 3 && canKong
                                    ? 2
                                    : 1
                                  : 0
                              }
                            />
                            </StagingMeldDropZone>
                          </div>
                          <div className="panel-hand-rack__hand-tray">
                            {mainPhase !== 'bot-mahjong' && (
                            <div className="rack-stage__rack-bottom">
                                <HandBank>
                                  <SortableHand
                                    tiles={mainPhase === 'mahjong-declared' ? [] : visibleHandTiles}
                                    selectedTileId={
                                      mainPhase === 'east-discard' ? null : selectedHandTileId
                                    }
                                    onTileActivate={onHandTileActivate}
                                    highlightedTileId={drawnTileId}
                                    charlestonGlowTileIds={charlestonGlowTileIds ?? undefined}
                                    handTileFlyIn={animationsEnabled ? handTileFlyIn : null}
                                    suggestedTileGuide={suggestedTileGuide}
                                    discardMode={false}
                                    suppressLayoutAnimation={!charlestonDone}
                                    drawAnimOriginRef={drawAnimOriginRef}
                                    animationsEnabled={animationsEnabled}
                                  />
                                </HandBank>
                            </div>
                            )}
                            {mainPhase !== 'bot-mahjong' && mainPhase !== 'dead-hand' ? (
                              <div className="panel-hand-rack__action-well">
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
                                <button
                                  type="button"
                                  className="btn btn--mahjong rack-bottom-tile-cell rack-bottom-tile-cell--c4-5"
                                  disabled={!mahjongButtonEnabled}
                                  onClick={declareMahjong}
                                >
                                  Mah Jongg
                                </button>
                                <button
                                  type="button"
                                  className="btn btn--rack-neutral rack-bottom-tile-cell rack-bottom-tile-cell--c6-7"
                                  onClick={executeJokerSwapFromSlot}
                                >
                                  Swap
                                </button>
                                <button
                                  type="button"
                                  className="btn rack-bottom-tile-cell rack-bottom-tile-cell--c8-9"
                                  disabled={mainGameCallDisabled}
                                  onClick={initiateCall}
                                >
                                  Call
                                </button>
                                <div
                                  className="rack-hand-tools__wall rack-bottom-wall rack-bottom-tile-cell rack-bottom-tile-cell--c10"
                                  style={{ '--wall-hue': Math.round(Math.max(0, Math.min(1, wall.length / 99)) * 120) } as React.CSSProperties}
                                  aria-label={`${wall.length} tiles remaining in wall`}
                                  title="Wall tiles remaining"
                                >
                                  {wall.length}
                                </div>
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
                            {false && mainPhase === 'mahjong-declared' && (
                              <div className="mahjong-win-inlay" role="region" aria-label="Mah Jongg win">
                                <div className="mahjong-win">
                                  <p className="mahjong-win__headline">Mah Jongg!</p>
                                  {playerWinPattern ? (
                                    <p className="mahjong-win__note">
                                      {playerWinPattern.section && playerWinPattern.cardLineNumber != null
                                        ? `${playerWinPattern.section} #${playerWinPattern.cardLineNumber} · `
                                        : ''}
                                      {playerWinPattern.titleSegments
                                        ? <CardColoredText segments={playerWinPattern.titleSegments} />
                                        : playerWinPattern.title}
                                    </p>
                                  ) : (
                                    <p className="mahjong-win__note">
                                      Your hand has been validated. Review it above, then start a new game.
                                    </p>
                                  )}
                                  {postGameBotReview ? (
                                    <div className="mahjong-win__bots-review" aria-labelledby="bots-review-heading">
                                      <h3 id="bots-review-heading" className="mahjong-win__bots-review-title">
                                        Other seats (practice card)
                                      </h3>
                                      <ul className="mahjong-win__bots-review-list">
                                        {postGameBotReview.map((row) => (
                                          <li key={row.label} className="mahjong-win__bots-review-card">
                                            <div className="mahjong-win__bots-review-header">
                                              <span className="mahjong-win__bots-review-seat">{row.label}</span>
                                              <span className="mahjong-win__bots-review-away">
                                                {row.bestTilesAway === 0 ? '0 away' : `${row.bestTilesAway} away`}
                                              </span>
                                              {row.section && row.cardLineNumber != null && (
                                                <span className="mahjong-win__bots-review-ref">
                                                  {row.section} #{row.cardLineNumber}
                                                </span>
                                              )}
                                              <span className="mahjong-win__bots-review-pattern">
                                                {row.titleSegments
                                                  ? <CardColoredText segments={row.titleSegments} />
                                                  : row.closestTitle}
                                              </span>
                                            </div>
                                            <div className="mahjong-win__bots-review-tiles">
                                              {row.exposureGroups.map((exp, gi) => (
                                                <div key={gi} className="mahjong-win__bots-review-meld">
                                                  {exp.tiles.map((tile) => (
                                                    <div
                                                      key={tile.id}
                                                      className={[
                                                        'mahjong-win__bots-review-tile',
                                                        row.bestIds.has(tile.id) ? '' : 'mahjong-win__bots-review-tile--dim',
                                                      ].filter(Boolean).join(' ')}
                                                    >
                                                      <TileFace def={tile.def} />
                                                    </div>
                                                  ))}
                                                </div>
                                              ))}
                                              {row.sortedHand.map((tile) => (
                                                <div
                                                  key={tile.id}
                                                  className={[
                                                    'mahjong-win__bots-review-tile',
                                                    row.bestIds.has(tile.id) ? '' : 'mahjong-win__bots-review-tile--dim',
                                                  ].filter(Boolean).join(' ')}
                                                >
                                                  <TileFace def={tile.def} />
                                                </div>
                                              ))}
                                            </div>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  ) : null}
                                  <button type="button" className="btn btn--primary" onClick={newHand}>
                                    New Game
                                  </button>
                                </div>
                              </div>
                            )}
                            {false && mainPhase === 'bot-mahjong' && postGameBotMahjongReview && (
                              <div className="mahjong-win-inlay" role="region" aria-label="Bot Mah Jongg win">
                                <div className="mahjong-win">
                                  <p className="mahjong-win__headline mahjong-win__headline--bot">
                                    {postGameBotMahjongReview.winner.label} got Mah Jongg!
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
                                  <div className="mahjong-win__bots-review" aria-labelledby="bot-mj-others-heading">
                                    <h3 id="bot-mj-others-heading" className="mahjong-win__bots-review-title">
                                      Other seats
                                    </h3>
                                    <ul className="mahjong-win__bots-review-list">
                                      {postGameBotMahjongReview.rows.map((row) => (
                                        <li key={row.label} className="mahjong-win__bots-review-card">
                                          <div className="mahjong-win__bots-review-header">
                                            <span className="mahjong-win__bots-review-seat">{row.label}</span>
                                            <span className="mahjong-win__bots-review-away">
                                              {row.bestTilesAway === 0 ? '0 away' : `${row.bestTilesAway} away`}
                                            </span>
                                            {row.section && row.cardLineNumber != null && (
                                              <span className="mahjong-win__bots-review-ref">
                                                {row.section} #{row.cardLineNumber}
                                              </span>
                                            )}
                                            <span className="mahjong-win__bots-review-pattern">
                                              {row.titleSegments
                                                ? <CardColoredText segments={row.titleSegments} />
                                                : row.closestTitle}
                                            </span>
                                            <span className="mahjong-win__bot-mj-pts">−TBD pts</span>
                                          </div>
                                          <div className="mahjong-win__bots-review-tiles">
                                            {row.exposureGroups.map((exp, gi) => (
                                              <div key={gi} className="mahjong-win__bots-review-meld">
                                                {exp.tiles.map((tile) => (
                                                  <div
                                                    key={tile.id}
                                                    className={[
                                                      'mahjong-win__bots-review-tile',
                                                      row.bestIds.has(tile.id) ? '' : 'mahjong-win__bots-review-tile--dim',
                                                    ].filter(Boolean).join(' ')}
                                                  >
                                                    <TileFace def={tile.def} />
                                                  </div>
                                                ))}
                                              </div>
                                            ))}
                                            {row.sortedHand.map((tile) => (
                                              <div
                                                key={tile.id}
                                                className={[
                                                  'mahjong-win__bots-review-tile',
                                                  row.bestIds.has(tile.id) ? '' : 'mahjong-win__bots-review-tile--dim',
                                                ].filter(Boolean).join(' ')}
                                              >
                                                <TileFace def={tile.def} />
                                              </div>
                                            ))}
                                          </div>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                  <button type="button" className="btn btn--primary" onClick={newHand}>
                                    New Game
                                  </button>
                                </div>
                              </div>
                            )}
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
                          {displayedDiscardPile.map(({ tile, seat }) => {
                            return (
                              <div
                                key={tile.id}
                                className={[
                                  'discard-entry',
                                  `discard-entry--${seat}`,
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                                role="listitem"
                                aria-label={`${seat} discard`}
                              >
                                <TileFace def={tile.def} />
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
                        <div className="panel--bot-exposures__toolbar-well">
                          <div ref={menuContainerRef} className="app-menu-anchor" role="group" aria-label="Bottom controls">
                            {menuOpen && (
                              <div
                                className="app-menu-tray"
                                role="menu"
                              >
                                <button type="button" className="btn app-menu-tray__item" role="menuitem"
                                  onClick={() => { newHand(); setMenuOpen(false) }}>New Game</button>
                                <div className="app-menu-tray__divider" role="separator" />
                                <button
                                  type="button"
                                  className="btn app-menu-tray__item app-menu-tray__item--toggle"
                                  role="menuitemcheckbox"
                                  aria-checked={botWinsEnabled}
                                  onClick={toggleBotWins}
                                >
                                  <span className="app-menu-tray__toggle-label">Bot wins</span>
                                  <span className={['app-menu-tray__toggle-pill', botWinsEnabled ? 'app-menu-tray__toggle-pill--on' : ''].filter(Boolean).join(' ')} aria-hidden="true">
                                    {botWinsEnabled ? 'ON' : 'OFF'}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  className="btn app-menu-tray__item app-menu-tray__item--toggle"
                                  role="menuitemcheckbox"
                                  aria-checked={botsCallDeadEnabled}
                                  onClick={toggleBotsCallDead}
                                >
                                  <span className="app-menu-tray__toggle-label">Bots call East dead</span>
                                  <span className={['app-menu-tray__toggle-pill', botsCallDeadEnabled ? 'app-menu-tray__toggle-pill--on' : ''].filter(Boolean).join(' ')} aria-hidden="true">
                                    {botsCallDeadEnabled ? 'ON' : 'OFF'}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  className="btn app-menu-tray__item app-menu-tray__item--toggle"
                                  role="menuitemcheckbox"
                                  aria-checked={animationsEnabled}
                                  onClick={toggleAnimations}
                                >
                                  <span className="app-menu-tray__toggle-label">Animations</span>
                                  <span
                                    className={[
                                      'app-menu-tray__toggle-pill',
                                      animationsEnabled ? 'app-menu-tray__toggle-pill--on' : '',
                                    ]
                                      .filter(Boolean)
                                      .join(' ')}
                                    aria-hidden="true"
                                  >
                                    {animationsEnabled ? 'ON' : 'OFF'}
                                  </span>
                                </button>
                              </div>
                            )}
                            <button
                              type="button"
                              className={['btn app-bottom-center-controls__menu-btn', menuOpen ? 'app-bottom-center-controls__menu-btn--open' : ''].filter(Boolean).join(' ')}
                              aria-label="Menu"
                              aria-haspopup="menu"
                              aria-expanded={menuOpen}
                              onClick={() => setMenuOpen(v => !v)}
                            >
                              Menu
                            </button>
                          </div>
                          <button
                            type="button"
                            className="btn btn--rack-neutral panel--bot-exposures__clear"
                            disabled={suggestedFocusHandKey === null}
                            onClick={() => setSuggestedFocusHandKey(null)}
                          >
                            Clear
                          </button>
                          {showSuggestedHandsPanel ? (
                            <div className="app-bottom-center-controls" role="group" aria-label="Suggested hands controls">
                              <button
                                type="button"
                                className={['btn', 'btn--primary', 'charleston-pass-btn', 'suggested-hands-tab', suggestedPanelHandsOn ? 'suggested-hands-tab--open' : ''].filter(Boolean).join(' ')}
                                onClick={() => setSuggestedPanelHandsOn((v) => !v)}
                                aria-expanded={suggestedPanelHandsOn}
                                aria-controls="suggested-hands-popup"
                              >
                                Suggested Hands
                              </button>
                            </div>
                          ) : null}
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
                      ref={suggestedPopupRef}
                      id="suggested-hands-popup"
                      className={['suggested-hands-popup', suggestedPanelHandsOn ? 'suggested-hands-popup--open' : ''].filter(Boolean).join(' ')}
                      style={suggestedPanelHeight != null
                        ? { top: 'auto', bottom: suggestedPopupBottom ?? undefined, height: suggestedPanelHeight }
                        : { top: suggestedPopupTop ?? undefined, bottom: suggestedPopupBottom ?? undefined }}
                      role="dialog"
                      aria-label="Suggested Hands"
                      aria-modal="false"
                      aria-hidden={!suggestedPanelHandsOn}
                    >
                      {/* Drag handle — tap to close, drag to resize */}
                      <div
                        className="suggested-hands-popup__drag-handle"
                        role="button"
                        aria-label="Drag to resize, tap to close"
                        tabIndex={0}
                        onPointerDown={onDragHandlePointerDown}
                        onPointerMove={onDragHandlePointerMove}
                        onPointerUp={onDragHandlePointerUp}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setSuggestedPanelHandsOn(false); setSuggestedPanelHeight(null) } }}
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
                            ref={(el) => setFilterBtnPortalEl(el)}
                            className="suggested-hands-popup__filter-portal"
                            onPointerDown={(e) => e.stopPropagation()}
                          />
                        </div>
                        <button
                          type="button"
                          className="suggested-hands-popup__close"
                          aria-label="Close suggested hands"
                          onClick={(e) => { e.stopPropagation(); setSuggestedPanelHandsOn(false); setSuggestedPanelHeight(null) }}
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
                        exposureTileIdsForSuggestedStrip={suggestedHandsExposureTileIds}
                        filterButtonPortal={filterBtnPortalEl}
                        isOpen={suggestedPanelHandsOn}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
              <DragOverlay dropAnimation={null}>
                {dragOverlayTile ? (
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
                    <TileFace def={dragOverlayTile.def} elevated rackSuitStacked={dragOverlayRackSuitStacked} />
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
