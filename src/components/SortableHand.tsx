import type { CSSProperties } from 'react'
import { memo, useRef, useLayoutEffect, useEffect, useState, useMemo } from 'react'
import { useDndContext } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import type { Transform } from '@dnd-kit/utilities'
import type { TileInstance } from '../mahjong/types'
import type { HandTileFlyIn } from '../mahjong/handTileFlyIn'
import { DeadCauseWarning } from './DeadCauseWarning'
import { TileFace } from './TileFace'

/**
 * Tile-width "track" for inline shift transforms — must match the grid track width
 * `.panel--hand .panel-hand-rack__hand-tray .hand-row` uses (`repeat(14, 1fr)` + `gap`).
 * Using `--rack-tile-w` + face-gap keeps the math identical to one column step.
 */
const RACK_FLY_TX_ZERO = '0px'
/** One column to the right — opens a gap for a tile hovering over / leaving the rack. */
const RACK_FLY_TX_ONE_COL =
  'calc(var(--rack-tile-w) + var(--player-rack-face-gap, var(--rack-tile-gap)))'
/** One column to the *left* — closes the gap of a tile being lifted out to pass (compaction preview). */
const RACK_FLY_TX_ONE_COL_LEFT =
  'calc(-1 * (var(--rack-tile-w) + var(--player-rack-face-gap, var(--rack-tile-gap))))'
const RACK_REORDER_EASING = 'cubic-bezier(0.2, 0, 0.2, 1)'
const RACK_REORDER_DURATION = '0.16s'
/**
 * Neighbour-slide transition. Animates the independent `translate` property (NOT a custom property
 * fed into `transform`): `translate` is GPU-composited, so the slides keep up on mobile even while
 * the main thread is busy — the old `--rack-fly-tx` custom-property transition ran on the main
 * thread every frame, so under load the tiles lagged at different rates and left multiple gaps.
 * `transform: translateZ(0)` stays permanent in CSS, so the layer never toggles (iOS jog guard).
 */
const RACK_FLY_MOTION_TRANSITION = `translate ${RACK_REORDER_DURATION} ${RACK_REORDER_EASING}`

function sameReadonlySet(
  a: ReadonlySet<string> | null | undefined,
  b: ReadonlySet<string> | null | undefined,
): boolean {
  if (a === b) return true
  if (a == null || b == null) return a == null && b == null
  if (a.size !== b.size) return false
  for (const id of a) {
    if (!b.has(id)) return false
  }
  return true
}

function sameTileIdOrder(a: readonly TileInstance[], b: readonly TileInstance[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.id !== b[i]!.id) return false
  }
  return true
}

