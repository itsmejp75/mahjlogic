import { describe, expect, it } from 'vitest'
import { NMJL_2026_PATTERNS } from '../card/nmjl2026Patterns'
import { rankSuggestedHands, suggestedHandShownInPanelList } from './suggestedHands'
import type { TileDef, TileInstance } from '../mahjong/types'

function tile(def: TileDef, id: string): TileInstance {
  return { id, def }
}

function screenshotHand13(): TileInstance[] {
  return [
    tile({ cat: 'suit', suit: 'dot', rank: 1 }, 'd1'),
    tile({ cat: 'suit', suit: 'crak', rank: 7 }, 'c7'),
    tile({ cat: 'suit', suit: 'crak', rank: 1 }, 'c1'),
    tile({ cat: 'suit', suit: 'dot', rank: 9 }, 'd9h'),
    tile({ cat: 'suit', suit: 'crak', rank: 4 }, 'c4'),
    tile({ cat: 'suit', suit: 'crak', rank: 2 }, 'c2'),
    tile({ cat: 'wind', wind: 'E' }, 'e'),
    tile({ cat: 'suit', suit: 'bam', rank: 2 }, 'b2'),
    tile({ cat: 'wind', wind: 'S' }, 's1'),
    tile({ cat: 'suit', suit: 'bam', rank: 4 }, 'b4'),
    tile({ cat: 'suit', suit: 'crak', rank: 9 }, 'c9'),
    tile({ cat: 'wind', wind: 'S' }, 's2'),
    tile({ cat: 'suit', suit: 'dot', rank: 8 }, 'd8'),
  ]
}

describe('suggested hands ranking rack', () => {
  const year4 = NMJL_2026_PATTERNS.find((p) => p.title.includes('22 00 222 666 NEWS'))!

  it('does not treat a staged discard as part of the ranking rack', () => {
    const hand13 = screenshotHand13()
    const pending9 = tile({ cat: 'suit', suit: 'dot', rank: 9 }, 'd9p')

    const rank = (hand: TileInstance[], wall: number, discards: TileInstance[]) =>
      rankSuggestedHands({
        hand,
        wallRemaining: wall,
        discards,
        exposures: [],
        playerClaimMelds: [],
        patterns: NMJL_2026_PATTERNS,
      })

    const line = (rows: ReturnType<typeof rankSuggestedHands>) => rows.find((l) => l.id === year4.id)!

    const concealedOnly = rank(hand13, 39, [])
    const withStagedDiscard = rank([...hand13, pending9], 39, [])

    // Staging a discard must not lower completion % vs the concealed 13-tile rack alone.
    expect(line(withStagedDiscard).completionProbability).toBeLessThanOrEqual(
      line(concealedOnly).completionProbability,
    )

    // Visibility in the panel must not depend on which discard is staged.
    expect(suggestedHandShownInPanelList(line(withStagedDiscard), null)).toBe(
      suggestedHandShownInPanelList(line(concealedOnly), null),
    )
  })
})
