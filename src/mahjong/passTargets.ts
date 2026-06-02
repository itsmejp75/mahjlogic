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

/** `pass-box` → rightmost empty slot; or a tile id already in a pass slot (reorder / swap). */
export function passDropIndex(overId: string, passSlots: PassSlots): number | null {
  if (overId === PASS_BOX_ID) {
    const idx = firstEmptyPassSlotIndex(passSlots)
    return idx >= 0 ? idx : null
  }
  const j = passSlots.findIndex((s) => s?.id === overId)
  return j >= 0 ? j : null
}
