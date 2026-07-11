import type { CSSProperties, ReactNode } from 'react'
import { Fragment, useLayoutEffect, useRef } from 'react'
import { useDndContext, useDroppable } from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { HandTileFlyInFrom } from '../mahjong/handTileFlyIn'
import { incomingBotDiscardDragId } from '../mahjong/jokerSwapIds'
import type { TileInstance } from '../mahjong/types'
import { TileFace } from './TileFace'

/** Returns the bounce class when the tile is one of the joker-swap hint targets. */
function jokerSwapHintBounceClass(
  bounceTileIds: ReadonlySet<string> | null | undefined,
  tileId: string,
): string {
  return bounceTileIds?.has(tileId) ? 'exposure-rack__slot--joker-swap-hint-bounce' : ''
}

function jokerSwapBounceSlotKey(
  tileId: string,
  bounceIds: ReadonlySet<string> | null | undefined,
  epoch: number,
): string {
  if (bounceIds?.has(tileId)) return `jsb-${epoch}-${tileId}`
  return tileId
}

function exposureTileSlotKey({
  tileId,
  flyIn,
  bounceIds,
  epoch,
}: {
  tileId: string
  flyIn: boolean
  bounceIds: ReadonlySet<string> | null | undefined
  epoch: number
}): string {
  return flyIn ? tileId : jokerSwapBounceSlotKey(tileId, bounceIds, epoch)
}

function findLastNonJokerIndex(tiles: TileInstance[]): number {
  for (let i = tiles.length - 1; i >= 0; i--) {
    if (tiles[i]!.def.cat !== 'joker') return i
  }
  return -1
}

function exposureFlyOriginForTile(
  tileId: string,
  flyFromRight: boolean,
  flyInFromBelowTileIds?: ReadonlySet<string> | null,
): 'above' | 'right' | 'below' {
  if (flyFromRight) return 'right'
  if (flyInFromBelowTileIds?.has(tileId)) return 'below'
  return 'above'
}

/** Same drop-in as wall draw (`above`), slide from discard tray (`right`), or wave up from below (`below`). */
function ExposureRackFlyInTile({
  tileId,
  animate,
  flyOrigin = 'above',
  animationDelayMs,
  children,
}: {
  tileId: string
  animate: boolean
  /** `'right'` — claimed discard from the discard-tray side; `'below'` — staged call tiles wave upward. */
  flyOrigin?: 'above' | 'right' | 'below'
  /** Opening-deal style stagger (`index * staggerMs`), applied as CSS `animation-delay`. */
  animationDelayMs?: number
  children: ReactNode
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const flyRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!animate || flyOrigin === 'right') return

    let raf1 = 0
    let raf2 = 0

    const apply = () => {
      const el = wrapRef.current
      const flyEl = flyRef.current
      if (!el || !flyEl) return
      // WebKit: first layout pass can read before the discard-tracker grid resolves.
      void el.offsetHeight
      const tileRect = el.getBoundingClientRect()
      const tileCx = tileRect.left + tileRect.width / 2
      const tileCy = tileRect.top + tileRect.height / 2
      const h = tileRect.height
      const ox = tileCx
      const oy = flyOrigin === 'below' ? tileCy + h * 1.05 : tileCy - h * 1.2
      flyEl.style.setProperty('--draw-anim-dx', `${ox - tileCx}px`)
      flyEl.style.setProperty('--draw-anim-dy', `${oy - tileCy}px`)
    }

    apply()

    const el = wrapRef.current
    if (el) {
      const r = el.getBoundingClientRect()
      if (r.width < 6 || r.height < 6) {
        raf1 = requestAnimationFrame(() => {
          raf2 = requestAnimationFrame(apply)
        })
      }
    }

    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [animate, tileId, flyOrigin])

  const innerClass =
    flyOrigin === 'right' && animate
      ? 'exposure-rack__tile-fly exposure-rack__incoming-discard-fly exposure-rack__incoming-discard-fly--from-right'
      : flyOrigin === 'below' && animate
        ? 'exposure-rack__tile-fly sortable-tile-wrap__fly sortable-tile-wrap--just-drawn exposure-rack__call-staging-fly-up'
      : animate && flyOrigin === 'above'
        ? 'exposure-rack__tile-fly sortable-tile-wrap__fly sortable-tile-wrap--just-drawn'
        : 'exposure-rack__tile-fly sortable-tile-wrap__fly'

  const delayStyle: CSSProperties | undefined =
    animate &&
    animationDelayMs != null &&
    animationDelayMs > 0 &&
    (flyOrigin === 'above' || flyOrigin === 'below')
      ? { animationDelay: `${animationDelayMs}ms` }
      : undefined

  return (
    <div
      ref={wrapRef}
      className={[
        'exposure-rack__tile-fly-wrap',
        flyOrigin === 'below' && animate ? 'exposure-rack__tile-fly-wrap--clip' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div ref={flyRef} className={innerClass} style={delayStyle}>
        {children}
      </div>
    </div>
  )
}

function orderMeldTilesForDisplay(tiles: TileInstance[]): TileInstance[] {
  if (tiles.length <= 1) return [...tiles]
  const fi = tiles.findIndex((t) => t.def.cat !== 'joker')
  if (fi < 0) return [...tiles]
  const li = findLastNonJokerIndex(tiles)
  if (li < 0) return [...tiles]
  if (fi === li) {
    const jokers = tiles.filter((t) => t.def.cat === 'joker')
    return [tiles[fi]!, ...jokers]
  }
  const between = tiles.slice(fi + 1, li).filter((t) => t.def.cat !== 'joker')
  const jokers = tiles.filter((t) => t.def.cat === 'joker')
  return [tiles[fi]!, ...between, ...jokers, tiles[li]!]
}

/** Draggable current bot discard — drag to first empty exposure cell to start Call (same as hand tile). */
function IncomingBotDiscardDraggable({
  tile,
  stackSuitTiles,
  incomingBotDiscardFlyFrom,
  suggestBest = false,
  suggestDim = false,
}: {
  tile: TileInstance
  stackSuitTiles: boolean
  incomingBotDiscardFlyFrom: HandTileFlyInFrom | null
  suggestBest?: boolean
  suggestDim?: boolean
}) {
  const { active } = useDndContext()
  const dragId = incomingBotDiscardDragId(tile.id)
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
    id: dragId,
    animateLayoutChanges: () => false,
    /** Avoid `aria-roledescription="draggable"` (dnd-kit default); iOS can surface it as stray selectable text near the viewport edge. */
    attributes: { roleDescription: 'tile' },
  })
  const dragStyle: CSSProperties = {
    ...(transform ? { transform: CSS.Transform.toString(transform) } : {}),
    transition: isDragging ? 'none' : active ? 'transform 0.14s cubic-bezier(0.2, 0, 0.2, 1)' : 'none',
    opacity: isDragging ? 0 : 1,
    touchAction: 'none',
  }
  return (
    <div
      ref={setNodeRef}
      style={dragStyle}
      className={[
        'east-discard-staging__tile',
        'exposure-rack__incoming-discard-drag',
        isDragging ? 'exposure-rack__incoming-discard-drag--dragging' : '',
        suggestBest ? 'east-discard-staging__tile--suggest-best' : '',
        suggestDim ? 'east-discard-staging__tile--suggest-dim' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...listeners}
      {...attributes}
    >
      <div
        className={[
          'exposure-rack__incoming-discard-fly',
          incomingBotDiscardFlyFrom
            ? `exposure-rack__incoming-discard-fly--from-${incomingBotDiscardFlyFrom}`
            : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <TileFace def={tile.def} elevated={isDragging} rackSuitStacked={stackSuitTiles} />
      </div>
    </div>
  )
}

/** Claimed discard is always shown in the first rack slot; remaining tiles follow usual meld order. */
function orderMeldForRack(meld: MeldGroup): TileInstance[] {
  if (!meld.calledTileId) return orderMeldTilesForDisplay(meld.tiles)
  const called = meld.tiles.find((t) => t.id === meld.calledTileId)
  const rest = meld.tiles.filter((t) => t.id !== meld.calledTileId)
  if (!called) return orderMeldTilesForDisplay(meld.tiles)
  return [called, ...orderMeldTilesForDisplay(rest)]
}

function SortableMeldGroup({
  id,
  children,
  slotSpan = 1,
}: {
  id: string
  children: ReactNode
  /** Proportional flex share on `.panel--bot-exposures` racks (tile count in this meld group). */
  slotSpan?: number
}) {
  const { active } = useDndContext()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
    id,
    animateLayoutChanges: () => false,
  })
  const sortableTransform =
    transform != null
      ? CSS.Transform.toString({ ...transform, scaleX: 1, scaleY: 1 })
      : undefined
  const style: CSSProperties = {
    ['--bot-meld-slot-span' as string]: Math.max(1, slotSpan),
    // Melds can have different widths; dnd-kit's full transform may include scale,
    // which makes the locked tiles blur/resize. Move the meld as one rigid block.
    transform: sortableTransform,
    transition:
      isDragging
        ? 'none'
        : active
          ? 'transform 0.16s cubic-bezier(0.2, 0, 0.2, 1)'
          : 'none',
    // DragOverlay carries the visible meld while dragging; hide the source copy like main-rack tiles
    // so variable-width meld swaps never show overlapping ghosts.
    opacity: isDragging ? 0 : undefined,
    zIndex: isDragging ? 8 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        'exposure-rack__meld-sortable',
        isDragging ? 'exposure-rack__meld-sortable--dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...listeners}
      {...attributes}
    >
      {children}
    </div>
  )
}

