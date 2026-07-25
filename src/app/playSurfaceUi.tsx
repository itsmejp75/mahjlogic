/** Play-surface UI helpers extracted from App.tsx (drop zones, tracker, rack chrome). */
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { useDndContext, useDroppable } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { BotExposure, BotSeat } from '../analysis/types'
import { useAppMenuOpen } from './AppMenuOpenContext'
import { useSuggestedHandsTray } from './SuggestedHandsTrayContext'
import logicLogoSrc from '../assets/logic-logo.svg?url'
import mahjBirdSrc from '../assets/mahj-bird.svg?url'
import { ExposureRack } from '../components/ExposureRack'
import { TileFace } from '../components/TileFace'
import { discardedDefsForBlankExchange } from '../mahjong/blankExchange'
import {
  BLANK_EXCHANGE_DROP_ID,
  CALL_INITIATE_FIRST_SLOT_ID,
  EAST_DISCARD_STAGING_ID,
  JOKER_SWAP_STAGING_ID,
} from '../mahjong/jokerSwapIds'
import {
  DISCARD_TRACKER_SORTED_BAND_COLS,
  DISCARD_TRACKER_SORTED_ROW_SLOTS,
  SORTED_DISCARD_ROW1_TILES,
  SORTED_DISCARD_ROW2_TILES,
  SORTED_DISCARD_ROW3_TILES,
} from '../mahjong/sortedDiscardTrackerTiles'
import {
  EAST_SEAT_SWAP_ID,
  botExposureSwapDropId,
  botSeatSwapDropId,
  type TopBandDropFrame,
} from '../mahjong/jokerSwapTarget'
import { tileAriaLabel, tileSuitRackWord } from '../mahjong/labels'
import { seatLabel, type BotSlotSeats } from '../mahjong/seats'
import { countDiscardEntriesMatchingDef, tileDefsEqual } from '../mahjong/tileUtils'
import type { DiscardEntry, Seat, TileDef, TileInstance } from '../mahjong/types'
import { useCoachLitNeighborClip } from '../useCoachLitNeighborClip'
import { countOpenHandsFittingClaimMelds } from '../analysis/eastExposurePatternFit'

export type MainPhase =
  | 'east-discard'
  | 'bot-turn'
  | 'call-staging'
  | 'mahjong-declared'
  | 'dead-hand'
  | 'wall-game'
  | 'bot-mahjong'

/** Wall game: hide bot exposure melds larger than this (matches App wall-game filter). */
export const WALL_GAME_MAX_EXPOSURE_MELD_TILES = 10

export const CALL_STAGING_DROP_ID = 'call-staging-meld-drop'

/**
 * Call drop target — only mounted while the opponent discard is being dragged out of its slot.
 * Teal box chrome matches Charleston / discard staging.
 */
