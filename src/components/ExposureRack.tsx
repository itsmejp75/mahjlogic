import type { CSSProperties, ReactNode } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { HandTileFlyInFrom } from '../mahjong/handTileFlyIn'
import type { TileInstance } from '../mahjong/types'
import { TileFace } from './TileFace'

function findLastNonJokerIndex(tiles: TileInstance[]): number {
  for (let i = tiles.length - 1; i >= 0; i--) {
    if (tiles[i]!.def.cat !== 'joker') return i
  }
  return -1
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
}

/** A staged call tile that participates in the shared SortableContext so hand tiles animate. */
function SortableStagedSlot({
  tile,
  gi,
  isFirst,
  onTileClick,
  stackSuitTiles,
}: {
  tile: TileInstance
  gi: number
  isFirst: boolean
  onTileClick: (id: string) => void
  stackSuitTiles: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tile.id,
  })
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        'exposure-rack__slot',
        gi > 0 && isFirst ? 'exposure-rack__slot--meld-start' : '',
        'exposure-rack__slot--staged-returnable',
        isDragging ? 'exposure-rack__slot--dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => onTileClick(tile.id)}
      {...listeners}
      {...attributes}
    >
      <TileFace def={tile.def} rackSuitStacked={stackSuitTiles} />
    </div>
  )
}

function DroppableMeldSlots({
  meld,
  gi,
  suggestBestIds,
  suppressDim,
  highlightCalledTile,
  stackSuitTiles,
}: {
  meld: MeldGroup
  gi: number
  suggestBestIds: ReadonlySet<string> | null
  suppressDim: boolean
  highlightCalledTile: boolean
  stackSuitTiles: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: meld.dropZoneId! })
  const ordered = orderMeldForRack(meld)
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
        const isBest = !!suggestBestIds && suggestBestIds.has(tile.id)
        const suggestDim = !suppressDim && !!suggestBestIds && !isBest
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
            ]
              .filter(Boolean)
              .join(' ')}
            role="listitem"
          >
            <TileFace def={tile.def} rackSuitStacked={stackSuitTiles} />
          </div>
        )
      })}
    </div>
  )
}

export type ExposureSuggestedTileGuide = {
  bestIds: ReadonlySet<string>
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
}: Props) {
  const totalExposed = melds.reduce((n, m) => n + m.tiles.length, 0)
  const tailReserved = reserveTrailingSlots + (reserveLastSlotForDiscard ? 1 : 0)
  const emptyCount = Math.max(0, slotCount - totalExposed - suffixSlotCount - tailReserved)

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
              suppressDim={suppressDim}
              highlightCalledTile={highlightCalledTile}
              stackSuitTiles={stackSuitTiles}
            />
          )
        }
        const ordered = orderMeldForRack(meld)
        if (meld.onTileClick) {
          const handler = meld.onTileClick
          return ordered.map((tile, ti) => {
            const isCalled = meld.calledTileId === tile.id
            if (isCalled) {
              // Called tile is locked — render as a static (non-draggable) slot
              return (
                <div
                  key={tile.id}
                  data-call-magnet-target=""
                  className={[
                    'exposure-rack__slot',
                    gi > 0 && ti === 0 ? 'exposure-rack__slot--meld-start' : '',
                    'exposure-rack__slot--called',
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
              />
            )
          })
        }
        return ordered.map((tile) => {
          const isCalled = highlightCalledTile && meld.calledTileId === tile.id
          const isJoker = tile.def.cat === 'joker'
          const g = suggestedTileGuide
          const isBest = !!g && g.bestIds.has(tile.id)
          const suggestDim = !suppressDim && !!g && !isBest
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
              ]
                .filter(Boolean)
                .join(' ')}
              role="listitem"
            >
              <TileFace def={tile.def} rackSuitStacked={stackSuitTiles} />
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
            ].join(' ')}
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
