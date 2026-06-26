import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from 'react'
import {
  buildConsecRanksTierStripRow,
  buildSuggestedStripSlotRowsWithVariants,
  focusKeyPatternId,
  greedyPatternMatchDetail,
  type GreedyPatternMatchOpts,
  type SuggestedStripSlot,
  suggestedHandCardRefDisplay,
  suggestedHandCardRefOrder,
} from '../analysis/suggestedHands'
import type { CardInk } from '../card/cardText'
import type { PracticePattern } from '../card/practicePatterns'
import type { TileDef, TileInstance } from '../mahjong/types'
import {
  formatDeadCauseMessage,
  splitTitleTextForDeadCause,
  stripSlotMatchesDeadCause,
  type DeadCauseHint,
} from '../mahjong/deadCauseHint'
import type { CardTextSeg } from '../card/cardText'
import type { SuggestedHandLine } from '../training/types'
import { suggestedHandSectionMenuLabel } from '../suggestedHands/filterSettings'
import { DeadCauseWarning } from './DeadCauseWarning'
import { TileFace } from './TileFace'

const TOUCH_CLICK_SUPPRESS_MS = 750
const PEEK_DRAG_THRESHOLD_PX = 10
const PEEK_DRAG_CLICK_SUPPRESS_MS = 180
/** Header tap-to-close only when press duration is below this (hold + release does not dismiss). */
const HEADER_DISMISS_MAX_MS = 350
/** Blocks pass-through + rack ghost taps while resizing the discard overlay (see part-0104.css). */
const PEEK_DRAG_SHELL_CLASS = 'suggested-hands-popup--peek-dragging'
/** Used when the sheet has not laid out yet (no measurable header/row). */
const SUGGESTED_SHEET_MIN_FALLBACK_PX = 112

type StripRowsEntry = {
  rows: SuggestedStripSlot[][]
  /** Per-row variant focus-key suffix (parallel to {@link rows}). Format:
   *  - `tier::<base>:<perm>` for suit-permute consecRanks
   *  - `oc::<r>-<s1>-<s2>` for opposing-consec
   *  Empty array when {@link rows}.length <= 1 or when the line has no flexible variants.
   */
  ocVariantSuffixes: string[]
}

/** A single concrete focus key per suggested-hand line. Tied flexible variants are split into
 * separate lines (sub-best `consecRanksTier` at line build, primary-tier flex via
 * {@link expandedHandsRows} at panel level), so this never returns a multi-combo key. */
function handEntryKeyForLine(h: SuggestedHandLine): string {
  if (h.consecRanksTier && h.consecRanksTier.combos.length > 0) {
    const c = h.consecRanksTier.combos[0]!
    return `${h.id}::tier::${c.base}:${c.perm.join('-')}`
  }
  return h.id
}

/** One concrete row in the rendered suggested-hands list. Multi-variant flex hands fan out to
 * one entry per tied variant; each entry owns its own focus key, strip, and pin key. */
type ExpandedHandsRow = {
  line: SuggestedHandLine
  focusKey: string
  /** Strip slots when "Tiles" is on; undefined otherwise (no strip rendered for the row). */
  stripSlots: SuggestedStripSlot[] | undefined
  /** Stable react key — unique across every expanded row in the list. */
  reactKey: string
  /** Pin toggle key — same as {@link focusKey} so each variant pins independently. */
  pinKey: string
}

/**
 * Minimum panel height so the discard-overlay resize always leaves the sticky header
 * plus at least one hand/tile row visible (measured from DOM).
 */
function measureMinSuggestedSheetPx(scrollRoot: HTMLElement): number {
  const sheet = scrollRoot.querySelector('.hands-sheet')
  if (sheet instanceof HTMLElement) {
    const headerCells = sheet.querySelectorAll(':scope > .hands-sheet__cell--header')
    let headerH = 0
    for (const c of headerCells) {
      if (c instanceof HTMLElement) {
        headerH = Math.max(headerH, c.getBoundingClientRect().height)
      }
    }
    const rows = sheet.querySelector('.hands-sheet__rows')
    const firstRowEl = rows?.querySelector(':scope > .hands-sheet__row')
    const rowH =
      firstRowEl instanceof HTMLElement ? firstRowEl.getBoundingClientRect().height : 52
    return Math.max(SUGGESTED_SHEET_MIN_FALLBACK_PX, Math.ceil(headerH + rowH + 8))
  }

  const freeze = scrollRoot.querySelector('.hands-list__freeze-header')
  const list = scrollRoot.querySelector('.hands-list')
  const firstListRowEl = list?.querySelector(':scope > .hands-list__row')
  if (freeze instanceof HTMLElement) {
    const fh = freeze.getBoundingClientRect().height
    const rh =
      firstListRowEl instanceof HTMLElement
        ? firstListRowEl.getBoundingClientRect().height
        : 52
    return Math.max(SUGGESTED_SHEET_MIN_FALLBACK_PX, Math.ceil(fh + rh + 8))
  }

  return SUGGESTED_SHEET_MIN_FALLBACK_PX
}

/** Points column / aria value — number only (concealed C lives on the hand line). */
function formatSuggestedHandValue(points: number): string {
  return `${points}`
}

/** Parenthetical card note (hands-only sheet shows it under the main card line, like Hands & Tiles). */
function suggestedHandParenText(h: SuggestedHandLine): string | null {
  const p = h.cardParenthesis?.trim()
  if (p) return p
  const m = h.title.match(/(\([^)]+\))/)
  return m ? m[1] : null
}

function suggestedHandPlainTitleWithoutParen(h: SuggestedHandLine): string {
  return h.title.replace(/\s*(\([^)]+\))\s*$/, '').trim() || h.title
}

/** Tiles rack-guide “lit” row — matches `.hands-list__row--rack-guide` (tiles on + row selected). */
function sheetRowLitEdge(lit: boolean, edge: 'start' | 'mid' | 'end'): string {
  if (!lit) return ''
  if (edge === 'start') return 'hands-sheet__cell--row-lit hands-sheet__cell--row-lit-start'
  if (edge === 'end') return 'hands-sheet__cell--row-lit hands-sheet__cell--row-lit-end'
  return 'hands-sheet__cell--row-lit hands-sheet__cell--row-lit-mid'
}

const SuggestedHandValueDisplay = memo(function SuggestedHandValueDisplay({
  points,
}: {
  points: number
}) {
  return <>{points}</>
})

/**
 * Suits use real rack tile colors (bamboo/dot/crak face).
 * Specific dragons (red/green/soap) always use their natural ink — title-segment ink must not
 * override a resolved dragon color (e.g. navy title ink turning a red dragon blue).
 * Flowers / winds / jokers never take suit-column red/green/navy — same as
 * `resolveCardInkForPreviewSlot` in `cardInkTileSkin.ts`. Remaining non-suit tiles use the card ink.
 */
