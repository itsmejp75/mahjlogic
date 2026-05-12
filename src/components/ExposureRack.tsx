import type { CSSProperties, ReactNode } from 'react'
import { useLayoutEffect, useRef } from 'react'
import { useDndContext, useDraggable, useDroppable } from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { HandTileFlyInFrom } from '../mahjong/handTileFlyIn'
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

function findLastNonJokerIndex(tiles: TileInstance[]): number {
  for (let i = tiles.length - 1; i >= 0; i--) {
    if (tiles[i]!.def.cat !== 'joker') return i
  }
  return -1
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
    const el = wrapRef.current
    const flyEl = flyRef.current
    if (!el || !flyEl) return
    const tileRect = el.getBoundingClientRect()
    const tileCx = tileRect.left + tileRect.width / 2
    const tileCy = tileRect.top + tileRect.height / 2
    const h = tileRect.height
    const ox = tileCx
    const oy = flyOrigin === 'below' ? tileCy + h * 1.05 : tileCy - h * 1.2
    flyEl.style.setProperty('--draw-anim-dx', `${ox - tileCx}px`)
    flyEl.style.setProperty('--draw-anim-dy', `${oy - tileCy}px`)
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
}: {
  tile: TileInstance
  stackSuitTiles: boolean
  incomingBotDiscardFlyFrom: HandTileFlyInFrom | null
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: tile.id,
    /** Avoid `aria-roledescription="draggable"` (dnd-kit default); iOS can surface it as stray selectable text near the viewport edge. */
    attributes: { roleDescription: 'tile' },
  })
  const dragStyle: CSSProperties = {
    ...(transform ? { transform: CSS.Transform.toString(transform) } : {}),
    opacity: isDragging ? 0 : 1,
    touchAction: 'none',
  }
  return (
    <div
      ref={setNodeRef}
      style={dragStyle}
      className="exposure-rack__incoming-discard-drag"
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
  const translate = transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined
  const style: CSSProperties = {
    ['--bot-meld-slot-span' as string]: Math.max(1, slotSpan),
    // Melds can have different widths; dnd-kit's full transform may include scale,
    // which makes the locked tiles blur/resize. Move the meld as one rigid block.
    transform: translate,
    transition:
      isDragging
        ? 'none'
        : active
          ? 'transform 0.14s cubic-bezier(0.2, 0, 0.2, 1)'
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
}) {
  const { active } = useDndContext()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
    id: tile.id,
    animateLayoutChanges: () => false,
  })
  // Match SortableHand / PassStrip: neighbors slide while any sortable item is being dragged.
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition:
      isDragging
        ? 'none'
        : active
          ? 'transform 0.14s cubic-bezier(0.2, 0, 0.2, 1)'
          : 'none',
    opacity: isDragging ? 0 : undefined,
    zIndex: isDragging ? 2 : undefined,
  }
  const isJoker = tile.def.cat === 'joker'
  const isBest = slotIsSuggestBest(
    isJoker,
    tile.id,
    suggestBestIds,
    suggestedTileGuide,
    botJokerBorderMenuOn,
  )
  const isDeadSuggested = !!suggestedDeadTileIds?.has(tile.id)
  const suggestDim = isDeadSuggested || (!suppressDim && !!suggestBestIds && !isBest)
  let waveDelayMs: number | null = null
  if (callStagingWave) {
    waveDelayMs =
      callStagingWave.baseDelayMs + callStagingWave.waveIndex * callStagingWave.staggerDelayMs
  }
  const waveFace =
    waveDelayMs != null ? (
      <ExposureRackFlyInTile
        tileId={tile.id}
        animate
        flyOrigin="below"
        animationDelayMs={waveDelayMs}
      >
        <TileFace def={tile.def} elevated={isDragging} rackSuitStacked={stackSuitTiles} />
      </ExposureRackFlyInTile>
    ) : (
      <TileFace def={tile.def} elevated={isDragging} rackSuitStacked={stackSuitTiles} />
    )
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        'exposure-rack__slot',
        gi > 0 && isFirst ? 'exposure-rack__slot--meld-start' : '',
        'exposure-rack__slot--staged-returnable',
        isDragging ? 'exposure-rack__slot--dragging' : '',
        isJoker ? 'exposure-rack__slot--joker' : '',
        isBest ? 'exposure-rack__slot--suggest-best' : '',
        isDeadSuggested ? 'exposure-rack__slot--suggest-dying' : '',
        suggestDim ? 'exposure-rack__slot--suggest-dim' : '',
        jokerSwapHintBounceClass(jokerSwapHintBounceTileIds, tile.id),
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => onTileClick(tile.id)}
      {...listeners}
      {...attributes}
    >
      {waveFace}
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
  jokerSwapHintBounceTileIds = null,
  jokerSwapHintBounceEpoch = 0,
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
  jokerSwapHintBounceTileIds?: ReadonlySet<string> | null
  jokerSwapHintBounceEpoch?: number
}) {
  const { setNodeRef, isOver } = useDroppable({ id: meld.dropZoneId! })
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
        const isBest = slotIsSuggestBest(
          isJoker,
          tile.id,
          suggestBestIds,
          suggestedTileGuide,
          botJokerBorderMenuOn,
        )
        const isDeadSuggested = !!suggestedDeadTileIds?.has(tile.id)
        const suggestDim = isDeadSuggested || (!suppressDim && !!suggestBestIds && !isBest)
        const flyIn = !!flyInTileIds?.has(tile.id)
        const flyFromRight = !!flyInFromRightTileIds?.has(tile.id)
        return (
          <div
            key={jokerSwapBounceSlotKey(tile.id, jokerSwapHintBounceTileIds, jokerSwapHintBounceEpoch)}
            data-tile-id={tile.id}
            className={[
              'exposure-rack__slot',
              isCalled ? 'exposure-rack__slot--called' : '',
              isJoker ? 'exposure-rack__slot--joker' : '',
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
                flyOrigin={flyFromRight ? 'right' : 'above'}
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
  /** Leave this many slots empty at the right for e.g. Charleston pass tiles (same row). */
  reserveTrailingSlots?: number
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
}

export function ExposureRack({
  melds,
  slotCount = 14,
  ariaLabel = 'Exposures',
  watermark,
  reserveTrailingSlots = 0,
  reserveLastSlotForDiscard = false,
  lastSlotTile = null,
  incomingBotDiscardFlyFrom = null,
  lastSlotDraggableForCallInit = false,
  lastSlotReplace,
  lastSlotClassName,
  lastSlotAriaLabel,
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
  botJokerBorderMenuOn,
  jokerSwapHintBounceTileIds = null,
  jokerSwapHintBounceEpoch = 0,
  callStagingWaveFlyIn = null,
}: Props) {
  const totalExposed = melds.reduce((n, m) => n + m.tiles.length, 0)
  const tailReserved = reserveTrailingSlots + (reserveLastSlotForDiscard ? 1 : 0)
  const emptyCount = Math.max(0, slotCount - totalExposed - suffixSlotCount - tailReserved)

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
  // Bot’s incoming discard always stays lit in this slot — player needs full visibility while
  // deciding to call or ignore (matches the “Ignore / Call” affordance on the action row).
  const lastSlotSuggestDim = false
  const sortableMeldIds = melds
    .map((meld) => meld.sortableMeldId)
    .filter((id): id is string => id != null)

  const filledMeldCount = melds.filter((m) => m.tiles.length > 0 && !m.dropZoneId).length

  return (
    <div
      className={['exposure-rack', className].filter(Boolean).join(' ')}
      role="list"
      aria-label={ariaLabel}
    >
      {watermark ? (
        <div
          className={[
            'exposure-rack__watermark',
            filledMeldCount >= 2 ? 'exposure-rack__watermark--hidden' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-hidden="true"
        >
          {watermark}
        </div>
      ) : null}
      <SortableContext items={sortableMeldIds} strategy={rectSortingStrategy}>
      {melds.map((meld, gi) => {
        const wrapMeldContent = (content: ReactNode, slotSpan = 1) =>
          meld.sortableMeldId ? (
            <SortableMeldGroup key={meld.sortableMeldId} id={meld.sortableMeldId} slotSpan={slotSpan}>
              {content}
            </SortableMeldGroup>
          ) : (
            content
          )
        if (meld.dropZoneId) {
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
              jokerSwapHintBounceTileIds={jokerSwapHintBounceTileIds}
              jokerSwapHintBounceEpoch={jokerSwapHintBounceEpoch}
            />,
            dropSpan,
          )
        }
        const ordered = orderMeldForRack(meld)
        if (meld.onTileClick) {
          const handler = meld.onTileClick
          let stagedWaveSlotIndex = 0
          return ordered.map((tile, ti) => {
            const isCalled = meld.calledTileId === tile.id
            if (isCalled) {
              const g = suggestedTileGuide
              const isJoker = tile.def.cat === 'joker'
              const isBest = slotIsSuggestBest(isJoker, tile.id, g?.bestIds, g, botJokerBorderMenuOn)
              const isDeadSuggested = !!suggestedDeadTileIds?.has(tile.id)
              const suggestDim = isDeadSuggested || (!suppressDim && !!g && !isBest)
              const waveTimingCalled =
                callStagingWaveFlyIn != null
                  ? {
                      staggerDelayMs: callStagingWaveFlyIn.staggerDelayMs,
                      baseDelayMs: callStagingWaveFlyIn.baseDelayMs,
                      waveIndex: stagedWaveSlotIndex++,
                    }
                  : null
              let waveDelayMsCalled: number | null = null
              if (waveTimingCalled) {
                waveDelayMsCalled =
                  waveTimingCalled.baseDelayMs +
                  waveTimingCalled.waveIndex * waveTimingCalled.staggerDelayMs
              }
              const calledFace =
                waveDelayMsCalled != null ? (
                  <ExposureRackFlyInTile
                    tileId={tile.id}
                    animate
                    flyOrigin="below"
                    animationDelayMs={waveDelayMsCalled}
                  >
                    <TileFace def={tile.def} rackSuitStacked={stackSuitTiles} />
                  </ExposureRackFlyInTile>
                ) : (
                  <TileFace def={tile.def} rackSuitStacked={stackSuitTiles} />
                )
              // Called tile is locked — render as a static (non-draggable) slot
              return (
                <div
                  key={jokerSwapBounceSlotKey(tile.id, jokerSwapHintBounceTileIds, jokerSwapHintBounceEpoch)}
                  data-call-magnet-target=""
                  className={[
                    'exposure-rack__slot',
                    gi > 0 && ti === 0 ? 'exposure-rack__slot--meld-start' : '',
                    'exposure-rack__slot--called',
                    isJoker ? 'exposure-rack__slot--joker' : '',
                    isBest ? 'exposure-rack__slot--suggest-best' : '',
                    isDeadSuggested ? 'exposure-rack__slot--suggest-dying' : '',
                    suggestDim ? 'exposure-rack__slot--suggest-dim' : '',
                    jokerSwapHintBounceClass(jokerSwapHintBounceTileIds, tile.id),
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  role="listitem"
                >
                  {calledFace}
                </div>
              )
            }
            const waveTiming =
              callStagingWaveFlyIn != null
                ? {
                    staggerDelayMs: callStagingWaveFlyIn.staggerDelayMs,
                    baseDelayMs: callStagingWaveFlyIn.baseDelayMs,
                    waveIndex: stagedWaveSlotIndex++,
                  }
                : null
            return (
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
                callStagingWave={waveTiming}
              />
            )
          })
        }
        if (meld.onAmendCallMeld) {
          const goAmend = meld.onAmendCallMeld
          return wrapMeldContent(ordered.map((tile) => {
            const isCalled = highlightCalledTile && meld.calledTileId === tile.id
            const isJoker = tile.def.cat === 'joker'
            const g = suggestedTileGuide
            const isBest = slotIsSuggestBest(isJoker, tile.id, g?.bestIds, g, botJokerBorderMenuOn)
            const isDeadSuggested = !!suggestedDeadTileIds?.has(tile.id)
            const suggestDim = isDeadSuggested || (!suppressDim && !!g && !isBest)
            const flyIn = !!flyInTileIds?.has(tile.id)
            const flyFromRight = !!flyInFromRightTileIds?.has(tile.id)
            return (
              <div
                key={jokerSwapBounceSlotKey(tile.id, jokerSwapHintBounceTileIds, jokerSwapHintBounceEpoch)}
                data-tile-id={tile.id}
                className={[
                  'exposure-rack__slot',
                  'exposure-rack__slot--call-amendable',
                  gi > 0 && ordered[0]?.id === tile.id ? 'exposure-rack__slot--meld-start' : '',
                  isCalled ? 'exposure-rack__slot--called' : '',
                  isJoker ? 'exposure-rack__slot--joker' : '',
                  isBest ? 'exposure-rack__slot--suggest-best' : '',
                  isDeadSuggested ? 'exposure-rack__slot--suggest-dying' : '',
                  suggestDim ? 'exposure-rack__slot--suggest-dim' : '',
                  jokerSwapHintBounceClass(jokerSwapHintBounceTileIds, tile.id),
                ]
                  .filter(Boolean)
                  .join(' ')}
                role="listitem"
                onClick={(e) => {
                  e.stopPropagation()
                  goAmend()
                }}
              >
                {flyIn ? (
                  <ExposureRackFlyInTile
                    tileId={tile.id}
                    animate
                    flyOrigin={flyFromRight ? 'right' : 'above'}
                  >
                    <TileFace def={tile.def} rackSuitStacked={stackSuitTiles} />
                  </ExposureRackFlyInTile>
                ) : (
                  <TileFace def={tile.def} rackSuitStacked={stackSuitTiles} />
                )}
              </div>
            )
          }), Math.max(1, ordered.length))
        }
        return wrapMeldContent(ordered.map((tile) => {
          const isCalled = highlightCalledTile && meld.calledTileId === tile.id
          const isJoker = tile.def.cat === 'joker'
          const g = suggestedTileGuide
          const isBest = slotIsSuggestBest(isJoker, tile.id, g?.bestIds, g, botJokerBorderMenuOn)
          const isDeadSuggested = !!suggestedDeadTileIds?.has(tile.id)
          const suggestDim = isDeadSuggested || (!suppressDim && !!g && !isBest)
          const flyIn = !!flyInTileIds?.has(tile.id)
          const flyFromRight = !!flyInFromRightTileIds?.has(tile.id)
          return (
            <div
              key={jokerSwapBounceSlotKey(tile.id, jokerSwapHintBounceTileIds, jokerSwapHintBounceEpoch)}
              data-tile-id={tile.id}
              className={[
                'exposure-rack__slot',
                gi > 0 && ordered[0]?.id === tile.id ? 'exposure-rack__slot--meld-start' : '',
                isCalled ? 'exposure-rack__slot--called' : '',
                isJoker ? 'exposure-rack__slot--joker' : '',
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
                  flyOrigin={flyFromRight ? 'right' : 'above'}
                >
                  <TileFace def={tile.def} rackSuitStacked={stackSuitTiles} />
                </ExposureRackFlyInTile>
              ) : (
                <TileFace def={tile.def} rackSuitStacked={stackSuitTiles} />
              )}
            </div>
          )
        }), Math.max(1, ordered.length))
      })}
      </SortableContext>
      {suffix}
      {Array.from({ length: emptyCount }, (_, i) => (
        i === 0 && firstEmptyOverride ? (
          <div key="empty-0-override" role="presentation" className="exposure-rack__first-empty-override">
            {firstEmptyOverride}
          </div>
        ) : (
        <div
          key={`empty-${i}`}
          className="exposure-rack__slot exposure-rack__slot--empty"
          aria-hidden
        />
        )
      ))}
      {trailingSuffix}
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
              lastSlotTile && gLast && lastSlotIsBest ? 'exposure-rack__slot--suggest-best' : '',
              lastSlotTile && gLast && lastSlotSuggestDim ? 'exposure-rack__slot--suggest-dim' : '',
              lastSlotTile && lastSlotJoker ? 'exposure-rack__slot--joker' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            role="listitem"
            aria-label={lastSlotTile ? 'Current bot discard' : undefined}
          >
            {lastSlotTile ? (
              lastSlotDraggableForCallInit ? (
                <IncomingBotDiscardDraggable
                  key={lastSlotTile.id}
                  tile={lastSlotTile}
                  stackSuitTiles={stackSuitTiles}
                  incomingBotDiscardFlyFrom={incomingBotDiscardFlyFrom}
                />
              ) : (
                <div
                  key={lastSlotTile.id}
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
              )
            ) : null}
          </div>
        )
      ) : null}
    </div>
  )
}
