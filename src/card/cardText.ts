/**
 * Inks for **printed NMJL card line text** (not physical tile faces).
 *
 * The League does **not** publish official hex values; print varies by year and stock.
 * Community / platform defaults (I Love Mahj–style) are usually:
 *
 * - **Navy `#000080`**: one-suit hands (any one of bam/crak/dot), parentheses, and
 *   "neutral" tiles on the line — Flowers, Winds, Soap when used as **0** in year hands.
 * - **Green `#008000`** and **Red `#FF0000`**: used to show **suit changes** — they do
 *   **not** mean bamboo vs crack vs dot. Two colors on a line ⇒ two suits; three ⇒
 *   three suits (navy + green + red each marks a different suit group).
 *
 * Encode each text run with the **ink that matches the printed card**, not the suit
 * you ultimately choose at the table.
 *
 * Suggested-hand **mini tile** colors: `cardInkTileSkin.ts` + `patternLinePreviewSlots()`.
 *
 * For “three colors = three suit **roles**” vs fixed bam/dot/crak, see `nmjlSuitSlots.ts`.
 */
export type CardInk =
  | 'navy'
  | 'green'
  | 'red'
  /** Winds, dragons (when printed like honors), flowers — typically navy on the card. */
  | 'honor'
  | 'flower'
  | 'joker'
  /** Soap (white) dragon notation — distinct gray to differentiate from honor/suit tiles. */
  | 'soap'
  /** App chrome (e.g. "Practice:") — not a card ink; uses normal UI text color. */
  | 'neutral'
  /**
   * Suggested-hand **mini tiles only**: same face fill as main-rack wind (`--wind-tile-bg`).
   * Used for flowers, winds, and jokers in the strip (not for `titleSegments` on the card).
   */
  | 'rack-wind'
  /** Suggested-hand **mini tiles only**: same face fill as main-rack flower (`tile--flower`). */
  | 'rack-flower'

export type CardTextSeg = {
  t: string
  ink: CardInk
}
