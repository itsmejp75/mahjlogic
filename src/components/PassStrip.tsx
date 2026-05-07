import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import { useDndContext, useDroppable } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { TileInstance } from '../mahjong/types'
import { PASS_BOX_ID } from '../mahjong/passTargets'
import { TileFace } from './TileFace'

function SortablePassTile({
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
  const { active } = useDndContext()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
    id: tile.id,
    animateLayoutChanges: () => false,
  })

  // Match SortableHand: neighbors slide while a drag is active; DragOverlay shows the drag preview.
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

  return (
    <div
      ref={setNodeRef}
      style={style}
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

/** Charleston pass-strip exit direction before the exchange commits (`sendCharlestonPass`). */
export type PassStripFlyOutFrom =
  | 'left'
  | 'right'
  | 'across'
  /** Courtesy pass only: tiles lift together out of the top of the pass strip / box. */
  | 'courtesy-top'

type Props = {
  slots: [TileInstance | null, TileInstance | null, TileInstance | null]
  onPassTileClickReturn: (slotIndex: number) => void
  /** Fills the first empty slot with the selected hand tile (if any). */
  onPassBoxClick: () => void
  /** `boxed` = separate gold pass box; `inlineTail` = last three exposure-style slots in the rack row. */
  variant?: 'boxed' | 'inlineTail'
  /**
   * When set (suggested hand is focused), tiles in this set get the white inset ring. Pass-box
   * tiles are not dimmed — they stay full brightness; only `suggestBest` adds the ring.
   */
  suggestedBestIds?: ReadonlySet<string> | null
  /** Charleston: tiles fly out toward this direction while the pass is committing. */
  flyOutFrom?: PassStripFlyOutFrom | null
  /** While this pass tile is registered in the hand sortable list (drag preview), hide its pass-strip sortable. */
  hiddenSortableTileId?: string | null
  /** `inlineTail` only: round label inside the teal pass box (e.g. `1st CHARLESTON`). */
  inlineHeaderTitle?: string | null
  /** `inlineTail` only: instruction under the title, same box (string or custom layout). */
  inlineHeaderInstruction?: ReactNode
  /** Plain phrase for `aria-label` when instruction is not a simple string. */
  inlineHeaderInstructionAria?: string
}

export function PassStrip({
  slots,
  onPassTileClickReturn,
  onPassBoxClick,
  variant = 'boxed',
  suggestedBestIds,
  flyOutFrom = null,
  hiddenSortableTileId = null,
  inlineHeaderTitle = null,
  inlineHeaderInstruction,
  inlineHeaderInstructionAria,
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
          : flyOutFrom === 'courtesy-top'
            ? 'pass-strip-tail--fly-out pass-strip-tail--fly-out-courtesy-top'
            : 'pass-strip-tail--fly-out pass-strip-tail--fly-out-across'

  const tileRowClick = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.pass-strip__tile-btn, .pass-strip__tile-wrap')) {
      return
    }
    onPassBoxClick()
  }

  const tileRow = (
    <div
      className={inlineTail ? 'pass-strip-tail__tiles' : 'pass-box__inner'}
      onClick={tileRowClick}
    >
      {slots.map((tile, index) =>
        tile ? (
          hiddenSortableTileId != null && tile.id === hiddenSortableTileId ? (
            <div
              key={tile.id}
              className={
                inlineTail
                  ? 'exposure-rack__slot exposure-rack__slot--empty exposure-rack__slot--pass-tail'
                  : 'pass-box__cell'
              }
              aria-hidden
            />
          ) : (
            <SortablePassTile
              key={tile.id}
              tile={tile}
              inlineTail={inlineTail}
              onTileClick={() => onPassTileClickReturn(index)}
              suggestBest={!!suggestedBestIds?.has(tile.id)}
            />
          )
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
    const hasInstruction =
      inlineHeaderInstruction != null &&
      (typeof inlineHeaderInstruction === 'string'
        ? inlineHeaderInstruction.length > 0
        : true)
    const showHeader = Boolean(inlineHeaderTitle) || hasInstruction
    const passStripHasTiles = slots.some((t) => t != null)
    const instructionAria =
      typeof inlineHeaderInstruction === 'string'
        ? inlineHeaderInstruction
        : (inlineHeaderInstructionAria ?? '')
    const ariaParts = [
      inlineHeaderTitle,
      instructionAria,
      'Charleston pass, three tile slots',
    ].filter(Boolean) as string[]
    return (
      <div
        ref={setNodeRef}
        className={[
          'pass-strip-tail',
          passStripHasTiles ? 'pass-strip-tail--pass-slots-filled' : '',
          isOver ? 'pass-strip-tail--over' : '',
          flyOutClass,
        ]
          .filter(Boolean)
          .join(' ')}
        role="group"
        aria-label={ariaParts.join('. ')}
      >
        <div className="pass-strip-tail__inner">
          <div className="pass-strip-tail__stack">
            {tileRow}
            {showHeader ? (
              <div
                className="pass-strip-tail__header pass-strip-tail__header--overlay"
                aria-hidden
              >
                {inlineHeaderTitle ? (
                  <div className="pass-strip-tail__title">{inlineHeaderTitle}</div>
                ) : null}
                {hasInstruction ? (
                  typeof inlineHeaderInstruction === 'string' ? (
                    <p className="pass-strip-tail__instruction">{inlineHeaderInstruction}</p>
                  ) : (
                    inlineHeaderInstruction
                  )
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
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
          : flyOutFrom === 'courtesy-top'
            ? 'pass-box--fly-out pass-box--fly-out-courtesy-top'
            : 'pass-box--fly-out pass-box--fly-out-across'

  return (
    <div
      ref={setNodeRef}
      className={['pass-box', isOver ? 'pass-box--over' : '', boxedFlyClass].filter(Boolean).join(' ')}
      role="group"
      aria-label="Tiles to pass"
    >
      {tileRow}
    </div>
  )
}
