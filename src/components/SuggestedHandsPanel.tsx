import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
} from 'react'
import type { ExposureMeld } from '../analysis/botExposureHandStrip'
import {
  buildConsecRanksTierStripRow,
  buildSuggestedStripSlotRowsWithVariants,
  compareSuggestedHandsByProximity,
  focusKeyPatternId,
  greedyPatternMatchDetail,
  realignSuggestedStripToClaimMelds,
  suggestedHandShownInPanelList,
  type GreedyPatternMatchOpts,
  type SuggestedStripSlot,
  suggestedHandCardRefDisplay,
  suggestedHandCardRefOrder,
  tileMultisetSignature,
} from '../analysis/suggestedHands'
import type { CardInk } from '../card/cardText'
import { patternByIdLookup } from '../card/activeCardPatternsScope'
import {
  isCardContentAvailable,
  playableCardColumnLabel,
  type PlayableCardId,
} from '../card/cardCatalog'
import { CardHandNotation, showCardHandNotation } from '../card/CardHandNotation'
import type { PracticePattern } from '../card/practicePatterns'
import type { TileDef, TileInstance } from '../mahjong/types'
import { tileDefsEqual } from '../mahjong/tileUtils'
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
import selectedHandCheckSrc from '../assets/selected-hand-check.png?url'
import { createResizeScheduler } from '../lib/resizeSchedule'
import { cardInkRunText } from './CardColoredText'
import { DeadCauseWarning } from './DeadCauseWarning'
import { TileFace } from './TileFace'

const TOUCH_CLICK_SUPPRESS_MS = 750
const ROW_TOUCH_SLOP_PX = 10
const DRAG_SCROLL_SLOP_PX = 4
const DRAG_SCROLL_CLICK_SUPPRESS_MS = 280
const DRAG_SCROLL_CLASS = 'hands-list-scroll--drag-scrolling'
/** Stable face for suggested-strip joker time-share (CSS vars swap with the natural). */
const SUGGEST_JOKER_TIMESHARE_DEF: TileDef = { cat: 'joker' }
/** 3s natural + 1s joker (incl. ~0.4s crossfades); drives `--suggest-joker-*-opacity`. */
const SUGGEST_JOKER_TIMESHARE_MS = 4000

/**
 * iOS WKWebView / installed PWA: CSS @keyframes opacity freezes, and updating CSS *variables*
 * on an ancestor often does not repaint descendant `opacity: var(...)`. Drive the crossfade by
 * writing `style.opacity` on the stacked faces from rAF (shared clock → stays in phase).
 *
 * Do not gate on `prefers-reduced-motion` — this is game info (which slots are joker fills), and
 * iOS Reduce Motion would otherwise permanently hide the joker flash. In-app Animations off still
 * disables it.
 */
function suggestJokerTimeshareOpacities(nowMs: number): { natural: number; joker: number } {
  const t = (nowMs % SUGGEST_JOKER_TIMESHARE_MS) / SUGGEST_JOKER_TIMESHARE_MS
  let natural: number
  if (t <= 0.7) natural = 1
  else if (t < 0.8) natural = 1 - (t - 0.7) / 0.1
  else if (t <= 0.95) natural = 0
  else natural = (t - 0.95) / 0.05
  return { natural, joker: 1 - natural }
}

type SuggestJokerTimesharePair = {
  natural: HTMLElement | null
  joker: HTMLElement | null
}

function collectSuggestJokerTimesharePairs(root: HTMLElement): SuggestJokerTimesharePair[] {
  const cells = root.querySelectorAll<HTMLElement>(
    '.hands-list__pattern-tile-cell--suggest-joker, .hands-sheet__tile-cell--suggest-joker',
  )
  const pairs: SuggestJokerTimesharePair[] = []
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]!
    let natural: HTMLElement | null = null
    let joker: HTMLElement | null = null
    const kids = cell.children
    for (let c = 0; c < kids.length; c++) {
      const child = kids[c]
      if (!(child instanceof HTMLElement) || !child.classList.contains('tile-face')) continue
      if (child.classList.contains('tile-face--suggest-joker-timeshare')) joker = child
      else natural = child
    }
    pairs.push({ natural, joker })
  }
  return pairs
}

function clearSuggestJokerTimeshareInlineOpacity(root: HTMLElement): void {
  const faces = root.querySelectorAll<HTMLElement>('.tile-face')
  for (let i = 0; i < faces.length; i++) {
    faces[i]!.style.removeProperty('opacity')
  }
}

function suggestJokerTimeshareAnimationsOff(root: HTMLElement): boolean {
  return root.closest('[data-animations]')?.getAttribute('data-animations') === 'off'
}
/** Extra rows mounted above/below the viewport so fast flings do not flash empty gaps. */
const HANDS_LIST_VIRTUAL_OVERSCAN = 8
/** Minimum mounted window before scroll metrics are known. */
const HANDS_LIST_VIRTUAL_MIN_WINDOW = 28
/** Hands-only fallback until the first real row is measured (matches ~2.27em + borders). */
const HANDS_LIST_ROW_H_FALLBACK = 37
/** Tiles-mode fallback until measured (card line + tile strip). */
const HANDS_LIST_ROW_H_TILES_FALLBACK = 56

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

/** Scroll delta needed when rows are inserted above the anchor during a re-sort. */
function scrollDeltaForRowsInsertedAbove(
  scrollEl: HTMLElement,
  prevKeys: string[],
  nextKeys: string[],
  anchorKey: string,
  anchorPatternId?: string | null,
  /** Used when a newly inserted row is outside the virtualized DOM window. */
  fallbackRowHeight = HANDS_LIST_ROW_H_FALLBACK,
): number {
  let prevIdx = prevKeys.indexOf(anchorKey)
  let nextIdx = nextKeys.indexOf(anchorKey)
  if (prevIdx === -1 && anchorPatternId) {
    prevIdx = prevKeys.findIndex((k) => focusKeyPatternId(k) === anchorPatternId)
  }
  if (nextIdx === -1 && anchorPatternId) {
    nextIdx = nextKeys.findIndex((k) => focusKeyPatternId(k) === anchorPatternId)
  }
  if (prevIdx === -1 || nextIdx === -1 || nextIdx <= prevIdx) return 0
  const prevAbove = new Set(prevKeys.slice(0, prevIdx))
  let delta = 0
  for (let i = 0; i < nextIdx; i++) {
    const key = nextKeys[i]!
    if (prevAbove.has(key)) continue
    const rowEl = findRowByKey(scrollEl, key)
    delta += rowEl ? rowEl.getBoundingClientRect().height : fallbackRowHeight
  }
  return delta
}

/**
 * True when the list is scrolled past the first hand. Uses `scrollTop` (not the first mounted
 * `.hands-sheet__row`) so virtualization spacers cannot hide the “hands above” hint.
 */
function isTopSuggestedHandHidden(scrollEl: HTMLElement): boolean {
  if (scrollEl.scrollHeight <= scrollEl.clientHeight + 1) return false
  return scrollEl.scrollTop > 1
}

