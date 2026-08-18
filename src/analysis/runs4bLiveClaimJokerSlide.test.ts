import { describe, expect, it } from 'vitest'
import { NMJL_2026_PATTERNS } from '../card/nmjl2026Patterns'
import {
  buildSuggestedStripSlots,
  computeRackPatternHighlightIds,
  greedyPatternMatchDetail,
  suggestedStripRacksForLiveClaim,
} from './suggestedHands'
import type { TileDef, TileInstance } from '../mahjong/types'

function tile(def: TileDef, id: string): TileInstance {
  return { id, def }
}

function label(d: TileDef): string {
  if (d.cat === 'suit') return `${d.rank}${d.suit[0]!.toUpperCase()}`
  if (d.cat === 'joker') return 'J'
  if (d.cat === 'flower') return 'F'
  return d.cat
}

/**
 * Screenshot: Runs #4b at 100% because West's discarded 6C is a winning call.
 * Concealed rack is 6C, 3×7C, 2×8D, 4×9D, 3 jokers. Without the live 6C the strip
 * parks two jokers on the 6s and leaves a dim 8D. With the call preview, one
 * joker slides onto the 8-dot kong.
 */
describe('Runs #4b live 6C claim slides a joker onto the 8s', () => {
  const p = NMJL_2026_PATTERNS.find((x) => x.cardHandCode === '4b' && x.section?.includes('RUN'))!

  const hand: TileInstance[] = [
    tile({ cat: 'suit', suit: 'crak', rank: 7 }, 'c7a'),
    tile({ cat: 'suit', suit: 'crak', rank: 7 }, 'c7b'),
    tile({ cat: 'suit', suit: 'crak', rank: 7 }, 'c7c'),
    tile({ cat: 'suit', suit: 'dot', rank: 9 }, 'd9a'),
    tile({ cat: 'suit', suit: 'dot', rank: 9 }, 'd9b'),
    tile({ cat: 'suit', suit: 'dot', rank: 9 }, 'd9c'),
    tile({ cat: 'suit', suit: 'dot', rank: 9 }, 'd9d'),
    tile({ cat: 'suit', suit: 'crak', rank: 6 }, 'c6'),
    tile({ cat: 'joker' }, 'hJ1'),
    tile({ cat: 'suit', suit: 'dot', rank: 8 }, 'd8a'),
    tile({ cat: 'suit', suit: 'dot', rank: 8 }, 'd8b'),
    tile({ cat: 'joker' }, 'hJ2'),
    tile({ cat: 'joker' }, 'hJ3'),
  ]
  const live = tile({ cat: 'suit', suit: 'crak', rank: 6 }, 'c6-live')

  function slotsFor(liveDiscard: TileInstance | null) {
    const racks = suggestedStripRacksForLiveClaim(p, hand, hand, undefined, undefined, liveDiscard)
    const greedyOpts = racks.exposureTileIds?.size
      ? { exposureTileIds: racks.exposureTileIds, claimMelds: racks.claimMelds }
      : undefined
    const detail = greedyPatternMatchDetail(racks.rackMatch, p, greedyOpts)
    const bestIds = computeRackPatternHighlightIds(
      racks.rackMatch,
      p,
      detail,
      racks.exposureTileIds,
    )
    return buildSuggestedStripSlots(
      p,
      racks.rackMatch,
      detail.usedOrder,
      bestIds,
      detail.usedMeta,
      racks.exposureTileIds,
      racks.claimMelds,
    )
  }

  it('without the live discard, two jokers sit on 666 and the 8-kong stays short', () => {
    const slots = slotsFor(null)
    expect(slots.map((s) => label(s.displayDef)).join(' ')).toBe(
      '6C 6C 6C 7C 7C 7C 8D 8D 8D 8D 9D 9D 9D 9D',
    )
    const pung6 = slots.slice(0, 3)
    const kong8 = slots.slice(6, 10)
    expect(pung6.filter((s) => s.jokerSuggested)).toHaveLength(2)
    expect(kong8.filter((s) => s.jokerSuggested)).toHaveLength(1)
    expect(kong8.filter((s) => !s.highlight && !s.jokerSuggested)).toHaveLength(1)
  })

  it('with the live 6C, one joker stays on 666 and both leftover jokers fill 8888', () => {
    const slots = slotsFor(live)
    expect(slots.map((s) => label(s.displayDef)).join(' ')).toBe(
      '6C 6C 6C 7C 7C 7C 8D 8D 8D 8D 9D 9D 9D 9D',
    )
    const pung6 = slots.slice(0, 3)
    const pung7 = slots.slice(3, 6)
    const kong8 = slots.slice(6, 10)
    const kong9 = slots.slice(10, 14)

    expect(pung6.filter((s) => s.highlight && !s.jokerSuggested)).toHaveLength(2)
    expect(pung6.filter((s) => s.jokerSuggested)).toHaveLength(1)
    expect(pung6.some((s) => s.tileId === 'c6-live')).toBe(true)

    expect(pung7.every((s) => s.highlight && !s.jokerSuggested)).toBe(true)

    expect(kong8.filter((s) => s.highlight && !s.jokerSuggested)).toHaveLength(2)
    expect(kong8.filter((s) => s.jokerSuggested)).toHaveLength(2)
    expect(kong8.some((s) => !s.highlight && !s.jokerSuggested)).toBe(false)

    expect(kong9.every((s) => s.highlight)).toBe(true)
  })
})
