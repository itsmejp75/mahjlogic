import type { CharlestonPhase } from '../mahjong/charleston'
import { charlestonPassStripInstruction } from '../mahjong/charleston'

function directionArrow(phase: Exclude<CharlestonPhase, 'done' | 'left2'>): string {
  const text = charlestonPassStripInstruction(phase)
  if (text.endsWith('RIGHT')) return '\u2192'
  if (text.endsWith('LEFT')) return '\u2190'
  if (text.endsWith('ACROSS')) return '\u2191'
  return ''
}

/** Centered “PASS 3 …” copy only; direction glyph renders in `CharlestonPassStripDirectionGlyph` below. */
export function CharlestonPassStripInstructionMain({ phase }: { phase: CharlestonPhase }) {
  if (phase === 'done') return null

  if (phase === 'left2') {
    const line = charlestonPassStripInstruction('left2')
    return (
      <div className="pass-strip-tail__instruction pass-strip-tail__instruction--stacked">
        <span className="pass-strip-tail__instruction-line">{line}</span>
        <span className="pass-strip-tail__instruction-or" aria-hidden>
          -OR-
        </span>
        <span className="pass-strip-tail__instruction-line pass-strip-tail__instruction-line--0-to-stop">
          <span className="pass-strip-tail__instruction-line__0">0</span>{' '}
          <span
            className="pass-strip-tail__instruction-or pass-strip-tail__instruction-or--inline"
            aria-hidden
          >
            TO
          </span>{' '}
          <span className="pass-strip-tail__instruction-line__stop">STOP</span>
        </span>
      </div>
    )
  }

  const text = charlestonPassStripInstruction(phase)
  return <p className="pass-strip-tail__instruction">{text}</p>
}

/** Single direction row pinned to the bottom of the pass box (see `PassStrip` `inlineHeaderFooter`). */
export function CharlestonPassStripDirectionGlyph({ phase }: { phase: CharlestonPhase }) {
  if (phase === 'done') return null
  if (phase === 'left2') {
    return (
      <span className="charleston-pass-direction-arrow--footer" aria-hidden>
        {'\u2190'}
      </span>
    )
  }
  const arrow = directionArrow(phase)
  if (!arrow) return null
  return (
    <span className="charleston-pass-direction-arrow--footer" aria-hidden>
      {arrow}
    </span>
  )
}
