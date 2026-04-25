import type { CSSProperties, RefObject } from 'react'
import { useRef, useLayoutEffect, useEffect, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { useDndContext } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { TileInstance } from '../mahjong/types'
import type { HandTileFlyIn } from '../mahjong/handTileFlyIn'
import { TileFace } from './TileFace'

/**
 * After any non-drag layout change (discard, sort, staged call tile), tiles that
 * shifted left animate from their old position to their new one using a CSS
 * transform. Uses offsetLeft (transform-independent) so dnd-kit's own transforms
 * never corrupt the position cache.
 */
function useFlipAnimation(
  rowRef: RefObject<HTMLDivElement | null>,
  disabled: boolean,
) {
  const { active: dndActive } = useDndContext()
  const posCache = useRef<Map<string, number>>(new Map())
  const prevDndActiveId = useRef<string | null>(null)
  const pendingFrame = useRef<number | null>(null)

  useLayoutEffect(() => {
    const row = rowRef.current
    if (!row || disabled) return

    const prevActiveId = prevDndActiveId.current
    prevDndActiveId.current = dndActive ? String(dndActive.id) : null

    const isDragging = dndActive !== null
    // The render immediately after a drag completes — dnd-kit's own animateLayoutChanges
    // handles the post-drop reorder, so we skip to avoid a double animation.
    const wasDragging = prevActiveId !== null && !isDragging

    const tileEls = Array.from(row.querySelectorAll<HTMLElement>('[data-flip-id]'))

    // offsetLeft ignores CSS transforms, so the cache is never polluted by dnd-kit
    // transforms even when they're briefly applied during/after drag.
    const newPositions = new Map<string, number>()
    for (const el of tileEls) {
      const id = el.dataset.flipId
      if (id) newPositions.set(id, el.offsetLeft)
    }

    if (isDragging || wasDragging) {
      posCache.current = newPositions
      return
    }

    // Identify tiles whose layout position changed since the last render.
    const flipItems: { el: HTMLElement; dx: number }[] = []
    for (const el of tileEls) {
      const id = el.dataset.flipId
      if (!id) continue
      const prevX = posCache.current.get(id)
      const newX = newPositions.get(id)
      if (prevX !== undefined && newX !== undefined && Math.abs(prevX - newX) >= 1) {
        flipItems.push({ el, dx: prevX - newX })
      }
    }

    // Store new positions before we apply any transform so the next render's diff is clean.
    posCache.current = newPositions

    if (flipItems.length === 0) return

    // Abort any still-running FLIP from a previous render.
    if (pendingFrame.current !== null) {
      cancelAnimationFrame(pendingFrame.current)
      pendingFrame.current = null
      for (const el of tileEls) {
        el.style.transition = ''
        el.style.transform = ''
      }
    }

    // 1) Snap each moved tile to its previous visual position (no transition).
    for (const { el, dx } of flipItems) {
      el.style.transition = 'none'
      el.style.transform = `translateX(${dx}px)`
    }

    // 2) Force a synchronous reflow so the browser registers the snap before we add
    //    the transition. Without this the browser may batch both style changes and skip
    //    straight to the final position.
    void row.offsetHeight

    // 3) Slide each tile to its new position.
    pendingFrame.current = requestAnimationFrame(() => {
      for (const { el } of flipItems) {
        el.style.transition = 'transform 0.2s cubic-bezier(0.2, 0, 0.2, 1)'
        el.style.transform = ''
        el.addEventListener(
          'transitionend',
          () => {
            el.style.transition = ''
          },
          { once: true },
        )
      }
      pendingFrame.current = null
    })
  }) // No dep array — intentional: run after every render so position cache stays fresh.

  useEffect(
    () => () => {
      if (pendingFrame.current !== null) cancelAnimationFrame(pendingFrame.current)
    },
    [],
  )
}

function SortableTile({
  tile,
  selected,
  charlestonGlow,
  discardMode,
  suggestDim,
  suggestBest,
  stagedForMeld,
  suppressLayoutAnimation,
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
  suppressLayoutAnimation: boolean
  isJustDrawn: boolean
  /** Charleston / wall-draw fly-in (viewport corner origin). */
  isHandFlyIn: boolean
  /** Present when `isHandFlyIn` (read `.from` only in that branch). */
  handTileFlyIn: HandTileFlyIn | null
  /** If set, the draw animation starts from this viewport position instead of above the tile’s rack slot. */
  drawAnimOriginRef?: RefObject<{ x: number; y: number } | null>
  onSelect: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useSortable({
      id: tile.id,
      ...(suppressLayoutAnimation ? { animateLayoutChanges: () => false } : {}),
    })

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    // Active drag tile: 'none' so it tracks the cursor in real time with zero lag.
    // All other tiles (including during Charleston): leave undefined so the CSS class
    // rule applies its transition and neighbours slide smoothly out of the way.
    transition: isDragging ? 'none' : undefined,
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
      data-flip-id={tile.id}
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
  /** When false, skip draw / Charleston / Mah Jongg fly-in and hand FLIP slide. Default true. */
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
  suppressLayoutAnimation = false,
  stagedForMeldIds,
  drawAnimOriginRef,
  animationsEnabled = true,
}: Props) {
  const emptyCount = Math.max(0, slotCount - tiles.length)
  const g = suggestedTileGuide
  const rowRef = useRef<HTMLDivElement>(null)
  useFlipAnimation(rowRef, suppressLayoutAnimation || !animationsEnabled)

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
    <div className="hand-row" role="list" aria-label="Your hand" ref={rowRef}>
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
            suppressLayoutAnimation={suppressLayoutAnimation}
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
