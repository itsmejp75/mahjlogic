import type { ReactNode } from 'react'
import type { CharlestonPhase } from '../mahjong/charleston'
import { charlestonPassStripInstruction } from '../mahjong/charleston'

/** Dim only the parentheses around a leading qualifier (e.g. `(Blind)`). */
function passInstructionWithDimParens(text: string): ReactNode {
  if (!text.startsWith('(')) return text
  const close = text.indexOf(')')
  if (close <= 0) return text
  const inner = text.slice(1, close)
  const rest = text.slice(close + 1)
  return (
    <>
      <span className="pass-strip-tail__instruction-paren">(</span>
      {inner}
      <span className="pass-strip-tail__instruction-paren pass-strip-tail__instruction-paren--close">)</span>
      {rest}
    </>
  )
}

/** Centered “Pass 3 …” copy for the Charleston pass box. */
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
            to
          </span>{' '}
          <span className="pass-strip-tail__instruction-line__stop">Stop</span>
        </span>
      </div>
    )
  }

  const text = charlestonPassStripInstruction(phase)
  return (
    <p className="pass-strip-tail__instruction">{passInstructionWithDimParens(text)}</p>
  )
}
