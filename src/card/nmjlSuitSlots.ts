/**
 * ## NMJL card colors = **suit slots**, not fixed Bam / Dot / Crak
 *
 * On the National Mah Jongg League card, the usual **blue/black, red, and green** print colors
 * (plus soap for 0) mark **three different suit roles** — think **suit A, suit B, suit C** —
 * not “this ink always means cracks.” Two colors on a line ⇒ two **distinct** suits; three
 * colors ⇒ three **distinct** suits. The player assigns concrete `{bam, dot, crak}` to those
 * slots in any order that satisfies the line.
 *
 * ### Where that lives in code
 * - **Legality / fill score**: `PatternGroup` kinds such as `suit-permute` and
 *   `shared-rank-suits` use {@link suitPermutations} (and similar loops) to try real suit
 *   assignments to those slots — that is the “reverse the test / try another mapping” logic.
 * - **Mini-tiles & title parsing**: we still need a **deterministic tile face** to draw for a
 *   given PDF ink column. {@link previewStandInSuitForDigitInk} maps print ink to a **display
 *   stand-in** suit only; it is **not** an NMJL rule and must never be used as the sole match
 *   test for flexible lines.
 */
import type { CardInk } from './cardText'
import type { Suit } from '../mahjong/types'

const SUITS: Suit[] = ['bam', 'dot', 'crak']

/**
 * All ordered ways to assign **distinct** real suits to `slotCount` card-color slots
 * (`slotCount` ≤ 3). Same recurrence as classic “suit permute” in pattern fill.
 */
export function suitPermutations(slotCount: number): Suit[][] {
  if (slotCount === 0) return [[]]
  const out: Suit[][] = []
  for (let i = 0; i < SUITS.length; i++) {
    for (const tail of suitPermutations(slotCount - 1)) {
      if (tail.every((s) => s !== SUITS[i])) out.push([SUITS[i]!, ...tail])
    }
  }
  return out
}

/**
 * **UI only**: map a digit run’s **card column ink** to a concrete suit so a mini-tile can
 * render. NMJL does not fix “red column = craks”; this is an arbitrary stable choice for pixels.
 */
export function previewStandInSuitForDigitInk(ink: CardInk): Suit | null {
  if (ink === 'red') return 'crak'
  if (ink === 'green') return 'bam'
  if (ink === 'navy') return 'dot'
  return null
}
