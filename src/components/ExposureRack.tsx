import type { CSSProperties, ReactNode } from 'react'
import { useLayoutEffect, useRef } from 'react'
import { useDndContext, useDraggable, useDroppable } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
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

function findLastNonJokerIndex(tiles: TileInstance[]): number {
  for (let i = tiles.length - 1; i >= 0; i--) {
    if (tiles[i]!.def.cat !== 'joker') return i
  }
  return -1
}

/** Same drop-in as wall draw / `across` receive: from above the slot (`tile-drop-in` in App.css). */
function ExposureRackFlyInTile({
  tileId,
  animate,
  children,
}: {
  tileId: string
  animate: boolean
  children: ReactNode
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const flyRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!animate) return
    const el = wrapRef.current
    const flyEl = flyRef.current
    if (!el || !flyEl) return
    const tileRect = el.getBoundingClientRect()
    const tileCx = tileRect.left + tileRect.width / 2
    const tileCy = tileRect.top + tileRect.height / 2
    const h = tileRect.height
    const ox = tileCx
    const oy = tileCy - h * 1.2
    flyEl.style.setProperty('--draw-anim-dx', `${ox - tileCx}px`)
    flyEl.style.setProperty('--draw-anim-dy', `${oy - tileCy}px`)
  }, [animate, tileId])

  return (
    <div ref={wrapRef} className="exposure-rack__tile-fly-wrap">
      <div
        ref={flyRef}
        className={
          animate
            ? 'exposure-rack__tile-fly sortable-tile-wrap__fly sortable-tile-wrap--just-drawn'
            : 'exposure-rack__tile-fly sortable-tile-wrap__fly'
        }
      >
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
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: tile.id })
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

export type MeldGroup = {
  tiles: TileInstance[]
  calledTileId?: string
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
  suggestedTileGuide,
  botJokerBorderMenuOn,
  suppressDim,
  jokerSwapHintBounceTileIds = null,
}: {
  tile: TileInstance
  gi: number
  isFirst: boolean
  onTileClick: (id: string) => void
  stackSuitTiles: boolean
  suggestBestIds: ReadonlySet<string> | null
  suggestedTileGuide: ExposureSuggestedTileGuide | null
  botJokerBorderMenuOn: boolean | undefined
  suppressDim: boolean
  jokerSwapHintBounceTileIds?: ReadonlySet<string> | null
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
  // Jokers stay lit when a suggested line is focused — they substitute for any tile so dimming
  // them would falsely imply they don't help. Same rule applies in every meld branch below.
  const suggestDim = !suppressDim && !!suggestBestIds && !isBest && !isJoker
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
        suggestDim ? 'exposure-rack__slot--suggest-dim' : '',
        jokerSwapHintBounceClass(jokerSwapHintBounceTileIds, tile.id),
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => onTileClick(tile.id)}
      {...listeners}
      {...attributes}
    >
      <TileFace def={tile.def} elevated={isDragging} rackSuitStacked={stackSuitTiles} />
    </div>
  )
}

