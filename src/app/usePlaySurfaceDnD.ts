/**
 * Play-surface DnD: sensors, collision, drag overlay, Charleston/east previews, drag handlers.
 * Owns blank-exchange popup open/commit. App reaches reset/open via {@link PlaySurfaceDnDApi}.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react'
import { applyPlayerBlankExchange } from '../mahjong/blankExchange'
import type { TileDef } from '../mahjong/types'
import {
  PointerSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { HAND_BANK_ID } from '../components/HandBank'
import {
  charlestonPassBlockedMessage,
  charlestonPassEligible,
} from '../mahjong/charleston'
import {
  BLANK_EXCHANGE_DROP_ID,
  CALL_INITIATE_FIRST_SLOT_ID,
  EAST_DISCARD_STAGING_ID,
} from '../mahjong/jokerSwapIds'
import {
  EAST_SEAT_SWAP_ID,
  findJokerSwapTargetAtEastExposure,
  findJokerSwapTargetAtExposure,
  findJokerSwapTargetAtSeat,
  findJokerSwapTargetInEastRack,
  parseBotExposureSwapDropId,
  parseBotSeatSwapDropId,
  parseEastExposureSwapDropId,
  topBandDropFrameForOverId,
  type JokerSwapTargetPick,
  type TopBandDropFrame,
} from '../mahjong/jokerSwapTarget'
import {
  PASS_BOX_ID,
  compactPassSlotsToRight,
  passDropIndex,
  reorderPassSlots,
  type PassSlots,
} from '../mahjong/passTargets'
import type { EastExposure, TileInstance } from '../mahjong/types'
import { CALL_STAGING_DROP_ID, type MainPhase } from './playSurfaceUi'
import type { RoundState } from './roundState'
import {
  collisionHitsForTileOverlappingZones,
  isActiveBotDiscardDrag,
  parseEastExposureMeldSortId,
  pointerOverBlankExchangeTarget,
  pointerOverCallInitiateTarget,
  pointerOverPassBoxTarget,
} from './playSurfaceDnDHelpers'

export type HandTilePreview = {
  tileId: string
  handPreviewIndex: number
}

/** Imperative bridge so App can reset drag UI / open blank exchange without owning the hook. */
export type PlaySurfaceDnDApi = {
  resetDragUi: () => void
  openBlankExchange: (blankTileId: string) => void
}

export type UsePlaySurfaceDnDArgs = {
  charlestonDone: boolean
  mainPhase: MainPhase
  hand: TileInstance[]
  passSlots: PassSlots
  pendingEastDiscardTile: TileInstance | null
  activeBotDiscard: TileInstance | null
  stagedCallTileIds: readonly string[]
  eastExposures: readonly EastExposure[]
  jokerSwapUiActive: boolean
  /** Game commits (blank / joker swap) — undoable. */
  pushRound: (updater: (prev: RoundState) => RoundState) => void
  /** Rack / staging edits — not undoable. */
  updateRound: (updater: (prev: RoundState) => RoundState) => void
  setPendingJokerSwapTileId: Dispatch<SetStateAction<string | null>>
  setCharlestonPassError: Dispatch<SetStateAction<string | null>>
  applyToggleStagedCallTile: (r: RoundState, tileId: string) => RoundState
  applyEastNaturalForExposedJoker: (
    r: RoundState,
    p: { rack: 'bot' | 'east'; exposureIdx: number; jokerTileId: string; eastTileId: string },
  ) => RoundState
  initiateCall: () => void
  handPanelCqwFrozenRef: MutableRefObject<boolean>
  refreshHandPanelCqwRef: MutableRefObject<() => void>
  /** Filled every render with reset/openBlank for App (Swap / new deal). */
  dndApiRef?: MutableRefObject<PlaySurfaceDnDApi | null>
}