function computeHandsListVirtualRange(args: {
  scrollTop: number
  viewportHeight: number
  rowHeight: number
  totalRows: number
  focusedIndex: number
}): { start: number; end: number } {
  const { scrollTop, viewportHeight, rowHeight, totalRows, focusedIndex } = args
  if (totalRows <= 0) return { start: 0, end: 0 }
  const rh = Math.max(1, rowHeight)
  const vh = Math.max(rh, viewportHeight)
  let start = Math.max(0, Math.floor(scrollTop / rh) - HANDS_LIST_VIRTUAL_OVERSCAN)
  let end = Math.min(
    totalRows,
    Math.ceil((scrollTop + vh) / rh) + HANDS_LIST_VIRTUAL_OVERSCAN,
  )
  if (focusedIndex >= 0 && focusedIndex < totalRows) {
    start = Math.min(start, Math.max(0, focusedIndex - 1))
    end = Math.max(end, Math.min(totalRows, focusedIndex + 2))
  }
  if (end - start < HANDS_LIST_VIRTUAL_MIN_WINDOW) {
    end = Math.min(totalRows, start + HANDS_LIST_VIRTUAL_MIN_WINDOW)
    if (end - start < HANDS_LIST_VIRTUAL_MIN_WINDOW) {
      start = Math.max(0, end - HANDS_LIST_VIRTUAL_MIN_WINDOW)
    }
  }
  return { start, end }
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

  // Preferred focus row requested but not mounted (virtualized away / briefly absent during
  // call-staging). Do not substitute a random visible row — that steals the pin and the
  // highlighted hand jumps out of view on the next re-rank. Caller estimates from list index.
  if (preferredKey || preferredPatternId) return null

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

/** Row highlight: honor the urgent tap key and the remapped list key (variant suffix churn). */
function isSuggestedHandsRowFocused(
  rowFocusKey: string,
  activePatternId: string | null,
  effectiveFocusRowKey: string | null,
): boolean {
  if (activePatternId == null) return false
  if (rowFocusKey === activePatternId) return true
  return effectiveFocusRowKey != null && rowFocusKey === effectiveFocusRowKey
}

/** Dead-cause hints may be keyed by tap key, remapped row key, or bare pattern id. */
function resolveRowDeadCause(
  deadCauseByFocusKey: Readonly<Record<string, DeadCauseHint>>,
  ...candidateKeys: Array<string | null | undefined>
): DeadCauseHint | null {
  for (const key of candidateKeys) {
    if (!key) continue
    const hit = deadCauseByFocusKey[key]
    if (hit) return hit
  }
  return null
}

/**
 * Card-hand dead-cause chrome (boxed run + warning icon) for one suggested row.
 * Only the focused variant — never broadcast a sibling tier's cause across every row that
 * shares the same card pattern id (e.g. all ten Runs-8 suit/base permutations).
 */
function cardHandDeadCauseForRow(
  rowIsFocused: boolean,
  focusedHandDeadCause: DeadCauseHint | null,
  rowDeadCause: DeadCauseHint | null,
): DeadCauseHint | null {
  if (!rowIsFocused) return null
  return focusedHandDeadCause ?? rowDeadCause
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

/** When several suit variants tie, pick the strip row for the active focus key (if any). */
function stripSlotsForPanelRow(
  patternId: string,
  activePatternId: string | null,
  entry: StripRowsEntry | undefined,
): SuggestedStripSlot[] | undefined {
  if (!entry?.rows.length) return undefined
  if (entry.rows.length === 1) return entry.rows[0]
  if (entry.ocVariantSuffixes.length !== entry.rows.length) return entry.rows[0]
  if (activePatternId != null) {
    const i = entry.ocVariantSuffixes.findIndex(
      (suf) => activePatternId === `${patternId}::${suf}` || activePatternId.endsWith(suf),
    )
    if (i >= 0) return entry.rows[i]
  }
  return entry.rows[0]
}

type SelectedHandAwayTrend = 'improved' | 'behind-best' | null

/** A single concrete focus key per suggested-hand line (sub-best `consecRanksTier` tiers get their own key at line build). */
function handEntryKeyForLine(h: SuggestedHandLine): string {
  if (h.consecRanksTier && h.consecRanksTier.combos.length > 0) {
    const c = h.consecRanksTier.combos[0]!
    return `${h.id}::tier::${c.base}:${c.perm.join('-')}`
  }
  return h.id
}

/** One concrete row in the rendered suggested-hands list (always one entry per card line). */
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

/** Row identity for the list before tile-strip slots are attached (windowed + lazy strips). */
type ExpandedHandsRowMeta = Omit<ExpandedHandsRow, 'stripSlots'>

/** Points column / aria value — number only (concealed C lives on the hand line). */
function formatSuggestedHandValue(points: number): string {
  return `${points}`
}

function formatCompletionProbability(probability: number): string {
  return `${probability}`
}

function suggestedHandCompletionProbabilityLabel(probability: number): string {
  return `${probability} percent completion probability`
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
  // Solid triangles, centered in viewBox so the detail-row glyph centers in its cell.
  const points = trend === 'improved' ? '12 5 19 19 5 19' : '5 5 19 5 12 19'
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
      {segments.map((s, i) => {
        const runText = cardInkRunText(s.t)
        return (
          <span key={i} className={`card-ink card-ink--${s.ink}`}>
            {deadCause
              ? splitTitleTextForDeadCause(runText, deadCause.defs).map((part, j) =>
                  part.highlight ? (
                    <span key={j} className="hands-list__title-dead-cause-run">
                      {part.text}
                    </span>
                  ) : (
                    part.text
                  ),
                )
              : runText}
          </span>
        )
      })}
    </>
  )
})

