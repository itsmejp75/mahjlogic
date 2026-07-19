/**
 * Stable PlaySurface prop builders — keep coach / rack / action-bar object identities
 * stable across App overlay/settings re-renders so memo(PlaySurface) can bail.
 */
import type { ReactNode } from 'react'
import type { PassStripFlyOutFrom } from '../components/PassStrip'
import { discardedDefsForBlankExchange } from '../mahjong/blankExchange'
import type { PassSlots } from '../mahjong/passTargets'
import type { DiscardEntry, TileDef, TileInstance } from '../mahjong/types'
import type { HandTileFlyIn } from '../mahjong/handTileFlyIn'
import type { MainPhase } from './playSurfaceUi'

export type SuggestedTileGuide = {
  bestIds: ReadonlySet<string>
  blankExchangeIds?: ReadonlySet<string>
} | null

export type SuggestedDeadTileGuide = {
  deadIds: ReadonlySet<string>
  skullIds: ReadonlySet<string>
} | null

export type PlaySurfaceCoachProps = {
  suggestedTileGuideForRack: SuggestedTileGuide
  suggestedDeadTileGuideForRack: SuggestedDeadTileGuide
  botExposureSuggestedTileGuide: { bestIds: ReadonlySet<string> } | null
  botExposureDeadIds: ReadonlySet<string> | null
  suggestedDiscardTrackerNeedDefs: readonly TileDef[] | null
  jokerSwapHintBounceIds: { hand: ReadonlySet<string>; jokers: ReadonlySet<string> } | null
  jokerSwapHintBounceEpoch: number
  charlestonGlowTileIds: ReadonlySet<string> | null
  handTileFlyIn: HandTileFlyIn | null
  handJokerSwapFlyInFromBelowId: string | null
  botExposureFlyInTileIds: ReadonlySet<string> | null
  exposureJokerSwapFlyInTileIds: ReadonlySet<string> | null
}

export type PlaySurfaceActionBarProps = {
  showSuggestedHandsPanel: boolean
  suggestedPanelTilesOn: boolean
  showMahjongRackHint: boolean
  mahjongButtonEnabled: boolean
  showJokerSwapRackHint: boolean
  mainBarSharedSlotIsSwap: boolean
  mainGameSwapDisabled: boolean
  mainGameCallDisabled: boolean
  concealedHandReminderEnabled: boolean
  focusedHandIsConcealed: boolean
  mainGamePrimaryIsDone: boolean
  mainGamePrimaryDisabled: boolean
  mainGamePrimaryLabel: string
  mahjongWinReviewing: boolean
  undoEnabled: boolean
  canUndo: boolean
}

export type PlaySurfaceSeatLabelProps = {
  playerSeatLabelActiveTurn: boolean
  playerSeatLabelCalledThrower: boolean
}

export function buildPlayerSeatLabelProps(args: {
  charlestonDone: boolean
  mainPhase: MainPhase
  botTurnBannerDiscarderBotIndex: number | null | undefined
  botTurnBannerPresent: boolean
}): PlaySurfaceSeatLabelProps {
  const { charlestonDone, mainPhase, botTurnBannerDiscarderBotIndex, botTurnBannerPresent } =
    args
  const playerSeatLabelActiveTurn = (() => {
    if (
      mainPhase === 'wall-game' ||
      mainPhase === 'mahjong-declared' ||
      mainPhase === 'bot-mahjong' ||
      mainPhase === 'dead-hand'
    ) {
      return false
    }
    if (!charlestonDone) return true
    return mainPhase === 'east-discard' || mainPhase === 'call-staging'
  })()

  const playerSeatLabelCalledThrower =
    charlestonDone &&
    mainPhase === 'bot-turn' &&
    botTurnBannerPresent &&
    botTurnBannerDiscarderBotIndex === null

  return { playerSeatLabelActiveTurn, playerSeatLabelCalledThrower }
}

