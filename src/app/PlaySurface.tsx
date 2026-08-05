/**
 * Memoized play surface: DndContext + rack / discard tracker / drag overlay.
 * Owns play DnD (sensors, blank exchange, drag previews). App passes round slice + stable handlers.
 */
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type KeyboardEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from 'react'
import {
  DndContext,
  DragOverlay,
} from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
import { SortableHand } from '../components/SortableHand'
import { HandBank } from '../components/HandBank'
import { PassStrip } from '../components/PassStrip'
import { TileFace } from '../components/TileFace'
import { ExposureRack } from '../components/ExposureRack'
import { WallTilesRemainCell } from '../components/WallTilesRemainCell'
import { SuggestedHandsDndFrame } from './SuggestedHandsTrayContext'
import {
  BlankExchangeDropZone,
  BlankExchangeOverlay,
  CallInitiateFirstEmptyTarget,
  DiscardPileDropZone,
  DiscardTrackerSlotGrid,
  EastOwnJokerSwapDropZone,
  HandRackMenuAnchor,
  PlayerRackSeatLabel,
  StagingMeldDropZone,
  SuggestedHandsOpenDataAttr,
  SuggestedHandsTrayToggleButton,
  type MainPhase,
  type PostGameBotReviewRackRow,
} from './playSurfaceUi'
import type { BotExposure, BotSeat } from '../analysis/types'
import type { DiscardEntry, EastExposure, Seat, TileInstance } from '../mahjong/types'
import type { HandTileFlyInFrom } from '../mahjong/handTileFlyIn'
import type { PassSlots } from '../mahjong/passTargets'
import { seatLabel, type BotSlotSeats } from '../mahjong/seats'
import {
  charlestonPassButtonLabel,
  charlestonPassDirections,
  type CharlestonPhase,
} from '../mahjong/charleston'
import mahjLogoSrc from '../assets/mahj-logo.svg?url'
import { RackActionAuroraBorder } from '../components/RackActionAuroraBorder'
import type { RoundState } from './roundState'
import {
  usePlaySurfaceDnD,
  type PlaySurfaceDnDApi,
} from './usePlaySurfaceDnD'
import { usePlayerSeatLabelLayout } from './usePlayerSeatLabelLayout'
import type {
  PlaySurfaceActionBarProps,
  PlaySurfaceCoachProps,
  PlaySurfaceRackChromeProps,
  PlaySurfaceSeatLabelProps,
} from './playSurfaceViewProps'

function wallRemainHeatStyle(
  wallLen: number,
  openingWallLen: number,
): CSSProperties | undefined {
  if (wallLen >= openingWallLen || wallLen === 0 || openingWallLen <= 1) return undefined
  return {
    '--wall-t': String(Math.max(0, Math.min(1, wallLen / (openingWallLen - 1)))),
  } as CSSProperties
}

/**
 * MahJ action control. Latches pressed-in (+ hint aurora) on pointerdown so the
 * chrome does not pop out between pointerup (clears btn--pointer-down) and the
 * React commit that applies win-lit / pressed-in.
 */