const PlainHandTitleWithDeadCause = memo(function PlainHandTitleWithDeadCause({
  title,
  deadCause,
}: {
  title: string
  deadCause: DeadCauseHint | null
}) {
  if (!deadCause) return <>{title}</>
  return (
    <>
      {splitTitleTextForDeadCause(title, deadCause.defs).map((part, j) =>
        part.highlight ? (
          <span key={j} className="hands-list__title-dead-cause-run">
            {part.text}
          </span>
        ) : (
          part.text
        ),
      )}
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

/** Contiguous strip runs; non-null {@link SuggestedStripSlot.exposureMeldId} is boxed like bot hands. */
type SuggestedStripRun = {
  exposureMeldId: number | null
  slots: SuggestedStripSlot[]
  startIndex: number
}

function segmentSuggestedStripIntoRuns(slots: readonly SuggestedStripSlot[]): SuggestedStripRun[] {
  const runs: SuggestedStripRun[] = []
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]!
    const meldId = slot.exposureMeldId ?? null
    const last = runs[runs.length - 1]
    if (!last || last.exposureMeldId !== meldId) {
      runs.push({ exposureMeldId: meldId, slots: [slot], startIndex: i })
    } else {
      last.slots.push(slot)
    }
  }
  return runs
}

const EMPTY_INDEX_SET: ReadonlySet<number> = new Set()
const EMPTY_TILE_DEF_LIST: readonly TileDef[] = []

/** Slot indices on the focused strip that a blank can redeem from discards (one per fill). */
function blankExchangeHintSlotIndices(
  slots: readonly SuggestedStripSlot[],
  targetDefs: readonly TileDef[],
): ReadonlySet<number> {
  if (targetDefs.length === 0) return EMPTY_INDEX_SET
  const remaining = targetDefs.slice()
  const out = new Set<number>()
  const claim = (i: number) => {
    const slot = slots[i]!
    if (slot.highlight) return false
    const matchAt = remaining.findIndex((d) => tileDefsEqual(d, slot.displayDef))
    if (matchAt < 0) return false
    remaining.splice(matchAt, 1)
    out.add(i)
    return remaining.length === 0
  }
  // Prefer plain need slots; only fall back to joker-fill cells if needed.
  for (let i = 0; i < slots.length; i++) {
    if (slots[i]!.jokerSuggested) continue
    if (claim(i)) return out
  }
  for (let i = 0; i < slots.length; i++) {
    if (!slots[i]!.jokerSuggested) continue
    if (claim(i)) return out
  }
  return out
}

const SuggestedHandStripTileCell = memo(function SuggestedHandStripTileCell({
  slot,
  showJokerGuide,
  suggestBest,
  suggestBlankExchange,
  dim,
  deadCauseSlot,
  classPrefix,
}: {
  slot: SuggestedStripSlot
  showJokerGuide: boolean
  suggestBest: boolean
  suggestBlankExchange: boolean
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
  const blankExchangeClass =
    classPrefix === 'hands-sheet__tile-cell'
      ? 'hands-sheet__tile-cell--blank-exchange-hint'
      : 'hands-list__pattern-tile-cell--blank-exchange-hint'
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
        suggestBlankExchange ? blankExchangeClass : '',
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
      {/*
       * Keep the joker overlay mounted whenever this slot is a joker fill — not only while the
       * row is focused. Opacity is driven by strip CSS vars (rAF), not by mounting with animation.
       */}
      {slot.jokerSuggested ? (
        <TileFace
          def={SUGGEST_JOKER_TIMESHARE_DEF}
          ariaHidden
          className="tile-face--suggest-joker-timeshare"
        />
      ) : null}
    </div>
  )
})

/**
 * Compact-mode (2-col) inline grid-template-areas.
 * Leading `pin` column matches `--hands-list-pin-w` on `.hands-list--tiles-excel`.
 */
function handsRowGridTemplateAreas(cat: boolean, tiles: boolean, pin: boolean): string {
  if (pin) {
    if (cat) {
      if (tiles) {
        return "'pin category category away odds values' 'pin tiles tiles awayPad oddsPad valuesPad'"
      }
      return "'pin category category away odds values'"
    }
    return "'pin tiles tiles away odds values'"
  }
  if (cat) {
    if (tiles) {
      return "'category category away odds values' 'tiles tiles awayPad oddsPad valuesPad'"
    }
    return "'category category away odds values'"
  }
  return "'tiles tiles away odds values'"
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
      aria-label={pressed ? 'Unpin this hand' : 'Pin this hand'}
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

const SuggestedHandStripRuns = memo(function SuggestedHandStripRuns({
  slots,
  isActiveRow,
  keyPrefix,
  deadCause,
  blankExchangeTargetDefs,
  gridClassName,
  runClassPrefix,
  cellClassPrefix,
}: {
  slots: SuggestedStripSlot[]
  isActiveRow: boolean
  keyPrefix: string
  deadCause: DeadCauseHint | null
  blankExchangeTargetDefs: readonly TileDef[]
  gridClassName: string
  runClassPrefix: 'hands-sheet__tile-run' | 'hands-list__pattern-tile-run'
  cellClassPrefix: 'hands-sheet__tile-cell' | 'hands-list__pattern-tile-cell'
}) {
  const runs = useMemo(() => segmentSuggestedStripIntoRuns(slots), [slots])
  const stripRef = useRef<HTMLDivElement>(null)
  const hasJokerFill = useMemo(() => slots.some((s) => s.jokerSuggested), [slots])
  const blankExchangeHintIndices = useMemo(
    () =>
      isActiveRow ? blankExchangeHintSlotIndices(slots, blankExchangeTargetDefs) : EMPTY_INDEX_SET,
    [isActiveRow, slots, blankExchangeTargetDefs],
  )

  useEffect(() => {
    const root = stripRef.current
    if (!root || !isActiveRow || !hasJokerFill) return
    if (suggestJokerTimeshareAnimationsOff(root)) return

    let raf = 0
    const tick = (now: number) => {
      const { natural, joker } = suggestJokerTimeshareOpacities(now)
      // Re-query each frame so late joker joins / virtualization still paint on iOS.
      const pairs = collectSuggestJokerTimesharePairs(root)
      for (let i = 0; i < pairs.length; i++) {
        const p = pairs[i]!
        if (p.natural) p.natural.style.opacity = String(natural)
        if (p.joker) p.joker.style.opacity = String(joker)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      clearSuggestJokerTimeshareInlineOpacity(root)
    }
  }, [isActiveRow, hasJokerFill])

  return (
    <div ref={stripRef} className={gridClassName} role="presentation">
      {runs.map((run, runIdx) => (
        <div
          key={`${keyPrefix}-run-${runIdx}`}
          className={[
            runClassPrefix,
            run.exposureMeldId !== null ? `${runClassPrefix}--exposure` : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {run.slots.map((slot, j) => {
            const i = run.startIndex + j
            const showJokerGuide = isActiveRow && slot.jokerSuggested
            const suggestBest = isActiveRow && slot.highlight
            const suggestBlankExchange = blankExchangeHintIndices.has(i)
            const dim = isActiveRow && !slot.highlight && !slot.jokerSuggested
            const deadCauseSlot = isActiveRow && stripSlotMatchesDeadCause(slot, deadCause)
            return (
              <SuggestedHandStripTileCell
                key={`${keyPrefix}-${i}`}
                slot={slot}
                showJokerGuide={showJokerGuide}
                suggestBest={suggestBest}
                suggestBlankExchange={suggestBlankExchange}
                dim={dim}
                deadCauseSlot={deadCauseSlot}
                classPrefix={cellClassPrefix}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
})

const SuggestedHandSheetTileGrid = memo(function SuggestedHandSheetTileGrid({
  slots,
  isActiveRow,
  keyPrefix,
  deadCause,
  blankExchangeTargetDefs,
}: {
  slots: SuggestedStripSlot[]
  isActiveRow: boolean
  keyPrefix: string
  deadCause: DeadCauseHint | null
  blankExchangeTargetDefs: readonly TileDef[]
}) {
  return (
    <SuggestedHandStripRuns
      slots={slots}
      isActiveRow={isActiveRow}
      keyPrefix={keyPrefix}
      deadCause={deadCause}
      blankExchangeTargetDefs={blankExchangeTargetDefs}
      gridClassName="hands-sheet__tiles-grid"
      runClassPrefix="hands-sheet__tile-run"
      cellClassPrefix="hands-sheet__tile-cell"
    />
  )
})

const SuggestedHandListTileGrid = memo(function SuggestedHandListTileGrid({
  slots,
  isActiveRow,
  keyPrefix,
  deadCause,
  blankExchangeTargetDefs,
}: {
  slots: SuggestedStripSlot[]
  isActiveRow: boolean
  keyPrefix: string
  deadCause: DeadCauseHint | null
  blankExchangeTargetDefs: readonly TileDef[]
}) {
  return (
    <SuggestedHandStripRuns
      slots={slots}
      isActiveRow={isActiveRow}
      keyPrefix={keyPrefix}
      deadCause={deadCause}
      blankExchangeTargetDefs={blankExchangeTargetDefs}
      gridClassName="hands-list__pattern-tiles-grid"
      runClassPrefix="hands-list__pattern-tile-run"
      cellClassPrefix="hands-list__pattern-tile-cell"
    />
  )
})

const SuggestedHandsSheetRow = memo(function SuggestedHandsSheetRow({
  row,
  rowIsFocused,
  awayTrend,
  rowDeadCause,
  cardHandDeadCause,
  tilesGuideOn,
  tilesDetailActive,
  showHandProbability,
  isPinned,
  showPinColumn,
  blankExchangeTargetDefs,
  bindPatternRowInteraction,
  onPinToggle,
}: {
  row: ExpandedHandsRow
  rowIsFocused: boolean
  awayTrend: SelectedHandAwayTrend
  rowDeadCause: DeadCauseHint | null
  cardHandDeadCause: DeadCauseHint | null
  tilesGuideOn: boolean
  /** Tile strip layout + tall row height — only after deferred strip slots are ready. */
  tilesDetailActive: boolean
  showHandProbability: boolean
  isPinned: boolean
  showPinColumn: boolean
  blankExchangeTargetDefs: readonly TileDef[]
  bindPatternRowInteraction: (focusKey: string) => PatternRowInteractionProps
  onPinToggle: (pinKey: string) => void
}) {
  const h = row.line
  const rowKey = row.reactKey
  const focusKey = row.focusKey
  const rowStripSlots = row.stripSlots ?? []
  const rowLit = tilesGuideOn && rowIsFocused
  const cardRef = suggestedHandCardRefDisplay(h)
  const handNotationOn = showCardHandNotation()
  const ariaLabel = [
    `${suggestedHandSectionMenuLabel(h.section)} #${cardRef}`,
    handNotationOn ? h.title + (h.closed ? ', concealed' : '') : h.closed ? 'concealed' : null,
    `${h.tilesNeededRough} tiles away`,
    showHandProbability ? suggestedHandCompletionProbabilityLabel(h.completionProbability) : null,
    formatSuggestedHandValue(h.points),
  ]
    .filter(Boolean)
    .join(', ')
  const parenText = handNotationOn && !tilesDetailActive ? suggestedHandParenText(h) : null
  const showTileDetail = tilesDetailActive && rowStripSlots.length > 0
  // Hands-only rows always reserve the parenthesis line so every suggested hand has the same
  // total height *and* keeps its card line at the same vertical position. Without this,
  // paren-less rows collapse to a single track and their hand text + Away/Points jump ~1 line
  // relative to paren'd rows whenever the list reorders.
  const reserveParenRow = !tilesDetailActive
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
        >
          {rowIsFocused ? (
            <span className="hands-sheet__selected-check">
              <span
                className="hands-sheet__selected-check__mark"
                style={{
                  WebkitMaskImage: `url(${selectedHandCheckSrc})`,
                  maskImage: `url(${selectedHandCheckSrc})`,
                }}
              />
            </span>
          ) : null}
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
            'hands-sheet__cell hands-sheet__cell--cat',
            sheetRowLitEdge(rowLit, 'start'),
          ]
            .filter(Boolean)
            .join(' ')}
          role="cell"
        >
          <span className="hands-sheet__category">
            {suggestedHandSectionMenuLabel(h.section)}
            <span className="hands-sheet__section-num">
              <span className="hands-sheet__section-hash" aria-hidden="true">
                #
              </span>
              {cardRef}
            </span>
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
          aria-label={handNotationOn ? h.title : `Hand ${cardRef}`}
        >
          <span
            className={[
              'hands-sheet__hand-title-line',
              cardHandDeadCause ? 'hands-sheet__hand-title-line--dead-cause' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <CardHandNotation
              fallback={
                <>
                  {h.closed ? <SuggestedHandConcealedMark variant="sheet" /> : null}
                  {cardHandDeadCause ? <SuggestedHandDeadCauseIcon cause={cardHandDeadCause} /> : null}
                </>
              }
            >
              {h.titleSegments?.length ? (
                <>
                  <CardColoredTextWithDeadCause
                    segments={h.titleSegments}
                    deadCause={cardHandDeadCause}
                  />
                  {h.closed ? <SuggestedHandConcealedMark variant="sheet" /> : null}
                </>
              ) : (
                <>
                  <PlainHandTitleWithDeadCause
                    title={parenText ? suggestedHandPlainTitleWithoutParen(h) : h.title}
                    deadCause={cardHandDeadCause}
                  />
                  {h.closed ? <SuggestedHandConcealedMark variant="sheet" /> : null}
                </>
              )}
              {cardHandDeadCause ? <SuggestedHandDeadCauseIcon cause={cardHandDeadCause} /> : null}
            </CardHandNotation>
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
                blankExchangeTargetDefs={blankExchangeTargetDefs}
              />
            ) : (
              <span className="hands-sheet__paren">
                {parenText ?? '\u00A0'}
              </span>
            )}
          </div>
        ) : null}
        <div
          className={[
            'hands-sheet__cell hands-sheet__cell--odds',
            sheetRowLitEdge(rowLit, 'mid'),
          ]
            .filter(Boolean)
            .join(' ')}
          role="cell"
          aria-hidden={!showHandProbability}
          aria-label={
            showHandProbability
              ? suggestedHandCompletionProbabilityLabel(h.completionProbability)
              : undefined
          }
        >
          {showHandProbability ? formatCompletionProbability(h.completionProbability) : null}
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
              className="hands-sheet__cell hands-sheet__cell--odds hands-sheet__cell--detail-pad"
              role="cell"
              aria-hidden="true"
            />
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
  cardHandDeadCause,
  tilesGuideOn,
  tilesDetailActive,
  handsListOn,
  showHandCategoryLabels,
  showHandProbability,
  rowHitGridStyle,
  isPinned,
  showPinColumn,
  blankExchangeTargetDefs,
  bindPatternRowInteraction,
  onPinToggle,
}: {
  row: ExpandedHandsRow
  rowIsFocused: boolean
  rowDeadCause: DeadCauseHint | null
  cardHandDeadCause: DeadCauseHint | null
  tilesGuideOn: boolean
  tilesDetailActive: boolean
  handsListOn: boolean
  showHandCategoryLabels: boolean
  showHandProbability: boolean
  rowHitGridStyle: CSSProperties
  isPinned: boolean
  showPinColumn: boolean
  blankExchangeTargetDefs: readonly TileDef[]
  bindPatternRowInteraction: (focusKey: string) => PatternRowInteractionProps
  onPinToggle: (pinKey: string) => void
}) {
  const h = row.line
  const focusKey = row.focusKey
  const rowStripSlots = row.stripSlots ?? []
  const cardRef = suggestedHandCardRefDisplay(h)
  const handNotationOn = showCardHandNotation()
  const rowAriaLabel =
    !handsListOn || !showHandCategoryLabels
      ? [
          `${suggestedHandSectionMenuLabel(h.section)} #${cardRef}`,
          handNotationOn
            ? h.title + (h.closed ? ', concealed' : '')
            : h.closed
              ? 'concealed'
              : null,
          `${h.tilesNeededRough} tiles away`,
          showHandProbability
            ? suggestedHandCompletionProbabilityLabel(h.completionProbability)
            : null,
          formatSuggestedHandValue(h.points),
        ]
          .filter(Boolean)
          .join(', ')
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
              <span className="hands-list__section-num">
                <span className="hands-list__section-hash" aria-hidden="true">
                  #
                </span>
                {cardRef}
              </span>
            </span>
            {handsListOn ? (
              <span
                className="hands-list__category-inline-hand"
                aria-label={handNotationOn ? h.title : `Hand ${cardRef}`}
              >
                <CardHandNotation
                  fallback={
                    <>
                      {h.closed ? <SuggestedHandConcealedMark variant="list" /> : null}
                      {cardHandDeadCause ? (
                        <SuggestedHandDeadCauseIcon cause={cardHandDeadCause} />
                      ) : null}
                    </>
                  }
                >
                  {h.titleSegments?.length ? (
                    <>
                      <CardColoredTextWithDeadCause
                        segments={h.titleSegments}
                        deadCause={cardHandDeadCause}
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
                      <PlainHandTitleWithDeadCause title={h.title} deadCause={cardHandDeadCause} />
                      {h.closed ? <SuggestedHandConcealedMark variant="list" /> : null}
                    </>
                  )}
                  {cardHandDeadCause ? <SuggestedHandDeadCauseIcon cause={cardHandDeadCause} /> : null}
                </CardHandNotation>
              </span>
            ) : null}
          </div>
        ) : null}
        {tilesDetailActive ? (
          <div className="hands-list__cell hands-list__cell--tiles">
            <div className="hands-list__pattern-tiles">
              {rowStripSlots.length > 0 ? (
                <SuggestedHandListTileGrid
                  slots={rowStripSlots}
                  isActiveRow={rowIsFocused}
                  keyPrefix={row.reactKey}
                  deadCause={rowDeadCause}
                  blankExchangeTargetDefs={blankExchangeTargetDefs}
                />
              ) : null}
            </div>
          </div>
        ) : null}
        {showHandCategoryLabels && tilesDetailActive ? (
          <>
            <div
              className="hands-list__cell hands-list__cell--tiles-odds-pad"
              aria-hidden="true"
            />
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
        <div
          className="hands-list__cell hands-list__cell--odds"
          aria-hidden={!showHandProbability}
        >
          {showHandProbability ? (
            <span
              className="hands-list__pressure"
              aria-label={suggestedHandCompletionProbabilityLabel(h.completionProbability)}
            >
              {formatCompletionProbability(h.completionProbability)}
            </span>
          ) : null}
        </div>
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
  /**
   * Rerank changed variant keys — migrate selection when the row key goes stale; clear when the
   * pattern leaves the list (unless {@link retainFocusWhenPatternMissing}).
   */
  onFocusKeyMigrate?: (nextKey: string | null) => void
  /**
   * When true, keep `activePatternId` even if that pattern is temporarily absent from the ranked
   * list, and preserve the scroll-pin anchor across that gap. Used during call-staging: an
   * incomplete staged meld (e.g. kong not Done yet) can drop or reshuffle the focused line until
   * the claim is finished — row highlight + viewport position should hold while the growable
   * exposure still fits that hand.
   */
  retainFocusWhenPatternMissing?: boolean
  tilesGuideOn: boolean
  /** When false, hide the Prob % column in the suggested-hands list (default true). */
  showHandProbability?: boolean
  rackTilesForSuggestedStrip: TileInstance[]
  /**
   * Same ids as `rackTilesForSuggestedStrip`, but jokers in open melds use their stand-in `TileDef`
   * for greedy matching. Omit to use the display rack for both (no claim melds with jokers).
   */
  rackTilesForPatternMatch?: TileInstance[]
  /** This seat’s exposure tile ids — fixes like-numbers rank for strip layout when set. */
  exposureTileIdsForSuggestedStrip?: ReadonlySet<string>
  /** Claim melds for boxing exposed runs on the tile strip (same placement as bot possible-hands). */
  exposureMeldsForSuggestedStrip?: readonly ExposureMeld[]
  /** Section names turned off in the app menu (not listed here ⇒ all sections from the card may show). */
  uncheckedSections: Set<string>
  /** When true, omit hands marked concealed (C) from the suggested list. */
  hideConcealedHands: boolean
  /** Active card book — pattern lookup and section order for this deal. */
  cardPatterns: PracticePattern[]
  /** Active playable card — shown in the card-hand column header. */
  cardId: PlayableCardId
  /** Section order on the active card (same semantics as built-in practice card order). */
  cardSectionOrder: readonly string[]
  /**
   * When true, this panel sits inside the discard-tray overlay shell: adds the tray surface
   * class (`suggested-hands-popup__user-shift`) on the root `section`. Motion and dialog chrome
   * live on the parent `.suggested-hands-popup` wrapper in `App`.
   */
  discardTraySurface?: boolean
  /** Discard-tray overlay open — remeasures frozen list-column width for card-hand layout. */
  trayOpen?: boolean
  /** Toggle whether `handKey` is pinned (add/remove from {@link pinnedHandKeys}). */
  onPinnedPatternChange?: (handKey: string) => void
  /** Per focus key: why the line is no longer completable (dead tile hint). */
  deadCauseByFocusKey?: Readonly<Record<string, DeadCauseHint>>
  /** Live dead-cause hint for {@link activePatternId} — not gated on the Tiles toggle. */
  focusedHandDeadCause?: DeadCauseHint | null
  /**
   * Discard defs a blank can redeem for the focused line — orange ring on matching
   * unfilled strip slots (same border as rack blank-exchange hints).
   */
  blankExchangeTargetDefs?: readonly TileDef[]
}

export const SuggestedHandsPanel = memo(function SuggestedHandsPanel({
  hands,
  activePatternId,
  pinnedHandKeys = [],
  onPatternClick,
  onFocusKeyMigrate,
  retainFocusWhenPatternMissing = false,
  tilesGuideOn,
  showHandProbability = true,
  rackTilesForSuggestedStrip,
  rackTilesForPatternMatch,
  exposureTileIdsForSuggestedStrip,
  exposureMeldsForSuggestedStrip,
  uncheckedSections,
  hideConcealedHands,
  cardPatterns,
  cardId,
  cardSectionOrder,
  discardTraySurface,
  trayOpen = false,
  onPinnedPatternChange,
  deadCauseByFocusKey = {},
  focusedHandDeadCause = null,
  blankExchangeTargetDefs = EMPTY_TILE_DEF_LIST,
}: Props) {
  /** Strip slot rows are expensive — defer only the rebuild, not turning tiles off. */
  const tilesStripSlotsOn = useDeferredValue(tilesGuideOn)
  /** Tall tile rows + strip render only once deferred strip data is ready (avoids empty expanded rows). */
  const tilesDetailActive = tilesGuideOn && tilesStripSlotsOn
  const cardPatternsById = useMemo(() => patternByIdLookup(cardPatterns), [cardPatterns])
  const cardColumnLabel = playableCardColumnLabel(cardId)
  const pinnedKeySet = useMemo(() => new Set(pinnedHandKeys), [pinnedHandKeys])
  const handsListScrollRef = useRef<HTMLDivElement>(null)
  const listColumnRef = useRef<HTMLDivElement>(null)
  const selectedAwayKeyRef = useRef<string | null>(null)
  const selectedAwayLastValueRef = useRef<number | null>(null)
  /** Trend is keyed to the row that earned it so a focus change never paints the prior arrow. */
  const [activeAwayTrend, setActiveAwayTrend] = useState<{
    focusKey: string
    trend: Exclude<SelectedHandAwayTrend, null>
  } | null>(null)
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
  const prevEffectiveFocusRowKeyRef = useRef<string | null>(null)
  const prevTilesDetailActiveRef = useRef<boolean | null>(null)

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

  /** Drop content-visibility size memory so row heights match the rewritten sheet font. */
  const bustHandsSheetRowIntrinsicCache = useCallback((listColumn: HTMLElement) => {
    const rows = listColumn.querySelectorAll('.hands-sheet__row')
    if (rows.length === 0) return
    for (const row of rows) {
      if (row instanceof HTMLElement) row.style.contentVisibility = 'visible'
    }
    void listColumn.offsetHeight
    for (const row of rows) {
      if (row instanceof HTMLElement) row.style.removeProperty('content-visibility')
    }
  }, [])

  /**
   * Update frozen panel width. Returns whether the token changed.
   * Content-visibility bust is separate — it forces layout over all rows and must only run
   * after a resize stream settles (not on every live tick).
   */
  const refreshSuggestHandsPanelCqw = useCallback(() => {
    const el = listColumnRef.current
    if (!el) return false
    const w = Math.round(el.clientWidth)
    if (!Number.isFinite(w) || w < 1) return false
    const next = `${w}px`
    if (el.style.getPropertyValue('--suggest-hands-panel-cqw') === next) return false
    el.style.setProperty('--suggest-hands-panel-cqw', next)
    return true
  }, [])

  useLayoutEffect(() => {
    const el = listColumnRef.current
    if (el) bustHandsSheetRowIntrinsicCache(el)
  }, [tilesDetailActive, bustHandsSheetRowIntrinsicCache])

  useLayoutEffect(() => {
    const el = listColumnRef.current
    if (!el) return

    const scheduler = createResizeScheduler(140)
    let cqwDirty = false
    const applyLive = () => {
      if (refreshSuggestHandsPanelCqw()) cqwDirty = true
    }
    const applySettled = () => {
      applyLive()
      if (!cqwDirty) return
      cqwDirty = false
      bustHandsSheetRowIntrinsicCache(el)
      void el.offsetHeight
    }

    applySettled()

    const settleTimers: number[] = []
    const scheduleLive = () => scheduler.live(applyLive)
    const scheduleSettled = () => scheduler.liveAndSettle(applyLive, applySettled)
    const scheduleSettledBurst = () => {
      scheduleSettled()
      for (const delay of [80, 180, 360, 400]) {
        settleTimers.push(window.setTimeout(applySettled, delay))
      }
    }

    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(scheduleSettled)
      ro.observe(el)
    } else {
      window.addEventListener('resize', scheduleSettled)
    }
    window.addEventListener('orientationchange', scheduleSettledBurst)
    window.visualViewport?.addEventListener('resize', scheduleLive)

    const panel = el.closest('.panel--hands')
    const onTransitionEnd = (ev: Event) => {
      if (ev instanceof TransitionEvent && ev.propertyName === 'transform') scheduleSettledBurst()
    }
    panel?.addEventListener('transitionend', onTransitionEnd)

    if (trayOpen) scheduleSettledBurst()

    return () => {
      scheduler.cancel()
      for (const t of settleTimers) window.clearTimeout(t)
      ro?.disconnect()
      window.removeEventListener('resize', scheduleSettled)
      window.removeEventListener('orientationchange', scheduleSettledBurst)
      window.visualViewport?.removeEventListener('resize', scheduleLive)
      panel?.removeEventListener('transitionend', onTransitionEnd)
    }
  }, [refreshSuggestHandsPanelCqw, bustHandsSheetRowIntrinsicCache, trayOpen])

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
    () => (tilesStripSlotsOn ? tileMultisetSignature(rackTilesForSuggestedStrip) : ''),
    [tilesStripSlotsOn, rackTilesForSuggestedStrip],
  )
  const stripPatternMatchRackSignature = useMemo(
    () =>
      tilesStripSlotsOn && rackTilesForPatternMatch
        ? tileMultisetSignature(rackTilesForPatternMatch)
        : '',
    [tilesStripSlotsOn, rackTilesForPatternMatch],
  )

  const displayHands = useMemo(() => {
    const base = hideConcealedHands ? filtered.filter((h) => !h.closed) : filtered
    const focusedPatternId = activePatternId ? focusKeyPatternId(activePatternId) : null
    const visible = base.filter((h) => suggestedHandShownInPanelList(h, focusedPatternId))
    const rank = new Map(cardSectionOrder.map((s, i) => [s, i]))
    return [...visible].sort((a, b) => {
      const prox = compareSuggestedHandsByProximity(a, b)
      if (prox !== 0) return prox
      const ra = rank.get(a.section) ?? 999
      const rb = rank.get(b.section) ?? 999
      if (ra !== rb) return ra - rb
      const oa = suggestedHandCardRefOrder(a)
      const ob = suggestedHandCardRefOrder(b)
      if (oa !== ob) return oa - ob
      return a.id.localeCompare(b.id)
    })
  }, [filtered, hideConcealedHands, cardSectionOrder, activePatternId])

  const listRowsForHandsPanel = displayHands

  /**
   * Full ordered list identity (no tile strips yet). Strips are built only for the virtualized
   * window below — that used to recompute ~130 greedy matches on every rack change.
   */
  const expandedHandsMeta = useMemo<ExpandedHandsRowMeta[]>(() => {
    const out: ExpandedHandsRowMeta[] = []
    for (const h of listRowsForHandsPanel) {
      const baseKey = handEntryKeyForLine(h)
      out.push({
        line: h,
        focusKey: baseKey,
        reactKey: baseKey,
        pinKey: baseKey,
      })
    }
    if (pinnedHandKeys.length === 0) return out
    const pinIndex = new Map(pinnedHandKeys.map((key, i) => [key, i]))
    return out
      .map((row, i) => ({ row, i }))
      .sort((a, b) => {
        // Pins float above proximity order (list is already proximity-sorted via `i`).
        const ap = pinIndex.has(a.row.pinKey) ? pinIndex.get(a.row.pinKey)! : null
        const bp = pinIndex.has(b.row.pinKey) ? pinIndex.get(b.row.pinKey)! : null
        if (ap !== null && bp !== null) return ap - bp || a.i - b.i
        if (ap !== null) return -1
        if (bp !== null) return 1
        return a.i - b.i
      })
      .map(({ row }) => row)
  }, [listRowsForHandsPanel, pinnedHandKeys])

  /** Alias for scroll-anchor / focus helpers that expect the historical name. */
  const expandedHandsRows = expandedHandsMeta

  const effectiveFocusRowKey = useMemo(
    () => resolveEffectiveFocusRowKey(activePatternId, expandedHandsMeta, listRowsForHandsPanel),
    [activePatternId, expandedHandsMeta, listRowsForHandsPanel],
  )

  const focusedRowIndex = useMemo(() => {
    if (effectiveFocusRowKey == null) return -1
    return expandedHandsMeta.findIndex((row) => row.focusKey === effectiveFocusRowKey)
  }, [expandedHandsMeta, effectiveFocusRowKey])

  const [virtualRange, setVirtualRange] = useState({ start: 0, end: HANDS_LIST_VIRTUAL_MIN_WINDOW })
  const measuredRowHeightRef = useRef(HANDS_LIST_ROW_H_FALLBACK)
  const [measuredRowHeight, setMeasuredRowHeight] = useState(HANDS_LIST_ROW_H_FALLBACK)
  const stripCacheRef = useRef<{
    rackSig: string
    matchSig: string
    exposureKey: string
    map: Map<string, StripRowsEntry>
  }>({ rackSig: '', matchSig: '', exposureKey: '', map: new Map() })

  const rowHeightForVirtual =
    measuredRowHeight > 0
      ? measuredRowHeight
      : tilesDetailActive
        ? HANDS_LIST_ROW_H_TILES_FALLBACK
        : HANDS_LIST_ROW_H_FALLBACK

  const syncVirtualRange = useCallback(
    (scrollEl: HTMLElement) => {
      const next = computeHandsListVirtualRange({
        scrollTop: scrollEl.scrollTop,
        viewportHeight: scrollEl.clientHeight,
        rowHeight: measuredRowHeightRef.current || rowHeightForVirtual,
        totalRows: expandedHandsMeta.length,
        focusedIndex: focusedRowIndex,
      })
      setVirtualRange((prev) =>
        prev.start === next.start && prev.end === next.end ? prev : next,
      )
    },
    [expandedHandsMeta.length, focusedRowIndex, rowHeightForVirtual],
  )

  // Reset estimated row height when Tiles mode changes; a follow-up measure replaces it.
  useLayoutEffect(() => {
    const fallback = tilesDetailActive
      ? HANDS_LIST_ROW_H_TILES_FALLBACK
      : HANDS_LIST_ROW_H_FALLBACK
    measuredRowHeightRef.current = fallback
    setMeasuredRowHeight(fallback)
  }, [tilesDetailActive])

  // Keep the focused row mounted and tighten the window when the list length changes.
  useLayoutEffect(() => {
    const scrollEl = getTrayScrollTarget()
    if (scrollEl) {
      syncVirtualRange(scrollEl)
      return
    }
    const next = computeHandsListVirtualRange({
      scrollTop: 0,
      viewportHeight: HANDS_LIST_VIRTUAL_MIN_WINDOW * rowHeightForVirtual,
      rowHeight: rowHeightForVirtual,
      totalRows: expandedHandsMeta.length,
      focusedIndex: focusedRowIndex,
    })
    setVirtualRange((prev) =>
      prev.start === next.start && prev.end === next.end ? prev : next,
    )
  }, [
    expandedHandsMeta.length,
    focusedRowIndex,
    getTrayScrollTarget,
    rowHeightForVirtual,
    syncVirtualRange,
    tilesDetailActive,
    trayOpen,
  ])

  const virtualStart = Math.min(virtualRange.start, expandedHandsMeta.length)
  const virtualEnd = Math.min(
    Math.max(virtualRange.end, virtualStart),
    expandedHandsMeta.length,
  )

  /** Keys that need strip slots: virtual window + focused hand. */
  const stripKeysNeeded = useMemo(() => {
    if (!tilesStripSlotsOn) return null as Set<string> | null
    const keys = new Set<string>()
    for (let i = virtualStart; i < virtualEnd; i++) {
      const row = expandedHandsMeta[i]
      if (row) keys.add(row.reactKey)
    }
    if (effectiveFocusRowKey) keys.add(effectiveFocusRowKey)
    return keys
  }, [
    tilesStripSlotsOn,
    expandedHandsMeta,
    virtualStart,
    virtualEnd,
    effectiveFocusRowKey,
  ])

  const stripSlotRowsByKey = useMemo(() => {
    if (!tilesStripSlotsOn || !stripKeysNeeded || rackTilesForSuggestedStrip.length === 0) {
      return new Map<string, StripRowsEntry>()
    }
    const exposureKey = [
      exposureTileIdsForSuggestedStrip
        ? [...exposureTileIdsForSuggestedStrip].join('\0')
        : '',
      exposureMeldsForSuggestedStrip
        ? exposureMeldsForSuggestedStrip
            .map((m) => m.tiles.map((t) => t.id).join(','))
            .join('|')
        : '',
    ].join('#')
    const cache = stripCacheRef.current
    if (
      cache.rackSig !== stripRackSignature ||
      cache.matchSig !== stripPatternMatchRackSignature ||
      cache.exposureKey !== exposureKey
    ) {
      cache.rackSig = stripRackSignature
      cache.matchSig = stripPatternMatchRackSignature
      cache.exposureKey = exposureKey
      cache.map = new Map()
    }

    const rackDisplay = rackTilesForSuggestedStrip
    const rackMatch = rackTilesForPatternMatch ?? rackDisplay
    const greedyOpts: GreedyPatternMatchOpts | undefined =
      exposureTileIdsForSuggestedStrip?.size
        ? { exposureTileIds: exposureTileIdsForSuggestedStrip }
        : undefined
    const rackIdSet = new Set(rackMatch.map((t) => t.id))
    const lineByKey = new Map<string, SuggestedHandLine>()
    for (const h of filtered) {
      lineByKey.set(handEntryKey(h), h)
    }
    const boxMelds = exposureMeldsForSuggestedStrip?.length
      ? exposureMeldsForSuggestedStrip
      : undefined

    for (const key of stripKeysNeeded) {
      if (cache.map.has(key)) continue
      const h = lineByKey.get(key)
      if (!h) {
        cache.map.set(key, { rows: [], ocVariantSuffixes: [] })
        continue
      }
      const p = cardPatternsById.get(h.id)
      if (!p) {
        cache.map.set(key, { rows: [], ocVariantSuffixes: [] })
        continue
      }
      if (h.consecRanksTier) {
        const rows: SuggestedStripSlot[][] = []
        for (const { perm, base } of h.consecRanksTier.combos) {
          const row = buildConsecRanksTierStripRow(p, rackMatch, perm, base, rackDisplay)
          if (!row) continue
          if (boxMelds) {
            const detail = greedyPatternMatchDetail(rackMatch, p, greedyOpts)
            const bestIdsForAssign = new Set(detail.usedOrder.filter((id) => rackIdSet.has(id)))
            rows.push(
              realignSuggestedStripToClaimMelds(
                row,
                p,
                boxMelds,
                rackMatch,
                detail.usedOrder,
                bestIdsForAssign,
                detail.usedMeta,
                exposureTileIdsForSuggestedStrip,
              ),
            )
          } else {
            rows.push(row)
          }
        }
        cache.map.set(key, { rows, ocVariantSuffixes: [] })
        continue
      }
      const detail = greedyPatternMatchDetail(rackMatch, p, greedyOpts)
      const bestIdsForAssign = new Set(detail.usedOrder.filter((id) => rackIdSet.has(id)))
      if (bestIdsForAssign.size === 0) {
        for (const t of rackMatch) {
          if (p.matches(t.def)) bestIdsForAssign.add(t.id)
        }
      }
      // Match rack (exposure jokers resolved to stand-ins) for strip assignment — suit-permute
      // variant rows re-run greedy, and the display rack would treat a committed expose joker as a
      // flexible fill (e.g. 5B-kong joker lighting a third 3C on Runs #4b).
      const result = buildSuggestedStripSlotRowsWithVariants(
        p,
        rackMatch,
        detail.usedOrder,
        bestIdsForAssign,
        detail.usedMeta,
        exposureTileIdsForSuggestedStrip,
        boxMelds,
      )
      cache.map.set(key, {
        rows: result.rows,
        ocVariantSuffixes: result.ocVariantSuffixes,
      })
    }

    const m = new Map<string, StripRowsEntry>()
    for (const key of stripKeysNeeded) {
      const entry = cache.map.get(key)
      if (entry) m.set(key, entry)
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tilesStripSlotsOn,
    stripKeysNeeded,
    filtered,
    stripRackSignature,
    stripPatternMatchRackSignature,
    exposureTileIdsForSuggestedStrip,
    exposureMeldsForSuggestedStrip,
    handEntryKey,
    cardPatternsById,
    rackTilesForSuggestedStrip,
    rackTilesForPatternMatch,
  ])

  const windowedHandsRows = useMemo<ExpandedHandsRow[]>(() => {
    const slice = expandedHandsMeta.slice(virtualStart, virtualEnd)
    return slice.map((row) => ({
      ...row,
      stripSlots: tilesStripSlotsOn
        ? stripSlotsForPanelRow(row.line.id, activePatternId, stripSlotRowsByKey.get(row.reactKey))
        : undefined,
    }))
  }, [
    expandedHandsMeta,
    virtualStart,
    virtualEnd,
    tilesStripSlotsOn,
    stripSlotRowsByKey,
    activePatternId,
  ])

  const virtualTopPadPx = virtualStart * rowHeightForVirtual
  const virtualBottomPadPx = Math.max(0, (expandedHandsMeta.length - virtualEnd) * rowHeightForVirtual)

  const refreshHandsAboveViewHint = useCallback(() => {
    const scrollEl = getTrayScrollTarget()
    const next = scrollEl ? isTopSuggestedHandHidden(scrollEl) : false
    setHasHandsAboveView((prev) => (prev === next ? prev : next))
  }, [getTrayScrollTarget])

  const refreshScrollSnapshot = useCallback(
    (rowKeys?: string[]) => {
      const scrollEl = getTrayScrollTarget()
      if (!scrollEl) return
      const snap = handsListScrollSnapshotRef.current
      const anchorPatternLineId = effectiveFocusRowKey
        ? focusKeyPatternId(effectiveFocusRowKey)
        : null
      const focusStillInList =
        effectiveFocusRowKey != null &&
        (expandedHandsMeta.some((r) => r.focusKey === effectiveFocusRowKey) ||
          (anchorPatternLineId != null &&
            expandedHandsMeta.some((r) => r.line.id === anchorPatternLineId)))

      // Call-staging can briefly drop the focused line (or empty the tray) while the exposure is
      // still growable. Keep the prior pin so the row returns highlighted in the same viewport spot.
      if (
        retainFocusWhenPatternMissing &&
        effectiveFocusRowKey != null &&
        !focusStillInList
      ) {
        handsListScrollSnapshotRef.current = {
          ...snap,
          rowKeys:
            rowKeys && rowKeys.length > 0
              ? rowKeys
              : snap.rowKeys.length > 0
                ? snap.rowKeys
                : rowKeys ?? snap.rowKeys,
          anchorKey: snap.anchorKey ?? effectiveFocusRowKey,
          anchorPatternId: snap.anchorPatternId ?? anchorPatternLineId,
          scrollTop: scrollEl.scrollTop,
        }
        return
      }

      const anchor = findScrollRowAnchor(
        scrollEl,
        effectiveFocusRowKey,
        anchorPatternLineId,
      )
      // When the anchor is outside the virtual window, estimate viewport top from index * rowH.
      let viewportTop = anchor?.viewportTop ?? 0
      let anchorKey = anchor?.key ?? null
      let anchorPatternId = anchor?.patternId ?? null
      if (!anchor && effectiveFocusRowKey) {
        let idx = expandedHandsMeta.findIndex((r) => r.focusKey === effectiveFocusRowKey)
        if (idx < 0 && anchorPatternLineId != null) {
          idx = expandedHandsMeta.findIndex((r) => r.line.id === anchorPatternLineId)
        }
        if (idx >= 0) {
          viewportTop = idx * rowHeightForVirtual - scrollEl.scrollTop
          anchorKey = expandedHandsMeta[idx]!.focusKey
          anchorPatternId = anchorPatternLineId
        }
      }
      handsListScrollSnapshotRef.current = {
        rowKeys: rowKeys ?? snap.rowKeys,
        anchorKey,
        anchorPatternId,
        anchorViewportTop: viewportTop,
        scrollTop: scrollEl.scrollTop,
      }
    },
    [
      effectiveFocusRowKey,
      getTrayScrollTarget,
      expandedHandsMeta,
      rowHeightForVirtual,
      retainFocusWhenPatternMissing,
    ],
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
    setActiveAwayTrend({
      focusKey: effectiveFocusRowKey,
      trend: currentAway < prevAway ? 'improved' : 'behind-best',
    })
  }, [effectiveFocusRowKey, expandedHandsMeta])

  useEffect(() => {
    const scrollEl = getTrayScrollTarget()
    if (!scrollEl) return
    // Coalesce scroll events to one snapshot per animation frame. The snapshot does layout
    // reads (getBoundingClientRect / elementFromPoint); running it on every raw scroll event
    // saturates the main thread mid-scroll and causes the WebView to blank whole rows.
    let rafId: number | null = null
    const onScroll = () => {
      if (scrollEl.scrollLeft !== 0) scrollEl.scrollLeft = 0
      if (rafId != null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        syncVirtualRange(scrollEl)
        refreshScrollSnapshot()
        refreshHandsAboveViewHint()
      })
    }
    scrollEl.addEventListener('scroll', onScroll, { passive: true })
    syncVirtualRange(scrollEl)
    refreshHandsAboveViewHint()
    return () => {
      scrollEl.removeEventListener('scroll', onScroll)
      if (rafId != null) cancelAnimationFrame(rafId)
    }
  }, [
    getTrayScrollTarget,
    refreshScrollSnapshot,
    refreshHandsAboveViewHint,
    syncVirtualRange,
    expandedHandsMeta.length,
  ])

  useLayoutEffect(() => {
    const scrollEl = getTrayScrollTarget()
    if (!scrollEl) return

    const rowKeys = rowKeysInOrder(expandedHandsMeta)
    const prev = handsListScrollSnapshotRef.current
    const focusChanged = prevEffectiveFocusRowKeyRef.current !== effectiveFocusRowKey
    prevEffectiveFocusRowKeyRef.current = effectiveFocusRowKey
    const fallbackH = rowHeightForVirtual

    // Toggling "Tiles" changes every row's height without necessarily reordering the list. That
    // height change alone shifts the anchored row out of view (scrollTop stays put while content
    // grows/shrinks above it), so treat it like a re-rank and re-pin the anchor to its prior spot.
    const tilesToggled =
      prevTilesDetailActiveRef.current != null &&
      prevTilesDetailActiveRef.current !== tilesDetailActive
    prevTilesDetailActiveRef.current = tilesDetailActive

    // At the very top with nothing selected, let the list re-rank from the top down (the "best"
    // hands are what you're looking at). Otherwise keep the viewed rows visually pinned so a hand
    // sorting in above/below doesn't push the rows you're reading up or down.
    const atTopNoSelection = effectiveFocusRowKey == null && prev.scrollTop <= 1
    const keysChanged =
      prev.rowKeys.length > 0 && rowKeysOrderChanged(prev.rowKeys, rowKeys)

    if (
      !atTopNoSelection &&
      (keysChanged || tilesToggled) &&
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
      const samePatternAsPrev =
        anchorPatternId != null &&
        prev.anchorPatternId != null &&
        anchorPatternId === prev.anchorPatternId
      const prevAnchoredFocus =
        effectiveFocusRowKey != null &&
        (prev.anchorKey === effectiveFocusRowKey ||
          prev.anchorKey === anchorKey ||
          (prev.anchorPatternId != null &&
            anchorPatternId != null &&
            prev.anchorPatternId === anchorPatternId))
      // Highlighted row: pin to the viewport position it held before the re-rank (Tiles on/off).
      // During call-staging retain-focus, pin whenever we still have a prior anchor sample —
      // growable exposures re-rank often and must not kick the row out of view.
      const pinHighlightedRow =
        effectiveFocusRowKey != null &&
        (samePatternAsPrev ||
          prevAnchoredFocus ||
          (retainFocusWhenPatternMissing &&
            (prev.anchorKey != null || prev.anchorPatternId != null)))
      if (pinHighlightedRow && anchorRow) {
        const currentViewportTop = rowViewportTopInScrollContainer(anchorRow, scrollEl, scrollRect)
        delta = currentViewportTop - prev.anchorViewportTop
      } else if (pinHighlightedRow && !anchorRow && anchorKey) {
        // Anchor outside the virtual window — estimate from index × measured row height.
        let nextIdx = rowKeys.indexOf(anchorKey)
        if (nextIdx === -1 && anchorPatternId != null) {
          nextIdx = rowKeys.findIndex((k) => focusKeyPatternId(k) === anchorPatternId)
        }
        if (nextIdx !== -1) {
          const expectedViewportTop = nextIdx * fallbackH - scrollEl.scrollTop
          delta = expectedViewportTop - prev.anchorViewportTop
        }
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
          delta = scrollDeltaForRowsInsertedAbove(
            scrollEl,
            prev.rowKeys,
            rowKeys,
            anchorKey,
            anchorPatternId,
            fallbackH,
          )
        } else if (anchorRow && prev.anchorKey === anchorKey) {
          const currentViewportTop = rowViewportTopInScrollContainer(anchorRow, scrollEl, scrollRect)
          delta = currentViewportTop - prev.anchorViewportTop
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

      // Safety: if pin math still left the focused row off-screen (e.g. recovering after a brief
      // empty tray during growable staging), nudge just enough to bring it back into view.
      if (retainFocusWhenPatternMissing && effectiveFocusRowKey != null) {
        let focusIdx = rowKeys.indexOf(effectiveFocusRowKey)
        if (focusIdx === -1 && anchorPatternId != null) {
          focusIdx = rowKeys.findIndex((k) => focusKeyPatternId(k) === anchorPatternId)
        }
        if (focusIdx >= 0) {
          const rowTop = focusIdx * fallbackH
          const rowBottom = rowTop + fallbackH
          const viewTop = scrollEl.scrollTop
          const viewBottom = viewTop + scrollEl.clientHeight
          if (rowTop < viewTop) {
            scrollEl.scrollTop = Math.round(rowTop)
          } else if (rowBottom > viewBottom) {
            scrollEl.scrollTop = Math.round(Math.max(0, rowBottom - scrollEl.clientHeight))
          }
        }
      }
    } else if (focusChanged && effectiveFocusRowKey != null && !keysChanged) {
      refreshScrollSnapshot(rowKeys)
      refreshHandsAboveViewHint()
      return
    }

    refreshScrollSnapshot(rowKeys)
    refreshHandsAboveViewHint()
    syncVirtualRange(scrollEl)
  }, [
    expandedHandsMeta,
    effectiveFocusRowKey,
    getTrayScrollTarget,
    refreshScrollSnapshot,
    refreshHandsAboveViewHint,
    rowHeightForVirtual,
    syncVirtualRange,
    tilesDetailActive,
    retainFocusWhenPatternMissing,
  ])

  // Measure a real mounted row so spacers match live height (font scales with panel cqi).
  useLayoutEffect(() => {
    const scrollEl = getTrayScrollTarget()
    const row = scrollEl?.querySelector(':scope > .hands-sheet__row')
    if (!(row instanceof HTMLElement)) return
    const h = row.getBoundingClientRect().height
    if (!(h > 0)) return
    measuredRowHeightRef.current = h
    setMeasuredRowHeight((prev) => (Math.abs(prev - h) < 0.5 ? prev : h))
  }, [getTrayScrollTarget, windowedHandsRows, tilesDetailActive])

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
    if (
      !retainFocusWhenPatternMissing &&
      !listRowsForHandsPanel.some((h) => h.id === patternId)
    ) {
      onFocusKeyMigrate(null)
    }
  }, [
    activePatternId,
    expandedHandsRows,
    listRowsForHandsPanel,
    onFocusKeyMigrate,
    retainFocusWhenPatternMissing,
  ])

  const handsListOn = true
  const showHandCategoryLabels = handsListOn
  /** Same pin | category | hand | away | values sheet for hands-only and hands+tiles (tiles swap into detail row). */
  const handsListSpreadsheetHands = handsListOn
  const showSuggestedListContent = handsListOn || tilesGuideOn

  const rowHitGridStyle = useMemo((): CSSProperties => {
    if (handsListSpreadsheetHands) {
      return {
        gridTemplateAreas: showPinColumn
          ? "'pin section hand away odds values'"
          : "'section hand away odds values'",
      }
    }
    return {
      gridTemplateAreas: handsRowGridTemplateAreas(
        showHandCategoryLabels,
        tilesGuideOn,
        showPinColumn,
      ),
    }
  }, [
    handsListSpreadsheetHands,
    showHandCategoryLabels,
    tilesGuideOn,
    showPinColumn,
  ])

  const rootClassName = [
    'panel',
    'panel--hands',
    !showHandProbability ? 'panel--hands-hide-prob' : '',
    !showPinColumn ? 'panel--hands-no-pin' : '',
    discardTraySurface ? 'suggested-hands-popup__user-shift' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const cardContentAvailable = isCardContentAvailable()

  return (
    <section className={rootClassName} aria-label="Suggested hands" data-nosnippet>
      <div className="hands-panel__content">
          <div ref={listColumnRef} className="hands-panel__list-column">
            {!cardContentAvailable ? (
              <p className="hands-panel__card-locked" data-nosnippet>
                Card hands are unavailable in this build.
              </p>
            ) : null}
            <div
              ref={handsListScrollRef}
              className="hands-list-scroll"
              hidden={!cardContentAvailable}
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
                  className="hands-sheet__cell hands-sheet__cell--header hands-sheet__cell--odds"
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
                    tilesDetailActive ? 'hands-sheet--detail-tiles' : '',
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
                  >
                    {cardColumnLabel}
                  </div>
                  <div
                    className={[
                      'hands-sheet__cell',
                      'hands-sheet__cell--header',
                      'hands-sheet__cell--away',
                      hasHandsAboveView ? 'hands-sheet__cell--scroll-above' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    role="columnheader"
                  >
                    {hasHandsAboveView ? <SuggestedHandsScrollAboveHint /> : null}
                    Away
                  </div>
                {showHandProbability ? (
                  <div
                    className="hands-sheet__cell hands-sheet__cell--header hands-sheet__cell--odds"
                    role="columnheader"
                  >
                    Prob %
                  </div>
                ) : (
                  <div
                    className="hands-sheet__cell hands-sheet__cell--header hands-sheet__cell--odds"
                    role="columnheader"
                    aria-hidden
                  />
                )}
                  <div
                    className="hands-sheet__cell hands-sheet__cell--header hands-sheet__cell--values"
                    role="columnheader"
                  >
                    Points
                  </div>
                  <ol className="hands-sheet__rows" aria-label="Suggested hand lines">
                    {virtualTopPadPx > 0 ? (
                      <li
                        className="hands-sheet__virtual-spacer"
                        style={{ height: virtualTopPadPx }}
                        aria-hidden
                      />
                    ) : null}
                    {windowedHandsRows.map((row) => {
                      const focusKey = row.focusKey
                      const rowIsFocused = isSuggestedHandsRowFocused(
                        focusKey,
                        activePatternId,
                        effectiveFocusRowKey,
                      )
                      const rowDeadCause = rowIsFocused
                        ? resolveRowDeadCause(
                            deadCauseByFocusKey,
                            activePatternId,
                            effectiveFocusRowKey,
                            focusKey,
                            focusKeyPatternId(focusKey),
                          )
                        : null
                      const cardHandDeadCause = cardHandDeadCauseForRow(
                        rowIsFocused,
                        focusedHandDeadCause,
                        rowDeadCause,
                      )
                      return (
                        <SuggestedHandsSheetRow
                          key={row.reactKey}
                          row={row}
                          rowIsFocused={rowIsFocused}
                          awayTrend={
                            rowIsFocused && activeAwayTrend?.focusKey === focusKey
                              ? activeAwayTrend.trend
                              : null
                          }
                          rowDeadCause={rowDeadCause}
                          cardHandDeadCause={cardHandDeadCause}
                          tilesGuideOn={tilesGuideOn}
                          tilesDetailActive={tilesDetailActive}
                          showHandProbability={showHandProbability}
                          isPinned={pinnedKeySet.has(row.pinKey)}
                          showPinColumn={showPinColumn}
                          blankExchangeTargetDefs={blankExchangeTargetDefs}
                          bindPatternRowInteraction={bindPatternRowInteraction}
                          onPinToggle={emitRowPinToggle}
                        />
                      )
                    })}
                    {virtualBottomPadPx > 0 ? (
                      <li
                        className="hands-sheet__virtual-spacer"
                        style={{ height: virtualBottomPadPx }}
                        aria-hidden
                      />
                    ) : null}
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
                {showHandCategoryLabels && tilesDetailActive ? (
                  <>
                    <div
                      className={[
                        'hands-list__cell',
                        'hands-list__cell--tiles-odds-pad',
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
                    'hands-list__cell--odds',
                    'hands-list__header-cell',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-hidden={!showHandProbability}
                >
                  {showHandProbability ? (
                    <div className="hands-list__header-meta">Prob %</div>
                  ) : null}
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
              {expandedHandsMeta.map((meta) => {
                const row: ExpandedHandsRow = {
                  ...meta,
                  stripSlots: stripSlotsForPanelRow(
                    meta.line.id,
                    activePatternId,
                    stripSlotRowsByKey.get(meta.reactKey),
                  ),
                }
                const focusKey = row.focusKey
                const rowIsFocused = isSuggestedHandsRowFocused(
                  focusKey,
                  activePatternId,
                  effectiveFocusRowKey,
                )
                const rowDeadCause = rowIsFocused
                  ? resolveRowDeadCause(
                      deadCauseByFocusKey,
                      activePatternId,
                      effectiveFocusRowKey,
                      focusKey,
                      focusKeyPatternId(focusKey),
                    )
                  : null
                const cardHandDeadCause = cardHandDeadCauseForRow(
                  rowIsFocused,
                  focusedHandDeadCause,
                  rowDeadCause,
                )
                return (
                  <SuggestedHandsCompactListRow
                    key={row.reactKey}
                    row={row}
                    rowIsFocused={rowIsFocused}
                    rowDeadCause={rowDeadCause}
                    cardHandDeadCause={cardHandDeadCause}
                    tilesGuideOn={tilesGuideOn}
                    tilesDetailActive={tilesDetailActive}
                    handsListOn={handsListOn}
                    showHandCategoryLabels={showHandCategoryLabels}
                    showHandProbability={showHandProbability}
                    rowHitGridStyle={rowHitGridStyle}
                    isPinned={pinnedKeySet.has(row.pinKey)}
                    showPinColumn={showPinColumn}
                    blankExchangeTargetDefs={blankExchangeTargetDefs}
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
