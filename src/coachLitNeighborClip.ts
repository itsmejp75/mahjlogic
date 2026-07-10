/** Clip rim / lift at lit→lit seams so each tile's glow meets at the gap center. */
export const COACH_LIT_CLIP_TOP = 'coach-lit-clip-top'
export const COACH_LIT_CLIP_RIGHT = 'coach-lit-clip-right'
export const COACH_LIT_CLIP_BOTTOM = 'coach-lit-clip-bottom'
export const COACH_LIT_CLIP_LEFT = 'coach-lit-clip-left'

export const CLIP_CLASSES = [
  COACH_LIT_CLIP_TOP,
  COACH_LIT_CLIP_RIGHT,
  COACH_LIT_CLIP_BOTTOM,
  COACH_LIT_CLIP_LEFT,
] as const

/** Lit coach cells in discard tracker + side-panel bot exposures. */
export const COACH_LIT_SLOT =
  '.exposure-rack__slot--suggest-best, .sorted-discard-tray__slot--suggest-need'

/**
 * Per-rack scopes for bot exposure rows. Sorted discard rows use a separate cross-row pass
 * on `.discard-tracker__overlay-grid` so vertically aligned B/C/D columns clip at row seams.
 */
export const COACH_LIT_CLIP_SCOPE =
  '.exposure-rack--discard-tracker-bot-row, .panel--bot-exposures .exposure-rack'

export const COACH_LIT_SORTED_TRACKER_GRID = '.discard-tracker__overlay-grid'

export type LitSlotRect = {
  id: string
  top: number
  bottom: number
  left: number
  right: number
  width: number
  height: number
}

export type LitSlotClipEdges = {
  top: boolean
  right: boolean
  bottom: boolean
  left: boolean
}

function emptyClip(): LitSlotClipEdges {
  return { top: false, right: false, bottom: false, left: false }
}

function mergeClip(target: LitSlotClipEdges, edge: keyof LitSlotClipEdges) {
  target[edge] = true
}

/** True when `a` is above `b`, share a column, and are separated by at most `maxGapPx`. */
export function areVerticallyAdjacentLitSlots(
  a: LitSlotRect,
  b: LitSlotRect,
  maxGapPx: number,
  columnOverlapMin = 0.45,
): boolean {
  const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left)
  if (overlapX <= 0) return false

  const minWidth = Math.min(a.width, b.width)
  if (overlapX < minWidth * columnOverlapMin) return false

  const top = a.top <= b.top ? a : b
  const bottom = top === a ? b : a
  if (Math.abs(top.top - bottom.top) < 2) return false

  const gap = bottom.top - top.bottom
  return gap >= -1 && gap <= maxGapPx
}

/** True when `a` is left of `b`, share a row, and are separated by at most `maxGapPx`. */
export function areHorizontallyAdjacentLitSlots(
  a: LitSlotRect,
  b: LitSlotRect,
  maxGapPx: number,
  rowOverlapMin = 0.45,
): boolean {
  const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
  if (overlapY <= 0) return false

  const minHeight = Math.min(a.height, b.height)
  if (overlapY < minHeight * rowOverlapMin) return false

  const left = a.left <= b.left ? a : b
  const right = left === a ? b : a
  if (Math.abs(left.top - right.top) > 2) return false

  const gap = right.left - left.right
  return gap >= -1 && gap <= maxGapPx
}

/** For each lit slot, which rim/lift edges face another lit tile (above/below/left/right). */
export function computeLitSlotClipEdges(
  slots: readonly LitSlotRect[],
  maxGapPx = 24,
): Map<string, LitSlotClipEdges> {
  const clips = new Map<string, LitSlotClipEdges>()

  for (const slot of slots) {
    clips.set(slot.id, emptyClip())
  }

  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i]
      const b = slots[j]

      if (areVerticallyAdjacentLitSlots(a, b, maxGapPx)) {
        const top = a.top <= b.top ? a : b
        const bottom = top === a ? b : a
        mergeClip(clips.get(top.id)!, 'bottom')
        mergeClip(clips.get(bottom.id)!, 'top')
      }

      if (areHorizontallyAdjacentLitSlots(a, b, maxGapPx)) {
        const left = a.left <= b.left ? a : b
        const right = left === a ? b : a
        mergeClip(clips.get(left.id)!, 'right')
        mergeClip(clips.get(right.id)!, 'left')
      }
    }
  }

  return clips
}

