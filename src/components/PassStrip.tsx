import { useDraggable, useDroppable } from '@dnd-kit/core'
import type { TileInstance } from '../mahjong/types'
import { PASS_BOX_ID } from '../mahjong/passTargets'
import { TileFace } from './TileFace'

function DraggablePassTile({
  tile,
  onTileClick,
  inlineTail,
  suggestBest,
}: {
  tile: TileInstance
  onTileClick: () => void
  inlineTail: boolean
  suggestBest: boolean
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: tile.id,
  })

  // DragOverlay handles the floating visual — do NOT translate the wrapper
  // so the slot stays fixed in the exposure rack row during the drag.
  return (
    <div
      ref={setNodeRef}
      className={[
        inlineTail ? 'exposure-rack__slot exposure-rack__slot--pass-tail' : '',
        'pass-strip__tile-wrap',
        isDragging ? 'pass-strip__tile-wrap--dragging' : '',
        suggestBest ? 'pass-strip__tile-wrap--suggest-best' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...listeners}
      {...attributes}
    >
      <button
        type="button"
        className="pass-strip__tile-btn"
        style={isDragging ? { opacity: 0 } : undefined}
        onClick={(e) => {
          e.stopPropagation()
          onTileClick()
        }}
        aria-label="Return this tile to your hand"
      >
        <TileFace def={tile.def} elevated={isDragging} rackSuitStacked />
      </button>
    </div>
  )
}

type PassStripFlyOutFrom = 'left' | 'right' | 'across'

type Props = {
  slots: [TileInstance | null, TileInstance | null, TileInstance | null]
  onPassTileClickReturn: (slotIndex: number) => void
  /** Fills the first empty slot with the selected hand tile (if any). */
  onPassBoxClick: () => void
  /** `boxed` = separate gold pass box; `inlineTail` = last three exposure-style slots in the rack row. */
  variant?: 'boxed' | 'inlineTail'
  /** Tile ids matching the focused suggested hand — highlight those tiles with a white inset ring. */
  suggestedBestIds?: ReadonlySet<string> | null
  /** Charleston: tiles fly out toward this direction while the pass is committing. */
  flyOutFrom?: PassStripFlyOutFrom | null
}

export function PassStrip({
  slots,
  onPassTileClickReturn,
  onPassBoxClick,
  variant = 'boxed',
  suggestedBestIds,
  flyOutFrom = null,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: PASS_BOX_ID })
  const inlineTail = variant === 'inlineTail'
  const flyOutClass =
    flyOutFrom == null
      ? ''
      : flyOutFrom === 'left'
        ? 'pass-strip-tail--fly-out pass-strip-tail--fly-out-left'
        : flyOutFrom === 'right'
          ? 'pass-strip-tail--fly-out pass-strip-tail--fly-out-right'
          : 'pass-strip-tail--fly-out pass-strip-tail--fly-out-across'

  const inner = (
    <div
      className={inlineTail ? 'pass-strip-tail__inner' : 'pass-box__inner'}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('.pass-strip__tile-btn, .pass-strip__tile-wrap')) {
          return
        }
        onPassBoxClick()
      }}
    >
      {slots.map((tile, index) =>
        tile ? (
          <DraggablePassTile
            key={tile.id}
            tile={tile}
            inlineTail={inlineTail}
            onTileClick={() => onPassTileClickReturn(index)}
            suggestBest={!!suggestedBestIds?.has(tile.id)}
          />
        ) : (
          <div
            key={`pass-empty-${index}`}
            className={
              inlineTail
                ? 'exposure-rack__slot exposure-rack__slot--empty exposure-rack__slot--pass-tail'
                : 'pass-box__cell'
            }
            aria-hidden
          />
        ),
      )}
    </div>
  )

  if (inlineTail) {
    return (
      <div
        ref={setNodeRef}
        className={['pass-strip-tail', isOver ? 'pass-strip-tail--over' : '', flyOutClass]
          .filter(Boolean)
          .join(' ')}
        role="group"
        aria-label="Charleston pass — last three exposure slots"
      >
        {inner}
      </div>
    )
  }

  const boxedFlyClass =
    flyOutFrom == null
      ? ''
      : flyOutFrom === 'left'
        ? 'pass-box--fly-out pass-box--fly-out-left'
        : flyOutFrom === 'right'
          ? 'pass-box--fly-out pass-box--fly-out-right'
          : 'pass-box--fly-out pass-box--fly-out-across'

  return (
    <div
      ref={setNodeRef}
      className={['pass-box', isOver ? 'pass-box--over' : '', boxedFlyClass].filter(Boolean).join(' ')}
      role="group"
      aria-label="Tiles to pass"
    >
      {inner}
    </div>
  )
}