export function usePlaySurfaceDnD(args: UsePlaySurfaceDnDArgs) {
  const {
    charlestonDone,
    mainPhase,
    hand,
    passSlots,
    pendingEastDiscardTile,
    activeBotDiscard,
    stagedCallTileIds,
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
  } = args

  const initiateCallRef = useRef(initiateCall)
  initiateCallRef.current = initiateCall

  const lastDragPointerRef = useRef({ x: 0, y: 0 })
  const globalDragPointerCleanupRef = useRef<(() => void) | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const [blankExchangeOpen, setBlankExchangeOpen] = useState<{ blankTileId: string } | null>(null)
  const closeBlankExchange = useCallback(() => {
    setBlankExchangeOpen(null)
  }, [])
  const openBlankExchange = useCallback((blankTileId: string) => {
    setBlankExchangeOpen({ blankTileId })
  }, [])
  const performBlankExchange = useCallback(
    (chosenDef: TileDef) => {
      const target = blankExchangeOpen
      if (!target) return
      pushRound((r) => {
        const next = applyPlayerBlankExchange(r, target.blankTileId, chosenDef)
        return next ? { ...r, ...next } : r
      })
      closeBlankExchange()
    },
    [blankExchangeOpen, pushRound, closeBlankExchange],
  )
  // If the player's turn ends (e.g. undo, new deal) close any open exchange popup.
  useEffect(() => {
    if (mainPhase !== 'east-discard') {
      setBlankExchangeOpen(null)
    }
  }, [mainPhase])

  const [dragOverlayTile, setDragOverlayTile] = useState<TileInstance | null>(null)
  const [dragOverlayMeldTiles, setDragOverlayMeldTiles] = useState<TileInstance[] | null>(null)
  const [dragOverlayRackSuitStacked, setDragOverlayRackSuitStacked] = useState(false)
  /** Yellow top-band drop frame while a blank / joker-swap natural is over its target. */
  const [topBandDropFrame, setTopBandDropFrame] = useState<TopBandDropFrame | null>(null)
  /** Set when a blank is dropped on the tracker: the centered tracker becomes tappable to pick a discard. */
  const blankExchangeDragArmed =
    charlestonDone &&
    mainPhase === 'east-discard' &&
    dragOverlayTile?.def.cat === 'blank' &&
    (hand.some((t) => t.id === dragOverlayTile.id) ||
      pendingEastDiscardTile?.id === dragOverlayTile.id)

  /** While dragging a Charleston pass tile over the hand, lift it into the hand sortable list so neighbours slide. */
  const [charlestonPassIntoHandPreview, setCharlestonPassIntoHandPreview] = useState<{
    tileId: string
    handPreviewIndex: number
  } | null>(null)
  /**
   * While dragging a hand tile up onto a Charleston pass slot, the pass box wins the drop target so
   * dnd-kit clears the hand's reorder transforms — the slid neighbours would otherwise snap back to
   * their home columns ("slide right"). Holding the lifted tile's id here tells the hand to preview
   * the rack *compacted* (as if the tile were already removed), which matches the dropped state, so
   * there is no jarring snap.
   */
  const [charlestonHandPassStageTileId, setCharlestonHandPassStageTileId] = useState<string | null>(null)
  /** Same idea as Charleston: while dragging staged East discard over the rack, hand list preview + phantom so neighbours slide. */
  const [eastDiscardIntoHandPreview, setEastDiscardIntoHandPreview] = useState<{
    tileId: string
    handPreviewIndex: number
  } | null>(null)

  /** While dragging the live bot discard — mounts the teal call drop box on the exposure row. */
  const [incomingBotDiscardCallDragActive, setIncomingBotDiscardCallDragActive] = useState(false)

  useEffect(() => {
    if (mainPhase !== 'bot-turn' || !activeBotDiscard) {
      setIncomingBotDiscardCallDragActive(false)
    }
  }, [mainPhase, activeBotDiscard])

  const tileDragCollisionDetection = useMemo<CollisionDetection>(
    () => (args) => {
      const aid = String(args.active.id)
      if (parseEastExposureMeldSortId(aid) != null) {
        const meldContainers = args.droppableContainers.filter(
          (c) => parseEastExposureMeldSortId(String(c.id)) != null,
        )
        if (meldContainers.length === 0) return []
        const pointerX = args.pointerCoordinates?.x ?? lastDragPointerRef.current.x
        const activeMeldContainer = meldContainers.find((c) => String(c.id) === aid)
        const activeMeldRect = activeMeldContainer ? args.droppableRects.get(activeMeldContainer.id) : null
        if (
          activeMeldContainer &&
          activeMeldRect &&
          Number.isFinite(pointerX) &&
          pointerX >= activeMeldRect.left &&
          pointerX <= activeMeldRect.left + activeMeldRect.width
        ) {
          // Keep the lifted meld's original slot reachable so neighbours can reopen around it.
          return [
            {
              id: activeMeldContainer.id,
              data: {
                droppableContainer: activeMeldContainer,
                value: 0,
              },
            },
          ]
        }
        const otherMeldContainers = meldContainers.filter((c) => String(c.id) !== aid)
        if (otherMeldContainers.length > 0 && Number.isFinite(pointerX)) {
          const byCenterX = otherMeldContainers
            .map((container) => {
              const rect = args.droppableRects.get(container.id)
              if (!rect) return null
              return {
                container,
                centerX: rect.left + rect.width / 2,
              }
            })
            .filter((x): x is { container: (typeof otherMeldContainers)[number]; centerX: number } => x != null)
            .sort((a, b) => a.centerX - b.centerX)
          const target = byCenterX.find((x) => pointerX < x.centerX) ?? byCenterX[byCenterX.length - 1]
          if (target) {
            return [
              {
                id: target.container.id,
                data: {
                  droppableContainer: target.container,
                  value: Math.abs(pointerX - target.centerX),
                },
              },
            ]
          }
        }
        return closestCenter({
          ...args,
          droppableContainers: otherMeldContainers.length > 0 ? otherMeldContainers : meldContainers,
        })
      }
      const fromPassSlot = passSlots.some((s) => s?.id === aid)
      const fromStagedDiscard = pendingEastDiscardTile?.id === aid
      const fromHandTile = hand.some((t) => t.id === aid)
      const fromBotDiscardForCall = isActiveBotDiscardDrag(aid, activeBotDiscard ?? null)

      /**
       * Joker swap: any overlap of the *dragged tile* with a bot/East exposure drop zone wins
       * (seat-wide or meld). Pointer may still be over the hand — same idea as blank→tracker.
       * Prefer seat-wide targets so the unified yellow frame (`--swap-over`) lights consistently.
       */
      const jokerSwapTileOverlapHits = (): ReturnType<CollisionDetection> => {
        if (!charlestonDone || !jokerSwapUiActive || (!fromHandTile && !fromStagedDiscard)) return []
        const dragged =
          (fromHandTile ? hand.find((t) => t.id === aid) : null) ??
          (fromStagedDiscard ? pendingEastDiscardTile : null)
        if (!dragged || dragged.def.cat === 'joker' || dragged.def.cat === 'blank') return []
        const swapContainers = args.droppableContainers.filter((c) => {
          const id = String(c.id)
          return (
            parseBotSeatSwapDropId(id) !== null ||
            parseBotExposureSwapDropId(id) !== null ||
            parseEastExposureSwapDropId(id) !== null ||
            id === EAST_SEAT_SWAP_ID
          )
        })
        if (swapContainers.length === 0) return []
        const overlapHits = rectIntersection({ ...args, droppableContainers: swapContainers })
        if (overlapHits.length === 0) return []
        const seatHit = overlapHits.find((h) => parseBotSeatSwapDropId(String(h.id)) !== null)
        if (seatHit) return [seatHit]
        const eastSeatHit = overlapHits.find((h) => String(h.id) === EAST_SEAT_SWAP_ID)
        if (eastSeatHit) return [eastSeatHit]
        const meldHit = overlapHits.find((h) => parseBotExposureSwapDropId(String(h.id)) !== null)
        if (meldHit) return [meldHit]
        const eastMeldHit = overlapHits.find((h) => parseEastExposureSwapDropId(String(h.id)) !== null)
        if (eastMeldHit) return [eastMeldHit]
        return [overlapHits[0]!]
      }

      if (fromBotDiscardForCall && charlestonDone && mainPhase === 'bot-turn') {
        const callContainers = args.droppableContainers.filter(
          (c) => String(c.id) === CALL_INITIATE_FIRST_SLOT_ID,
        )
        const callHits = collisionHitsForTileOverlappingZones(args, [CALL_INITIATE_FIRST_SLOT_ID])
        if (callHits.length > 0) return callHits
        if (callContainers.length > 0) {
          const pointerCall = pointerWithin({ ...args, droppableContainers: callContainers })
          if (pointerCall.length > 0) return pointerCall
        }
        return []
      }

      // Blank tile dragged on your turn — from the rack OR staged in the discard slot — → the sorted
      // discard tracker wins as soon as the tile overlaps it (so it can be dropped anywhere over the
      // tracker boundary). The staged path mirrors how a blank drags out of the main rack.
      if (
        charlestonDone &&
        mainPhase === 'east-discard' &&
        ((fromHandTile && hand.some((t) => t.id === aid && t.def.cat === 'blank')) ||
          (fromStagedDiscard && pendingEastDiscardTile?.def.cat === 'blank'))
      ) {
        const trackerHits = collisionHitsForTileOverlappingZones(args, [BLANK_EXCHANGE_DROP_ID])
        if (trackerHits.length > 0) return trackerHits
      }

      // Natural for joker swap: tile overlap with bot/East exposures beats hand-rack reorder so the
      // yellow frame + drop stay active whenever any part of the tile covers the drop area.
      {
        const swapHits = jokerSwapTileOverlapHits()
        if (swapHits.length > 0) return swapHits
      }

      if (fromHandTile || fromBotDiscardForCall || fromPassSlot || fromStagedDiscard) {
        if (!charlestonDone && fromHandTile) {
          // The pass strip is a thin (~1/3-tile) slot strip sitting just above the hand row, with the
          // slots hovering over the right-most hand tiles. Claiming it on any rect overlap let it
          // steal the `over` the instant a tile was lifted slightly toward it — collapsing the in-rack
          // reorder so neighbours (including the tiles under the slots) snapped back to their home
          // columns. Instead, claim once the dragged tile is horizontally over the slot strip AND
          // nudged up onto it — the tile's top edge rising above the slot strip's mid-line. At rack
          // height the tile's top sits at the hand-row top (below that line), so the in-rack reorder
          // keeps running and every tile slides as the drag crosses it; lift the tile onto a slot and
          // the pass box grabs it so it drops straight in.
          const passContainer = args.droppableContainers.find((c) => String(c.id) === PASS_BOX_ID)
          const passRect = passContainer ? args.droppableRects.get(passContainer.id) : null
          const dragRect = args.collisionRect
          if (passContainer && passRect && dragRect) {
            const cx = dragRect.left + dragRect.width / 2
            const horizontallyOverSlots = cx >= passRect.left && cx <= passRect.left + passRect.width
            const slotGrabLine = passRect.top + passRect.height / 2
            const liftedOntoSlots = dragRect.top < slotGrabLine
            if (horizontallyOverSlots && liftedOntoSlots) {
              return [
                {
                  id: passContainer.id,
                  data: { droppableContainer: passContainer, value: 0 },
                },
              ]
            }
          }
        }
        if (charlestonDone && mainPhase === 'east-discard' && (fromHandTile || fromStagedDiscard)) {
          const pointerX = args.pointerCoordinates?.x ?? lastDragPointerRef.current.x
          const pointerY = args.pointerCoordinates?.y ?? lastDragPointerRef.current.y
          const handBankContainer = args.droppableContainers.find((c) => String(c.id) === HAND_BANK_ID)
          const handBankRect = handBankContainer ? args.droppableRects.get(handBankContainer.id) : null
          const pointerOverHandBankHorizontally =
            handBankRect != null &&
            Number.isFinite(pointerX) &&
            pointerX >= handBankRect.left &&
            pointerX <= handBankRect.left + handBankRect.width
          const pointerInHandBank =
            pointerOverHandBankHorizontally &&
            handBankRect != null &&
            Number.isFinite(pointerY) &&
            pointerY >= handBankRect.top &&
            pointerY <= handBankRect.top + handBankRect.height
          // Hand → staging: accept as soon as the dragged tile overlaps the slot (pointer can
          // still be in the hand row while the tile has moved up into the exposure row).
          // Column 14 shares the rack width with the discard slot above — a horizontal-only test
          // wrongly blocked staging until the pointer moved past the right edge of the rack, so
          // this direction uses the full (both-axes) hand-bank test for the fallback.
          if (fromHandTile) {
            const stagingOverlap = collisionHitsForTileOverlappingZones(args, [EAST_DISCARD_STAGING_ID])
            if (stagingOverlap.length > 0) return stagingOverlap
            if (!pointerInHandBank) {
              const stagingContainers = args.droppableContainers.filter(
                (c) => String(c.id) === EAST_DISCARD_STAGING_ID,
              )
              if (stagingContainers.length > 0) {
                const pointerStaging = pointerWithin({ ...args, droppableContainers: stagingContainers })
                if (pointerStaging.length > 0) return pointerStaging
              }
            }
          }
          // Staging → hand (returning the staged tile to the rack): keep the hand reorder / insert
          // preview slide alive while the pointer is anywhere over the rack columns. The staged tile
          // starts out overlapping the discard slot, so a tile-overlap or vertical test would
          // suppress the rack slide for most of the drag (the tile just snaps in on release). Staging
          // only wins again once the pointer leaves the hand row horizontally.
          if (fromStagedDiscard && !pointerOverHandBankHorizontally) {
            const stagingHits = collisionHitsForTileOverlappingZones(args, [EAST_DISCARD_STAGING_ID])
            if (stagingHits.length > 0) return stagingHits
            const stagingContainers = args.droppableContainers.filter(
              (c) => String(c.id) === EAST_DISCARD_STAGING_ID,
            )
            if (stagingContainers.length > 0) {
              const pointerStaging = pointerWithin({ ...args, droppableContainers: stagingContainers })
              if (pointerStaging.length > 0) return pointerStaging
            }
          }
        }
        if (
          charlestonDone &&
          mainPhase === 'bot-turn' &&
          fromHandTile
        ) {
          const callContainers = args.droppableContainers.filter(
            (c) => String(c.id) === CALL_INITIATE_FIRST_SLOT_ID,
          )
          const callHits = collisionHitsForTileOverlappingZones(args, [CALL_INITIATE_FIRST_SLOT_ID])
          if (callHits.length > 0) return callHits
          if (callContainers.length > 0) {
            const pointerCall = pointerWithin({ ...args, droppableContainers: callContainers })
            if (pointerCall.length > 0) return pointerCall
          }
        }
      }

      const hits = pointerWithin(args)
      if (hits.length > 0) {
        const pick = (id: string | number) => hits.find((c) => c.id === id)
        if (!charlestonDone) {
          const fromHand = fromHandTile
          const passOccupant = hits.find((h) => passSlots.some((s) => s?.id === h.id))
          if (fromHand && passOccupant) {
            return [passOccupant]
          }
          if (
            fromPassSlot &&
            passOccupant &&
            String(passOccupant.id) !== aid
          ) {
            return [passOccupant]
          }
          const passBoxHit = hits.find((h) => String(h.id) === PASS_BOX_ID)
          if (fromPassSlot && passBoxHit) {
            return [passBoxHit]
          }
        }
        if (fromPassSlot || fromStagedDiscard) {
          const handTileIds = new Set(hand.map((t) => t.id))
          const overHandTile = hits.find((h) => handTileIds.has(String(h.id)))
          const handBankHit = pick(HAND_BANK_ID)
          if (overHandTile || handBankHit) {
            const pointerX = args.pointerCoordinates?.x ?? lastDragPointerRef.current.x
            const handTileContainers = args.droppableContainers.filter((c) => handTileIds.has(String(c.id)))
            if (Number.isFinite(pointerX) && handTileContainers.length > 0) {
              const byCenterX = handTileContainers
                .map((container) => {
                  const rect = args.droppableRects.get(container.id)
                  if (!rect) return null
                  return {
                    container,
                    centerX: rect.left + rect.width / 2,
                  }
                })
                .filter((x): x is { container: (typeof handTileContainers)[number]; centerX: number } => x != null)
                .sort((a, b) => a.centerX - b.centerX)
              const target = byCenterX.find((x) => pointerX < x.centerX)
              if (target) {
                return [
                  {
                    id: target.container.id,
                    data: {
                      droppableContainer: target.container,
                      value: Math.abs(pointerX - target.centerX),
                    },
                  },
                ]
              }
              // Pointer is to the right of every tile centre → appending past the last tile.
              // Resolve to the hand-bank zone (not the last tile) so crossing the last tile's
              // centre actually changes `over` and re-fires `onDragOver`. If both zones map to
              // the last tile, dnd-kit never re-fires while the pointer stays over it and the
              // gap between the two right-most tiles can never open.
              if (handBankHit) return [handBankHit]
            }
            if (overHandTile) return [overHandTile]
            if (handBankHit) return [handBankHit]
          }
        }
        // call-staging: staged tiles are useSortable, so hand↔exposure drag is
        // handled by closestCenter detecting staged tile IDs as drop targets.
        // Only fall back to the zone id when no staged tile is under the pointer
        // (e.g. dragging over the called tile or empty exposure space).
        if (
          charlestonDone &&
          mainPhase === 'call-staging' &&
          !stagedCallTileIds.includes(aid) &&
          pick(CALL_STAGING_DROP_ID) &&
          !hits.some((h) => stagedCallTileIds.includes(String(h.id)))
        ) {
          return [pick(CALL_STAGING_DROP_ID)!]
        }
        // Prefer bot/East exposure melds over the discard-tray staging zone (full-area droppable under the overlay).
        if (charlestonDone && jokerSwapUiActive) {
          const eastMeldHit = hits.find((h) => parseEastExposureSwapDropId(String(h.id)) !== null)
          if (eastMeldHit) return [eastMeldHit]
          const eastSeatHit = hits.find((h) => String(h.id) === EAST_SEAT_SWAP_ID)
          if (eastSeatHit) return [eastSeatHit]
          const meldHit = hits.find((h) => parseBotExposureSwapDropId(String(h.id)) !== null)
          if (meldHit) return [meldHit]
          const seatHit = hits.find((h) => parseBotSeatSwapDropId(String(h.id)) !== null)
          if (seatHit) return [seatHit]
        }
        const botSeatOverlap = jokerSwapTileOverlapHits()
        if (botSeatOverlap.length > 0) return [botSeatOverlap[0]!]
        if (hand.some((t) => t.id === aid)) {
          const handTileIds = new Set(hand.map((t) => t.id))
          const overHandRack =
            hits.some((h) => handTileIds.has(String(h.id))) ||
            hits.some((h) => String(h.id) === HAND_BANK_ID)
          if (overHandRack) {
            // Rack reorder is driven off the lifted tile's *edges* crossing neighbour *centres*,
            // not off the finger position or a "left my home column" test. The dragged tile's
            // measured rect (collisionRect) is the visible lifted tile translated by the drag; the
            // neighbour rects stay at their original (pre-shift) positions while dragging, so their
            // centres are stable thresholds. A neighbour only yields once the dragged tile's leading
            // edge has travelled *past that neighbour's centre* — i.e. the tile is more than half
            // overlapped — instead of jumping the instant the two tiles touch.
            type RackEntry = { id: string; container: (typeof args.droppableContainers)[number]; centerX: number }
            const rackTiles: RackEntry[] = hand
              .map((t): RackEntry | null => {
                const container = args.droppableContainers.find((c) => String(c.id) === t.id)
                const rect = container ? args.droppableRects.get(container.id) : null
                if (!container || !rect) return null
                return { id: t.id, container, centerX: rect.left + rect.width / 2 }
              })
              .filter((x): x is RackEntry => x != null)
              .sort((a, b) => a.centerX - b.centerX)

            const activeIdx = rackTiles.findIndex((x) => x.id === aid)
            const activeEntry = activeIdx >= 0 ? rackTiles[activeIdx] : null
            const activeHandRect = activeEntry ? args.droppableRects.get(activeEntry.container.id) : null

            if (activeEntry && activeHandRect) {
              const halfW = activeHandRect.width / 2
              const centerX =
                args.collisionRect != null
                  ? args.collisionRect.left + args.collisionRect.width / 2
                  : args.pointerCoordinates?.x ?? lastDragPointerRef.current.x
              const rightEdge =
                args.collisionRect != null ? args.collisionRect.left + args.collisionRect.width : centerX + halfW
              const leftEdge = args.collisionRect != null ? args.collisionRect.left : centerX - halfW

              let newIdx = activeIdx
              if (Number.isFinite(rightEdge)) {
                for (let i = activeIdx + 1; i < rackTiles.length; i++) {
                  if (rightEdge > rackTiles[i]!.centerX) newIdx = i
                  else break
                }
              }
              if (newIdx === activeIdx && Number.isFinite(leftEdge)) {
                for (let i = activeIdx - 1; i >= 0; i--) {
                  if (leftEdge < rackTiles[i]!.centerX) newIdx = i
                  else break
                }
              }
              // newIdx === activeIdx returns the lifted tile's own slot (no shift) and keeps the
              // home column reachable so neighbours can reopen around it.
              const overEntry = rackTiles[newIdx] ?? activeEntry
              return [
                {
                  id: overEntry.container.id,
                  data: {
                    droppableContainer: overEntry.container,
                    value: Number.isFinite(centerX) ? Math.abs(centerX - overEntry.centerX) : 0,
                  },
                },
              ]
            }
          }
        }
        // Seat-wide joker swap when the pointer is just outside the meld rect but the tile overlaps.
        if (charlestonDone && jokerSwapUiActive) {
          const swapHits = jokerSwapTileOverlapHits()
          if (swapHits.length > 0) return swapHits
        }
      }
      const botSeatOverlap = jokerSwapTileOverlapHits()
      if (botSeatOverlap.length > 0) return botSeatOverlap
      return closestCenter(args)
    },
    [
      charlestonDone,
      mainPhase,
      jokerSwapUiActive,
      passSlots,
      hand,
      pendingEastDiscardTile,
      stagedCallTileIds,
      activeBotDiscard?.id,
    ],
  )

  const pinHandRackGeometryForMobileDrag = useCallback(() => {
    if (typeof window === 'undefined' || !window.matchMedia('(pointer: coarse)').matches) return
    // Freeze panel width tokens only. Height pins on `.rack-stage__rack-top` / `.hand-bank` caused
    // a persistent dead band between the green exposure slots and the hand row when the pinned box
    // was taller than the compact strip (inline height stuck or content top-aligned in the box).
    // The jog is handled by composited tile faces (part-0008) + this cqw freeze.
    handPanelCqwFrozenRef.current = true
  }, [])

  const releaseHandRackGeometryAfterMobileDrag = useCallback(() => {
    handPanelCqwFrozenRef.current = false
    refreshHandPanelCqwRef.current()
  }, [])

  const onDragStart = useCallback(
    (e: DragStartEvent) => {
      pinHandRackGeometryForMobileDrag()
      setTopBandDropFrame(null)
      setCharlestonPassIntoHandPreview(null)
      setEastDiscardIntoHandPreview(null)
      globalDragPointerCleanupRef.current?.()
      const aev = e.activatorEvent
      if (aev && 'clientX' in aev) {
        const pe = aev as PointerEvent
        lastDragPointerRef.current = { x: pe.clientX, y: pe.clientY }
      }
      const onGlobalPtr = (ev: PointerEvent) => {
        lastDragPointerRef.current = { x: ev.clientX, y: ev.clientY }
      }
      window.addEventListener('pointermove', onGlobalPtr, { passive: true })
      globalDragPointerCleanupRef.current = () => {
        window.removeEventListener('pointermove', onGlobalPtr)
        globalDragPointerCleanupRef.current = null
      }
      const id = String(e.active.id)
      const exposureMeldIdx = parseEastExposureMeldSortId(id)
      if (exposureMeldIdx != null) {
        const exp = eastExposures[exposureMeldIdx]
        setDragOverlayTile(null)
        setDragOverlayMeldTiles(exp ? exp.tiles : null)
        setDragOverlayRackSuitStacked(true)
        return
      }
      const fromHand = hand.find((t) => t.id === id)
      const fromLiveBotDiscard = isActiveBotDiscardDrag(id, activeBotDiscard ?? null)
      if (fromLiveBotDiscard) {
        setIncomingBotDiscardCallDragActive(true)
      }
      if (fromHand || fromLiveBotDiscard) {
        setDragOverlayTile(fromHand ?? activeBotDiscard ?? null)
        setDragOverlayMeldTiles(null)
        setDragOverlayRackSuitStacked(true)
        return
      }
      for (const s of passSlots) {
        if (s?.id === id) {
          setDragOverlayTile(s)
          setDragOverlayMeldTiles(null)
          setDragOverlayRackSuitStacked(true)
          return
        }
      }
      if (pendingEastDiscardTile?.id === id) {
        setDragOverlayTile(pendingEastDiscardTile)
        setDragOverlayMeldTiles(null)
        setDragOverlayRackSuitStacked(true)
        return
      }
      setDragOverlayTile(null)
      setDragOverlayMeldTiles(null)
      setDragOverlayRackSuitStacked(false)
    },
    [
      hand,
      passSlots,
      pendingEastDiscardTile,
      charlestonDone,
      mainPhase,
      activeBotDiscard,
      eastExposures,
      pinHandRackGeometryForMobileDrag,
    ],
  )

  const handVisualInsertIndexFromPointer = useCallback(() => {
    const pointerX = lastDragPointerRef.current.x
    if (!Number.isFinite(pointerX)) return null
    const elementsById = new Map<string, HTMLElement>()
    document.querySelectorAll<HTMLElement>('.hand-row [data-hand-tile-id]').forEach((el) => {
      const id = el.dataset.handTileId
      if (id) elementsById.set(id, el)
    })
    const centers = hand
      .map((tile, index) => {
        const el = elementsById.get(tile.id)
        if (!el) return null
        const rect = el.getBoundingClientRect()
        if (rect.width < 1) return null
        return { index, centerX: rect.left + rect.width / 2 }
      })
      .filter((x): x is { index: number; centerX: number } => x != null)
      .sort((a, b) => a.centerX - b.centerX)
    if (centers.length === 0) return null
    return centers.find((x) => pointerX < x.centerX)?.index ?? hand.length
  }, [hand])

  const handInsertIndexFromOver = useCallback(
    (over: { rect: { left: number; width: number } }, overHandIdx: number) => {
      const visualIndex = handVisualInsertIndexFromPointer()
      if (visualIndex != null) return visualIndex

      const rect = over.rect
      const centerX = rect.left + rect.width / 2
      const pointerX = lastDragPointerRef.current.x
      return pointerX > centerX ? Math.min(overHandIdx + 1, hand.length) : overHandIdx
    },
    [hand.length, handVisualInsertIndexFromPointer],
  )

  const onDragOver = useCallback(
    (e: DragOverEvent) => {
      const aid = String(e.active.id)
      const nextFrame = topBandDropFrameForOverId(e.over ? String(e.over.id) : null)
      setTopBandDropFrame((prev) => (prev === nextFrame ? prev : nextFrame))
      if (charlestonDone) {
        if (mainPhase === 'east-discard' && pendingEastDiscardTile && aid === pendingEastDiscardTile.id) {
          const over = e.over
          if (!over) {
            setEastDiscardIntoHandPreview(null)
            return
          }
          const oid = String(over.id)
          if (oid === HAND_BANK_ID) {
            const handPreviewIndex = handVisualInsertIndexFromPointer() ?? hand.length
            setEastDiscardIntoHandPreview((prev) =>
              prev?.tileId === aid && prev.handPreviewIndex === handPreviewIndex
                ? prev
                : { tileId: aid, handPreviewIndex },
            )
            return
          }
          const overHandIdx = hand.findIndex((t) => t.id === oid)
          if (overHandIdx >= 0) {
            const handPreviewIndex = handInsertIndexFromOver(over, overHandIdx)
            setEastDiscardIntoHandPreview((prev) =>
              prev?.tileId === aid && prev.handPreviewIndex === handPreviewIndex
                ? prev
                : { tileId: aid, handPreviewIndex },
            )
            return
          }
          setEastDiscardIntoHandPreview(null)
        } else {
          setEastDiscardIntoHandPreview(null)
        }
        return
      }
      const passFromIdx = passSlots.findIndex((s) => s?.id === aid)
      if (passFromIdx < 0) {
        setCharlestonPassIntoHandPreview(null)
        // Hand tile lifted onto a pass slot → preview the rack compacting (tile removed) so the slid
        // neighbours don't snap back to home when the pass box takes the drop target.
        const overId = e.over ? String(e.over.id) : null
        setCharlestonHandPassStageTileId(
          overId === PASS_BOX_ID && hand.some((t) => t.id === aid) ? aid : null,
        )
        return
      }
      setCharlestonHandPassStageTileId(null)
      const over = e.over
      if (!over) {
        setCharlestonPassIntoHandPreview(null)
        return
      }
      const oid = String(over.id)
      if (oid === HAND_BANK_ID) {
        const handPreviewIndex = handVisualInsertIndexFromPointer() ?? hand.length
        setCharlestonPassIntoHandPreview((prev) =>
          prev?.tileId === aid && prev.handPreviewIndex === handPreviewIndex
            ? prev
            : { tileId: aid, handPreviewIndex },
        )
        return
      }
      const overHandIdx = hand.findIndex((t) => t.id === oid)
      if (overHandIdx >= 0) {
        const handPreviewIndex = handInsertIndexFromOver(over, overHandIdx)
        setCharlestonPassIntoHandPreview((prev) =>
          prev?.tileId === aid && prev.handPreviewIndex === handPreviewIndex
            ? prev
            : { tileId: aid, handPreviewIndex },
        )
        return
      }
      setCharlestonPassIntoHandPreview(null)
    },
    [
      charlestonDone,
      mainPhase,
      pendingEastDiscardTile,
      passSlots,
      hand,
      handInsertIndexFromOver,
      handVisualInsertIndexFromPointer,
    ],
  )

  const onDragCancel = useCallback(() => {
    releaseHandRackGeometryAfterMobileDrag()
    setIncomingBotDiscardCallDragActive(false)
    setTopBandDropFrame(null)
    setCharlestonPassIntoHandPreview(null)
    setEastDiscardIntoHandPreview(null)
    setCharlestonHandPassStageTileId(null)
    setDragOverlayTile(null)
    setDragOverlayMeldTiles(null)
    setDragOverlayRackSuitStacked(false)
  }, [releaseHandRackGeometryAfterMobileDrag])

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      setTopBandDropFrame(null)
      const { active, over } = e
      const aid = String(active.id)
      const passTileStillOverPassBox =
        !charlestonDone &&
        passSlots.some((s) => s?.id === aid) &&
        pointerOverPassBoxTarget(lastDragPointerRef.current)
      try {
        // Blank dropped anywhere over the discard tracker (your turn) → open the centered exchange
        // popup. Accepts a blank dragged from the hand OR one staged in the discard slot. Checked
        // first (with a pointer-position fallback) so it works even if dnd-kit hasn't measured the
        // tracker droppable for this drag.
        const draggedBlankForExchange =
          hand.some((t) => t.id === aid && t.def.cat === 'blank') ||
          (pendingEastDiscardTile?.id === aid && pendingEastDiscardTile.def.cat === 'blank')
        if (
          charlestonDone &&
          mainPhase === 'east-discard' &&
          draggedBlankForExchange &&
          (String(over?.id) === BLANK_EXCHANGE_DROP_ID ||
            pointerOverBlankExchangeTarget(lastDragPointerRef.current))
        ) {
          openBlankExchange(aid)
          return
        }
        if (!over) {
          if (
            isActiveBotDiscardDrag(aid, activeBotDiscard ?? null) &&
            pointerOverCallInitiateTarget(lastDragPointerRef.current)
          ) {
            initiateCallRef.current()
            return
          }
          if (passTileStillOverPassBox) {
            return
          }
          if (!charlestonDone && passSlots.some((s) => s?.id === aid)) {
            updateRound((r) => {
              if (r.charlestonPhase === 'done') return r
              const passFromIdx = r.passSlots.findIndex((s) => s?.id === aid)
              if (passFromIdx < 0) return r
              const passSlotsNext: PassSlots = [...r.passSlots]
              const passOriginsNext: [number | null, number | null, number | null] = [...r.passSlotOrigins]
              const tile = passSlotsNext[passFromIdx]
              passSlotsNext[passFromIdx] = null
              passOriginsNext[passFromIdx] = null
              const handNext = [...r.hand]
              if (tile) handNext.push(tile)
              const compacted = compactPassSlotsToRight(passSlotsNext, passOriginsNext)
              return {
                ...r,
                hand: handNext,
                passSlots: compacted.passSlots,
                passSlotOrigins: compacted.passSlotOrigins,
                selectedHandTileId: null,
              }
            })
            return
          }
          /* Charleston: release outside any droppable → park tile on the right end of the rack. */
          if (!charlestonDone && hand.some((t) => t.id === aid)) {
            updateRound((r) => {
              if (r.charlestonPhase === 'done') return r
              const idx = r.hand.findIndex((t) => t.id === aid)
              if (idx < 0) return r
              const hn = [...r.hand]
              const [tile] = hn.splice(idx, 1)
              hn.push(tile)
              return { ...r, hand: hn, selectedHandTileId: null }
            })
          }
          return
        }
        const oid = String(over.id)

        const exposureFromIdx = parseEastExposureMeldSortId(aid)
        const exposureToIdx = parseEastExposureMeldSortId(oid)
        if (exposureFromIdx != null && exposureToIdx != null) {
          if (exposureFromIdx !== exposureToIdx) {
            updateRound((r) => {
              if (exposureFromIdx >= r.eastExposures.length || exposureToIdx >= r.eastExposures.length) {
                return r
              }
              return {
                ...r,
                eastExposures: arrayMove(r.eastExposures, exposureFromIdx, exposureToIdx),
              }
            })
          }
          return
        }

        if (
          oid === CALL_INITIATE_FIRST_SLOT_ID ||
          (isActiveBotDiscardDrag(aid, activeBotDiscard ?? null) &&
            pointerOverCallInitiateTarget(lastDragPointerRef.current))
        ) {
          if (hand.some((t) => t.id === aid) || isActiveBotDiscardDrag(aid, activeBotDiscard ?? null)) {
            initiateCallRef.current()
          }
          return
        }

        // ── call-staging cross-zone drag ──────────────────────────────────────────
        if (mainPhase === 'call-staging') {
          const aidStaged = stagedCallTileIds.includes(aid)
          const oidStaged = stagedCallTileIds.includes(oid)
          const oidIsHandTile = !oidStaged && hand.some((t) => t.id === oid)

          // Staged tile dragged down to a hand tile position → un-stage + reorder
          if (aidStaged && oidIsHandTile) {
            updateRound((r) => {
              const unstagedR = applyToggleStagedCallTile(r, aid)
              const fromIdx = unstagedR.hand.findIndex((t) => t.id === aid)
              const toIdx = unstagedR.hand.findIndex((t) => t.id === oid)
              if (fromIdx >= 0 && toIdx >= 0 && fromIdx !== toIdx) {
                return { ...unstagedR, hand: arrayMove(unstagedR.hand, fromIdx, toIdx) }
              }
              return unstagedR
            })
            return
          }
          // Staged tile dropped on hand bank (no specific tile target) → un-stage in place
          if (aidStaged && oid === HAND_BANK_ID) {
            updateRound((r) => applyToggleStagedCallTile(r, aid))
            return
          }
          // Hand tile dragged up to a staged slot or exposure zone → stage it
          if (!aidStaged && (oidStaged || oid === CALL_STAGING_DROP_ID)) {
            updateRound((r) => applyToggleStagedCallTile(r, aid))
            return
          }
        }

        // Joker swap: your exposures, your row, or any bot exposure rack (same rules: natural for joker).
        const eastExposureSwapIdx = parseEastExposureSwapDropId(oid)
        const eastSeat = oid === EAST_SEAT_SWAP_ID
        const exposureSwapIdx = parseBotExposureSwapDropId(oid)
        const seatSwap = parseBotSeatSwapDropId(oid)
        if (jokerSwapUiActive && (eastExposureSwapIdx !== null || eastSeat || exposureSwapIdx !== null || seatSwap)) {
          pushRound((r) => {
            const fromHand = r.hand.find((t) => t.id === aid)
            const fromPending = !fromHand && r.pendingEastDiscardTile?.id === aid
              ? r.pendingEastDiscardTile
              : null
            const natural = fromHand ?? fromPending
            if (!natural || natural.def.cat === 'joker') return r

            let pick: JokerSwapTargetPick | null = null
            if (eastExposureSwapIdx !== null) {
              pick = findJokerSwapTargetAtEastExposure(
                r.eastExposures,
                eastExposureSwapIdx,
                natural.def,
              )
            } else if (eastSeat) {
              pick = findJokerSwapTargetInEastRack(r.eastExposures, natural.def)
            } else if (exposureSwapIdx !== null) {
              pick = findJokerSwapTargetAtExposure(
                r.botExposures,
                exposureSwapIdx,
                natural.def,
              )
            } else if (seatSwap) {
              pick = findJokerSwapTargetAtSeat(r.botExposures, seatSwap, natural.def)
            }
            if (!pick) return r
            return applyEastNaturalForExposedJoker(r, { ...pick, eastTileId: aid })
          })
          setPendingJokerSwapTileId(null)
          return
        }

        let passBlockedCat: 'joker' | 'blank' | null = null
        updateRound((r) => {
      const passSlotsNext: PassSlots = [...r.passSlots]
      const handNext = [...r.hand]
      const handIdx = handNext.findIndex((t) => t.id === aid)
      const passFromIdx = passSlotsNext.findIndex((s) => s?.id === aid)
      const overHandIdx = handNext.findIndex((t) => t.id === oid)
      const passToIdx =
        passFromIdx >= 0 && oid === PASS_BOX_ID
          ? null
          : passDropIndex(oid, passSlotsNext)
      const blockPass = r.charlestonPhase === 'done'

      if (!blockPass && passFromIdx >= 0 && passTileStillOverPassBox && passToIdx === null) {
        return r
      }

      if (r.mainPhase === 'east-discard' && r.pendingEastDiscardTile?.id === aid && oid === HAND_BANK_ID) {
        const t = r.pendingEastDiscardTile
        const handNext2 = [...r.hand]
        const insertIdx = Math.min(
          handVisualInsertIndexFromPointer() ?? r.pendingEastDiscardIdx ?? handNext2.length,
          handNext2.length,
        )
        handNext2.splice(insertIdx, 0, t)
        return { ...r, hand: handNext2, pendingEastDiscardTile: null, pendingEastDiscardIdx: null, selectedHandTileId: null }
      }
      if (
        r.mainPhase === 'east-discard' &&
        r.pendingEastDiscardTile?.id === aid &&
        overHandIdx >= 0
      ) {
        const t = r.pendingEastDiscardTile
        const hn = [...r.hand]
        const insertIdx = handInsertIndexFromOver(over, overHandIdx)
        hn.splice(insertIdx, 0, t)
        return { ...r, hand: hn, pendingEastDiscardTile: null, pendingEastDiscardIdx: null, selectedHandTileId: null }
      }
      if (r.mainPhase === 'east-discard' && oid === EAST_DISCARD_STAGING_ID && handIdx >= 0) {
        const moved = handNext[handIdx]!
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
        return { ...r, hand: handAfter, pendingEastDiscardTile: moved, pendingEastDiscardIdx: handIdx, selectedHandTileId: null }
      }
      if (r.mainPhase === 'call-staging' && oid === CALL_STAGING_DROP_ID && handIdx >= 0) {
        return applyToggleStagedCallTile(r, aid)
      }

      if (handIdx >= 0 && overHandIdx >= 0 && handIdx !== overHandIdx) {
        return { ...r, hand: arrayMove(handNext, handIdx, overHandIdx), selectedHandTileId: null }
      }

      /* Charleston: dropped on hand bank or full pass box → cancel pass, tile to rack end. */
      if (!blockPass && handIdx >= 0 && oid === HAND_BANK_ID) {
        const moved = handNext[handIdx]!
        handNext.splice(handIdx, 1)
        handNext.push(moved)
        return { ...r, hand: handNext, selectedHandTileId: null }
      }
      if (!blockPass && handIdx >= 0 && oid === PASS_BOX_ID && passToIdx === null) {
        const moved = handNext[handIdx]!
        handNext.splice(handIdx, 1)
        handNext.push(moved)
        return { ...r, hand: handNext, selectedHandTileId: null }
      }

      if (!blockPass && passFromIdx >= 0 && passToIdx !== null && handIdx < 0) {
        if (passFromIdx === passToIdx) return { ...r, selectedHandTileId: null }
        const reordered = reorderPassSlots(r.passSlots, r.passSlotOrigins, passFromIdx, passToIdx)
        return {
          ...r,
          passSlots: reordered.passSlots,
          passSlotOrigins: reordered.passSlotOrigins,
          selectedHandTileId: null,
        }
      }

      if (!blockPass && handIdx >= 0 && passToIdx !== null) {
        const moved = handNext[handIdx]!
        if (!charlestonPassEligible(moved.def)) {
          passBlockedCat = moved.def.cat === 'blank' ? 'blank' : 'joker'
          return r
        }
        handNext.splice(handIdx, 1)
        const bumped = passSlotsNext[passToIdx]
        const passOriginsNext: [number | null, number | null, number | null] = [...r.passSlotOrigins]
        if (bumped) {
          handNext.push(bumped)
        }
        passSlotsNext[passToIdx] = moved
        passOriginsNext[passToIdx] = handIdx
        return { ...r, hand: handNext, passSlots: passSlotsNext, passSlotOrigins: passOriginsNext, selectedHandTileId: null }
      }

      if (passFromIdx >= 0 && oid === HAND_BANK_ID) {
        const t = passSlotsNext[passFromIdx]
        passSlotsNext[passFromIdx] = null
        const passOriginsNext: [number | null, number | null, number | null] = [...r.passSlotOrigins]
        passOriginsNext[passFromIdx] = null
        const insertIdx = Math.min(handVisualInsertIndexFromPointer() ?? handNext.length, handNext.length)
        if (t) handNext.splice(insertIdx, 0, t)
        const compacted = compactPassSlotsToRight(passSlotsNext, passOriginsNext)
        return {
          ...r,
          hand: handNext,
          passSlots: compacted.passSlots,
          passSlotOrigins: compacted.passSlotOrigins,
        }
      }

      if (passFromIdx >= 0 && overHandIdx >= 0) {
        const t = passSlotsNext[passFromIdx]
        passSlotsNext[passFromIdx] = null
        const passOriginsNext: [number | null, number | null, number | null] = [...r.passSlotOrigins]
        passOriginsNext[passFromIdx] = null
        const insertIdx = handInsertIndexFromOver(over, overHandIdx)
        if (t) handNext.splice(insertIdx, 0, t)
        const compacted = compactPassSlotsToRight(passSlotsNext, passOriginsNext)
        return {
          ...r,
          hand: handNext,
          passSlots: compacted.passSlots,
          passSlotOrigins: compacted.passSlotOrigins,
        }
      }

      return r
    })
        if (passBlockedCat) {
          setCharlestonPassError(charlestonPassBlockedMessage(passBlockedCat))
        }
      } finally {
        releaseHandRackGeometryAfterMobileDrag()
        globalDragPointerCleanupRef.current?.()
        setIncomingBotDiscardCallDragActive(false)
        setDragOverlayTile(null)
        setDragOverlayMeldTiles(null)
        setDragOverlayRackSuitStacked(false)
        setCharlestonPassIntoHandPreview(null)
        setEastDiscardIntoHandPreview(null)
        setCharlestonHandPassStageTileId(null)
      }
    },
    [
      hand,
      charlestonDone,
      releaseHandRackGeometryAfterMobileDrag,
      jokerSwapUiActive,
      mainPhase,
      passSlots,
      pendingEastDiscardTile,
      openBlankExchange,
      stagedCallTileIds,
      pushRound,
      updateRound,
      initiateCallRef,
      activeBotDiscard?.id,
      handInsertIndexFromOver,
      handVisualInsertIndexFromPointer,
      applyToggleStagedCallTile,
      applyEastNaturalForExposedJoker,
      setPendingJokerSwapTileId,
      setCharlestonPassError,
    ],
  )


  const resetDragUi = useCallback(() => {
    setIncomingBotDiscardCallDragActive(false)
    setTopBandDropFrame(null)
    setDragOverlayTile(null)
    setDragOverlayMeldTiles(null)
    setDragOverlayRackSuitStacked(false)
    setCharlestonPassIntoHandPreview(null)
    setEastDiscardIntoHandPreview(null)
    setCharlestonHandPassStageTileId(null)
    setBlankExchangeOpen(null)
  }, [])

  if (dndApiRef) {
    dndApiRef.current = { resetDragUi, openBlankExchange }
  }

  return {
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
    openBlankExchange,
    closeBlankExchange,
    performBlankExchange,
    charlestonPassIntoHandPreview,
    charlestonHandPassStageTileId,
    eastDiscardIntoHandPreview,
    incomingBotDiscardCallDragActive,
    resetDragUi,
  }
}
