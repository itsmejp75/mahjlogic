import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type Dispatch,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
  type SetStateAction,
} from 'react'
import {
  buildConsecRanksTierStripRow,
  buildSuggestedStripSlotRowsWithVariants,
  greedyPatternMatchDetail,
  type GreedyPatternMatchOpts,
  type SuggestedStripSlot,
  suggestedHandCardRefDisplay,
  suggestedHandCardRefOrder,
} from '../analysis/suggestedHands'
import type { CardInk } from '../card/cardText'
import type { PracticePattern } from '../card/practicePatterns'
import type { TileDef, TileInstance } from '../mahjong/types'
import type { SuggestedHandLine } from '../training/types'
import { suggestedHandSectionMenuLabel } from '../suggestedHands/filterSettings'
import { CardColoredText } from './CardColoredText'
import { TileFace } from './TileFace'

const CLICK_DELAY_MS = 280
const PEEK_DRAG_THRESHOLD_PX = 10
const PEEK_DRAG_CLICK_SUPPRESS_MS = 180
/** Blocks pass-through + rack ghost taps while resizing the discard overlay (see part-0104.css). */
const PEEK_DRAG_SHELL_CLASS = 'suggested-hands-popup--peek-dragging'
/** Used when the sheet has not laid out yet (no measurable header/row). */
const SUGGESTED_SHEET_MIN_FALLBACK_PX = 112

type StripRowsEntry = {
  rows: SuggestedStripSlot[][]
  ocVariantSuffixes: string[]
  ocAllSuffix: string
}

function handEntryKeyForLine(h: SuggestedHandLine): string {
  return h.consecRanksTier
    ? `${h.id}::tier::${h.consecRanksTier.combos.map((c) => `${c.base}:${c.perm.join('-')}`).join('|')}`
    : h.id
}

