const WATERMARK_SRC = `${import.meta.env.BASE_URL}mahjlogic-watermark.svg`

/** Exposure-rack backdrop mark (SVG); styled in `part-0015.css`. */
export function RackLogoWatermark() {
  return (
    <span className="rack-logo-watermark">
      <img className="rack-logo-watermark__img" src={WATERMARK_SRC} alt="" decoding="async" draggable={false} />
    </span>
  )
}
