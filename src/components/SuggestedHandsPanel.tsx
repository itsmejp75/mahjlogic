import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import {
  buildConsecRanksTierStripRow,
  buildSuggestedStripSlotRowsWithVariants,
  greedyPatternMatchDetail,
  type GreedyPatternMatchOpts,
  type SuggestedStripSlot,
} from '../analysis/suggestedHands'
import type { CardInk } from '../card/cardText'
import { PRACTICE_CARD_SECTION_ORDER, PRACTICE_PATTERNS } from '../card/practicePatterns'
import type { TileDef, TileInstance } from '../mahjong/types'
import type { SuggestedHandLine } from '../training/types'
import { CardColoredText } from './CardColoredText'
import { TileFace } from './TileFace'

const CLICK_DELAY_MS = 280

/**
 * Suits use real rack tile colors (bamboo/dot/crak face).
 * Specific dragons (red/green/soap) always use their natural ink — title-segment ink must not
 * override a resolved dragon color (e.g. navy title ink turning a red dragon blue).
 * Generic "any" dragons and all other non-suit tiles use the card-column ink.
 */
function stripTileFaceCardInk(def: TileDef, ink: CardInk | undefined): CardInk | undefined {
  if (def.cat === 'suit') return undefined
  if (def.cat === 'dragon') {
    if (def.dragon === 'red') return 'red'
    if (def.dragon === 'green') return 'green'
    if (def.dragon === 'soap') return 'navy'
  }
  return ink
}

const HIDE_CONCEALED_HANDS_STORAGE_KEY = 'mahjlogic:suggested-hands-hide-concealed'
const UNCHECKED_SECTIONS_STORAGE_KEY = 'mahjlogic:suggested-hands-unchecked-sections'

function readStoredHideConcealedHands(): boolean {
  try {
    const raw = localStorage.getItem(HIDE_CONCEALED_HANDS_STORAGE_KEY)
    if (raw == null) return false
    return raw === '1'
  } catch {
    return false
  }
}

function readStoredUncheckedSections(): Set<string> {
  try {
    const raw = localStorage.getItem(UNCHECKED_SECTIONS_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed as string[]) : new Set()
  } catch {
    return new Set()
  }
}

/**
 * Compact-mode (2-col) inline grid-template-areas.
 */
function handsRowGridTemplateAreas(cat: boolean, tiles: boolean): string {
  if (cat) {
    if (tiles) return "'category away' 'tiles awayPad'"
    return "'category away'"
  }
  return "'tiles away'"
}

type Props = {
  hands: SuggestedHandLine[]
  activePatternId: string | null
  onPatternClick: (handKey: string) => void
  onPatternDoubleClick: (patternId: string, focusKey?: string) => void
  handsListOn: boolean
  tilesGuideOn: boolean
  onHandsListOnChange: (on: boolean) => void
  onTilesGuideOnChange: (on: boolean) => void
  rackTilesForSuggestedStrip: TileInstance[]
  /**
   * Same ids as `rackTilesForSuggestedStrip`, but jokers in open melds use their stand-in `TileDef`
   * for greedy matching. Omit to use the display rack for both (no claim melds with jokers).
   */
  rackTilesForPatternMatch?: TileInstance[]
  /** This seat’s exposure tile ids — fixes like-numbers rank for strip layout when set. */
  exposureTileIdsForSuggestedStrip?: ReadonlySet<string>
  /** When provided, the Filter trigger button is portalled into this element. */
  filterButtonPortal?: HTMLDivElement | null
  /** Tracks whether the containing popup is open — filter tray resets when popup closes. */
  isOpen?: boolean
}

