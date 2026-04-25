import type { TileInstance } from './types'

export type PassSlots = [
  TileInstance | null,
  TileInstance | null,
  TileInstance | null,
]

/** Single Charleston pass staging area (fits three rack tiles). */
export const PASS_BOX_ID = 'pass-box'

/** `pass-box` → first empty slot; or a tile id already in a pass slot (reorder / swap). */
export function passDropIndex(overId: string, passSlots: PassSlots): number | null {
  if (overId === PASS_BOX_ID) {
    const idx = passSlots.findIndex((s) => s == null)
    return idx >= 0 ? idx : null
  }
  const j = passSlots.findIndex((s) => s?.id === overId)
  return j >= 0 ? j : null
}
