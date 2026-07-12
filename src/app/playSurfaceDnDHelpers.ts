/** DnD collision / pointer helpers for the play surface. */
import {
  rectIntersection,
  type CollisionDetection,
} from '@dnd-kit/core'
import { parseIncomingBotDiscardDragId } from '../mahjong/jokerSwapIds'
import type { TileInstance } from '../mahjong/types'

export const EAST_EXPOSURE_MELD_SORT_ID_PREFIX = 'east-exposure-meld:'

export function eastExposureMeldSortId(exposureIdx: number): string {
  return `${EAST_EXPOSURE_MELD_SORT_ID_PREFIX}${exposureIdx}`
}

export function parseEastExposureMeldSortId(id: string): number | null {
  if (!id.startsWith(EAST_EXPOSURE_MELD_SORT_ID_PREFIX)) return null
  const raw = id.slice(EAST_EXPOSURE_MELD_SORT_ID_PREFIX.length)
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null
}

/** Rack drop boxes highlight and accept drops when the dragged tile overlaps them, not the pointer. */
export function collisionHitsForTileOverlappingZones(
  args: Parameters<CollisionDetection>[0],
  zoneIds: readonly string[],
): ReturnType<CollisionDetection> {
  const containers = args.droppableContainers.filter((c) => zoneIds.includes(String(c.id)))
  if (containers.length === 0) return []
  return rectIntersection({ ...args, droppableContainers: containers })
}

export function pointerOverCallInitiateTarget(pointer: { x: number; y: number }): boolean {
  const el = document.querySelector<HTMLElement>('.exposure-rack__call-initiate-target')
  if (!el) return false
  const rect = el.getBoundingClientRect()
  if (rect.width < 1 || rect.height < 1) return false
  return (
    pointer.x >= rect.left &&
    pointer.x <= rect.left + rect.width &&
    pointer.y >= rect.top &&
    pointer.y <= rect.top + rect.height
  )
}

/** True when the pointer is anywhere over the top discard tracker section (blank-exchange drop). */
export function pointerOverBlankExchangeTarget(pointer: { x: number; y: number }): boolean {
  const el = document.querySelector<HTMLElement>(
    '.blank-exchange-dropzone, .panel--discard-tracker--top',
  )
  if (!el) return false
  const rect = el.getBoundingClientRect()
  if (rect.width < 1 || rect.height < 1) return false
  return (
    pointer.x >= rect.left &&
    pointer.x <= rect.left + rect.width &&
    pointer.y >= rect.top &&
    pointer.y <= rect.top + rect.height
  )
}

export function pointerOverPassBoxTarget(pointer: { x: number; y: number }): boolean {
  const el = document.querySelector<HTMLElement>('.pass-strip-tail__inner, .pass-box')
  if (!el) return false
  const rect = el.getBoundingClientRect()
  if (rect.width < 1 || rect.height < 1) return false
  return (
    pointer.x >= rect.left &&
    pointer.x <= rect.left + rect.width &&
    pointer.y >= rect.top &&
    pointer.y <= rect.top + rect.height
  )
}

export function isActiveBotDiscardDrag(
  dragId: string,
  activeBotDiscard: TileInstance | null,
): boolean {
  const tileId = parseIncomingBotDiscardDragId(dragId)
  return tileId != null && tileId === activeBotDiscard?.id
}
