/**
 * Colorful perimeter aurora for rack action hints (MahJ / Swap) and win-lit MahJ.
 * Bloom blur wraps a thin masked ring so the glow feathers outward.
 */
export function RackActionAuroraBorder() {
  return (
    <span className="btn--mahj__aurora" aria-hidden>
      <span className="btn--mahj__aurora-bloom">
        <span className="btn--mahj__aurora-ring" />
      </span>
      <span className="btn--mahj__aurora-rim" />
    </span>
  )
}
