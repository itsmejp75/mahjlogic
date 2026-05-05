import watermarkSrc from '../assets/mahjlogic-watermark.svg?url'

/** Exposure-rack backdrop mark; styled in `part-0015.css` / `components.css`. Bundled with content hash so mobile WebViews do not keep a stale cache. */
export function RackLogoWatermark() {
  return (
    <span className="rack-logo-watermark">
      <img className="rack-logo-watermark__img" src={watermarkSrc} alt="" decoding="async" draggable={false} />
    </span>
  )
}
