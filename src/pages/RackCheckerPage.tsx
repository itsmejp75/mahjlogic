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
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
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
import { SortableHand } from '../components/SortableHand'
import { SuggestedHandsPanel } from '../components/SuggestedHandsPanel'
import { TileFace } from '../components/TileFace'
import { STANDARD_JOKER_COUNT, TEN_JOKERS_COUNT } from '../mahjong/deck'
import {
  DISCARD_TRACKER_SORTED_BAND_COLS,
  SORTED_DISCARD_ROW1_TILES,
  SORTED_DISCARD_ROW2_TILES,
  SORTED_DISCARD_ROW3_TILES,
  sortedDiscardTrackerPickableDefs,
} from '../mahjong/sortedDiscardTrackerTiles'
import { sortTiles, tileDefsEqual, type SortMode } from '../mahjong/tileUtils'
import type { DiscardEntry, Seat, TileDef, TileInstance } from '../mahjong/types'
import {
  readHideConcealedHandsFromStorage,
  readUncheckedSectionsFromStorage,
} from '../suggestedHands/filterSettings'
import { TileGraphicsProvider } from '../tiles/TileGraphicsContext'
import { DEFAULT_TILE_GRAPHICS } from '../tiles/tileGraphics'

const RACK_SIZE = 14
/** Neutral wall size so Prob % is usable without a live deal. */
const RACK_CHECKER_WALL_REMAINING = 72
const DRAG_SLOP_PX = 8

const LS_KEY_APP_THEME = 'mahjlogic.appTheme'
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

function packSlots(tiles: readonly TileInstance[]): (TileInstance | null)[] {
  const next = emptySlots()
  for (let i = 0; i < tiles.length && i < RACK_SIZE; i++) {
    next[i] = tiles[i]!
  }
  return next
}

function makeTile(def: TileDef): TileInstance {
  return { id: crypto.randomUUID(), def }
}

/** Deck copy limits for rack-checker picks (NMJL: 4 of most, 8 flowers / jokers). */
function maxCopiesForDef(
  def: TileDef,
  opts: { jokerCount: number; blankCount: number },
): number {
  if (def.cat === 'flower') return 8
  if (def.cat === 'joker') return opts.jokerCount
  if (def.cat === 'blank') return opts.blankCount
  return 4
}

function countOnRack(rack: readonly TileInstance[], def: TileDef): number {
  let n = 0
  for (const t of rack) {
    if (tileDefsEqual(t.def, def)) n += 1
  }
  return n
}

type DragGhost = {
  def: TileDef
  x: number
  y: number
}

