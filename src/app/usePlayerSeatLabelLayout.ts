/**
 * Keep the player seat label vertically centered between the top discard tracker and the hand
 * rack (or below a call meld when one is pinned in the exposure area).
 */
import { useCallback, useLayoutEffect, type RefObject } from 'react'
import type { MainPhase } from './playSurfaceUi'

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

    const setLabelTop = (topPx: string) => {
      // Label lives on the hand-tray (above rack-top stacking); keep the token there.
      const host = handTray ?? rackBottom
      host.style.setProperty('--player-seat-label-top', topPx)
      // Set `top` on the label itself so `transition: top` interpolates (var-only updates
      // often skip the transition in WebKit).
      const label = host.querySelector(
        ':scope > .panel-hand-rack__seat-label',
      ) as HTMLElement | null
      if (label) label.style.top = topPx
    }

    // Call meld pinned in the exposure area (staged during call-staging or committed): it sits at
    // the rack's left column and spans the full rack height, so the label can't sit above the hand
    // (it hides behind the meld). Drop it into the empty band below the meld — between the meld's
    // bottom and the action-button row — as soon as the meld appears.
    //
    // Measure the layout slot (not `.tile-face`): fly-up transforms move the face's
    // getBoundingClientRect, and settle/RAF samples were snapping the label up in jumps.
    const rackTop = eastExposureRackTopRef.current
    const meldSlots = rackTop?.querySelectorAll(
      '.exposure-rack__call-meld-strip__tile',
    )
    if (meldSlots && meldSlots.length > 0) {
      let meldBottom = -Infinity
      meldSlots.forEach((el) => {
        meldBottom = Math.max(meldBottom, el.getBoundingClientRect().bottom)
      })
      const actionWell = handTray?.querySelector(
        '.panel-hand-rack__action-well',
      ) as HTMLElement | null
      const bandBottom = actionWell
        ? actionWell.getBoundingClientRect().top
        : rbRect.bottom
      const belowMeldMid = (meldBottom + bandBottom) / 2
      // Offset from hand-tray top (label is absolutely positioned on the tray).
      const trayTop = (handTray ?? rackBottom).getBoundingClientRect().top
      setLabelTop(`${belowMeldMid - trayTop}px`)
      return
    }

    const centerOffset = bandH > 0 ? -bandH / 2 : -8
    // Same visual as before: offset from rack-bottom top ≈ hand-tray top (label is out of flow).
    setLabelTop(`${centerOffset}px`)
  }, [playerHandRackBottomRef, topDiscardTrackerPanelRef, eastExposureRackTopRef])

  useLayoutEffect(() => {
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
