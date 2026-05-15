import type { CardInk, CardTextSeg } from './cardText'
import { previewStandInSuitForDigitInk } from './nmjlSuitSlots'
import type { Dragon, Suit, TileDef, Wind } from '../mahjong/types'
import { tileDefsEqual } from '../mahjong/tileUtils'
import type { PatternGroup, PracticePattern } from './practicePatterns'
import {
  inferMonoSuitCardPrint,
  resolveCardInkForPreviewSlot,
  type PreviewLineContext,
} from './cardInkTileSkin'

const SUITS: Suit[] = ['bam', 'dot', 'crak']

/** Six-tile column order for 13579 #4: odds below `pairRank`, then the pair, then odds above. */
export function oddPairKongsTripleSixPackRanks(odds: readonly number[], pairRank: number): number[] {
  const below = odds.filter((r) => r < pairRank)
  const above = odds.filter((r) => r > pairRank)
  return [...below, pairRank, pairRank, ...above]
}

/** Suits that pass `test` as suit tiles at a reference rank (for SRS preview column order). */
function suitsAllowedAtRank(test: (d: TileDef) => boolean, rank: number): Suit[] {
  return SUITS.filter((s) => test({ cat: 'suit', suit: s, rank }))
}

/**
 * Which suit each `shared-rank-suits` arm uses in the preview strip.
 * When `test` drops whole suits (e.g. bam+crak only), preview matches the card columns.
 */
function sharedRankSuitsPreviewSuits(needs: readonly number[], test: (d: TileDef) => boolean): Suit[] {
  const n = needs.length
  const allowed = suitsAllowedAtRank(test, 1)
  if (allowed.length >= n) return allowed.slice(0, n)
  return Array.from({ length: n }, (_, i) => SUITS[i % 3]!)
}

const DRAGON_FOR_SUIT: Record<Suit, Dragon> = {
  bam: 'green',
  dot: 'soap',
  crak: 'red',
}

const OPPOSING_FOR_SUIT: Record<Suit, [Dragon, Dragon]> = {
  bam: ['soap', 'red'],
  dot: ['green', 'red'],
  crak: ['green', 'soap'],
}

function pushFlower(out: TileDef[], n: number, start = 1) {
  for (let i = 0; i < n; i++) out.push({ cat: 'flower', flower: ((start - 1 + i) % 8) + 1 })
}

function pushWind(out: TileDef[], w: Wind, n: number) {
  for (let i = 0; i < n; i++) out.push({ cat: 'wind', wind: w })
}

function pushDragon(out: TileDef[], d: Dragon, n: number) {
  for (let i = 0; i < n; i++) out.push({ cat: 'dragon', dragon: d })
}

function pushSuit(out: TileDef[], suit: Suit, rank: number, n: number) {
  for (let i = 0; i < n; i++) out.push({ cat: 'suit', suit, rank })
}

function pushJokers(out: TileDef[], n: number) {
  for (let i = 0; i < n; i++) out.push({ cat: 'joker' })
}

/** One suggested-hand strip cell: tile + NMJL **card print** ink for face chrome. */
export type PatternPreviewSlot = { def: TileDef; cardInk: CardInk }

function appendPreviewSlot(
  out: PatternPreviewSlot[],
  seg: CardTextSeg,
  def: TileDef,
  ctx: PreviewLineContext,
) {
  out.push({ def, cardInk: resolveCardInkForPreviewSlot(def, seg.ink, ctx) })
}

function pushFlowerSlots(
  out: PatternPreviewSlot[],
  seg: CardTextSeg,
  n: number,
  ctx: PreviewLineContext,
  start = 1,
) {
  for (let i = 0; i < n; i++) {
    appendPreviewSlot(out, seg, { cat: 'flower', flower: ((start - 1 + i) % 8) + 1 }, ctx)
  }
}

function pushWindSlots(out: PatternPreviewSlot[], seg: CardTextSeg, w: Wind, n: number, ctx: PreviewLineContext) {
  for (let i = 0; i < n; i++) appendPreviewSlot(out, seg, { cat: 'wind', wind: w }, ctx)
}

function pushDragonSlots(out: PatternPreviewSlot[], seg: CardTextSeg, d: Dragon, n: number, ctx: PreviewLineContext) {
  for (let i = 0; i < n; i++) appendPreviewSlot(out, seg, { cat: 'dragon', dragon: d }, ctx)
}

function pushSuitSlots(
  out: PatternPreviewSlot[],
  seg: CardTextSeg,
  suit: Suit,
  rank: number,
  n: number,
  ctx: PreviewLineContext,
) {
  for (let i = 0; i < n; i++) appendPreviewSlot(out, seg, { cat: 'suit', suit, rank }, ctx)
}

function probeWind(test: (d: TileDef) => boolean): Wind | null {
  const order: Wind[] = ['N', 'E', 'W', 'S']
  for (const w of order) {
    if (test({ cat: 'wind', wind: w })) return w
  }
  return null
}