export function RackCheckerPage({
  onClose,
  overlay = false,
}: {
  /** When set (in-game overlay), Close returns here instead of remounting `/play`. */
  onClose?: () => void
  /** Full-viewport layer above the live game (game stays mounted underneath). */
  overlay?: boolean
} = {}) {
  const navigate = useNavigate()
  const [appTheme] = useState<AppTheme>(() => readTheme())
  /** Rack Checker always uses classic faces (picker + rack), independent of menu Simple. */
  const tileGraphics = DEFAULT_TILE_GRAPHICS
  const [cardId] = useState<PlayableCardId>(() => readPlayableCardFromStorage())
  const [slots, setSlots] = useState<(TileInstance | null)[]>(emptySlots)
  const [showResults, setShowResults] = useState(false)
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const [pinnedHandKeys, setPinnedHandKeys] = useState<string[]>([])
  const [dragGhost, setDragGhost] = useState<DragGhost | null>(null)
  const [catalogDropOverRack, setCatalogDropOverRack] = useState(false)
  const [activeHandDragTile, setActiveHandDragTile] = useState<TileInstance | null>(null)

  const dragRef = useRef<{
    def: TileDef
    pointerId: number
    startX: number
    startY: number
    dragging: boolean
  } | null>(null)
  const suppressClickRef = useRef(false)
  const slotsRef = useRef(slots)
  const rackPanelRef = useRef<HTMLDivElement | null>(null)
  const focusKeyRef = useRef<string | null>(null)
  const sortModeRef = useRef<SortMode | null>(null)

  const handSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

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
  const jokerCount = tenJokersEnabled ? TEN_JOKERS_COUNT : STANDARD_JOKER_COUNT
  const blankCount = blankTilesEnabled ? blankTileCount : 0
  const deckCopyOpts = useMemo(
    () => ({ jokerCount, blankCount }),
    [jokerCount, blankCount],
  )

  const handIds = useMemo(() => hand.map((t) => t.id), [hand])

  /** Same as main game: lit tiles for the focused suggested line. */
  const suggestedTileGuide = useMemo(() => {
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
    return { bestIds }
  }, [focusKey, hand, cardPatternsById])

  /** Reuse tracker count badges: counts tiles already on the checker rack. */
  const rackAsDiscardPile = useMemo((): DiscardEntry[] => {
    const seat: Seat = 'east'
    return hand.map((tile) => ({ tile, seat }))
  }, [hand])

  const pickableDefs = useMemo(() => {
    if (rackFull) return []
    return sortedDiscardTrackerPickableDefs(blankTilesEnabled).filter(
      (def) => countOnRack(hand, def) < maxCopiesForDef(def, deckCopyOpts),
    )
  }, [rackFull, blankTilesEnabled, hand, deckCopyOpts])

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

  const placeDef = useCallback(
    (def: TileDef, atIndex?: number) => {
      setSlots((prev) => {
        const filled = prev.filter((t): t is TileInstance => t != null)
        if (filled.length >= RACK_SIZE) return prev
        if (countOnRack(filled, def) >= maxCopiesForDef(def, deckCopyOpts)) return prev
        const tile = makeTile(def)
        const insertAt =
          atIndex != null
            ? Math.max(0, Math.min(atIndex, filled.length))
            : filled.length
        const nextHand = [...filled.slice(0, insertAt), tile, ...filled.slice(insertAt)]
        return packSlots(nextHand)
      })
    },
    [deckCopyOpts],
  )

  const removeTileById = useCallback((tileId: string) => {
    setSlots((prev) => {
      const filled = prev.filter((t): t is TileInstance => t != null)
      const nextHand = filled.filter((t) => t.id !== tileId)
      if (nextHand.length === filled.length) return prev
      return packSlots(nextHand)
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
    setCatalogDropOverRack(false)
    setActiveHandDragTile(null)
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
    setSlots(packSlots(sorted))
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

  const insertIndexFromPoint = useCallback((clientX: number, clientY: number): number | null => {
    const panel = rackPanelRef.current
    if (!panel) return null
    const r = panel.getBoundingClientRect()
    if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) {
      return null
    }
    const filled = slotsRef.current.filter((t): t is TileInstance => t != null).length
    const rel = (clientX - r.left) / Math.max(1, r.width)
    return Math.max(0, Math.min(filled, Math.floor(rel * RACK_SIZE)))
  }, [])

  const endCatalogDrag = useCallback(
    (clientX: number, clientY: number, cancelled: boolean) => {
      const state = dragRef.current
      dragRef.current = null
      setDragGhost(null)
      setCatalogDropOverRack(false)
      if (!state) return
      if (cancelled || !state.dragging) return
      suppressClickRef.current = true
      const idx = insertIndexFromPoint(clientX, clientY)
      if (idx != null) placeDef(state.def, idx)
      else if (slotsRef.current.some((s) => s == null)) placeDef(state.def)
    },
    [placeDef, insertIndexFromPoint],
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
      setCatalogDropOverRack(insertIndexFromPoint(e.clientX, e.clientY) != null)
    }
    const onUp = (e: PointerEvent) => {
      const state = dragRef.current
      if (!state || e.pointerId !== state.pointerId) return
      endCatalogDrag(e.clientX, e.clientY, false)
    }
    const onCancel = (e: PointerEvent) => {
      const state = dragRef.current
      if (!state || e.pointerId !== state.pointerId) return
      endCatalogDrag(e.clientX, e.clientY, true)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
  }, [endCatalogDrag, insertIndexFromPoint])

  const onHandDragStart = useCallback(
    (e: DragStartEvent) => {
      const id = String(e.active.id)
      const tile = slotsRef.current.find((t) => t?.id === id) ?? null
      setActiveHandDragTile(tile)
    },
    [],
  )

  const onHandDragEnd = useCallback((e: DragEndEvent) => {
    setActiveHandDragTile(null)
    const { active, over } = e
    if (!over || active.id === over.id) return
    setSlots((prev) => {
      const filled = prev.filter((t): t is TileInstance => t != null)
      const oldIndex = filled.findIndex((t) => t.id === String(active.id))
      const newIndex = filled.findIndex((t) => t.id === String(over.id))
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return prev
      return packSlots(arrayMove(filled, oldIndex, newIndex))
    })
  }, [])

  const onHandDragCancel = useCallback(() => {
    setActiveHandDragTile(null)
  }, [])

  const canPlaceDef = useCallback(
    (def: TileDef) => {
      if (rackFull || showResults) return false
      return countOnRack(hand, def) < maxCopiesForDef(def, deckCopyOpts)
    },
    [rackFull, showResults, hand, deckCopyOpts],
  )

  const onCatalogActivate = useCallback(
    (def: TileDef) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false
        return
      }
      if (!canPlaceDef(def)) return
      placeDef(def)
    },
    [canPlaceDef, placeDef],
  )

  const onCatalogPointerDown = useCallback(
    (def: TileDef, e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || !canPlaceDef(def)) return
      dragRef.current = {
        def,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        dragging: false,
      }
    },
    [canPlaceDef],
  )

  const handleClose = useCallback(() => {
    if (onClose) {
      onClose()
      return
    }
    navigate('/play')
  }, [navigate, onClose])

  return (
    <TileGraphicsProvider tileGraphics={tileGraphics}>
      <div
        className={['app', 'rack-checker', overlay ? 'rack-checker--overlay' : '']
          .filter(Boolean)
          .join(' ')}
        data-app-theme={appTheme}
        data-tile-graphics={tileGraphics}
      >
        <header className="rack-checker__header">
          <h1 className="rack-checker__title">Rack Checker</h1>
        </header>

        <div
          ref={rackPanelRef}
          className={[
            'rack-checker__rack-panel',
            catalogDropOverRack ? 'rack-checker__rack-panel--drop-target' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <DndContext
            sensors={handSensors}
            collisionDetection={closestCenter}
            onDragStart={onHandDragStart}
            onDragEnd={onHandDragEnd}
            onDragCancel={onHandDragCancel}
          >
            <SortableContext items={handIds} strategy={rectSortingStrategy}>
              <SortableHand
                tiles={hand}
                sortableOrder={handIds}
                selectedTileId={null}
                onTileActivate={removeTileById}
                suggestedTileGuide={suggestedTileGuide}
                slotCount={RACK_SIZE}
                animationsEnabled
              />
            </SortableContext>
            <DragOverlay dropAnimation={null}>
              {activeHandDragTile ? (
                <div
                  className={[
                    'drag-overlay-tile',
                    suggestedTileGuide?.bestIds.has(activeHandDragTile.id)
                      ? 'sortable-tile-wrap--suggest-best'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <TileFace def={activeHandDragTile.def} elevated rackSuitStacked />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
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
            className={[
              'btn btn--primary rack-bottom-tile-cell rack-checker__action-btn',
              showResults ? 'rack-checker__check-btn--on' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            disabled={hand.length === 0}
            aria-pressed={showResults}
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
          <button
            type="button"
            className="btn btn--primary rack-bottom-tile-cell rack-checker__action-btn"
            onClick={handleClose}
          >
            Close
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
                  tilesGuideOn
                  showHandProbability={handProbabilityEnabled}
                  rackTilesForSuggestedStrip={hand}
                  uncheckedSections={uncheckedSections}
                  hideConcealedHands={hideConcealedHands}
                  cardPatterns={cardPatterns}
                  cardSectionOrder={cardSectionOrder}
                />
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
                              slotCount={SORTED_DISCARD_ROW1_TILES.length}
                              ariaLabel="Bam tiles"
                              discardPile={rackAsDiscardPile}
                              brightSlots
                              fullTileFaces
                              onSlotActivate={onCatalogActivate}
                              pickableDefs={pickableDefs}
                              onSlotPointerDown={onCatalogPointerDown}
                            />
                          </div>
                          <div className="discard-tracker__overlay-row">
                            <SortedDiscardTrayRow
                              tiles={SORTED_DISCARD_ROW2_TILES}
                              slotCount={SORTED_DISCARD_ROW2_TILES.length}
                              ariaLabel="Dot tiles"
                              discardPile={rackAsDiscardPile}
                              brightSlots
                              fullTileFaces
                              onSlotActivate={onCatalogActivate}
                              pickableDefs={pickableDefs}
                              onSlotPointerDown={onCatalogPointerDown}
                            />
                          </div>
                          <div className="discard-tracker__overlay-row">
                            <SortedDiscardTrayRow
                              tiles={SORTED_DISCARD_ROW3_TILES}
                              slotCount={SORTED_DISCARD_ROW3_TILES.length}
                              ariaLabel="Crak tiles"
                              discardPile={rackAsDiscardPile}
                              blankTilesEnabled={blankTilesEnabled}
                              brightSlots
                              fullTileFaces
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
