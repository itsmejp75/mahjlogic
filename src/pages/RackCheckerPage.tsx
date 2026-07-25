import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { SortedDiscardTrayRow } from '../app/playSurfaceUi'
import {
  APP_THEME_PAGE_PAD_COLOR,
  DEFAULT_APP_THEME,
  isAppTheme,
  type AppTheme,
} from '../app/appTheme'
import { useRankSuggestedHandsWorker } from '../analysis/rankSuggestedHandsAsync'
import {
  buildPinnedPatternsFromFocusKey,
  computeRackPatternHighlightIds,
  focusKeyPatternId,
  greedyPatternMatchDetail,
  sortHandForSuggestedPattern,
  tileMultisetSignature,
  type RankSuggestedHandsInput,
} from '../analysis/suggestedHands'
import { patternByIdLookup } from '../card/activeCardPatternsScope'
import {
  cardSectionOrderFromPatterns,
  patternsForCard,
  readPlayableCardFromStorage,
  type PlayableCardId,
} from '../card/cardCatalog'
import { SuggestedHandsPanel } from '../components/SuggestedHandsPanel'
import { TileFace } from '../components/TileFace'
import { STANDARD_JOKER_COUNT, TEN_JOKERS_COUNT } from '../mahjong/deck'
import { tileAriaLabel, tileSuitRackWord } from '../mahjong/labels'
import {
  DISCARD_TRACKER_SORTED_BAND_COLS,
  DISCARD_TRACKER_SORTED_ROW_SLOTS,
  SORTED_DISCARD_ROW1_TILES,
  SORTED_DISCARD_ROW2_TILES,
  SORTED_DISCARD_ROW3_TILES,
  sortedDiscardTrackerPickableDefs,
} from '../mahjong/sortedDiscardTrackerTiles'
import { sortTiles, type SortMode } from '../mahjong/tileUtils'
import type { DiscardEntry, Seat, TileDef, TileInstance } from '../mahjong/types'
import {
  readHideConcealedHandsFromStorage,
  readUncheckedSectionsFromStorage,
} from '../suggestedHands/filterSettings'
import { TileGraphicsProvider } from '../tiles/TileGraphicsContext'
import { DEFAULT_TILE_GRAPHICS, isTileGraphics, type TileGraphics } from '../tiles/tileGraphics'

const RACK_SIZE = 14
/** Neutral wall size so Prob % is usable without a live deal. */
const RACK_CHECKER_WALL_REMAINING = 72
const DRAG_SLOP_PX = 8

const LS_KEY_APP_THEME = 'mahjlogic.appTheme'
const LS_KEY_TILE_GRAPHICS = 'mahjlogic.tileGraphics'
const LS_KEY_HAND_PROBABILITY = 'mahjlogic.handProbabilityEnabled'
const LS_KEY_TEN_JOKERS = 'mahjlogic.tenJokersEnabled'
const LS_KEY_BLANK_TILES = 'mahjlogic.blankTilesEnabled'
const LS_KEY_BLANK_TILE_COUNT = 'mahjlogic.blankTileCount'

function readTheme(): AppTheme {
  try {
    const v = localStorage.getItem(LS_KEY_APP_THEME)
    if (v != null && isAppTheme(v)) return v
  } catch {
    /* ignore */
  }
  return DEFAULT_APP_THEME
}

function readTileGraphics(): TileGraphics {
  try {
    const v = localStorage.getItem(LS_KEY_TILE_GRAPHICS)
    if (v != null && isTileGraphics(v)) return v
  } catch {
    /* ignore */
  }
  return DEFAULT_TILE_GRAPHICS
}

function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    if (v != null) return v === 'true' || v === '1'
  } catch {
    /* ignore */
  }
  return fallback
}

function readBlankTileCount(): number {
  try {
    const n = Number(localStorage.getItem(LS_KEY_BLANK_TILE_COUNT))
    if (Number.isFinite(n) && n >= 0) return Math.floor(n)
  } catch {
    /* ignore */
  }
  return 0
}

function emptySlots(): (TileInstance | null)[] {
  return Array.from({ length: RACK_SIZE }, () => null)
}

function makeTile(def: TileDef): TileInstance {
  return { id: crypto.randomUUID(), def }
}