export function SuggestedHandsPanel({
  hands,
  activePatternId,
  onPatternClick,
  onPatternDoubleClick,
  handsListOn,
  tilesGuideOn,
  rackTilesForSuggestedStrip,
  rackTilesForPatternMatch,
  exposureTileIdsForSuggestedStrip,
  filterButtonPortal,
  isOpen,
}: Props) {
  const sections = useMemo(() => {
    const uniq = Array.from(new Set(hands.map((h) => h.section)))
    const rank = new Map(PRACTICE_CARD_SECTION_ORDER.map((s, i) => [s, i]))
    return uniq.sort((a, b) => {
      const ra = rank.get(a)
      const rb = rank.get(b)
      if (ra !== undefined && rb !== undefined) return ra - rb
      if (ra !== undefined) return -1
      if (rb !== undefined) return 1
      return a.localeCompare(b)
    })
  }, [hands])

  const [uncheckedSections, setUncheckedSections] = useState(readStoredUncheckedSections)
  const checkedSections = useMemo(
    () => new Set(sections.filter((s) => !uncheckedSections.has(s))),
    [sections, uncheckedSections],
  )
  const [hideConcealedHands, setHideConcealedHands] = useState(readStoredHideConcealedHands)
  const [filterTrayOpen, setFilterTrayOpen] = useState(false)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset filter tray whenever the popup is closed
  useEffect(() => {
    if (!isOpen) setFilterTrayOpen(false)
  }, [isOpen])

  const allSelected = sections.length > 0 && checkedSections.size === sections.length

  useEffect(() => {
    try {
      localStorage.setItem(UNCHECKED_SECTIONS_STORAGE_KEY, JSON.stringify([...uncheckedSections]))
    } catch { /* ignore */ }
  }, [uncheckedSections])

  useEffect(() => {
    try {
      localStorage.setItem(HIDE_CONCEALED_HANDS_STORAGE_KEY, hideConcealedHands ? '1' : '0')
    } catch { /* ignore */ }
  }, [hideConcealedHands])

  useEffect(
    () => () => {
      if (clickTimerRef.current != null) clearTimeout(clickTimerRef.current)
    },
    [],
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

  const displayHands = useMemo(() => {
    const base = hideConcealedHands ? filtered.filter((h) => !h.closed) : filtered
    const rank = new Map(PRACTICE_CARD_SECTION_ORDER.map((s, i) => [s, i]))
    return [...base].sort((a, b) => {
      if (a.tilesNeededRough !== b.tilesNeededRough) return a.tilesNeededRough - b.tilesNeededRough
      const ra = rank.get(a.section) ?? 999
      const rb = rank.get(b.section) ?? 999
      if (ra !== rb) return ra - rb
      if (a.cardLineNumber !== b.cardLineNumber) return a.cardLineNumber - b.cardLineNumber
      return a.id.localeCompare(b.id)
    })
  }, [filtered, hideConcealedHands])

  const listRowsForHandsPanel = displayHands

  const handEntryKey = useCallback(
    (h: (typeof filtered)[number]) =>
      h.consecRanksTier
        ? `${h.id}::tier::${h.consecRanksTier.combos.map((c) => `${c.base}:${c.perm.join('-')}`).join('|')}`
        : h.id,
    [],
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

  type StripRowsEntry = {
    rows: SuggestedStripSlot[][]
    ocVariantSuffixes: string[]
    ocAllSuffix: string
  }

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
    const patternCache = new Map<string, ReturnType<typeof PRACTICE_PATTERNS.find>>()
    for (const h of filtered) {
      const key = handEntryKey(h)
      const p = patternCache.get(h.id) ?? PRACTICE_PATTERNS.find((x) => x.id === h.id)
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
  ])

  const showHandCategoryLabels = handsListOn
  /** Three explicit columns: category line | hand line | away (hands on, tiles off). */
  const handsListSpreadsheet3 = handsListOn && !tilesGuideOn
  /** Two explicit columns: tile strip | away (hands off, tiles on). */
  const handsListSpreadsheetTiles2 = !handsListOn && tilesGuideOn
  /** Two explicit columns: stacked (category + hand + tile strip) | away (hands on + tiles on). */
  const handsListSpreadsheetTilesHands = handsListOn && tilesGuideOn

  const rowHitGridStyle = useMemo((): CSSProperties => {
    if (handsListSpreadsheet3) {
      return { gridTemplateAreas: "'section hand away'" }
    }
    return { gridTemplateAreas: handsRowGridTemplateAreas(showHandCategoryLabels, tilesGuideOn) }
  }, [handsListSpreadsheet3, showHandCategoryLabels, tilesGuideOn])

  // Filter trigger button — portalled into the popup drag handle header
  const filterTriggerNode = (
    <button
      type="button"
      className={[
        'hands-panel__display-toggle',
        filterTrayOpen ? 'hands-panel__display-toggle--on' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-pressed={filterTrayOpen}
      aria-label="Toggle filter tray"
      onClick={() => setFilterTrayOpen((o) => !o)}
      onPointerDown={(e) => e.stopPropagation()}
    >
      Filter
    </button>
  )

  // Filter tray — right-side slide-in panel inside the section
  const filterTray = (
    <div
      className={[
        'suggested-hands-filter-tray',
        filterTrayOpen ? 'suggested-hands-filter-tray--open' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden={!filterTrayOpen}
    >
      <div className="suggested-hands-filter-tray__inner">
        {/* All sections */}
        <button
          type="button"
          className={[
            'btn',
            'suggested-hands-filter-tray__item',
            allSelected ? 'suggested-hands-filter-tray__item--on' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-pressed={allSelected}
          disabled={sections.length === 0}
          onClick={() => {
            if (allSelected) {
              setUncheckedSections(new Set(sections))
            } else {
              setUncheckedSections(new Set())
            }
          }}
        >
          All
        </button>

        {/* Concealed — sits directly below All */}
        <button
          type="button"
          className={[
            'btn',
            'suggested-hands-filter-tray__item',
            !hideConcealedHands ? 'suggested-hands-filter-tray__item--on' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-pressed={!hideConcealedHands}
          onClick={() => setHideConcealedHands((v) => !v)}
        >
          Concealed
        </button>

        {sections.map((sec) => {
          const isOn = checkedSections.has(sec)
          const isLast = checkedSections.size === 1 && isOn
          return (
            <button
              key={sec}
              type="button"
              className={[
                'btn',
                'suggested-hands-filter-tray__item',
                isOn ? 'suggested-hands-filter-tray__item--on' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-pressed={isOn}
              disabled={isLast}
              onClick={() => {
                setUncheckedSections((prev) => {
                  if (isOn) {
                    if (isLast) return prev
                    const next = new Set(prev)
                    next.add(sec)
                    return next
                  } else {
                    if (!prev.has(sec)) return prev
                    const next = new Set(prev)
                    next.delete(sec)
                    return next
                  }
                })
              }}
            >
              {sec}
            </button>
          )
        })}
      </div>
    </div>
  )

  return (
    <section className="panel panel--hands" aria-label="Suggested hands">
      {handsListOn || tilesGuideOn ? (
        <div className="hands-panel__content">
          <div className="hands-panel__list-column">
            <div className="hands-list-scroll">
              {handsListSpreadsheetTilesHands ? (
                <div
                  className="hands-sheet hands-sheet--tiles2 hands-sheet--tilesHands"
                  id="hands-list"
                  role="grid"
                >
                  <div
                    className="hands-sheet__cell hands-sheet__cell--header hands-sheet__cell--tiles hands-sheet__cell--combined"
                    role="columnheader"
                  >
                    <span className="hands-sheet__combined-header">
                      Category <span className="hands-sheet__combined-sep">/</span> Hands{' '}
                      <span className="hands-sheet__combined-sep">/</span> Tiles
                    </span>
                  </div>
                  <div
                    className="hands-sheet__cell hands-sheet__cell--header hands-sheet__cell--away"
                    role="columnheader"
                  >
                    Away
                  </div>
                  <ol className="hands-sheet__rows" aria-label="Suggested hand and tile lines">
                    {listRowsForHandsPanel.map((h) => {
                      const stripEntry = stripSlotRowsByKey.get(handEntryKey(h))
                      const rowStripVariants = stripEntry?.rows ?? []
                      const rowStripSlots = rowStripVariants[0] ?? []
                      const showVariantStack = rowStripVariants.length > 1
                      const variantKeys: string[] = showVariantStack
                        ? h.consecRanksTier
                          ? h.consecRanksTier.combos.map(
                              (c) => `${h.id}::tier::${c.base}:${c.perm.join('-')}`,
                            )
                          : stripEntry?.ocVariantSuffixes.length === rowStripVariants.length
                            ? stripEntry!.ocVariantSuffixes.map((suf) => `${h.id}::${suf}`)
                            : []
                        : []
                      const allKey =
                        showVariantStack && !h.consecRanksTier && stripEntry?.ocAllSuffix
                          ? `${h.id}::${stripEntry.ocAllSuffix}`
                          : handEntryKey(h)
                      const rowIsFocused =
                        activePatternId === handEntryKey(h) ||
                        activePatternId === allKey ||
                        (variantKeys.length > 0 &&
                          variantKeys.some((k) => k === activePatternId))
                      const ariaLabel = `${h.section} #${h.cardLineNumber}, ${h.title}, ${h.tilesNeededRough} tiles away`
                      const handTitleNode = (
                        <span className="hands-sheet__hand-title" aria-label={h.title}>
                          {h.titleSegments?.length ? (
                            <>
                              <CardColoredText segments={h.titleSegments} />
                              {(() => {
                                const m = h.title.match(/(\([^)]+\))/)
                                return m ? (
                                  <span className="hands-sheet__paren">{m[1]}</span>
                                ) : null
                              })()}
                            </>
                          ) : (
                            h.title
                          )}
                          {h.closed ? (
                            <span className="hands-sheet__card-c" aria-label="Concealed hand">
                              C
                            </span>
                          ) : null}
                        </span>
                      )
                      const renderTileRow = (
                        slots: SuggestedStripSlot[],
                        isActiveRow: boolean,
                        keyPrefix: string,
                      ) => (
                        <div className="hands-sheet__tiles-grid" role="presentation">
                          {slots.map((slot, i) => {
                            const showJokerGuide = isActiveRow && slot.jokerSuggested
                            const suggestBest = isActiveRow && slot.highlight
                            const dim =
                              isActiveRow && !slot.highlight && !slot.jokerSuggested
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
                      const headerLine = (
                        <div className="hands-sheet__combined-header-line">
                          <span className="hands-sheet__category">
                            {h.section}
                            <span className="hands-sheet__section-num">
                              #{h.cardLineNumber}
                            </span>
                          </span>
                          <span className="hands-sheet__combined-divider" aria-hidden="true">
                            ·
                          </span>
                          {handTitleNode}
                        </div>
                      )
                      return (
                        <li
                          key={handEntryKey(h)}
                          className={[
                            'hands-sheet__row',
                            rowIsFocused ? 'hands-sheet__row--active' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          role="row"
                        >
                          {showVariantStack ? (
                            <>
                              <div
                                className="hands-sheet__cell hands-sheet__cell--combined"
                                role="cell"
                              >
                                <button
                                  type="button"
                                  className="hands-sheet__combined-head-btn"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    scheduleSingleClick(allKey)
                                  }}
                                  onDoubleClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    cancelScheduledClick()
                                    onPatternDoubleClick(h.id, allKey)
                                  }}
                                  aria-label={`${h.section} #${h.cardLineNumber}, ${h.title} — highlight all variants`}
                                  aria-pressed={activePatternId === allKey}
                                >
                                  {headerLine}
                                </button>
                                <div
                                  className="hands-sheet__tiles-stack"
                                  role="group"
                                  aria-label="Consecutive suit pair options for this line"
                                >
                                  {rowStripVariants.map((slots, vi) => {
                                    const variantKey = variantKeys[vi] ?? allKey
                                    const isActiveRow =
                                      activePatternId === variantKey ||
                                      activePatternId === allKey
                                    return (
                                      <div
                                        key={`${h.id}-var-${vi}`}
                                        role="button"
                                        tabIndex={0}
                                        className={[
                                          'hands-sheet__tiles-stack-row',
                                          isActiveRow
                                            ? 'hands-sheet__tiles-stack-row--active'
                                            : '',
                                        ]
                                          .filter(Boolean)
                                          .join(' ')}
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
                                        {slots.length > 0
                                          ? renderTileRow(slots, isActiveRow, `${h.id}-v${vi}`)
                                          : null}
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                              <div
                                className="hands-sheet__cell hands-sheet__cell--away"
                                role="cell"
                                aria-label={`${h.tilesNeededRough} tiles away`}
                              >
                                {h.tilesNeededRough}
                              </div>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="hands-sheet__row-btn"
                              onClick={() => scheduleSingleClick(handEntryKey(h))}
                              onDoubleClick={(e) => {
                                e.preventDefault()
                                cancelScheduledClick()
                                onPatternDoubleClick(h.id)
                              }}
                              aria-label={ariaLabel}
                              aria-pressed={rowIsFocused}
                            >
                              <div
                                className="hands-sheet__cell hands-sheet__cell--combined"
                                role="cell"
                              >
                                {headerLine}
                                {rowStripSlots.length > 0
                                  ? renderTileRow(
                                      rowStripSlots,
                                      activePatternId === h.id,
                                      `${h.id}`,
                                    )
                                  : null}
                              </div>
                              <div
                                className="hands-sheet__cell hands-sheet__cell--away"
                                role="cell"
                              >
                                {h.tilesNeededRough}
                              </div>
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ol>
                </div>
              ) : handsListSpreadsheetTiles2 ? (
                <div
                  className="hands-sheet hands-sheet--tiles2"
                  id="hands-list"
                  role="grid"
                >
                  <div
                    className="hands-sheet__cell hands-sheet__cell--header hands-sheet__cell--tiles"
                    role="columnheader"
                  >
                    Tiles
                  </div>
                  <div
                    className="hands-sheet__cell hands-sheet__cell--header hands-sheet__cell--away"
                    role="columnheader"
                  >
                    Away
                  </div>
                  <ol className="hands-sheet__rows" aria-label="Suggested tile lines">
                    {listRowsForHandsPanel.map((h) => {
                      const stripEntry = stripSlotRowsByKey.get(handEntryKey(h))
                      const rowStripVariants = stripEntry?.rows ?? []
                      const rowStripSlots = rowStripVariants[0] ?? []
                      const showVariantStack = rowStripVariants.length > 1
                      const variantKeys: string[] = showVariantStack
                        ? h.consecRanksTier
                          ? h.consecRanksTier.combos.map(
                              (c) => `${h.id}::tier::${c.base}:${c.perm.join('-')}`,
                            )
                          : stripEntry?.ocVariantSuffixes.length === rowStripVariants.length
                            ? stripEntry!.ocVariantSuffixes.map((suf) => `${h.id}::${suf}`)
                            : []
                        : []
                      const allKey =
                        showVariantStack && !h.consecRanksTier && stripEntry?.ocAllSuffix
                          ? `${h.id}::${stripEntry.ocAllSuffix}`
                          : handEntryKey(h)
                      const rowIsFocused =
                        activePatternId === handEntryKey(h) ||
                        activePatternId === allKey ||
                        (variantKeys.length > 0 &&
                          variantKeys.some((k) => k === activePatternId))
                      const ariaLabel = `${h.section} #${h.cardLineNumber}, ${h.title}, ${h.tilesNeededRough} tiles away`
                      const renderTileRow = (
                        slots: SuggestedStripSlot[],
                        isActiveRow: boolean,
                        keyPrefix: string,
                      ) => (
                        <div className="hands-sheet__tiles-grid" role="presentation">
                          {slots.map((slot, i) => {
                            const showJokerGuide = isActiveRow && slot.jokerSuggested
                            const suggestBest = isActiveRow && slot.highlight
                            const dim =
                              isActiveRow && !slot.highlight && !slot.jokerSuggested
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
                      return (
                        <li
                          key={handEntryKey(h)}
                          className={[
                            'hands-sheet__row',
                            rowIsFocused ? 'hands-sheet__row--active' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          role="row"
                        >
                          {showVariantStack ? (
                            <>
                              <div
                                className="hands-sheet__cell hands-sheet__cell--tiles"
                                role="cell"
                              >
                                <div
                                  className="hands-sheet__tiles-stack"
                                  role="group"
                                  aria-label="Consecutive suit pair options for this line"
                                >
                                  {rowStripVariants.map((slots, vi) => {
                                    const variantKey = variantKeys[vi] ?? allKey
                                    const isActiveRow =
                                      activePatternId === variantKey ||
                                      activePatternId === allKey
                                    return (
                                      <div
                                        key={`${h.id}-var-${vi}`}
                                        role="button"
                                        tabIndex={0}
                                        className={[
                                          'hands-sheet__tiles-stack-row',
                                          isActiveRow ? 'hands-sheet__tiles-stack-row--active' : '',
                                        ]
                                          .filter(Boolean)
                                          .join(' ')}
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
                                        {slots.length > 0
                                          ? renderTileRow(slots, isActiveRow, `${h.id}-v${vi}`)
                                          : null}
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                              <div
                                className="hands-sheet__cell hands-sheet__cell--away"
                                role="cell"
                                aria-label={`${h.tilesNeededRough} tiles away`}
                              >
                                {h.tilesNeededRough}
                              </div>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="hands-sheet__row-btn"
                              onClick={() => scheduleSingleClick(handEntryKey(h))}
                              onDoubleClick={(e) => {
                                e.preventDefault()
                                cancelScheduledClick()
                                onPatternDoubleClick(h.id)
                              }}
                              aria-label={ariaLabel}
                              aria-pressed={rowIsFocused}
                            >
                              <div
                                className="hands-sheet__cell hands-sheet__cell--tiles"
                                role="cell"
                              >
                                {rowStripSlots.length > 0
                                  ? renderTileRow(
                                      rowStripSlots,
                                      activePatternId === h.id,
                                      `${h.id}`,
                                    )
                                  : null}
                              </div>
                              <div
                                className="hands-sheet__cell hands-sheet__cell--away"
                                role="cell"
                              >
                                {h.tilesNeededRough}
                              </div>
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ol>
                </div>
              ) : handsListSpreadsheet3 ? (
                <div className="hands-sheet" id="hands-list" role="grid">
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
                    Hands
                  </div>
                  <div
                    className="hands-sheet__cell hands-sheet__cell--header hands-sheet__cell--away"
                    role="columnheader"
                  >
                    Away
                  </div>
                  <ol className="hands-sheet__rows" aria-label="Suggested hand lines">
                    {listRowsForHandsPanel.map((h) => {
                      const rowKey = handEntryKey(h)
                      const isFocused = activePatternId === rowKey
                      const ariaLabel = `${h.section} #${h.cardLineNumber}, ${h.title}, ${h.tilesNeededRough} tiles away`
                      return (
                        <li
                          key={rowKey}
                          className={[
                            'hands-sheet__row',
                            isFocused ? 'hands-sheet__row--active' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          role="row"
                        >
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
                            aria-pressed={isFocused}
                          >
                            <div className="hands-sheet__cell hands-sheet__cell--cat" role="cell">
                              <span className="hands-sheet__category">
                                {h.section}
                                <span className="hands-sheet__section-num">
                                  #{h.cardLineNumber}
                                </span>
                              </span>
                            </div>
                            <div className="hands-sheet__cell hands-sheet__cell--hand" role="cell">
                              <span className="hands-sheet__hand-title" aria-label={h.title}>
                                {h.titleSegments?.length ? (
                                  <>
                                    <CardColoredText segments={h.titleSegments} />
                                    {(() => {
                                      const m = h.title.match(/(\([^)]+\))/)
                                      return m ? (
                                        <span className="hands-sheet__paren">{m[1]}</span>
                                      ) : null
                                    })()}
                                  </>
                                ) : (
                                  h.title
                                )}
                                {h.closed ? (
                                  <span className="hands-sheet__card-c" aria-label="Concealed hand">
                                    C
                                  </span>
                                ) : null}
                              </span>
                            </div>
                            <div className="hands-sheet__cell hands-sheet__cell--away" role="cell">
                              {h.tilesNeededRough}
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
                      {handsListOn ? 'Hands/Tiles' : 'Tiles'}
                    </div>
                  </div>
                ) : null}
                {showHandCategoryLabels && tilesGuideOn ? (
                  <div
                    className="hands-list__cell hands-list__cell--tiles-away-pad hands-list__header-cell"
                    aria-hidden
                  />
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
                const rowIsFocused = activePatternId === handEntryKey(h) ||
                  activePatternId === categoryClickKey ||
                  (variantKeys.length > 0 && variantKeys.some((k) => k === activePatternId))
                const rowAriaLabel =
                  !handsListOn || !showHandCategoryLabels
                    ? `${h.section} #${h.cardLineNumber}, ${h.title}, ${h.tilesNeededRough} tiles away`
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
                      'aria-label': `${h.section} #${h.cardLineNumber}, ${h.title} — highlight all variants`,
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
                              {h.section}
                              <span className="hands-list__section-num">#{h.cardLineNumber}</span>
                            </span>
                            {handsListOn ? (
                              <span
                                className="hands-list__category-inline-hand"
                                aria-label={h.title}
                              >
                                {h.titleSegments?.length ? (
                                  <>
                                    <CardColoredText segments={h.titleSegments} />
                                    {(() => {
                                      const m = h.title.match(/(\([^)]+\))/)
                                      return m ? (
                                        <span className="hands-list__paren">{m[1]}</span>
                                      ) : null
                                    })()}
                                  </>
                                ) : (
                                  h.title
                                )}
                                {h.closed ? (
                                  <span className="hands-list__card-c" aria-label="Concealed hand">
                                    C
                                  </span>
                                ) : null}
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
                                    const isActiveRow = activePatternId === h.id
                                    const showJokerGuide = tilesGuideOn && isActiveRow && slot.jokerSuggested
                                    const suggestBestRing = tilesGuideOn && isActiveRow && slot.highlight
                                    const dimPatternSlot = tilesGuideOn && isActiveRow && !slot.highlight && !slot.jokerSuggested
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
                          <div
                            className="hands-list__cell hands-list__cell--tiles-away-pad"
                            aria-hidden="true"
                          />
                        ) : null}
                        <div className="hands-list__cell hands-list__cell--away">
                          <span
                            className="hands-list__tiles-away hands-list__tiles-away--with-tiles-col"
                            aria-label={`${h.tilesNeededRough} tiles away`}
                          >
                            {h.tilesNeededRough}
                          </span>
                        </div>
                      </>
                )
                return (
                  <li key={handEntryKey(h)} className={liClassName}>
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
      ) : (
        <p className="hands-panel__list-off" role="status">
          Hands list is hidden — turn on Hands or Tiles to see suggested lines.
        </p>
      )}

      {/* Right-side filter tray */}
      {filterTray}

      {/* Filter trigger portalled into the popup header */}
      {typeof document !== 'undefined' && filterButtonPortal &&
        createPortal(filterTriggerNode, filterButtonPortal)}
    </section>
  )
}
