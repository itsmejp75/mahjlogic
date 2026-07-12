import { describe, expect, it } from 'vitest'
import {
  areHorizontallyAdjacentLitSlots,
  areVerticallyAdjacentLitSlots,
  computeLitSlotClipEdges,
  type LitSlotRect,
} from './coachLitNeighborClip'

function rect(
  id: string,
  left: number,
  top: number,
  width: number,
  height: number,
): LitSlotRect {
  return {
    id,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  }
}

describe('coachLitNeighborClip', () => {
  it('clips bottom/top when lit slots share a column across rows', () => {
    const slots = [
      rect('upper', 100, 10, 40, 52),
      rect('lower', 102, 66, 40, 52),
    ]
    expect(areVerticallyAdjacentLitSlots(slots[0], slots[1], 8)).toBe(true)
    expect(computeLitSlotClipEdges(slots, 8).get('upper')).toEqual({
      top: false,
      right: false,
      bottom: true,
      left: false,
    })
    expect(computeLitSlotClipEdges(slots, 8).get('lower')).toEqual({
      top: true,
      right: false,
      bottom: false,
      left: false,
    })
  })

  it('clips left/right when lit slots share a row', () => {
    const slots = [
      rect('left', 10, 10, 40, 52),
      rect('right', 52, 10, 40, 52),
    ]
    expect(areHorizontallyAdjacentLitSlots(slots[0], slots[1], 4)).toBe(true)
    expect(computeLitSlotClipEdges(slots, 4).get('left')).toEqual({
      top: false,
      right: true,
      bottom: false,
      left: false,
    })
    expect(computeLitSlotClipEdges(slots, 4).get('right')).toEqual({
      top: false,
      right: false,
      bottom: false,
      left: true,
    })
  })

  it('clips left/right when tops differ slightly but row overlap is high', () => {
    const slots = [
      rect('left', 10, 10, 40, 52),
      rect('right', 52, 14, 40, 52),
    ]
    expect(areHorizontallyAdjacentLitSlots(slots[0], slots[1], 4)).toBe(true)
    expect(computeLitSlotClipEdges(slots, 4).get('left')?.right).toBe(true)
    expect(computeLitSlotClipEdges(slots, 4).get('right')?.left).toBe(true)
  })

  it('clips bottom/top when lit bot exposure slots share a column in the same rack', () => {
    const upper = rect('upper-joker', 100, 10, 40, 52)
    const lower = rect('lower-joker', 100, 66, 40, 52)
    expect(areVerticallyAdjacentLitSlots(upper, lower, 12)).toBe(true)
    expect(computeLitSlotClipEdges([upper, lower], 12).get('upper-joker')).toEqual({
      top: false,
      right: false,
      bottom: true,
      left: false,
    })
    expect(computeLitSlotClipEdges([upper, lower], 12).get('lower-joker')).toEqual({
      top: true,
      right: false,
      bottom: false,
      left: false,
    })
  })

  it('clips vertically adjacent dim tiles in the same column', () => {
    const upper = rect('upper-dim', 100, 10, 40, 52)
    const lower = rect('lower-dim', 102, 66, 40, 52)
    expect(areVerticallyAdjacentLitSlots(upper, lower, 12)).toBe(true)
    expect(computeLitSlotClipEdges([upper, lower], 12).get('upper-dim')?.bottom).toBe(true)
    expect(computeLitSlotClipEdges([upper, lower], 12).get('lower-dim')?.top).toBe(true)
  })

  it('treats lit above dim as vertically adjacent (dim rim may clip; lit lift must not)', () => {
    const lit = rect('lit', 100, 10, 40, 52)
    const dim = rect('dim', 100, 66, 40, 52)
    expect(areVerticallyAdjacentLitSlots(lit, dim, 12)).toBe(true)
    // Geometry still reports the seam; applyVerticalDimSeamClips is what withholds lit clip.
    expect(computeLitSlotClipEdges([lit, dim], 12).get('lit')?.bottom).toBe(true)
    expect(computeLitSlotClipEdges([lit, dim], 12).get('dim')?.top).toBe(true)
  })

  it('clips vertically aligned lit bot exposures across overlay seats when considered together', () => {
    const wJoker = rect('w-joker', 230, 100, 40, 52)
    const nJoker = rect('n-joker', 232, 156, 40, 52)
    expect(areVerticallyAdjacentLitSlots(wJoker, nJoker, 24)).toBe(true)
    expect(computeLitSlotClipEdges([wJoker, nJoker], 24).get('w-joker')).toEqual({
      top: false,
      right: false,
      bottom: true,
      left: false,
    })
    expect(computeLitSlotClipEdges([wJoker, nJoker], 24).get('n-joker')).toEqual({
      top: true,
      right: false,
      bottom: false,
      left: false,
    })
  })

  it('alone, a lit joker has no clip edges (cross-seat clip needs both in one pass)', () => {
    const wJoker = rect('w-joker', 230, 100, 40, 52)
    const nJoker = rect('n-joker', 250, 156, 40, 52)
    expect(areVerticallyAdjacentLitSlots(wJoker, nJoker, 24)).toBe(true)

    expect(computeLitSlotClipEdges([wJoker], 24).get('w-joker')).toEqual({
      top: false,
      right: false,
      bottom: false,
      left: false,
    })
    expect(computeLitSlotClipEdges([nJoker], 24).get('n-joker')).toEqual({
      top: false,
      right: false,
      bottom: false,
      left: false,
    })
  })

  it('clips bottom/top when lit sorted-discard slots share a column across overlay rows', () => {
    const soap = rect('soap', 180, 60, 36, 48)
    const red = rect('red', 182, 112, 36, 48)
    expect(areVerticallyAdjacentLitSlots(soap, red, 12)).toBe(true)
    expect(computeLitSlotClipEdges([soap, red], 12).get('soap')).toEqual({
      top: false,
      right: false,
      bottom: true,
      left: false,
    })
    expect(computeLitSlotClipEdges([soap, red], 12).get('red')).toEqual({
      top: true,
      right: false,
      bottom: false,
      left: false,
    })
  })

  it('ignores tiles that are too far apart vertically or on different columns', () => {
    const slots = [
      rect('left', 10, 10, 40, 52),
      rect('right', 52, 10, 40, 52),
      rect('far-below', 200, 140, 40, 52),
    ]
    expect(computeLitSlotClipEdges(slots).get('left')).toEqual({
      top: false,
      right: true,
      bottom: false,
      left: false,
    })
    expect(computeLitSlotClipEdges(slots).get('far-below')).toEqual({
      top: false,
      right: false,
      bottom: false,
      left: false,
    })
  })
})
