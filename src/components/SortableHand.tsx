import type { CSSProperties, RefObject } from 'react'
import { useRef, useLayoutEffect, useEffect, useState } from 'react'
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
  drawAnimOriginRef,
  onSelect,
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
  /** If set, the draw animation starts from this viewport position instead of above the tile’s rack slot. */
  drawAnimOriginRef?: RefObject<{ x: number; y: number } | null>
  onSelect: (id: string) => void
}) {
  const { active } = useDndContext()
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useSortable({
      id: tile.id,
      // Never use sortable’s **post-drop** “layout” animation. It can stack with `transition`
      // and, with a separate FLIP, made neighbours jump. During drag, `transform` still updates.
      animateLayoutChanges: () => false,
    })

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
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
        ref={flyInRef}
        className={runFlyLayout ? 'sortable-tile-wrap__fly sortable-tile-wrap--just-drawn' : 'sortable-tile-wrap__fly'}
      >
        <TileFace def={tile.def} elevated={isDragging} rackSuitStacked />
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
  /** Disables sortable layout/transform transitions (stops rack nudge during Charleston pass staging). */
  suppressLayoutAnimation?: boolean
  /** Ids of tiles currently staged to join a call meld — shown with an amber ring. */
  stagedForMeldIds?: ReadonlySet<string>
  /** When set, the next draw-in animation originates from this position (e.g. a joker swap source). */
  drawAnimOriginRef?: RefObject<{ x: number; y: number } | null>
  /** When false, skip draw / Charleston / Mah Jongg fly-in. Default true. */
  animationsEnabled?: boolean
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
  drawAnimOriginRef,
  animationsEnabled = true,
}: Props) {
  const emptyCount = Math.max(0, slotCount - tiles.length)
  const g = suggestedTileGuide

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

  return (
    <div className="hand-row" role="list" aria-label="Your hand">
      {tiles.map((tile) => {
        const isBest = !!g && g.bestIds.has(tile.id)
        // Newly received tiles (drawn or passed) stay lit regardless of bestIds.
        const isNewlyReceived =
          tile.id === highlightedTileId ||
          (charlestonGlowTileIds?.has(tile.id) ?? false)
        const isHandFlyIn = !!handTileFlyIn?.ids.includes(tile.id)
        return (
          <SortableTile
            key={tile.id}
            tile={tile}
            selected={selectedTileId === tile.id}
            charlestonGlow={charlestonGlowTileIds?.has(tile.id) ?? false}
            discardMode={discardMode}
            suggestDim={!!g && !isBest && !isNewlyReceived}
            suggestBest={isBest}
            stagedForMeld={stagedForMeldIds?.has(tile.id) ?? false}
            isJustDrawn={animationsEnabled && justDrawnId === tile.id}
            isHandFlyIn={isHandFlyIn}
            handTileFlyIn={handTileFlyIn}
            drawAnimOriginRef={justDrawnId === tile.id ? drawAnimOriginRef : undefined}
            onSelect={onTileActivate}
          />
        )
      })}
      {Array.from({ length: emptyCount }, (_, i) => (
        <div key={`empty-${i}`} className="hand-slot--empty" aria-hidden />
      ))}
    </div>
  )
}
