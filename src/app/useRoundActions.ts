import { useCallback, useRef } from 'react'
import type { MutableRefObject } from 'react'

import type { TileInstance } from '../mahjong/types'
import type { CharlestonPhase } from '../mahjong/charleston'
import type { PassSlots } from '../mahjong/passTargets'
import type { PlayableCardId } from '../card/cardCatalog'
import type { BotDifficulty } from '../analysis/botAI'
import type { SortMode } from '../mahjong/tileUtils'
import type { PassStripFlyOutFrom } from '../components/PassStrip'
import type { JokerSwapTargetPick } from '../mahjong/jokerSwapTarget'
import type { CallValidationRoundSlice } from '../mahjong/callValidation'
import type { RoundState } from './roundState'
import type { MainPhase } from './playSurfaceUi'
import type { PlaySurfaceDnDApi } from './usePlaySurfaceDnD'
import type { GameBlockingDialog } from './gameDialog'

import {
  charlestonAllowsBlind,
  charlestonMahjongButtonPhase,
  charlestonPassBlockedMessage,
  charlestonPassEligible,
  nextCharlestonPhase,
} from '../mahjong/charleston'
import { handTileFlyInFromCharlestonPhase } from '../mahjong/handTileFlyIn'
import { compactPassSlotsToRight, firstEmptyPassSlotIndex } from '../mahjong/passTargets'
import { chooseBotCharlestonPass } from '../analysis/botAI'
import { handsFromFourHands, seatLabel, fourHandsWithPlayerAsEast } from '../mahjong/seats'
import {
  getCallCapacityFlags,
  getCallInitiateBlockMessage,
  hasLegalMahjongOnBotDiscard,
  maxOpenClaimHandTiles,
  BLOCKING_TITLE_SWAP_ERROR,
  MSG_CALL_DEAD_JOKER,
  MSG_CALL_INSUFFICIENT_TILES,
  MSG_MAHJONG_DURING_CHARLESTON,
  MSG_DISCARD_BLANK_USE_SWAP,
  MSG_SWAP_BLANK_NO_DISCARDS,
  MSG_SWAP_NO_EXPOSED_JOKERS,
  MSG_SWAP_NO_LEGAL_FOR_TILE,
  MSG_SWAP_NOTHING_AVAILABLE,
  MSG_SWAP_PICK_TILE_FIRST,
} from '../mahjong/callValidation'
import { discardedDefsForBlankExchange } from '../mahjong/blankExchange'
import { sortTiles } from '../mahjong/tileUtils'
import { summarizeRackTowardWin, sortHandForSuggestedPattern } from '../analysis/suggestedHands'
import { getActiveCardPatterns } from '../card/activeCardPatternsScope'

import {
  applyCharlestonPassForRound,
  applyCommitStagedCall,
  applyDeclareMahjong,
  applyDeclareMahjongSelfDraw,
  applyDeadHand,
  applyEastNaturalForExposedJoker,
  applyInitiateCall,
  applyAutoSelectCallTiles,
  applyToggleStagedCallTile,
  charlestonIncomingHandTileIds,
  deadDiscardTilesForRanking,
  previewAutoSelectedCallRankInput,
  previewStagedCallBestTilesAway,
  previewStagedCallRankInput,
  toFourHands,
} from './roundMutations'

// ── Arg types ─────────────────────────────────────────────────────────────────

export interface UseRoundActionsArgs {
  // Core round ref + push functions
  roundRef: MutableRefObject<RoundState>
  pushRound: (updater: RoundState | ((prev: RoundState) => RoundState)) => void
  pushRoundAsync: (compute: (r: RoundState) => Promise<RoundState>) => Promise<void>

  // Complex async helpers — kept in App.tsx; passed through to avoid circular imports
  applyCharlestonDoneIfNeeded: (
    r: RoundState,
    nextPhase: CharlestonPhase,
    botWinsEnabled: boolean,
    botDifficulty: BotDifficulty,
    cardId: PlayableCardId,
  ) => Promise<RoundState>
  commitEastDiscardAfterStaged: (
    r: RoundState,
    botWinsEnabled?: boolean,
    botDifficulty?: BotDifficulty,
    cardId?: PlayableCardId,
  ) => Promise<RoundState>
  applySkipBotDiscard: (
    r: RoundState,
    botWinsEnabled?: boolean,
    botDifficulty?: BotDifficulty,
    cardId?: PlayableCardId,
  ) => Promise<RoundState>

  // Settings refs
  gameModeRef: MutableRefObject<'training' | 'competition'>
  botDifficultyRef: MutableRefObject<BotDifficulty>
  botWinsEnabledRef: MutableRefObject<boolean>
  committedCardIdRef: MutableRefObject<PlayableCardId>
  deadHandWarningsEnabledRef: MutableRefObject<boolean>
  concealedHandReminderEnabledRef: MutableRefObject<boolean>
  focusedHandIsConcealedRef: MutableRefObject<boolean>
  suggestedFocusHandKeyRef: MutableRefObject<string | null>
  sortModeRef: MutableRefObject<SortMode | null>

  // DnD API ref (for blank exchange popup)
  playSurfaceDnDApiRef: MutableRefObject<PlaySurfaceDnDApi | null>

