import { useId, useLayoutEffect, useRef, useState } from 'react'
import mahjLogoSrc from '../assets/mahj-logo.svg?url'

type MahjWinFaceGlyphProps = {
  className?: string
  /** Outline thickness in filter primitive units (same idea as seat-chip text-stroke). */
  strokeWidth?: number
}

/**
 * Resolve the MahJ button’s face color to a concrete rgb() for SVG feFlood
 * (CSS variables / gradients are not usable as flood-color).
 */
function resolveMahjButtonFaceColor(button: HTMLElement): string {
  const cs = getComputedStyle(button)
  const top = cs.getPropertyValue('--app-action-btn-top').trim()
  const bottom = cs.getPropertyValue('--app-action-btn-bottom').trim()
  if (!top && !bottom) {
    const bg = cs.backgroundColor
    return bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' ? bg : '#434b53'
  }
  // Mid face tone, nudged darker so the outline reads against the button.
  const probe = document.createElement('span')
  probe.style.cssText =
    'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;' +
    `color:color-mix(in srgb, color-mix(in srgb, ${top || bottom} 45%, ${bottom || top} 55%) 72%, #000 28%)`
  button.appendChild(probe)
  const resolved = getComputedStyle(probe).color
  probe.remove()
  return resolved && resolved !== 'rgba(0, 0, 0, 0)' ? resolved : bottom || top
}

/**
 * White Mahj mark with a seat-chip-style outer stroke: outline the glyph’s
 * alpha edge (feMorphology), then paint fill on top. Stroke matches the
 * MahJ button face color at full opacity.
 */
export function MahjWinFaceGlyph({ className, strokeWidth = 0.7 }: MahjWinFaceGlyphProps) {
  const filterId = `mahj-win-face-stroke-${useId().replace(/:/g, '')}`
  const imgRef = useRef<HTMLImageElement>(null)
  const [stroke, setStroke] = useState('#434b53')

  useLayoutEffect(() => {
    const img = imgRef.current
    const button = img?.closest('button')
    if (!button) return
    setStroke(resolveMahjButtonFaceColor(button))
  }, [])

  return (
    <>
      <svg width={0} height={0} aria-hidden focusable="false" style={{ position: 'absolute' }}>
        <defs>
          <filter
            id={filterId}
            x="-40%"
            y="-40%"
            width="180%"
            height="180%"
            colorInterpolationFilters="sRGB"
          >
            <feMorphology
              in="SourceAlpha"
              result="dilated"
              operator="dilate"
              radius={strokeWidth}
            />
            <feFlood floodColor={stroke} floodOpacity={1} result="flood" />
            <feComposite in="flood" in2="dilated" operator="in" result="outline" />
            <feComposite in="outline" in2="SourceAlpha" operator="out" result="strokeOnly" />
            <feFlood floodColor="#ffffff" floodOpacity={1} result="whiteFlood" />
            <feComposite in="whiteFlood" in2="SourceAlpha" operator="in" result="fill" />
            <feMerge>
              <feMergeNode in="strokeOnly" />
              <feMergeNode in="fill" />
            </feMerge>
          </filter>
        </defs>
      </svg>
      <img
        ref={imgRef}
        className={className}
        src={mahjLogoSrc}
        alt=""
        draggable={false}
        aria-hidden
        style={{ filter: `url(#${filterId})` }}
      />
    </>
  )
}
