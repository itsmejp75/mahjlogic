import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
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
  tileMultisetSignature,
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
import {
  isSuggestedHandSectionFilterEnabled,
  suggestedHandSectionMenuLabel,
} from '../suggestedHands/filterSettings'
import { DeadCauseWarning } from './DeadCauseWarning'
import { TileFace } from './TileFace'

const TOUCH_CLICK_SUPPRESS_MS = 750
const ROW_TOUCH_SLOP_PX = 10
const DRAG_SCROLL_SLOP_PX = 4
const DRAG_SCROLL_CLICK_SUPPRESS_MS = 280
const DRAG_SCROLL_CLASS = 'hands-list-scroll--drag-scrolling'

function isTrayHeaderTarget(el: Element): boolean {
  return (
    !!el.closest('.hands-sheet__cell--header') ||
    !!el.closest('.hands-list__freeze-header')
  )
}

function trayBodyScrollEl(shell: HTMLElement): HTMLElement {
  const rows = shell.querySelector(
    ':scope > .hands-sheet:not(.hands-sheet--tiles2) > .hands-sheet__rows',
  )
  return rows instanceof HTMLElement ? rows : shell
}

type HandsListScrollSnapshot = {
  rowKeys: string[]
  anchorKey: string | null
  anchorPatternId: string | null
  /** Row top relative to the scroll viewport (excludes scrollTop). */
  anchorViewportTop: number
  scrollTop: number
}

function rowKeysInOrder(rows: ReadonlyArray<{ reactKey: string }>): string[] {
  return rows.map((r) => r.reactKey)
}

function rowKeysOrderChanged(prev: string[], next: string[]): boolean {
  if (prev.length !== next.length) return true
  for (let i = 0; i < prev.length; i++) {
    if (prev[i] !== next[i]) return true
  }
  return false
}

function rowViewportTopInScrollContainer(
  row: HTMLElement,
  scrollEl: HTMLElement,
  scrollRect?: DOMRect,
): number {
  const rowRect = row.getBoundingClientRect()
  const sr = scrollRect ?? scrollEl.getBoundingClientRect()
  return rowRect.top - sr.top
}

/** When re-sort inserts rows above a stable hand, pick that hand as the scroll anchor. */
function findStableAnchorKeyFromReorder(prevKeys: string[], nextKeys: string[]): string | null {
  for (const key of prevKeys) {
    const prevIdx = prevKeys.indexOf(key)
    const nextIdx = nextKeys.indexOf(key)
    if (nextIdx === -1) continue
    if (nextIdx > prevIdx) return key
  }
  for (const key of prevKeys) {
    if (nextKeys.includes(key)) return key
  }
  return null
}

/** Scroll delta needed when rows are inserted above `anchorKey` during a re-sort. */
function scrollDeltaForRowsInsertedAbove(
  scrollEl: HTMLElement,
  prevKeys: string[],
  nextKeys: string[],
  anchorKey: string,
): number {
  const prevIdx = prevKeys.indexOf(anchorKey)
  const nextIdx = nextKeys.indexOf(anchorKey)
  if (prevIdx === -1 || nextIdx === -1 || nextIdx <= prevIdx) return 0
  const prevAbove = new Set(prevKeys.slice(0, prevIdx))
  let delta = 0
  for (let i = 0; i < nextIdx; i++) {
    const key = nextKeys[i]!
    if (prevAbove.has(key)) continue
    const rowEl = findRowByKey(scrollEl, key)
    if (rowEl) delta += rowEl.getBoundingClientRect().height
  }
  return delta
}

/**
 * First row currently intersecting the top of the scroll viewport. Uses a single
 * `elementFromPoint` hit-test instead of scanning every row with `getBoundingClientRect`,
 * so the per-scroll-frame cost stays O(1) instead of O(rows) forced layouts.
 */
/** True when the first suggested row is scrolled entirely above the list viewport. */
function isTopSuggestedHandHidden(scrollEl: HTMLElement): boolean {
  if (scrollEl.scrollHeight <= scrollEl.clientHeight + 1) return false
  const firstRow =
    scrollEl.querySelector(':scope > .hands-sheet__row') ??
    scrollEl.querySelector(':scope > .hands-list__row-hit')
  if (!(firstRow instanceof HTMLElement)) return scrollEl.scrollTop > 1
  const scrollRect = scrollEl.getBoundingClientRect()
  const rowRect = firstRow.getBoundingClientRect()
  return rowRect.bottom <= scrollRect.top + 1
}

function firstVisibleRowByHitTest(scrollEl: HTMLElement, scrollRect: DOMRect): HTMLElement | null {
  if (typeof document === 'undefined') return null
  const x = scrollRect.left + Math.min(24, Math.max(1, scrollRect.width / 2))
  const y = scrollRect.top + 1
  const hit = document.elementFromPoint(x, y)
  const row = hit instanceof Element ? hit.closest('[data-hands-row-key]') : null
  return row instanceof HTMLElement && scrollEl.contains(row) ? row : null
}