function stripTileFaceCardInk(def: TileDef, ink: CardInk | undefined): CardInk | undefined {
  if (def.cat === 'suit') return undefined
  if (def.cat === 'dragon') {
    if (def.dragon === 'red') return 'red'
    if (def.dragon === 'green') return 'green'
    if (def.dragon === 'soap') return 'navy'
  }
  if (def.cat === 'flower') return 'rack-flower'
  if (def.cat === 'wind' || def.cat === 'joker') return 'rack-wind'
  return ink
}

const CardColoredTextWithDeadCause = memo(function CardColoredTextWithDeadCause({
  segments,
  deadCause,
}: {
  segments: CardTextSeg[]
  deadCause: DeadCauseHint | null
}) {
  return (
    <>
      {segments.map((s, i) => (
        <span key={i} className={`card-ink card-ink--${s.ink}`}>
          {deadCause
            ? splitTitleTextForDeadCause(s.t, deadCause.defs).map((part, j) =>
                part.highlight ? (
                  <span key={j} className="hands-list__title-dead-cause-run">
                    {part.text}
                  </span>
                ) : (
                  part.text
                ),
              )
            : s.t}
        </span>
      ))}
    </>
  )
})

const SuggestedHandDeadCauseBadge = memo(function SuggestedHandDeadCauseBadge({
  cause,
}: {
  cause: DeadCauseHint
}) {
  return (
    <span className="hands-list__dead-cause-badge" title={formatDeadCauseMessage(cause)}>
      <DeadCauseWarning className="hands-list__dead-cause-warn" />
      <span className="hands-list__dead-cause-reason">{formatDeadCauseMessage(cause)}</span>
    </span>
  )
})

const SuggestedHandStripTileCell = memo(function SuggestedHandStripTileCell({
  slot,
  showJokerGuide,
  suggestBest,
  dim,
  deadCauseSlot,
  classPrefix,
}: {
  slot: SuggestedStripSlot
  showJokerGuide: boolean
  suggestBest: boolean
  dim: boolean
  deadCauseSlot: boolean
  classPrefix: 'hands-sheet__tile-cell' | 'hands-list__pattern-tile-cell'
}) {
  const jokerClass =
    classPrefix === 'hands-sheet__tile-cell'
      ? 'hands-sheet__tile-cell--suggest-joker'
      : 'hands-list__pattern-tile-cell--suggest-joker'
  const bestClass =
    classPrefix === 'hands-sheet__tile-cell'
      ? 'hands-sheet__tile-cell--suggest-best'
      : 'hands-list__pattern-tile-cell--suggest-best'
  const dimClass =
    classPrefix === 'hands-sheet__tile-cell'
      ? 'hands-sheet__tile-cell--suggest-dim'
      : 'hands-list__pattern-tile-cell--suggest-dim'
  const deadClass =
    classPrefix === 'hands-sheet__tile-cell'
      ? 'hands-sheet__tile-cell--dead-cause'
      : 'hands-list__pattern-tile-cell--dead-cause'

  return (
    <div
      className={[
        classPrefix,
        showJokerGuide ? jokerClass : '',
        suggestBest ? bestClass : '',
        dim ? dimClass : '',
        deadCauseSlot ? deadClass : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <TileFace
        def={slot.displayDef}
        cardInk={stripTileFaceCardInk(slot.displayDef, slot.cardInk)}
      />
    </div>
  )
})

/**
 * Compact-mode (2-col) inline grid-template-areas.
 * Leading `pin` column matches `--hands-list-pin-w` on `.hands-list--tiles-excel`.
 */
function handsRowGridTemplateAreas(cat: boolean, tiles: boolean): string {
  if (cat) {
    if (tiles) {
      return "'pin category category away values' 'pin tiles tiles awayPad valuesPad'"
    }
    return "'pin category category away values'"
  }
  return "'pin tiles tiles away values'"
}

const SuggestedHandPinCell = memo(function SuggestedHandPinCell({
  pressed,
  pinKey,
  onPinToggle,
}: {
  pressed: boolean
  pinKey: string
  onPinToggle: (pinKey: string) => void
}) {
  return (
    <button
      type="button"
      className={['hands-suggested-pin', pressed ? 'hands-suggested-pin--pressed' : '']
        .filter(Boolean)
        .join(' ')}
      aria-label={pressed ? 'Unpin this hand from top of list' : 'Pin this hand to top of list'}
      aria-pressed={pressed}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        onPinToggle(pinKey)
      }}
    >
      <svg
        className="hands-suggested-pin__svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        aria-hidden
      >
        <path
          fill="currentColor"
          d="M16.5 3.25H7.5c-.41 0-.75.34-.75.75v.64c0 .24.12.47.32.61l1.68 1.2v5.3l-2.63 2.63a.75.75 0 0 0-.22.53V16c0 .41.34.75.75.75h4.6v4.75c0 .2.08.39.22.53l.53.53.53-.53a.75.75 0 0 0 .22-.53v-4.75h4.6c.41 0 .75-.34.75-.75v-1.09a.75.75 0 0 0-.22-.53l-2.63-2.63v-5.3l1.68-1.2c.2-.14.32-.37.32-.61V4c0-.41-.34-.75-.75-.75Z"
        />
      </svg>
    </button>
  )
})

type PatternRowInteractionProps = {
  onPointerDown: (e: PointerEvent<HTMLButtonElement>) => void
  onPointerUp: (e: PointerEvent<HTMLButtonElement>) => void
  onPointerCancel: () => void
  onClick: (e: MouseEvent<HTMLButtonElement>) => void
}

const SuggestedHandSheetTileGrid = memo(function SuggestedHandSheetTileGrid({
  slots,
  isActiveRow,
  keyPrefix,
  deadCause,
}: {
  slots: SuggestedStripSlot[]
  isActiveRow: boolean
  keyPrefix: string
  deadCause: DeadCauseHint | null
}) {
  return (
    <div className="hands-sheet__tiles-grid" role="presentation">
      {slots.map((slot, i) => {
        const showJokerGuide = isActiveRow && slot.jokerSuggested
        const suggestBest = isActiveRow && slot.highlight
        const dim = isActiveRow && !slot.highlight && !slot.jokerSuggested
        const deadCauseSlot = isActiveRow && stripSlotMatchesDeadCause(slot, deadCause)
        return (
          <SuggestedHandStripTileCell
            key={`${keyPrefix}-${i}`}
            slot={slot}
            showJokerGuide={showJokerGuide}
            suggestBest={suggestBest}
            dim={dim}
            deadCauseSlot={deadCauseSlot}
            classPrefix="hands-sheet__tile-cell"
          />
        )
      })}
    </div>
  )
})