function slotId(el: HTMLElement, index: number): string {
  return el.dataset.tileId ?? el.dataset.trackerDefKey ?? `slot-${index}`
}

function clearClipClasses(root: ParentNode) {
  root.querySelectorAll<HTMLElement>(COACH_LIT_SLOT).forEach((el) => {
    el.classList.remove(...CLIP_CLASSES)
  })
}

function readMaxCoachGapPx(scope: ParentNode): number {
  if (!(scope instanceof Element)) return 24

  const rowGap = parseFloat(getComputedStyle(scope).rowGap || getComputedStyle(scope).gap || '')
  const faceGap = parseFloat(
    getComputedStyle(scope).getPropertyValue('--player-rack-face-gap').trim() || '',
  )
  const gaps = [rowGap, faceGap].filter(Number.isFinite)
  if (gaps.length === 0) return 24
  return Math.max(Math.max(...gaps) + 6, 12)
}

/** Exposure racks under `root` that each get their own lit→lit clip pass. */
export function findCoachLitClipScopes(root: ParentNode): HTMLElement[] {
  if (root instanceof Element && root.matches(COACH_LIT_CLIP_SCOPE)) {
    return [root]
  }
  return [...root.querySelectorAll<HTMLElement>(COACH_LIT_CLIP_SCOPE)]
}

function applyLitSlotClipClasses(
  litEls: readonly HTMLElement[],
  maxGapPx: number,
) {
  if (litEls.length < 2) return

  const idToEl = new Map<string, HTMLElement>()
  const rects: LitSlotRect[] = litEls.map((el, index) => {
    const r = el.getBoundingClientRect()
    const id = slotId(el, index)
    idToEl.set(id, el)
    return {
      id,
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      width: r.width,
      height: r.height,
    }
  })

  const clips = computeLitSlotClipEdges(rects, maxGapPx)

  for (const [id, edges] of clips) {
    const el = idToEl.get(id)
    if (!el) continue
    if (edges.top) el.classList.add(COACH_LIT_CLIP_TOP)
    if (edges.right) el.classList.add(COACH_LIT_CLIP_RIGHT)
    if (edges.bottom) el.classList.add(COACH_LIT_CLIP_BOTTOM)
    if (edges.left) el.classList.add(COACH_LIT_CLIP_LEFT)
  }
}

function visibleLitCoachSlots(scope: ParentNode): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>(COACH_LIT_SLOT)].filter((el) => {
    const rect = el.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  })
}

function updateCoachLitNeighborClipInScope(scope: ParentNode) {
  applyLitSlotClipClasses(visibleLitCoachSlots(scope), readMaxCoachGapPx(scope))
}

/** Sorted B/C/D rows share columns across overlay rows — clip rim/lift at vertical seams. */
function updateSortedDiscardTrackerLitClip(grid: ParentNode) {
  const litEls = visibleLitCoachSlots(grid).filter((el) =>
    el.closest('.exposure-rack--discard-tracker-sorted-row'),
  )
  applyLitSlotClipClasses(litEls, readMaxCoachGapPx(grid))
}

/**
 * Clip coach rim + lift on every edge that faces another lit tile in the same exposure rack.
 * Bot tracker S/W/N rows stay separate scopes; sorted discard rows clip across all three bands.
 */
export function updateCoachLitNeighborClip(root: ParentNode | null | undefined) {
  if (!root) return

  clearClipClasses(root)

  const scopes = findCoachLitClipScopes(root)
  if (scopes.length === 0) {
    updateCoachLitNeighborClipInScope(root)
  } else {
    for (const scope of scopes) {
      updateCoachLitNeighborClipInScope(scope)
    }
  }

  const sortedGrids =
    root instanceof Element && root.matches(COACH_LIT_SORTED_TRACKER_GRID)
      ? [root]
      : [...root.querySelectorAll<HTMLElement>(COACH_LIT_SORTED_TRACKER_GRID)]

  for (const grid of sortedGrids) {
    updateSortedDiscardTrackerLitClip(grid)
  }
}
