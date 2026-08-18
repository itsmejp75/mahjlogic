import { describe, expect, it } from 'vitest'
import { NMJL_2026_PATTERNS } from '../card/nmjl2026Patterns'
import { tileInstancesWithClaimMeldJokersResolved } from './eastExposurePatternFit'
import {
  buildSuggestedStripSlots,
  computeRackPatternHighlightIds,
  greedyPatternMatchDetail,
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
 * Screenshot: called 9-dot kong (2 naturals + 2 jokers). Concealed rack is
 * 6C, J, 7C, 7C, 8D, 8D, 1B, J, J, F3. Runs #4b should stay on 666 777 8888 9999
 * with concealed jokers filling the 6C/7C pungs — not stacked into the first
 * pung while dropping the 6C and a 7C.
 */
describe('Runs #4b exposed 9-dot joker kong strip', () => {
  const p = NMJL_2026_PATTERNS.find((x) => x.cardHandCode === '4b' && x.section?.includes('RUN'))!

  const exp9a = tile({ cat: 'suit', suit: 'dot', rank: 9 }, 'e9a')
  const exp9b = tile({ cat: 'suit', suit: 'dot', rank: 9 }, 'e9b')
  const expJ1 = tile({ cat: 'joker' }, 'eJ1')
  const expJ2 = tile({ cat: 'joker' }, 'eJ2')
  const melds = [{ tiles: [exp9a, exp9b, expJ1, expJ2] }]
  const exposureIds = new Set(melds.flatMap((m) => m.tiles.map((t) => t.id)))

  const hand: TileInstance[] = [
    tile({ cat: 'suit', suit: 'crak', rank: 6 }, 'c6'),
    tile({ cat: 'joker' }, 'hJ1'),
    tile({ cat: 'suit', suit: 'crak', rank: 7 }, 'c7a'),
    tile({ cat: 'suit', suit: 'crak', rank: 7 }, 'c7b'),
    tile({ cat: 'suit', suit: 'dot', rank: 8 }, 'd8a'),
    tile({ cat: 'suit', suit: 'dot', rank: 8 }, 'd8b'),
    tile({ cat: 'suit', suit: 'bam', rank: 1 }, 'b1'),
    tile({ cat: 'joker' }, 'hJ2'),
    tile({ cat: 'joker' }, 'hJ3'),
    tile({ cat: 'flower' }, 'f3'),
  ]

  const rackDisplay = [...melds.flatMap((m) => m.tiles), ...hand]
  const rackMatch = [
    ...tileInstancesWithClaimMeldJokersResolved(hand, melds).filter((t) => exposureIds.has(t.id)),
    ...tileInstancesWithClaimMeldJokersResolved(hand, melds).filter((t) => !exposureIds.has(t.id)),
  ]

  function build(opts: { claimMelds?: boolean; panelStyle?: boolean }) {
    const greedyOpts = opts.panelStyle
      ? { exposureTileIds: exposureIds }
      : { exposureTileIds: exposureIds, claimMelds: melds }
    const detail = greedyPatternMatchDetail(rackMatch, p, greedyOpts)
    const bestIds = computeRackPatternHighlightIds(rackMatch, p, detail, exposureIds)
    const slots = buildSuggestedStripSlots(
      p,
      opts.panelStyle ? rackMatch : rackDisplay,
      detail.usedOrder,
      bestIds,
      detail.usedMeta,
      exposureIds,
      melds,
    )
    return { detail, bestIds, slots }
  }

  it('keeps 6C and both 7Cs on the 666 777 window after the 9-dot joker kong', () => {
    const withClaim = build({ claimMelds: true })
    const slots = withClaim.slots
    expect(slots.map((s) => label(s.displayDef)).join(' ')).toBe(
      '6C 6C 6C 7C 7C 7C 8D 8D 8D 8D 9D 9D 9D 9D',
    )

    const pung6 = slots.slice(0, 3)
    const pung7 = slots.slice(3, 6)
    const kong8 = slots.slice(6, 10)
    const kong9 = slots.slice(10, 14)

    expect(pung6.some((s) => s.tileId === 'c6' && s.highlight)).toBe(true)
    expect(pung6.filter((s) => s.jokerSuggested)).toHaveLength(2)

    expect(pung7.filter((s) => s.highlight && (s.tileId === 'c7a' || s.tileId === 'c7b'))).toHaveLength(2)
    expect(pung7.filter((s) => s.jokerSuggested)).toHaveLength(1)

    expect(kong8.filter((s) => s.highlight && (s.tileId === 'd8a' || s.tileId === 'd8b'))).toHaveLength(2)
    expect(kong8.filter((s) => !s.highlight && !s.jokerSuggested)).toHaveLength(2)

    expect(kong9.every((s) => s.exposureMeldId != null && s.highlight)).toBe(true)
    expect(kong9.map((s) => s.tileId).sort()).toEqual(['e9a', 'e9b', 'eJ1', 'eJ2'].sort())
    expect(kong9.filter((s) => s.jokerSuggested).map((s) => s.tileId).sort()).toEqual(['eJ1', 'eJ2'])
  })
})