const SuggestedHandsSheetRow = memo(function SuggestedHandsSheetRow({
  row,
  rowIsFocused,
  rowDeadCause,
  tilesGuideOn,
  isPinned,
  showPinColumn,
  bindPatternRowInteraction,
  onPinToggle,
}: {
  row: ExpandedHandsRow
  rowIsFocused: boolean
  rowDeadCause: DeadCauseHint | null
  tilesGuideOn: boolean
  isPinned: boolean
  showPinColumn: boolean
  bindPatternRowInteraction: (focusKey: string) => PatternRowInteractionProps
  onPinToggle: (pinKey: string) => void
}) {
  const h = row.line
  const rowKey = row.reactKey
  const focusKey = row.focusKey
  const rowStripSlots = row.stripSlots ?? []
  const rowLit = tilesGuideOn && rowIsFocused
  const cardRef = suggestedHandCardRefDisplay(h)
  const ariaLabel = `${suggestedHandSectionMenuLabel(h.section)} - ${cardRef}, ${h.title}, ${h.tilesNeededRough} tiles away, ${formatSuggestedHandValue(h.points)}`
  const parenText = !tilesGuideOn ? suggestedHandParenText(h) : null
  const showTileDetail = tilesGuideOn && rowStripSlots.length > 0

  return (
    <li
      className={['hands-sheet__row', rowIsFocused ? 'hands-sheet__row--active' : '']
        .filter(Boolean)
        .join(' ')}
      role="row"
    >
      {showPinColumn ? (
        <div className="hands-sheet__cell hands-sheet__cell--pin" role="cell">
          <SuggestedHandPinCell
            pressed={isPinned}
            pinKey={row.pinKey}
            onPinToggle={onPinToggle}
          />
        </div>
      ) : null}
      <button
        type="button"
        className="hands-sheet__row-btn"
        {...bindPatternRowInteraction(focusKey)}
        aria-label={ariaLabel}
        aria-pressed={rowIsFocused}
      >
        <div
          className={[
            'hands-sheet__cell hands-sheet__cell--combined hands-sheet__cell--combined-hands',
            sheetRowLitEdge(rowLit, 'start'),
          ]
            .filter(Boolean)
            .join(' ')}
          role="cell"
        >
          <span className="hands-sheet__category">
            {suggestedHandSectionMenuLabel(h.section)}
            <span className="hands-sheet__section-num"> - {cardRef}</span>
            {rowDeadCause ? <SuggestedHandDeadCauseBadge cause={rowDeadCause} /> : null}
          </span>
          <div className="hands-sheet__hand-stack" aria-label={h.title}>
            <div className="hands-sheet__hand-stack-main">
              <span className="hands-sheet__hand-title-line">
                {h.titleSegments?.length ? (
                  <>
                    <CardColoredTextWithDeadCause
                      segments={h.titleSegments}
                      deadCause={rowDeadCause}
                    />
                    {h.closed ? (
                      <span className="hands-sheet__card-c" aria-label="Concealed hand">
                        C
                      </span>
                    ) : null}
                  </>
                ) : (
                  <>
                    {parenText ? suggestedHandPlainTitleWithoutParen(h) : h.title}
                    {h.closed ? (
                      <span className="hands-sheet__card-c" aria-label="Concealed hand">
                        C
                      </span>
                    ) : null}
                  </>
                )}
              </span>
            </div>
            {showTileDetail ? (
              <div className="hands-sheet__hand-stack-detail">
                <SuggestedHandSheetTileGrid
                  slots={rowStripSlots}
                  isActiveRow={rowLit}
                  keyPrefix={rowKey}
                  deadCause={rowDeadCause}
                />
              </div>
            ) : parenText ? (
              <div className="hands-sheet__hand-stack-detail">
                <span className="hands-sheet__paren">{parenText}</span>
              </div>
            ) : null}
          </div>
        </div>
        <div
          className={[
            'hands-sheet__cell hands-sheet__cell--away',
            sheetRowLitEdge(rowLit, 'mid'),
          ]
            .filter(Boolean)
            .join(' ')}
          role="cell"
        >
          {h.tilesNeededRough}
        </div>
        <div
          className={[
            'hands-sheet__cell hands-sheet__cell--values',
            sheetRowLitEdge(rowLit, 'end'),
          ]
            .filter(Boolean)
            .join(' ')}
          role="cell"
        >
          <SuggestedHandValueDisplay points={h.points} />
        </div>
      </button>
    </li>
  )
})