function DroppableMeldSlots({
  meld,
  gi,
  suggestBestIds,
  suggestedTileGuide,
  botJokerBorderMenuOn,
  suppressDim,
  highlightCalledTile,
  stackSuitTiles,
  flyInTileIds,
  jokerSwapHintBounceTileIds = null,
}: {
  meld: MeldGroup
  gi: number
  suggestBestIds: ReadonlySet<string> | null
  suggestedTileGuide: ExposureSuggestedTileGuide | null
  botJokerBorderMenuOn: boolean | undefined
  suppressDim: boolean
  highlightCalledTile: boolean
  stackSuitTiles: boolean
  flyInTileIds: ReadonlySet<string> | null | undefined
  jokerSwapHintBounceTileIds?: ReadonlySet<string> | null
}) {
  const { setNodeRef, isOver } = useDroppable({ id: meld.dropZoneId! })
  const ordered = orderMeldForRack(meld)
  const onAmend = meld.onAmendCallMeld
  return (
    <div
      ref={setNodeRef}
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
        const suggestDim = !suppressDim && !!suggestBestIds && !isBest && !isJoker
        const flyIn = !!flyInTileIds?.has(tile.id)
        return (
          <div
            key={tile.id}
            data-tile-id={tile.id}
            className={[
              'exposure-rack__slot',
              isCalled ? 'exposure-rack__slot--called' : '',
              isJoker ? 'exposure-rack__slot--joker' : '',
              isBest ? 'exposure-rack__slot--suggest-best' : '',
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
              <ExposureRackFlyInTile tileId={tile.id} animate>
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
 * - Non-jokers: ring when the tile id is in `bestIds` (suggested hand focus for this rack).
 * - Jokers on the player's (East) rack: only when the id is in `bestIds` (same as before).
 * - Jokers on bot exposure racks: when `botJokerBorderMenuOn` is set — if true, always; if false, only
 *   while a suggested hand is focused for this panel (`suggestedTileGuide` non-null).
 *   Omitted for East: bot-specific behavior stays default.
 */
function slotIsSuggestBest(
  isJoker: boolean,
  tileId: string,
  bestIds: ReadonlySet<string> | null | undefined,
  suggestedTileGuide: ExposureSuggestedTileGuide | null,
  botJokerBorderMenuOn: boolean | undefined,
): boolean {
  if (!isJoker) {
    return !!bestIds?.has(tileId)
  }
  if (botJokerBorderMenuOn === undefined) {
    return !!bestIds?.has(tileId)
  }
  return botJokerBorderMenuOn || suggestedTileGuide != null
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
  /** Same semantics as `SortableHand` — highlights tiles that count toward the focused suggested line. */
  suggestedTileGuide?: ExposureSuggestedTileGuide | null
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
  suppressDim = false,
  highlightCalledTile = false,
  firstEmptyOverride = null,
  stackSuitTiles = false,
  flyInTileIds = null,
  botJokerBorderMenuOn,
  jokerSwapHintBounceTileIds = null,
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

  return (
    <div
      className={['exposure-rack', className].filter(Boolean).join(' ')}
      role="list"
      aria-label={ariaLabel}
    >
      {watermark ? (
        <div className="exposure-rack__watermark" aria-hidden="true">
          {watermark}
        </div>
      ) : null}
      {melds.map((meld, gi) => {
        if (meld.dropZoneId) {
          return (
            <DroppableMeldSlots
              key={meld.dropZoneId}
              meld={meld}
              gi={gi}
              suggestBestIds={suggestedTileGuide?.bestIds ?? null}
              suggestedTileGuide={suggestedTileGuide}
              botJokerBorderMenuOn={botJokerBorderMenuOn}
              suppressDim={suppressDim}
              highlightCalledTile={highlightCalledTile}
              stackSuitTiles={stackSuitTiles}
              flyInTileIds={flyInTileIds}
              jokerSwapHintBounceTileIds={jokerSwapHintBounceTileIds}
            />
          )
        }
        const ordered = orderMeldForRack(meld)
        if (meld.onTileClick) {
          const handler = meld.onTileClick
          return ordered.map((tile, ti) => {
            const isCalled = meld.calledTileId === tile.id
            if (isCalled) {
              const g = suggestedTileGuide
              const isJoker = tile.def.cat === 'joker'
              const isBest = slotIsSuggestBest(isJoker, tile.id, g?.bestIds, g, botJokerBorderMenuOn)
              const suggestDim = !suppressDim && !!g && !isBest && !isJoker
              // Called tile is locked — render as a static (non-draggable) slot
              return (
                <div
                  key={tile.id}
                  data-call-magnet-target=""
                  className={[
                    'exposure-rack__slot',
                    gi > 0 && ti === 0 ? 'exposure-rack__slot--meld-start' : '',
                    'exposure-rack__slot--called',
                    isJoker ? 'exposure-rack__slot--joker' : '',
                    isBest ? 'exposure-rack__slot--suggest-best' : '',
                    suggestDim ? 'exposure-rack__slot--suggest-dim' : '',
                    jokerSwapHintBounceClass(jokerSwapHintBounceTileIds, tile.id),
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  role="listitem"
                >
                  <TileFace def={tile.def} rackSuitStacked={stackSuitTiles} />
                </div>
              )
            }
            return (
              <SortableStagedSlot
                key={tile.id}
                tile={tile}
                gi={gi}
                isFirst={ti === 0}
                onTileClick={handler}
                stackSuitTiles={stackSuitTiles}
                suggestBestIds={suggestedTileGuide?.bestIds ?? null}
                suggestedTileGuide={suggestedTileGuide}
                botJokerBorderMenuOn={botJokerBorderMenuOn}
                suppressDim={suppressDim}
                jokerSwapHintBounceTileIds={jokerSwapHintBounceTileIds}
              />
            )
          })
        }
        if (meld.onAmendCallMeld) {
          const goAmend = meld.onAmendCallMeld
          return ordered.map((tile) => {
            const isCalled = highlightCalledTile && meld.calledTileId === tile.id
            const isJoker = tile.def.cat === 'joker'
            const g = suggestedTileGuide
            const isBest = slotIsSuggestBest(isJoker, tile.id, g?.bestIds, g, botJokerBorderMenuOn)
            const suggestDim = !suppressDim && !!g && !isBest && !isJoker
            const flyIn = !!flyInTileIds?.has(tile.id)
            return (
              <div
                key={tile.id}
                data-tile-id={tile.id}
                className={[
                  'exposure-rack__slot',
                  'exposure-rack__slot--call-amendable',
                  gi > 0 && ordered[0]?.id === tile.id ? 'exposure-rack__slot--meld-start' : '',
                  isCalled ? 'exposure-rack__slot--called' : '',
                  isJoker ? 'exposure-rack__slot--joker' : '',
                  isBest ? 'exposure-rack__slot--suggest-best' : '',
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
                  <ExposureRackFlyInTile tileId={tile.id} animate>
                    <TileFace def={tile.def} rackSuitStacked={stackSuitTiles} />
                  </ExposureRackFlyInTile>
                ) : (
                  <TileFace def={tile.def} rackSuitStacked={stackSuitTiles} />
                )}
              </div>
            )
          })
        }
        return ordered.map((tile) => {
          const isCalled = highlightCalledTile && meld.calledTileId === tile.id
          const isJoker = tile.def.cat === 'joker'
          const g = suggestedTileGuide
          const isBest = slotIsSuggestBest(isJoker, tile.id, g?.bestIds, g, botJokerBorderMenuOn)
          const suggestDim = !suppressDim && !!g && !isBest && !isJoker
          const flyIn = !!flyInTileIds?.has(tile.id)
          return (
            <div
              key={tile.id}
              data-tile-id={tile.id}
              className={[
                'exposure-rack__slot',
                gi > 0 && ordered[0]?.id === tile.id ? 'exposure-rack__slot--meld-start' : '',
                isCalled ? 'exposure-rack__slot--called' : '',
                isJoker ? 'exposure-rack__slot--joker' : '',
                isBest ? 'exposure-rack__slot--suggest-best' : '',
                suggestDim ? 'exposure-rack__slot--suggest-dim' : '',
                jokerSwapHintBounceClass(jokerSwapHintBounceTileIds, tile.id),
              ]
                .filter(Boolean)
                .join(' ')}
              role="listitem"
            >
              {flyIn ? (
                <ExposureRackFlyInTile tileId={tile.id} animate>
                  <TileFace def={tile.def} rackSuitStacked={stackSuitTiles} />
                </ExposureRackFlyInTile>
              ) : (
                <TileFace def={tile.def} rackSuitStacked={stackSuitTiles} />
              )}
            </div>
          )
        })
      })}
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
