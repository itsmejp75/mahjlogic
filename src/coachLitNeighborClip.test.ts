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

  it('does not clip lit jokers in different overlay rows when scopes are separate racks', () => {
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