const SuggestedHandsCompactListRow = memo(function SuggestedHandsCompactListRow({
  row,
  rowIsFocused,
  rowDeadCause,
  tilesGuideOn,
  handsListOn,
  showHandCategoryLabels,
  rowHitGridStyle,
  isPinned,
  showPinColumn,
  bindPatternRowInteraction,
  onPinToggle,
}: {
  row: ExpandedHandsRow
  rowIsFocused: boolean
  rowDeadCause: DeadCauseHint | null
  tilesGuideOn: boolean
  handsListOn: boolean
  showHandCategoryLabels: boolean
  rowHitGridStyle: CSSProperties
  isPinned: boolean
  showPinColumn: boolean
  bindPatternRowInteraction: (focusKey: string) => PatternRowInteractionProps
  onPinToggle: (pinKey: string) => void
}) {
  const h = row.line
  const focusKey = row.focusKey
  const rowStripSlots = row.stripSlots ?? []
  const cardRef = suggestedHandCardRefDisplay(h)
  const rowAriaLabel =
    !handsListOn || !showHandCategoryLabels
      ? `${suggestedHandSectionMenuLabel(h.section)} - ${cardRef}, ${h.title}, ${h.tilesNeededRough} tiles away, ${formatSuggestedHandValue(h.points)}`
      : undefined
  const outerClass = [
    'hands-list__row-hit',
    'hands-list__row-hit--with-tiles',
    showHandCategoryLabels ? 'hands-list__row-hit--with-category' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const liClassName = [
    'hands-list__row',
    rowIsFocused ? 'hands-list__row--active' : '',
    tilesGuideOn && rowIsFocused ? 'hands-list__row--rack-guide' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <li className={liClassName}>
      {showPinColumn ? (
        <div
          className="hands-list__cell hands-list__cell--pin"
          style={{ gridArea: 'pin' }}
        >
          <SuggestedHandPinCell
            pressed={isPinned}
            pinKey={row.pinKey}
            onPinToggle={onPinToggle}
          />
        </div>
      ) : null}
      <button
        type="button"
        className={outerClass}
        style={rowHitGridStyle}
        aria-label={rowAriaLabel}
        aria-pressed={rowIsFocused}
        aria-current={rowIsFocused ? true : undefined}
        {...bindPatternRowInteraction(focusKey)}
      >
        {showHandCategoryLabels ? (
          <div
            className={['hands-list__cell', 'hands-list__cell--category'].filter(Boolean).join(' ')}
          >
            <span className="hands-list__with-tiles-category">
              {suggestedHandSectionMenuLabel(h.section)}
              <span className="hands-list__section-num"> - {cardRef}</span>
              {rowDeadCause ? <SuggestedHandDeadCauseBadge cause={rowDeadCause} /> : null}
            </span>
            {handsListOn ? (
              <span className="hands-list__category-inline-hand" aria-label={h.title}>
                {h.titleSegments?.length ? (
                  <>
                    <CardColoredTextWithDeadCause
                      segments={h.titleSegments}
                      deadCause={rowDeadCause}
                    />
                    {h.closed ? (
                      <span className="hands-list__card-c" aria-label="Concealed hand">
                        C
                      </span>
                    ) : null}
                    {(() => {
                      const paren = h.cardParenthesis?.trim()
                      if (paren) {
                        return <span className="hands-list__paren">{paren}</span>
                      }
                      const m = h.title.match(/(\([^)]+\))/)
                      return m ? <span className="hands-list__paren">{m[1]}</span> : null
                    })()}
                  </>
                ) : (
                  <>
                    {h.title}
                    {h.closed ? (
                      <span className="hands-list__card-c" aria-label="Concealed hand">
                        C
                      </span>
                    ) : null}
                  </>
                )}
              </span>
            ) : null}
          </div>
        ) : null}
        {tilesGuideOn ? (
          <div className="hands-list__cell hands-list__cell--tiles">
            <div className="hands-list__pattern-tiles">
              {rowStripSlots.length > 0 ? (
                <div className="hands-list__pattern-tiles-grid" role="presentation">
                  {rowStripSlots.map((slot, i) => {
                    const showJokerGuide = rowIsFocused && slot.jokerSuggested
                    const suggestBestRing = rowIsFocused && slot.highlight
                    const dimPatternSlot =
                      rowIsFocused && !slot.highlight && !slot.jokerSuggested
                    const deadCauseSlot =
                      rowIsFocused && stripSlotMatchesDeadCause(slot, rowDeadCause)
                    return (
                      <SuggestedHandStripTileCell
                        key={`${row.reactKey}-${i}`}
                        slot={slot}
                        showJokerGuide={showJokerGuide}
                        suggestBest={suggestBestRing}
                        dim={dimPatternSlot}
                        deadCauseSlot={deadCauseSlot}
                        classPrefix="hands-list__pattern-tile-cell"
                      />
                    )
                  })}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {showHandCategoryLabels && tilesGuideOn ? (
          <>
            <div
              className="hands-list__cell hands-list__cell--tiles-away-pad"
              aria-hidden="true"
            />
            <div
              className="hands-list__cell hands-list__cell--tiles-values-pad"
              aria-hidden="true"
            />
          </>
        ) : null}
        <div className="hands-list__cell hands-list__cell--away">
          <span
            className="hands-list__tiles-away hands-list__tiles-away--with-tiles-col"
            aria-label={`${h.tilesNeededRough} tiles away`}
          >
            {h.tilesNeededRough}
          </span>
        </div>
        <div className="hands-list__cell hands-list__cell--values">
          <span
            className="hands-list__tiles-away hands-list__tiles-away--values-col"
            aria-label={`Hand value ${formatSuggestedHandValue(h.points)}`}
          >
            <SuggestedHandValueDisplay points={h.points} />
          </span>
        </div>
      </button>
    </li>
  )
})

type Props = {
  hands: SuggestedHandLine[]
  activePatternId: string | null
  /** Pinned suggested row keys (see {@link suggestedRowPinKey}). Toggle via {@link onPinnedPatternChange}. */
  pinnedHandKeys?: readonly string[]
  onPatternClick: (handKey: string) => void
  /** Rerank changed variant keys — migrate selection instead of clearing it. */
  onFocusKeyMigrate?: (nextKey: string | null) => void
  tilesGuideOn: boolean
  rackTilesForSuggestedStrip: TileInstance[]
  /**
   * Same ids as `rackTilesForSuggestedStrip`, but jokers in open melds use their stand-in `TileDef`
   * for greedy matching. Omit to use the display rack for both (no claim melds with jokers).
   */
  rackTilesForPatternMatch?: TileInstance[]
  /** This seat’s exposure tile ids — fixes like-numbers rank for strip layout when set. */
  exposureTileIdsForSuggestedStrip?: ReadonlySet<string>
  /** Section names turned off in the app menu (not listed here ⇒ all sections from the card may show). */
  uncheckedSections: Set<string>
  /** When true, omit hands marked concealed (C) from the suggested list. */
  hideConcealedHands: boolean
  /** Active card book — pattern lookup and section order for this deal. */
  cardPatterns: PracticePattern[]
  /** Section order on the active card (same semantics as built-in practice card order). */
  cardSectionOrder: readonly string[]
  /**
   * When true, this panel sits inside the discard-tray overlay shell: adds the tray surface
   * class (`suggested-hands-popup__user-shift`) on the root `section`. Motion and dialog chrome
   * live on the parent `.suggested-hands-popup` wrapper in `App`.
   */
  discardTraySurface?: boolean
  /**
   * When set (discard-tray overlay), a click on the sticky column-header row dismisses the tray.
   */
  onTrayHeaderClick?: () => void
  /** Current top “peek” height in px — empty strip above the sheet (shows discards). */
  discardOverlayPeekPx?: number
  /** Updates peek while dragging the header; measure ref must be the overlay shell (`#suggested-hands-popup`). */
  onDiscardOverlayPeekPxChange?: (px: number) => void
  discardOverlayMeasureRef?: RefObject<HTMLElement | null>
  /** Toggle whether `handKey` is pinned (add/remove from {@link pinnedHandKeys}). */
  onPinnedPatternChange?: (handKey: string) => void
  /** Per focus key: why the line is no longer completable (dead tile hint). */
  deadCauseByFocusKey?: Readonly<Record<string, DeadCauseHint>>
}

export const SuggestedHandsPanel = memo(function SuggestedHandsPanel({
  hands,
  activePatternId,
  pinnedHandKeys = [],
  onPatternClick,
  onFocusKeyMigrate,
  tilesGuideOn,
  rackTilesForSuggestedStrip,
  rackTilesForPatternMatch,
  exposureTileIdsForSuggestedStrip,
  uncheckedSections,
  hideConcealedHands,
  cardPatterns,
  cardSectionOrder,
  discardTraySurface,
  onTrayHeaderClick,
  discardOverlayPeekPx = 0,
  onDiscardOverlayPeekPxChange,
  discardOverlayMeasureRef,
  onPinnedPatternChange,
  deadCauseByFocusKey = {},
}: Props) {
  const pinnedKeySet = useMemo(() => new Set(pinnedHandKeys), [pinnedHandKeys])
  const sections = useMemo(() => {
    const uniq = Array.from(new Set(hands.map((h) => h.section)))
    const rank = new Map(cardSectionOrder.map((s, i) => [s, i]))
    return uniq.sort((a, b) => {
      const ra = rank.get(a)
      const rb = rank.get(b)
      if (ra !== undefined && rb !== undefined) return ra - rb
      if (ra !== undefined) return -1
      if (rb !== undefined) return 1
      return a.localeCompare(b)
    })
  }, [hands, cardSectionOrder])

  const checkedSections = useMemo(
    () => new Set(sections.filter((s) => !uncheckedSections.has(s))),
    [sections, uncheckedSections],
  )
  const peekDragRef = useRef<{
    pointerId: number
    startY: number
    startPeek: number
  } | null>(null)
  const headerPointerSlopRef = useRef(false)
  /** Pointerdown target when a discard-overlay header peek-drag may start (used for tap-to-dismiss). */
  const headerPointerDownTargetRef = useRef<Element | null>(null)
  const headerPointerDownAtRef = useRef(0)
  const suppressHeaderClickUntilRef = useRef(0)
  const peekDragShellSuppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const peekDragWindowCleanupRef = useRef<(() => void) | null>(null)
  const discardOverlayPeekRef = useRef(discardOverlayPeekPx)
  useEffect(() => {
    discardOverlayPeekRef.current = discardOverlayPeekPx
  }, [discardOverlayPeekPx])

  const handsListScrollRef = useRef<HTMLDivElement>(null)
  const minSheetHeightPxRef = useRef(SUGGESTED_SHEET_MIN_FALLBACK_PX)

  const syncPeekDragShellBlock = useCallback(
    (mode: 'active' | 'suppress' | 'off') => {
      const shell = discardOverlayMeasureRef?.current
      if (!shell) return
      if (peekDragShellSuppressTimerRef.current != null) {
        clearTimeout(peekDragShellSuppressTimerRef.current)
        peekDragShellSuppressTimerRef.current = null
      }
      if (mode === 'active' || mode === 'suppress') {
        shell.classList.add(PEEK_DRAG_SHELL_CLASS)
      } else {
        shell.classList.remove(PEEK_DRAG_SHELL_CLASS)
      }
      if (mode === 'suppress') {
        peekDragShellSuppressTimerRef.current = setTimeout(() => {
          shell.classList.remove(PEEK_DRAG_SHELL_CLASS)
          peekDragShellSuppressTimerRef.current = null
        }, PEEK_DRAG_CLICK_SUPPRESS_MS)
      }
    },
    [discardOverlayMeasureRef],
  )

  useEffect(
    () => () => {
      syncPeekDragShellBlock('off')
    },
    [syncPeekDragShellBlock],
  )

  const detachPeekDragWindowListeners = useCallback(() => {
    peekDragWindowCleanupRef.current?.()
    peekDragWindowCleanupRef.current = null
  }, [])

  const finishPeekDrag = useCallback(
    (e: PointerEvent<HTMLDivElement> | globalThis.PointerEvent) => {
      const d = peekDragRef.current
      if (!d || e.pointerId !== d.pointerId) return
      detachPeekDragWindowListeners()
      const downTarget = headerPointerDownTargetRef.current
      headerPointerDownTargetRef.current = null
      peekDragRef.current = null
      const hadSlop = headerPointerSlopRef.current
      const pressMs = performance.now() - headerPointerDownAtRef.current
      const isHeaderRelease =
        downTarget instanceof Element &&
        !downTarget.closest('.hands-suggested-pin') &&
        !downTarget.closest('button') &&
        (downTarget.closest('.hands-list__freeze-header') ||
          downTarget.closest('.hands-sheet__cell--header'))
      const isHeaderDismissTap =
        onTrayHeaderClick &&
        !hadSlop &&
        isHeaderRelease &&
        pressMs <= HEADER_DISMISS_MAX_MS
      if (hadSlop || isHeaderRelease) {
        suppressHeaderClickUntilRef.current = performance.now() + PEEK_DRAG_CLICK_SUPPRESS_MS
        e.preventDefault()
        syncPeekDragShellBlock('suppress')
      } else {
        syncPeekDragShellBlock('off')
      }
      headerPointerSlopRef.current = false
      const scrollEl = handsListScrollRef.current
      try {
        scrollEl?.releasePointerCapture(e.pointerId)
      } catch {
        /* capture already released */
      }
      if (isHeaderDismissTap) {
        onTrayHeaderClick()
      }
    },
    [detachPeekDragWindowListeners, onTrayHeaderClick, syncPeekDragShellBlock],
  )

  const attachPeekDragWindowListeners = useCallback(() => {
    detachPeekDragWindowListeners()
    const onWindowPointerEnd = (ev: globalThis.PointerEvent) => {
      finishPeekDrag(ev)
    }
    window.addEventListener('pointerup', onWindowPointerEnd)
    window.addEventListener('pointercancel', onWindowPointerEnd)
    peekDragWindowCleanupRef.current = () => {
      window.removeEventListener('pointerup', onWindowPointerEnd)
      window.removeEventListener('pointercancel', onWindowPointerEnd)
    }
  }, [detachPeekDragWindowListeners, finishPeekDrag])

  useEffect(
    () => () => {
      detachPeekDragWindowListeners()
      peekDragRef.current = null
      headerPointerSlopRef.current = false
    },
    [detachPeekDragWindowListeners],
  )

  /** Touch pointers: act on `pointerup` and suppress the synthetic `click` so a tap toggles focus once. */
  const rowTouchPointerRef = useRef<{
    pointerId: number
    x: number
    y: number
    focusKey: string
  } | null>(null)
  const skipRowClickFromTouchRef = useRef({ count: 0, until: 0 })

  const bindPatternRowInteraction = useCallback(
    (focusKey: string) => ({
      onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
        if (e.pointerType !== 'touch') return
        rowTouchPointerRef.current = {
          pointerId: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          focusKey,
        }
      },
      onPointerUp: (e: PointerEvent<HTMLButtonElement>) => {
        if (e.pointerType !== 'touch') return
        const start = rowTouchPointerRef.current
        if (!start || start.pointerId !== e.pointerId) return
        rowTouchPointerRef.current = null
        const dx = e.clientX - start.x
        const dy = e.clientY - start.y
        if (dx * dx + dy * dy > PEEK_DRAG_THRESHOLD_PX * PEEK_DRAG_THRESHOLD_PX) return
        const suppress = skipRowClickFromTouchRef.current
        suppress.count += 1
        suppress.until = e.timeStamp + TOUCH_CLICK_SUPPRESS_MS
        e.preventDefault()
        onPatternClick(start.focusKey)
      },
      onPointerCancel: () => {
        rowTouchPointerRef.current = null
      },
      onClick: (e: MouseEvent<HTMLButtonElement>) => {
        const suppress = skipRowClickFromTouchRef.current
        const now = e.timeStamp
        if (now > suppress.until) suppress.count = 0
        if (suppress.count > 0 || now <= suppress.until) {
          suppress.count = Math.max(0, suppress.count - 1)
          e.preventDefault()
          return
        }
        onPatternClick(focusKey)
      },
    }),
    [onPatternClick],
  )

  const filtered = useMemo(
    () => hands.filter((h) => checkedSections.has(h.section)),
    [hands, checkedSections],
  )

  const handEntryKey = useCallback((h: (typeof filtered)[number]) => handEntryKeyForLine(h), [])

  const stripSlotRowsByKey = useMemo(() => {
    if (!tilesGuideOn || rackTilesForSuggestedStrip.length === 0)
      return new Map<string, StripRowsEntry>()
    const rackDisplay = rackTilesForSuggestedStrip
    const rackMatch = rackTilesForPatternMatch ?? rackDisplay
    const greedyOpts: GreedyPatternMatchOpts | undefined =
      exposureTileIdsForSuggestedStrip?.size
        ? { exposureTileIds: exposureTileIdsForSuggestedStrip }
        : undefined
    const rackIdSet = new Set(rackMatch.map((t) => t.id))
    const m = new Map<string, StripRowsEntry>()
    const patternCache = new Map<string, PracticePattern | undefined>()
    for (const h of filtered) {
      const key = handEntryKey(h)
      const p = patternCache.get(h.id) ?? cardPatterns.find((x) => x.id === h.id)
      patternCache.set(h.id, p)
      if (!p) {
        m.set(key, { rows: [], ocVariantSuffixes: [] })
        continue
      }
      if (h.consecRanksTier) {
        // After the line-build split, each tier line has exactly one combo — render its single row.
        const rows: SuggestedStripSlot[][] = []
        for (const { perm, base } of h.consecRanksTier.combos) {
          const row = buildConsecRanksTierStripRow(p, rackMatch, perm, base, rackDisplay)
          if (row) rows.push(row)
        }
        m.set(key, { rows, ocVariantSuffixes: [] })
        continue
      }
      const detail = greedyPatternMatchDetail(rackMatch, p, greedyOpts)
      const bestIdsForAssign = new Set(detail.usedOrder.filter((id) => rackIdSet.has(id)))
      if (bestIdsForAssign.size === 0) {
        for (const t of rackMatch) {
          if (p.matches(t.def)) bestIdsForAssign.add(t.id)
        }
      }
      const result = buildSuggestedStripSlotRowsWithVariants(
        p,
        rackDisplay,
        detail.usedOrder,
        bestIdsForAssign,
        detail.usedMeta,
        exposureTileIdsForSuggestedStrip,
      )
      m.set(key, {
        rows: result.rows,
        ocVariantSuffixes: result.ocVariantSuffixes,
      })
    }
    return m
  }, [
    tilesGuideOn,
    filtered,
    rackTilesForSuggestedStrip,
    rackTilesForPatternMatch,
    exposureTileIdsForSuggestedStrip,
    handEntryKey,
    cardPatterns,
  ])

  const displayHands = useMemo(() => {
    const base = hideConcealedHands ? filtered.filter((h) => !h.closed) : filtered
    const rank = new Map(cardSectionOrder.map((s, i) => [s, i]))
    const pinIndex = new Map(pinnedHandKeys.map((key, i) => [key, i]))
    const pinOrderFor = (h: SuggestedHandLine): number | null => {
      if (pinIndex.size === 0) return null
      // Pin matches when ANY of the line's variant focus keys is pinned (covers expanded
      // variant rows that pin per-variant). Rank by the earliest matching pin index.
      const baseKey = handEntryKeyForLine(h)
      let best: number | null = pinIndex.has(baseKey) ? pinIndex.get(baseKey)! : null
      const entry = stripSlotRowsByKey.get(baseKey)
      if (entry && entry.rows.length > 1 && entry.ocVariantSuffixes.length === entry.rows.length) {
        for (const suf of entry.ocVariantSuffixes) {
          const k = `${h.id}::${suf}`
          if (pinIndex.has(k)) {
            const idx = pinIndex.get(k)!
            if (best == null || idx < best) best = idx
          }
        }
      }
      return best
    }
    return [...base].sort((a, b) => {
      const ap = pinOrderFor(a)
      const bp = pinOrderFor(b)
      if (ap !== null && bp !== null) return ap - bp
      if (ap !== null) return -1
      if (bp !== null) return 1
      if (a.tilesNeededRough !== b.tilesNeededRough) return a.tilesNeededRough - b.tilesNeededRough
      const ra = rank.get(a.section) ?? 999
      const rb = rank.get(b.section) ?? 999
      if (ra !== rb) return ra - rb
      const oa = suggestedHandCardRefOrder(a)
      const ob = suggestedHandCardRefOrder(b)
      if (oa !== ob) return oa - ob
      return a.id.localeCompare(b.id)
    })
  }, [filtered, hideConcealedHands, cardSectionOrder, pinnedHandKeys, stripSlotRowsByKey])

  const listRowsForHandsPanel = displayHands

  /** Flat list of rows actually rendered in the panel. Lines with multiple tied flexible
   * variants (suit-permute / opposing-consec) fan out to one entry per variant when the "Tiles"
   * guide is on; otherwise one entry per line carrying the line's primary focus key. */
  const expandedHandsRows = useMemo<ExpandedHandsRow[]>(() => {
    const out: ExpandedHandsRow[] = []
    for (const h of listRowsForHandsPanel) {
      const baseKey = handEntryKeyForLine(h)
      const entry = stripSlotRowsByKey.get(baseKey)
      const variantCount = entry?.rows.length ?? 0
      const canExpand =
        tilesGuideOn &&
        !h.consecRanksTier &&
        variantCount > 1 &&
        entry !== undefined &&
        entry.ocVariantSuffixes.length === variantCount
      if (canExpand) {
        for (let i = 0; i < variantCount; i++) {
          const suf = entry!.ocVariantSuffixes[i]!
          const fk = `${h.id}::${suf}`
          out.push({
            line: h,
            focusKey: fk,
            stripSlots: entry!.rows[i]!,
            reactKey: fk,
            pinKey: fk,
          })
        }
        continue
      }
      out.push({
        line: h,
        focusKey: baseKey,
        stripSlots: entry?.rows[0],
        reactKey: baseKey,
        pinKey: baseKey,
      })
    }
    return out
  }, [listRowsForHandsPanel, stripSlotRowsByKey, tilesGuideOn])

  const emitRowPinToggle = useCallback(
    (pinKey: string) => {
      onPinnedPatternChange?.(pinKey)
    },
    [onPinnedPatternChange],
  )
  const showPinColumn = !!onPinnedPatternChange

  useEffect(() => {
    if (activePatternId == null || !onFocusKeyMigrate) return
    if (expandedHandsRows.some((r) => r.focusKey === activePatternId)) return

    const patternId = focusKeyPatternId(activePatternId)
    const replacement = expandedHandsRows.find((r) => r.line.id === patternId)
    if (replacement) {
      onFocusKeyMigrate(replacement.focusKey)
      return
    }
    if (!listRowsForHandsPanel.some((h) => h.id === patternId)) {
      onFocusKeyMigrate(null)
    }
  }, [activePatternId, expandedHandsRows, listRowsForHandsPanel, onFocusKeyMigrate])

  const handsListOn = true
  const showHandCategoryLabels = handsListOn
  /** Same pin | category | hand | away | values sheet for hands-only and hands+tiles (tiles swap into detail row). */
  const handsListSpreadsheetHands = handsListOn
  const showSuggestedListContent = handsListOn || tilesGuideOn

  const rowHitGridStyle = useMemo((): CSSProperties => {
    if (handsListSpreadsheetHands) {
      return { gridTemplateAreas: "'pin section hand away values'" }
    }
    return { gridTemplateAreas: handsRowGridTemplateAreas(showHandCategoryLabels, tilesGuideOn) }
  }, [handsListSpreadsheetHands, showHandCategoryLabels, tilesGuideOn])

  const trayHeaderPeekResize = !!(
    onDiscardOverlayPeekPxChange && discardOverlayMeasureRef
  )

  useLayoutEffect(() => {
    if (!trayHeaderPeekResize) return
    const scrollEl = handsListScrollRef.current
    if (!scrollEl) return
    const syncMin = () => {
      minSheetHeightPxRef.current = measureMinSuggestedSheetPx(scrollEl)
    }
    syncMin()
    const ro = new ResizeObserver(syncMin)
    ro.observe(scrollEl)
    for (const sel of ['.hands-sheet', '.hands-list', '.hands-list__freeze-header']) {
      const node = scrollEl.querySelector(sel)
      if (node instanceof HTMLElement) ro.observe(node)
    }
    return () => ro.disconnect()
  }, [
    trayHeaderPeekResize,
    handsListOn,
    tilesGuideOn,
    listRowsForHandsPanel.length,
    rackTilesForSuggestedStrip.length,
    pinnedHandKeys.length,
  ])

  const handleScrollPointerDownCapture = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!onDiscardOverlayPeekPxChange || !discardOverlayMeasureRef?.current) return
      const t = e.target
      if (!(t instanceof Element)) return
      if (
        !t.closest('.hands-list__freeze-header') &&
        !t.closest('.hands-sheet__cell--header')
      ) {
        return
      }
      if (e.button !== 0) return
      const scrollEl = handsListScrollRef.current
      if (scrollEl) {
        minSheetHeightPxRef.current = measureMinSuggestedSheetPx(scrollEl)
      }
      headerPointerDownTargetRef.current = t
      headerPointerDownAtRef.current = performance.now()
      peekDragRef.current = {
        pointerId: e.pointerId,
        startY: e.clientY,
        startPeek: discardOverlayPeekRef.current,
      }
      headerPointerSlopRef.current = false
      syncPeekDragShellBlock('active')
      e.currentTarget.setPointerCapture(e.pointerId)
      attachPeekDragWindowListeners()
    },
    [
      onDiscardOverlayPeekPxChange,
      discardOverlayMeasureRef,
      syncPeekDragShellBlock,
      attachPeekDragWindowListeners,
    ],
  )

  const handleScrollPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const d = peekDragRef.current
      if (!d || e.pointerId !== d.pointerId || !onDiscardOverlayPeekPxChange) return
      if (e.pointerType === 'mouse' && (e.buttons & 1) === 0) {
        finishPeekDrag(e)
        return
      }
      const dy = e.clientY - d.startY
      if (Math.abs(dy) >= PEEK_DRAG_THRESHOLD_PX) headerPointerSlopRef.current = true
      if (!headerPointerSlopRef.current) return
      e.preventDefault()
      const shell = discardOverlayMeasureRef?.current
      if (!shell) return
      const minH = Math.ceil(minSheetHeightPxRef.current)
      const shellH = shell.getBoundingClientRect().height
      const topExtendPx = (() => {
        const raw = getComputedStyle(shell)
          .getPropertyValue('--suggested-overlay-top-extend')
          .trim()
        const n = parseFloat(raw)
        return Number.isFinite(n) ? Math.max(0, n) : 0
      })()
      /*
       * Positive peek shrinks the bottom-anchored sheet (reveals discards above). Negative peek
       * translates the sheet up into the exposure band (up to topExtendPx above the content box).
       */
      const minPeek = -topExtendPx
      const maxPeek = Math.max(0, shellH - minH)
      onDiscardOverlayPeekPxChange(
        Math.max(minPeek, Math.min(maxPeek, d.startPeek + dy)),
      )
    },
    [onDiscardOverlayPeekPxChange, discardOverlayMeasureRef, finishPeekDrag],
  )

  const handleScrollPointerUpOrCancel = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      finishPeekDrag(e)
    },
    [finishPeekDrag],
  )

  const handleTrayHeaderAreaClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (performance.now() < suppressHeaderClickUntilRef.current) {
        return
      }
      if (performance.now() - headerPointerDownAtRef.current > HEADER_DISMISS_MAX_MS) {
        return
      }
      if (!onTrayHeaderClick) return
      const t = e.target
      if (!(t instanceof Element)) return
      if (
        t.closest('.hands-list__freeze-header') ||
        t.closest('.hands-sheet__cell--header')
      ) {
        onTrayHeaderClick()
      }
    },
    [onTrayHeaderClick],
  )

  const rootClassName = [
    'panel',
    'panel--hands',
    discardTraySurface ? 'suggested-hands-popup__user-shift' : '',
    onTrayHeaderClick ? 'panel--hands--tray-header-dismiss' : '',
    trayHeaderPeekResize ? 'panel--hands--tray-header-resizable' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <section className={rootClassName} aria-label="Suggested hands">
      <div className="hands-panel__content">
          <div className="hands-panel__list-column">
            <div
              ref={handsListScrollRef}
              className="hands-list-scroll"
              {...(onTrayHeaderClick ? { onClick: handleTrayHeaderAreaClick } : {})}
              {...(trayHeaderPeekResize
                ? {
                    onPointerDownCapture: handleScrollPointerDownCapture,
                    onPointerMove: handleScrollPointerMove,
                    onPointerUp: handleScrollPointerUpOrCancel,
                    onPointerCancel: handleScrollPointerUpOrCancel,
                    onLostPointerCapture: handleScrollPointerUpOrCancel,
                  }
                : {})}
            >
            {!showSuggestedListContent ? (
              <div
                className="hands-sheet hands-sheet--tiles2 hands-sheet--header-only"
                id="hands-list"
                role="grid"
              >
                {onPinnedPatternChange ? (
                  <div
                    className="hands-sheet__cell hands-sheet__cell--header hands-sheet__cell--pin"
                    role="columnheader"
                    aria-hidden
                  />
                ) : null}
                <div
                  className="hands-sheet__cell hands-sheet__cell--header hands-sheet__cell--tiles"
                  role="columnheader"
                  aria-hidden
                />
                <div
                  className="hands-sheet__cell hands-sheet__cell--header hands-sheet__cell--away"
                  role="columnheader"
                  aria-hidden
                />
                <div
                  className="hands-sheet__cell hands-sheet__cell--header hands-sheet__cell--values"
                  role="columnheader"
                  aria-hidden
                />
              </div>
              ) : handsListSpreadsheetHands ? (
                <div
                  className={[
                    'hands-sheet',
                    tilesGuideOn ? 'hands-sheet--detail-tiles' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  id="hands-list"
                  role="grid"
                >
                  {onPinnedPatternChange ? (
                    <div
                      className="hands-sheet__cell hands-sheet__cell--header hands-sheet__cell--pin"
                      role="columnheader"
                      aria-hidden
                    />
                  ) : null}
                  <div
                    className="hands-sheet__cell hands-sheet__cell--header hands-sheet__cell--cat"
                    role="columnheader"
                    aria-hidden
                  />
                  <div
                    className="hands-sheet__cell hands-sheet__cell--header hands-sheet__cell--hand"
                    role="columnheader"
                    aria-hidden
                  />
                  <div
                    className="hands-sheet__cell hands-sheet__cell--header hands-sheet__cell--away"
                    role="columnheader"
                  >
                    Away
                  </div>
                  <div
                    className="hands-sheet__cell hands-sheet__cell--header hands-sheet__cell--values"
                    role="columnheader"
                  >
                    Points
                  </div>
                  <ol className="hands-sheet__rows" aria-label="Suggested hand lines">
                    {expandedHandsRows.map((row) => {
                      const focusKey = row.focusKey
                      const rowIsFocused = activePatternId === focusKey
                      return (
                        <SuggestedHandsSheetRow
                          key={row.reactKey}
                          row={row}
                          rowIsFocused={rowIsFocused}
                          rowDeadCause={
                            rowIsFocused ? deadCauseByFocusKey[focusKey] ?? null : null
                          }
                          tilesGuideOn={tilesGuideOn}
                          isPinned={pinnedKeySet.has(row.pinKey)}
                          showPinColumn={showPinColumn}
                          bindPatternRowInteraction={bindPatternRowInteraction}
                          onPinToggle={emitRowPinToggle}
                        />
                      )
                    })}
                  </ol>
                </div>
              ) : (
              <>
              <div
                className={[
                  'hands-list__freeze-header',
                  'hands-list__row-hit',
                  'hands-list__row-hit--with-tiles',
                  showHandCategoryLabels ? 'hands-list__row-hit--with-category' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={rowHitGridStyle}
                aria-hidden="true"
              >
                {onPinnedPatternChange ? (
                  <div
                    className="hands-list__cell hands-list__cell--pin hands-list__header-cell"
                    style={{ gridArea: 'pin' }}
                    aria-hidden
                  />
                ) : null}
                {showHandCategoryLabels ? (
                  <div
                    className={[
                      'hands-list__cell',
                      'hands-list__cell--category',
                      'hands-list__header-cell',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {tilesGuideOn ? (
                      <span
                        className="hands-list__header-meta hands-list__with-tiles-category"
                        aria-hidden
                      />
                    ) : (
                      <div className="hands-list__header-category-pair">
                        <span
                          className="hands-list__header-meta hands-list__header-pair--category"
                          aria-hidden
                        />
                        <span className="hands-list__header-meta">Hands</span>
                      </div>
                    )}
                  </div>
                ) : null}
                {tilesGuideOn ? (
                  <div
                    className={[
                      'hands-list__cell',
                      'hands-list__cell--tiles',
                      'hands-list__header-cell',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <div className="hands-list__header-meta">
                      {handsListOn ? 'Hands & Tiles' : 'Tiles'}
                    </div>
                  </div>
                ) : null}
                {showHandCategoryLabels && tilesGuideOn ? (
                  <>
                    <div
                      className="hands-list__cell hands-list__cell--tiles-away-pad hands-list__header-cell"
                      aria-hidden
                    />
                    <div
                      className="hands-list__cell hands-list__cell--tiles-values-pad hands-list__header-cell"
                      aria-hidden
                    />
                  </>
                ) : null}
                <div
                  className={[
                    'hands-list__cell',
                    'hands-list__cell--away',
                    'hands-list__header-cell',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <div className="hands-list__header-meta">Away</div>
                </div>
                <div
                  className={[
                    'hands-list__cell',
                    'hands-list__cell--values',
                    'hands-list__header-cell',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <div className="hands-list__header-meta">Points</div>
                </div>
              </div>
            <ol
              className={[
                'hands-list',
                'hands-list--tiles-excel',
                !handsListOn && tilesGuideOn ? 'hands-list--hands-off' : '',
                !showHandCategoryLabels ? 'hands-list--tiles-excel-flat' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              id="hands-list"
            >
              {expandedHandsRows.map((row) => {
                const focusKey = row.focusKey
                const rowIsFocused = activePatternId === focusKey
                return (
                  <SuggestedHandsCompactListRow
                    key={row.reactKey}
                    row={row}
                    rowIsFocused={rowIsFocused}
                    rowDeadCause={
                      rowIsFocused ? deadCauseByFocusKey[focusKey] ?? null : null
                    }
                    tilesGuideOn={tilesGuideOn}
                    handsListOn={handsListOn}
                    showHandCategoryLabels={showHandCategoryLabels}
                    rowHitGridStyle={rowHitGridStyle}
                    isPinned={pinnedKeySet.has(row.pinKey)}
                    showPinColumn={showPinColumn}
                    bindPatternRowInteraction={bindPatternRowInteraction}
                    onPinToggle={emitRowPinToggle}
                  />
                )
              })}
            </ol>
              </>
              )}
          </div>
        </div>
      </div>
    </section>
  )
})
