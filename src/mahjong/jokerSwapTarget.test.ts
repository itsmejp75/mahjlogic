import { describe, expect, it } from 'vitest'
import type { BotExposure } from '../analysis/types'
import type { TileDef, TileInstance } from './types'
import {
  botSeatSwapDropId,
  collectSwappableJokerTileIds,
  findNextBotJokerSwapTarget,
  findNextJokerSwapTarget,
  parseBotSeatSwapDropId,
  topBandDropFrameForOverId,
} from './jokerSwapTarget'

function tile(id: string, def: TileDef): TileInstance {
  return { id, def }
}

const crak4: TileDef = { cat: 'suit', suit: 'crak', rank: 4 }
const joker: TileDef = { cat: 'joker' }
const dragonR: TileDef = { cat: 'dragon', dragon: 'red' }

describe('joker swap against East-seated bots', () => {
  const eastBotExposure: BotExposure = {
    seat: 'East',
    claimType: 'pung',
    tiles: [tile('e-4a', crak4), tile('e-j', joker), tile('e-4b', crak4)],
  }
  const southBotExposure: BotExposure = {
    seat: 'South',
    claimType: 'kong',
    tiles: [tile('s-r1', dragonR), tile('s-j1', joker), tile('s-j2', joker), tile('s-r2', dragonR)],
  }

  it('parses East seat drop ids (random seat tables)', () => {
    expect(botSeatSwapDropId('East')).toBe('bot-seat-swap-east')
    expect(parseBotSeatSwapDropId('bot-seat-swap-east')).toBe('East')
    expect(parseBotSeatSwapDropId('bot-seat-swap-south')).toBe('South')
  })

  it('finds a matching natural against an East bot exposure', () => {
    const pick = findNextBotJokerSwapTarget([eastBotExposure, southBotExposure], crak4)
    expect(pick).toEqual({
      rack: 'bot',
      exposureIdx: 0,
      jokerTileId: 'e-j',
    })
  })

  it('includes East bots in Swap-button target resolution', () => {
    const pick = findNextJokerSwapTarget([eastBotExposure, southBotExposure], [], crak4)
    expect(pick?.jokerTileId).toBe('e-j')
  })

  it('still lights swappable jokers on East bots for rack hints', () => {
    const hand = [tile('h-4', crak4)]
    const ids = collectSwappableJokerTileIds(hand, null, [eastBotExposure], [])
    expect(ids.has('e-j')).toBe(true)
  })

  it('maps drop-over ids to the top-band glow frame', () => {
    expect(topBandDropFrameForOverId('bot-seat-swap-east')).toBe('joker-swap')
    expect(topBandDropFrameForOverId('bot-exp-swap-0')).toBe('joker-swap')
    expect(topBandDropFrameForOverId('blank-exchange-tracker')).toBe('blank-exchange')
    expect(topBandDropFrameForOverId('hand-bank')).toBeNull()
  })
})
