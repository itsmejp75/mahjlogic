import watermarkSrc from '../assets/mahjlogic-watermark.svg?url'

/** Exposure-rack backdrop mark (SVG); styled in `part-0015.css`. Bundled with content hash so mobile WebViews do not keep a stale `public/*.svg` cache. */
export function RackLogoWatermark() {
  return (
    <span className="rack-logo-watermark">
      <img className="rack-logo-watermark__img" src={watermarkSrc} alt="" decoding="async" draggable={false} />
    </span>
  )
}