function escapedDataAttrValue(value: string): string {
  return typeof CSS !== 'undefined' && 'escape' in CSS
    ? CSS.escape(value)
    : value.replace(/["\\]/g, '\\$&')
}

function findRowByKey(scrollEl: HTMLElement, key: string): HTMLElement | null {
  const row = scrollEl.querySelector(`[data-hands-row-key="${escapedDataAttrValue(key)}"]`)
  return row instanceof HTMLElement ? row : null
}

function findRowByPatternId(scrollEl: HTMLElement, patternId: string): HTMLElement | null {
  const row = scrollEl.querySelector(
    `[data-hands-pattern-id="${escapedDataAttrValue(patternId)}"]`,
  )
  return row instanceof HTMLElement ? row : null
}

function findScrollRowAnchor(
  scrollEl: HTMLElement,
  preferredKey: string | null,
  preferredPatternId: string | null,
): { key: string; patternId: string | null; viewportTop: number } | null {
  // Keep the selected/highlighted hand visually anchored through re-ranks. If a new
  // suggested row appears above it, the list should scroll upward instead of pushing it down.
  const scrollRect = scrollEl.getBoundingClientRect()
  const preferredByKey = preferredKey ? findRowByKey(scrollEl, preferredKey) : null
  if (preferredByKey) {
    return {
      key: preferredByKey.dataset.handsRowKey!,
      patternId: preferredByKey.dataset.handsPatternId ?? null,
      viewportTop: rowViewportTopInScrollContainer(preferredByKey, scrollEl, scrollRect),
    }
  }

  const preferredByPattern = preferredPatternId
    ? findRowByPatternId(scrollEl, preferredPatternId)
    : null
  if (preferredByPattern) {
    return {
      key: preferredByPattern.dataset.handsRowKey!,
      patternId: preferredByPattern.dataset.handsPatternId ?? null,
      viewportTop: rowViewportTopInScrollContainer(preferredByPattern, scrollEl, scrollRect),
    }
  }

  const visibleRow = firstVisibleRowByHitTest(scrollEl, scrollRect)
  if (visibleRow && visibleRow.dataset.handsRowKey) {
    return {
      key: visibleRow.dataset.handsRowKey,
      patternId: visibleRow.dataset.handsPatternId ?? null,
      viewportTop: rowViewportTopInScrollContainer(visibleRow, scrollEl, scrollRect),
    }
  }
  return null
}

function findRowForSnapshotAnchor(
  scrollEl: HTMLElement,
  key: string | null,
  patternId: string | null,
): HTMLElement | null {
  return (key ? findRowByKey(scrollEl, key) : null) ?? (patternId ? findRowByPatternId(scrollEl, patternId) : null)
}

/** List row key for highlight/scroll when the stored focus key’s variant suffix goes stale. */
function resolveEffectiveFocusRowKey(
  activePatternId: string | null,
  expandedHandsRows: ReadonlyArray<{ focusKey: string; line: { id: string } }>,
  listRowsForHandsPanel: ReadonlyArray<{ id: string }>,
): string | null {
  if (activePatternId == null) return null
  if (expandedHandsRows.some((r) => r.focusKey === activePatternId)) return activePatternId
  const patternId = focusKeyPatternId(activePatternId)
  if (!listRowsForHandsPanel.some((h) => h.id === patternId)) return activePatternId
  return expandedHandsRows.find((r) => r.line.id === patternId)?.focusKey ?? activePatternId
}

type StripRowsEntry = {
  rows: SuggestedStripSlot[][]
  /** Per-row variant focus-key suffix (parallel to {@link rows}). Format:
   *  - `tier::<base>:<perm>` for suit-permute consecRanks
   *  - `oc::<r>-<s1>-<s2>` for opposing-consec
   *  Empty array when {@link rows}.length <= 1 or when the line has no flexible variants.
   */
  ocVariantSuffixes: string[]
}

type SelectedHandAwayTrend = 'improved' | 'behind-best' | null

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

/** Points column / aria value — number only (concealed C lives on the hand line). */
function formatSuggestedHandValue(points: number): string {
  return `${points}`
}

const SuggestedHandConcealedMark = memo(function SuggestedHandConcealedMark({
  variant,
}: {
  variant: 'sheet' | 'list'
}) {
  return (
    <span
      className={variant === 'sheet' ? 'hands-sheet__card-c' : 'hands-list__card-c'}
      aria-label="Concealed hand"
    >
      C
    </span>
  )
})

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

/** Visible card-line length for sheet `cqi` shrink-to-fit (concealed C / dead icon reserve extra units). */
function suggestedHandTitleCharCount(
  h: SuggestedHandLine,
  extraUnits: number,
): number {
  const baseLen = h.titleSegments?.length
    ? h.titleSegments.reduce((sum, seg) => sum + seg.t.length, 0)
    : suggestedHandPlainTitleWithoutParen(h).length
  return Math.max(4, baseLen + extraUnits)
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

const SuggestedHandsScrollAboveHint = memo(function SuggestedHandsScrollAboveHint() {
  return (
    <span className="hands-scroll-above-hint" aria-hidden="true">
      <svg className="hands-scroll-above-hint__icon" viewBox="0 0 24 24" aria-hidden>
        <polygon points="12 5 19 18 5 18" fill="currentColor" stroke="none" />
      </svg>
    </span>
  )
})

const SuggestedHandAwayTrendIndicator = memo(function SuggestedHandAwayTrendIndicator({
  trend,
}: {
  trend: Exclude<SelectedHandAwayTrend, null>
}) {
  const label =
    trend === 'improved'
      ? 'Selected hand is fewer tiles away'
      : 'Another suggested hand is fewer tiles away'
  // Solid triangles. Improved points up, behind-best points down.
  const points = trend === 'improved' ? '12 5 19 18 5 18' : '5 6 19 6 12 19'
  return (
    <span className="hands-sheet__away-trend-wrap" role="img" aria-label={label}>
      <svg
        className={`hands-sheet__away-trend hands-sheet__away-trend--${trend}`}
        viewBox="0 0 24 24"
        aria-hidden
      >
        <title>{label}</title>
        <polygon points={points} fill="currentColor" stroke="none" />
      </svg>
    </span>
  )
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

const SuggestedHandDeadCauseIcon = memo(function SuggestedHandDeadCauseIcon({
  cause,
}: {
  cause: DeadCauseHint
}) {
  return (
    <span
      className="hands-list__dead-cause-icon"
      title={formatDeadCauseMessage(cause)}
      aria-label={formatDeadCauseMessage(cause)}
    >
      <DeadCauseWarning className="hands-list__dead-cause-warn" />
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
  awayTrend,
  rowDeadCause,
  tilesGuideOn,
  isPinned,
  showPinColumn,
  bindPatternRowInteraction,
  onPinToggle,
}: {
  row: ExpandedHandsRow
  rowIsFocused: boolean
  awayTrend: SelectedHandAwayTrend
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
  const ariaLabel = `${suggestedHandSectionMenuLabel(h.section)} - ${cardRef}, ${h.title}${h.closed ? ', concealed' : ''}, ${h.tilesNeededRough} tiles away, ${formatSuggestedHandValue(h.points)}`
  const parenText = !tilesGuideOn ? suggestedHandParenText(h) : null
  const handTitleCharCount = suggestedHandTitleCharCount(
    h,
    (h.closed ? 1 : 0) + (rowDeadCause ? 1 : 0),
  )
  const showTileDetail = tilesGuideOn && rowStripSlots.length > 0
  // Hands-only rows always reserve the parenthesis line so every suggested hand has the same
  // total height *and* keeps its card line at the same vertical position. Without this,
  // paren-less rows collapse to a single track and their hand text + Away/Points jump ~1 line
  // relative to paren'd rows whenever the list reorders.
  const reserveParenRow = !tilesGuideOn
  const showDetailRow = showTileDetail || reserveParenRow || Boolean(parenText)

  return (
    <li
      className={['hands-sheet__row', rowIsFocused ? 'hands-sheet__row--active' : '']
        .filter(Boolean)
        .join(' ')}
      role="row"
      data-hands-row-key={rowKey}
      data-hands-pattern-id={h.id}
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
      {showPinColumn && showDetailRow ? (
        <div
          className="hands-sheet__cell hands-sheet__cell--pin hands-sheet__cell--detail-pad"
          role="cell"
          aria-hidden="true"
        />
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
            'hands-sheet__cell hands-sheet__cell--cat',
            sheetRowLitEdge(rowLit, 'start'),
          ]
            .filter(Boolean)
            .join(' ')}
          role="cell"
        >
          <span className="hands-sheet__category">
            {suggestedHandSectionMenuLabel(h.section)}
            <span className="hands-sheet__section-num"> - {cardRef}</span>
          </span>
        </div>
        {showDetailRow ? (
          <div
            className="hands-sheet__cell hands-sheet__cell--cat hands-sheet__cell--detail-pad"
            role="cell"
            aria-hidden="true"
          />
        ) : null}
        <div
          className={[
            'hands-sheet__cell hands-sheet__cell--hand',
            sheetRowLitEdge(rowLit, 'mid'),
          ]
            .filter(Boolean)
            .join(' ')}
          role="cell"
          aria-label={h.title}
        >
          <span
            className="hands-sheet__hand-title-line"
            style={{ ['--hand-title-ch' as string]: String(handTitleCharCount) }}
          >
            {h.titleSegments?.length ? (
              <>
                <CardColoredTextWithDeadCause
                  segments={h.titleSegments}
                  deadCause={rowDeadCause}
                />
                {h.closed ? <SuggestedHandConcealedMark variant="sheet" /> : null}
              </>
            ) : (
              <>
                {parenText ? suggestedHandPlainTitleWithoutParen(h) : h.title}
                {h.closed ? <SuggestedHandConcealedMark variant="sheet" /> : null}
              </>
            )}
            {rowDeadCause ? <SuggestedHandDeadCauseIcon cause={rowDeadCause} /> : null}
          </span>
        </div>
        {showDetailRow ? (
          <div
            className="hands-sheet__cell hands-sheet__cell--hand hands-sheet__cell--detail-pad"
            role="cell"
          >
            {showTileDetail ? (
              <SuggestedHandSheetTileGrid
                slots={rowStripSlots}
                isActiveRow={rowLit}
                keyPrefix={rowKey}
                deadCause={rowDeadCause}
              />
            ) : (
              <span
                className="hands-sheet__paren"
                style={
                  parenText
                    ? { ['--hand-paren-ch' as string]: String(Math.max(4, parenText.length)) }
                    : undefined
                }
              >
                {parenText ?? '\u00A0'}
              </span>
            )}
          </div>
        ) : null}
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
          {!showDetailRow && awayTrend ? (
            <span className="hands-sheet__away-trend-overlay">
              <SuggestedHandAwayTrendIndicator trend={awayTrend} />
            </span>
          ) : null}
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
        {showDetailRow ? (
          <>
            <div
              className="hands-sheet__cell hands-sheet__cell--away hands-sheet__cell--detail-pad"
              role="cell"
              aria-hidden={awayTrend ? undefined : true}
            >
              {awayTrend ? (
                <span className="hands-sheet__away-trend-overlay">
                  <SuggestedHandAwayTrendIndicator trend={awayTrend} />
                </span>
              ) : null}
            </div>
            <div
              className="hands-sheet__cell hands-sheet__cell--values hands-sheet__cell--detail-pad"
              role="cell"
              aria-hidden="true"
            />
          </>
        ) : null}
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
      ? `${suggestedHandSectionMenuLabel(h.section)} - ${cardRef}, ${h.title}${h.closed ? ', concealed' : ''}, ${h.tilesNeededRough} tiles away, ${formatSuggestedHandValue(h.points)}`
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
    <li className={liClassName} data-hands-row-key={row.reactKey} data-hands-pattern-id={h.id}>
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
            </span>
            {handsListOn ? (
              <span className="hands-list__category-inline-hand" aria-label={h.title}>
                {h.titleSegments?.length ? (
                  <>
                    <CardColoredTextWithDeadCause
                      segments={h.titleSegments}
                      deadCause={rowDeadCause}
                    />
                    {h.closed ? <SuggestedHandConcealedMark variant="list" /> : null}
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
                    {h.closed ? <SuggestedHandConcealedMark variant="list" /> : null}
                  </>
                )}
                {rowDeadCause ? <SuggestedHandDeadCauseIcon cause={rowDeadCause} /> : null}
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
            aria-label={`Hand value ${formatSuggestedHandValue(h.points)}${h.closed ? ', concealed' : ''}`}
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
  /** Rerank changed variant keys — clear selection only when the pattern leaves the list. */
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
  onPinnedPatternChange,
  deadCauseByFocusKey = {},
}: Props) {
  const pinnedKeySet = useMemo(() => new Set(pinnedHandKeys), [pinnedHandKeys])
  const handsListScrollRef = useRef<HTMLDivElement>(null)
  const selectedAwayKeyRef = useRef<string | null>(null)
  const selectedAwayLastValueRef = useRef<number | null>(null)
  const [activeAwayTrend, setActiveAwayTrend] = useState<SelectedHandAwayTrend>(null)
  const [hasHandsAboveView, setHasHandsAboveView] = useState(false)

  const getTrayScrollTarget = useCallback((): HTMLElement | null => {
    const shell = handsListScrollRef.current
    if (!shell) return null
    return trayBodyScrollEl(shell)
  }, [])

  const handsListScrollSnapshotRef = useRef<HandsListScrollSnapshot>({
    rowKeys: [],
    anchorKey: null,
    anchorPatternId: null,
    anchorViewportTop: 0,
    scrollTop: 0,
  })

  const dragScrollRef = useRef<{
    pointerId: number
    startY: number
    startScrollTop: number
  } | null>(null)
  const dragScrollActiveRef = useRef(false)
  const suppressRowClickFromDragRef = useRef(0)
  const dragScrollWindowCleanupRef = useRef<(() => void) | null>(null)

  const detachDragScrollWindowListeners = useCallback(() => {
    dragScrollWindowCleanupRef.current?.()
    dragScrollWindowCleanupRef.current = null
  }, [])

  const finishDragScroll = useCallback(
    (e: PointerEvent<HTMLDivElement> | globalThis.PointerEvent) => {
      const d = dragScrollRef.current
      if (!d || e.pointerId !== d.pointerId) return
      detachDragScrollWindowListeners()
      dragScrollRef.current = null
      const shell = handsListScrollRef.current
      if (dragScrollActiveRef.current) {
        suppressRowClickFromDragRef.current =
          performance.now() + DRAG_SCROLL_CLICK_SUPPRESS_MS
        e.preventDefault()
      }
      dragScrollActiveRef.current = false
      shell?.classList.remove(DRAG_SCROLL_CLASS)
      try {
        shell?.releasePointerCapture(e.pointerId)
      } catch {
        /* capture already released */
      }
    },
    [detachDragScrollWindowListeners],
  )

  const attachDragScrollWindowListeners = useCallback(() => {
    detachDragScrollWindowListeners()
    const onWindowPointerEnd = (ev: globalThis.PointerEvent) => {
      finishDragScroll(ev)
    }
    window.addEventListener('pointerup', onWindowPointerEnd)
    window.addEventListener('pointercancel', onWindowPointerEnd)
    dragScrollWindowCleanupRef.current = () => {
      window.removeEventListener('pointerup', onWindowPointerEnd)
      window.removeEventListener('pointercancel', onWindowPointerEnd)
    }
  }, [detachDragScrollWindowListeners, finishDragScroll])

  useEffect(
    () => () => {
      detachDragScrollWindowListeners()
      dragScrollRef.current = null
      dragScrollActiveRef.current = false
      handsListScrollRef.current?.classList.remove(DRAG_SCROLL_CLASS)
    },
    [detachDragScrollWindowListeners],
  )

  const handleListScrollPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!discardTraySurface) return
      const t = e.target
      if (!(t instanceof Element)) return
      if (t.closest('.hands-suggested-pin')) return
      if (e.pointerType === 'touch' && !isTrayHeaderTarget(t)) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const scrollEl = getTrayScrollTarget()
      if (!scrollEl || scrollEl.scrollHeight <= scrollEl.clientHeight) return
      dragScrollRef.current = {
        pointerId: e.pointerId,
        startY: e.clientY,
        startScrollTop: scrollEl.scrollTop,
      }
      dragScrollActiveRef.current = false
      attachDragScrollWindowListeners()
    },
    [discardTraySurface, getTrayScrollTarget, attachDragScrollWindowListeners],
  )

  const handleListScrollPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const d = dragScrollRef.current
      if (!d || e.pointerId !== d.pointerId) return
      if (e.pointerType === 'mouse' && (e.buttons & 1) === 0) {
        finishDragScroll(e)
        return
      }
      const scrollEl = getTrayScrollTarget()
      if (!scrollEl) return
      const dy = e.clientY - d.startY
      if (!dragScrollActiveRef.current) {
        if (Math.abs(dy) < DRAG_SCROLL_SLOP_PX) return
        dragScrollActiveRef.current = true
        handsListScrollRef.current?.classList.add(DRAG_SCROLL_CLASS)
        e.currentTarget.setPointerCapture(e.pointerId)
      }
      e.preventDefault()
      scrollEl.scrollTop = d.startScrollTop - dy
    },
    [finishDragScroll, getTrayScrollTarget],
  )

  const handleListScrollPointerUpOrCancel = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      finishDragScroll(e)
    },
    [finishDragScroll],
  )

  const handleTrayHeaderClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const t = e.target
      if (!(t instanceof Element) || !isTrayHeaderTarget(t)) return
      if (t.closest('.hands-suggested-pin')) return
      if (performance.now() < suppressRowClickFromDragRef.current) return
      const scrollEl = getTrayScrollTarget()
      if (!scrollEl || scrollEl.scrollTop <= 0) return
      scrollEl.scrollTo({ top: 0, behavior: 'smooth' })
    },
    [getTrayScrollTarget],
  )

  useEffect(() => {
    if (!discardTraySurface) return
    const shell = handsListScrollRef.current
    if (!shell) return
    const onWheel = (e: WheelEvent) => {
      const t = e.target
      if (!(t instanceof Element) || !isTrayHeaderTarget(t)) return
      const scrollEl = trayBodyScrollEl(shell)
      if (scrollEl.scrollHeight <= scrollEl.clientHeight) return
      scrollEl.scrollTop += e.deltaY
      e.preventDefault()
    }
    shell.addEventListener('wheel', onWheel, { capture: true, passive: false })
    return () => shell.removeEventListener('wheel', onWheel, { capture: true })
  }, [discardTraySurface, hands.length, tilesGuideOn, pinnedHandKeys.length])

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
        if (dx * dx + dy * dy > ROW_TOUCH_SLOP_PX * ROW_TOUCH_SLOP_PX) return
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
        if (performance.now() < suppressRowClickFromDragRef.current) {
          e.preventDefault()
          return
        }
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
    () => hands.filter((h) => isSuggestedHandSectionFilterEnabled(h.section, uncheckedSections)),
    [hands, uncheckedSections],
  )

  const handEntryKey = useCallback((h: (typeof filtered)[number]) => handEntryKeyForLine(h), [])

  // Order-independent signatures of the strip racks. A pure rack reorder changes these arrays'
  // identity but not their tile multiset, and the per-hand strip layout is order-independent — so
  // gate the ~130-row strip rebuild (and the ~1800 tile-cell re-render it forces) on these
  // signatures so rearranging tiles in the rack does no work here.
  const stripRackSignature = useMemo(
    () => (tilesGuideOn ? tileMultisetSignature(rackTilesForSuggestedStrip) : ''),
    [tilesGuideOn, rackTilesForSuggestedStrip],
  )
  const stripPatternMatchRackSignature = useMemo(
    () =>
      tilesGuideOn && rackTilesForPatternMatch
        ? tileMultisetSignature(rackTilesForPatternMatch)
        : '',
    [tilesGuideOn, rackTilesForPatternMatch],
  )

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
    // Keyed on rack *signatures* (not array identity) so a pure reorder reuses the cached strips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tilesGuideOn,
    filtered,
    stripRackSignature,
    stripPatternMatchRackSignature,
    exposureTileIdsForSuggestedStrip,
    handEntryKey,
    cardPatterns,
  ])

  const displayHands = useMemo(() => {
    const base = hideConcealedHands ? filtered.filter((h) => !h.closed) : filtered
    const rank = new Map(cardSectionOrder.map((s, i) => [s, i]))
    return [...base].sort((a, b) => {
      if (a.tilesNeededRough !== b.tilesNeededRough) return a.tilesNeededRough - b.tilesNeededRough
      const ra = rank.get(a.section) ?? 999
      const rb = rank.get(b.section) ?? 999
      if (ra !== rb) return ra - rb
      const oa = suggestedHandCardRefOrder(a)
      const ob = suggestedHandCardRefOrder(b)
      if (oa !== ob) return oa - ob
      return a.id.localeCompare(b.id)
    })
  }, [filtered, hideConcealedHands, cardSectionOrder])

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
    if (pinnedHandKeys.length === 0) return out
    const pinIndex = new Map(pinnedHandKeys.map((key, i) => [key, i]))
    return out
      .map((row, i) => ({ row, i }))
      .sort((a, b) => {
        const ap = pinIndex.has(a.row.pinKey) ? pinIndex.get(a.row.pinKey)! : null
        const bp = pinIndex.has(b.row.pinKey) ? pinIndex.get(b.row.pinKey)! : null
        if (ap !== null && bp !== null) return ap - bp || a.i - b.i
        if (ap !== null) return -1
        if (bp !== null) return 1
        return a.i - b.i
      })
      .map(({ row }) => row)
  }, [listRowsForHandsPanel, stripSlotRowsByKey, tilesGuideOn, pinnedHandKeys])

  const effectiveFocusRowKey = useMemo(
    () => resolveEffectiveFocusRowKey(activePatternId, expandedHandsRows, listRowsForHandsPanel),
    [activePatternId, expandedHandsRows, listRowsForHandsPanel],
  )

  const refreshHandsAboveViewHint = useCallback(() => {
    const scrollEl = getTrayScrollTarget()
    const next = scrollEl ? isTopSuggestedHandHidden(scrollEl) : false
    setHasHandsAboveView((prev) => (prev === next ? prev : next))
  }, [getTrayScrollTarget])

  const refreshScrollSnapshot = useCallback(
    (rowKeys?: string[]) => {
      const scrollEl = getTrayScrollTarget()
      if (!scrollEl) return
      const anchorPatternLineId = effectiveFocusRowKey
        ? focusKeyPatternId(effectiveFocusRowKey)
        : null
      const anchor = findScrollRowAnchor(
        scrollEl,
        effectiveFocusRowKey,
        anchorPatternLineId,
      )
      const snap = handsListScrollSnapshotRef.current
      handsListScrollSnapshotRef.current = {
        rowKeys: rowKeys ?? snap.rowKeys,
        anchorKey: anchor?.key ?? null,
        anchorPatternId: anchor?.patternId ?? null,
        anchorViewportTop: anchor?.viewportTop ?? 0,
        scrollTop: scrollEl.scrollTop,
      }
    },
    [effectiveFocusRowKey, getTrayScrollTarget],
  )

  // Trend arrow reflects the direction of the most recent tiles-away change while a row stays
  // selected: blank on select, green up when it drops, orange down when it rises, held until the
  // next change. Resets to blank when the row is deselected or a different row is selected.
  useEffect(() => {
    if (effectiveFocusRowKey == null) {
      selectedAwayKeyRef.current = null
      selectedAwayLastValueRef.current = null
      setActiveAwayTrend(null)
      return
    }

    const activeRow = expandedHandsRows.find((row) => row.focusKey === effectiveFocusRowKey)
    if (!activeRow) return
    const currentAway = activeRow.line.tilesNeededRough

    if (selectedAwayKeyRef.current !== effectiveFocusRowKey) {
      selectedAwayKeyRef.current = effectiveFocusRowKey
      selectedAwayLastValueRef.current = currentAway
      setActiveAwayTrend(null)
      return
    }

    const prevAway = selectedAwayLastValueRef.current
    if (prevAway == null || currentAway === prevAway) return
    selectedAwayLastValueRef.current = currentAway
    setActiveAwayTrend(currentAway < prevAway ? 'improved' : 'behind-best')
  }, [effectiveFocusRowKey, expandedHandsRows])

  useEffect(() => {
    const scrollEl = getTrayScrollTarget()
    if (!scrollEl) return
    // Coalesce scroll events to one snapshot per animation frame. The snapshot does layout
    // reads (getBoundingClientRect / elementFromPoint); running it on every raw scroll event
    // saturates the main thread mid-scroll and causes the WebView to blank whole rows.
    let rafId: number | null = null
    const onScroll = () => {
      if (rafId != null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        refreshScrollSnapshot()
        refreshHandsAboveViewHint()
      })
    }
    scrollEl.addEventListener('scroll', onScroll, { passive: true })
    refreshHandsAboveViewHint()
    return () => {
      scrollEl.removeEventListener('scroll', onScroll)
      if (rafId != null) cancelAnimationFrame(rafId)
    }
  }, [getTrayScrollTarget, refreshScrollSnapshot, refreshHandsAboveViewHint, expandedHandsRows.length])

  useLayoutEffect(() => {
    const scrollEl = getTrayScrollTarget()
    if (!scrollEl) return

    const rowKeys = rowKeysInOrder(expandedHandsRows)
    const prev = handsListScrollSnapshotRef.current

    // At the very top with nothing selected, let the list re-rank from the top down (the "best"
    // hands are what you're looking at). Otherwise keep the viewed rows visually pinned so a hand
    // sorting in above/below doesn't push the rows you're reading up or down.
    const atTopNoSelection = effectiveFocusRowKey == null && prev.scrollTop <= 1

    if (
      !atTopNoSelection &&
      prev.rowKeys.length > 0 &&
      rowKeysOrderChanged(prev.rowKeys, rowKeys) &&
      !dragScrollActiveRef.current
    ) {
      const scrollRect = scrollEl.getBoundingClientRect()
      const anchorKey =
        effectiveFocusRowKey ??
        prev.anchorKey ??
        findStableAnchorKeyFromReorder(prev.rowKeys, rowKeys)
      // Stable identity for the anchor: the pattern-line id survives focus-key churn. When "Tiles"
      // is on, flexible-variant hands fan out into rows whose react/focus key carries a variant
      // suffix (`::oc::…`, `::tier::…`); that suffix can change across a re-rank even though the
      // hand is the same, so the exact key can't be relied on to relocate the anchor.
      const anchorPatternId =
        (effectiveFocusRowKey ? focusKeyPatternId(effectiveFocusRowKey) : null) ??
        (anchorKey ? focusKeyPatternId(anchorKey) : null) ??
        prev.anchorPatternId
      const anchorRow = anchorKey
        ? findRowForSnapshotAnchor(scrollEl, anchorKey, anchorPatternId)
        : null

      let delta = 0
      // Same hand as the previous snapshot (matched by stable pattern id): keep it pinned to the
      // viewport position it held before the re-rank. This covers rows inserted above it, rows
      // removed above it, and variant-suffix key changes — so the selected hand stays put with
      // Tiles on just like it does with Tiles off.
      const samePatternAsPrev =
        anchorPatternId != null &&
        prev.anchorPatternId != null &&
        anchorPatternId === prev.anchorPatternId
      if (anchorRow && samePatternAsPrev) {
        const currentViewportTop = rowViewportTopInScrollContainer(anchorRow, scrollEl, scrollRect)
        delta = currentViewportTop - prev.anchorViewportTop
      } else if (anchorKey) {
        // Anchor newly chosen this pass (e.g. a stable row picked out of the reorder) — no prior
        // viewport sample exists, so estimate by summing the heights of rows inserted above it.
        let prevIdx = prev.rowKeys.indexOf(anchorKey)
        if (prevIdx === -1 && anchorPatternId != null) {
          prevIdx = prev.rowKeys.findIndex((k) => focusKeyPatternId(k) === anchorPatternId)
        }
        let nextIdx = rowKeys.indexOf(anchorKey)
        if (nextIdx === -1 && anchorPatternId != null) {
          nextIdx = rowKeys.findIndex((k) => focusKeyPatternId(k) === anchorPatternId)
        }
        if (prevIdx !== -1 && nextIdx !== -1 && nextIdx > prevIdx) {
          // Rows inserted above the anchor: sum only genuinely new rows (not shifted neighbors).
          delta = scrollDeltaForRowsInsertedAbove(scrollEl, prev.rowKeys, rowKeys, anchorKey)
        }
      }

      // Apply whole-pixel corrections only, and snap the result to an integer scrollTop. The delta
      // is derived from getBoundingClientRect (sub-pixel), so tiny nudges — e.g. when the anchor
      // didn't really move but a variant-suffix key changed — would otherwise fractionally scroll
      // the list and clip the row at the top of the viewport, making it look like the top hand is
      // shrinking/changing height on every re-rank.
      if (Math.abs(delta) >= 0.5) {
        scrollEl.scrollTop = Math.round(scrollEl.scrollTop + delta)
      }
    }

    refreshScrollSnapshot(rowKeys)
    refreshHandsAboveViewHint()
  }, [
    expandedHandsRows,
    effectiveFocusRowKey,
    getTrayScrollTarget,
    refreshScrollSnapshot,
    refreshHandsAboveViewHint,
  ])

  const emitRowPinToggle = useCallback(
    (pinKey: string) => {
      onPinnedPatternChange?.(pinKey)
    },
    [onPinnedPatternChange],
  )
  const showPinColumn = !!onPinnedPatternChange

  useEffect(() => {
    if (activePatternId == null || !onFocusKeyMigrate) return
    const patternId = focusKeyPatternId(activePatternId)
    if (listRowsForHandsPanel.some((h) => h.id === patternId)) return
    onFocusKeyMigrate(null)
  }, [activePatternId, listRowsForHandsPanel, onFocusKeyMigrate])

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

  const rootClassName = [
    'panel',
    'panel--hands',
    discardTraySurface ? 'suggested-hands-popup__user-shift' : '',
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
              onClick={handleTrayHeaderClick}
              {...(discardTraySurface
                ? {
                    onPointerDown: handleListScrollPointerDown,
                    onPointerMove: handleListScrollPointerMove,
                    onPointerUp: handleListScrollPointerUpOrCancel,
                    onPointerCancel: handleListScrollPointerUpOrCancel,
                    onLostPointerCapture: handleListScrollPointerUpOrCancel,
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
                  >
                    {hasHandsAboveView ? <SuggestedHandsScrollAboveHint /> : null}
                  </div>
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
                      const rowIsFocused = effectiveFocusRowKey === focusKey
                      return (
                        <SuggestedHandsSheetRow
                          key={row.reactKey}
                          row={row}
                          rowIsFocused={rowIsFocused}
                          awayTrend={rowIsFocused ? activeAwayTrend : null}
                          rowDeadCause={
                            rowIsFocused && activePatternId
                              ? deadCauseByFocusKey[activePatternId] ?? null
                              : null
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
                      !tilesGuideOn && hasHandsAboveView ? 'hands-list__header-cell--scroll-above' : '',
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
                    {!tilesGuideOn && hasHandsAboveView ? <SuggestedHandsScrollAboveHint /> : null}
                  </div>
                ) : null}
                {tilesGuideOn ? (
                  <div
                    className={[
                      'hands-list__cell',
                      'hands-list__cell--tiles',
                      'hands-list__header-cell',
                      !showHandCategoryLabels && hasHandsAboveView
                        ? 'hands-list__header-cell--scroll-above'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <div className="hands-list__header-meta">
                      {handsListOn ? 'Hands & Tiles' : 'Tiles'}
                    </div>
                    {!showHandCategoryLabels && hasHandsAboveView ? (
                      <SuggestedHandsScrollAboveHint />
                    ) : null}
                  </div>
                ) : null}
                {showHandCategoryLabels && tilesGuideOn ? (
                  <>
                    <div
                      className={[
                        'hands-list__cell',
                        'hands-list__cell--tiles-away-pad',
                        'hands-list__header-cell',
                        hasHandsAboveView ? 'hands-list__header-cell--scroll-above' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      aria-hidden
                    >
                      {hasHandsAboveView ? <SuggestedHandsScrollAboveHint /> : null}
                    </div>
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
                const rowIsFocused = effectiveFocusRowKey === focusKey
                return (
                  <SuggestedHandsCompactListRow
                    key={row.reactKey}
                    row={row}
                    rowIsFocused={rowIsFocused}
                    rowDeadCause={
                      rowIsFocused && activePatternId
                        ? deadCauseByFocusKey[activePatternId] ?? null
                        : null
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
