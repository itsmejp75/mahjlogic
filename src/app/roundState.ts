/** Shared round state types for App + play-surface DnD. */
import type { BotExposure, BotSeat } from '../analysis/types'
import type { CharlestonPhase } from '../mahjong/charleston'
import type { HandTileFlyIn } from '../mahjong/handTileFlyIn'
import type { DeadHandReason } from '../mahjong/deadHandReason'
import type { PassSlots } from '../mahjong/passTargets'
import type { BotSlotSeats } from '../mahjong/seats'
import type { DiscardEntry, EastExposure, Seat, TileDef, TileInstance } from '../mahjong/types'
import type { MainPhase } from './playSurfaceUi'

export type BotTurnBanner = {
  callerBotIndex: 0 | 1 | 2
  calledDef: TileDef
  /** Bot seat (0=South, 1=West, 2=North) that threw the tile; null when the player threw. */
  discarderBotIndex: 0 | 1 | 2 | null
}

export type RoundState = {
  hand: TileInstance[]
  bots: [TileInstance[], TileInstance[], TileInstance[]]
  /** Compass seat the human plays this hand (UI stays at the bottom). */
  playerSeat: Seat
  /** Compass seat at each bot UI slot (right / across / left). */
  botSlotSeats: BotSlotSeats
  wall: TileInstance[]
  /** Wall length right after opening deal — drives the rack wall-heat meter for this hand. */
  openingWallTileCount: number
  passSlots: PassSlots
  selectedHandTileId: string | null
  charlestonPhase: CharlestonPhase
  charlestonSkippedSecondRound: boolean
  awaitingSecondCharlestonChoice: boolean
  mainPhase: MainPhase
  discardPile: DiscardEntry[]
  /** Id of the most recent tile added to East's hand (draw or discard claim); shown with a green ring. */
  drawnTileId: string | null
  /** Index (0=South, 1=West, 2=North) of the bot whose discard is awaiting a Call (claim) decision. */
  activeBotIndex: number | null
  /** The tile the active bot just discarded; player can Call to claim it or skip. */
  activeBotDiscard: TileInstance | null
  /** Narration when the live discard came from a bot-on-bot claim (East had skipped the prior discard). */
  botTurnBanner: BotTurnBanner | null
  /** East's face-up melds accumulated this round. */
  eastExposures: EastExposure[]
  /** Bot face-up melds (calls on East's discards). */
  botExposures: BotExposure[]
  /** Tile removed from hand, awaiting Discard — main game East only. */
  pendingEastDiscardTile: TileInstance | null
  /** Original hand index of pendingEastDiscardTile — used to restore position on return. */
  pendingEastDiscardIdx: number | null
  /** Original hand indices of each pass-slot tile — used to restore position on return. */
  passSlotOrigins: [number | null, number | null, number | null]
  /** After each Charleston receive: hand tile ids not present before that pass (thin white edge line until next pass). */
  charlestonNewTileIds: string[]
  /**
   * One-shot fly-in toward the rack for tiles in `ids` (cleared after animation).
   * Opening deal uses `from: 'across'` so every hand tile drops in from above its slot.
   */
  handTileFlyIn: HandTileFlyIn | null
  /**
   * One hand tile id: play the wall-draw keyframes from **below** that rack slot (same as call tiles
   * into exposure). Set when a joker is redeemed from the table into your hand; cleared after the fly.
   */
  handJokerSwapFlyInFromBelowId: string | null
  /**
   * One exposure tile id: play the drop-in from **below** that rack slot when a natural replaces an
   * exposed joker during joker swap. Cleared after the fly.
   */
  exposureJokerSwapFlyInTileId: string | null
  /** Ids of hand tiles the player has selected to join the staged call meld (call-staging phase only). */
  stagedCallTileIds: string[]
  /**
   * After committing a claim (pung/kong/quint) while East is still in east-discard (has not
   * discarded): id of the called tile in the meld the player may tap to re-enter call-staging
   * and change non-called tiles. Cleared when East’s discard is committed.
   */
  callAmendableAfterClaimTileId: string | null
  /** Legacy call-amend fields kept null for older saved rounds. */
  callAmendFromBotIndex: 0 | 1 | 2 | null
  /** Non-null when a bot won. Drives the bot-mahjong end screen. */
  botWin:
    | ({ botIndex: 0 | 1 | 2 } & (
        | { how: 'self-draw'; tile: TileDef }
        | { how: 'called-discard'; tile: TileDef; discardFrom: Seat | BotSeat }
      ))
    | null
  /** How the player won Mah Jongg (set when mainPhase becomes 'mahjong-declared'). */
  playerWinMethod:
    | { type: 'self-draw'; tile: TileDef }
    | { type: 'called-discard'; botLabel: BotSeat; tile: TileDef }
    | null
  /** Set when mainPhase becomes 'dead-hand' — drives the end-game explanation. */
  deadHandReason: DeadHandReason | null
}
