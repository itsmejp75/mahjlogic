import type { TileInstance } from '../mahjong/types'

export type BotSeat = 'East' | 'South' | 'West' | 'North'

/** Exposed tiles on a bot rack (calls, joker swaps, etc.). */
export type BotExposure = {
  seat: BotSeat
  tiles: TileInstance[]
  claimType: 'pung' | 'kong' | 'quint' | 'sextet'
}