export type MeldGroup = {
  tiles: TileInstance[]
  calledTileId?: string
  /** When provided, the entire committed meld drags/reorders as one group. */
  sortableMeldId?: string
  /** When provided, renders this meld as a DnD drop zone with the given id. */
  dropZoneId?: string
  /**
   * When set, non-called tiles in this meld are clickable and draggable so the player can
   * return them to their hand (call-staging phase). Called with the tile's id.
   */
  onTileClick?: (tileId: string) => void
  /**
   * During east-discard before the player's next discard, tap the meld to re-enter call-staging
   * and add/remove hand tiles in the claim (the called tile stays fixed after staging resumes).
   */
  onAmendCallMeld?: () => void
}

function callMeldStripWidthStyle(tileCount: number): CSSProperties {
  const n = Math.max(1, tileCount)
  return {
    width: `calc(${n} * var(--rack-tile-w) + ${n - 1} * var(--player-rack-face-gap))`,
    minWidth: `calc(${n} * var(--rack-tile-w) + ${n - 1} * var(--player-rack-face-gap))`,
    maxWidth: `calc(${n} * var(--rack-tile-w) + ${n - 1} * var(--player-rack-face-gap))`,
  }
}

/** Call-staging only: green “+” well immediately after the staged meld (hidden after Done). */
function CallMeldAddSlot() {
  return (
    <div
      className="exposure-rack__slot exposure-rack__slot--empty exposure-rack__call-meld-add-slot"
      role="presentation"
      aria-hidden
    />
  )
}

type CallMeldStripTileGuideProps = {
  tile: TileInstance
  stackSuitTiles: boolean
  suggestBestIds: ReadonlySet<string> | null
  suggestedDeadTileIds: ReadonlySet<string> | null
  suggestedTileGuide: ExposureSuggestedTileGuide | null
  botJokerBorderMenuOn: boolean | undefined
  suppressDim: boolean
  highlightCalled: boolean
  ownedMeld?: boolean
  jokerSwapHintBounceTileIds?: ReadonlySet<string> | null
  amendable?: boolean
  flyIn?: boolean
  flyFromRight?: boolean
  flyInFromBelowTileIds?: ReadonlySet<string> | null
  callStagingWave?: {
    staggerDelayMs: number
    baseDelayMs: number
    waveIndex: number
  } | null
  elevated?: boolean
}

/**
 * Committed player exposures stay lit with the owned-meld vignette even when Logic is
 * focusing a hand — no coach dim / suggest-best ring on those locked tiles.
 */
function ownedMeldCoachClasses(
  ownedMeld: boolean,
  isBest: boolean,
  isDeadSuggested: boolean,
  suggestDim: boolean,
): { isBest: boolean; isDeadSuggested: boolean; suggestDim: boolean; ownedClass: string } {
  if (ownedMeld) {
    return {
      isBest: false,
      isDeadSuggested: false,
      suggestDim: false,
      ownedClass: 'exposure-rack__slot--owned-meld',
    }
  }
  return {
    isBest,
    isDeadSuggested,
    suggestDim,
    ownedClass: '',
  }
}

function callMeldStripTileClasses({
  tile,
  suggestBestIds,
  suggestedDeadTileIds,
  suggestedTileGuide,
  botJokerBorderMenuOn,
  suppressDim,
  highlightCalled,
  ownedMeld = false,
  jokerSwapHintBounceTileIds,
  amendable,
  dragging,
}: CallMeldStripTileGuideProps & { dragging?: boolean }): string {
  const isJoker = tile.def.cat === 'joker'
  const rawBest = slotIsSuggestBest(
    isJoker,
    tile.id,
    suggestBestIds,
    suggestedTileGuide,
    botJokerBorderMenuOn,
  )
  const rawDead = !!suggestedDeadTileIds?.has(tile.id) && !rawBest
  const rawDim = rawDead || (!suppressDim && !!suggestBestIds && !rawBest)
  const { isBest, isDeadSuggested, suggestDim, ownedClass } = ownedMeldCoachClasses(
    ownedMeld,
    rawBest,
    rawDead,
    rawDim,
  )
  return [
    'exposure-rack__call-meld-strip__tile',
    highlightCalled ? 'exposure-rack__call-meld-strip__tile--called' : '',
    highlightCalled ? 'exposure-rack__slot--called' : '',
    amendable ? 'exposure-rack__slot--call-amendable' : '',
    dragging ? 'exposure-rack__slot--dragging' : '',
    isJoker ? 'exposure-rack__slot--joker' : '',
    ownedClass,
    isBest ? 'exposure-rack__slot--suggest-best' : '',
    isDeadSuggested ? 'exposure-rack__slot--suggest-dying' : '',
    suggestDim ? 'exposure-rack__slot--suggest-dim' : '',
    jokerSwapHintBounceClass(jokerSwapHintBounceTileIds, tile.id),
  ]
    .filter(Boolean)
    .join(' ')
}

