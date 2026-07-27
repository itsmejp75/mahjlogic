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

  it('does not raise Prob when a junk tile is moved to the discard tray', () => {
    const hand13 = screenshotHand13()
    const junk = tile({ cat: 'suit', suit: 'dot', rank: 9 }, 'd9p')
    const exposure = {
      tiles: [
        tile({ cat: 'suit', suit: 'bam', rank: 2 }, 'exp-b2a'),
        tile({ cat: 'suit', suit: 'bam', rank: 2 }, 'exp-b2b'),
        tile({ cat: 'joker' }, 'exp-j'),
      ],
    }

    const at14 = rankSuggestedHands({
      hand: [...hand13, junk],
      wallRemaining: 94,
      discards: [],
      exposures: [],
      playerClaimMelds: [exposure],
      patterns: NMJL_2026_PATTERNS,
    })
    const staged = rankSuggestedHands({
      hand: hand13,
      wallRemaining: 94,
      discards: [],
      exposures: [],
      playerClaimMelds: [exposure],
      pendingDiscardTile: junk,
      patterns: NMJL_2026_PATTERNS,
    })

    const pick = (rows: ReturnType<typeof rankSuggestedHands>) =>
      rows.find((l) => l.tilesNeededRough === rows[0]?.tilesNeededRough) ?? rows[0]!

    expect(pick(staged).completionProbability).toBe(pick(at14).completionProbability)
  })
})