function sameStringIdOrder(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  if (a === b) return true
  if (a == null || b == null) return a == null && b == null
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/**
 * Horizontal slide only — never scale. rectSortingStrategy compares full rects; when the dragged
 * tile leaves the row its height/width delta becomes scaleY/scaleX on neighbours (PassStrip
 * comment). On mobile / installed PWA (WKWebView) sub-pixel rect reads make those FLIP deltas
 * large enough to read as the whole rack jogging up/down; desktop sub-pixels stay invisible.
 * Strip `y` too — vertical translate is never wanted in this single-row rack.
 */
function rackSortableFlyTx(transform: Transform | null): string {
  if (transform == null) return RACK_FLY_TX_ZERO
  return `${transform.x}px`
}

function SortableTile({
  tile,
  selected,
  charlestonGlow,
  discardMode,
  suggestDim,
  suggestBest,
  suggestBlankExchange,
  suggestDying,
  suggestDeadCause,
  stagedForMeld,
  isJustDrawn,
  isHandFlyIn,
  handTileFlyIn,
  handFlyInWaveDelayMs,
  drawInFromRackBottom,
  onSelect,
  jokerSwapHintBounce = false,
  jokerSwapHintBounceEpoch = 0,
  externalShift = false,
  externalPreviewActive = false,
  deferHandFlyMeasure = false,
  shiftPhase = null,
  passStageShiftLeft = false,
}: {
  tile: TileInstance
  selected: boolean
  charlestonGlow: boolean
  discardMode: boolean
  suggestDim: boolean
  suggestBest: boolean
  /** Blank could be redeemed for a discard this line still needs — Simple joker yellow ring. */
  suggestBlankExchange: boolean
  suggestDying: boolean
  suggestDeadCause: boolean
  stagedForMeld: boolean
  isJustDrawn: boolean
  /** Charleston / wall-draw fly-in (viewport corner origin). */
  isHandFlyIn: boolean
  /** Present when `isHandFlyIn` (read `.from` only in that branch). */
  handTileFlyIn: HandTileFlyIn | null
  /** Per-tile `animation-delay` for opening-deal wave (ms); omit when no stagger. */
  handFlyInWaveDelayMs?: number
  /**
   * When true with `isJustDrawn`, the tile animates up from below this rack slot (same vector as
   * call tiles into the exposure row), not from the wall or pass direction.
   */
  drawInFromRackBottom?: boolean
  onSelect: (id: string) => void
  /** Joker swap hint: macOS-style dock bounce on naturals you can swap for an exposed joker. */
  jokerSwapHintBounce?: boolean
  /** Bumped when your discard phase starts again so the bounce animation can replay. */
  jokerSwapHintBounceEpoch?: number
  /** Cross-zone preview gap (e.g. Charleston pass tile hovering over the hand) without remounting sortables. */
  externalShift?: boolean
  /** Ignore dnd-kit transforms while a non-hand tile previews insertion into the rack. */
  externalPreviewActive?: boolean
  /**
   * Multi-tile hand fly-in: wait two frames for the rack grid to settle, then measure and start
   * the animation (Charleston receive / opening deal). Avoids rewriting `--draw-anim-*` mid-flight.
   */
  deferHandFlyMeasure?: boolean
  /**
   * Post-removal slide animation:
   *   `'pre'`  — tile is parked one column to the right (its old position) with no transition.
   *   `'post'` — transition is enabled and the transform clears, sliding the tile back into its
   *              new (smaller-rack) column. Same feel as in-rack rearrange.
   *   `null`   — no shift in progress.
   */
  shiftPhase?: 'pre' | 'post' | null
  /**
   * This tile sits to the right of a hand tile being lifted onto a Charleston pass slot: slide one
   * column left to preview the rack closing up around the removed tile, instead of letting dnd-kit
   * snap it back to its home column when the pass box wins the drop target.
   */
  passStageShiftLeft?: boolean
}) {
  const { active } = useDndContext()
  const { attributes, listeners, setNodeRef, transform } =
    useSortable({
      id: tile.id,
      // Never use sortable’s **post-drop** “layout” animation. It can stack with `transition`
      // and, with a separate FLIP, made neighbours jump. During drag, `transform` still updates.
      animateLayoutChanges: () => false,
    })

  // Horizontal translate only for smooth slides; scale + vertical FLIP stripped (see rackSortableFlyTx).
  const draggingThisTile = active != null && String(active.id) === tile.id

  let rackFlyTx: string
  let resolvedTransition: string

  if (externalPreviewActive) {
    // Cross-zone drags (Charleston pass or discard staging hovering the rack): use only the
    // single rightward gap transform; ignore dnd-kit context transforms that would fight it.
    rackFlyTx = externalShift ? RACK_FLY_TX_ONE_COL : RACK_FLY_TX_ZERO
    resolvedTransition = active ? RACK_FLY_MOTION_TRANSITION : 'none'
  } else if (draggingThisTile) {
    // DragOverlay carries the visible tile — park the source in its grid slot (opacity 0) so
    // moving it with dnd-kit transforms does not skew rectSortingStrategy measurements.
    rackFlyTx = RACK_FLY_TX_ZERO
    resolvedTransition = 'none'
  } else if (shiftPhase === 'pre') {
    // Park one column to the right (the tile's old position) without easing so the next render
    // can transition cleanly back to the new column.
    rackFlyTx = RACK_FLY_TX_ONE_COL
    resolvedTransition = 'none'
  } else if (shiftPhase === 'post') {
    // Slide back to the new column — ignore leftover dnd-kit FLIP deltas (can include y on mobile).
    rackFlyTx = RACK_FLY_TX_ZERO
    resolvedTransition = RACK_FLY_MOTION_TRANSITION
  } else if (passStageShiftLeft) {
    // Tile being passed is lifted onto a slot: close its gap (slide left one column) so the rack
    // previews the removed state instead of dnd-kit snapping the slid neighbours back to home.
    rackFlyTx = RACK_FLY_TX_ONE_COL_LEFT
    resolvedTransition = RACK_FLY_MOTION_TRANSITION
  } else if (active) {
    // Any active drag — in-rack reorder OR dragging a tile out to the pass box / discard / call.
    // Neighbours slide horizontally to open or close the gap so they move out of the dragged
    // tile's way in real time (not on release). Motion is the composited `translate` property so
    // authored `translateZ(0)` on `__fly` stays put (mobile size flicker / jog guard).
    rackFlyTx = rackSortableFlyTx(transform)
    resolvedTransition = RACK_FLY_MOTION_TRANSITION
  } else {
    // Programmatic reorder (suggested-hand sort) must not apply dnd-kit FLIP deltas — they can
    // include a vertical component on mobile and read as the whole rack jogging up/down.
    rackFlyTx = RACK_FLY_TX_ZERO
    resolvedTransition = 'none'
  }

  // Grid slot (wrap): layout only — no transform. dnd-kit slide transforms live on `__fly` so
  // WKWebView never re-lays out the `repeat(14, 1fr)` row when neighbours animate (the mobile
  // up/down rack jog; tap-to-pass never mutates transforms, so it never jogged).
  const wrapStyle: CSSProperties = {
    opacity: draggingThisTile ? 0 : undefined,
    zIndex: draggingThisTile ? 2 : undefined,
  }
  // Composited slide: drive the independent `translate` property (y stays 0). CSS keeps the
  // permanent `transform: translateZ(0)` layer so this never toggles layer promotion.
  const flyMotionStyle: CSSProperties = {
    translate: `${rackFlyTx} 0px`,
    transition: resolvedTransition,
  }

  // When the tile becomes "just drawn", measure the delta from the active discard slot
  // so the drop-in animation travels from there to the tile's final rest position.
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const setWrapRef = (node: HTMLDivElement | null) => {
    wrapRef.current = node
    setNodeRef(node)
  }
  const flyInRef = useRef<HTMLDivElement | null>(null)
  const runFlyLayout = isJustDrawn || isHandFlyIn
  const handFlyInFrom = handTileFlyIn?.from
  const handFlyInIdsKey = handTileFlyIn?.ids.join('\u0001') ?? ''
  // Hold `just-drawn` until remasure finishes — updating --draw-anim-* mid-flight looks like a skip.
  const [flyAnimReady, setFlyAnimReady] = useState(!deferHandFlyMeasure)
  useLayoutEffect(() => {
    if (!runFlyLayout) {
      setFlyAnimReady(true)
      return
    }
    if (deferHandFlyMeasure) setFlyAnimReady(false)
    else setFlyAnimReady(true)
  }, [runFlyLayout, deferHandFlyMeasure, handFlyInIdsKey, tile.id])

  useLayoutEffect(() => {
    if (!runFlyLayout) return

    let raf1 = 0
    let raf2 = 0

    const apply = () => {
      const el = wrapRef.current
      const flyEl = flyInRef.current
      if (!el || !flyEl) return
      // WebKit (standalone PWA / iOS): first layout pass can read before the rack grid resolves.
      void el.offsetHeight
      const tileRect = el.getBoundingClientRect()
      const tileCx = tileRect.left + tileRect.width / 2
      const tileCy = tileRect.top + tileRect.height / 2

      let ox: number
      let oy: number
      if (isHandFlyIn && handFlyInFrom) {
        const w = tileRect.width
        const h = tileRect.height
        switch (handFlyInFrom) {
          case 'right':
            ox = tileCx + w * 1.25
            oy = tileCy
            break
          case 'left':
            ox = tileCx - w * 1.25
            oy = tileCy
            break
          case 'across':
          default:
            ox = tileCx
            oy = tileCy - h * 1.2
            break
        }
      } else if (isJustDrawn && drawInFromRackBottom) {
        const h = tileRect.height
        ox = tileCx
        oy = tileCy + h * 1.05
      } else if (isJustDrawn) {
        const h = tileRect.height
        ox = tileCx
        oy = tileCy - h * 1.2
      } else {
        return
      }
      flyEl.style.setProperty('--draw-anim-dx', `${ox - tileCx}px`)
      flyEl.style.setProperty('--draw-anim-dy', `${oy - tileCy}px`)
    }

    if (deferHandFlyMeasure) {
      // Measure only after the rack grid settles, then start the animation (no mid-flight var rewrite).
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          apply()
          setFlyAnimReady(true)
        })
      })
    } else {
      apply()
      if (isHandFlyIn) {
        const el = wrapRef.current
        if (el) {
          const r = el.getBoundingClientRect()
          if (r.width < 6 || r.height < 6) {
            raf1 = requestAnimationFrame(() => {
              raf2 = requestAnimationFrame(apply)
            })
          }
        }
      }
    }

    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [
    runFlyLayout,
    isJustDrawn,
    isHandFlyIn,
    handFlyInFrom,
    handFlyInIdsKey,
    tile.id,
    drawInFromRackBottom,
    deferHandFlyMeasure,
  ])

  // Mount `just-drawn` during deferred measure too (paused) so rack z-index lifts before the
  // first visible frame — otherwise tiles start behind the green pass strip and pop forward.
  const showJustDrawnAnim = runFlyLayout && (flyAnimReady || deferHandFlyMeasure)
  const flyPausedForMeasure = deferHandFlyMeasure && !flyAnimReady

  const flyStyle: CSSProperties = {
    ...flyMotionStyle,
    ...(handFlyInWaveDelayMs != null ? { animationDelay: `${handFlyInWaveDelayMs}ms` } : {}),
  }

  return (
    <div
      ref={setWrapRef}
      style={wrapStyle}
      data-hand-tile-id={tile.id}
      className={[
        'sortable-tile-wrap',
        draggingThisTile ? 'sortable-tile-wrap--dragging' : '',
        isJustDrawn && drawInFromRackBottom ? 'sortable-tile-wrap--joker-swap-fly-clip' : '',
        selected ? 'sortable-tile-wrap--selected' : '',
        charlestonGlow ? 'sortable-tile-wrap--charleston-new' : '',
        discardMode ? 'sortable-tile-wrap--discard-mode' : '',
        suggestDim ? 'sortable-tile-wrap--suggest-dim' : '',
        suggestBest ? 'sortable-tile-wrap--suggest-best' : '',
        suggestBlankExchange ? 'sortable-tile-wrap--blank-exchange-hint' : '',
        suggestDying ? 'sortable-tile-wrap--suggest-dying' : '',
        suggestDeadCause ? 'sortable-tile-wrap--suggest-dead-cause' : '',
        stagedForMeld ? 'sortable-tile-wrap--staged-meld' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...attributes}
      {...listeners}
      onClick={() => onSelect(tile.id)}
    >
      <div
        key={
          jokerSwapHintBounce && !runFlyLayout
            ? `jsb-${jokerSwapHintBounceEpoch}-${tile.id}`
            : `fly-${tile.id}`
        }
        ref={flyInRef}
        className={[
          showJustDrawnAnim
            ? 'sortable-tile-wrap__fly sortable-tile-wrap--just-drawn'
            : 'sortable-tile-wrap__fly',
          flyPausedForMeasure ? 'sortable-tile-wrap--fly-paused' : '',
          handFlyInWaveDelayMs != null ? 'sortable-tile-wrap--opening-deal-wave' : '',
          showJustDrawnAnim && isJustDrawn && drawInFromRackBottom
            ? 'exposure-rack__call-staging-fly-up'
            : '',
          jokerSwapHintBounce && !runFlyLayout ? 'sortable-tile-wrap__fly--joker-swap-hint-bounce' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={flyStyle}
      >
        <TileFace def={tile.def} elevated={draggingThisTile} rackSuitStacked />
        {suggestDeadCause ? <DeadCauseWarning className="sortable-tile-wrap__dead-warn" /> : null}
      </div>
    </div>
  )
}

/** Invisible slot: same id as the tile being dragged from the pass strip so hand sortables animate a gap. */
function CharlestonPassHandPhantomSortable({ tile }: { tile: TileInstance }) {
  const { active } = useDndContext()
  const { attributes, setNodeRef, transform, isDragging } = useSortable({
    id: tile.id,
    animateLayoutChanges: () => false,
  })
  const flyMotionStyle: CSSProperties = {
    translate: `${rackSortableFlyTx(transform)} 0px`,
    transition: isDragging
      ? 'none'
      : active
        ? RACK_FLY_MOTION_TRANSITION
        : 'none',
  }
  return (
    <div
      ref={setNodeRef}
      style={{ opacity: 0, pointerEvents: 'none' }}
      className="sortable-tile-wrap"
      {...attributes}
      aria-hidden
    >
      <div className="sortable-tile-wrap__fly" style={flyMotionStyle}>
        <TileFace def={tile.def} elevated={false} rackSuitStacked />
      </div>
    </div>
  )
}

type Props = {
  tiles: TileInstance[]
  selectedTileId: string | null
  /** First tries quick actions (e.g. fill pass); otherwise toggles selection. */
  onTileActivate: (id: string) => void
  /** Last drawn tile id — triggers fly-in animation on wall draw / claim receive. */
  highlightedTileId?: string | null
  /** Charleston: tiles just received on the last pass (tracked until next pass). */
  charlestonGlowTileIds?: ReadonlySet<string>
  /** Fly-in from table direction (Charleston receive, wall draw, Mah Jongg on discard). */
  handTileFlyIn?: HandTileFlyIn | null
  /** Joker redeemed into the hand: that tile id animates up from below its rack slot. */
  handJokerSwapFlyInFromBelowId?: string | null
  /** Suggested-hand guide: white inset ring only on tiles in `bestIds` (count toward the focused line). Other tiles stay full brightness. */
  suggestedTileGuide?: {
    bestIds: ReadonlySet<string>
    blankExchangeIds?: ReadonlySet<string>
  } | null
  /** Tiles that were previously highlighted but became dead for the focused suggestion. */
  suggestedDeadTileGuide?: {
    deadIds: ReadonlySet<string>
    skullIds: ReadonlySet<string>
  } | null
  /** When true, tiles show a discard-hover indicator on hover. */
  discardMode?: boolean
  /** Total visible slots in the rack; empty slots fill the remainder. */
  slotCount?: number
  /** Ids of tiles currently staged to join a call meld — shown with an amber ring. */
  stagedForMeldIds?: ReadonlySet<string>
  /** When false, skip draw / Charleston / Mah Jongg fly-in. Default true. */
  animationsEnabled?: boolean
  /** Joker swap hint: ids of hand tiles to dock-bounce because they can redeem an exposed joker. */
  jokerSwapHintBounceTileIds?: ReadonlySet<string> | null
  /**
   * Bumped when your discard phase starts again so the dock-bounce can replay on the same tiles.
   * Default 0.
   */
  jokerSwapHintBounceEpoch?: number
  /**
   * When set, render tiles in this order (must match parent `SortableContext` `items`).
   * Used during Charleston when a pass tile id is preview-inserted into the hand list.
   */
  sortableOrder?: string[]
  /** Tile instance for the pass-tile id in `sortableOrder` that is not yet in `tiles`. */
  charlestonPassPhantomTile?: TileInstance | null
  /** Preview insertion point for a cross-zone tile without registering that tile as a hand sortable. */
  externalInsertPreviewIndex?: number | null
  /**
   * Id of a hand tile currently lifted onto a Charleston pass slot. While set, tiles to its right
   * slide one column left so the rack previews the removed/compacted state (no snap-back to home).
   */
  passStageTileId?: string | null
}

/**
 * Shift neighbours right of a preview insertion. Appending at the end shifts nothing —
 * the returning tile lands in the empty slot already shown to the right, so the last
 * occupied tile must stay put (no phantom slide).
 */
function externalShiftForInsertPreview(
  tileIndex: number,
  previewIndex: number,
  occupiedTileCount: number,
): boolean {
  if (previewIndex >= occupiedTileCount) {
    return false
  }
  return tileIndex >= previewIndex
}

/** Must sit inside `DndContext` + `SortableContext`. */
export const SortableHand = memo(
  function SortableHand({
  tiles,
  selectedTileId,
  onTileActivate,
  highlightedTileId,
  charlestonGlowTileIds,
  handTileFlyIn = null,
  handJokerSwapFlyInFromBelowId = null,
  suggestedTileGuide,
  suggestedDeadTileGuide = null,
  discardMode = false,
  slotCount = 14,
  stagedForMeldIds,
  animationsEnabled = true,
  jokerSwapHintBounceTileIds = null,
  jokerSwapHintBounceEpoch = 0,
  sortableOrder,
  charlestonPassPhantomTile = null,
  externalInsertPreviewIndex = null,
  passStageTileId = null,
}: Props) {
  const renderIds = sortableOrder ?? tiles.map((t) => t.id)
  const passStageIndex = passStageTileId != null ? renderIds.indexOf(passStageTileId) : -1
  const deferHandFlyMeasure =
    handTileFlyIn != null && handTileFlyIn.ids.length > 1
  const handFlyInVisualWaveIndexById = useMemo(() => {
    if (!handTileFlyIn?.staggerWaveDelayMs) return null
    const idSet = new Set(handTileFlyIn.ids)
    const m = new Map<string, number>()
    let wave = 0
    for (const rid of renderIds) {
      if (idSet.has(rid)) m.set(rid, wave++)
    }
    return m
  }, [handTileFlyIn, renderIds])
  const g = suggestedTileGuide
  const deadGuide = suggestedDeadTileGuide
  const externalPreviewActive = externalInsertPreviewIndex != null
  const { active: dndActive } = useDndContext()

  /**
   * Post-removal slide animation. The hand row is a CSS Grid (`repeat(14, 1fr)`),
   * so animating the *width* of a placeholder slot does nothing — neighbour tiles
   * just snap into the smaller layout. Instead, when a tile is removed (tap-to-pass,
   * tap-to-discard, drag-drop into pass/discard), we briefly translate every tile to
   * the right of the removed index by one column to its old position and let it
   * transition back to `translateX(0)`. Same easing/duration as in-rack rearrange.
   */
  const prevRenderIdsRef = useRef<string[]>(renderIds)
  const removalVersionRef = useRef(0)
  const [removalShift, setRemovalShift] = useState<{
    fromIndex: number
    applied: boolean
    version: number
  } | null>(null)
  // Remember the id of a tile that was previewed as compacted (lifted onto a pass slot). When it is
  // actually removed on drop, the neighbours are already in their compacted positions, so the
  // standard post-removal slide must be skipped (else they jump a column right and re-slide).
  const lastPassStageIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (passStageTileId != null) lastPassStageIdRef.current = passStageTileId
  }, [passStageTileId])

  useLayoutEffect(() => {
    const prev = prevRenderIdsRef.current
    prevRenderIdsRef.current = renderIds
    if (!animationsEnabled) return
    if (externalPreviewActive) return
    if (prev.length === renderIds.length + 1) {
      const removedIndex = prev.findIndex((id) => !renderIds.includes(id))
      const removedId = prev.find((id) => !renderIds.includes(id)) ?? null
      if (removedId != null && removedId === lastPassStageIdRef.current) {
        lastPassStageIdRef.current = null
        setRemovalShift(null)
        return
      }
      if (removedIndex >= 0 && removedIndex < renderIds.length) {
        removalVersionRef.current += 1
        setRemovalShift({
          fromIndex: removedIndex,
          applied: false,
          version: removalVersionRef.current,
        })
      }
    } else if (prev.length !== renderIds.length) {
      // Length changed in some other way (e.g. multiple tiles added/removed) — drop the shift.
      setRemovalShift(null)
    }
  }, [renderIds, animationsEnabled, externalPreviewActive])

  // After the "pre" state is committed and painted, schedule the flip to "post" so the
  // browser can transition `transform: translateX(+col)` -> `translateX(0)`.
  useEffect(() => {
    if (!removalShift || removalShift.applied) return
    const v = removalShift.version
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setRemovalShift((s) =>
          s && s.version === v && !s.applied ? { ...s, applied: true } : s,
        )
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      if (raf2) cancelAnimationFrame(raf2)
    }
  }, [removalShift])

  // Clear the shift state once the slide animation has finished.
  useEffect(() => {
    if (!removalShift || !removalShift.applied) return
    const v = removalShift.version
    const t = window.setTimeout(() => {
      setRemovalShift((s) => (s && s.version === v ? null : s))
    }, 220)
    return () => window.clearTimeout(t)
  }, [removalShift])

  const emptyCount = Math.max(0, slotCount - renderIds.length)

  // Track the most-recently drawn tile so we can play a drop-in animation exactly once.
  const [justDrawnId, setJustDrawnId] = useState<string | null>(null)
  const prevHighlightedRef = useRef<string | null | undefined>(undefined)

  // Set fly-in before paint so the tile never flashes at rest then animates (setTimeout(0) caused a double glitch).
  useLayoutEffect(() => {
    const prev = prevHighlightedRef.current
    prevHighlightedRef.current = highlightedTileId ?? null
    if (!animationsEnabled) {
      setJustDrawnId(null)
      return
    }
    if (highlightedTileId && highlightedTileId !== prev) {
      setJustDrawnId(highlightedTileId)
    }
  }, [highlightedTileId, animationsEnabled])

  useEffect(() => {
    if (!justDrawnId) return
    const timer = window.setTimeout(() => setJustDrawnId(null), 380)
    return () => window.clearTimeout(timer)
  }, [justDrawnId])

  return (
    <div
      className={['hand-row', dndActive ? 'hand-row--dnd-active' : ''].filter(Boolean).join(' ')}
      role="list"
      aria-label="Your hand"
    >
      {renderIds.map((id, index) => {
        const tile = tiles.find((t) => t.id === id)
        if (tile) {
          const isBest = !!g && g.bestIds.has(tile.id)
          const isBlankExchange = !!g?.blankExchangeIds?.has(tile.id)
          const isDeadSuggested = !!deadGuide?.deadIds.has(tile.id)
          const isDeadCause = !!deadGuide?.skullIds.has(tile.id)
          const isHandFlyIn = !!handTileFlyIn?.ids.includes(tile.id)
          const waveMs = handTileFlyIn?.staggerWaveDelayMs
          const waveVisualIdx =
            handFlyInVisualWaveIndexById != null && isHandFlyIn
              ? handFlyInVisualWaveIndexById.get(tile.id)
              : undefined
          const handFlyInWaveDelayMs =
            waveMs != null &&
            isHandFlyIn &&
            handTileFlyIn &&
            waveVisualIdx !== undefined
              ? waveVisualIdx * waveMs
              : undefined
          const shiftPhase: 'pre' | 'post' | null =
            removalShift && index >= removalShift.fromIndex
              ? removalShift.applied
                ? 'post'
                : 'pre'
              : null
          return (
            <SortableTile
              key={tile.id}
              tile={tile}
              selected={selectedTileId === tile.id}
              charlestonGlow={charlestonGlowTileIds?.has(tile.id) ?? false}
              discardMode={discardMode}
              suggestDim={isDeadSuggested || (!!g && !isBest && !isBlankExchange)}
              suggestBest={isBest}
              suggestBlankExchange={isBlankExchange}
              suggestDying={isDeadSuggested}
              suggestDeadCause={isDeadCause}
              stagedForMeld={stagedForMeldIds?.has(tile.id) ?? false}
              isJustDrawn={animationsEnabled && justDrawnId === tile.id}
              isHandFlyIn={isHandFlyIn}
              handTileFlyIn={handTileFlyIn}
              handFlyInWaveDelayMs={handFlyInWaveDelayMs}
              deferHandFlyMeasure={deferHandFlyMeasure}
              drawInFromRackBottom={handJokerSwapFlyInFromBelowId === tile.id}
              jokerSwapHintBounce={jokerSwapHintBounceTileIds?.has(tile.id) ?? false}
              jokerSwapHintBounceEpoch={jokerSwapHintBounceEpoch}
              externalShift={
                externalPreviewActive &&
                externalInsertPreviewIndex != null &&
                externalShiftForInsertPreview(index, externalInsertPreviewIndex, tiles.length)
              }
              externalPreviewActive={externalPreviewActive}
              shiftPhase={shiftPhase}
              passStageShiftLeft={passStageIndex >= 0 && index > passStageIndex}
              onSelect={onTileActivate}
            />
          )
        }
        if (charlestonPassPhantomTile && id === charlestonPassPhantomTile.id) {
          return (
            <CharlestonPassHandPhantomSortable
              key={id}
              tile={charlestonPassPhantomTile}
            />
          )
        }
        return null
      })}
      {Array.from({ length: emptyCount }, (_, i) => (
        <div key={`empty-${i}`} className="hand-slot--empty" aria-hidden />
      ))}
    </div>
  )
  },
  function sortableHandPropsAreEqual(prev: Props, next: Props) {
    return (
      sameTileIdOrder(prev.tiles, next.tiles) &&
      prev.selectedTileId === next.selectedTileId &&
      prev.onTileActivate === next.onTileActivate &&
      prev.highlightedTileId === next.highlightedTileId &&
      sameReadonlySet(prev.charlestonGlowTileIds, next.charlestonGlowTileIds) &&
      prev.handTileFlyIn === next.handTileFlyIn &&
      prev.handJokerSwapFlyInFromBelowId === next.handJokerSwapFlyInFromBelowId &&
      sameReadonlySet(prev.suggestedTileGuide?.bestIds, next.suggestedTileGuide?.bestIds) &&
      sameReadonlySet(
        prev.suggestedTileGuide?.blankExchangeIds,
        next.suggestedTileGuide?.blankExchangeIds,
      ) &&
      sameReadonlySet(prev.suggestedDeadTileGuide?.deadIds, next.suggestedDeadTileGuide?.deadIds) &&
      sameReadonlySet(prev.suggestedDeadTileGuide?.skullIds, next.suggestedDeadTileGuide?.skullIds) &&
      prev.discardMode === next.discardMode &&
      prev.slotCount === next.slotCount &&
      sameReadonlySet(prev.stagedForMeldIds, next.stagedForMeldIds) &&
      prev.animationsEnabled === next.animationsEnabled &&
      sameReadonlySet(prev.jokerSwapHintBounceTileIds, next.jokerSwapHintBounceTileIds) &&
      prev.jokerSwapHintBounceEpoch === next.jokerSwapHintBounceEpoch &&
      sameStringIdOrder(prev.sortableOrder, next.sortableOrder) &&
      prev.charlestonPassPhantomTile === next.charlestonPassPhantomTile &&
      prev.externalInsertPreviewIndex === next.externalInsertPreviewIndex &&
      prev.passStageTileId === next.passStageTileId
    )
  },
)
