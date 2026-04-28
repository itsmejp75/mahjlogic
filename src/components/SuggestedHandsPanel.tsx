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
    const rack = rackTilesForSuggestedStrip
    const greedyOpts: GreedyPatternMatchOpts | undefined =
      exposureTileIdsForSuggestedStrip?.size
        ? { exposureTileIds: exposureTileIdsForSuggestedStrip }
        : undefined
    const rackIdSet = new Set(rack.map((t) => t.id))
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
          const row = buildConsecRanksTierStripRow(p, rack, perm, base)
          if (row) rows.push(row)
        }
        m.set(key, { rows, ocVariantSuffixes: [], ocAllSuffix: '' })
        continue
      }
      const detail = greedyPatternMatchDetail(rack, p, greedyOpts)
      let bestIdsForAssign = new Set(detail.usedOrder.filter((id) => rackIdSet.has(id)))
      if (bestIdsForAssign.size === 0) {
        for (const t of rack) {
          if (p.matches(t.def)) bestIdsForAssign.add(t.id)
        }
      }
      const result = buildSuggestedStripSlotRowsWithVariants(
        p,
        rack,
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
  }, [tilesGuideOn, filtered, rackTilesForSuggestedStrip, exposureTileIdsForSuggestedStrip, handEntryKey])

  const showHandCategoryLabels = handsListOn

  const rowHitGridStyle = useMemo(
    (): CSSProperties => ({
      gridTemplateAreas: handsRowGridTemplateAreas(showHandCategoryLabels, tilesGuideOn),
    }),
    [showHandCategoryLabels, tilesGuideOn],
  )

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