export function CallInitiateFirstEmptyTarget() {
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
export function StagingMeldDropZone({
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
export function DiscardPileDropZone({
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
export function OpponentExposureDropZone({
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

/** Logic rack button — no action yet; hands tray open/close is menu-only. */
export function LogicTrayToggleButton() {
  return (
    <button
      type="button"
      className="btn btn--rack-neutral btn--logic rack-bottom-tile-cell rack-bottom-tile-cell--c7-8"
      aria-label="Logic"
    >
      <img className="btn--logic__img" src={logicLogoSrc} alt="Logic" draggable={false} />
    </button>
  )
}

/** Pins the focused hand when the Logic tray closes — context consumer so App does not subscribe. */
export function SuggestedHandsPinOnTrayClose({
  focusKeyRef,
  onClosedWithFocus,
}: {
  focusKeyRef: RefObject<string | null>
  onClosedWithFocus: (focusKey: string) => void
}) {
  const { trayOpen } = useSuggestedHandsTray()
  const prevRef = useRef(trayOpen)
  useEffect(() => {
    if (prevRef.current && !trayOpen) {
      const k = focusKeyRef.current
      if (k) onClosedWithFocus(k)
    }
    prevRef.current = trayOpen
  }, [trayOpen, focusKeyRef, onClosedWithFocus])
  return null
}

/** Re-run overlay bounds when the tray opens/closes without App subscribing to trayOpen. */
export function SuggestedHandsBoundsOnTrayChange({ onChange }: { onChange: () => void }) {
  const { trayOpen } = useSuggestedHandsTray()
  useLayoutEffect(() => {
    onChange()
  }, [trayOpen, onChange])
  return null
}

/** Bottom discard tray `data-suggested-hands-open` without App re-rendering on tray toggle. */
export function SuggestedHandsOpenDataAttr({
  elRef,
}: {
  elRef: RefObject<HTMLElement | null>
}) {
  const { trayOpen } = useSuggestedHandsTray()
  useLayoutEffect(() => {
    const el = elRef.current
    if (!el) return
    el.dataset.suggestedHandsOpen = trayOpen ? 'on' : 'off'
  }, [trayOpen, elRef])
  return null
}

/** Suggested-hands popup chrome — tray open class from context so App does not re-render on toggle. */
export function SuggestedHandsPopupChrome({
  popupRef,
  overlayStyle,
  children,
}: {
  popupRef: RefObject<HTMLDivElement | null>
  overlayStyle: CSSProperties
  children: (trayOpen: boolean) => ReactNode
}) {
  const { trayOpen } = useSuggestedHandsTray()
  return (
    <div
      ref={popupRef}
      id="suggested-hands-popup"
      className={[
        'suggested-hands-popup',
        'suggested-hands-popup--discard-overlay',
        trayOpen ? 'suggested-hands-popup--open' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="dialog"
      aria-label="Suggested Hands"
      aria-modal="false"
      aria-hidden={!trayOpen}
      style={overlayStyle}
    >
      {children(trayOpen)}
    </div>
  )
}

/** Hand / Charleston action bar: column 2 menu. Reads open state from context so toggling
 *  the menu does not re-render the surrounding play surface. */
export function HandRackMenuAnchor({
  menuContainerRef,
}: {
  menuContainerRef: RefObject<HTMLDivElement | null>
}) {
  const { menuOpen, toggleMenu } = useAppMenuOpen()
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
        onClick={toggleMenu}
      >
        Menu
      </button>
    </div>
  )
}

/** Player compass seat — centered in the well from discard-tracker bottom to main-rack top. */
export function PlayerRackSeatLabel({
  seat,
  isActiveTurn = false,
  isCalledThrower = false,
}: {
  seat: Seat
  /** Green fill — player's turn (discard / Charleston / call-staging). */
  isActiveTurn?: boolean
  /** Green inset border — someone called this seat's discard (mirrors discard-tracker bot seat labels). */
  isCalledThrower?: boolean
}) {
  return (
    <span
      className="panel-hand-rack__seat-label"
      aria-hidden
    >
      <span
        className={[
          'panel-hand-rack__seat-label__chip',
          isActiveTurn ? 'panel-hand-rack__seat-label__chip--turn' : '',
          isCalledThrower && !isActiveTurn ? 'panel-hand-rack__seat-label__chip--called' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <span className="panel-hand-rack__seat-label__chip-text">{seatLabel(seat)}</span>
      </span>
    </span>
  )
}

/** First column of the discard-tracker bot band: compass initial (S / W / N). */
export function DiscardTrackerBotSeatLabel({
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

export function SortedDiscardTrayRow({
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
  selectedDef = null,
  brightSlots = false,
  onSlotPointerDown = null,
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
  /** Blank-exchange popup: currently staged pick awaiting Confirm. */
  selectedDef?: TileDef | null
  /** Catalog / rack-checker pickers: keep every slot bright (no awaiting-discard dim). */
  brightSlots?: boolean
  /** Optional pointer-down on a pickable slot (drag-from-tracker UIs). */
  onSlotPointerDown?: ((def: TileDef, e: ReactPointerEvent<HTMLDivElement>) => void) | null
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
        const awaitingDiscard = !brightSlots && !suggestGuideOn && !hasBeenDiscarded
        const exchangeMode = onSlotActivate !== null
        // Blank→joker display slot is not redeemable in blank-exchange, but rack-checker
        // (`brightSlots`) must still allow picking the joker when blanks are off.
        const isPickable =
          exchangeMode &&
          (brightSlots || !blankReplacedByJoker) &&
          (pickableDefs?.some((d) => tileDefsEqual(d, trackerDef)) ?? false)
        const isUnpickable = exchangeMode && !isPickable
        const isSelected =
          isPickable && selectedDef != null && tileDefsEqual(selectedDef, trackerDef)
        return (
          <div
            key={tile.id}
            className={[
              'exposure-rack__slot',
              'sorted-discard-tray__slot',
              isBlankSlot && blankTilesEnabled ? 'sorted-discard-tray__slot--blank' : '',
              hasBeenDiscarded || (brightSlots && isPickable)
                ? 'sorted-discard-tray__slot--discarded'
                : '',
              awaitingDiscard ? 'sorted-discard-tray__slot--awaiting-discard' : '',
              suggestDim ? 'sorted-discard-tray__slot--suggest-dim' : '',
              suggestNeed ? 'sorted-discard-tray__slot--suggest-need' : '',
              isPickable ? 'sorted-discard-tray__slot--pickable' : '',
              isUnpickable ? 'sorted-discard-tray__slot--unpickable' : '',
              isSelected ? 'sorted-discard-tray__slot--selected' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            role={isPickable ? 'button' : 'listitem'}
            tabIndex={isPickable ? 0 : undefined}
            aria-pressed={isPickable ? isSelected : undefined}
            onClick={isPickable ? () => onSlotActivate?.(trackerDef) : undefined}
            onPointerDown={
              isPickable && onSlotPointerDown
                ? (ev) => onSlotPointerDown(trackerDef, ev)
                : undefined
            }
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
                ? brightSlots
                  ? `${tileAriaLabel(trackerDef)}${
                      discardCount > 0 ? `, ${discardCount} on rack` : ''
                    }`
                  : `${isSelected ? 'Selected — ' : ''}Exchange blank for ${tileAriaLabel(trackerDef)}${
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
              {...sortedDiscardTrayTileFaceProps(
                trackerDef,
                hasBeenDiscarded || suggestNeed || (brightSlots && isPickable),
              )}
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
export function BlankExchangeDropZone({
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

export function ArmedBlankExchangeDropZone({ children }: { children: ReactNode }) {
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
 * tracker. Tapping a discarded type stages a pick: a real rack tile + Cancel/Confirm float over
 * the center of the band while the rest of the popup blurs.
 */
export function BlankExchangeOverlay({
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
  /** Staged tracker pick — Confirm commits; Cancel closes the whole exchange. */
  const [pendingDef, setPendingDef] = useState<TileDef | null>(null)
  /** Width handed to the band grid; the `top-exposure-band` @container sizes tiles to fill it. */
  const [bandW, setBandW] = useState<number | null>(null)
  /** Width/height of the action-row Call/Swap button so Cancel/Confirm match its shape. */
  const [actionBtnSize, setActionBtnSize] = useState<{ w: number; h: number } | null>(null)
  /** Main-rack face size so the confirmation preview matches a real hand tile. */
  const [previewTileSize, setPreviewTileSize] = useState<{ w: number; h: number } | null>(null)
  /** Horizontal shift (px) so the panel centers on the playing area, not the whole viewport. */
  const [centerOffsetX, setCenterOffsetX] = useState(0)
  const confirming = pendingDef != null

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

      const handFace = document.querySelector(
        '.panel--hand .panel-hand-rack__hand-tray .sortable-tile-wrap .tile-face',
      )
      if (handFace) {
        const r = handFace.getBoundingClientRect()
        if (r.width > 1 && r.height > 1) {
          setPreviewTileSize((prev) =>
            prev && Math.abs(prev.w - r.width) < 0.5 && Math.abs(prev.h - r.height) < 0.5
              ? prev
              : { w: r.width, h: r.height },
          )
        }
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
  const actionBtnStyle: CSSProperties | undefined = actionBtnSize
    ? {
        width: actionBtnSize.w,
        height: actionBtnSize.h,
        minHeight: actionBtnSize.h,
      }
    : undefined
  // Confirmation face ~2.2× a rack tile so it fills the center of the blurred tracker band.
  // Width drives height + corner radius (0.132×w, same as main rack) so resize keeps the ratio.
  const PREVIEW_SCALE = 2.2
  const previewStyle: CSSProperties | undefined = previewTileSize
    ? (() => {
        const w = previewTileSize.w * PREVIEW_SCALE
        const h = w * (4 / 3)
        return {
          width: w,
          height: h,
          ['--rack-tile-w' as string]: `${w}px`,
          ['--rack-tile-h' as string]: `${h}px`,
          ['--tile-face-border-radius' as string]: `${w * 0.132}px`,
        }
      })()
    : undefined

  return (
    <div
      className="blank-exchange-overlay"
      role="dialog"
      aria-modal
      aria-labelledby="blank-exchange-overlay-title"
      onClick={onCancel}
    >
      <div
        className={[
          'blank-exchange-overlay__panel',
          confirming ? 'blank-exchange-overlay__panel--confirming' : '',
        ]
          .filter(Boolean)
          .join(' ')}
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
                        onSlotActivate={setPendingDef}
                        pickableDefs={pickableDefs}
                        selectedDef={pendingDef}
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
                        onSlotActivate={setPendingDef}
                        pickableDefs={pickableDefs}
                        selectedDef={pendingDef}
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
                        onSlotActivate={setPendingDef}
                        pickableDefs={pickableDefs}
                        selectedDef={pendingDef}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {pendingDef ? (
            <div
              className="blank-exchange-overlay__preview"
              style={previewStyle}
              aria-label={`Selected ${tileAriaLabel(pendingDef)}`}
            >
              <TileFace def={pendingDef} rackSuitStacked />
            </div>
          ) : null}
        </div>
        <div className="blank-exchange-overlay__actions">
          <button
            type="button"
            className="btn btn--primary rack-bottom-tile-cell blank-exchange-overlay__action-btn blank-exchange-overlay__cancel"
            onClick={confirming ? () => setPendingDef(null) : onCancel}
            style={actionBtnStyle}
          >
            Cancel
          </button>
          {pendingDef ? (
            <button
              type="button"
              className="btn btn--primary rack-bottom-tile-cell blank-exchange-overlay__action-btn blank-exchange-overlay__confirm"
              onClick={() => onPick(pendingDef)}
              style={actionBtnStyle}
            >
              Confirm
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** 3 rows: 13-column sorted discard grid (inset) + prefix + 14-column bot exposures. */
export function DiscardTrackerSlotGrid({
  discardPile,
  botExposures,
  mainPhase,
  activeBotIndex,
  calledThrowerRowIdx,
  jokerSwapUiActive,
  topBandDropFrame = null,
  animationsEnabled,
  botExposureFlyInTileIds,
  exposureJokerSwapFlyInTileIds,
  botExposureSuggestedTileGuide,
  botExposureDeadIds,
  jokerSwapHintBounceTileIds,
  jokerSwapHintBounceEpoch,
  blankTilesEnabled,
  botHandsIdentifierEnabled,
  botHandsIdentifierFocusSeat = null,
  onBotExposureRowClick,
  suggestedDiscardTrackerNeedDefs,
  botSlotSeats,
}: {
  discardPile: readonly DiscardEntry[]
  botExposures: BotExposure[]
  mainPhase: MainPhase
  activeBotIndex: number | null
  /** Seat row (0=South, 1=West, 2=North) that threw the tile currently being called. */
  calledThrowerRowIdx: number | null
  jokerSwapUiActive: boolean
  /** Yellow drop frame while dragging a blank / joker-swap natural over the top band. */
  topBandDropFrame?: TopBandDropFrame | null
  animationsEnabled: boolean
  botExposureFlyInTileIds: ReadonlySet<string> | null
  exposureJokerSwapFlyInTileIds: ReadonlySet<string> | null
  botExposureSuggestedTileGuide: { bestIds: ReadonlySet<string> } | null
  botExposureDeadIds: ReadonlySet<string> | null
  jokerSwapHintBounceTileIds: ReadonlySet<string> | null
  jokerSwapHintBounceEpoch: number
  blankTilesEnabled: boolean
  botHandsIdentifierEnabled: boolean
  /** Seat whose possible hands are shown in the tray (replaces Suggested Hands). */
  botHandsIdentifierFocusSeat?: BotSeat | null
  onBotExposureRowClick?: (seat: BotSeat) => void
  suggestedDiscardTrackerNeedDefs: readonly TileDef[] | null
  botSlotSeats: BotSlotSeats
}) {
  const botExposureSeats = useMemo(
    () => botSlotSeats.map((s) => seatLabel(s) as BotSeat),
    [botSlotSeats],
  )
  const botBandSlots =
    DISCARD_TRACKER_BOT_PREFIX_SLOTS + DISCARD_TRACKER_BOT_ROW_SLOTS
  const overlayGridRef = useRef<HTMLDivElement>(null)
  const coachGuideActive =
    !!botExposureSuggestedTileGuide?.bestIds?.size ||
    !!suggestedDiscardTrackerNeedDefs?.length
  useCoachLitNeighborClip(overlayGridRef, coachGuideActive, [
    botExposures,
    botExposureSuggestedTileGuide,
    botExposureDeadIds,
    suggestedDiscardTrackerNeedDefs,
    mainPhase,
    jokerSwapUiActive,
    animationsEnabled,
    botExposureFlyInTileIds,
    exposureJokerSwapFlyInTileIds,
    jokerSwapHintBounceTileIds,
    jokerSwapHintBounceEpoch,
  ])

  const botRowMelds = useMemo(
    () =>
      botExposureSeats.map((seat) =>
        botExposures
          .map((exp, globalIdx) => ({ exp, globalIdx }))
          .filter(({ exp }) => exp.seat === seat)
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
          })),
      ),
    [botExposureSeats, botExposures, mainPhase, jokerSwapUiActive],
  )

  const botRowPossibleOpenHandsCounts = useMemo(
    () =>
      botHandsIdentifierEnabled
        ? botRowMelds.map((melds) =>
            melds.length > 0 ? countOpenHandsFittingClaimMelds(melds) : null,
          )
        : botRowMelds.map(() => null),
    [botRowMelds, botHandsIdentifierEnabled],
  )

  return (
    <div
      ref={overlayGridRef}
      className={[
        'discard-tracker__overlay-grid',
        topBandDropFrame ? 'discard-tracker__overlay-grid--drop-frame-lit' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Discard tracker slot grid"
      style={
        {
          ['--discard-tracker-slots-across' as string]: DISCARD_TRACKER_SLOTS_ACROSS,
          ['--discard-tracker-bot-band-slots' as string]: botBandSlots,
        } as CSSProperties
      }
    >
      <div className="discard-tracker__bot-band-bird" aria-hidden="true">
        <img className="bot-exposure-rack__logo" src={mahjBirdSrc} alt="" draggable={false} />
      </div>
      {botExposureSeats.map((seat, rowIdx) => {
        const melds = botRowMelds[rowIdx] ?? []
        const rowClickable =
          botHandsIdentifierEnabled && melds.length > 0 && onBotExposureRowClick != null
        const rowActive = botHandsIdentifierFocusSeat === seat
        return (
          <div
            key={seat}
            className={[
              'discard-tracker__overlay-row',
              rowClickable ? 'discard-tracker__overlay-row--bot-hands-clickable' : '',
              rowActive ? 'discard-tracker__overlay-row--bot-hands-active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
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
              <div
                role={rowClickable ? 'button' : undefined}
                tabIndex={rowClickable ? 0 : undefined}
                aria-pressed={rowClickable ? rowActive : undefined}
                aria-label={
                  rowClickable
                    ? rowActive
                      ? `Hide ${seat} possible hands`
                      : `Show ${seat} possible hands`
                    : undefined
                }
                onClick={
                  rowClickable
                    ? (e) => {
                        e.stopPropagation()
                        onBotExposureRowClick(seat)
                      }
                    : undefined
                }
                onKeyDown={
                  rowClickable
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          e.stopPropagation()
                          onBotExposureRowClick(seat)
                        }
                      }
                    : undefined
                }
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
                  botJokerBorderMenuOn={false}
                  jokerSwapHintBounceTileIds={jokerSwapHintBounceTileIds}
                  jokerSwapHintBounceEpoch={jokerSwapHintBounceEpoch}
                  possibleOpenHandsCount={botRowPossibleOpenHandsCounts[rowIdx] ?? null}
                />
              </div>
            </OpponentExposureDropZone>
          </div>
        )
      })}
      {topBandDropFrame ? (
        <div
          className={[
            'discard-tracker__drop-frame',
            topBandDropFrame === 'joker-swap'
              ? 'discard-tracker__drop-frame--joker-swap'
              : 'discard-tracker__drop-frame--blank-exchange',
          ].join(' ')}
          aria-hidden="true"
        />
      ) : null}
    </div>
  )
}

/** East’s own exposure row: joker swap by dropping anywhere on your melds (same as a bot seat). */
export function EastOwnJokerSwapDropZone({ active, children }: { active: boolean; children: ReactNode }) {
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
export function EastDiscardStagingSortableFace({
  tile,
  suggestBest,
  suggestBlankExchange,
  suggestDim,
  jokerSwapHintBounce = false,
  jokerSwapHintBounceEpoch = 0,
  onTileClickReturn,
}: {
  tile: TileInstance
  suggestBest?: boolean
  /** Blank could be redeemed for a discard this line still needs — Simple joker yellow ring. */
  suggestBlankExchange?: boolean
  suggestDim?: boolean
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
        suggestDim ? 'east-discard-staging__tile--suggest-dim' : '',
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

export function EastDiscardStagingSlot({
  enabled,
  compact,
  tile,
  sortableSuppressed,
  onTileClickReturn,
  suggestBest,
  suggestBlankExchange,
  suggestDim,
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
  /** Tile is not needed for the focused suggested hand — dim like other unneeded rack tiles. */
  suggestDim?: boolean
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
          suggestDim={suggestDim}
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

/** When a bot claimed a discard after East skipped, or called the player's discard — drives seat-label call state. */