function probeDragon(test: (d: TileDef) => boolean): Dragon | null {
  const order: Dragon[] = ['red', 'green', 'soap']
  for (const dragon of order) {
    if (test({ cat: 'dragon', dragon })) return dragon
  }
  return null
}

function probeSuitRank(test: (d: TileDef) => boolean): { suit: Suit; rank: number } | null {
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 9; rank++) {
      if (test({ cat: 'suit', suit, rank })) return { suit, rank }
    }
  }
  return null
}

function appendFixed(out: TileDef[], need: number, test: (d: TileDef) => boolean) {
  if (test({ cat: 'flower', flower: 1 })) {
    pushFlower(out, need)
    return
  }
  const w = probeWind(test)
  if (w != null) {
    pushWind(out, w, need)
    return
  }
  const d = probeDragon(test)
  if (d != null) {
    pushDragon(out, d, need)
    return
  }
  const sr = probeSuitRank(test)
  if (sr != null) {
    pushSuit(out, sr.suit, sr.rank, need)
    return
  }
  if (test({ cat: 'joker' })) {
    pushJokers(out, need)
  }
}

function pushJokerFlagRun(flags: boolean[], n: number, jokerOk: boolean) {
  for (let i = 0; i < n; i++) flags.push(jokerOk)
}

/**
 * From `titleSegments`, digit runs printed in red/green/navy columns → stand-in suit per rank
 * (NMJL card slots — not fixed bam/dot/crak legality).
 */
export function titleStandInSuitsForConsecRanks(p: PracticePattern): Map<number, Suit> | null {
  if (!p.titleSegments?.length) return null
  const m = new Map<number, Suit>()
  for (const seg of p.titleSegments) {
    const stand = previewStandInSuitForDigitInk(seg.ink)
    if (stand == null) continue
    const t = seg.t.replace(/\s+/g, '')
    for (const { rank } of extractSameDigitRuns(t)) {
      if (rank >= 1 && rank <= 9) m.set(rank, stand)
    }
  }
  if (m.size < 2) return null
  return m
}

/** First consecutive ranks R,R+1 on the title that use two different stand-in suits (e.g. 1111 red + 2222 green). */
export function firstOpposingConsecutiveStandInPairFromTitle(
  p: PracticePattern,
): { rankLow: number; suitLow: Suit; suitHigh: Suit } | null {
  const m = titleStandInSuitsForConsecRanks(p)
  if (!m) return null
  const ranks = [...m.keys()].sort((a, b) => a - b)
  for (let i = 0; i < ranks.length - 1; i++) {
    const r = ranks[i]!
    if (ranks[i + 1] !== r + 1) continue
    const lo = m.get(r)!
    const hi = m.get(r + 1)!
    if (lo !== hi) return { rankLow: r, suitLow: lo, suitHigh: hi }
  }
  return null
}

function appendOddPairKongsTriple(
  out: TileDef[],
  flags: boolean[] | null,
  g: Extract<PatternGroup, { kind: 'odd-pair-kongs-triple' }>,
  pairRank: number,
) {
  const odds = g.odds
  const s0 = SUITS[0]!
  const s1 = SUITS[1]!
  const s2 = SUITS[2]!
  for (const r of oddPairKongsTripleSixPackRanks(odds, pairRank)) {
    pushSuit(out, s0, r, 1)
    if (flags) pushJokerFlagRun(flags, 1, false)
  }
  for (let k = 0; k < 4; k++) {
    pushSuit(out, s1, pairRank, 1)
    if (flags) pushJokerFlagRun(flags, 1, true)
  }
  for (let k = 0; k < 4; k++) {
    pushSuit(out, s2, pairRank, 1)
    if (flags) pushJokerFlagRun(flags, 1, true)
  }
}