type DragGhost = {
  def: TileDef
  x: number
  y: number
}

export function RackCheckerPage() {
  const navigate = useNavigate()
  const [appTheme] = useState<AppTheme>(() => readTheme())
  const [tileGraphics] = useState<TileGraphics>(() => readTileGraphics())
  const [cardId] = useState<PlayableCardId>(() => readPlayableCardFromStorage())
  const [slots, setSlots] = useState<(TileInstance | null)[]>(emptySlots)
  const [showResults, setShowResults] = useState(false)
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const [tilesGuideOn, setTilesGuideOn] = useState(false)
  const [pinnedHandKeys, setPinnedHandKeys] = useState<string[]>([])
  const [dragGhost, setDragGhost] = useState<DragGhost | null>(null)
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)

  const dragRef = useRef<{
    def: TileDef
    pointerId: number
    startX: number
    startY: number
    dragging: boolean
  } | null>(null)
  const suppressClickRef = useRef(false)
  const slotsRef = useRef(slots)
  const rackSlotElsRef = useRef<(HTMLButtonElement | null)[]>([])
  const focusKeyRef = useRef<string | null>(null)
  const sortModeRef = useRef<SortMode | null>(null)

  useEffect(() => {
    slotsRef.current = slots
  }, [slots])

  useEffect(() => {
    focusKeyRef.current = focusKey
  }, [focusKey])

  const handProbabilityEnabled = useMemo(
    () => readBool(LS_KEY_HAND_PROBABILITY, true),
    [],
  )
  const tenJokersEnabled = useMemo(() => readBool(LS_KEY_TEN_JOKERS, false), [])
  const blankTilesEnabled = useMemo(() => readBool(LS_KEY_BLANK_TILES, false), [])
  const blankTileCount = useMemo(() => readBlankTileCount(), [])
  const uncheckedSections = useMemo(() => readUncheckedSectionsFromStorage(), [])
  const hideConcealedHands = useMemo(() => readHideConcealedHandsFromStorage(), [])

  const cardPatterns = useMemo(() => patternsForCard(cardId), [cardId])
  const cardPatternsById = useMemo(() => patternByIdLookup(cardPatterns), [cardPatterns])
  const cardSectionOrder = useMemo(
    () => cardSectionOrderFromPatterns(cardPatterns),
    [cardPatterns],
  )

  const hand = useMemo(
    () => slots.filter((t): t is TileInstance => t != null),
    [slots],
  )
  const handSignature = useMemo(() => tileMultisetSignature(hand), [hand])
  const rackFull = hand.length >= RACK_SIZE

  /** Same as main game: lit tiles for the focused suggested line (independent of Tiles guide). */
  const suggestedBestIds = useMemo((): ReadonlySet<string> | null => {
    if (!focusKey) return null
    const patternId = focusKeyPatternId(focusKey)
    const p = cardPatternsById.get(patternId)
    if (!p) return null
    const pinned = buildPinnedPatternsFromFocusKey(p, focusKey)
    const patterns = pinned.length > 0 ? pinned : [p]
    const bestIds = new Set<string>()
    for (const pinnedP of patterns) {
      const detail = greedyPatternMatchDetail(hand, pinnedP)
      for (const id of computeRackPatternHighlightIds(hand, pinnedP, detail)) {
        bestIds.add(id)
      }
    }
    return bestIds
  }, [focusKey, hand, cardPatternsById])

  /** Reuse tracker count badges: counts tiles already on the checker rack. */
  const rackAsDiscardPile = useMemo((): DiscardEntry[] => {
    const seat: Seat = 'east'
    return hand.map((tile) => ({ tile, seat }))
  }, [hand])

  const pickableDefs = useMemo(
    () => (rackFull ? [] : sortedDiscardTrackerPickableDefs(blankTilesEnabled)),
    [rackFull, blankTilesEnabled],
  )

  const trackerGridStyle = useMemo(
    (): CSSProperties => ({
      width: '100%',
      ['--discard-tracker-slots-across' as string]: DISCARD_TRACKER_SORTED_BAND_COLS,
      ['--player-rack-face-gap' as string]: '2px',
    }),
    [],
  )

  useEffect(() => {
    document.documentElement.setAttribute('data-app-theme', appTheme)
    document.documentElement.style.backgroundColor = APP_THEME_PAGE_PAD_COLOR[appTheme]
  }, [appTheme])

  const rankInput = useMemo((): RankSuggestedHandsInput => {
    return {
      hand,
      wallRemaining: RACK_CHECKER_WALL_REMAINING,
      discards: [],
      exposures: [],
      playerClaimMelds: [],
      eastTableClaimMelds: [],
      patterns: cardPatterns,
      deckSettings: {
        totalJokersInGame: tenJokersEnabled ? TEN_JOKERS_COUNT : STANDARD_JOKER_COUNT,
        totalBlanksInGame: blankTilesEnabled ? blankTileCount : 0,
      },
    }
  }, [hand, cardPatterns, tenJokersEnabled, blankTilesEnabled, blankTileCount])

  const rankedHands = useRankSuggestedHandsWorker({
    input: rankInput,
    enabled: showResults && hand.length > 0,
    cardId,
    handSignature,
  })

  const placeDef = useCallback((def: TileDef, atIndex?: number) => {
    setSlots((prev) => {
      const next = [...prev]
      const idx =
        atIndex != null && atIndex >= 0 && atIndex < RACK_SIZE && next[atIndex] == null
          ? atIndex
          : next.findIndex((s) => s == null)
      if (idx < 0) return prev
      next[idx] = makeTile(def)
      return next
    })
  }, [])

  const removeAt = useCallback((index: number) => {
    setSlots((prev) => {
      if (!prev[index]) return prev
      const next = [...prev]
      next[index] = null
      return next
    })
    setShowResults(false)
    setFocusKey(null)
  }, [])

  const resetAll = useCallback(() => {
    setSlots(emptySlots())
    setShowResults(false)
    setFocusKey(null)
    setPinnedHandKeys([])
    setDragGhost(null)
    setDropTargetIndex(null)
    dragRef.current = null
  }, [])

  const togglePinnedHandKey = useCallback((key: string) => {
    setPinnedHandKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }, [])

  const onSuggestedPatternClick = useCallback((handKey: string) => {
    setFocusKey((prev) => (prev === handKey ? null : handKey))
  }, [])

  const packSortedHand = useCallback((sorted: TileInstance[]) => {
    const next: (TileInstance | null)[] = Array.from({ length: RACK_SIZE }, () => null)
    for (let i = 0; i < sorted.length && i < RACK_SIZE; i++) {
      next[i] = sorted[i]!
    }
    setSlots(next)
  }, [])

  const sortHand = useCallback(() => {
    if (hand.length === 0) return
    const key = focusKeyRef.current
    if (key) {
      sortModeRef.current = null
      packSortedHand(
        sortHandForSuggestedPattern(hand, focusKeyPatternId(key), rankInput, key),
      )
      return
    }
    const nextMode: SortMode = sortModeRef.current === 'suit' ? 'number' : 'suit'
    sortModeRef.current = nextMode
    packSortedHand(sortTiles(hand, nextMode))
  }, [hand, packSortedHand, rankInput])

  const onCheck = useCallback(() => {
    if (hand.length === 0) return
    if (showResults) {
      setShowResults(false)
      setFocusKey(null)
      return
    }
    setShowResults(true)
  }, [hand.length, showResults])

  const slotIndexFromPoint = useCallback((clientX: number, clientY: number): number | null => {
    for (let i = 0; i < RACK_SIZE; i++) {
      const el = rackSlotElsRef.current[i]
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        return i
      }
    }
    return null
  }, [])

  const endDrag = useCallback(
    (clientX: number, clientY: number, cancelled: boolean) => {
      const state = dragRef.current
      dragRef.current = null
      setDragGhost(null)
      setDropTargetIndex(null)
      if (!state) return
      if (cancelled || !state.dragging) return
      suppressClickRef.current = true
      const idx = slotIndexFromPoint(clientX, clientY)
      const current = slotsRef.current
      if (idx != null && current[idx] == null) {
        placeDef(state.def, idx)
      } else if (current.some((s) => s == null)) {
        placeDef(state.def)
      }
    },
    [placeDef, slotIndexFromPoint],
  )

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const state = dragRef.current
      if (!state || e.pointerId !== state.pointerId) return
      const dx = e.clientX - state.startX
      const dy = e.clientY - state.startY
      if (!state.dragging && dx * dx + dy * dy >= DRAG_SLOP_PX * DRAG_SLOP_PX) {
        state.dragging = true
      }
      if (!state.dragging) return
      setDragGhost({ def: state.def, x: e.clientX, y: e.clientY })
      const idx = slotIndexFromPoint(e.clientX, e.clientY)
      const current = slotsRef.current
      setDropTargetIndex(idx != null && current[idx] == null ? idx : null)
    }
    const onUp = (e: PointerEvent) => {
      const state = dragRef.current
      if (!state || e.pointerId !== state.pointerId) return
      endDrag(e.clientX, e.clientY, false)
    }
    const onCancel = (e: PointerEvent) => {
      const state = dragRef.current
      if (!state || e.pointerId !== state.pointerId) return
      endDrag(e.clientX, e.clientY, true)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
  }, [endDrag, slotIndexFromPoint])

  const onCatalogActivate = useCallback(
    (def: TileDef) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false
        return
      }
      if (rackFull || showResults) return
      placeDef(def)
    },
    [placeDef, rackFull, showResults],
  )

  const onCatalogPointerDown = useCallback(
    (def: TileDef, e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || rackFull || showResults) return
      dragRef.current = {
        def,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        dragging: false,
      }
    },
    [rackFull, showResults],
  )

  return (
    <TileGraphicsProvider tileGraphics={tileGraphics}>
      <div
        className="app rack-checker"
        data-app-theme={appTheme}
        data-tile-graphics={tileGraphics}
      >
        <header className="rack-checker__header">
          <h1 className="rack-checker__title">Rack Checker</h1>
          <button
            type="button"
            className="rack-checker__close"
            aria-label="Close"
            onClick={() => navigate('/play')}
          >
            ✕
          </button>
        </header>

        <div className="rack-checker__rack-panel panel panel--hand">
          <div className="rack-checker__rack" role="list" aria-label="Rack">
            {slots.map((tile, index) => {
              const isBest = !!tile && !!suggestedBestIds?.has(tile.id)
              const suggestDim = !!tile && !!suggestedBestIds && !isBest
              return (
                <button
                  key={tile?.id ?? `empty-${index}`}
                  type="button"
                  ref={(el) => {
                    rackSlotElsRef.current[index] = el
                  }}
                  className={[
                    'rack-checker__slot',
                    tile ? 'rack-checker__slot--filled' : 'rack-checker__slot--empty',
                    dropTargetIndex === index ? 'rack-checker__slot--drop-target' : '',
                    isBest ? 'sortable-tile-wrap--suggest-best' : '',
                    suggestDim ? 'sortable-tile-wrap--suggest-dim' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-label={
                    tile
                      ? `${tileAriaLabel(tile.def)}, tap to remove`
                      : `Empty rack slot ${index + 1}`
                  }
                  onClick={() => {
                    if (tile) removeAt(index)
                  }}
                >
                  {tile ? <TileFace def={tile.def} rackSuitStacked /> : null}
                </button>
              )
            })}
          </div>
        </div>

        <div className="rack-checker__actions">
          <button
            type="button"
            className="btn btn--primary rack-bottom-tile-cell rack-checker__action-btn"
            disabled={hand.length === 0}
            onClick={sortHand}
          >
            Sort
          </button>
          <button
            type="button"
            className="btn btn--primary rack-bottom-tile-cell rack-checker__action-btn"
            disabled={hand.length === 0}
            onClick={onCheck}
          >
            Check
          </button>
          <button
            type="button"
            className="btn btn--primary rack-bottom-tile-cell rack-checker__action-btn"
            disabled={hand.length === 0 && !showResults}
            onClick={resetAll}
          >
            Reset
          </button>
        </div>

        <div className="rack-checker__lower">
          {showResults ? (
            <div className="rack-checker__results">
              <div
                className="suggested-hands-popup suggested-hands-popup--discard-overlay suggested-hands-popup--open rack-checker__hands-tray"
                role="dialog"
                aria-label="Suggested Hands"
                aria-modal="false"
              >
                <SuggestedHandsPanel
                  discardTraySurface
                  trayOpen
                  hands={rankedHands}
                  activePatternId={focusKey}
                  pinnedHandKeys={pinnedHandKeys}
                  onPinnedPatternChange={togglePinnedHandKey}
                  onPatternClick={onSuggestedPatternClick}
                  onFocusKeyMigrate={setFocusKey}
                  tilesGuideOn={tilesGuideOn}
                  showHandProbability={handProbabilityEnabled}
                  rackTilesForSuggestedStrip={hand}
                  uncheckedSections={uncheckedSections}
                  hideConcealedHands={hideConcealedHands}
                  cardPatterns={cardPatterns}
                  cardSectionOrder={cardSectionOrder}
                />
              </div>
              <div className="rack-checker__results-tools">
                <button
                  type="button"
                  className={[
                    'btn btn--primary rack-bottom-tile-cell rack-checker__action-btn rack-checker__tiles-toggle',
                    tilesGuideOn ? 'rack-checker__tiles-toggle--on' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-pressed={tilesGuideOn}
                  onClick={() => setTilesGuideOn((v) => !v)}
                >
                  Tiles guide
                </button>
              </div>
            </div>
          ) : (
            <div className="rack-checker__picker" aria-label="Tile selection">
              <div className="rack-checker__tracker-shell">
                <div className="rack-checker__catalog-fit">
                <div className="blank-exchange-overlay__tracker-mirror app-play-split app-top-exposure-container rack-checker__tracker-mirror">
                  <div className="discard-tracker__shell">
                    <div className="discard-tracker__content discard-tracker__content--tile-groups-only">
                      <div className="discard-tracker__tile-groups-container">
                        <div
                          className="discard-tracker__overlay-grid"
                          aria-label="Tile catalog"
                          style={trackerGridStyle}
                        >
                          <div className="discard-tracker__overlay-row">
                            <SortedDiscardTrayRow
                              tiles={SORTED_DISCARD_ROW1_TILES}
                              slotCount={DISCARD_TRACKER_SORTED_ROW_SLOTS}
                              leadingSuitLabel={tileSuitRackWord('bam')}
                              leadingSuitLabelTone="bam"
                              ariaLabel="Bam tiles"
                              discardPile={rackAsDiscardPile}
                              brightSlots
                              onSlotActivate={onCatalogActivate}
                              pickableDefs={pickableDefs}
                              onSlotPointerDown={onCatalogPointerDown}
                            />
                          </div>
                          <div className="discard-tracker__overlay-row">
                            <SortedDiscardTrayRow
                              tiles={SORTED_DISCARD_ROW2_TILES}
                              slotCount={DISCARD_TRACKER_SORTED_ROW_SLOTS}
                              leadingSuitLabel={tileSuitRackWord('dot')}
                              leadingSuitLabelTone="dot"
                              ariaLabel="Dot tiles"
                              discardPile={rackAsDiscardPile}
                              brightSlots
                              onSlotActivate={onCatalogActivate}
                              pickableDefs={pickableDefs}
                              onSlotPointerDown={onCatalogPointerDown}
                            />
                          </div>
                          <div className="discard-tracker__overlay-row">
                            <SortedDiscardTrayRow
                              tiles={SORTED_DISCARD_ROW3_TILES}
                              slotCount={DISCARD_TRACKER_SORTED_ROW_SLOTS}
                              leadingSuitLabel={tileSuitRackWord('crak')}
                              leadingSuitLabelTone="crak"
                              ariaLabel="Crak tiles"
                              discardPile={rackAsDiscardPile}
                              blankTilesEnabled={blankTilesEnabled}
                              brightSlots
                              onSlotActivate={onCatalogActivate}
                              pickableDefs={pickableDefs}
                              onSlotPointerDown={onCatalogPointerDown}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {dragGhost ? (
          <div
            className="rack-checker__drag-ghost"
            style={{
              left: dragGhost.x,
              top: dragGhost.y,
            }}
            aria-hidden
          >
            <TileFace def={dragGhost.def} rackSuitStacked />
          </div>
        ) : null}
      </div>
    </TileGraphicsProvider>
  )
}