function CallMeldStripTileFace({
  tile,
  stackSuitTiles,
  flyIn,
  flyFromRight,
  flyInFromBelowTileIds,
  callStagingWave,
  elevated,
}: Pick<
  CallMeldStripTileGuideProps,
  'tile' | 'stackSuitTiles' | 'flyIn' | 'flyFromRight' | 'flyInFromBelowTileIds' | 'callStagingWave' | 'elevated'
>) {
  let waveDelayMs: number | null = null
  if (callStagingWave) {
    waveDelayMs =
      callStagingWave.baseDelayMs + callStagingWave.waveIndex * callStagingWave.staggerDelayMs
  }
  if (flyIn) {
    return (
      <ExposureRackFlyInTile
        tileId={tile.id}
        animate
        flyOrigin={exposureFlyOriginForTile(tile.id, !!flyFromRight, flyInFromBelowTileIds)}
      >
        <TileFace def={tile.def} elevated={elevated} rackSuitStacked={stackSuitTiles} />
      </ExposureRackFlyInTile>
    )
  }
  if (waveDelayMs != null) {
    return (
      <ExposureRackFlyInTile
        tileId={tile.id}
        animate
        flyOrigin="below"
        animationDelayMs={waveDelayMs}
      >
        <TileFace def={tile.def} elevated={elevated} rackSuitStacked={stackSuitTiles} />
      </ExposureRackFlyInTile>
    )
  }
  return <TileFace def={tile.def} elevated={elevated} rackSuitStacked={stackSuitTiles} />
}

/** A staged call tile that participates in the shared SortableContext so hand + exposure animate like Charleston/pass. */
function SortableStagedSlot({
  tile,
  gi,
  isFirst,
  onTileClick,
  stackSuitTiles,
  suggestBestIds,
  suggestedDeadTileIds,
  suggestedTileGuide,
  botJokerBorderMenuOn,
  suppressDim,
  jokerSwapHintBounceTileIds = null,
  callStagingWave = null,
  tileWrapClass = 'exposure-rack__slot',
  ownedMeld = false,
}: {
  tile: TileInstance
  gi: number
  isFirst: boolean
  onTileClick: (id: string) => void
  stackSuitTiles: boolean
  suggestBestIds: ReadonlySet<string> | null
  suggestedDeadTileIds: ReadonlySet<string> | null
  suggestedTileGuide: ExposureSuggestedTileGuide | null
  botJokerBorderMenuOn: boolean | undefined
  suppressDim: boolean
  jokerSwapHintBounceTileIds?: ReadonlySet<string> | null
  /** Rack left→right index among staged (non-called) tiles — wave delay uses opening-deal stagger. */
  callStagingWave?: {
    staggerDelayMs: number
    baseDelayMs: number
    waveIndex: number
  } | null
  tileWrapClass?: string
  ownedMeld?: boolean
}) {
  const { active } = useDndContext()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
    id: tile.id,
    animateLayoutChanges: () => false,
  })
  // Match SortableHand / PassStrip: neighbours slide while any sortable item is being dragged.
  const style: CSSProperties = {
    transform:
      isDragging || active ? CSS.Transform.toString(transform) ?? undefined : undefined,
    transition:
      isDragging
        ? 'none'
        : active
          ? 'transform 0.14s cubic-bezier(0.2, 0, 0.2, 1)'
          : 'none',
    opacity: isDragging ? 0 : undefined,
    zIndex: isDragging ? 2 : undefined,
  }
  const tileGuide: CallMeldStripTileGuideProps = {
    tile,
    stackSuitTiles,
    suggestBestIds,
    suggestedDeadTileIds,
    suggestedTileGuide,
    botJokerBorderMenuOn,
    suppressDim,
    highlightCalled: false,
    ownedMeld,
    jokerSwapHintBounceTileIds,
    callStagingWave,
    elevated: isDragging,
  }
  const isJoker = tile.def.cat === 'joker'
  const rawBest = slotIsSuggestBest(
    isJoker,
    tile.id,
    suggestBestIds,
    suggestedTileGuide,
    botJokerBorderMenuOn,
  )
  const rawDead = !!suggestedDeadTileIds?.has(tile.id) && !rawBest
  const rawDim = rawDead || (!suppressDim && !!suggestBestIds && !rawBest)
  const { isBest, isDeadSuggested, suggestDim, ownedClass } = ownedMeldCoachClasses(
    ownedMeld,
    rawBest,
    rawDead,
    rawDim,
  )
  const stripTile = tileWrapClass === 'exposure-rack__call-meld-strip__tile'
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={
        stripTile
          ? [
              tileWrapClass,
              'exposure-rack__slot--staged-returnable',
              callMeldStripTileClasses({ ...tileGuide, dragging: isDragging }),
            ]
              .filter(Boolean)
              .join(' ')
          : [
              tileWrapClass,
              gi > 0 && isFirst ? 'exposure-rack__slot--meld-start' : '',
              'exposure-rack__slot--staged-returnable',
              isDragging ? 'exposure-rack__slot--dragging' : '',
              isJoker ? 'exposure-rack__slot--joker' : '',
              isBest ? 'exposure-rack__slot--suggest-best' : '',
              isDeadSuggested ? 'exposure-rack__slot--suggest-dying' : '',
              suggestDim ? 'exposure-rack__slot--suggest-dim' : '',
              ownedClass,
              jokerSwapHintBounceClass(jokerSwapHintBounceTileIds, tile.id),
            ]
              .filter(Boolean)
              .join(' ')
      }
      onClick={() => onTileClick(tile.id)}
      {...listeners}
      {...attributes}
    >
      {stripTile ? (
        <CallMeldStripTileFace {...tileGuide} />
      ) : callStagingWave ? (
        <CallMeldStripTileFace {...tileGuide} />
      ) : (
        <TileFace def={tile.def} elevated={isDragging} rackSuitStacked={stackSuitTiles} />
      )}
    </div>
  )
}

