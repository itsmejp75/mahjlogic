import type { CSSProperties, RefObject } from 'react'
import { Fragment, useRef, useLayoutEffect, useEffect, useState } from 'react'
import { useDndContext } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { TileInstance } from '../mahjong/types'
import type { HandTileFlyIn } from '../mahjong/handTileFlyIn'
import { TileFace } from './TileFace'

function SortableTile({
  tile,
  selected,
  charlestonGlow,
  discardMode,
  suggestDim,
  suggestBest,
  stagedForMeld,
  isJustDrawn,
  isHandFlyIn,
  handTileFlyIn,
  handFlyInWaveDelayMs,
  drawAnimOriginRef,
  rackNewMark: rackNewMarkProp,
  onSelect,
  jokerSwapHintBounce = false,
  jokerSwapHintBounceEpoch = 0,
  externalShift = false,
  externalPreviewActive = false,
}: {
  tile: TileInstance
  selected: boolean
  charlestonGlow: boolean
  discardMode: boolean
  suggestDim: boolean
  suggestBest: boolean
  stagedForMeld: boolean
  isJustDrawn: boolean
  /** Charleston / wall-draw fly-in (viewport corner origin). */
  isHandFlyIn: boolean
  /** Present when `isHandFlyIn` (read `.from` only in that branch). */
  handTileFlyIn: HandTileFlyIn | null
  /** Per-tile `animation-delay` for opening-deal wave (ms); omit when no stagger. */
  handFlyInWaveDelayMs?: number
  /** If set, the draw animation starts from this viewport position instead of above the tile’s rack slot. */
  drawAnimOriginRef?: RefObject<{ x: number; y: number } | null>
  rackNewMark: boolean
  onSelect: (id: string) => void
  /** Joker swap hint: macOS-style dock bounce on naturals you can swap for an exposed joker. */
  jokerSwapHintBounce?: boolean
  /** Bumped when your discard phase starts again so the bounce animation can replay. */
  jokerSwapHintBounceEpoch?: number
  /** Cross-zone preview gap (e.g. Charleston pass tile hovering over the hand) without remounting sortables. */
  externalShift?: boolean
  /** Ignore dnd-kit transforms while a non-hand tile previews insertion into the rack. */
  externalPreviewActive?: boolean
}) {
  const { active } = useDndContext()
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useSortable({
      id: tile.id,
      // Never use sortable’s **post-drop** “layout” animation. It can stack with `transition`
      // and, with a separate FLIP, made neighbours jump. During drag, `transform` still updates.
      animateLayoutChanges: () => false,
    })

  const sortableTransform = CSS.Transform.toString(transform)
  const externalShiftTransform =
    'translateX(calc(var(--rack-tile-w) + var(--player-rack-face-gap, var(--rack-tile-gap))))'
  const style: CSSProperties = {
    // Cross-zone drags (Charleston/pass or discard staging -> hand) are not part of the hand's
    // normal order. If dnd-kit still reports context transforms, they can fight the preview
    // gap and pull the first hand tile toward the source slot. During that preview, use only
    // our single rightward gap transform.
    transform: externalPreviewActive
      ? externalShift
        ? externalShiftTransform
        : undefined
      : sortableTransform,
    // The dragged tile itself must track the pointer with no easing. Neighbours should always
    // quick-slide while a drag is active (including Charleston); after release, cleanup
    // transforms snap so the old post-drop left-jut/flip cannot play.
    transition:
      isDragging
        ? 'none'
        : active
          ? 'transform 0.14s cubic-bezier(0.2, 0, 0.2, 1)'
          : 'none',
    opacity: isDragging ? 0 : undefined,
    zIndex: isDragging ? 2 : undefined,
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
  const handFlyInIdsKey = handTileFlyIn?.ids.join('\u0001') ?? ''
  useLayoutEffect(() => {
    if (!runFlyLayout) return
    const el = wrapRef.current
    const flyEl = flyInRef.current
    if (!el || !flyEl) return
    const tileRect = el.getBoundingClientRect()
    const tileCx = tileRect.left + tileRect.width / 2
    const tileCy = tileRect.top + tileRect.height / 2

    let ox: number
    let oy: number
    // Charleston / wall receive: always wins over generic "just drawn" so we never fall through
    // to the rack-local wall-draw path when both flags are true.
    if (isHandFlyIn && handTileFlyIn) {
      // Short slide from the pass direction (neighbor exchange), not a full-screen fly.
      const w = tileRect.width
      const h = tileRect.height
      switch (handTileFlyIn.from) {
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
    } else if (isJustDrawn && drawAnimOriginRef?.current) {
      // Joker swap (or other) captured a pixel origin on the exposure rack.
      ox = drawAnimOriginRef.current.x
      oy = drawAnimOriginRef.current.y
      drawAnimOriginRef.current = null
    } else if (isJustDrawn) {
      // Wall draw (no seat fly-in): drop in from above this tile’s slot — same vertical offset as `across` receive.
      const h = tileRect.height
      ox = tileCx
      oy = tileCy - h * 1.2
    } else {
      return
    }
    flyEl.style.setProperty('--draw-anim-dx', `${ox - tileCx}px`)
    flyEl.style.setProperty('--draw-anim-dy', `${oy - tileCy}px`)
  }, [
    runFlyLayout,
    isJustDrawn,
    isHandFlyIn,
    handTileFlyIn?.from,
    handFlyInIdsKey,
    tile.id,
    drawAnimOriginRef,
  ])

  const flyStyle: CSSProperties | undefined =
    handFlyInWaveDelayMs != null ? { animationDelay: `${handFlyInWaveDelayMs}ms` } : undefined

  return (
    <div
      ref={setWrapRef}
      style={style}
      className={[
        'sortable-tile-wrap',
        selected ? 'sortable-tile-wrap--selected' : '',
        charlestonGlow ? 'sortable-tile-wrap--charleston-new' : '',
        discardMode ? 'sortable-tile-wrap--discard-mode' : '',
        suggestDim ? 'sortable-tile-wrap--suggest-dim' : '',
        suggestBest ? 'sortable-tile-wrap--suggest-best' : '',
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
          runFlyLayout ? 'sortable-tile-wrap__fly sortable-tile-wrap--just-drawn' : 'sortable-tile-wrap__fly',
          jokerSwapHintBounce && !runFlyLayout ? 'sortable-tile-wrap__fly--joker-swap-hint-bounce' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={flyStyle}
      >
        <TileFace def={tile.def} elevated={isDragging} rackSuitStacked rackNewMark={rackNewMarkProp} />
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
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition:
      isDragging
        ? 'none'
        : active
          ? 'transform 0.14s cubic-bezier(0.2, 0, 0.2, 1)'
          : 'none',
    opacity: 0,
    pointerEvents: 'none',
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="sortable-tile-wrap"
      {...attributes}
      aria-hidden
    >
      <div className="sortable-tile-wrap__fly">
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
  /** Last drawn tile id — keeps that tile full brightness with suggested-hand dimming until discard/pass. */
  highlightedTileId?: string | null
  /** Charleston: tiles just received on the last pass (thin white edge line until next pass). */
  charlestonGlowTileIds?: ReadonlySet<string>
  /** Fly-in from table direction (Charleston receive, wall draw, Mah Jongg on discard). */
  handTileFlyIn?: HandTileFlyIn | null
  /** Suggested-hand guide: white inset ring only on tiles in `bestIds` (count toward the focused line). Other tiles stay full brightness. */
  suggestedTileGuide?: {
    bestIds: ReadonlySet<string>
  } | null
  /** When true, tiles show a discard-hover indicator on hover. */
  discardMode?: boolean
  /** Total visible slots in the rack; empty slots fill the remainder. */
  slotCount?: number
  /** Ids of tiles currently staged to join a call meld — shown with an amber ring. */
  stagedForMeldIds?: ReadonlySet<string>
  /**
   * Bottom-center new-tile hint (Charleston / wall draw / joker swap) until the turn ends.
   * Omitted = no extra mark.
   */
  rackNewMarkTileIds?: ReadonlySet<string> | null
  /** When set, the next draw-in animation originates from this position (e.g. a joker swap source). */
  drawAnimOriginRef?: RefObject<{ x: number; y: number } | null>
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
}

/** Must sit inside `DndContext` + `SortableContext`. */
export function SortableHand({
  tiles,
  selectedTileId,
  onTileActivate,
  highlightedTileId,
  charlestonGlowTileIds,
  handTileFlyIn = null,
  suggestedTileGuide,
  discardMode = false,
  slotCount = 14,
  stagedForMeldIds,
  rackNewMarkTileIds = null,
  drawAnimOriginRef,
  animationsEnabled = true,
  jokerSwapHintBounceTileIds = null,
  jokerSwapHintBounceEpoch = 0,
  sortableOrder,
  charlestonPassPhantomTile = null,
  externalInsertPreviewIndex = null,
}: Props) {
  const renderIds = sortableOrder ?? tiles.map((t) => t.id)
  const g = suggestedTileGuide
  const externalPreviewActive = externalInsertPreviewIndex != null
  const prevRenderIdsForCollapseRef = useRef<string[]>(renderIds)
  const collapseGapRef = useRef<{ key: string; index: number } | null>(null)
  const collapseSeqRef = useRef(0)
  const [, forceCollapseRender] = useState(0)

  if (animationsEnabled && !externalPreviewActive) {
    const prev = prevRenderIdsForCollapseRef.current
    if (prev.length === renderIds.length + 1) {
      const removedIndex = prev.findIndex((id) => !renderIds.includes(id))
      if (removedIndex >= 0) {
        collapseSeqRef.current += 1
        collapseGapRef.current = {
          key: `collapse-${prev[removedIndex]}-${collapseSeqRef.current}`,
          index: removedIndex,
        }
      }
    } else if (prev.length !== renderIds.length) {
      collapseGapRef.current = null
    }
    prevRenderIdsForCollapseRef.current = renderIds
  } else {
    collapseGapRef.current = null
    prevRenderIdsForCollapseRef.current = renderIds
  }

  const collapseGap = collapseGapRef.current
  const emptyCount = Math.max(0, slotCount - renderIds.length - (collapseGap ? 1 : 0))

  // Track the most-recently drawn tile so we can play a drop-in animation exactly once.
  const [justDrawnId, setJustDrawnId] = useState<string | null>(null)
  const prevHighlightedRef = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    const prev = prevHighlightedRef.current
    prevHighlightedRef.current = highlightedTileId ?? null
    if (!animationsEnabled) return
    if (highlightedTileId && highlightedTileId !== prev) {
      setJustDrawnId(highlightedTileId)
      const timer = setTimeout(() => setJustDrawnId(null), 380)
      return () => clearTimeout(timer)
    }
  }, [highlightedTileId, animationsEnabled])

  const renderCollapsingGap = (index: number) => {
    if (!collapseGap || collapseGap.index !== index) return null
    return (
      <div
        key={collapseGap.key}
        className="hand-slot--collapse"
        aria-hidden
        onAnimationEnd={() => {
          if (collapseGapRef.current?.key !== collapseGap.key) return
          collapseGapRef.current = null
          forceCollapseRender((n) => n + 1)
        }}
      />
    )
  }

  return (
    <div className="hand-row" role="list" aria-label="Your hand">
      {renderIds.map((id, index) => {
        const tile = tiles.find((t) => t.id === id)
        if (tile) {
          const isBest = !!g && g.bestIds.has(tile.id)
          const isNewlyReceived =
            tile.id === highlightedTileId ||
            (charlestonGlowTileIds?.has(tile.id) ?? false)
          const isJoker = tile.def.cat === 'joker'
          const isHandFlyIn = !!handTileFlyIn?.ids.includes(tile.id)
          const waveMs = handTileFlyIn?.staggerWaveDelayMs
          const handFlyInWaveDelayMs =
            waveMs != null && isHandFlyIn && handTileFlyIn
              ? Math.max(0, handTileFlyIn.ids.indexOf(tile.id)) * waveMs
              : undefined
          return (
            <Fragment key={tile.id}>
              {renderCollapsingGap(index)}
              <SortableTile
                tile={tile}
                selected={selectedTileId === tile.id}
                charlestonGlow={charlestonGlowTileIds?.has(tile.id) ?? false}
                discardMode={discardMode}
                suggestDim={!!g && !isBest && !isNewlyReceived && !isJoker}
                suggestBest={isBest}
                stagedForMeld={stagedForMeldIds?.has(tile.id) ?? false}
                isJustDrawn={animationsEnabled && justDrawnId === tile.id}
                isHandFlyIn={isHandFlyIn}
                handTileFlyIn={handTileFlyIn}
                handFlyInWaveDelayMs={handFlyInWaveDelayMs}
                drawAnimOriginRef={justDrawnId === tile.id ? drawAnimOriginRef : undefined}
                rackNewMark={!!rackNewMarkTileIds?.has(tile.id)}
                jokerSwapHintBounce={jokerSwapHintBounceTileIds?.has(tile.id) ?? false}
                jokerSwapHintBounceEpoch={jokerSwapHintBounceEpoch}
                externalShift={externalPreviewActive && index >= externalInsertPreviewIndex}
                externalPreviewActive={externalPreviewActive}
                onSelect={onTileActivate}
              />
            </Fragment>
          )
        }
        if (charlestonPassPhantomTile && id === charlestonPassPhantomTile.id) {
          return (
            <Fragment key={id}>
              {renderCollapsingGap(index)}
              <CharlestonPassHandPhantomSortable tile={charlestonPassPhantomTile} />
            </Fragment>
          )
        }
        return renderCollapsingGap(index)
      })}
      {renderCollapsingGap(renderIds.length)}
      {Array.from({ length: emptyCount }, (_, i) => (
        <div key={`empty-${i}`} className="hand-slot--empty" aria-hidden />
      ))}
    </div>
  )
}