function appendGroupWithJokerFlags(out: TileDef[], flags: boolean[], p: PracticePattern, g: PatternGroup) {
  switch (g.kind) {
    case 'odd-pair-kongs-triple': {
      const pairRank = g.odds[0] ?? 1
      appendOddPairKongsTriple(out, flags, g, pairRank)
      return
    }
    case 'fixed': {
      if (g.test({ cat: 'flower', flower: 1 })) {
        pushFlower(out, g.need)
        pushJokerFlagRun(flags, g.need, g.need >= 3)
        return
      }
      const w = probeWind(g.test)
      if (w != null) {
        pushWind(out, w, g.need)
        pushJokerFlagRun(flags, g.need, g.need >= 3)
        return
      }
      const d = probeDragon(g.test)
      if (d != null) {
        pushDragon(out, d, g.need)
        pushJokerFlagRun(flags, g.need, g.need >= 3)
        return
      }
      const sr = probeSuitRank(g.test)
      if (sr != null) {
        pushSuit(out, sr.suit, sr.rank, g.need)
        pushJokerFlagRun(flags, g.need, g.need >= 3)
        return
      }
      if (g.test({ cat: 'joker' })) {
        pushJokers(out, g.need)
        pushJokerFlagRun(flags, g.need, false)
      }
      return
    }
    case 'rank': {
      const d = probeDragon(g.test)
      if (d != null) {
        pushDragon(out, d, g.need)
        pushJokerFlagRun(flags, g.need, g.need >= 3)
        return
      }
      const sr = probeSuitRank(g.test)
      if (sr != null) {
        pushSuit(out, sr.suit, sr.rank, g.need)
        pushJokerFlagRun(flags, g.need, g.need >= 3)
      }
      return
    }
    case 'consec': {
      const pair = firstOpposingConsecutiveStandInPairFromTitle(p)
      if (pair) {
        pushSuit(out, pair.suitLow, pair.rankLow, g.need1)
        pushJokerFlagRun(flags, g.need1, g.need1 >= 3)
        pushSuit(out, pair.suitHigh, pair.rankLow + 1, g.need2)
        pushJokerFlagRun(flags, g.need2, g.need2 >= 3)
        return
      }
      const sr = probeSuitRank(g.test)
      const suit = sr?.suit ?? 'bam'
      const r = sr?.rank ?? 1
      pushSuit(out, suit, r, g.need1)
      pushJokerFlagRun(flags, g.need1, g.need1 >= 3)
      pushSuit(out, suit, r + 1, g.need2)
      pushJokerFlagRun(flags, g.need2, g.need2 >= 3)
      return
    }
    case 'shared-rank': {
      const sr = probeSuitRank(g.test)
      const rank = sr?.rank ?? 1
      const suit = sr?.suit ?? 'bam'
      let pool = g.needs.reduce((a, b) => a + b, 0)
      for (const need of g.needs) {
        const n = Math.min(need, pool)
        pushSuit(out, suit, rank, n)
        pushJokerFlagRun(flags, n, n >= 3)
        pool -= n
      }
      return
    }
    case 'shared-rank-suits': {
      const sr = probeSuitRank(g.test)
      const rank = sr?.rank ?? 1
      const suitOrder = sharedRankSuitsPreviewSuits(g.needs, g.test)
      for (let i = 0; i < g.needs.length; i++) {
        const suit = suitOrder[i]!
        const n = g.needs[i]!
        pushSuit(out, suit, rank, n)
        pushJokerFlagRun(flags, n, n >= 3)
      }
      return
    }
    case 'suit-locked-rank': {
      const sr = probeSuitRank(g.test)
      const suit = sr?.suit ?? 'bam'
      const rank = sr?.rank ?? 5
      const dc = g.dragonCount ?? 0
      if (g.dragonsFirst && dc > 0) {
        pushDragon(out, DRAGON_FOR_SUIT[suit], dc)
        pushJokerFlagRun(flags, dc, false)
      }
      pushSuit(out, suit, rank, g.need)
      pushJokerFlagRun(flags, g.need, g.need >= 3)
      if (!g.dragonsFirst && dc > 0) {
        pushDragon(out, DRAGON_FOR_SUIT[suit], dc)
        pushJokerFlagRun(flags, dc, false)
      }
      return
    }
    case 'consec-multi':
    case 'suit-locked-consec-multi': {
      const suit: Suit = 'bam'
      const start = 1
      for (let i = 0; i < g.needs.length; i++) {
        const n = g.needs[i]!
        pushSuit(out, suit, start + i, n)
        pushJokerFlagRun(flags, n, false)
      }
      return
    }
    case 'suit-locked': {
      const suit: Suit = 'bam'
      if (g.dragonsFirst && g.dragonCount > 0) {
        pushDragon(out, DRAGON_FOR_SUIT[suit], g.dragonCount)
        pushJokerFlagRun(flags, g.dragonCount, g.dragonCount >= 3)
      }
      for (const { rank, need } of g.rankNeeds) {
        pushSuit(out, suit, rank, need)
        pushJokerFlagRun(flags, need, need >= 3)
      }
      if (!g.dragonsFirst && g.dragonCount > 0) {
        pushDragon(out, DRAGON_FOR_SUIT[suit], g.dragonCount)
        pushJokerFlagRun(flags, g.dragonCount, g.dragonCount >= 3)
      }
      if (g.opposingDragons) {
        const [d1, d2] = OPPOSING_FOR_SUIT[suit]
        const need = g.opposingDragons.need
        pushDragon(out, d1, need)
        pushJokerFlagRun(flags, need, need >= 3)
        pushDragon(out, d2, need)
        pushJokerFlagRun(flags, need, need >= 3)
      }
      return
    }
    case 'suit-locked-consec': {
      const suit: Suit = 'bam'
      const start = 1
      const perRankJoker = g.numGroups === 1 && g.rankCount >= 3
      for (let i = 0; i < g.numGroups; i++) {
        pushSuit(out, suit, start + i, g.rankCount)
        pushJokerFlagRun(flags, g.rankCount, perRankJoker)
      }
      if (g.dragonCount > 0) {
        pushDragon(out, DRAGON_FOR_SUIT[suit], g.dragonCount)
        pushJokerFlagRun(flags, g.dragonCount, g.dragonCount >= 3)
      }
      return
    }
    case 'suit-permute': {
      const usedSuits = new Set<Suit>()
      for (let ci = 0; ci < g.colorGroups.length; ci++) {
        const suit = SUITS[ci % 3]!
        usedSuits.add(suit)
        for (const sg of g.colorGroups[ci]!) {
          const jok = sg.canUseJoker !== false && sg.need >= 3
          pushSuit(out, suit, sg.rank, sg.need)
          pushJokerFlagRun(flags, sg.need, jok)
        }
        const dc = g.colorGroupDragonCounts?.[ci] ?? 0
        if (dc > 0) {
          pushDragon(out, DRAGON_FOR_SUIT[suit], dc)
          pushJokerFlagRun(flags, dc, false)
        }
      }
      const tdc = g.trailingDragonCount ?? 0
      if (tdc > 0) {
        const remaining = SUITS.find((s) => !usedSuits.has(s)) ?? SUITS[2]!
        pushDragon(out, DRAGON_FOR_SUIT[remaining], tdc)
        pushJokerFlagRun(flags, tdc, tdc >= 3)
      }
      return
    }
    default:
      return
  }
}

