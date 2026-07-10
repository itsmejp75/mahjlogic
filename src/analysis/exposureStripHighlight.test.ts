import { describe, expect, it } from 'vitest'
import { NMJL_2026_PATTERNS } from '../card/nmjl2026Patterns'
import {
  buildSuggestedStripSlots,
  computeRackPatternHighlightIds,
  greedyPatternMatchDetail,
} from './suggestedHands'
import { tileInstancesWithClaimMeldJokersResolved } from './eastExposurePatternFit'
import type { TileDef, TileInstance } from '../mahjong/types'

function tile(def: TileDef, id: string): TileInstance {
  return { id, def }
}

describe('suggested strip with exposure melds', () => {
  const year1 = NMJL_2026_PATTERNS.find((p) => p.title === '222 000 2222 6666')!

  it('lights the full soap pung from exposure and stops defaulting the joker to 2b', () => {
    const hand: TileInstance[] = [
      tile({ cat: 'suit', suit: 'bam', rank: 2 }, 'b2'),
      tile({ cat: 'suit', suit: 'dot', rank: 2 }, 'd2a'),
      tile({ cat: 'suit', suit: 'dot', rank: 2 }, 'd2b'),
      tile({ cat: 'suit', suit: 'dot', rank: 2 }, 'd2c'),
      tile({ cat: 'suit', suit: 'dot', rank: 2 }, 'd2d'),
    ]
    const calledSoap = tile({ cat: 'dragon', dragon: 'soap' }, 'soap-called')
    const exposureSoap = tile({ cat: 'dragon', dragon: 'soap' }, 'soap-hand')
    const exposureJoker = tile({ cat: 'joker' }, 'joker-exp')
    const exposureIds = new Set([calledSoap.id, exposureSoap.id, exposureJoker.id])
    const rackDisplay: TileInstance[] = [...hand, calledSoap, exposureSoap, exposureJoker]
    const exposureMelds = [{ tiles: [calledSoap, exposureSoap, exposureJoker] }]
    const rackMatch = tileInstancesWithClaimMeldJokersResolved(hand, exposureMelds)
    const greedyOpts = { exposureTileIds: exposureIds }

    const detail = greedyPatternMatchDetail(rackMatch, year1, greedyOpts)
    const bestIds = computeRackPatternHighlightIds(rackMatch, year1, detail, exposureIds)
    const slots = buildSuggestedStripSlots(
      year1,
      rackDisplay,
      detail.usedOrder,
      bestIds,
      detail.usedMeta,
      exposureIds,
    )

    const soapSlots = slots.filter((s) => s.displayDef.cat === 'dragon' && s.displayDef.dragon === 'soap')
    const bam2Slots = slots.filter(
      (s) => s.displayDef.cat === 'suit' && s.displayDef.suit === 'bam' && s.displayDef.rank === 2,
    )

    expect(soapSlots).toHaveLength(3)
    expect(soapSlots.every((s) => s.highlight)).toBe(true)
    expect(soapSlots.some((s) => s.jokerSuggested)).toBe(false)
    expect(bam2Slots.filter((s) => s.jokerSuggested)).toHaveLength(0)
  })

  it('still defaults a concealed rack joker to the first meld when no exposure uses it', () => {
    const hand: TileInstance[] = [
      tile({ cat: 'suit', suit: 'bam', rank: 2 }, 'b2'),
      tile({ cat: 'joker' }, 'joker-hand'),
      tile({ cat: 'dragon', dragon: 'soap' }, 'soap'),
      tile({ cat: 'suit', suit: 'dot', rank: 2 }, 'd2a'),
      tile({ cat: 'suit', suit: 'dot', rank: 2 }, 'd2b'),
      tile({ cat: 'suit', suit: 'dot', rank: 2 }, 'd2c'),
      tile({ cat: 'suit', suit: 'dot', rank: 2 }, 'd2d'),
    ]
    const detail = greedyPatternMatchDetail(hand, year1)
    const bestIds = computeRackPatternHighlightIds(hand, year1, detail)
    const slots = buildSuggestedStripSlots(year1, hand, detail.usedOrder, bestIds, detail.usedMeta)

    const bam2Slots = slots.filter(
      (s) => s.displayDef.cat === 'suit' && s.displayDef.suit === 'bam' && s.displayDef.rank === 2,
    )
    expect(bam2Slots.filter((s) => s.highlight)).toHaveLength(1)
    expect(bam2Slots.filter((s) => s.jokerSuggested)).toHaveLength(1)
  })
})
