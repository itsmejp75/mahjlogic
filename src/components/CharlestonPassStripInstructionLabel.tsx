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
      <p className="pass-strip-tail__instruction pass-strip-tail__instruction--left2-inline">
        <span className="pass-strip-tail__instruction-copy">
          {line}
          <span className="pass-strip-tail__instruction-left-chevron" aria-hidden />
        </span>
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
      </p>
    )
  }

  const text = charlestonPassStripInstruction(phase)
  if (text === 'Pass 3 Right') {
    return (
      <p className="pass-strip-tail__instruction pass-strip-tail__instruction--with-right-chevron">
        <span className="pass-strip-tail__instruction-copy">
          {passInstructionWithDimParens(text)}
          <span className="pass-strip-tail__instruction-right-chevron" aria-hidden />
        </span>
      </p>
    )
  }

  if (text === 'Pass 3 Across' || text === 'Pass 0-3 Across') {
    return (
      <p className="pass-strip-tail__instruction pass-strip-tail__instruction--with-up-chevron">
        <span className="pass-strip-tail__instruction-copy">
          {passInstructionWithDimParens(text)}
          <span className="pass-strip-tail__instruction-up-chevron" aria-hidden />
        </span>
      </p>
    )
  }

  if (text === '(Blind) Pass 0-3 Right') {
    return (
      <p className="pass-strip-tail__instruction pass-strip-tail__instruction--with-right-chevron">
        <span className="pass-strip-tail__instruction-copy">
          {passInstructionWithDimParens(text)}
          <span className="pass-strip-tail__instruction-right-chevron" aria-hidden />
        </span>
      </p>
    )
  }

  if (text === '(Blind) Pass 0-3 Left') {
    return (
      <p className="pass-strip-tail__instruction pass-strip-tail__instruction--with-left-chevron">
        <span className="pass-strip-tail__instruction-copy">
          {passInstructionWithDimParens(text)}
          <span className="pass-strip-tail__instruction-left-chevron" aria-hidden />
        </span>
      </p>
    )
  }

  return (
    <p className="pass-strip-tail__instruction">{passInstructionWithDimParens(text)}</p>
  )
}