function pushBoolRun(flags: boolean[], n: number, v: boolean) {
  for (let i = 0; i < n; i++) flags.push(v)
}

/**
 * NMJL joker flags in **title order** (matches `buildPreviewSlotsFromTitleSegments` / card ink).
 * Any run of **3+ identical** tiles (suits, dragons, flowers, winds) allows jokers; singles and pairs do not.
 */
function appendTitleSegmentJokerEligible(flags: boolean[], seg: CardTextSeg): void {
  const t = seg.t
  if (seg.ink === 'flower') {
    const nF = (t.match(/F/gi) ?? []).length
    if (nF > 0) pushBoolRun(flags, nF, nF >= 3)
    return
  }
  if (seg.ink === 'joker' || seg.ink === 'neutral') return

  if (seg.ink === 'soap') {
    for (const { count } of extractSameDigitRuns(t)) {
      pushBoolRun(flags, count, count >= 3)
    }
    const d = extractDTokenCount(t)
    if (d > 0) pushBoolRun(flags, d, d >= 3)
    return
  }

  if (seg.ink === 'honor') {
    for (const { count } of windRunsFromText(t)) {
      pushBoolRun(flags, count, count >= 3)
    }
    const d = extractDTokenCount(t)
    if (d > 0) pushBoolRun(flags, d, d >= 3)
    return
  }

  const suit = previewStandInSuitForDigitInk(seg.ink)
  if (suit != null) {
    for (const part of tokenParts(t)) {
      if (/^F+$/i.test(part)) {
        pushBoolRun(flags, part.length, part.length >= 3)
      } else {
        const digitRuns = extractSameDigitRuns(part)
        if (digitRuns.length > 0) {
          for (const { count } of digitRuns) {
            pushBoolRun(flags, count, count >= 3)
          }
        } else if (/^D+$/i.test(part)) {
          pushBoolRun(flags, part.length, part.length >= 3)
        } else {
          for (const { count } of windRunsFromText(part)) {
            pushBoolRun(flags, count, count >= 3)
          }
        }
      }
    }
  }
}

/**
 * Per index in `patternLinePreviewDefs(p)`: rack joker may stand in for that card-line tile.
 * When the strip comes from `titleSegments`, eligibility follows the printed runs (consec. kongs).
 * Otherwise aligns group metadata to preview via greedy `tileDefsEqual` pairing.
 */
export function patternPreviewJokerEligibleBySlot(p: PracticePattern): boolean[] {
  const defs = patternLinePreviewDefs(p)
  const n = defs.length
  const out = new Array(n).fill(false)
  if (!p.groups?.length) return out

  const fromSeg = buildPreviewSlotsFromTitleSegments(p)
  if (!p.previewSlotsFromGroups && fromSeg != null && fromSeg.length >= p.roughTarget && p.titleSegments?.length) {
    const jFromTitle: boolean[] = []
    for (const seg of p.titleSegments) {
      appendTitleSegmentJokerEligible(jFromTitle, seg)
    }
    const jk = jFromTitle.slice(0, p.roughTarget)
    if (jk.length >= n) {
      for (let i = 0; i < n; i++) out[i] = jk[i]!
      return out
    }
  }

  const fromGrp: TileDef[] = []
  const jokerOk: boolean[] = []
  for (const g of p.groups) {
    appendGroupWithJokerFlags(fromGrp, jokerOk, p, g)
  }
  const m = Math.min(fromGrp.length, jokerOk.length, defs.length)
  const fg = fromGrp.slice(0, m)
  const jk = jokerOk.slice(0, m)
  const used = new Set<number>()
  for (let i = 0; i < n; i++) {
    const d = defs[i]!
    let fj = -1
    for (let j = 0; j < fg.length; j++) {
      if (used.has(j)) continue
      if (tileDefsEqual(fg[j]!, d)) {
        fj = j
        break
      }
    }
    if (fj < 0) continue
    used.add(fj)
    out[i] = jk[fj]!
  }
  return out
}

