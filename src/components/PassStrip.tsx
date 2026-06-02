import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { useDndContext, useDroppable } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { TileInstance } from '../mahjong/types'
import { PASS_BOX_ID } from '../mahjong/passTargets'
import { TileFace } from './TileFace'

const PASS_COMPACT_SHIFT_COL =
  'calc(var(--rack-tile-w) + var(--player-rack-face-gap, var(--rack-tile-gap)))'
const PASS_REORDER_EASING = 'cubic-bezier(0.2, 0, 0.2, 1)'
const PASS_REORDER_DURATION = '0.16s'

/** In the row-reverse pass strip, lower slot index = further right on screen. */
function passCompactShiftTransform(cols: number): string {
  return `translateX(calc(-${cols} * (${PASS_COMPACT_SHIFT_COL})))`
}

type PassCompactShift = {
  cols: number
  applied: boolean
  version: number
}

function SortablePassTile({
  tile,
  onTileClick,
  inlineTail,
  suggestBest,
  compactShift,
}: {
  tile: TileInstance
  onTileClick: () => void
  inlineTail: boolean
  suggestBest: boolean
  compactShift: PassCompactShift | null
}) {
  const { active } = useDndContext()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
    id: tile.id,
    animateLayoutChanges: () => false,
  })

  const sortableTransform = CSS.Transform.toString(transform)
  let resolvedTransform: string | undefined = sortableTransform ?? undefined
  let resolvedTransition: string

  if (compactShift && !isDragging && !active) {
    if (!compactShift.applied) {
      resolvedTransform = passCompactShiftTransform(compactShift.cols)
      resolvedTransition = 'none'
    } else {
      resolvedTransform = 'translateX(0)'
      resolvedTransition = `transform ${PASS_REORDER_DURATION} ${PASS_REORDER_EASING}`
    }
  } else if (isDragging) {
    resolvedTransform = sortableTransform ?? undefined
    resolvedTransition = 'none'
  } else if (active) {
    resolvedTransform = sortableTransform ?? undefined
    resolvedTransition = `transform ${PASS_REORDER_DURATION} ${PASS_REORDER_EASING}`
  } else {
    resolvedTransition = 'none'
  }

  // Match SortableHand: neighbors slide while a drag is active; DragOverlay shows the drag preview.
  const style: CSSProperties = {
    transform: resolvedTransform,
    transition: resolvedTransition,
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
  /** Fills the rightmost empty slot with the selected hand tile (if any). */
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
  /**
   * `inlineTail` only: when true, reserve a bottom row for `inlineHeaderFooter` so title + instruction
   * stay vertically centered as a block (footer does not affect that centering).
   */
  inlineHeaderFooterRow?: boolean
  /** `inlineTail` + `inlineHeaderFooterRow`: content for the bottom row (e.g. direction arrow). */
  inlineHeaderFooter?: ReactNode
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
  inlineHeaderFooterRow = false,
  inlineHeaderFooter = null,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: PASS_BOX_ID })
  const inlineTail = variant === 'inlineTail'
  const prevSlotsRef = useRef(slots)
  const compactShiftVersionRef = useRef(0)
  const [compactShifts, setCompactShifts] = useState<Map<string, PassCompactShift>>(new Map())

  useLayoutEffect(() => {
    const prev = prevSlotsRef.current
    prevSlotsRef.current = slots

    const prevIndexById = new Map<string, number>()
    prev.forEach((tile, index) => {
      if (tile) prevIndexById.set(tile.id, index)
    })

    const nextShifts = new Map<string, PassCompactShift>()
    slots.forEach((tile, newIndex) => {
      if (!tile) return
      const oldIndex = prevIndexById.get(tile.id)
      if (oldIndex != null && newIndex < oldIndex) {
        compactShiftVersionRef.current += 1
        nextShifts.set(tile.id, {
          cols: oldIndex - newIndex,
          applied: false,
          version: compactShiftVersionRef.current,
        })
      }
    })

    if (nextShifts.size > 0) {
      setCompactShifts(nextShifts)
    }
  }, [slots])

  useEffect(() => {
    if (!Array.from(compactShifts.values()).some((s) => !s.applied)) return
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setCompactShifts((cur) => {
          if (!Array.from(cur.values()).some((s) => !s.applied)) return cur
          const next = new Map(cur)
          for (const [id, shift] of next) {
            if (!shift.applied) next.set(id, { ...shift, applied: true })
          }
          return next
        })
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      if (raf2) cancelAnimationFrame(raf2)
    }
  }, [compactShifts])

  useEffect(() => {
    if (compactShifts.size === 0) return
    if (Array.from(compactShifts.values()).some((s) => !s.applied)) return
    const versions = new Set(Array.from(compactShifts.values(), (s) => s.version))
    const t = window.setTimeout(() => {
      setCompactShifts((cur) => {
        const next = new Map(cur)
        for (const [id, shift] of cur) {
          if (versions.has(shift.version) && shift.applied) next.delete(id)
        }
        return next.size === cur.size ? cur : next
      })
    }, 220)
    return () => window.clearTimeout(t)
  }, [compactShifts])

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
              compactShift={compactShifts.get(tile.id) ?? null}
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
    const showFooterRow =
      inlineHeaderFooterRow &&
      inlineHeaderFooter != null &&
      (typeof inlineHeaderFooter === 'string' ? inlineHeaderFooter.length > 0 : true)
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
        {showHeader ? (
          <div
            className={[
              'pass-strip-tail__copy',
              showFooterRow ? 'pass-strip-tail__copy--with-footer' : '',
            ]
              .filter(Boolean)
              .join(' ')}
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
            {showFooterRow ? (
              <div className="pass-strip-tail__copy-footer">{inlineHeaderFooter}</div>
            ) : null}
          </div>
        ) : null}
        <div className="pass-strip-tail__inner" onClick={tileRowClick}>
          <div className="pass-strip-tail__stack">{tileRow}</div>
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
      onClick={tileRowClick}
    >
      {tileRow}
    </div>
  )
}
