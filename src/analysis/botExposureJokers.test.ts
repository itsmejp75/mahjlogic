import { describe, expect, it } from 'vitest'
import { NMJL_2026_PATTERNS } from '../card/nmjl2026Patterns'
import { patternPreviewJokerEligibleBySlot } from '../card/patternLinePreview'
import {
  shouldHighlightBotExposureJokers,
  type SuggestedStripSlot,
} from './suggestedHands'

function slot(partial: Partial<SuggestedStripSlot> & Pick<SuggestedStripSlot, 'displayDef'>): SuggestedStripSlot {
  return {
    highlight: false,
    jokerSuggested: false,
    ...partial,
  }
}

const jokerEligiblePattern =
  NMJL_2026_PATTERNS.find(
    (p) => p.section !== 'SINGLES AND PAIRS' && patternPreviewJokerEligibleBySlot(p).some(Boolean),
  )!

const singlesPattern = NMJL_2026_PATTERNS.find((p) => p.section === 'SINGLES AND PAIRS')!

describe('shouldHighlightBotExposureJokers', () => {
  it('returns false for singles and pairs hands', () => {
    const rows: SuggestedStripSlot[][] = [
      [slot({ displayDef: { cat: 'suit', suit: 'bam', rank: 2 }, jokerSuggested: true })],
    ]
    expect(shouldHighlightBotExposureJokers(singlesPattern, rows)).toBe(false)
  })

  it('returns true when strip marks joker cells', () => {
    const rows: SuggestedStripSlot[][] = [
      [
        slot({ displayDef: { cat: 'suit', suit: 'crak', rank: 6 }, highlight: true }),
        slot({ displayDef: { cat: 'suit', suit: 'crak', rank: 6 }, jokerSuggested: true }),
        slot({ displayDef: { cat: 'suit', suit: 'crak', rank: 6 }, jokerSuggested: true }),
      ],
    ]
    expect(shouldHighlightBotExposureJokers(jokerEligiblePattern, rows)).toBe(true)
  })

  it('returns false when melds are complete on the strip', () => {
    const elig = patternPreviewJokerEligibleBySlot(jokerEligiblePattern)
    const rows: SuggestedStripSlot[][] = [
      elig.map(() => slot({ displayDef: { cat: 'suit', suit: 'bam', rank: 2 }, highlight: true })),
    ]
    expect(shouldHighlightBotExposureJokers(jokerEligiblePattern, rows)).toBe(false)
  })

  it('returns true when open needs remain in joker-eligible meld slots', () => {
    const elig = patternPreviewJokerEligibleBySlot(jokerEligiblePattern)
    const rows: SuggestedStripSlot[][] = [
      elig.map((isJokerSlot, i) =>
        slot({
          displayDef: { cat: 'suit', suit: 'bam', rank: 2 },
          highlight: i === 0,
        }),
      ),
    ]
    expect(shouldHighlightBotExposureJokers(jokerEligiblePattern, rows)).toBe(true)
  })
})