export function buildPlaySurfaceActionBarProps(args: {
  charlestonDone: boolean
  mainPhase: MainPhase
  activeBotDiscard: TileInstance | null
  jokerSwapUiActive: boolean
  hand: readonly TileInstance[]
  pendingEastDiscardTile: TileInstance | null
  blankTilesEnabled: boolean
  discardPile: readonly DiscardEntry[]
  showCallStagingDoneButton: boolean
  canCommitStagedCallDone: boolean
  jokerSwapHintTargetIds: unknown
  showMahjongRackHint: boolean
  showSuggestedHandsPanel: boolean
  suggestedPanelTilesOn: boolean
  concealedHandReminderEnabled: boolean
  focusedHandIsConcealed: boolean
  mahjongWinReviewing: boolean
  undoEnabled: boolean
  canUndo: boolean
}): PlaySurfaceActionBarProps {
  const {
    charlestonDone,
    mainPhase,
    activeBotDiscard,
    jokerSwapUiActive,
    hand,
    pendingEastDiscardTile,
    blankTilesEnabled,
    discardPile,
    showCallStagingDoneButton,
    canCommitStagedCallDone,
    jokerSwapHintTargetIds,
    showMahjongRackHint,
    showSuggestedHandsPanel,
    suggestedPanelTilesOn,
    concealedHandReminderEnabled,
    focusedHandIsConcealed,
    mahjongWinReviewing,
    undoEnabled,
    canUndo,
  } = args

  const mainGameCallDisabled = mainPhase !== 'bot-turn' || !activeBotDiscard
  const mainBarSharedSlotIsSwap = jokerSwapUiActive || mainPhase === 'east-discard'
  const hasBlankForExchange =
    hand.some((t) => t.def.cat === 'blank') || pendingEastDiscardTile?.def.cat === 'blank'
  const mainGameSwapDisabled =
    !jokerSwapUiActive &&
    !(
      charlestonDone &&
      mainPhase === 'east-discard' &&
      blankTilesEnabled &&
      hasBlankForExchange &&
      discardedDefsForBlankExchange(discardPile).length > 0
    )
  const mahjongButtonEnabled =
    charlestonDone &&
    (mainPhase === 'east-discard' ||
      ((mainPhase === 'bot-turn' || mainPhase === 'call-staging') && !!activeBotDiscard))
  const mainGamePrimaryIsDone = mainPhase === 'call-staging' && showCallStagingDoneButton
  const mainGamePrimaryDisabled =
    mainPhase === 'east-discard'
      ? !pendingEastDiscardTile
      : mainPhase === 'call-staging'
        ? mainGamePrimaryIsDone
          ? !canCommitStagedCallDone
          : true
        : mainPhase === 'bot-turn'
          ? !activeBotDiscard
          : true
  const mainGamePrimaryLabel = mainGamePrimaryIsDone
    ? 'Done'
    : mainPhase === 'east-discard' || mainPhase === 'call-staging'
      ? 'Discard'
      : 'Ignore'
  const showJokerSwapRackHint = !!jokerSwapHintTargetIds && mainBarSharedSlotIsSwap

  return {
    showSuggestedHandsPanel,
    suggestedPanelTilesOn,
    showMahjongRackHint,
    mahjongButtonEnabled,
    showJokerSwapRackHint,
    mainBarSharedSlotIsSwap,
    mainGameSwapDisabled,
    mainGameCallDisabled,
    concealedHandReminderEnabled,
    focusedHandIsConcealed,
    mainGamePrimaryIsDone,
    mainGamePrimaryDisabled,
    mainGamePrimaryLabel,
    mahjongWinReviewing,
    undoEnabled,
    canUndo,
  }
}

export type PlaySurfaceCharlestonPassStripProps = {
  slots: PassSlots
  onPassBoxClick: () => void
  onPassTileClickReturn: (slotIndex: number) => void
  flyOutFrom: PassStripFlyOutFrom | null
  inlineHeaderTitle: string | null
  inlineHeaderInstruction: ReactNode
  inlineHeaderInstructionAria: string
}

export type PlaySurfaceRackChromeProps = {
  charlestonPassSortableItems: string[]
  charlestonEastExposureMelds: unknown
  /** Charleston only: PassStrip inputs; PlaySurface injects returningTileId from DnD preview. */
  charlestonPassStrip: PlaySurfaceCharlestonPassStripProps | null
  charlestonHandSortableIds: string[]
  sortableItems: string[]
  eastPlayerExposureRackMelds: unknown
  callMeldInsetCols: number
  eastCallStagedWaveFlyIn: unknown
  eastExposureLastSlotLabel: string | undefined
  eastExposureLastSlotClassName: string | undefined
  eastDiscardLastSlotReplace: ReactNode
  visibleHandTiles: TileInstance[]
  winHandSortedTiles: TileInstance[] | null
}
