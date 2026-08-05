/**
 * Keep the player seat label vertically centered between the top discard tracker and the hand
 * rack (or below a call meld when one is pinned in the exposure area).
 */
import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react'
import type { MainPhase } from './playSurfaceUi'

/** After Charleston→main remount, skip `top` easing while layout settle timers run. */
const CHARLESTON_SETTLE_MS = 400

export function usePlayerSeatLabelLayout(args: {
  playerHandRackBottomRef: RefObject<HTMLDivElement | null>
  topDiscardTrackerPanelRef: RefObject<HTMLElement | null>
  eastExposureRackTopRef: RefObject<HTMLDivElement | null>
  charlestonDone: boolean
  mainPhase: MainPhase
  showPlaySplitRow: boolean
  callMeldInsetCols: number
  hasPlayerExposures: boolean
  handLength: number
  /** Retrigger when call-initiate drop target mounts/unmounts. */
  incomingBotDiscardCallDragActive: boolean
}) {
  const {
    playerHandRackBottomRef,
    topDiscardTrackerPanelRef,
    eastExposureRackTopRef,
    charlestonDone,
    mainPhase,
    showPlaySplitRow,
    callMeldInsetCols,
    hasPlayerExposures,
    handLength,
    incomingBotDiscardCallDragActive,
  } = args

  const lastTopRef = useRef<string | null>(null)
  const meldPinnedRef = useRef(false)
  const prevCharlestonDoneRef = useRef(charlestonDone)
  const suppressTransitionUntilRef = useRef(0)

  const updatePlayerSeatLabelPosition = useCallback(() => {
    const rackBottom = playerHandRackBottomRef.current
    if (!rackBottom) return
    const handTray = rackBottom.closest('.panel-hand-rack__hand-tray') as HTMLElement | null

    const rbRect = rackBottom.getBoundingClientRect()
    const handTop = rbRect.top
    const topTracker =
      topDiscardTrackerPanelRef.current ??
      (rackBottom.closest('.app-dnd-frame')?.querySelector(
        '.app-top-exposure-container .panel--discard-tracker',
      ) as HTMLElement | null)

    const bandTop = topTracker
      ? topTracker.getBoundingClientRect().bottom
      : (rackBottom.closest('.panel-hand-rack') as HTMLElement | null)?.getBoundingClientRect()
          .top ?? handTop
    const bandH = Math.max(0, handTop - bandTop)

    const setLabelTop = (topPx: string, animate: boolean) => {
      lastTopRef.current = topPx
      // Label lives on the hand-tray (above rack-top stacking); keep the token there.
      const host = handTray ?? rackBottom
      host.style.setProperty('--player-seat-label-top', topPx)
      // Set `top` on the label itself so `transition: top` interpolates (var-only updates
      // often skip the transition in WebKit).
      const label = host.querySelector(
        ':scope > .panel-hand-rack__seat-label',
      ) as HTMLElement | null
      if (!label) return

      // `transition: top` is only for call-meld pin/unpin. Charleston remount + settle/resize
      // passes must snap — otherwise the label eases down on a bad mid-layout sample, then up.
      const allowAnimate =
        animate && performance.now() >= suppressTransitionUntilRef.current
      if (!allowAnimate) {
        label.style.transition = 'none'
      } else {
        label.style.removeProperty('transition')
      }
      label.style.top = topPx
      if (!allowAnimate) {
        requestAnimationFrame(() => {
          label.style.removeProperty('transition')
        })
      }
    }

    // Call meld pinned in the exposure area (staged during call-staging or committed): it sits at
    // the rack's left column and spans the full rack height, so the label can't sit above the hand
    // (it hides behind the meld). Drop it into the empty band below the meld — between the meld's
    // bottom and the action-button row — as soon as the meld appears.
    //
    // Prefer `.exposure-rack__call-meld-strip__inner` (full `--rack-tile-h` layout box that hangs
    // over the hand tray). Tile slots alone can read short when strip chrome is only ⅓ tile tall
    // (win-hand dump fit tracks). Still avoid `.tile-face` — fly-up transforms move that rect.
    const rackTop = eastExposureRackTopRef.current
    const meldInners = rackTop?.querySelectorAll(
      '.exposure-rack__call-meld-strip__inner',
    )
    const meldTiles = rackTop?.querySelectorAll(
      '.exposure-rack__call-meld-strip__tile',
    )
    const meldPinned = Boolean(
      (meldInners && meldInners.length > 0) || (meldTiles && meldTiles.length > 0),
    )
    const animateForMeld = meldPinned !== meldPinnedRef.current
    meldPinnedRef.current = meldPinned

    if (meldPinned) {
      let meldBottom = -Infinity
      const measure = (els: NodeListOf<Element> | undefined) => {
        els?.forEach((el) => {
          meldBottom = Math.max(meldBottom, el.getBoundingClientRect().bottom)
        })
      }
      // Max of both — win-dump strip chrome is ⅓ tile; inners/tiles carry the hanging face box.
      measure(meldInners)
      measure(meldTiles)
      const actionWell = handTray?.querySelector(
        '.panel-hand-rack__action-well',
      ) as HTMLElement | null
      const bandBottom = actionWell
        ? actionWell.getBoundingClientRect().top
        : rbRect.bottom
      const belowMeldMid = (meldBottom + bandBottom) / 2
      // Offset from hand-tray top (label is absolutely positioned on the tray).
      const trayTop = (handTray ?? rackBottom).getBoundingClientRect().top
      setLabelTop(`${belowMeldMid - trayTop}px`, animateForMeld)
      return
    }

    const centerOffset = bandH > 0 ? -bandH / 2 : -8
    // Same visual as before: offset from rack-bottom top ≈ hand-tray top (label is out of flow).
    setLabelTop(`${centerOffset}px`, animateForMeld)
  }, [playerHandRackBottomRef, topDiscardTrackerPanelRef, eastExposureRackTopRef])

  useLayoutEffect(() => {
    if (prevCharlestonDoneRef.current !== charlestonDone) {
      // Charleston and main racks use separate hand-tray trees — the label remounts and would
      // otherwise start at the CSS fallback (-0.35rem) then ease through settle samples.
      suppressTransitionUntilRef.current = performance.now() + CHARLESTON_SETTLE_MS
      prevCharlestonDoneRef.current = charlestonDone

      const rackBottom = playerHandRackBottomRef.current
      const handTray = rackBottom?.closest('.panel-hand-rack__hand-tray') as HTMLElement | null
      const label = handTray?.querySelector(
        ':scope > .panel-hand-rack__seat-label',
      ) as HTMLElement | null
      if (label && lastTopRef.current) {
        label.style.transition = 'none'
        handTray?.style.setProperty('--player-seat-label-top', lastTopRef.current)
        label.style.top = lastTopRef.current
      }
    }

    updatePlayerSeatLabelPosition()

    const rackBottom = playerHandRackBottomRef.current
    if (!rackBottom) return

    let raf = 0
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(raf)
      raf = window.requestAnimationFrame(updatePlayerSeatLabelPosition)
    }

    const topTracker =
      topDiscardTrackerPanelRef.current ??
      (rackBottom.closest('.app-dnd-frame')?.querySelector(
        '.app-top-exposure-container .panel--discard-tracker',
      ) as HTMLElement | null)
    const rackTop = eastExposureRackTopRef.current
    const panelHandRack = rackBottom.closest('.panel-hand-rack')

    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(scheduleUpdate)
      ro.observe(rackBottom)
      if (topTracker) ro.observe(topTracker)
      if (rackTop) ro.observe(rackTop)
      if (panelHandRack) ro.observe(panelHandRack)
    } else {
      window.addEventListener('resize', scheduleUpdate)
    }
    window.addEventListener('orientationchange', scheduleUpdate)
    window.visualViewport?.addEventListener('resize', scheduleUpdate)
    const settleTimers = [80, 180, 360].map((delay) => window.setTimeout(scheduleUpdate, delay))

    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', scheduleUpdate)
      window.removeEventListener('orientationchange', scheduleUpdate)
      window.visualViewport?.removeEventListener('resize', scheduleUpdate)
      settleTimers.forEach((id) => window.clearTimeout(id))
      window.cancelAnimationFrame(raf)
    }
  }, [
    updatePlayerSeatLabelPosition,
    playerHandRackBottomRef,
    topDiscardTrackerPanelRef,
    eastExposureRackTopRef,
    charlestonDone,
    mainPhase,
    showPlaySplitRow,
    callMeldInsetCols,
    hasPlayerExposures,
    handLength,
    incomingBotDiscardCallDragActive,
  ])
}