function appendGroup(out: TileDef[], p: PracticePattern, g: PatternGroup) {
  switch (g.kind) {
    case 'odd-pair-kongs-triple': {
      const pairRank = g.odds[0] ?? 1
      appendOddPairKongsTriple(out, null, g, pairRank)
      break
    }
    case 'fixed': {
      appendFixed(out, g.need, g.test)
      break
    }
    case 'rank': {
      const d = probeDragon(g.test)
      if (d != null) {
        pushDragon(out, d, g.need)
        break
      }
      const sr = probeSuitRank(g.test)
      if (sr != null) {
        pushSuit(out, sr.suit, sr.rank, g.need)
        break
      }
      break
    }
    case 'consec': {
      const pair = firstOpposingConsecutiveStandInPairFromTitle(p)
      if (pair) {
        pushSuit(out, pair.suitLow, pair.rankLow, g.need1)
        pushSuit(out, pair.suitHigh, pair.rankLow + 1, g.need2)
        break
      }
      const sr = probeSuitRank(g.test)
      const suit = sr?.suit ?? 'bam'
      const r = sr?.rank ?? 1
      pushSuit(out, suit, r, g.need1)
      pushSuit(out, suit, r + 1, g.need2)
      break
    }
    case 'shared-rank': {
      const sr = probeSuitRank(g.test)
      const rank = sr?.rank ?? 1
      const suit = sr?.suit ?? 'bam'
      let pool = g.needs.reduce((a, b) => a + b, 0)
      for (const need of g.needs) {
        const n = Math.min(need, pool)
        pushSuit(out, suit, rank, n)
        pool -= n
      }
      break
    }
    case 'shared-rank-suits': {
      const sr = probeSuitRank(g.test)
      const rank = sr?.rank ?? 1
      const suitOrder = sharedRankSuitsPreviewSuits(g.needs, g.test)
      for (let i = 0; i < g.needs.length; i++) {
        const suit = suitOrder[i]!
        pushSuit(out, suit, rank, g.needs[i]!)
      }
      break
    }
    case 'suit-locked-rank': {
      const sr = probeSuitRank(g.test)
      const suit = sr?.suit ?? 'bam'
      const rank = sr?.rank ?? 5
      const dc = g.dragonCount ?? 0
      if (g.dragonsFirst && dc > 0) pushDragon(out, DRAGON_FOR_SUIT[suit], dc)
      pushSuit(out, suit, rank, g.need)
      if (!g.dragonsFirst && dc > 0) pushDragon(out, DRAGON_FOR_SUIT[suit], dc)
      break
    }
    case 'consec-multi': {
      const start = 1
      for (let i = 0; i < g.needs.length; i++) {
        pushSuit(out, 'bam', start + i, g.needs[i]!)
      }
      break
    }
    case 'suit-locked-consec-multi': {
      const suit: Suit = 'bam'
      const start = 1
      for (let i = 0; i < g.needs.length; i++) {
        pushSuit(out, suit, start + i, g.needs[i]!)
      }
      break
    }
    case 'suit-locked': {
      const suit: Suit = 'bam'
      if (g.dragonsFirst && g.dragonCount > 0) {
        pushDragon(out, DRAGON_FOR_SUIT[suit], g.dragonCount)
      }
      for (const { rank, need } of g.rankNeeds) {
        pushSuit(out, suit, rank, need)
      }
      if (!g.dragonsFirst && g.dragonCount > 0) {
        pushDragon(out, DRAGON_FOR_SUIT[suit], g.dragonCount)
      }
      if (g.opposingDragons) {
        const [d1, d2] = OPPOSING_FOR_SUIT[suit]
        const need = g.opposingDragons.need
        pushDragon(out, d1, need)
        pushDragon(out, d2, need)
      }
      break
    }
    case 'suit-locked-consec': {
      const suit: Suit = 'bam'
      const start = 1
      for (let i = 0; i < g.numGroups; i++) {
        pushSuit(out, suit, start + i, g.rankCount)
      }
      if (g.dragonCount > 0) {
        pushDragon(out, DRAGON_FOR_SUIT[suit], g.dragonCount)
      }
      break
    }
    case 'suit-permute': {
      const usedSuits2 = new Set<Suit>()
      for (let ci = 0; ci < g.colorGroups.length; ci++) {
        const suit = SUITS[ci % 3]!
        usedSuits2.add(suit)
        for (const sg of g.colorGroups[ci]!) {
          pushSuit(out, suit, sg.rank, sg.need)
        }
        const dc = g.colorGroupDragonCounts?.[ci] ?? 0
        if (dc > 0) pushDragon(out, DRAGON_FOR_SUIT[suit], dc)
      }
      const tdc2 = g.trailingDragonCount ?? 0
      if (tdc2 > 0) {
        const remaining2 = SUITS.find((s) => !usedSuits2.has(s)) ?? SUITS[2]!
        pushDragon(out, DRAGON_FOR_SUIT[remaining2], tdc2)
      }
      break
    }
    default:
      break
  }
}

