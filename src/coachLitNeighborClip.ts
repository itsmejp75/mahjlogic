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

/** Dim coach cells — vertical seam clip only (rim overlaps across meld rows). */
export const COACH_DIM_SLOT =
  '.exposure-rack__slot--suggest-dim:not(.exposure-rack__slot--suggest-best)'

export const COACH_VERTICAL_CLIP_SLOT = `${COACH_LIT_SLOT}, ${COACH_DIM_SLOT}`

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
  const centerA = (a.left + a.right) / 2
  const centerB = (b.left + b.right) / 2
  const minWidth = Math.min(a.width, b.width)
  if (Math.abs(centerA - centerB) > minWidth * columnOverlapMin) {
    const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left)
    if (overlapX <= 0) return false
    if (overlapX < minWidth * columnOverlapMin) return false
  }

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
  // Row overlap already proves shared band; do not require near-equal tops (subpixel /
  // bounce / DPR drift previously dropped adjacent lit jokers intermittently).

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
  root.querySelectorAll<HTMLElement>(COACH_VERTICAL_CLIP_SLOT).forEach((el) => {
    el.classList.remove(...CLIP_CLASSES)
    delete el.dataset.coachVabove
    delete el.dataset.coachVbelow
  })
}

function readMaxCoachGapPx(scope: ParentNode): number {
  if (!(scope instanceof Element)) return 24

  const style = getComputedStyle(scope)
  const rowGap = parseFloat(style.rowGap || style.gap || '')
  const faceGap = parseFloat(style.getPropertyValue('--player-rack-face-gap').trim() || '')
  const botRowGap = parseFloat(style.getPropertyValue('--discard-bot-row-gap-y').trim() || '')
  // Top-exposure overlay uses `gap: max(bot-row, face)` — include both so vertical
  // sorted lit↔lit (B/C/D) still counts as adjacent when the used gap is the larger one.
  const gaps = [rowGap, faceGap, botRowGap].filter(Number.isFinite)
  if (gaps.length === 0) return 24
  return Math.max(Math.max(...gaps) + 6, 12)
}

/** Exposure racks under `root` that each get their own lit→lit clip pass. */
export function findCoachLitClipScopes(root: ParentNode): HTMLElement[] {
  if (root instanceof HTMLElement && root.matches(COACH_LIT_CLIP_SCOPE)) {
    return [root]
  }
  return [...root.querySelectorAll<HTMLElement>(COACH_LIT_CLIP_SCOPE)]
}

function isLitCoachSlot(el: Element): boolean {
  return el.matches('.exposure-rack__slot--suggest-best, .sorted-discard-tray__slot--suggest-need')
}

function applyCoachClipClasses(
  els: readonly HTMLElement[],
  maxGapPx: number,
  directions: 'all' | 'vertical' | 'horizontal',
) {
  if (els.length < 2) return

  const idToEl = new Map<string, HTMLElement>()
  const rects: LitSlotRect[] = els.map((el, index) => {
    const r = el.getBoundingClientRect()
    const id = `${slotId(el, index)}#${index}`
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
    const isLit = isLitCoachSlot(el)

    if (edges.top && (directions === 'all' || directions === 'vertical')) {
      el.classList.add(COACH_LIT_CLIP_TOP)
      el.dataset.coachVabove = '1'
    }
    if (edges.right && directions !== 'vertical' && isLit) {
      el.classList.add(COACH_LIT_CLIP_RIGHT)
    }
    if (edges.bottom && (directions === 'all' || directions === 'vertical')) {
      el.classList.add(COACH_LIT_CLIP_BOTTOM)
      el.dataset.coachVbelow = '1'
    }
    if (edges.left && directions !== 'vertical' && isLit) {
      el.classList.add(COACH_LIT_CLIP_LEFT)
    }
  }
}

/**
 * Vertical seams including dim tiles: clip dim rim edges against lit/dim neighbors, but never
 * clip a lit tile's lift against a dim neighbor — lit lift must paint over the dim row below.
 */
function applyVerticalDimSeamClips(els: readonly HTMLElement[], maxGapPx: number) {
  if (els.length < 2) return

  const idToEl = new Map<string, HTMLElement>()
  const rects: LitSlotRect[] = els.map((el, index) => {
    const r = el.getBoundingClientRect()
    const id = `${slotId(el, index)}#${index}`
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

  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]
      const b = rects[j]
      if (!areVerticallyAdjacentLitSlots(a, b, maxGapPx)) continue

      const top = a.top <= b.top ? a : b
      const bottom = top === a ? b : a
      const topEl = idToEl.get(top.id)!
      const bottomEl = idToEl.get(bottom.id)!
      const topLit = isLitCoachSlot(topEl)
      const bottomLit = isLitCoachSlot(bottomEl)

      if (topLit && bottomLit) {
        // Lit↔lit handled by the lit-only pass (lift + vignette).
        continue
      }

      // Dim facing a lit or dim neighbor: clip dim rim only.
      if (!topLit) {
        topEl.classList.add(COACH_LIT_CLIP_BOTTOM)
        topEl.dataset.coachVbelow = '1'
      }
      if (!bottomLit) {
        bottomEl.classList.add(COACH_LIT_CLIP_TOP)
        bottomEl.dataset.coachVabove = '1'
      }
    }
  }
}

function visibleLitCoachSlots(scope: ParentNode): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>(COACH_LIT_SLOT)].filter((el) => {
    const rect = el.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  })
}

function visibleVerticalClipCoachSlots(scope: ParentNode): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>(COACH_VERTICAL_CLIP_SLOT)].filter((el) => {
    const rect = el.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  })
}

function updateCoachLitNeighborClipInScope(scope: ParentNode) {
  const maxGapPx = readMaxCoachGapPx(scope)
  // Lit↔lit (and lit horizontal): clip lift + vignette at same-height seams.
  applyCoachClipClasses(visibleLitCoachSlots(scope), maxGapPx, 'all')
  // Lit↔dim / dim↔dim: clip dim rims only — never chop lit lift over a dim row.
  applyVerticalDimSeamClips(visibleVerticalClipCoachSlots(scope), maxGapPx)
}

/** Sorted B/C/D rows share columns across overlay rows — clip rim/lift at vertical seams. */
function updateSortedDiscardTrackerLitClip(grid: ParentNode) {
  const litEls = visibleLitCoachSlots(grid).filter((el) =>
    el.closest('.exposure-rack--discard-tracker-sorted-row'),
  )
  applyCoachClipClasses(litEls, readMaxCoachGapPx(grid), 'all')
}

/**
 * Bot S/W/N exposure racks are separate per-seat scopes, but vertically aligned lit tiles
 * across adjacent seats must clip like same-height tiles (otherwise the lower seat's lift
 * paints over the lit tile above — overlay rows elevate later seats).
 */
function updateBotExposureTrackerLitClip(grid: ParentNode) {
  const litEls = visibleLitCoachSlots(grid).filter((el) =>
    el.closest('.exposure-rack--discard-tracker-bot-row'),
  )
  applyCoachClipClasses(litEls, readMaxCoachGapPx(grid), 'vertical')
  applyVerticalDimSeamClips(
    visibleVerticalClipCoachSlots(grid).filter((el) =>
      el.closest('.exposure-rack--discard-tracker-bot-row'),
    ),
    readMaxCoachGapPx(grid),
  )
}

/**
 * Clip coach rim + lift on every edge that faces another lit tile.
 * Per-rack scopes handle horizontal + within-rack seams; overlay-grid passes clip B/C/D and
 * S/W/N columns across adjacent seats.
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
    updateBotExposureTrackerLitClip(grid)
  }
}
