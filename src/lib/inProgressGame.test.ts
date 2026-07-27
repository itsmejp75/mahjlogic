import { describe, expect, it } from 'vitest'
import type { RoundState } from '../app/roundState'
import {
  buildInProgressSnapshot,
  isResumableSnapshot,
  parseInProgressSnapshot,
  sanitizeRoundForSave,
} from './inProgressGame'

function minimalRound(over: Partial<RoundState> = {}): RoundState {
  return {
    hand: [{ id: 't1', def: { cat: 'suit', suit: 'bam', rank: 1 } }],
    bots: [[], [], []],
    playerSeat: 'east',
    botSlotSeats: ['south', 'west', 'north'],
    wall: [{ id: 'w1', def: { cat: 'suit', suit: 'dot', rank: 2 } }],
    openingWallTileCount: 99,
    passSlots: [null, null, null],
    selectedHandTileId: null,
    charlestonPhase: 'across1',
    charlestonSkippedSecondRound: false,
    awaitingSecondCharlestonChoice: false,
    mainPhase: 'east-discard',
    discardPile: [],
    drawnTileId: null,
    activeBotIndex: null,
    activeBotDiscard: null,
    botTurnBanner: null,
    eastExposures: [],
    botExposures: [],
    pendingEastDiscardTile: null,
    pendingEastDiscardIdx: null,
    passSlotOrigins: [null, null, null],
    charlestonNewTileIds: [],
    handTileFlyIn: { ids: ['t1'], from: 'across' },
    handJokerSwapFlyInFromBelowId: 'x',
    exposureJokerSwapFlyInTileId: 'y',
    stagedCallTileIds: [],
    callAmendableAfterClaimTileId: null,
    callAmendFromBotIndex: null,
    botWin: null,
    playerWinMethod: null,
    deadHandReason: null,
    ...over,
  }
}

describe('inProgressGame', () => {
  it('strips fly-in fields on sanitize', () => {
    const s = sanitizeRoundForSave(minimalRound())
    expect(s.handTileFlyIn).toBeNull()
    expect(s.handJokerSwapFlyInFromBelowId).toBeNull()
    expect(s.exposureJokerSwapFlyInTileId).toBeNull()
  })

  it('round-trips a resumable snapshot through JSON', () => {
    const snap = buildInProgressSnapshot({
      clientRoundId: 'round-1',
      round: minimalRound(),
      settings: {
        cardId: '2026',
        botDifficulty: 'normal',
        botWinsEnabled: true,
        tenJokersEnabled: false,
        blankTilesEnabled: false,
        blankTileCount: 2,
        playAsEastEnabled: true,
      },
      openingDeck: null,
      openingMeta: null,
    })
    expect(snap).not.toBeNull()
    const parsed = parseInProgressSnapshot(JSON.parse(JSON.stringify(snap)))
    expect(isResumableSnapshot(parsed)).toBe(true)
    expect(parsed?.clientRoundId).toBe('round-1')
    expect(parsed?.round.handTileFlyIn).toBeNull()
  })

  it('rejects terminal hands', () => {
    const snap = buildInProgressSnapshot({
      clientRoundId: 'round-1',
      round: minimalRound({ mainPhase: 'wall-game' }),
      settings: {
        cardId: '2026',
        botDifficulty: 'normal',
        botWinsEnabled: true,
        tenJokersEnabled: false,
        blankTilesEnabled: false,
        blankTileCount: 2,
        playAsEastEnabled: true,
      },
      openingDeck: null,
      openingMeta: null,
    })
    expect(snap).toBeNull()
  })
})