function MahjongRackActionButton({
  enabled,
  showHint,
  winGlyphLit,
  onDeclare,
}: {
  enabled: boolean
  showHint: boolean
  winGlyphLit: boolean
  onDeclare: () => void
}) {
  const [pressLatch, setPressLatch] = useState(false)
  const [auroraLatch, setAuroraLatch] = useState(false)
  const winGlyphLitRef = useRef(winGlyphLit)
  winGlyphLitRef.current = winGlyphLit

  useEffect(() => {
    if (!winGlyphLit) return
    // Win chrome owns the look; drop transient gesture latches.
    setPressLatch(false)
    setAuroraLatch(false)
  }, [winGlyphLit])

  useEffect(() => {
    if (enabled || winGlyphLit) return
    setPressLatch(false)
    setAuroraLatch(false)
  }, [enabled, winGlyphLit])

  const clearLatchIfNotWon = useCallback(() => {
    // Wait for click + commit so a successful declare keeps continuous chrome.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (winGlyphLitRef.current) return
        setPressLatch(false)
        setAuroraLatch(false)
      })
    })
  }, [])

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (!enabled) return
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* ignore — capture is best-effort for drag-off release */
      }
      setPressLatch(true)
      if (showHint) setAuroraLatch(true)
    },
    [enabled, showHint],
  )

  const showPressedIn = winGlyphLit || pressLatch
  const showAurora = winGlyphLit || showHint || auroraLatch
  const showHintClass = (showHint || auroraLatch) && !winGlyphLit

  return (
    <button
      type="button"
      className={[
        'btn btn--mahjong rack-bottom-tile-cell rack-bottom-tile-cell--c5-6',
        showHintClass ? 'btn--mahjong-hint' : '',
        winGlyphLit ? 'btn--mahjong-win-lit' : '',
        showPressedIn ? 'btn--mahjong-rack-pressed-in' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={!enabled}
      aria-label="Mah Jongg"
      onPointerDown={onPointerDown}
      onPointerUp={clearLatchIfNotWon}
      onPointerCancel={clearLatchIfNotWon}
      onClick={onDeclare}
    >
      {showAurora ? <RackActionAuroraBorder /> : null}
      <span className="btn--mahj__logo-stack">
        <span className="btn--mahj__logo-stack__well" aria-hidden />
        <img className="btn--mahj__img" src={mahjLogoSrc} alt="" draggable={false} />
      </span>
    </button>
  )
}

export type { PlaySurfaceDnDApi }

export type PlaySurfaceProps = {
  animationsEnabled: boolean
  jokerSwapHintEnabled: boolean
  /** Dock-bounce CSS/JS wait before the joker-swap hint animation starts. */
  jokerSwapHintBounceDelayMs: number
  jokerSwapHandHintSingleBounce: boolean
  botHandsIdentifierEnabled: boolean
  botHandsIdentifierFocusSeat: BotSeat | null
  onBotExposureRowClick: (seat: BotSeat) => void
  /** Keep MahJ logo lit in brand cyan through the win / Review. */
  mahjongWinGlyphLit?: boolean

  charlestonDone: boolean
  mainPhase: MainPhase
  charlestonPhase: CharlestonPhase
  showPlaySplitRow: boolean

  displayedDiscardPile: readonly DiscardEntry[]
  botExposures: BotExposure[]
  /** After Review/Menu: full-hand lit/dim dump into opponent exposure rails. */
  postGameBotReviewRacks?: readonly PostGameBotReviewRackRow[] | null
  activeBotIndex: number | null
  botTurnBannerDiscarderBotIndex: number | null
  jokerSwapUiActive: boolean
  blankTilesEnabled: boolean
  botSlotSeats: BotSlotSeats

  handPanelRef: RefObject<HTMLElement | null>
  topDiscardTrackerPanelRef: RefObject<HTMLElement | null>
  eastExposureRackTopRef: RefObject<HTMLDivElement | null>
  playerHandRackBottomRef: RefObject<HTMLDivElement | null>
  discardTrackerPanelRef: RefObject<HTMLElement | null>
  discardPileScrollElRef: { current: HTMLDivElement | null }
  menuContainerRef: RefObject<HTMLDivElement | null>
  handPanelCqwFrozenRef: MutableRefObject<boolean>
  refreshHandPanelCqwRef: MutableRefObject<() => void>
  dndApiRef: MutableRefObject<PlaySurfaceDnDApi | null>

  playerSeat: Seat
  seatLabel: PlaySurfaceSeatLabelProps
  hasPlayerExposures: boolean

  hand: TileInstance[]
  wall: TileInstance[]
  openingWallTileCount: number
  selectedHandTileId: string | null
  drawnTileId: string | null
  passSlots: PassSlots
  pendingEastDiscardTile: TileInstance | null
  stagedCallTileIds: readonly string[]
  eastExposures: readonly EastExposure[]

  coach: PlaySurfaceCoachProps
  rackChrome: PlaySurfaceRackChromeProps
  actionBar: PlaySurfaceActionBarProps

  activeBotDiscard: TileInstance | null
  incomingBotDiscardFlyFrom: HandTileFlyInFrom | null
  passReady: boolean

  suggestedHandsPopup: ReactNode

  pushRound: (updater: (prev: RoundState) => RoundState) => void
  updateRound: (updater: (prev: RoundState) => RoundState) => void
  setPendingJokerSwapTileId: Dispatch<SetStateAction<string | null>>
  setCharlestonPassError: Dispatch<SetStateAction<string | null>>
  applyToggleStagedCallTile: (r: RoundState, tileId: string) => RoundState
  applyEastNaturalForExposedJoker: (
    r: RoundState,
    p: { rack: 'bot' | 'east'; exposureIdx: number; jokerTileId: string; eastTileId: string },
  ) => RoundState

  onHandTileActivate: (id: string) => void
  sortHand: () => void
  newHand: () => void
  declareMahjong: () => void
  onSuggestedTilesButtonClick: () => void
  onSuggestedTilesButtonPointerDown: () => void
  onSuggestedTilesButtonPointerUpOrLeave: () => void
  onCharlestonPassButtonClick: () => void
  undoAction: () => void
  executeSwapFromSlot: () => void
  initiateCall: () => void
  commitStagedCall: () => void
  commitEastDiscard: () => void
  skipBotDiscard: () => void
}

function PlaySurfaceInner(p: PlaySurfaceProps) {
  const {
    animationsEnabled,
    jokerSwapHintEnabled,
    jokerSwapHintBounceDelayMs,
    jokerSwapHandHintSingleBounce,
    botHandsIdentifierEnabled,
    botHandsIdentifierFocusSeat,
    onBotExposureRowClick,
    mahjongWinGlyphLit = false,
    charlestonDone,
    mainPhase,
    charlestonPhase,
    showPlaySplitRow,
    displayedDiscardPile,
    botExposures,
    postGameBotReviewRacks = null,
    activeBotIndex,
    botTurnBannerDiscarderBotIndex,
    jokerSwapUiActive,
    blankTilesEnabled,
    botSlotSeats,
    handPanelRef,
    topDiscardTrackerPanelRef,
    eastExposureRackTopRef,
    playerHandRackBottomRef,
    discardTrackerPanelRef,
    discardPileScrollElRef,
    menuContainerRef,
    handPanelCqwFrozenRef,
    refreshHandPanelCqwRef,
    dndApiRef,
    playerSeat,
    seatLabel: seatLabelProps,
    hasPlayerExposures,
    hand,
    wall,
    openingWallTileCount,
    selectedHandTileId,
    drawnTileId,
    passSlots,
    pendingEastDiscardTile,
    stagedCallTileIds,
    eastExposures,
    coach,
    rackChrome,
    actionBar,
    activeBotDiscard,
    incomingBotDiscardFlyFrom,
    passReady,
    suggestedHandsPopup,
    pushRound,
    updateRound,
    setPendingJokerSwapTileId,
    setCharlestonPassError,
    applyToggleStagedCallTile,
    applyEastNaturalForExposedJoker,
    onHandTileActivate,
    sortHand,
    newHand,
    declareMahjong,
    onSuggestedTilesButtonClick,
    onSuggestedTilesButtonPointerDown,
    onSuggestedTilesButtonPointerUpOrLeave,
    onCharlestonPassButtonClick,
    undoAction,
    executeSwapFromSlot,
    initiateCall,
    commitStagedCall,
    commitEastDiscard,
    skipBotDiscard,
  } = p

  const {
    sensors,
    tileDragCollisionDetection,
    onDragStart,
    onDragOver,
    onDragCancel,
    onDragEnd,
    dragOverlayTile,
    dragOverlayMeldTiles,
    dragOverlayRackSuitStacked,
    topBandDropFrame,
    blankExchangeDragArmed,
    blankExchangeOpen,
    closeBlankExchange,
    performBlankExchange,
    charlestonPassIntoHandPreview,
    charlestonHandPassStageTileId,
    eastDiscardIntoHandPreview,
    incomingBotDiscardCallDragActive,
  } = usePlaySurfaceDnD({
    charlestonDone,
    mainPhase,
    hand,
    passSlots,
    pendingEastDiscardTile,
    activeBotDiscard,
    stagedCallTileIds,
    botExposures,
    eastExposures,
    jokerSwapUiActive,
    pushRound,
    updateRound,
    setPendingJokerSwapTileId,
    setCharlestonPassError,
    applyToggleStagedCallTile,
    applyEastNaturalForExposedJoker,
    initiateCall,
    handPanelCqwFrozenRef,
    refreshHandPanelCqwRef,
    dndApiRef,
  })

  const {
    suggestedTileGuideForRack,
    suggestedDeadTileGuideForRack,
    botExposureSuggestedTileGuide,
    botExposureDeadIds,
    suggestedDiscardTrackerNeedDefs,
    jokerSwapHintBounceIds,
    jokerSwapHintBounceEpoch,
    charlestonGlowTileIds,
    handTileFlyIn,
    handJokerSwapFlyInFromBelowId,
    botExposureFlyInTileIds,
    exposureJokerSwapFlyInTileIds,
  } = coach

  const {
    charlestonPassSortableItems,
    charlestonEastExposureMelds,
    charlestonPassStrip,
    charlestonHandSortableIds,
    sortableItems,
    eastPlayerExposureRackMelds,
    callMeldInsetCols,
    eastCallStagedWaveFlyIn,
    winHandFlyInTileIds,
    winHandFlyInOriginByTileId,
    winHandFlyWave,
    winHandDumpOnExposure,
    eastExposureLastSlotLabel,
    eastExposureLastSlotClassName,
    eastDiscardLastSlotReplace,
    visibleHandTiles,
  } = rackChrome

  usePlayerSeatLabelLayout({
    playerHandRackBottomRef,
    topDiscardTrackerPanelRef,
    eastExposureRackTopRef,
    charlestonDone,
    mainPhase,
    showPlaySplitRow,
    callMeldInsetCols,
    hasPlayerExposures,
    handLength: hand.length,
    incomingBotDiscardCallDragActive,
  })

  const charlestonPassPhantomTile = useMemo(() => {
    if (!charlestonPassIntoHandPreview) return null
    return passSlots.find((s) => s?.id === charlestonPassIntoHandPreview.tileId) ?? null
  }, [charlestonPassIntoHandPreview, passSlots])

  const charlestonPassIntoHandPreviewIndex =
    charlestonPassIntoHandPreview?.handPreviewIndex ?? null
  const eastDiscardIntoHandPreviewIndex =
    eastDiscardIntoHandPreview?.handPreviewIndex ?? null

  const charlestonExposureTrailingSuffix = useMemo(() => {
    if (!charlestonPassStrip) return null
    return (
      <PassStrip
        variant="inlineTail"
        slots={charlestonPassStrip.slots}
        onPassBoxClick={charlestonPassStrip.onPassBoxClick}
        onPassTileClickReturn={charlestonPassStrip.onPassTileClickReturn}
        suggestedBestIds={suggestedTileGuideForRack?.bestIds}
        flyOutFrom={charlestonPassStrip.flyOutFrom}
        hiddenSortableTileId={null}
        returningTileId={charlestonPassIntoHandPreview?.tileId ?? null}
        inlineHeaderTitle={charlestonPassStrip.inlineHeaderTitle}
        inlineHeaderInstruction={charlestonPassStrip.inlineHeaderInstruction}
        inlineHeaderInstructionAria={charlestonPassStrip.inlineHeaderInstructionAria}
      />
    )
  }, [charlestonPassStrip, suggestedTileGuideForRack, charlestonPassIntoHandPreview?.tileId])

  const {
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
  } = actionBar

  const {
    cardId: seatLabelCardId,
    playerSeatLabelActiveTurn,
    playerSeatLabelCalledThrower,
  } = seatLabelProps

  const onDiscardPileContainerNode = useCallback(
    (node: HTMLDivElement | null) => {
      discardPileScrollElRef.current = node
    },
    [discardPileScrollElRef],
  )

  const onPrimaryActionClick = useCallback(() => {
    if (mainGamePrimaryIsDone) commitStagedCall()
    else if (mainPhase === 'east-discard') commitEastDiscard()
    else if (mainPhase === 'bot-turn') skipBotDiscard()
  }, [
    mainGamePrimaryIsDone,
    mainPhase,
    commitStagedCall,
    commitEastDiscard,
    skipBotDiscard,
  ])

  const onUndoClick = useCallback(() => {
    undoAction()
  }, [undoAction])

  const onUndoKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        undoAction()
      }
    },
    [undoAction],
  )

  const callInitiateFirstEmptyOverride = useMemo(() => {
    if (
      !(
        charlestonDone &&
        mainPhase === 'bot-turn' &&
        activeBotDiscard &&
        incomingBotDiscardCallDragActive
      )
    ) {
      return undefined
    }
    return <CallInitiateFirstEmptyTarget />
  }, [charlestonDone, mainPhase, activeBotDiscard, incomingBotDiscardCallDragActive])

  /** Call-initiate drop slot conflicts with the default above-rack seat label — hide until drag ends. */
  const hidePlayerSeatLabelForCallSlot =
    incomingBotDiscardCallDragActive && !hasPlayerExposures


  return (
      <DndContext
        sensors={sensors}
        collisionDetection={tileDragCollisionDetection}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragCancel={onDragCancel}
        onDragEnd={onDragEnd}
      >
      <div
        className="app-layout"
        data-animations={animationsEnabled ? 'on' : 'off'}
        data-mahjong-win-undim={mainPhase === 'mahjong-declared' ? 'on' : undefined}
        data-post-game-bot-reveal={postGameBotReviewRacks ? 'on' : undefined}
        data-hand-fly-in={
          animationsEnabled && handTileFlyIn ? handTileFlyIn.from : undefined
        }
        data-joker-swap-hint={jokerSwapHintEnabled ? 'on' : 'off'}
        data-joker-swap-hint-iter={jokerSwapHandHintSingleBounce ? '1' : '4'}
        style={
          {
            '--joker-swap-hint-bounce-delay': `${jokerSwapHintBounceDelayMs}ms`,
          } as CSSProperties
        }
      >
        <div className="app-main">
          <div
            className={[
              'app-main__scroll',
              charlestonDone && mainPhase !== 'east-discard'
                ? ''
                : 'app-main__scroll--collapsed',
            ]
              .filter(Boolean)
              .join(' ')}
          >
          </div>

            <SuggestedHandsDndFrame>
            {showPlaySplitRow ? (
                <div className="app-play-split app-top-exposure-container">
                <div className="app-play-split__left">
                  <section
                    ref={topDiscardTrackerPanelRef}
                    className="panel panel--discard-tracker panel--discard-tracker--top"
                    aria-label="Discard tracker"
                  >
                    <div className="discard-tracker__shell">
                      <div className="discard-tracker__content discard-tracker__content--tile-groups-only">
                        <BlankExchangeDropZone active={!!blankExchangeDragArmed}>
                        <div
                          className={[
                            'discard-tracker__tile-groups-container',
                            topBandDropFrame === 'joker-swap'
                              ? 'discard-tracker__tile-groups-container--drop-frame-joker-swap'
                              : '',
                            topBandDropFrame === 'blank-exchange'
                              ? 'discard-tracker__tile-groups-container--drop-frame-blank-exchange'
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          data-drop-frame={topBandDropFrame ?? undefined}
                        >
                        <DiscardTrackerSlotGrid
                          discardPile={displayedDiscardPile}
                          botExposures={botExposures}
                          mainPhase={mainPhase}
                          activeBotIndex={activeBotIndex}
                          calledThrowerRowIdx={
                            mainPhase === 'call-staging' && activeBotIndex != null
                              ? activeBotIndex
                              : botTurnBannerDiscarderBotIndex
                          }
                          jokerSwapUiActive={jokerSwapUiActive}
                          topBandDropFrame={topBandDropFrame}
                          animationsEnabled={animationsEnabled}
                          botExposureFlyInTileIds={botExposureFlyInTileIds}
                          exposureJokerSwapFlyInTileIds={exposureJokerSwapFlyInTileIds}
                          botExposureSuggestedTileGuide={botExposureSuggestedTileGuide}
                          botExposureDeadIds={
                            botExposureDeadIds
                          }
                          jokerSwapHintBounceTileIds={jokerSwapHintBounceIds?.jokers ?? null}
                          jokerSwapHintBounceEpoch={jokerSwapHintBounceEpoch}
                          blankTilesEnabled={blankTilesEnabled}
                          botHandsIdentifierEnabled={botHandsIdentifierEnabled}
                          botHandsIdentifierFocusSeat={botHandsIdentifierFocusSeat}
                          onBotExposureRowClick={onBotExposureRowClick}
                          suggestedDiscardTrackerNeedDefs={suggestedDiscardTrackerNeedDefs}
                          botSlotSeats={botSlotSeats}
                          postGameBotReviewRacks={postGameBotReviewRacks}
                        />
                        </div>
                        </BlankExchangeDropZone>
                      </div>
                    </div>
                  </section>
                </div>
                </div>
            ) : null}
              <div className="app-rack-stage">
            {/* ── Hand ── */}
            <section ref={handPanelRef} className="panel panel--hand" aria-label={`Your hand, ${seatLabel(playerSeat)}`}>
              <div className="panel-hand-rack">
                <div className="panel-hand-rack__column">
                  {!charlestonDone ? (
                    <>
                      <div className="rack-stage rack-stage--charleston" role="group">
                        <div className="rack-stage__rack-col">
                          <div ref={eastExposureRackTopRef} className="rack-stage__rack-top">
                            <SortableContext items={charlestonPassSortableItems} strategy={rectSortingStrategy}>
                            <ExposureRack
                              className="exposure-rack--charleston-pass"
                              stackSuitTiles
                              melds={charlestonEastExposureMelds as never}
                              suggestedTileGuide={suggestedTileGuideForRack}
                              slotCount={14}
                              reserveTrailingSlots={3}
                              shiftPassStripLeftSlots={playerSeat === 'east' ? 0 : 1}
                              ariaLabel="Your exposures and Charleston pass"
                              trailingSuffix={charlestonExposureTrailingSuffix}
                            />
                            </SortableContext>
                          </div>
                          <div className="panel-hand-rack__hand-tray">
                            <PlayerRackSeatLabel
                              seat={playerSeat}
                              cardId={seatLabelCardId}
                              isActiveTurn={playerSeatLabelActiveTurn}
                              isCalledThrower={playerSeatLabelCalledThrower}
                            />
                            <div ref={playerHandRackBottomRef} className="rack-stage__rack-bottom">
                                <HandBank>
                                  <SortableContext items={charlestonHandSortableIds} strategy={rectSortingStrategy}>
                                  <SortableHand
                                    tiles={hand}
                                    sortableOrder={charlestonHandSortableIds}
                                    charlestonPassPhantomTile={charlestonPassPhantomTile}
                                    externalInsertPreviewIndex={charlestonPassIntoHandPreviewIndex}
                                    passStageTileId={charlestonHandPassStageTileId}
                                    selectedTileId={selectedHandTileId}
                                    onTileActivate={onHandTileActivate}
                                    highlightedTileId={drawnTileId}
                                    charlestonGlowTileIds={charlestonGlowTileIds ?? undefined}
                                    handTileFlyIn={animationsEnabled ? handTileFlyIn : null}
                                    handJokerSwapFlyInFromBelowId={
                                      animationsEnabled ? handJokerSwapFlyInFromBelowId : null
                                    }
                                    suggestedTileGuide={suggestedTileGuideForRack}
                                    suggestedDeadTileGuide={suggestedDeadTileGuideForRack}
                                    discardMode={false}
                                    animationsEnabled={animationsEnabled}
                                    jokerSwapHintBounceTileIds={jokerSwapHintBounceIds?.hand ?? null}
                                    jokerSwapHintBounceEpoch={jokerSwapHintBounceEpoch}
                                  />
                                  </SortableContext>
                                </HandBank>
                            </div>
                            <div
                              className="panel-hand-rack__charleston-actions-well"
                            >
                            <div
                              className="rack-bottom-bar rack-bottom-bar--charleston rack-bottom-bar--tile-grid"
                              role="group"
                              aria-label="Charleston pass"
                            >
                              <button
                                type="button"
                                className="btn btn--rack-neutral rack-bottom-tile-cell rack-bottom-tile-cell--c1"
                                onClick={sortHand}
                              >
                                Sort
                              </button>
                              <HandRackMenuAnchor
                                menuContainerRef={menuContainerRef}
                              />
                              <button
                                type="button"
                                className="btn btn--rack-neutral rack-bottom-tile-cell rack-bottom-tile-cell--c3 rack-bottom-tile-cell--new-game"
                                onClick={newHand}
                                aria-label="New Game"
                              >
                                New
                              </button>
                              {showSuggestedHandsPanel ? (
                                <>
                                  <SuggestedHandsTrayToggleButton />
                                  <button
                                    type="button"
                                    className={[
                                      'btn',
                                      'btn--primary',
                                      'charleston-pass-btn',
                                      'suggested-hands-tab',
                                      'rack-bottom-tile-cell',
                                      'rack-bottom-tile-cell--c6',
                                      suggestedPanelTilesOn &&
                                      (mainPhase !== 'mahjong-declared' || mahjongWinReviewing)
                                        ? 'suggested-hands-tab--open'
                                        : '',
                                    ]
                                      .filter(Boolean)
                                      .join(' ')}
                                    aria-label="Suggested tiles"
                                    aria-pressed={
                                      (mainPhase !== 'mahjong-declared' || mahjongWinReviewing) &&
                                      suggestedPanelTilesOn
                                    }
                                    onClick={onSuggestedTilesButtonClick}
                                    onPointerDown={onSuggestedTilesButtonPointerDown}
                                    onPointerUp={onSuggestedTilesButtonPointerUpOrLeave}
                                    onPointerLeave={onSuggestedTilesButtonPointerUpOrLeave}
                                    onPointerCancel={onSuggestedTilesButtonPointerUpOrLeave}
                                  >
                                    Tiles
                                  </button>
                                </>
                              ) : null}
                              <MahjongRackActionButton
                                enabled={mahjongButtonEnabled}
                                showHint={showMahjongRackHint}
                                winGlyphLit={mahjongWinGlyphLit}
                                onDeclare={declareMahjong}
                              />
                              <button
                                type="button"
                                className="btn btn--joker-swap-action rack-bottom-tile-cell rack-bottom-tile-cell--c9-10"
                                disabled
                                aria-label="Swap"
                              >
                                Swap
                              </button>
                              <WallTilesRemainCell
                                count={wall.length}
                                className={`rack-hand-tools__wall rack-bottom-wall rack-bottom-tile-cell rack-bottom-tile-cell--c11${
                                  wall.length >= openingWallTileCount ? ' rack-bottom-wall--full' : ''
                                }${wall.length === 0 ? ' rack-bottom-wall--empty' : ''}`}
                                style={wallRemainHeatStyle(wall.length, openingWallTileCount)}
                              />
                              <button
                                type="button"
                                className="btn btn--primary charleston-pass-btn rack-bottom-tile-cell rack-bottom-tile-cell--c12-14"
                                aria-label={charlestonPassDirections(charlestonPhase)}
                                disabled={!passReady || charlestonPassStrip?.flyOutFrom != null}
                                aria-disabled={!passReady || charlestonPassStrip?.flyOutFrom != null}
                                onClick={onCharlestonPassButtonClick}
                              >
                                {charlestonPassButtonLabel()}
                              </button>
                              {undoEnabled && canUndo ? (
                                <span
                                  className="btn__undo-inset rack-bottom-tile-cell rack-bottom-tile-cell--c12-14"
                                  role="button"
                                  tabIndex={0}
                                  aria-label="Undo"
                                  onClick={onUndoClick}
                                  onKeyDown={onUndoKeyDown}
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <polyline points="1 4 1 10 7 10" />
                                    <path d="M6 18a9 9 0 1 0-.36-12.36L1 10" />
                                  </svg>
                                </span>
                              ) : null}
                            </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="rack-stage rack-stage--main-rack">
                        <div
                          className={[
                            'rack-stage__rack-col',
                            callMeldInsetCols > 0 ? 'rack-stage__rack-col--call-meld-inset' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          style={
                            callMeldInsetCols > 0
                              ? ({
                                  ['--call-meld-inset-cols' as string]: callMeldInsetCols,
                                } as CSSProperties)
                              : undefined
                          }
                        >
                          <SortableContext items={sortableItems} strategy={rectSortingStrategy}>
                          <div ref={eastExposureRackTopRef} className="rack-stage__rack-top">
                            <StagingMeldDropZone active={mainPhase === 'call-staging'}>
                            <EastOwnJokerSwapDropZone active={jokerSwapUiActive}>
                            <ExposureRack
                              stackSuitTiles
                              ownedMeldHighlight
                              hideWatermark={winHandDumpOnExposure}
                              preserveTileOrder={winHandDumpOnExposure}
                              className={
                                mainPhase === 'mahjong-declared'
                                  ? 'exposure-rack--win-hand-dump'
                                  : undefined
                              }
                              callStagingWaveFlyIn={
                                winHandFlyWave
                                  ? winHandFlyWave
                                  : animationsEnabled
                                    ? (eastCallStagedWaveFlyIn as never)
                                    : null
                              }
                              flyInTileIds={
                                winHandDumpOnExposure
                                  ? winHandFlyInTileIds
                                  : exposureJokerSwapFlyInTileIds
                              }
                              flyInFromBelowTileIds={
                                winHandDumpOnExposure
                                  ? null
                                  : exposureJokerSwapFlyInTileIds
                              }
                              flyInOriginByTileId={
                                winHandDumpOnExposure ? winHandFlyInOriginByTileId : null
                              }
                              jokerSwapHintBounceTileIds={
                                winHandDumpOnExposure
                                  ? null
                                  : (jokerSwapHintBounceIds?.jokers ?? null)
                              }
                              jokerSwapHintBounceEpoch={jokerSwapHintBounceEpoch}
                              melds={eastPlayerExposureRackMelds as never}
                              suggestedTileGuide={
                                winHandDumpOnExposure ? null : suggestedTileGuideForRack
                              }
                              highlightCalledTile={mainPhase === 'call-staging'}
                              ariaLabel={
                                winHandDumpOnExposure
                                  ? 'Your winning hand'
                                  : 'Your exposures'
                              }
                              reserveLastSlotForDiscard={mainPhase !== 'call-staging' && mainPhase !== 'mahjong-declared' && mainPhase !== 'bot-mahjong'}
                              lastSlotTile={
                                activeBotDiscard && mainPhase === 'bot-turn'
                                  ? activeBotDiscard
                                  : null
                              }
                              incomingBotDiscardFlyFrom={
                                animationsEnabled ? incomingBotDiscardFlyFrom : null
                              }
                              lastSlotDraggableForCallInit={
                                mainPhase === 'bot-turn' && activeBotDiscard != null
                              }
                              lastSlotLabel={eastExposureLastSlotLabel}
                              lastSlotClassName={eastExposureLastSlotClassName}
                              lastSlotReplace={eastDiscardLastSlotReplace}
                              firstEmptyOverride={callInitiateFirstEmptyOverride}
                            />
                            </EastOwnJokerSwapDropZone>
                            </StagingMeldDropZone>
                          </div>
                          <div className="panel-hand-rack__hand-tray">
                            {mainPhase !== 'dead-hand' &&
                            !hidePlayerSeatLabelForCallSlot ? (
                              <PlayerRackSeatLabel
                                seat={playerSeat}
                                cardId={seatLabelCardId}
                                isActiveTurn={playerSeatLabelActiveTurn}
                                isCalledThrower={playerSeatLabelCalledThrower}
                              />
                            ) : null}
                            <div ref={playerHandRackBottomRef} className="rack-stage__rack-bottom">
                              <HandBank>
                                <SortableHand
                                  tiles={
                                    winHandDumpOnExposure ? [] : visibleHandTiles
                                  }
                                  sortableOrder={undefined}
                                  externalInsertPreviewIndex={
                                    winHandDumpOnExposure
                                      ? null
                                      : eastDiscardIntoHandPreviewIndex
                                  }
                                  selectedTileId={
                                    mainPhase === 'east-discard' || winHandDumpOnExposure
                                      ? null
                                      : selectedHandTileId
                                  }
                                  onTileActivate={onHandTileActivate}
                                  highlightedTileId={
                                    winHandDumpOnExposure ? null : drawnTileId
                                  }
                                  charlestonGlowTileIds={charlestonGlowTileIds ?? undefined}
                                  handTileFlyIn={
                                    animationsEnabled && !winHandDumpOnExposure
                                      ? handTileFlyIn
                                      : null
                                  }
                                  handJokerSwapFlyInFromBelowId={
                                    animationsEnabled && !winHandDumpOnExposure
                                      ? handJokerSwapFlyInFromBelowId
                                      : null
                                  }
                                  suggestedTileGuide={
                                    winHandDumpOnExposure ? null : suggestedTileGuideForRack
                                  }
                                  suggestedDeadTileGuide={
                                    winHandDumpOnExposure
                                      ? null
                                      : suggestedDeadTileGuideForRack
                                  }
                                  discardMode={false}
                                  animationsEnabled={animationsEnabled}
                                  jokerSwapHintBounceTileIds={
                                    winHandDumpOnExposure
                                      ? null
                                      : (jokerSwapHintBounceIds?.hand ?? null)
                                  }
                                  jokerSwapHintBounceEpoch={jokerSwapHintBounceEpoch}
                                  suppressRemovalShift={mainPhase === 'call-staging'}
                                />
                              </HandBank>
                            </div>
                            {mainPhase !== 'dead-hand' ? (
                              <div
                                className="panel-hand-rack__action-well"
                              >
                              <div
                                className="rack-bottom-bar rack-bottom-bar--main rack-bottom-bar--tile-grid"
                                role="group"
                                aria-label="Table actions"
                              >
                                <button
                                  type="button"
                                  className="btn btn--rack-neutral rack-bottom-tile-cell rack-bottom-tile-cell--c1"
                                  onClick={sortHand}
                                >
                                  Sort
                                </button>
                                <HandRackMenuAnchor
                                  menuContainerRef={menuContainerRef}
                                />
                                <button
                                  type="button"
                                  className="btn btn--rack-neutral rack-bottom-tile-cell rack-bottom-tile-cell--c3 rack-bottom-tile-cell--new-game"
                                  onClick={newHand}
                                  aria-label="New Game"
                                >
                                  New
                                </button>
                                {showSuggestedHandsPanel ? (
                                  <>
                                    <SuggestedHandsTrayToggleButton />
                                    <button
                                      type="button"
                                      className={[
                                        'btn',
                                        'btn--primary',
                                        'charleston-pass-btn',
                                        'suggested-hands-tab',
                                        'rack-bottom-tile-cell',
                                        'rack-bottom-tile-cell--c6',
                                        suggestedPanelTilesOn &&
                                      (mainPhase !== 'mahjong-declared' || mahjongWinReviewing)
                                          ? 'suggested-hands-tab--open'
                                          : '',
                                      ]
                                        .filter(Boolean)
                                        .join(' ')}
                                      aria-label="Suggested tiles"
                                      aria-pressed={
                                        (mainPhase !== 'mahjong-declared' || mahjongWinReviewing) &&
                                        suggestedPanelTilesOn
                                      }
                                      onClick={onSuggestedTilesButtonClick}
                                      onPointerDown={onSuggestedTilesButtonPointerDown}
                                      onPointerUp={onSuggestedTilesButtonPointerUpOrLeave}
                                      onPointerLeave={onSuggestedTilesButtonPointerUpOrLeave}
                                      onPointerCancel={onSuggestedTilesButtonPointerUpOrLeave}
                                    >
                                      Tiles
                                    </button>
                                  </>
                                ) : null}
                                <MahjongRackActionButton
                                  enabled={mahjongButtonEnabled}
                                  showHint={showMahjongRackHint}
                                  winGlyphLit={mahjongWinGlyphLit}
                                  onDeclare={declareMahjong}
                                />
                                {mainBarSharedSlotIsSwap ? (
                                  <button
                                    type="button"
                                    className={[
                                      'btn btn--joker-swap-action rack-bottom-tile-cell rack-bottom-tile-cell--c9-10',
                                      showJokerSwapRackHint ? 'btn--joker-swap-hint' : '',
                                    ]
                                      .filter(Boolean)
                                      .join(' ')}
                                    disabled={mainGameSwapDisabled}
                                    aria-disabled={mainGameSwapDisabled}
                                    onClick={executeSwapFromSlot}
                                    aria-label="Swap"
                                  >
                                    {showJokerSwapRackHint ? <RackActionAuroraBorder /> : null}
                                    <span className="btn--rack-action-label">Swap</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className={[
                                      'btn btn--joker-swap-action rack-bottom-tile-cell rack-bottom-tile-cell--c9-10',
                                      concealedHandReminderEnabled && focusedHandIsConcealed ? 'btn--call-concealed' : '',
                                    ]
                                      .filter(Boolean)
                                      .join(' ')}
                                    disabled={mainGameCallDisabled}
                                    onClick={initiateCall}
                                    aria-label="Call discard"
                                  >
                                    {concealedHandReminderEnabled && focusedHandIsConcealed ? (
                                      <>
                                        <span
                                          className="hands-list__card-c"
                                          aria-label="Concealed hand"
                                        >C</span>all
                                      </>
                                    ) : 'Call'}
                                  </button>
                                )}
                                <WallTilesRemainCell
                                  count={wall.length}
                                  className={`rack-hand-tools__wall rack-bottom-wall rack-bottom-tile-cell rack-bottom-tile-cell--c11${
                                    wall.length >= openingWallTileCount ? ' rack-bottom-wall--full' : ''
                                  }${wall.length === 0 ? ' rack-bottom-wall--empty' : ''}`}
                                  style={wallRemainHeatStyle(wall.length, openingWallTileCount)}
                                />
                                <button
                                  type="button"
                                  className={[
                                    'btn rack-bottom-tile-cell rack-bottom-tile-cell--c12-14',
                                    mainPhase === 'east-discard' || mainGamePrimaryIsDone ? 'btn--discard' : '',
                                  ]
                                    .filter(Boolean)
                                    .join(' ')}
                                  disabled={mainGamePrimaryDisabled}
                                  aria-disabled={mainGamePrimaryDisabled}
                                  aria-label={
                                    mainGamePrimaryIsDone
                                      ? 'Commit meld and proceed to discard'
                                      : mainGamePrimaryLabel
                                  }
                                  onClick={onPrimaryActionClick}
                                >
                                  {mainGamePrimaryLabel}
                                </button>
                                {undoEnabled && canUndo ? (
                                  <span
                                    className="btn__undo-inset rack-bottom-tile-cell rack-bottom-tile-cell--c12-14"
                                    role="button"
                                    tabIndex={0}
                                    aria-label="Undo"
                                    onClick={onUndoClick}
                                    onKeyDown={onUndoKeyDown}
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <polyline points="1 4 1 10 7 10" />
                                      <path d="M6 18a9 9 0 1 0-.36-12.36L1 10" />
                                    </svg>
                                  </span>
                                ) : null}
                              </div>
                              </div>
                            ) : null}
                          </div>
                          </SortableContext>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </section>
            </div>
            {showPlaySplitRow ? (
              <div className="app-discard-bottom-container">
                <section
                  ref={discardTrackerPanelRef}
                  className="panel panel--discard-tracker panel--discard-tracker--bottom"
                  aria-label="Discard tray"
                  data-joker-swap-dnd={jokerSwapUiActive ? 'on' : 'off'}
                >
                  <SuggestedHandsOpenDataAttr elRef={discardTrackerPanelRef} />
                  <div className="discard-tracker__shell">
                    <div className="discard-tracker__content">
                      <div className="discard-tracker__discard-container">
                        <DiscardPileDropZone
                          swapDropActive={false}
                          onContainerNode={onDiscardPileContainerNode}
                        >
                          <div className="discard-pile" role="list" aria-label="Committed discards" />
                        </DiscardPileDropZone>
                      </div>
                      {suggestedHandsPopup}
                    </div>
                  </div>
                </section>
              </div>
            ) : null}
              {blankExchangeOpen ? (
                <BlankExchangeOverlay
                  discardPile={displayedDiscardPile}
                  blankTilesEnabled={blankTilesEnabled}
                  suggestedNeedDefs={suggestedDiscardTrackerNeedDefs}
                  onPick={performBlankExchange}
                  onCancel={closeBlankExchange}
                />
              ) : null}
              <DragOverlay dropAnimation={null}>
                {dragOverlayMeldTiles ? (
                  <div className="drag-overlay-meld">
                    {dragOverlayMeldTiles.map((tile) => (
                      <div
                        key={tile.id}
                        className={[
                          'drag-overlay-tile',
                          suggestedTileGuideForRack?.blankExchangeIds?.has(tile.id)
                            ? 'sortable-tile-wrap--blank-exchange-hint'
                            : suggestedTileGuideForRack?.bestIds.has(tile.id)
                              ? 'sortable-tile-wrap--suggest-best'
                              : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <TileFace
                          def={tile.def}
                          elevated
                          rackSuitStacked={dragOverlayRackSuitStacked}
                        />
                      </div>
                    ))}
                  </div>
                ) : dragOverlayTile ? (
                  <div
                    className={[
                      'drag-overlay-tile',
                      suggestedTileGuideForRack?.blankExchangeIds?.has(dragOverlayTile.id)
                        ? 'sortable-tile-wrap--blank-exchange-hint'
                        : suggestedTileGuideForRack?.bestIds.has(dragOverlayTile.id)
                          ? 'sortable-tile-wrap--suggest-best'
                          : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <TileFace
                      def={dragOverlayTile.def}
                      elevated
                      rackSuitStacked={dragOverlayRackSuitStacked}
                    />
                  </div>
                ) : null}
              </DragOverlay>
            </SuggestedHandsDndFrame>
        </div>
      </div>
    </DndContext>

  )

}

export const PlaySurface = memo(PlaySurfaceInner)