/**
 * `D` runs in title segments → preview dragon type:
 * - red/green ink: that dragon color (matches NMJL column ink).
 * - soap ink: soap (white) dragons.
 * - navy / honor: generic “any dragon” (display **D** on tile; not soap unless digit `0`).
 */
function dragonFromTitleSegmentInk(ink: CardInk): Dragon {
  if (ink === 'red') return 'red'
  if (ink === 'green') return 'green'
  if (ink === 'soap') return 'soap'
  return 'any'
}

/** Runs of the same digit, e.g. "11 222" → [{1,2},{2,3}]. */
function extractSameDigitRuns(t: string): { rank: number; count: number }[] {
  const out: { rank: number; count: number }[] = []
  const re = /(\d)\1*/g
  let m: RegExpExecArray | null
  while ((m = re.exec(t)) !== null) {
    const run = m[0]!
    out.push({ rank: parseInt(run[0]!, 10), count: run.length })
  }
  return out
}

function extractDTokenCount(t: string): number {
  let n = 0
  for (const tok of t.trim().split(/\s+/).filter(Boolean)) {
    if (/^(D)\1*$/i.test(tok)) n += tok.length
  }
  return n
}

function tokenParts(t: string): string[] {
  const out: string[] = []
  for (const tok of t.trim().split(/\s+/).filter(Boolean)) {
    out.push(...(tok.match(/F+|N+|E+|W+|S+|D+|[0-9]+/g) ?? []))
  }
  return out
}

function extractWindsFromText(t: string): Wind[] {
  const out: Wind[] = []
  for (const ch of t) {
    if (ch === 'N' || ch === 'E' || ch === 'W' || ch === 'S') out.push(ch)
  }
  return out
}

/** Contiguous runs of the same wind letter (e.g. `NNN` → one run of 3) for joker-eligibility. */
function windRunsFromText(t: string): Array<{ wind: Wind; count: number }> {
  const out: Array<{ wind: Wind; count: number }> = []
  for (const ch of t) {
    if (ch !== 'N' && ch !== 'E' && ch !== 'W' && ch !== 'S') continue
    const w = ch as Wind
    const last = out[out.length - 1]
    if (last && last.wind === w) last.count++
    else out.push({ wind: w, count: 1 })
  }
  return out
}

/**
 * One `titleSegments` entry → preview slots (tile + card-print ink for suggested-hand chrome).
 * Digit column inks use {@link previewStandInSuitForDigitInk} (stand-in suits for pixels only;
 * not NMJL legality — see `nmjlSuitSlots.ts`). D runs follow segment ink (`cardInkTileSkin`).
 */
function parseTitleSegmentToPreviewSlots(seg: CardTextSeg, ctx: PreviewLineContext): PatternPreviewSlot[] {
  const out: PatternPreviewSlot[] = []
  const t = seg.t

  if (seg.ink === 'flower') {
    const nF = (t.match(/F/gi) ?? []).length
    if (nF > 0) pushFlowerSlots(out, seg, nF, ctx)
    return out
  }

  if (seg.ink === 'joker' || seg.ink === 'neutral') {
    return out
  }

  if (seg.ink === 'soap') {
    for (const { rank, count } of extractSameDigitRuns(t)) {
      if (rank === 0) pushDragonSlots(out, seg, 'soap', count, ctx)
      else pushSuitSlots(out, seg, 'dot', rank, count, ctx)
    }
    const d = extractDTokenCount(t)
    if (d > 0) pushDragonSlots(out, seg, 'soap', d, ctx)
    return out
  }

  if (seg.ink === 'honor') {
    for (const w of extractWindsFromText(t)) pushWindSlots(out, seg, w, 1, ctx)
    const d = extractDTokenCount(t)
    if (d > 0) pushDragonSlots(out, seg, 'any', d, ctx)
    return out
  }

  const suit = previewStandInSuitForDigitInk(seg.ink)
  if (suit != null) {
    for (const part of tokenParts(t)) {
      if (/^F+$/i.test(part)) {
        pushFlowerSlots(out, seg, part.length, ctx)
      } else {
        const digitRuns = extractSameDigitRuns(part)
        if (digitRuns.length > 0) {
          for (const { rank, count } of digitRuns) {
            if (rank === 0) pushDragonSlots(out, seg, 'soap', count, ctx)
            else pushSuitSlots(out, seg, suit, rank, count, ctx)
          }
        } else if (/^D+$/i.test(part)) {
          pushDragonSlots(out, seg, dragonFromTitleSegmentInk(seg.ink), part.length, ctx)
        } else {
          for (const w of extractWindsFromText(part)) pushWindSlots(out, seg, w, 1, ctx)
        }
      }
    }
    return out
  }

  return out
}