/** Stable id for one suggested-hands row pin (matches strip `allKey` / list `categoryClickKey`). */
function suggestedRowPinKey(h: SuggestedHandLine, stripEntry: StripRowsEntry | undefined): string {
  const rowStripVariants = stripEntry?.rows ?? []
  const showVariantStack = rowStripVariants.length > 1
  if (showVariantStack && !h.consecRanksTier && stripEntry?.ocAllSuffix) {
    return `${h.id}::${stripEntry.ocAllSuffix}`
  }
  return handEntryKeyForLine(h)
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

/** NMJL card value: concealed lines show C + points on the card; exposed lines show points only (no X). */
function formatSuggestedHandValue(points: number, closed: boolean): string {
  return closed ? `C${points}` : `${points}`
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

function SuggestedHandValueDisplay({
  points,
  closed,
  variant = 'sheet',
}: {
  points: number
  closed: boolean
  /** `list` = compact hands list; `sheet` = spreadsheet — boxed C matches the hand-line marker in that layout. */
  variant?: 'list' | 'sheet'
}) {
  const cClass = variant === 'list' ? 'hands-list__card-c' : 'hands-sheet__card-c'
  if (closed) {
    return (
      <>
        <span className={cClass} aria-label="Concealed hand">
          C
        </span>
        {points}
      </>
    )
  }
  return <>{points}</>
}

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

function renderSheetTileRow(
  slots: SuggestedStripSlot[],
  isActiveRow: boolean,
  keyPrefix: string,
) {
  return (
    <div className="hands-sheet__tiles-grid" role="presentation">
      {slots.map((slot, i) => {
        const showJokerGuide = isActiveRow && slot.jokerSuggested
        const suggestBest = isActiveRow && slot.highlight
        const dim = isActiveRow && !slot.highlight && !slot.jokerSuggested
        return (
          <div
            key={`${keyPrefix}-${i}`}
            className={[
              'hands-sheet__tile-cell',
              showJokerGuide ? 'hands-sheet__tile-cell--suggest-joker' : '',
              suggestBest ? 'hands-sheet__tile-cell--suggest-best' : '',
              dim ? 'hands-sheet__tile-cell--suggest-dim' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <TileFace
              def={slot.displayDef}
              cardInk={stripTileFaceCardInk(slot.displayDef, slot.cardInk)}
            />
            {showJokerGuide ? (
              <span className="hands-sheet__tile-joker-mark">JOKER</span>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

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

function SuggestedHandPinCell({
  pressed,
  onToggle,
}: {
  pressed: boolean
  onToggle: () => void
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
        onToggle()
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
}

type Props = {
  hands: SuggestedHandLine[]
  activePatternId: string | null
  /** Pinned suggested row keys (see {@link suggestedRowPinKey}). Toggle via {@link onPinnedPatternChange}. */
  pinnedHandKeys?: readonly string[]
  onPatternClick: (handKey: string) => void
  onPatternDoubleClick: (patternId: string, focusKey?: string) => void
  tilesGuideOn: boolean
  onTilesGuideToggle?: () => void
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
  onUncheckedSectionsChange: Dispatch<SetStateAction<Set<string>>>
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
}

export function SuggestedHandsPanel({
  hands,
  activePatternId,
  pinnedHandKeys = [],
  onPatternClick,
  onPatternDoubleClick,
  tilesGuideOn,
  onTilesGuideToggle,
  rackTilesForSuggestedStrip,
  rackTilesForPatternMatch,
  exposureTileIdsForSuggestedStrip,
  uncheckedSections,
  onUncheckedSectionsChange,
  hideConcealedHands,
  cardPatterns,
  cardSectionOrder,
  discardTraySurface,
  onTrayHeaderClick,
  discardOverlayPeekPx = 0,
  onDiscardOverlayPeekPxChange,
  discardOverlayMeasureRef,
  onPinnedPatternChange,
}: Props) {
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
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const peekDragRef = useRef<{
    pointerId: number
    startY: number
    startPeek: number
  } | null>(null)
  const headerPointerSlopRef = useRef(false)
  /** Pointerdown target when a discard-overlay header peek-drag may start (used for tap-to-dismiss). */
  const headerPointerDownTargetRef = useRef<Element | null>(null)
  const suppressHeaderClickUntilRef = useRef(0)
  const peekDragShellSuppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const discardOverlayPeekRef = useRef(discardOverlayPeekPx)
  useEffect(() => {
    discardOverlayPeekRef.current = discardOverlayPeekPx
  }, [discardOverlayPeekPx])

  const handsListScrollRef = useRef<HTMLDivElement>(null)
  const minSheetHeightPxRef = useRef(SUGGESTED_SHEET_MIN_FALLBACK_PX)

  /** If every section that appears in the current ranking is turned off, revert to all on. */
  useEffect(() => {
    if (sections.length === 0) return
    const anyVisible = sections.some((s) => !uncheckedSections.has(s))
    if (anyVisible) return
    onUncheckedSectionsChange(new Set())
  }, [sections, uncheckedSections, onUncheckedSectionsChange])

  useEffect(
    () => () => {
      if (clickTimerRef.current != null) clearTimeout(clickTimerRef.current)
    },
    [],
  )

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

  const scheduleSingleClick = useCallback(
    (patternId: string) => {
      if (clickTimerRef.current != null) clearTimeout(clickTimerRef.current)
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null
        onPatternClick(patternId)
      }, CLICK_DELAY_MS)
    },
    [onPatternClick],
  )

  const cancelScheduledClick = useCallback(() => {
    if (clickTimerRef.current != null) {
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }
  }, [])

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
        m.set(key, { rows: [], ocVariantSuffixes: [], ocAllSuffix: '' })
        continue
      }
      if (h.consecRanksTier) {
        const rows: SuggestedStripSlot[][] = []
        for (const { perm, base } of h.consecRanksTier.combos) {
          const row = buildConsecRanksTierStripRow(p, rackMatch, perm, base, rackDisplay)
          if (row) rows.push(row)
        }
        m.set(key, { rows, ocVariantSuffixes: [], ocAllSuffix: '' })
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
        ocAllSuffix: result.ocAllSuffix,
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
      const entry = stripSlotRowsByKey.get(handEntryKeyForLine(h))
      const key = suggestedRowPinKey(h, entry)
      return pinIndex.has(key) ? pinIndex.get(key)! : null
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

  const emitRowPinToggle = useCallback(
    (pinKey: string) => {
      onPinnedPatternChange?.(pinKey)
    },
    [onPinnedPatternChange],
  )

  useEffect(() => {
    if (activePatternId == null) return
    const matches = listRowsForHandsPanel.some((h) => {
      if (handEntryKey(h) === activePatternId) return true
      if (h.consecRanksTier) {
        return h.consecRanksTier.combos.some(
          (c) => `${h.id}::tier::${c.base}:${c.perm.join('-')}` === activePatternId,
        )
      }
      if (
        activePatternId.startsWith(`${h.id}::oc::`) ||
        activePatternId.startsWith(`${h.id}::ocall::`)
      ) {
        return true
      }
      return false
    })
    if (matches) return
    onPatternClick(activePatternId)
  }, [activePatternId, listRowsForHandsPanel, onPatternClick, handEntryKey])

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

  const displayModeHeaderButtons = (
    <div className="hands-sheet__display-toggles" role="toolbar" aria-label="Suggested hands display">
      <button
        type="button"
        className={[
          'hands-sheet__display-toggle',
          tilesGuideOn ? 'hands-sheet__display-toggle--on' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-pressed={tilesGuideOn}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onTilesGuideToggle?.()
        }}
      >
        Tiles
      </button>
    </div>
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
      /*
       * Header peek-drag uses setPointerCapture on this scroll root. That would swallow the
       * Tiles toggle button's pointer stream so it never receives a real `click`.
       */
      if (t.closest('.hands-sheet__display-toggles')) return
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
      peekDragRef.current = {
        pointerId: e.pointerId,
        startY: e.clientY,
        startPeek: discardOverlayPeekRef.current,
      }
      headerPointerSlopRef.current = false
      syncPeekDragShellBlock('active')
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [onDiscardOverlayPeekPxChange, discardOverlayMeasureRef, syncPeekDragShellBlock],
  )

  const handleScrollPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const d = peekDragRef.current
      if (!d || e.pointerId !== d.pointerId || !onDiscardOverlayPeekPxChange) return
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
       * Peek is added to the content-align inset (0 = flush to discard content top).
       * Negative peek drags the sheet up into the exposure band; positive reveals discards.
       */
      const minPeek = -topExtendPx
      const maxPeek = Math.max(0, shellH - topExtendPx - minH)
      onDiscardOverlayPeekPxChange(
        Math.max(minPeek, Math.min(maxPeek, d.startPeek + dy)),
      )
    },
    [onDiscardOverlayPeekPxChange, discardOverlayMeasureRef],
  )

  const handleScrollPointerUpOrCancel = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const d = peekDragRef.current
      if (!d || e.pointerId !== d.pointerId) return
      const downTarget = headerPointerDownTargetRef.current
      headerPointerDownTargetRef.current = null
      peekDragRef.current = null
      const hadSlop = headerPointerSlopRef.current
      if (hadSlop) {
        suppressHeaderClickUntilRef.current = performance.now() + PEEK_DRAG_CLICK_SUPPRESS_MS
        e.preventDefault()
        syncPeekDragShellBlock('suppress')
      } else {
        syncPeekDragShellBlock('off')
      }
      headerPointerSlopRef.current = false
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* capture already released */
      }
      /*
       * `setPointerCapture` on header pointerdown (peek drag) prevents a reliable `click` on the
       * scroll container — dismiss from pointerup for a tap (no slop), excluding pin / buttons.
       */
      if (
        onTrayHeaderClick &&
        !hadSlop &&
        downTarget instanceof Element &&
        !downTarget.closest('.hands-suggested-pin') &&
        !downTarget.closest('button') &&
        (downTarget.closest('.hands-list__freeze-header') ||
          downTarget.closest('.hands-sheet__cell--header'))
      ) {
        onTrayHeaderClick()
        suppressHeaderClickUntilRef.current = performance.now() + 80
      }
    },
    [onTrayHeaderClick, syncPeekDragShellBlock],
  )

  const handleTrayHeaderAreaClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (performance.now() < suppressHeaderClickUntilRef.current) {
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
                >
                  {displayModeHeaderButtons}
                </div>
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
                  >
                    Category
                  </div>
                  <div
                    className="hands-sheet__cell hands-sheet__cell--header hands-sheet__cell--hand"
                    role="columnheader"
                  >
                    {displayModeHeaderButtons}
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
                    {listRowsForHandsPanel.map((h) => {
                      const rowKey = handEntryKey(h)
                      const stripEntry = stripSlotRowsByKey.get(handEntryKey(h))
                      const rowStripSlots = stripEntry?.rows[0] ?? []
                      const rowPinKey = suggestedRowPinKey(h, stripEntry)
                      const rowIsFocused = activePatternId === rowKey
                      const rowLit = tilesGuideOn && rowIsFocused
                      const cardRef = suggestedHandCardRefDisplay(h)
                      const ariaLabel = `${suggestedHandSectionMenuLabel(h.section)} - ${cardRef}, ${h.title}, ${h.tilesNeededRough} tiles away, ${formatSuggestedHandValue(h.points, h.closed)}`
                      return (
                        <li
                          key={rowKey}
                          className={[
                            'hands-sheet__row',
                            rowIsFocused ? 'hands-sheet__row--active' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          role="row"
                        >
                          {onPinnedPatternChange ? (
                            <div className="hands-sheet__cell hands-sheet__cell--pin" role="cell">
                              <SuggestedHandPinCell
                                pressed={pinnedHandKeys.includes(rowPinKey)}
                                onToggle={() => emitRowPinToggle(rowPinKey)}
                              />
                            </div>
                          ) : null}
                          <button
                            type="button"
                            className="hands-sheet__row-btn"
                            onClick={() => scheduleSingleClick(rowKey)}
                            onDoubleClick={(e) => {
                              e.preventDefault()
                              cancelScheduledClick()
                              onPatternDoubleClick(h.id)
                            }}
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
                              </span>
                              {(() => {
                                const parenText = !tilesGuideOn ? suggestedHandParenText(h) : null
                                const showTileDetail = tilesGuideOn && rowStripSlots.length > 0
                                return (
                                  <div
                                    className="hands-sheet__hand-stack"
                                    aria-label={h.title}
                                  >
                                    <div className="hands-sheet__hand-stack-main">
                                      <span className="hands-sheet__hand-title-line">
                                        {h.titleSegments?.length ? (
                                          <>
                                            <CardColoredText segments={h.titleSegments} />
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
                                        {renderSheetTileRow(rowStripSlots, rowLit, rowKey)}
                                      </div>
                                    ) : parenText ? (
                                      <div className="hands-sheet__hand-stack-detail">
                                        <span className="hands-sheet__paren">{parenText}</span>
                                      </div>
                                    ) : null}
                                  </div>
                                )
                              })()}
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
                              <SuggestedHandValueDisplay points={h.points} closed={h.closed} />
                            </div>
                          </button>
                        </li>
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
                      <span className="hands-list__header-meta hands-list__with-tiles-category">
                        Category
                      </span>
                    ) : (
                      <div className="hands-list__header-category-pair">
                        <span className="hands-list__header-meta hands-list__header-pair--category">
                          Category
                        </span>
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
              {listRowsForHandsPanel.map((h) => {
                const stripEntry = stripSlotRowsByKey.get(handEntryKey(h))
                const rowStripVariants = stripEntry?.rows ?? []
                const rowStripSlots = rowStripVariants[0] ?? []
                const showConsecVariantStack = tilesGuideOn && rowStripVariants.length > 1
                const variantKeys: string[] = showConsecVariantStack
                  ? h.consecRanksTier
                    ? h.consecRanksTier.combos.map((c) => `${h.id}::tier::${c.base}:${c.perm.join('-')}`)
                    : (stripEntry?.ocVariantSuffixes.length === rowStripVariants.length
                        ? stripEntry!.ocVariantSuffixes.map((suf) => `${h.id}::${suf}`)
                        : [])
                  : []
                const categoryClickKey = showConsecVariantStack && !h.consecRanksTier && stripEntry?.ocAllSuffix
                  ? `${h.id}::${stripEntry.ocAllSuffix}`
                  : handEntryKey(h)
                const rowPinKey = suggestedRowPinKey(h, stripEntry)
                const rowIsFocused = activePatternId === handEntryKey(h) ||
                  activePatternId === categoryClickKey ||
                  (variantKeys.length > 0 && variantKeys.some((k) => k === activePatternId))
                const cardRef = suggestedHandCardRefDisplay(h)
                const rowAriaLabel =
                  !handsListOn || !showHandCategoryLabels
                    ? `${suggestedHandSectionMenuLabel(h.section)} - ${cardRef}, ${h.title}, ${h.tilesNeededRough} tiles away, ${formatSuggestedHandValue(h.points, h.closed)}`
                    : undefined
                const outerClass = [
                  'hands-list__row-hit',
                  'hands-list__row-hit--with-tiles',
                  showHandCategoryLabels ? 'hands-list__row-hit--with-category' : '',
                ].filter(Boolean).join(' ')
                const handleRowClick = () => { scheduleSingleClick(categoryClickKey) }
                const handleRowDblClick = (e: React.MouseEvent) => {
                  e.preventDefault()
                  cancelScheduledClick()
                  onPatternDoubleClick(h.id)
                }
                const outerSharedProps = {
                  className: outerClass,
                  style: rowHitGridStyle,
                  'aria-label': rowAriaLabel,
                  'aria-pressed': rowIsFocused,
                  'aria-current': rowIsFocused ? (true as const) : undefined,
                  onClick: handleRowClick,
                  onDoubleClick: handleRowDblClick,
                }
                const outerStackedProps = {
                  className: outerClass,
                  style: rowHitGridStyle,
                }
                const liClassName = [
                  'hands-list__row',
                  rowIsFocused ? 'hands-list__row--active' : '',
                  tilesGuideOn && rowIsFocused ? 'hands-list__row--rack-guide' : '',
                ].filter(Boolean).join(' ')
                const categoryCellProps = showConsecVariantStack
                  ? {
                      role: 'button' as const,
                      tabIndex: 0,
                      'aria-label': `${suggestedHandSectionMenuLabel(h.section)} - ${cardRef}, ${h.title} — highlight all variants`,
                      'aria-pressed': activePatternId === categoryClickKey,
                      onClick: (e: React.MouseEvent) => {
                        e.stopPropagation()
                        scheduleSingleClick(categoryClickKey)
                      },
                      onDoubleClick: (e: React.MouseEvent) => {
                        e.preventDefault()
                        e.stopPropagation()
                        cancelScheduledClick()
                        onPatternDoubleClick(h.id, categoryClickKey)
                      },
                      onKeyDown: (e: React.KeyboardEvent) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          e.stopPropagation()
                          scheduleSingleClick(categoryClickKey)
                        }
                      },
                    }
                  : {}
                const innerCells = (
                      <>
                        {showHandCategoryLabels ? (
                          <div
                            className={[
                              'hands-list__cell',
                              'hands-list__cell--category',
                              showConsecVariantStack ? 'hands-list__cell--category-clickable' : '',
                            ].filter(Boolean).join(' ')}
                            {...categoryCellProps}
                          >
                            <span className="hands-list__with-tiles-category">
                              {suggestedHandSectionMenuLabel(h.section)}
                              <span className="hands-list__section-num"> - {cardRef}</span>
                            </span>
                            {handsListOn ? (
                              <span
                                className="hands-list__category-inline-hand"
                                aria-label={h.title}
                              >
                                {h.titleSegments?.length ? (
                                  <>
                                    <CardColoredText segments={h.titleSegments} />
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
                                      return m ? (
                                        <span className="hands-list__paren">{m[1]}</span>
                                      ) : null
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
                            <div
                              className={[
                                'hands-list__pattern-tiles',
                                showConsecVariantStack ? 'hands-list__pattern-tiles--tie-stack' : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                            >
                              {showConsecVariantStack ? (
                                <div
                                  className="hands-list__pattern-tiles-stack"
                                  role="group"
                                  aria-label="Consecutive suit pair options for this line"
                                >
                                  {rowStripVariants.map((slots, vi) => {
                                    const variantKey = variantKeys[vi] ?? categoryClickKey
                                    const isActiveRow = activePatternId === variantKey || activePatternId === categoryClickKey
                                    return (
                                      <div
                                        key={`${h.id}-var-${vi}`}
                                        role="button"
                                        tabIndex={0}
                                        className={[
                                          'hands-list__pattern-tiles-stack-row',
                                          'hands-list__pattern-tiles-stack-row--btn',
                                          isActiveRow ? 'hands-list__pattern-tiles-stack-row--active' : '',
                                        ].filter(Boolean).join(' ')}
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          scheduleSingleClick(variantKey)
                                        }}
                                        onDoubleClick={(e) => {
                                          e.preventDefault()
                                          e.stopPropagation()
                                          cancelScheduledClick()
                                          onPatternDoubleClick(h.id, variantKey)
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            scheduleSingleClick(variantKey)
                                          }
                                        }}
                                        aria-pressed={isActiveRow}
                                      >
                                        {slots.length > 0 ? (
                                          <div className="hands-list__pattern-tiles-grid" role="presentation">
                                            {slots.map((slot, i) => {
                                              const showJokerGuide = tilesGuideOn && isActiveRow && slot.jokerSuggested
                                              const suggestBestRing = tilesGuideOn && isActiveRow && slot.highlight
                                              const dimPatternSlot = tilesGuideOn && isActiveRow && !slot.highlight && !slot.jokerSuggested
                                              return (
                                                <div
                                                  key={`${h.id}-v${vi}-${i}`}
                                                  className={[
                                                    'hands-list__pattern-tile-cell',
                                                    showJokerGuide ? 'hands-list__pattern-tile-cell--suggest-joker' : '',
                                                    suggestBestRing ? 'hands-list__pattern-tile-cell--suggest-best' : '',
                                                    dimPatternSlot ? 'hands-list__pattern-tile-cell--suggest-dim' : '',
                                                  ].filter(Boolean).join(' ')}
                                                >
                                                  <TileFace
                                                    def={slot.displayDef}
                                                    cardInk={stripTileFaceCardInk(slot.displayDef, slot.cardInk)}
                                                  />
                                                  {showJokerGuide ? (
                                                    <span className="hands-list__pattern-joker-mark">JOKER</span>
                                                  ) : null}
                                                </div>
                                              )
                                            })}
                                          </div>
                                        ) : null}
                                      </div>
                                    )
                                  })}
                                </div>
                              ) : rowStripSlots.length > 0 ? (
                                <div className="hands-list__pattern-tiles-grid" role="presentation">
                                  {rowStripSlots.map((slot, i) => {
                                    const showJokerGuide = tilesGuideOn && rowIsFocused && slot.jokerSuggested
                                    const suggestBestRing = tilesGuideOn && rowIsFocused && slot.highlight
                                    const dimPatternSlot = tilesGuideOn && rowIsFocused && !slot.highlight && !slot.jokerSuggested
                                    return (
                                      <div
                                        key={`${h.id}-${i}`}
                                        className={[
                                          'hands-list__pattern-tile-cell',
                                          showJokerGuide ? 'hands-list__pattern-tile-cell--suggest-joker' : '',
                                          suggestBestRing ? 'hands-list__pattern-tile-cell--suggest-best' : '',
                                          dimPatternSlot ? 'hands-list__pattern-tile-cell--suggest-dim' : '',
                                        ].filter(Boolean).join(' ')}
                                      >
                                        <TileFace
                                          def={slot.displayDef}
                                          cardInk={stripTileFaceCardInk(slot.displayDef, slot.cardInk)}
                                        />
                                        {showJokerGuide ? (
                                          <span className="hands-list__pattern-joker-mark">JOKER</span>
                                        ) : null}
                                      </div>
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
                            aria-label={`Hand value ${formatSuggestedHandValue(h.points, h.closed)}`}
                          >
                            <SuggestedHandValueDisplay points={h.points} closed={h.closed} variant="list" />
                          </span>
                        </div>
                      </>
                )
                return (
                  <li key={handEntryKey(h)} className={liClassName}>
                    {onPinnedPatternChange ? (
                      <div
                        className="hands-list__cell hands-list__cell--pin"
                        style={{ gridArea: 'pin' }}
                      >
                        <SuggestedHandPinCell
                          pressed={pinnedHandKeys.includes(rowPinKey)}
                          onToggle={() => emitRowPinToggle(rowPinKey)}
                        />
                      </div>
                    ) : null}
                    {showConsecVariantStack ? (
                      <div {...outerStackedProps}>{innerCells}</div>
                    ) : (
                      <button type="button" {...outerSharedProps}>
                        {innerCells}
                      </button>
                    )}
                  </li>
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
}
