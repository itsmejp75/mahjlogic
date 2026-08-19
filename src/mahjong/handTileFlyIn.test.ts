import { describe, expect, it } from 'vitest'
import { handFlyInUsesSharedOrigin } from './handTileFlyIn'

describe('handFlyInUsesSharedOrigin', () => {
  it('is true for a multi-tile Charleston receive (no stagger)', () => {
    expect(handFlyInUsesSharedOrigin({ ids: ['a', 'b', 'c'], from: 'across' })).toBe(true)
  })

  it('is false for a single wall-draw / claim tile', () => {
    expect(handFlyInUsesSharedOrigin({ ids: ['a'], from: 'right' })).toBe(false)
  })

  it('is false for the opening-deal wave (per-slot stagger)', () => {
    expect(
      handFlyInUsesSharedOrigin({ ids: ['a', 'b', 'c'], from: 'across', staggerWaveDelayMs: 40 }),
    ).toBe(false)
  })
})
