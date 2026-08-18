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

function label(d: TileDef): string {
  if (d.cat === 'suit') return `${d.rank}${d.suit[0]}`
  if (d.cat === 'dragon') return d.dragon
  if (d.cat === 'wind') return d.wind
  if (d.cat === 'flower') return 'F'
  if (d.cat === 'joker') return 'J'
  return d.cat
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
      exposureMelds,
    )

    const soapSlots = slots.filter((s) => s.displayDef.cat === 'dragon' && s.displayDef.dragon === 'soap')
    const bam2Slots = slots.filter(
      (s) => s.displayDef.cat === 'suit' && s.displayDef.suit === 'bam' && s.displayDef.rank === 2,
    )

    expect(soapSlots).toHaveLength(3)
    expect(soapSlots.every((s) => s.highlight)).toBe(true)
    expect(soapSlots.filter((s) => s.jokerSuggested).map((s) => s.tileId)).toEqual(['joker-exp'])
    expect(soapSlots.every((s) => s.exposureMeldId != null)).toBe(true)
    expect(new Set(soapSlots.map((s) => s.exposureMeldId)).size).toBe(1)
    expect(bam2Slots.filter((s) => s.jokerSuggested)).toHaveLength(0)
    expect(bam2Slots.every((s) => s.exposureMeldId == null)).toBe(true)
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

  it('boxes Year #4 666 for an exposed 6-bam pung; 369 #4 remaps onto pung 666 not the pair', () => {
    const year4 = NMJL_2026_PATTERNS.find((p) => p.title.includes('22 00 222 666 NEWS'))!
    const n369 = NMJL_2026_PATTERNS.find((p) => p.section === '369' && p.cardHandCode === '4')!
    const hand: TileInstance[] = [
      tile({ cat: 'suit', suit: 'crak', rank: 5 }, 'c5'),
      tile({ cat: 'suit', suit: 'crak', rank: 6 }, 'c6'),
      tile({ cat: 'suit', suit: 'crak', rank: 9 }, 'c9'),
      tile({ cat: 'suit', suit: 'dot', rank: 1 }, 'd1a'),
      tile({ cat: 'suit', suit: 'dot', rank: 1 }, 'd1b'),
      tile({ cat: 'suit', suit: 'dot', rank: 2 }, 'd2'),
      tile({ cat: 'dragon', dragon: 'green' }, 'g'),
      tile({ cat: 'dragon', dragon: 'red' }, 'r'),
      tile({ cat: 'wind', wind: 'N' }, 'n1'),
      tile({ cat: 'wind', wind: 'N' }, 'n2'),
      tile({ cat: 'wind', wind: 'S' }, 's'),
    ]
    const expA = tile({ cat: 'suit', suit: 'bam', rank: 6 }, 'b6a')
    const expB = tile({ cat: 'suit', suit: 'bam', rank: 6 }, 'b6b')
    const expJ = tile({ cat: 'joker' }, 'j')
    const melds = [{ tiles: [expA, expB, expJ] }]
    const exposureIds = new Set([expA.id, expB.id, expJ.id])
    const rackDisplay = [...hand, expA, expB, expJ]
    const rackMatch = tileInstancesWithClaimMeldJokersResolved(hand, melds)

    const slotsFor = (p: (typeof year4)) => {
      const detail = greedyPatternMatchDetail(rackMatch, p, { exposureTileIds: exposureIds })
      const bestIds = computeRackPatternHighlightIds(rackMatch, p, detail, exposureIds)
      return buildSuggestedStripSlots(
        p,
        rackDisplay,
        detail.usedOrder,
        bestIds,
        detail.usedMeta,
        exposureIds,
        melds,
      )
    }

    const yearSlots = slotsFor(year4)
    const yearLabs = yearSlots.map(
      (s) => `${label(s.displayDef)}${s.exposureMeldId != null ? '*' : ''}`,
    )
    expect(yearLabs.join(' ')).toContain('6b* 6b* 6b*')
    expect(yearSlots.filter((s) => s.exposureMeldId != null)).toHaveLength(3)

    // Claim remapping parks the pung on 666 (not the 66 pair).
    const n369Slots = slotsFor(n369)
    const n369Labs = n369Slots.map(
      (s) => `${label(s.displayDef)}${s.exposureMeldId != null ? '*' : ''}`,
    )
    expect(n369Labs.join(' ')).toContain('6b* 6b* 6b*')
    expect(n369Slots.filter((s) => s.exposureMeldId != null)).toHaveLength(3)
    const pair6 = n369Slots.filter(
      (s) =>
        s.displayDef.cat === 'suit' &&
        s.displayDef.rank === 6 &&
        s.exposureMeldId == null,
    )
    expect(pair6.length).toBeLessThanOrEqual(2)
    expect(pair6.every((s) => s.exposureMeldId == null)).toBe(true)
  })
})