function buildPreviewSlotsFromTitleSegments(p: PracticePattern): PatternPreviewSlot[] | null {
  if (!p.titleSegments?.length) return null
  const ctx: PreviewLineContext = { monoSuitCardPrint: inferMonoSuitCardPrint(p.titleSegments) }
  const out: PatternPreviewSlot[] = []
  for (const seg of p.titleSegments) {
    out.push(...parseTitleSegmentToPreviewSlots(seg, ctx))
  }
  if (out.length === 0) return null
  return out
}

function appendAllGroups(out: TileDef[], p: PracticePattern) {
  if (!p.groups?.length) return
  for (const g of p.groups) {
    appendGroup(out, p, g)
  }
}

/** `fixed` group accepts any dragon (pair) and immediately follows a `shared-rank-suits` meld on the card. */
export function isGenericAllDragonsFixedGroup(g: PatternGroup): boolean {
  if (g.kind !== 'fixed') return false
  return (
    g.test({ cat: 'dragon', dragon: 'red' }) &&
    g.test({ cat: 'dragon', dragon: 'green' }) &&
    g.test({ cat: 'dragon', dragon: 'soap' })
  )
}

/**
 * NMJL “like numbers” style: first `DD` pair matches the first SRS suit column, second pair the second.
 * Returns `null` when this `fixed` group is not one of those coupled pairs.
 */
export function srsDragonCoupledColumn(p: PracticePattern, gi: number, g: PatternGroup): 0 | 1 | null {
  if (!isGenericAllDragonsFixedGroup(g)) return null
  const groups = p.groups
  if (!groups) return null
  const prev = groups[gi - 1]
  if (prev?.kind === 'shared-rank-suits') return 0
  const prev2 = groups[gi - 2]
  if (
    prev2?.kind === 'shared-rank-suits' &&
    prev?.kind === 'fixed' &&
    isGenericAllDragonsFixedGroup(prev)
  ) {
    return 1
  }
  return null
}

/** After `appendAllGroups`, rewrite probe-default dragon pairs to match each SRS column’s matching dragon. */
function patchCoupledSrsDragonPreviewDefs(defs: TileDef[], p: PracticePattern): void {
  if (!p.groups?.length) return
  let idx = 0
  for (let gi = 0; gi < p.groups.length; gi++) {
    const g = p.groups[gi]!
    const n = groupPreviewSlotCountForPatternLine(g)
    const a = idx
    idx += n
    const col = srsDragonCoupledColumn(p, gi, g)
    if (col == null) continue
    const srsGi = col === 0 ? gi - 1 : gi - 2
    const srsG = p.groups[srsGi]
    if (!srsG || srsG.kind !== 'shared-rank-suits') continue
    const order = sharedRankSuitsPreviewSuits(srsG.needs, srsG.test)
    const suit = order[col]
    if (suit == null) continue
    const dr = DRAGON_FOR_SUIT[suit]
    for (let i = a; i < a + n && i < defs.length; i++) {
      defs[i] = { cat: 'dragon', dragon: dr }
    }
  }
}

/** Mirror of `countGroupPreviewSlots` in `suggestedHands.ts` — keep in sync for strip layout. */
function groupPreviewSlotCountForPatternLine(g: PatternGroup): number {
  switch (g.kind) {
    case 'fixed':
      return g.need
    case 'rank':
      return g.need
    case 'consec':
      return g.need1 + g.need2
    case 'shared-rank':
      return g.needs.reduce((a, b) => a + b, 0)
    case 'shared-rank-suits':
      return g.needs.reduce((a, b) => a + b, 0)
    case 'suit-locked-rank':
      return g.need + (g.dragonCount ?? 0)
    case 'suit-locked-consec':
      return g.numGroups * g.rankCount + g.dragonCount
    case 'consec-multi':
    case 'suit-locked-consec-multi':
      return g.needs.reduce((a, b) => a + b, 0)
    case 'suit-locked': {
      let s = g.rankNeeds.reduce((acc, x) => acc + x.need, 0)
      s += g.dragonCount
      if (g.opposingDragons) s += 2 * g.opposingDragons.need
      return s
    }
    case 'suit-permute':
      return g.colorGroups.reduce((acc, cg, ci) =>
        acc + cg.reduce((sum, sg) => sum + sg.need, 0) + (g.colorGroupDragonCounts?.[ci] ?? 0), 0)
        + (g.trailingDragonCount ?? 0)
    case 'odd-pair-kongs-triple':
      return 14
    default:
      return 0
  }
}