  // Charleston flyout refs (defined in App to survive cleanup effects)
  passStripFlyoutTimerRef: MutableRefObject<number | null>
  lastPassReturnTileIdRef: MutableRefObject<string | null>

  // Derived state values consumed by handlers
  animationsEnabled: boolean
  suggestedSuppressedHandKey: string | null
  passSlots: PassSlots
  charlestonPhase: CharlestonPhase
  charlestonDone: boolean
  mainPhase: MainPhase
  pendingJokerSwapTileId: string | null
  selectedHandTileId: string | null
  pendingEastDiscardTile: TileInstance | null
  hand: TileInstance[]
  discardPile: RoundState['discardPile']
  jokerSwapUiActive: boolean
  jokerSwapPick: JokerSwapTargetPick | null

  // State setters
  setBlockingDialog: (dialog: GameBlockingDialog | null) => void
  setCharlestonPassError: (error: string | null) => void
  setPendingJokerSwapTileId: (id: string | null) => void
  setPassStripFlyOut: (dir: PassStripFlyOutFrom | null) => void
  setCallRuleError: (error: string | null) => void
  setEastCallStagedWaveFlyIn: (v: { staggerDelayMs: number; baseDelayMs: number } | null) => void
}

export interface UseRoundActionsResult {
  sendCharlestonPass: () => void
  skipToCourtesyPass: () => void
  onCharlestonPassButtonClick: () => void
  skipBotDiscard: () => void
  commitEastDiscard: () => void
  returnStagedEastDiscard: () => void
  declareMahjong: () => void
  executeJokerSwapFromSlot: () => void
  executeSwapFromSlot: () => void
  sortHand: () => void
  initiateCall: () => void
  proceedWithCall: () => void
  commitStagedCall: () => void
  onHandTileActivate: (id: string) => void
  onPassBoxClick: () => void
  onPassTileClickReturn: (slotIndex: number) => void
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useRoundActions(args: UseRoundActionsArgs): UseRoundActionsResult {
  const {
    roundRef,
    pushRound,
    pushRoundAsync,
    applyCharlestonDoneIfNeeded,
    commitEastDiscardAfterStaged: commitEastDiscardAfterStagedFn,
    applySkipBotDiscard: applySkipBotDiscardFn,
    gameModeRef,
    botDifficultyRef,
    botWinsEnabledRef,
    committedCardIdRef,
    deadHandWarningsEnabledRef,
    concealedHandReminderEnabledRef,
    focusedHandIsConcealedRef,
    suggestedFocusHandKeyRef,
    sortModeRef,
    playSurfaceDnDApiRef,
    passStripFlyoutTimerRef,
    lastPassReturnTileIdRef,
    animationsEnabled,
    suggestedSuppressedHandKey,
    passSlots,
    charlestonPhase,
    charlestonDone,
    mainPhase,
    pendingJokerSwapTileId,
    selectedHandTileId,
    pendingEastDiscardTile,
    hand,
    discardPile,
    jokerSwapUiActive,
    jokerSwapPick,
    setBlockingDialog,
    setCharlestonPassError,
    setPendingJokerSwapTileId,
    setPassStripFlyOut,
    setCallRuleError,
    setEastCallStagedWaveFlyIn,
  } = args

  // ── Charleston ───────────────────────────────────────────────────────────────

  const sendCharlestonPass = useCallback(() => {
    void (async () => {
      const base = roundRef.current
      if (base.charlestonPhase === 'done') return
      const phase = base.charlestonPhase
      const eastRack = base.passSlots.filter(Boolean) as TileInstance[]
      const blocked = eastRack.find((t) => !charlestonPassEligible(t.def))
      if (blocked) {
        setCharlestonPassError(
          charlestonPassBlockedMessage(blocked.def.cat === 'blank' ? 'blank' : 'joker'),
        )
        return
      }

      const cardId = committedCardIdRef.current
      const difficulty = botDifficultyRef.current
      const absolute = toFourHands(base)
      const rotated = fourHandsWithPlayerAsEast(absolute, base.playerSeat)
      const passCount = phase === 'courtesy' ? eastRack.length : 3
      const southPass = chooseBotCharlestonPass(
        rotated.south,
        passCount,
        seatLabel(base.botSlotSeats[0]) as import('../analysis/types').BotSeat,
        difficulty,
        cardId,
      )
      const westPass = chooseBotCharlestonPass(
        rotated.west,
        passCount,
        seatLabel(base.botSlotSeats[1]) as import('../analysis/types').BotSeat,
        difficulty,
        cardId,
      )
      const northPass = chooseBotCharlestonPass(
        rotated.north,
        passCount,
        seatLabel(base.botSlotSeats[2]) as import('../analysis/types').BotSeat,
        difficulty,
        cardId,
      )

      const charlestonBotPassOpts: { pickBotPass: import('../mahjong/charleston').CharlestonBotPassPicker } = {
        pickBotPass: (_hand, _n, botIndex) =>
          botIndex === 0 ? southPass : botIndex === 1 ? westPass : northPass,
      }

      const flyDir = handTileFlyInFromCharlestonPhase(phase)

      let next: RoundState
      if (phase === 'courtesy') {
        if (eastRack.length > 3) return
        const nextHands = applyCharlestonPassForRound(base, phase, eastRack, 0, charlestonBotPassOpts)
        const nextPhase = nextCharlestonPhase(phase)
        const incoming = charlestonIncomingHandTileIds(base.hand, nextHands[base.playerSeat])
        const incomingFly =
          incoming.length > 0 && flyDir != null
            ? { ids: [...incoming], from: flyDir }
            : null
        next = await applyCharlestonDoneIfNeeded(
          {
            ...base,
            ...handsFromFourHands(nextHands, base.playerSeat, base.botSlotSeats),
            passSlots: [null, null, null],
            passSlotOrigins: [null, null, null],
            selectedHandTileId: null,
            charlestonPhase: nextPhase,
            awaitingSecondCharlestonChoice: false,
            charlestonNewTileIds: incoming,
            handTileFlyIn: incomingFly,
          },
          nextPhase,
          botWinsEnabledRef.current,
          difficulty,
          cardId,
        )
      } else {
        const blindOk = charlestonAllowsBlind(phase)
        if (blindOk) {
          const blindCount = 3 - eastRack.length
          if (blindCount < 0 || blindCount > 3) return
          const nextHands = applyCharlestonPassForRound(
            base,
            phase,
            eastRack,
            blindCount,
            charlestonBotPassOpts,
          )
          const nextPhase = nextCharlestonPhase(phase)
          const incoming =
            nextPhase === 'done'
              ? []
              : charlestonIncomingHandTileIds(base.hand, nextHands[base.playerSeat])
          next = await applyCharlestonDoneIfNeeded(
            {
              ...base,
              ...handsFromFourHands(nextHands, base.playerSeat, base.botSlotSeats),
              passSlots: [null, null, null],
              passSlotOrigins: [null, null, null],
              selectedHandTileId: null,
              charlestonPhase: nextPhase,
              awaitingSecondCharlestonChoice: nextPhase === 'left2',
              charlestonNewTileIds: incoming,
              handTileFlyIn:
                incoming.length > 0 && flyDir != null ? { ids: [...incoming], from: flyDir } : null,
            },
            nextPhase,
            botWinsEnabledRef.current,
            difficulty,
            cardId,
          )
        } else {
          if (eastRack.length !== 3) return
          const nextHands = applyCharlestonPassForRound(base, phase, eastRack, 0, charlestonBotPassOpts)
          const nextPhase = nextCharlestonPhase(phase)
          const incoming =
            nextPhase === 'done'
              ? []
              : charlestonIncomingHandTileIds(base.hand, nextHands[base.playerSeat])
          next = await applyCharlestonDoneIfNeeded(
            {
              ...base,
              ...handsFromFourHands(nextHands, base.playerSeat, base.botSlotSeats),
              passSlots: [null, null, null],
              passSlotOrigins: [null, null, null],
              selectedHandTileId: null,
              charlestonPhase: nextPhase,
              awaitingSecondCharlestonChoice: nextPhase === 'left2',
              charlestonNewTileIds: incoming,
              handTileFlyIn:
                incoming.length > 0 && flyDir != null ? { ids: [...incoming], from: flyDir } : null,
            },
            nextPhase,
            botWinsEnabledRef.current,
            difficulty,
            cardId,
          )
        }
      }

      if (roundRef.current !== base) return
      pushRound(next)
    })()
  }, [
    roundRef,
    pushRound,
    applyCharlestonDoneIfNeeded,
    committedCardIdRef,
    botDifficultyRef,
    botWinsEnabledRef,
    setCharlestonPassError,
  ])

  const skipToCourtesyPass = useCallback(() => {
    if (passStripFlyoutTimerRef.current) {
      clearTimeout(passStripFlyoutTimerRef.current)
      passStripFlyoutTimerRef.current = null
    }
    setPassStripFlyOut(null)
    pushRound((r) => {
      if (r.charlestonPhase !== 'left2' || !r.awaitingSecondCharlestonChoice) return r
      const returning = r.passSlots.filter(Boolean) as TileInstance[]
      const handNext = returning.length > 0 ? [...r.hand, ...returning] : r.hand
      return {
        ...r,
        hand: handNext,
        charlestonPhase: 'courtesy',
        charlestonSkippedSecondRound: true,
        awaitingSecondCharlestonChoice: false,
        passSlots: [null, null, null],
        passSlotOrigins: [null, null, null],
        selectedHandTileId: null,
      }
    })
  }, [pushRound, passStripFlyoutTimerRef, setPassStripFlyOut])

  const onCharlestonPassButtonClick = useCallback(() => {
    const passSlotCount = passSlots.filter(Boolean).length
    const blindPhaseLocal = !charlestonDone && charlestonAllowsBlind(charlestonPhase)
    const courtesyPhaseLocal = charlestonPhase === 'courtesy'
    const secondCharlestonLeftChoiceLocal = charlestonPhase === 'left2'
    const ready =
      secondCharlestonLeftChoiceLocal
        ? passSlotCount === 0 || passSlotCount === 3
        : courtesyPhaseLocal
          ? passSlotCount <= 3
          : blindPhaseLocal
            ? passSlotCount <= 3
            : passSlotCount === 3
    if (!ready) return
    if (secondCharlestonLeftChoiceLocal && passSlotCount === 0) {
      skipToCourtesyPass()
      return
    }
    const eastRack = passSlots.filter(Boolean) as TileInstance[]
    if (eastRack.some((t) => !charlestonPassEligible(t.def))) {
      sendCharlestonPass()
      return
    }
    const flyOutDir: PassStripFlyOutFrom | null = courtesyPhaseLocal
      ? 'courtesy-top'
      : handTileFlyInFromCharlestonPhase(charlestonPhase)
    if (!flyOutDir) {
      sendCharlestonPass()
      return
    }
    if (passStripFlyoutTimerRef.current) {
      clearTimeout(passStripFlyoutTimerRef.current)
      passStripFlyoutTimerRef.current = null
    }
    setPassStripFlyOut(flyOutDir)
    passStripFlyoutTimerRef.current = window.setTimeout(() => {
      passStripFlyoutTimerRef.current = null
      setPassStripFlyOut(null)
      sendCharlestonPass()
    }, 350)
  }, [passSlots, charlestonPhase, charlestonDone, sendCharlestonPass, skipToCourtesyPass, passStripFlyoutTimerRef, setPassStripFlyOut])

  // ── Bot / East discard ────────────────────────────────────────────────────────

  const skipBotDiscard = useCallback(() => {
    void pushRoundAsync((r) =>
      applySkipBotDiscardFn(
        r,
        botWinsEnabledRef.current,
        botDifficultyRef.current,
        committedCardIdRef.current,
      ),
    )
  }, [pushRoundAsync, applySkipBotDiscardFn, botWinsEnabledRef, botDifficultyRef, committedCardIdRef])

  const commitEastDiscard = useCallback(() => {
    const cur = roundRef.current
    const pendingTile = cur.pendingEastDiscardTile
    if (cur.mainPhase === 'east-discard' && pendingTile?.def.cat === 'blank') {
      const rankInput = {
        hand: [...cur.hand, pendingTile],
        wallRemaining: cur.wall.length,
        discards: cur.discardPile.map((e) => e.tile),
        exposures: cur.botExposures,
        playerClaimMelds: cur.eastExposures,
        eastTableClaimMelds: cur.eastExposures,
        patterns: getActiveCardPatterns(),
      }
      if (summarizeRackTowardWin(rankInput).bestTilesAway < 14) {
        queueMicrotask(() =>
          setBlockingDialog({
            variant: 'table',
            title: BLOCKING_TITLE_SWAP_ERROR,
            message: MSG_DISCARD_BLANK_USE_SWAP,
          }),
        )
        return
      }
    }
    if (gameModeRef.current === 'training') {
      if (cur.mainPhase === 'east-discard' && pendingTile) {
        const rankInput = {
          hand: cur.hand,
          wallRemaining: cur.wall.length,
          discards: [...cur.discardPile.map((e) => e.tile), pendingTile],
          exposures: cur.botExposures,
          playerClaimMelds: cur.eastExposures,
          eastTableClaimMelds: cur.eastExposures,
          patterns: getActiveCardPatterns(),
        }
        const { bestTilesAway, closestLine } = summarizeRackTowardWin(rankInput)
        if (!closestLine || bestTilesAway >= 14) {
          if (deadHandWarningsEnabledRef.current) {
            queueMicrotask(() =>
              setBlockingDialog({ variant: 'discard-dead-warning', rankInput }),
            )
            return
          }
        }
      }
    }
    void pushRoundAsync((r) =>
      commitEastDiscardAfterStagedFn(
        r,
        botWinsEnabledRef.current,
        botDifficultyRef.current,
        committedCardIdRef.current,
      ),
    )
  }, [
    roundRef,
    pushRoundAsync,
    commitEastDiscardAfterStagedFn,
    gameModeRef,
    botWinsEnabledRef,
    botDifficultyRef,
    committedCardIdRef,
    deadHandWarningsEnabledRef,
    setBlockingDialog,
  ])

  const returnStagedEastDiscard = useCallback(() => {
    pushRound((r) => {
      if (!r.pendingEastDiscardTile) return r
      const t = r.pendingEastDiscardTile
      return {
        ...r,
        hand: [...r.hand, t],
        pendingEastDiscardTile: null,
        pendingEastDiscardIdx: null,
        selectedHandTileId: null,
      }
    })
  }, [pushRound])

  // ── Mah Jongg declaration ─────────────────────────────────────────────────────

  const declareMahjong = useCallback(() => {
    pushRound((cur) => {
      if (cur.charlestonPhase !== 'done') {
        if (charlestonMahjongButtonPhase(cur.charlestonPhase)) {
          queueMicrotask(() =>
            setBlockingDialog({ variant: 'card', message: MSG_MAHJONG_DURING_CHARLESTON }),
          )
        }
        return cur
      }
      if (cur.mainPhase === 'east-discard') {
        const rankInput = {
          hand: cur.hand,
          wallRemaining: cur.wall.length,
          discards: cur.discardPile.map((e) => e.tile),
          exposures: cur.botExposures,
          playerClaimMelds: cur.eastExposures,
          eastTableClaimMelds: cur.eastExposures,
          patterns: getActiveCardPatterns(),
        }
        const { bestTilesAway } = summarizeRackTowardWin(rankInput)
        if (bestTilesAway !== 0) {
          if (gameModeRef.current === 'training' && deadHandWarningsEnabledRef.current) {
            queueMicrotask(() =>
              setBlockingDialog({
                variant: 'mahjong-dead-warning',
                rankInput,
                deadHandReason: 'illegal-mahjong-self-draw',
              }),
            )
            return cur
          }
          return applyDeadHand(cur, 'illegal-mahjong-self-draw')
        }
        return applyDeclareMahjongSelfDraw(cur)
      }
      if (cur.mainPhase === 'call-staging' && cur.activeBotDiscard) {
        if (cur.stagedCallTileIds.length > 0) {
          const away = previewStagedCallBestTilesAway(cur)
          if (away === 0) {
            return applyCommitStagedCall(cur, gameModeRef.current)
          }
          const called = cur.activeBotDiscard
          const rankInput = {
            hand: [...cur.hand, called],
            wallRemaining: cur.wall.length,
            discards: cur.discardPile.filter((e) => e.tile.id !== called.id).map((e) => e.tile),
            exposures: cur.botExposures,
            playerClaimMelds: cur.eastExposures,
            eastTableClaimMelds: cur.eastExposures,
            patterns: getActiveCardPatterns(),
          }
          if (gameModeRef.current === 'training' && deadHandWarningsEnabledRef.current) {
            queueMicrotask(() =>
              setBlockingDialog({
                variant: 'mahjong-dead-warning',
                rankInput,
                deadHandReason: 'illegal-mahjong-call-staged',
              }),
            )
            return cur
          }
          return applyDeadHand(cur, 'illegal-mahjong-call-staged')
        }
        const slice: CallValidationRoundSlice = {
          mainPhase: 'call-staging',
          activeBotDiscard: cur.activeBotDiscard,
          hand: cur.hand,
          eastExposures: cur.eastExposures,
          botExposures: cur.botExposures,
          wall: cur.wall,
          discardPile: cur.discardPile,
        }
        if (!hasLegalMahjongOnBotDiscard(slice)) {
          const called = cur.activeBotDiscard
          const rankInput = {
            hand: [...cur.hand, called],
            wallRemaining: cur.wall.length,
            discards: cur.discardPile.filter((e) => e.tile.id !== called.id).map((e) => e.tile),
            exposures: cur.botExposures,
            playerClaimMelds: cur.eastExposures,
            eastTableClaimMelds: cur.eastExposures,
            patterns: getActiveCardPatterns(),
          }
          if (gameModeRef.current === 'training' && deadHandWarningsEnabledRef.current) {
            queueMicrotask(() =>
              setBlockingDialog({
                variant: 'mahjong-dead-warning',
                rankInput,
                deadHandReason: 'illegal-mahjong-call-discard',
              }),
            )
            return cur
          }
          return applyDeadHand(cur, 'illegal-mahjong-call-discard')
        }
        return applyDeclareMahjong({ ...cur, mainPhase: 'bot-turn' })
      }
      if (cur.mainPhase !== 'bot-turn' || !cur.activeBotDiscard) return cur
      const slice = {
        mainPhase: cur.mainPhase,
        activeBotDiscard: cur.activeBotDiscard,
        hand: cur.hand,
        eastExposures: cur.eastExposures,
        botExposures: cur.botExposures,
        wall: cur.wall,
        discardPile: cur.discardPile,
      }
      if (!hasLegalMahjongOnBotDiscard(slice)) {
        const called = cur.activeBotDiscard!
        const rankInput = {
          hand: [...cur.hand, called],
          wallRemaining: cur.wall.length,
          discards: cur.discardPile.filter((e) => e.tile.id !== called.id).map((e) => e.tile),
          exposures: cur.botExposures,
          playerClaimMelds: cur.eastExposures,
          eastTableClaimMelds: cur.eastExposures,
          patterns: getActiveCardPatterns(),
        }
        if (gameModeRef.current === 'training' && deadHandWarningsEnabledRef.current) {
          queueMicrotask(() =>
            setBlockingDialog({
              variant: 'mahjong-dead-warning',
              rankInput,
              deadHandReason: 'illegal-mahjong-bot-discard',
            }),
          )
          return cur
        }
        return applyDeadHand(cur, 'illegal-mahjong-bot-discard')
      }
      return applyDeclareMahjong(cur)
    })
  }, [pushRound, gameModeRef, deadHandWarningsEnabledRef, setBlockingDialog])

  // ── Joker swap ────────────────────────────────────────────────────────────────

  const executeJokerSwapFromSlot = useCallback(() => {
    if (!jokerSwapUiActive) {
      setBlockingDialog({
        variant: 'table',
        title: BLOCKING_TITLE_SWAP_ERROR,
        message: MSG_SWAP_NO_EXPOSED_JOKERS,
      })
      return
    }
    const pid = pendingJokerSwapTileId ?? pendingEastDiscardTile?.id ?? null
    if (!pid) {
      setBlockingDialog({
        variant: 'table',
        title: BLOCKING_TITLE_SWAP_ERROR,
        message: MSG_SWAP_PICK_TILE_FIRST,
      })
      return
    }
    if (!jokerSwapPick) {
      setBlockingDialog({
        variant: 'table',
        title: BLOCKING_TITLE_SWAP_ERROR,
        message: MSG_SWAP_NO_LEGAL_FOR_TILE,
      })
      return
    }
    const pick = jokerSwapPick
    setPendingJokerSwapTileId(null)
    pushRound((r) => applyEastNaturalForExposedJoker(r, { ...pick, eastTileId: pid }))
  }, [jokerSwapUiActive, pendingJokerSwapTileId, pendingEastDiscardTile, jokerSwapPick, pushRound, setBlockingDialog, setPendingJokerSwapTileId])

  const executeSwapFromSlot = useCallback(() => {
    const canBlankExchange = charlestonDone && mainPhase === 'east-discard'
    const selectedTile =
      (pendingJokerSwapTileId
        ? hand.find((t) => t.id === pendingJokerSwapTileId)
        : selectedHandTileId
          ? hand.find((t) => t.id === selectedHandTileId)
          : null) ?? null
    const eligibleDiscards = discardedDefsForBlankExchange(discardPile)

    const openBlankExchangeOrExplain = (blankTileId: string) => {
      if (eligibleDiscards.length === 0) {
        setBlockingDialog({
          variant: 'table',
          title: BLOCKING_TITLE_SWAP_ERROR,
          message: MSG_SWAP_BLANK_NO_DISCARDS,
        })
        return
      }
      playSurfaceDnDApiRef.current?.openBlankExchange(blankTileId)
    }

    const stagedBlank =
      pendingEastDiscardTile?.def.cat === 'blank'
        ? pendingEastDiscardTile
        : selectedTile?.def.cat === 'blank'
          ? selectedTile
          : null
    if (canBlankExchange && stagedBlank) {
      openBlankExchangeOrExplain(stagedBlank.id)
      return
    }

    const jokerSwapReady =
      jokerSwapUiActive &&
      (pendingJokerSwapTileId != null || pendingEastDiscardTile != null) &&
      jokerSwapPick != null
    if (jokerSwapReady) {
      executeJokerSwapFromSlot()
      return
    }

    if (
      canBlankExchange &&
      !pendingEastDiscardTile &&
      !pendingJokerSwapTileId &&
      !selectedHandTileId
    ) {
      const anyBlank = hand.find((t) => t.def.cat === 'blank')
      if (anyBlank) {
        openBlankExchangeOrExplain(anyBlank.id)
        return
      }
    }

    if (jokerSwapUiActive) {
      executeJokerSwapFromSlot()
      return
    }

    setBlockingDialog({
      variant: 'table',
      title: BLOCKING_TITLE_SWAP_ERROR,
      message: MSG_SWAP_NOTHING_AVAILABLE,
    })
  }, [
    charlestonDone,
    mainPhase,
    pendingJokerSwapTileId,
    selectedHandTileId,
    pendingEastDiscardTile,
    hand,
    discardPile,
    jokerSwapUiActive,
    jokerSwapPick,
    executeJokerSwapFromSlot,
    setBlockingDialog,
    playSurfaceDnDApiRef,
  ])

  // ── Sort hand ─────────────────────────────────────────────────────────────────

  const sortHand = useCallback(() => {
    const focusKey = suggestedFocusHandKeyRef.current
    if (focusKey && focusKey !== suggestedSuppressedHandKey) {
      const variantSep = ['::tier::', '::oc::', '::ocall::']
        .map((s) => focusKey.indexOf(s))
        .filter((i) => i >= 0)
        .reduce((m, i) => (m < 0 ? i : Math.min(m, i)), -1)
      const patternId =
        variantSep >= 0 ? focusKey.slice(0, variantSep) : focusKey
      sortModeRef.current = null
      pushRound((r) => ({
        ...r,
        hand: sortHandForSuggestedPattern(
          r.hand,
          patternId,
          {
            hand: r.hand,
            wallRemaining: r.wall.length,
            discards: deadDiscardTilesForRanking(r),
            exposures: r.botExposures,
            playerClaimMelds: r.eastExposures,
            eastTableClaimMelds: r.eastExposures,
            patterns: getActiveCardPatterns(),
          },
          focusKey,
        ),
      }))
      return
    }
    const nextMode: SortMode = sortModeRef.current === 'suit' ? 'number' : 'suit'
    sortModeRef.current = nextMode
    pushRound((r) => ({ ...r, hand: sortTiles(r.hand, nextMode) }))
  }, [pushRound, suggestedSuppressedHandKey, suggestedFocusHandKeyRef, sortModeRef])

  // ── Call initiation ───────────────────────────────────────────────────────────

  // Internal ref so initiateCall can call proceedWithCall without circular deps.
  const proceedWithCallRef = useRef<(() => void) | null>(null)

  const initiateCall = useCallback(() => {
    if (
      concealedHandReminderEnabledRef.current &&
      focusedHandIsConcealedRef.current
    ) {
      setBlockingDialog({ variant: 'concealed-call-warning' })
      return
    }
    proceedWithCallRef.current?.()
  }, [concealedHandReminderEnabledRef, focusedHandIsConcealedRef, setBlockingDialog])

  const proceedWithCall = useCallback(() => {
    const cur = roundRef.current
    const callSlice: CallValidationRoundSlice = {
      mainPhase: cur.mainPhase,
      activeBotDiscard: cur.activeBotDiscard,
      hand: cur.hand,
      eastExposures: cur.eastExposures,
      botExposures: cur.botExposures,
      wall: cur.wall,
      discardPile: cur.discardPile,
    }
    const err = getCallInitiateBlockMessage(callSlice)
    if (err === MSG_CALL_DEAD_JOKER) {
      setCallRuleError(null)
      setBlockingDialog({
        variant: 'table',
        title: 'Dead joker',
        message: err,
      })
    } else if (err === MSG_CALL_INSUFFICIENT_TILES) {
      if (deadHandWarningsEnabledRef.current) {
        setCallRuleError(null)
        setBlockingDialog({
          variant: 'dead-hand-warning',
        })
      } else {
        setBlockingDialog(null)
        setCallRuleError(MSG_CALL_INSUFFICIENT_TILES)
      }
    } else if (err) {
      setBlockingDialog(null)
      setCallRuleError(err)
    } else {
      setBlockingDialog(null)
      setCallRuleError(null)
      const flags = getCallCapacityFlags(cur.hand, cur.activeBotDiscard)
      const maxClaimHand = maxOpenClaimHandTiles(flags)
      const stagingNeeded =
        flags.canPung
          ? 2
          : hasLegalMahjongOnBotDiscard({
              ...callSlice,
              mainPhase: 'bot-turn',
            })
            ? 0
            : 2
      const rankInputWorstCase =
        gameModeRef.current === 'training' && flags.canPung
          ? previewAutoSelectedCallRankInput(cur, maxClaimHand)
          : null
      if (gameModeRef.current === 'training' && flags.canPung) {
        const candidateSizes: Array<2 | 3 | 4 | 5> = []
        if (flags.canPung) candidateSizes.push(2)
        if (flags.canKong) candidateSizes.push(3)
        if (flags.canQuint) candidateSizes.push(4)
        if (flags.canSextet) candidateSizes.push(5)

        let anyCallableLineFits = false
        for (const n of candidateSizes) {
          const input = previewAutoSelectedCallRankInput(cur, n)
          if (!input) continue
          if (summarizeRackTowardWin(input).closestLine) {
            anyCallableLineFits = true
            break
          }
        }
        if (!anyCallableLineFits && rankInputWorstCase) {
          if (deadHandWarningsEnabledRef.current) {
            setBlockingDialog({
              variant: 'call-exposure-dead-warning',
              rankInput: rankInputWorstCase,
            })
            return
          }
        }
      }
      setEastCallStagedWaveFlyIn(
        animationsEnabled
          ? {
              staggerDelayMs: 44,
              baseDelayMs: 0,
            }
          : null,
      )
      pushRound((r) => applyAutoSelectCallTiles(applyInitiateCall(r), stagingNeeded))
    }
  }, [
    roundRef,
    animationsEnabled,
    pushRound,
    gameModeRef,
    deadHandWarningsEnabledRef,
    setBlockingDialog,
    setCallRuleError,
    setEastCallStagedWaveFlyIn,
  ])
  proceedWithCallRef.current = proceedWithCall

  const commitStagedCall = useCallback(() => {
    setCallRuleError(null)
    const cur = roundRef.current
    if (
      gameModeRef.current === 'training' &&
      deadHandWarningsEnabledRef.current &&
      cur.mainPhase === 'call-staging' &&
      cur.activeBotDiscard &&
      cur.stagedCallTileIds.length >= 2
    ) {
      const rankInput = previewStagedCallRankInput(cur)
      const stagedN = cur.stagedCallTileIds.length
      if (rankInput && !summarizeRackTowardWin(rankInput).closestLine) {
        const flags = getCallCapacityFlags(cur.hand, cur.activeBotDiscard)
        const largerSizes: Array<3 | 4 | 5> = []
        if (flags.canKong && stagedN < 3) largerSizes.push(3)
        if (flags.canQuint && stagedN < 4) largerSizes.push(4)
        if (flags.canSextet && stagedN < 5) largerSizes.push(5)
        for (const n of largerSizes) {
          const alt = previewAutoSelectedCallRankInput(cur, n)
          if (alt && summarizeRackTowardWin(alt).closestLine) {
            queueMicrotask(() =>
              setBlockingDialog({
                variant: 'call-meld-size-warning',
                rankInput: alt,
                neededHandTiles: n,
              }),
            )
            return
          }
        }
      }
    }
    pushRound((r) => applyCommitStagedCall(r, gameModeRef.current))
  }, [pushRound, roundRef, gameModeRef, deadHandWarningsEnabledRef, setBlockingDialog, setCallRuleError])

  // ── Hand tile / pass box interactions ────────────────────────────────────────

  const onHandTileActivate = useCallback((id: string) => {
    let passBlockedCat: 'joker' | 'blank' | null = null
    pushRound((r) => {
      if (r.charlestonPhase === 'done') {
        if (r.mainPhase === 'east-discard') {
          const handIdx = r.hand.findIndex((t) => t.id === id)
          if (handIdx < 0) return r
          const picked = r.hand[handIdx]!
          const handNext = [...r.hand]
          handNext.splice(handIdx, 1)
          const prior = r.pendingEastDiscardTile
          const priorIdx = r.pendingEastDiscardIdx
          let handAfter: TileInstance[]
          if (prior) {
            const insertIdx = Math.min(priorIdx ?? handNext.length, handNext.length)
            handAfter = [...handNext]
            handAfter.splice(insertIdx, 0, prior)
          } else {
            handAfter = handNext
          }
          return {
            ...r,
            hand: handAfter,
            pendingEastDiscardTile: picked,
            pendingEastDiscardIdx: handIdx,
            selectedHandTileId: null,
          }
        }
        if (r.mainPhase === 'call-staging') {
          return applyToggleStagedCallTile(r, id)
        }
        return r
      }

      const emptyIdx = firstEmptyPassSlotIndex(r.passSlots)
      if (emptyIdx >= 0) {
        const handIdx = r.hand.findIndex((t) => t.id === id)
        if (handIdx < 0) return r
        const tile = r.hand[handIdx]!
        if (!charlestonPassEligible(tile.def)) {
          passBlockedCat = tile.def.cat === 'blank' ? 'blank' : 'joker'
          return r
        }
        const handNext = [...r.hand]
        const passNext: PassSlots = [...r.passSlots]
        handNext.splice(handIdx, 1)
        const bumped = passNext[emptyIdx]
        passNext[emptyIdx] = tile
        if (bumped) handNext.push(bumped)
        const passOriginsNext: [number | null, number | null, number | null] = [...r.passSlotOrigins]
        passOriginsNext[emptyIdx] = handIdx
        lastPassReturnTileIdRef.current = null
        return { ...r, hand: handNext, passSlots: passNext, passSlotOrigins: passOriginsNext, selectedHandTileId: null }
      }
      return r
    })
    if (passBlockedCat) {
      setCharlestonPassError(charlestonPassBlockedMessage(passBlockedCat))
    }
  }, [setCharlestonPassError, pushRound, lastPassReturnTileIdRef])

  const onPassBoxClick = useCallback(() => {
    let passBlockedCat: 'joker' | 'blank' | null = null
    pushRound((r) => {
      if (r.charlestonPhase === 'done') return r
      const emptyIdx = firstEmptyPassSlotIndex(r.passSlots)
      if (emptyIdx < 0) return r
      const tileId = r.selectedHandTileId ?? lastPassReturnTileIdRef.current
      if (!tileId) return r
      const handIdx = r.hand.findIndex((t) => t.id === tileId)
      if (handIdx < 0) return { ...r, selectedHandTileId: null }
      const tileDef = r.hand[handIdx]!.def
      if (!charlestonPassEligible(tileDef)) {
        passBlockedCat = tileDef.cat === 'blank' ? 'blank' : 'joker'
        return { ...r, selectedHandTileId: null }
      }

      const passSlotsNext: PassSlots = [...r.passSlots]
      const handNext = [...r.hand]
      const [moved] = handNext.splice(handIdx, 1)
      const bumped = passSlotsNext[emptyIdx]
      passSlotsNext[emptyIdx] = moved
      if (bumped) handNext.push(bumped)
      const passOriginsNext: [number | null, number | null, number | null] = [...r.passSlotOrigins]
      passOriginsNext[emptyIdx] = handIdx
      lastPassReturnTileIdRef.current = null

      return { ...r, hand: handNext, passSlots: passSlotsNext, passSlotOrigins: passOriginsNext, selectedHandTileId: null }
    })
    if (passBlockedCat) {
      setCharlestonPassError(charlestonPassBlockedMessage(passBlockedCat))
    }
  }, [setCharlestonPassError, pushRound, lastPassReturnTileIdRef])

  const onPassTileClickReturn = useCallback((slotIndex: number) => {
    pushRound((r) => {
      if (r.charlestonPhase === 'done') return r
      const t = r.passSlots[slotIndex]
      if (!t) return r
      lastPassReturnTileIdRef.current = t.id
      const passSlotsNext: PassSlots = [...r.passSlots]
      passSlotsNext[slotIndex] = null
      const passOriginsNext: [number | null, number | null, number | null] = [...r.passSlotOrigins]
      passOriginsNext[slotIndex] = null
      const handNext = [...r.hand]
      handNext.push(t)
      const compacted = compactPassSlotsToRight(passSlotsNext, passOriginsNext)
      return {
        ...r,
        hand: handNext,
        passSlots: compacted.passSlots,
        passSlotOrigins: compacted.passSlotOrigins,
        selectedHandTileId:
          r.selectedHandTileId != null && handNext.some((tile) => tile.id === r.selectedHandTileId)
            ? r.selectedHandTileId
            : null,
      }
    })
  }, [pushRound, lastPassReturnTileIdRef])

  return {
    sendCharlestonPass,
    skipToCourtesyPass,
    onCharlestonPassButtonClick,
    skipBotDiscard,
    commitEastDiscard,
    returnStagedEastDiscard,
    declareMahjong,
    executeJokerSwapFromSlot,
    executeSwapFromSlot,
    sortHand,
    initiateCall,
    proceedWithCall,
    commitStagedCall,
    onHandTileActivate,
    onPassBoxClick,
    onPassTileClickReturn,
  }
}
