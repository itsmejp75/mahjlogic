import type { TileInstance } from './types'

export type PassSlots = [
  TileInstance | null,
  TileInstance | null,
  TileInstance | null,
]

export type PassSlotOrigins = [number | null, number | null, number | null]

/** Pack occupied pass slots into indices 0…n−1 (rightmost columns in the RTL pass strip). */
export function compactPassSlotsToRight(
  passSlots: PassSlots,
  passSlotOrigins: PassSlotOrigins = [null, null, null],
): { passSlots: PassSlots; passSlotOrigins: PassSlotOrigins } {
  const packedTiles: TileInstance[] = []
  const packedOrigins: (number | null)[] = []
  for (let i = 0; i < passSlots.length; i++) {
    const tile = passSlots[i]
    if (tile) {
      packedTiles.push(tile)
      packedOrigins.push(passSlotOrigins[i])
    }
  }
  const nextSlots: PassSlots = [null, null, null]
  const nextOrigins: PassSlotOrigins = [null, null, null]
  for (let i = 0; i < packedTiles.length; i++) {
    nextSlots[i] = packedTiles[i]!
    nextOrigins[i] = packedOrigins[i] ?? null
  }
  return { passSlots: nextSlots, passSlotOrigins: nextOrigins }
}

/** Single Charleston pass staging area (fits three rack tiles). */
export const PASS_BOX_ID = 'pass-box'

/** Leftmost empty pass slot in array order (pair with RTL pass-strip layout → fills col 14, then 13, then 12). */
export function firstEmptyPassSlotIndex(passSlots: PassSlots): number {
  return passSlots.findIndex((s) => s == null)
}

function movePassSlotTuple<T>(tuple: [T, T, T], from: number, to: number): [T, T, T] {
  const next = [...tuple]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item!)
  return next as [T, T, T]
}

/** Reorder tiles within the pass strip (insert/move, not pairwise swap). */
export function reorderPassSlots(
  passSlots: PassSlots,
  passSlotOrigins: PassSlotOrigins,
  from: number,
  to: number,
): { passSlots: PassSlots; passSlotOrigins: PassSlotOrigins } {
  if (from === to) {
    return { passSlots, passSlotOrigins }
  }
  return {
    passSlots: movePassSlotTuple(passSlots, from, to),
    passSlotOrigins: movePassSlotTuple(passSlotOrigins, from, to),
  }
}

/** `pass-box` → rightmost empty slot; or a tile id already in a pass slot (reorder). */
export function passDropIndex(overId: string, passSlots: PassSlots): number | null {
  if (overId === PASS_BOX_ID) {
    const idx = firstEmptyPassSlotIndex(passSlots)
    return idx >= 0 ? idx : null
  }
  const j = passSlots.findIndex((s) => s?.id === overId)
  return j >= 0 ? j : null
}