/**
 * Group-append order (matches `groupPreviewIndexSpans`): flowers, both SRS kongs, then coupled DD pairs.
 */
export function patternLinePreviewGroupOrderSlots(p: PracticePattern): PatternPreviewSlot[] {
  const out: PatternPreviewSlot[] = []
  const temp: TileDef[] = []
  appendAllGroups(temp, p)
  patchCoupledSrsDragonPreviewDefs(temp, p)
  const mono = p.titleSegments ? inferMonoSuitCardPrint(p.titleSegments) : null
  const ctx: PreviewLineContext = { monoSuitCardPrint: mono }
  for (const def of temp) {
    out.push({ def, cardInk: resolveCardInkForPreviewSlot(def, 'neutral', ctx) })
  }
  return out
}

export function patternLinePreviewGroupOrderDefs(p: PracticePattern): TileDef[] {
  return patternLinePreviewGroupOrderSlots(p).map((s) => s.def)
}

/**
 * Display index `d` shows the tile from **group-append** strip index `map[d]`.
 * When `map` is omitted or the wrong length, returns a shallow copy of `defs`.
 */
export function reorderTileDefsByCardLineFromGroupMap(
  defs: readonly TileDef[],
  map: readonly number[] | undefined,
): TileDef[] {
  if (!map || defs.length !== map.length) return [...defs]
  return map.map((g) => defs[g]!)
}

/** Same permutation as {@link reorderTileDefsByCardLineFromGroupMap} for preview slots. */
export function permutePatternPreviewSlotsByCardLineMap(
  slots: readonly PatternPreviewSlot[],
  map: readonly number[] | undefined,
): PatternPreviewSlot[] {
  if (!map || slots.length !== map.length) return [...slots]
  return map.map((g) => slots[g]!)
}

/**
 * Greedy assignment walks **group** order; joker flags from `patternPreviewJokerEligibleBySlot` are
 * **card/display** order. For group slot `g`, use eligibility from display index `result[g]`.
 * If `jokerEligibleGroupToDisplaySlot` is set, it wins; otherwise the inverse of
 * `cardLineFromGroupSlotMap` is used when that map matches `n`.
 */
export function jokerEligibleGroupToDisplayFromPattern(
  p: PracticePattern,
  n: number,
): readonly number[] | null {
  const direct = p.jokerEligibleGroupToDisplaySlot
  if (direct?.length === n) return direct
  const m = p.cardLineFromGroupSlotMap
  if (!m || m.length !== n) return null
  const inv = new Array<number>(n)
  for (let d = 0; d < n; d++) inv[m[d]!] = d
  return inv
}

function applyCardLineFromGroupSlotMapIfNeeded(
  p: PracticePattern,
  slots: readonly PatternPreviewSlot[],
): PatternPreviewSlot[] {
  return permutePatternPreviewSlotsByCardLineMap(slots, p.cardLineFromGroupSlotMap)
}

/** Ordered preview cells with **card PDF** ink for each mini tile (suggested hands strip). */
export function patternLinePreviewSlots(p: PracticePattern): PatternPreviewSlot[] {
  const fromSeg = buildPreviewSlotsFromTitleSegments(p)

  if (!p.previewSlotsFromGroups && fromSeg != null && fromSeg.length >= p.roughTarget) {
    return fromSeg.slice(0, p.roughTarget)
  }

  const fromGrp = p.groups?.length ? patternLinePreviewGroupOrderSlots(p) : []
  const grpSlice = fromGrp.slice(0, p.roughTarget)

  if (grpSlice.length === p.roughTarget) {
    return applyCardLineFromGroupSlotMapIfNeeded(p, grpSlice)
  }

  return grpSlice.length > 0 ? grpSlice : (fromSeg?.slice(0, p.roughTarget) ?? [])
}

/**
 * Ordered tile defs for a miniature “card line” preview (same order as `patternLinePreviewSlots`).
 */
export function patternLinePreviewDefs(p: PracticePattern): TileDef[] {
  return patternLinePreviewSlots(p).map((s) => s.def)
}

/**
 * Per-strip card inks in **the same order** as `patternLinePreviewSlots` / strip target defs
 * (group layout when groups fill the hand; otherwise title-segment slots). Avoids mis-indexing
 * title inks onto group-ordered cells (e.g. ANY LIKE NUMBERS dragons after two kongs).
 */
export function patternLinePreviewCardInks(p: PracticePattern): CardInk[] {
  return patternLinePreviewSlots(p)
    .map((s) => s.cardInk)
    .slice(0, p.roughTarget)
}
