/**
 * Win-celebrate motion was tuned on a roomy desktop play surface. On phone / PWA
 * landscape the MahJ control already fills more of the short axis, so the same
 * absolute scale / px velocities look oversized. Scale extras from how big the
 * origin control is vs a desktop reference share of the viewport.
 */

const REF_BTN_VIEWPORT_SHARE = 0.055
/** Desktop-tuned peak scale and rise (rem @ 16px). */
export const WIN_BTN_PEAK_SCALE = 1.9
export const WIN_BTN_PEAK_RISE_REM = 2.35

export function viewportCssSize(): { width: number; height: number } {
  const vv = window.visualViewport
  return {
    width: Math.max(1, Math.round(vv?.width ?? window.innerWidth)),
    height: Math.max(1, Math.round(vv?.height ?? window.innerHeight)),
  }
}

/**
 * 1 = desktop proportions. Smaller on phones where the MahJ button already
 * occupies a larger fraction of the short viewport axis.
 */
export function winCelebrateMotionScale(originEl?: HTMLElement | null): number {
  const { width, height } = viewportCssSize()
  const short = Math.min(width, height)
  // Floor so tiny viewports don’t squash motion to nothing.
  let scale = Math.min(1, short / 720)

  if (originEl) {
    const btnH = originEl.getBoundingClientRect().height
    if (btnH > 1) {
      const share = btnH / Math.max(1, height)
      const shareScale = Math.min(1, REF_BTN_VIEWPORT_SHARE / Math.max(0.02, share))
      scale = Math.min(scale, shareScale)
    }
  }

  return Math.max(0.42, scale)
}

export function winBtnPopPeak(originEl: HTMLElement): { risePx: number; peakScale: number } {
  const motion = winCelebrateMotionScale(originEl)
  const remPx =
    parseFloat(getComputedStyle(document.documentElement).fontSize || '16') || 16
  return {
    risePx: WIN_BTN_PEAK_RISE_REM * remPx * motion,
    peakScale: 1 + (WIN_BTN_PEAK_SCALE - 1) * motion,
  }
}