function CallMeldStrip({
  meld,
  gi,
  locked,
  staging,
  suggestBestIds,
  suggestedDeadTileIds,
  suggestedTileGuide,
  botJokerBorderMenuOn,
  suppressDim,
  highlightCalledTile,
  stackSuitTiles,
  flyInTileIds,
  flyInFromRightTileIds = null,
  flyInFromBelowTileIds = null,
  jokerSwapHintBounceTileIds = null,
  jokerSwapHintBounceEpoch = 0,
  callStagingWaveFlyIn = null,
  dropZoneId,
  ownedMeldHighlight = false,
}: {
  meld: MeldGroup
  gi: number
  locked: boolean
  staging: boolean
  suggestBestIds: ReadonlySet<string> | null
  suggestedDeadTileIds: ReadonlySet<string> | null
  suggestedTileGuide: ExposureSuggestedTileGuide | null
  botJokerBorderMenuOn: boolean | undefined
  suppressDim: boolean
  highlightCalledTile: boolean
  stackSuitTiles: boolean
  flyInTileIds: ReadonlySet<string> | null | undefined
  flyInFromRightTileIds?: ReadonlySet<string> | null
  flyInFromBelowTileIds?: ReadonlySet<string> | null
  jokerSwapHintBounceTileIds?: ReadonlySet<string> | null
  jokerSwapHintBounceEpoch?: number
  callStagingWaveFlyIn?: {
    staggerDelayMs: number
    baseDelayMs: number
  } | null
  dropZoneId?: string
  /** Committed player melds: per-tile vignette instead of a group ring (always lit). */
  ownedMeldHighlight?: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dropZoneId ?? '', disabled: !dropZoneId })
  const ordered = orderMeldForRack(meld)
  const onAmend = meld.onAmendCallMeld
  const onTileClick = meld.onTileClick
  const ownedMeldTile = ownedMeldHighlight && locked && !staging
  let stagedWaveSlotIndex = 0

  const strip = (
    <div
      style={callMeldStripWidthStyle(ordered.length)}
      className={[
        'exposure-rack__call-meld-strip',
        gi > 0 ? 'exposure-rack__call-meld-strip--meld-start' : '',
        locked ? 'exposure-rack__call-meld-strip--locked' : '',
        staging ? 'exposure-rack__call-meld-strip--staging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="exposure-rack__call-meld-strip__inner">
        {ordered.map((tile) => {
          const isCalled = meld.calledTileId === tile.id
          const highlightCalled = highlightCalledTile && isCalled
          const waveTiming =
            staging && callStagingWaveFlyIn != null
              ? {
                  staggerDelayMs: callStagingWaveFlyIn.staggerDelayMs,
                  baseDelayMs: callStagingWaveFlyIn.baseDelayMs,
                  waveIndex: stagedWaveSlotIndex++,
                }
              : null
          const tileGuide: CallMeldStripTileGuideProps = {
            tile,
            stackSuitTiles,
            suggestBestIds,
            suggestedDeadTileIds,
            suggestedTileGuide,
            botJokerBorderMenuOn,
            suppressDim,
            highlightCalled,
            ownedMeld: ownedMeldTile,
            jokerSwapHintBounceTileIds,
            amendable: !!onAmend,
            flyIn: !!flyInTileIds?.has(tile.id),
            flyFromRight: !!flyInFromRightTileIds?.has(tile.id),
            flyInFromBelowTileIds,
            callStagingWave: waveTiming,
          }

          if (onTileClick && isCalled) {
            return (
              <div
                key={exposureTileSlotKey({
                  tileId: tile.id,
                  flyIn: !!tileGuide.flyIn,
                  bounceIds: jokerSwapHintBounceTileIds,
                  epoch: jokerSwapHintBounceEpoch,
                })}
                data-call-magnet-target=""
                className={callMeldStripTileClasses(tileGuide)}
              >
                <CallMeldStripTileFace {...tileGuide} />
              </div>
            )
          }

          if (onTileClick) {
            return (
              <SortableStagedSlot
                key={exposureTileSlotKey({
                  tileId: tile.id,
                  flyIn: !!tileGuide.flyIn,
                  bounceIds: jokerSwapHintBounceTileIds,
                  epoch: jokerSwapHintBounceEpoch,
                })}
                tile={tile}
                gi={gi}
                isFirst={false}
                onTileClick={onTileClick}
                stackSuitTiles={stackSuitTiles}
                suggestBestIds={suggestBestIds}
                suggestedDeadTileIds={suggestedDeadTileIds}
                suggestedTileGuide={suggestedTileGuide}
                botJokerBorderMenuOn={botJokerBorderMenuOn}
                suppressDim={suppressDim}
                jokerSwapHintBounceTileIds={jokerSwapHintBounceTileIds}
                callStagingWave={waveTiming}
                tileWrapClass="exposure-rack__call-meld-strip__tile"
              />
            )
          }

          return (
            <div
              key={exposureTileSlotKey({
                tileId: tile.id,
                flyIn: !!tileGuide.flyIn,
                bounceIds: jokerSwapHintBounceTileIds,
                epoch: jokerSwapHintBounceEpoch,
              })}
              data-tile-id={tile.id}
              className={callMeldStripTileClasses(tileGuide)}
              onClick={
                onAmend
                  ? (e) => {
                      e.stopPropagation()
                      onAmend()
                    }
                  : undefined
              }
            >
              <CallMeldStripTileFace {...tileGuide} />
            </div>
          )
        })}
      </div>
    </div>
  )

  if (!dropZoneId) return strip

  return (
    <div
      ref={setNodeRef}
      style={
        {
          ['--bot-meld-slot-span' as string]: Math.max(1, ordered.length),
        } as CSSProperties
      }
      className={[
        'exposure-rack__meld-drop',
        gi > 0 ? 'exposure-rack__slot--meld-start' : '',
        isOver ? 'exposure-rack__meld-drop--over' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {strip}
    </div>
  )
}

function DroppableMeldSlots({
  meld,
  gi,
  suggestBestIds,
  suggestedDeadTileIds,
  suggestedTileGuide,
  botJokerBorderMenuOn,
  suppressDim,
  highlightCalledTile,
  stackSuitTiles,
  flyInTileIds,
  flyInFromRightTileIds = null,
  flyInFromBelowTileIds = null,
  jokerSwapHintBounceTileIds = null,
  jokerSwapHintBounceEpoch = 0,
  ownedMeldHighlight = false,
}: {
  meld: MeldGroup
  gi: number
  suggestBestIds: ReadonlySet<string> | null
  suggestedDeadTileIds: ReadonlySet<string> | null
  suggestedTileGuide: ExposureSuggestedTileGuide | null
  botJokerBorderMenuOn: boolean | undefined
  suppressDim: boolean
  highlightCalledTile: boolean
  stackSuitTiles: boolean
  flyInTileIds: ReadonlySet<string> | null | undefined
  flyInFromRightTileIds?: ReadonlySet<string> | null
  flyInFromBelowTileIds?: ReadonlySet<string> | null
  jokerSwapHintBounceTileIds?: ReadonlySet<string> | null
  jokerSwapHintBounceEpoch?: number
  ownedMeldHighlight?: boolean
}) {
  if (meld.calledTileId) {
    return (
      <CallMeldStrip
        meld={meld}
        gi={gi}
        locked
        staging={false}
        suggestBestIds={suggestBestIds}
        suggestedDeadTileIds={suggestedDeadTileIds}
        suggestedTileGuide={suggestedTileGuide}
        botJokerBorderMenuOn={botJokerBorderMenuOn}
        suppressDim={suppressDim}
        highlightCalledTile={highlightCalledTile}
        stackSuitTiles={stackSuitTiles}
        flyInTileIds={flyInTileIds}
        flyInFromRightTileIds={flyInFromRightTileIds}
        flyInFromBelowTileIds={flyInFromBelowTileIds}
        jokerSwapHintBounceTileIds={jokerSwapHintBounceTileIds}
        jokerSwapHintBounceEpoch={jokerSwapHintBounceEpoch}
        dropZoneId={meld.dropZoneId}
        ownedMeldHighlight={ownedMeldHighlight}
      />
    )
  }

  const { setNodeRef, isOver } = useDroppable({
    id: meld.dropZoneId ?? `disabled-meld-drop-${gi}`,
    disabled: !meld.dropZoneId,
  })
  const ordered = orderMeldForRack(meld)
  const onAmend = meld.onAmendCallMeld
  return (
    <div
      ref={setNodeRef}
      style={
        {
          ['--bot-meld-slot-span' as string]: Math.max(1, ordered.length),
        } as CSSProperties
      }
      className={[
        'exposure-rack__meld-drop',
        gi > 0 ? 'exposure-rack__slot--meld-start' : '',
        isOver ? 'exposure-rack__meld-drop--over' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {ordered.map((tile) => {
        const isCalled = highlightCalledTile && meld.calledTileId === tile.id
        const isJoker = tile.def.cat === 'joker'
        const rawBest = slotIsSuggestBest(
          isJoker,
          tile.id,
          suggestBestIds,
          suggestedTileGuide,
          botJokerBorderMenuOn,
        )
        const rawDead = !!suggestedDeadTileIds?.has(tile.id) && !rawBest
        const rawDim = rawDead || (!suppressDim && !!suggestBestIds && !rawBest)
        const { isBest, isDeadSuggested, suggestDim, ownedClass } = ownedMeldCoachClasses(
          ownedMeldHighlight,
          rawBest,
          rawDead,
          rawDim,
        )
        const flyIn = !!flyInTileIds?.has(tile.id)
        const flyFromRight = !!flyInFromRightTileIds?.has(tile.id)
        return (
          <div
            key={exposureTileSlotKey({
              tileId: tile.id,
              flyIn,
              bounceIds: jokerSwapHintBounceTileIds,
              epoch: jokerSwapHintBounceEpoch,
            })}
            data-tile-id={tile.id}
            className={[
              'exposure-rack__slot',
              isCalled ? 'exposure-rack__slot--called' : '',
              isJoker ? 'exposure-rack__slot--joker' : '',
              ownedClass,
              isBest ? 'exposure-rack__slot--suggest-best' : '',
              isDeadSuggested ? 'exposure-rack__slot--suggest-dying' : '',
              suggestDim ? 'exposure-rack__slot--suggest-dim' : '',
              onAmend ? 'exposure-rack__slot--call-amendable' : '',
              jokerSwapHintBounceClass(jokerSwapHintBounceTileIds, tile.id),
            ]
              .filter(Boolean)
              .join(' ')}
            role="listitem"
            onClick={
              onAmend
                ? (e) => {
                    e.stopPropagation()
                    onAmend()
                  }
                : undefined
            }
          >
            {flyIn ? (
              <ExposureRackFlyInTile
                tileId={tile.id}
                animate
                flyOrigin={exposureFlyOriginForTile(tile.id, flyFromRight, flyInFromBelowTileIds)}
              >
                <TileFace def={tile.def} rackSuitStacked={stackSuitTiles} />
              </ExposureRackFlyInTile>
            ) : (
              <TileFace def={tile.def} rackSuitStacked={stackSuitTiles} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export type ExposureSuggestedTileGuide = {
  bestIds: ReadonlySet<string>
  blankExchangeIds?: ReadonlySet<string>
}

/**
 * White focus ring (suggest-best) per slot:
 * - Tile id in `bestIds` (focused suggested line for this rack).
 * - Bots: optional `botJokerBorderMenuOn === true` rings every joker regardless of `bestIds`.
 */
function slotIsSuggestBest(
  isJoker: boolean,
  tileId: string,
  bestIds: ReadonlySet<string> | null | undefined,
  _suggestedTileGuide: ExposureSuggestedTileGuide | null,
  botJokerBorderMenuOn: boolean | undefined,
): boolean {
  if (bestIds?.has(tileId)) return true
  if (!isJoker) return false
  return botJokerBorderMenuOn === true
}

type Props = {
  melds: MeldGroup[]
  slotCount?: number
  ariaLabel?: string
  /** Optional centered overlay watermark rendered behind tiles. */
  watermark?: ReactNode
  /**
   * `intro`: fade logo 0→100% over 3s (new game / Charleston).
   * `dimmed`: logo at 50% opacity (main play after Charleston).
   */
  watermarkPhase?: 'intro' | 'dimmed'
  /** Leave this many slots empty at the right for e.g. Charleston pass tiles (same row). */
  reserveTrailingSlots?: number
  /**
   * Non-East Charleston: 13-tile hands leave the pass strip one column left of East (cols 11–13
   * vs 12–14). Shifts the pass strip left by this many tile columns and pads empties on the right.
   */
  shiftPassStripLeftSlots?: number
  /**
   * When true, one extra rack column after empties is reserved for the active bot discard
   * (or left empty when none). Counts toward `slotCount` like `reserveTrailingSlots`.
   */
  reserveLastSlotForDiscard?: boolean
  /** Tile shown in that reserved last column (e.g. `activeBotDiscard`). */
  lastSlotTile?: TileInstance | null
  /**
   * When set with `lastSlotTile`, the tile plays a one-shot fly-in from that compass direction
   * (East UI: right / across / left — same as Charleston pass vectors).
   */
  incomingBotDiscardFlyFrom?: HandTileFlyInFrom | null
  /**
   * When true with `lastSlotTile`, the incoming bot discard is draggable to the call-initiate
   * drop (first empty exposure cell), same as dragging a hand tile to Call.
   */
  lastSlotDraggableForCallInit?: boolean
  /**
   * When set with `reserveLastSlotForDiscard`, replaces the default last-column UI
   * (incoming discard / empty). Takes the same grid cell as slot 14.
   */
  lastSlotReplace?: ReactNode
  /** Optional modifier class for the reserved last slot container. */
  lastSlotClassName?: string
  /** Accessibility label for custom last-slot replacement. */
  lastSlotAriaLabel?: string
  /**
   * Short instruction shown left of the incoming bot discard (e.g. `S >` for South's discard).
   * Rendered only when `lastSlotTile` is present (default discard column, not `lastSlotReplace`).
   */
  lastSlotLabel?: ReactNode
  /**
   * Content inserted directly after the meld tiles (before empty fill slots).
   * Use `suffixSlotCount` to tell the rack how many grid-columns this content occupies
   * so empty-slot arithmetic stays correct.
   */
  suffix?: ReactNode
  /**
   * When the rack has at least one empty fill slot, replace the first empty cell with this node
   * (e.g. training drag target for Call). Does not change `slotCount` / empty count math.
   */
  firstEmptyOverride?: ReactNode
  /** Number of slot-widths that `suffix` occupies (default 0). Subtracted from emptyCount. */
  suffixSlotCount?: number
  /**
   * Content inserted after the empty fill slots (i.e. pinned to the right end of the rack).
   * Pair with `reserveTrailingSlots` to tell the rack how many columns this occupies.
   */
  trailingSuffix?: ReactNode
  /** Extra classes on the rack row (e.g. `exposure-rack--charleston-pass` for fixed tile-height row). */
  className?: string
  /**
   * Tile ids that just appeared on this rack (e.g. new bot claim): one-shot drop-in from above,
   * same easing as a wall-draw tile. Omit for East / Charleston racks.
   */
  flyInTileIds?: ReadonlySet<string> | null
  /**
   * Subset of `flyInTileIds` that should slide in from the **right** (call discard entering the
   * exposure slot). Others use the default drop-in from above.
   */
  flyInFromRightTileIds?: ReadonlySet<string> | null
  /**
   * Subset of `flyInTileIds` that should rise in from **below** the rack (joker swap natural
   * replacing an exposed joker). Takes precedence over the default from-above path.
   */
  flyInFromBelowTileIds?: ReadonlySet<string> | null
  /** Same semantics as `SortableHand` — highlights tiles that count toward the focused suggested line. */
  suggestedTileGuide?: ExposureSuggestedTileGuide | null
  /** Exposure tile ids that just died for the focused suggested line (flash then stay dim). */
  suggestedDeadTileIds?: ReadonlySet<string> | null
  /**
   * When true, tiles not in `bestIds` are never dimmed (they just show as normal).
   * Use for committed exposure racks where tiles are locked in and should always appear lit.
   */
  suppressDim?: boolean
  /**
   * When true, the tile identified by `meld.calledTileId` receives the white inset ring.
   * Should only be true during call-staging so the highlight clears after Done is clicked.
   */
  highlightCalledTile?: boolean
  /**
   * When true, suit tiles in the rack use the same stacked layout as the main player hand
   * (rank centered + DOT/BAM/CRAK band below) instead of the compact single-line glyph.
   * Use for the player's own East exposure tray so its tile format matches the hand.
   */
  stackSuitTiles?: boolean
  /**
   * When set, this rack is a bot-exposure row: joker `suggest-best` rings follow the Menu setting
   * and optional suggested-hand focus. Omit for East. See `slotIsSuggestBest` above.
   */
  botJokerBorderMenuOn?: boolean
  /** Joker swap hint: ids of exposure tiles (jokers) to dock-bounce because they can be redeemed. */
  jokerSwapHintBounceTileIds?: ReadonlySet<string> | null
  /**
   * Bumped when returning to your discard phase so dock-bounce can replay on the same nodes.
   * Default 0.
   */
  jokerSwapHintBounceEpoch?: number
  /**
   * Staged call tiles (hand picks) fly in upward in a wave after the claimed discard — same stagger
   * feel as opening deal (`index * staggerDelayMs` after `baseDelayMs`). Indices follow rack order.
   */
  callStagingWaveFlyIn?: {
    staggerDelayMs: number
    baseDelayMs: number
  } | null
  /**
   * When true, fades out the exposure watermark (same as `exposure-rack__watermark--hidden`).
   * Use after opening post-game review so a full winning-hand strip is not overlaid on the logo.
   */
  hideWatermark?: boolean
  /**
   * Discard-tracker bot rows: wrap each flow meld in a single grid cell spanning its tile count
   * so layout stays stable when joker-swap droppables toggle on during the player’s turn.
   */
  gridMeldColumnSpans?: boolean
  /**
   * Player’s committed exposures: per-tile coach vignette always on (no coach dim / suggest-best
   * ring when a hand is focused); no meld group ring.
   */
  ownedMeldHighlight?: boolean
}

export function ExposureRack({
  melds,
  slotCount = 14,
  ariaLabel = 'Exposures',
  watermark,
  watermarkPhase,
  reserveTrailingSlots = 0,
  shiftPassStripLeftSlots = 0,
  reserveLastSlotForDiscard = false,
  lastSlotTile = null,
  incomingBotDiscardFlyFrom = null,
  lastSlotDraggableForCallInit = false,
  lastSlotReplace,
  lastSlotClassName,
  lastSlotAriaLabel,
  lastSlotLabel,
  suffix,
  suffixSlotCount = 0,
  trailingSuffix,
  className,
  suggestedTileGuide = null,
  suggestedDeadTileIds = null,
  suppressDim = false,
  highlightCalledTile = false,
  firstEmptyOverride = null,
  stackSuitTiles = false,
  flyInTileIds = null,
  flyInFromRightTileIds = null,
  flyInFromBelowTileIds = null,
  botJokerBorderMenuOn,
  jokerSwapHintBounceTileIds = null,
  jokerSwapHintBounceEpoch = 0,
  callStagingWaveFlyIn = null,
  hideWatermark = false,
  gridMeldColumnSpans = false,
  ownedMeldHighlight = false,
}: Props) {
  const totalExposed = melds.reduce((n, m) => n + m.tiles.length, 0)
  const passStripShift = Math.max(0, shiftPassStripLeftSlots)
  const tailReserved = reserveTrailingSlots + (reserveLastSlotForDiscard ? 1 : 0)
  const emptyCount = Math.max(
    0,
    slotCount - totalExposed - suffixSlotCount - tailReserved - passStripShift,
  )
  const callInitiateShown = firstEmptyOverride != null
  const emptySlotCount = callInitiateShown ? Math.max(0, emptyCount - 1) : emptyCount

  const gLast = suggestedTileGuide
  const lastSlotIsBest = lastSlotTile
    ? slotIsSuggestBest(
        lastSlotTile.def.cat === 'joker',
        lastSlotTile.id,
        gLast?.bestIds,
        gLast,
        undefined,
      )
    : false
  const lastSlotJoker = lastSlotTile?.def.cat === 'joker'
  const lastSlotBlankExchange =
    !!lastSlotTile && !!gLast?.blankExchangeIds?.has(lastSlotTile.id)
  const lastSlotIsDeadSuggested =
    !!lastSlotTile && !!suggestedDeadTileIds?.has(lastSlotTile.id) && !lastSlotIsBest
  const lastSlotSuggestDim =
    lastSlotIsDeadSuggested ||
    (!!gLast && !!lastSlotTile && !lastSlotIsBest && !lastSlotBlankExchange)
  const callMelds = melds.filter((meld) => meld.calledTileId)
  const flowMelds = melds.filter((meld) => !meld.calledTileId)
  // DOM order is call anchor first, then flow melds — ids must match for dnd-kit reorder previews.
  const sortableMeldIds = [...callMelds, ...flowMelds]
    .map((meld) => meld.sortableMeldId)
    .filter((id): id is string => id != null)
  const callMeldTileCount = callMelds.reduce((n, m) => n + m.tiles.length, 0)

  // Count every meld that actually shows tiles (including joker-swap droppables: they still cover the watermark).
  const filledMeldCount = melds.filter((m) => m.tiles.length > 0).length

  const renderCallMeldEntry = (meld: MeldGroup, gi: number) => {
    const ordered = orderMeldForRack(meld)
    const wrapMeldContent = (content: ReactNode, slotSpan = 1) =>
      meld.sortableMeldId ? (
        <SortableMeldGroup key={meld.sortableMeldId} id={meld.sortableMeldId} slotSpan={slotSpan}>
          {content}
        </SortableMeldGroup>
      ) : (
        <div key={meld.calledTileId ?? `call-meld-${gi}`}>{content}</div>
      )
    const callStripCommon = {
      meld,
      gi,
      suggestBestIds: suggestedTileGuide?.bestIds ?? null,
      suggestedDeadTileIds,
      suggestedTileGuide,
      botJokerBorderMenuOn,
      suppressDim,
      highlightCalledTile,
      stackSuitTiles,
      flyInTileIds,
      flyInFromRightTileIds,
      flyInFromBelowTileIds,
      jokerSwapHintBounceTileIds,
      jokerSwapHintBounceEpoch,
      callStagingWaveFlyIn,
      ownedMeldHighlight,
    }
    if (meld.dropZoneId) {
      return wrapMeldContent(
        <DroppableMeldSlots
          meld={meld}
          gi={gi}
          suggestBestIds={suggestedTileGuide?.bestIds ?? null}
          suggestedDeadTileIds={suggestedDeadTileIds}
          suggestedTileGuide={suggestedTileGuide}
          botJokerBorderMenuOn={botJokerBorderMenuOn}
          suppressDim={suppressDim}
          highlightCalledTile={highlightCalledTile}
          stackSuitTiles={stackSuitTiles}
          flyInTileIds={flyInTileIds}
          flyInFromRightTileIds={flyInFromRightTileIds}
          flyInFromBelowTileIds={flyInFromBelowTileIds}
          jokerSwapHintBounceTileIds={jokerSwapHintBounceTileIds}
          jokerSwapHintBounceEpoch={jokerSwapHintBounceEpoch}
          ownedMeldHighlight={ownedMeldHighlight}
        />,
        Math.max(1, ordered.length),
      )
    }
    if (meld.onTileClick) {
      const strip = wrapMeldContent(
        <CallMeldStrip {...callStripCommon} locked={false} staging />,
        Math.max(1, ordered.length),
      )
      if (ordered.length >= 6) return strip
      return (
        <Fragment key={meld.calledTileId ?? `call-staging-${gi}`}>
          {strip}
          <CallMeldAddSlot />
        </Fragment>
      )
    }
    return wrapMeldContent(
      <CallMeldStrip {...callStripCommon} locked staging={false} />,
      Math.max(1, ordered.length),
    )
  }

  const callMeldAnchor =
    callMeldTileCount > 0 ? (
      <div className="exposure-rack__call-meld-anchor" role="group" aria-label="Called melds">
        {callMelds.map((meld, gi) => renderCallMeldEntry(meld, gi))}
      </div>
    ) : null

  const flowMeldEntries = flowMelds.map((meld, gi) => {
    const meldSpanKey = meld.sortableMeldId ?? `flow-meld-${gi}-${meld.tiles[0]?.id ?? gi}`
    const wrapMeldContent = (content: ReactNode, slotSpan = 1) => {
      if (meld.sortableMeldId) {
        return (
          <SortableMeldGroup key={meld.sortableMeldId} id={meld.sortableMeldId} slotSpan={slotSpan}>
            {content}
          </SortableMeldGroup>
        )
      }
      if (gridMeldColumnSpans && slotSpan > 0) {
        return (
          <div
            key={meldSpanKey}
            className={[
              'exposure-rack__meld-grid-span',
              gi > 0 ? 'exposure-rack__slot--meld-start' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ ['--bot-meld-slot-span' as string]: slotSpan }}
          >
            {content}
          </div>
        )
      }
      if (Array.isArray(content)) {
        return (
          <div
            key={meldSpanKey}
            className={[
              'exposure-rack__meld-group',
              gi > 0 ? 'exposure-rack__slot--meld-start' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {content}
          </div>
        )
      }
      return content
    }
    if (meld.dropZoneId || gridMeldColumnSpans) {
      const dropSpan = Math.max(1, orderMeldForRack(meld).length)
      return wrapMeldContent(
        <DroppableMeldSlots
          meld={meld}
          gi={gi}
          suggestBestIds={suggestedTileGuide?.bestIds ?? null}
          suggestedDeadTileIds={suggestedDeadTileIds}
          suggestedTileGuide={suggestedTileGuide}
          botJokerBorderMenuOn={botJokerBorderMenuOn}
          suppressDim={suppressDim}
          highlightCalledTile={highlightCalledTile}
          stackSuitTiles={stackSuitTiles}
          flyInTileIds={flyInTileIds}
          flyInFromRightTileIds={flyInFromRightTileIds}
          flyInFromBelowTileIds={flyInFromBelowTileIds}
          jokerSwapHintBounceTileIds={jokerSwapHintBounceTileIds}
          jokerSwapHintBounceEpoch={jokerSwapHintBounceEpoch}
          ownedMeldHighlight={ownedMeldHighlight}
        />,
        dropSpan,
      )
    }
    const ordered = orderMeldForRack(meld)
    if (meld.onTileClick) {
      const handler = meld.onTileClick
      return ordered.map((tile, ti) => (
        <SortableStagedSlot
          key={jokerSwapBounceSlotKey(tile.id, jokerSwapHintBounceTileIds, jokerSwapHintBounceEpoch)}
          tile={tile}
          gi={gi}
          isFirst={ti === 0}
          onTileClick={handler}
          stackSuitTiles={stackSuitTiles}
          suggestBestIds={suggestedTileGuide?.bestIds ?? null}
          suggestedDeadTileIds={suggestedDeadTileIds}
          suggestedTileGuide={suggestedTileGuide}
          botJokerBorderMenuOn={botJokerBorderMenuOn}
          suppressDim={suppressDim}
          jokerSwapHintBounceTileIds={jokerSwapHintBounceTileIds}
        />
      ))
    }
    return wrapMeldContent(ordered.map((tile) => {
      const isCalled = highlightCalledTile && meld.calledTileId === tile.id
      const isJoker = tile.def.cat === 'joker'
      const g = suggestedTileGuide
      const rawBest = slotIsSuggestBest(isJoker, tile.id, g?.bestIds, g, botJokerBorderMenuOn)
      const rawDead = !!suggestedDeadTileIds?.has(tile.id) && !rawBest
      const rawDim = rawDead || (!suppressDim && !!g && !rawBest)
      const { isBest, isDeadSuggested, suggestDim, ownedClass } = ownedMeldCoachClasses(
        ownedMeldHighlight,
        rawBest,
        rawDead,
        rawDim,
      )
      const flyIn = !!flyInTileIds?.has(tile.id)
      const flyFromRight = !!flyInFromRightTileIds?.has(tile.id)
      return (
        <div
          key={exposureTileSlotKey({
            tileId: tile.id,
            flyIn,
            bounceIds: jokerSwapHintBounceTileIds,
            epoch: jokerSwapHintBounceEpoch,
          })}
          data-tile-id={tile.id}
          className={[
            'exposure-rack__slot',
            gi > 0 && ordered[0]?.id === tile.id ? 'exposure-rack__slot--meld-start' : '',
            isCalled ? 'exposure-rack__slot--called' : '',
            isJoker ? 'exposure-rack__slot--joker' : '',
            ownedClass,
            isBest ? 'exposure-rack__slot--suggest-best' : '',
            isDeadSuggested ? 'exposure-rack__slot--suggest-dying' : '',
            suggestDim ? 'exposure-rack__slot--suggest-dim' : '',
            jokerSwapHintBounceClass(jokerSwapHintBounceTileIds, tile.id),
          ]
            .filter(Boolean)
            .join(' ')}
          role="listitem"
        >
          {flyIn ? (
            <ExposureRackFlyInTile
              tileId={tile.id}
              animate
              flyOrigin={exposureFlyOriginForTile(tile.id, flyFromRight, flyInFromBelowTileIds)}
            >
              <TileFace def={tile.def} rackSuitStacked={stackSuitTiles} />
            </ExposureRackFlyInTile>
          ) : (
            <TileFace def={tile.def} rackSuitStacked={stackSuitTiles} />
          )}
        </div>
      )
    }), Math.max(1, ordered.length))
  })

  const meldRow =
    sortableMeldIds.length > 0 ? (
      <SortableContext items={sortableMeldIds} strategy={rectSortingStrategy}>
        {callMeldAnchor}
        {flowMeldEntries}
      </SortableContext>
    ) : (
      <>
        {callMeldAnchor}
        {flowMeldEntries}
      </>
    )

  return (
    <div
      className={[
        'exposure-rack',
        callMeldTileCount > 0 ? 'exposure-rack--has-call-melds' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        callMeldTileCount > 0
          ? ({
              ['--call-meld-inset-cols' as string]: callMeldTileCount,
            } as CSSProperties)
          : undefined
      }
      role="list"
      aria-label={ariaLabel}
    >
      {watermark ? (
        <div
          className={[
            'exposure-rack__watermark',
            watermarkPhase === 'intro' ? 'exposure-rack__watermark--fade-in' : '',
            watermarkPhase === 'dimmed' ? 'exposure-rack__watermark--dimmed' : '',
            filledMeldCount >= 2 || hideWatermark ? 'exposure-rack__watermark--hidden' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-hidden="true"
        >
          {watermark}
        </div>
      ) : null}
      {meldRow}
      {callMeldTileCount > 0 ? null : suffix}
      {callInitiateShown ? (
        <div key="call-initiate-override" role="presentation" className="exposure-rack__first-empty-override">
          {firstEmptyOverride}
        </div>
      ) : null}
      {Array.from({ length: emptySlotCount }, (_, i) => (
        <div
          key={`empty-${i}`}
          className="exposure-rack__slot exposure-rack__slot--empty"
          aria-hidden
        />
      ))}
      {trailingSuffix}
      {Array.from({ length: passStripShift }, (_, i) => (
        <div
          key={`pass-strip-shift-pad-${i}`}
          className="exposure-rack__slot exposure-rack__slot--empty"
          aria-hidden
        />
      ))}
      {reserveLastSlotForDiscard ? (
        lastSlotReplace != null ? (
          <div
            key="last-slot-replace"
            className={[
              'exposure-rack__slot',
              'exposure-rack__slot--east-discard-slot',
              lastSlotClassName ?? '',
            ]
              .filter(Boolean)
              .join(' ')}
            role="listitem"
            aria-label={lastSlotAriaLabel ?? 'Reserved slot'}
          >
            {lastSlotReplace}
          </div>
        ) : (
          <div
            key="last-slot-discard"
            className={[
              'exposure-rack__slot',
              lastSlotTile ? 'exposure-rack__slot--incoming-discard' : 'exposure-rack__slot--empty',
              lastSlotTile && lastSlotLabel != null
                ? 'exposure-rack__slot--incoming-discard-instructed'
                : '',
              lastSlotTile && gLast && lastSlotIsBest ? 'exposure-rack__slot--suggest-best' : '',
              lastSlotTile && gLast && lastSlotSuggestDim ? 'exposure-rack__slot--suggest-dim' : '',
              lastSlotTile && lastSlotJoker ? 'exposure-rack__slot--joker' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            role="listitem"
            aria-label={lastSlotTile ? 'Current bot discard' : undefined}
          >
            {lastSlotTile && lastSlotLabel != null ? (
              <p className="east-discard-staging__instruction" aria-hidden="true">
                {lastSlotLabel}
              </p>
            ) : null}
            {lastSlotTile ? (
              lastSlotDraggableForCallInit ? (
                <>
                  <div className="east-discard-staging east-discard-staging--inline" aria-hidden />
                  <IncomingBotDiscardDraggable
                    key={lastSlotTile.id}
                    tile={lastSlotTile}
                    stackSuitTiles={stackSuitTiles}
                    incomingBotDiscardFlyFrom={incomingBotDiscardFlyFrom}
                    suggestBest={lastSlotIsBest}
                    suggestDim={lastSlotSuggestDim}
                  />
                </>
              ) : (
                <div className="east-discard-staging east-discard-staging--inline">
                  <div
                    key={lastSlotTile.id}
                    className={[
                      'east-discard-staging__tile',
                      lastSlotIsBest ? 'east-discard-staging__tile--suggest-best' : '',
                      lastSlotSuggestDim ? 'east-discard-staging__tile--suggest-dim' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <div
                      className={[
                        'exposure-rack__incoming-discard-fly',
                        incomingBotDiscardFlyFrom
                          ? `exposure-rack__incoming-discard-fly--from-${incomingBotDiscardFlyFrom}`
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <TileFace def={lastSlotTile.def} rackSuitStacked={stackSuitTiles} />
                    </div>
                  </div>
                </div>
              )
            ) : null}
          </div>
        )
      ) : null}
    </div>
  )
}
