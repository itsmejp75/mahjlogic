import type { TileDef } from '../mahjong/types'
import type { CardInk, CardTextSeg } from './cardText'
import type { Nmjl2026CsvHandRow } from './nmjl2026Csv'
import { inferCardLineFromGroupSlotMap } from './patternLinePreview'
import type { PatternGroup, PracticePattern } from './practicePatterns'
import {
  anySuit,
  dragon,
  eastW,
  flower,
  grnDrg,
  northW,
  or,
  redDrg,
  soapDrg,
  southW,
  suit,
  westW,
  wind,
} from './practicePatterns'

type Geometry = Pick<
  PracticePattern,
  | 'groups'
  | 'matches'
  | 'titleSegments'
  | 'cardLineFromGroupSlotMap'
  | 'jokerEligibleGroupToDisplaySlot'
  | 'previewSlotsFromGroups'
  | 'skipStripTitleReorder'
>
type Test = (def: TileDef) => boolean

type ColorRun = { ink: CardInk; text: string }
type RankSlot = { ink: CardInk; ranks: Map<number, number>; dragonCount: number; firstRankOrder?: number }

function inkForCsvColor(color: string): CardInk {
  const c = color.trim().toLowerCase()
  if (c === 'green') return 'green'
  if (c === 'red') return 'red'
  return 'navy'
}

function splitColorRuns(colors: string): ColorRun[] {
  return colors
    .split(/\s*,\s*/)
    .map((part): ColorRun | null => {
      const m = part.match(/^([^:]+):\s*(.+)$/)
      return m ? { ink: inkForCsvColor(m[1]!), text: m[2]!.trim() } : null
    })
    .filter((r): r is ColorRun => r != null)
}

function fixCsvTokenText(token: string, row: Nmjl2026CsvHandRow): string {
  // The color column has this typo twice; the Hand column has the full sextet.
  if (token === 'FFFFF' && /\bFFFFFF\b/.test(row.hand)) return 'FFFFFF'
  return token
}

function tokensForRun(run: ColorRun, row: Nmjl2026CsvHandRow): string[] {
  return run.text.split(/\s+/).filter(Boolean).map((token) => fixCsvTokenText(token, row))
}

function titleSegmentsForRow(row: Nmjl2026CsvHandRow): CardTextSeg[] {
  const runs = splitColorRuns(row.colors)
  if (!runs.length) return [{ t: row.hand.trim(), ink: 'navy' }]
  return runs.map((run, i) => ({
    t: `${tokensForRun(run, row).join(' ')}${i === runs.length - 1 ? '' : ' '}`,
    ink: run.ink,
  }))
}

function pushFixedGroup(groups: PatternGroup[], need: number, test: Test): void {
  if (need > 0) groups.push({ kind: 'fixed', need, test })
}

/** Card ink on a standalone `DD` row → matcher + strip target (NMJL prints soap/0 in blue). */
function dragonTestForInk(ink: CardInk): Test {
  if (ink === 'green') return grnDrg
  if (ink === 'red') return redDrg
  if (ink === 'soap' || ink === 'navy') return soapDrg
  return dragon
}

function isAnyThreeDragonsParenthetical(row: Nmjl2026CsvHandRow): boolean {
  return /\bany 3 dragons\b/i.test(row.parenthesis)
}

function colorRunHasDigitRanks(run: ColorRun, row: Nmjl2026CsvHandRow): boolean {
  return tokensForRun(run, row).some((tok) =>
    tokenParts(tok).some((p) => /^[0-9]+$/.test(p)),
  )
}

/** D-only color runs on “Any 3 Dragons” hands — card line order, stand-in types for strip preview. */
function dragonMeldsFromAnyThreeDragonsRow(row: Nmjl2026CsvHandRow): {
  needs: number[]
  cardDragons: Array<'green' | 'red' | 'soap'>
} {
  const needs: number[] = []
  const cardDragons: Array<'green' | 'red' | 'soap'> = []
  for (const run of splitColorRuns(row.colors)) {
    if (colorRunHasDigitRanks(run, row)) continue
    let dCount = 0
    for (const token of tokensForRun(run, row)) {
      for (const part of tokenParts(token)) {
        if (/^D+$/.test(part)) dCount += part.length
      }
    }
    if (dCount > 0) {
      needs.push(dCount)
      cardDragons.push(run.ink === 'green' ? 'green' : run.ink === 'red' ? 'red' : 'soap')
    }
  }
  return { needs, cardDragons }
}

function isDragonOnlyMeldGroup(g: PatternGroup): boolean {
  if (g.kind === 'rank') {
    return (
      g.test({ cat: 'dragon', dragon: 'red' }) ||
      g.test({ cat: 'dragon', dragon: 'green' }) ||
      g.test({ cat: 'dragon', dragon: 'soap' })
    )
  }
  if (g.kind === 'fixed') {
    return (
      g.test({ cat: 'dragon', dragon: 'red' }) &&
      g.test({ cat: 'dragon', dragon: 'green' }) &&
      g.test({ cat: 'dragon', dragon: 'soap' })
    )
  }
  return false
}

function windTest(w: 'N' | 'E' | 'W' | 'S'): Test {
  if (w === 'N') return northW
  if (w === 'E') return eastW
  if (w === 'W') return westW
  return southW
}

function addRank(slot: RankSlot, rank: number, need: number): void {
  slot.ranks.set(rank, (slot.ranks.get(rank) ?? 0) + need)
}

function addDigitRun(slot: RankSlot, part: string, soapCount: { value: number }): boolean {
  let addedNaturalRank = false
  for (const ch of part) {
    if (ch === '0') soapCount.value += 1
    else {
      addRank(slot, Number(ch), 1)
      addedNaturalRank = true
    }
  }
  return addedNaturalRank
}

function tokenParts(token: string): string[] {
  return token.match(/F+|N+|E+|W+|S+|D+|[0-9]+/g) ?? []
}

function getSlot(slots: RankSlot[], ink: CardInk): RankSlot {
  let slot = slots.find((s) => s.ink === ink)
  if (!slot) {
    slot = { ink, ranks: new Map(), dragonCount: 0 }
    slots.push(slot)
  }
  return slot
}

function hasText(row: Nmjl2026CsvHandRow, needle: string): boolean {
  return `${row.parenthesis} ${row.hand}`.toLowerCase().includes(needle.toLowerCase())
}

/** Card line text like “w Opp, Dragon” (abbrev., 2026 export). */
function isOpposingDragonParenthetical(row: Nmjl2026CsvHandRow): boolean {
  const p = `${row.parenthesis} ${row.hand}`.toLowerCase()
  return p.includes('opposing dragon') || /\bw\s+opp\b/.test(p) || p.includes('opp, dragon')
}

function isFlexibleConsecutive(row: Nmjl2026CsvHandRow): boolean {
  // Most flexible runs say “Any N Consec. Nos.”; 2026 CONSECUTIVE RUN 5a/5b use “Any Run” instead.
  if (hasText(row, 'These Nos. Only')) return false
  if (hasText(row, 'Consec')) return true
  return row.category === 'CONSECUTIVE RUN' && hasText(row, 'Any Run')
}

function isFlexibleLikeNumber(row: Nmjl2026CsvHandRow): boolean {
  return (
    row.category === 'ANY LIKE NUMBERS' ||
    hasText(row, 'Any Like') ||
    (row.category === 'QUINTS' && hasText(row, 'Any Like Nos'))
  )
}

function usesAnyOrOpposingDragon(row: Nmjl2026CsvHandRow): boolean {
  const p = row.parenthesis.toLowerCase()
  return /\bany(?: \d+)? dragons?\b/.test(p) || p.includes('opposing dragon')
}

function slotColorGroup(slot: RankSlot, flexibleConsec: boolean, minRank: number) {
  return [...slot.ranks.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rank, need]) => ({
      rank: flexibleConsec ? rank - minRank + 1 : rank,
      need,
      canUseJoker: need >= 3,
    }))
}

/**
 * Dragons on inks with no suit ranks (e.g. `red:DDD` beside `green:135 777 999`). For opposing-
 * dragon hands, fold into the suit-locked group's `opposingDragons` instead of a generic `rank`
 * dragon group (which would wrongly highlight matching green dragons on a bam line).
 */
function opposingDragonNeedFromSlots(rankSlots: RankSlot[], mainSlot: RankSlot): number {
  let need = mainSlot.dragonCount
  for (const s of rankSlots) {
    if (s.ranks.size === 0 && s.dragonCount > 0) need += s.dragonCount
  }
  return need
}

/**
 * Dragons that live on “ink” rows with **no suit ranks** (e.g. `green:DDD` next to `blue:1234`)
 * must become their own meld groups. Previously `buildRankGroups` only looked at slots with
 * `ranks.size > 0`, so Wind–Dragons 2 lost two pungs and Quints 3 lost the opposing DDDD.
 */
function dragonOrphanRankGroups(row: Nmjl2026CsvHandRow, rankSlots: RankSlot[]): PatternGroup[] {
  if (isOpposingDragonParenthetical(row)) return []
  return rankSlots
    .filter((s) => s.ranks.size === 0 && s.dragonCount > 0)
    .map((s) => ({ kind: 'rank' as const, need: s.dragonCount, test: dragonTestForInk(s.ink) }))
}

function buildRankGroups(row: Nmjl2026CsvHandRow, rankSlots: RankSlot[]): PatternGroup[] {
  const slotsWithRanks = rankSlots
    .filter((slot) => slot.ranks.size > 0)
    .sort((a, b) => (a.firstRankOrder ?? 0) - (b.firstRankOrder ?? 0))
  if (!slotsWithRanks.length) return []

  if (isFlexibleLikeNumber(row)) {
    const hasMatchingDragonText = hasText(row, 'Matching Dragon')
    const hasRankSlotDragons = slotsWithRanks.some((slot) => slot.dragonCount > 0)
    if (slotsWithRanks.length >= 2 && hasMatchingDragonText && hasRankSlotDragons) {
      return [
        {
          kind: 'suit-permute',
          colorGroups: slotsWithRanks.map((slot) => slotColorGroup(slot, false, 1)),
          colorGroupDragonCounts: slotsWithRanks.map((slot) => slot.dragonCount),
        },
        ...dragonOrphanRankGroups(row, rankSlots),
      ]
    }

    const needs = slotsWithRanks.map((slot) =>
      [...slot.ranks.values()].reduce((sum, n) => sum + n, 0),
    )
    const groups: PatternGroup[] =
      needs.length >= 2
        ? [{ kind: 'shared-rank-suits', needs, test: anySuit }]
        : [{ kind: 'suit-locked-rank', need: needs[0] ?? 0, test: anySuit }]
    const dragonOnRankSlots = slotsWithRanks.reduce((sum, slot) => sum + slot.dragonCount, 0)
    if (dragonOnRankSlots > 0) groups.push({ kind: 'fixed', need: dragonOnRankSlots, test: dragon })
    groups.push(...dragonOrphanRankGroups(row, rankSlots))
    return groups
  }

  const flexibleConsec = isFlexibleConsecutive(row)
  const allRanks = slotsWithRanks.flatMap((slot) => [...slot.ranks.keys()])
  const minRank = allRanks.length ? Math.min(...allRanks) : 1
  const anyDragon = usesAnyOrOpposingDragon(row)

  if (slotsWithRanks.length === 1) {
    const slot = slotsWithRanks[0]!
    const rankNeeds = [...slot.ranks.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([rank, need]) => ({ rank: flexibleConsec ? rank - minRank + 1 : rank, need }))
    if (flexibleConsec) {
      return [
        {
          kind: 'suit-permute',
          colorGroups: [slotColorGroup(slot, true, minRank)],
          // Matching dragons on the same ink as the run (e.g. DDDD with 1234) belong to the suit
          // slot — even when other inks are “any dragon” pungs (Wind–Dragons 2).
          colorGroupDragonCounts: slot.dragonCount > 0 ? [slot.dragonCount] : undefined,
          consecRanks: true,
        },
        ...dragonOrphanRankGroups(row, rankSlots),
      ]
    }
    const opposingNeed = isOpposingDragonParenthetical(row)
      ? opposingDragonNeedFromSlots(rankSlots, slot)
      : 0
    return [
      {
        kind: 'suit-locked',
        rankNeeds,
        dragonCount: anyDragon ? 0 : slot.dragonCount,
        opposingDragons: opposingNeed > 0 ? { need: opposingNeed } : undefined,
      },
      ...(anyDragon && !isOpposingDragonParenthetical(row) && slot.dragonCount > 0
        ? ([{ kind: 'fixed', need: slot.dragonCount, test: dragon }] as PatternGroup[])
        : []),
      ...dragonOrphanRankGroups(row, rankSlots),
    ]
  }

  const colorGroups = slotsWithRanks.map((slot) => slotColorGroup(slot, flexibleConsec, minRank))
  const colorGroupDragonCounts = slotsWithRanks.map((slot) => slot.dragonCount)
  return [
    {
      kind: 'suit-permute',
      colorGroups,
      colorGroupDragonCounts,
      consecRanks: flexibleConsec ? true : undefined,
    },
    ...dragonOrphanRankGroups(row, rankSlots),
  ]
}

/**
 * 2026 NMJL `13579-4` style: six-tile suit block with one odd rank paired (e.g. `113579`), and both
 * other suits show a kong of that pair rank. The card prints the “1” example; matcher must try every
 * odd pair rank — see `odd-pair-kongs-triple` in `practicePatterns.ts`.
 */
function isOddPairKongsTripleRow(row: Nmjl2026CsvHandRow): boolean {
  const p = row.parenthesis.toLowerCase()
  return p.includes('pair any odd') && p.includes('kongs match pair')
}

/** 369 #5: `FF 3369 3333 3333` — pair rank ∈ {3,6,9}, two kongs match that pair (card prints 3s). */
function is369PairKongsTripleRow(row: Nmjl2026CsvHandRow): boolean {
  if (row.category !== '369') return false
  const p = row.parenthesis.toLowerCase()
  return p.includes('kongs match pair') && p.includes('pair 3') && p.includes('6')
}

function buildGroupsAndMatches(row: Nmjl2026CsvHandRow): { groups: PatternGroup[]; matches: Test } {
  if (isOddPairKongsTripleRow(row)) {
    return {
      groups: [{ kind: 'odd-pair-kongs-triple', odds: [1, 3, 5, 7, 9] }],
      matches: suit(1, 3, 5, 7, 9),
    }
  }
  if (is369PairKongsTripleRow(row)) {
    return {
      groups: [
        { kind: 'fixed', need: 2, test: flower },
        { kind: 'odd-pair-kongs-triple', odds: [3, 6, 9] },
      ],
      matches: or(flower, suit(3, 6, 9)),
    }
  }
  const groups: PatternGroup[] = []
  const matchTests: Test[] = []
  const rankSlots: RankSlot[] = []
  const soapCount = { value: 0 }
  let rankGroupInsertPos = -1
  let nextRankOrder = 0

  for (const run of splitColorRuns(row.colors)) {
    const slot = getSlot(rankSlots, run.ink)
    for (const token of tokensForRun(run, row)) {
      for (const part of tokenParts(token)) {
        if (/^F+$/.test(part)) {
          pushFixedGroup(groups, part.length, flower)
          matchTests.push(flower)
        } else if (/^[NEWS]+$/.test(part)) {
          const counts = new Map<'N' | 'E' | 'W' | 'S', number>()
          for (const ch of part) {
            const w = ch as 'N' | 'E' | 'W' | 'S'
            counts.set(w, (counts.get(w) ?? 0) + 1)
          }
          for (const [w, need] of counts) {
            pushFixedGroup(groups, need, windTest(w))
            matchTests.push(windTest(w))
          }
        } else if (/^D+$/.test(part)) {
          const runHasDigitRanks = colorRunHasDigitRanks(run, row)
          if (isAnyThreeDragonsParenthetical(row) && !runHasDigitRanks) {
            // W&D #2: three D-only ink rows → consolidated `dragon-meld-permute` at end.
          } else if (slot.ranks.size > 0 && !runHasDigitRanks) {
            // Same ink twice (e.g. W&D #2 `blue:1234` then `blue:DDDD`) — not matching dragons on the run.
            pushFixedGroup(groups, part.length, dragonTestForInk(run.ink))
          } else {
            slot.dragonCount += part.length
          }
          matchTests.push(dragon)
        } else if (/^[0-9]+$/.test(part)) {
          if (rankGroupInsertPos < 0) rankGroupInsertPos = groups.length
          if (addDigitRun(slot, part, soapCount) && slot.firstRankOrder == null) {
            slot.firstRankOrder = nextRankOrder++
          }
          matchTests.push(anySuit)
          if (part.includes('0')) matchTests.push(soapDrg)
        }
      }
    }
  }

  if (soapCount.value > 0) {
    pushFixedGroup(groups, soapCount.value, soapDrg)
    matchTests.push(soapDrg)
  }

  const rankGroups = buildRankGroups(row, rankSlots)
  if (rankGroupInsertPos >= 0 && rankGroupInsertPos < groups.length) {
    groups.splice(rankGroupInsertPos, 0, ...rankGroups)
  } else {
    groups.push(...rankGroups)
  }
  if (!rankSlots.some((slot) => slot.ranks.size > 0)) {
    const dragonOnlySlots = rankSlots.filter((slot) => slot.dragonCount > 0)
    // NMJL prints separate ink rows for each `DD` (e.g. W&D 7a/7b: green `DD` then red `DD`).
    // One merged `fixed` group of 4 lets the matcher place four naturals as “any four dragons”,
    // which breaks **pair** semantics in the strip. Emit one `fixed` group per ink row instead.
    if (dragonOnlySlots.length > 1) {
      for (const slot of dragonOnlySlots) {
        if (slot.dragonCount > 0) {
          pushFixedGroup(groups, slot.dragonCount, dragonTestForInk(slot.ink))
        }
      }
    } else {
      const dragonNeed = rankSlots.reduce((sum, slot) => sum + slot.dragonCount, 0)
      if (dragonNeed > 0) pushFixedGroup(groups, dragonNeed, dragon)
    }
  }

  const exactRanks = rankSlots.flatMap((slot) => [...slot.ranks.keys()])
  const suitMatch =
    isFlexibleConsecutive(row) || isFlexibleLikeNumber(row)
      ? anySuit
      : exactRanks.length
        ? suit(...exactRanks)
        : anySuit
  if (isAnyThreeDragonsParenthetical(row)) {
    const { needs, cardDragons } = dragonMeldsFromAnyThreeDragonsRow(row)
    if (needs.length >= 2 && needs.reduce((a, b) => a + b, 0) > 0) {
      const withoutDragonMelds = groups.filter((g) => !isDragonOnlyMeldGroup(g))
      withoutDragonMelds.push({ kind: 'dragon-meld-permute', needs, cardDragons })
      groups.length = 0
      groups.push(...withoutDragonMelds)
    }
  }

  const usefulTests = [
    ...matchTests.filter((test) => test !== anySuit),
    exactRanks.length ? suitMatch : undefined,
    rankSlots.some((slot) => slot.dragonCount > 0) ? dragon : undefined,
  ].filter((test): test is Test => typeof test === 'function')

  return {
    groups,
    matches: usefulTests.length ? or(...usefulTests) : or(anySuit, flower, wind, dragon, soapDrg),
  }
}

export function nmjl2026GeometryFromCsvRow(row: Nmjl2026CsvHandRow): Geometry {
  const { groups, matches } = buildGroupsAndMatches(row)
  const oddPairKongs = groups.some((g) => g.kind === 'odd-pair-kongs-triple')
  const base: Geometry = {
    groups,
    matches,
    titleSegments: titleSegmentsForRow(row),
    // Six-tile suit block uses placeholder rank 1 in title preview; matcher selects the real pair
    // rank dynamically, so the strip must come from groups and skip title reordering.
    ...(oddPairKongs ? { previewSlotsFromGroups: true, skipStripTitleReorder: true } : {}),
  }
  const cardLineFromGroupSlotMap = inferCardLineFromGroupSlotMap({
    ...base,
    id: '_infer',
    section: row.category,
    title: row.hand.trim(),
    points: row.points,
    closed: row.closed,
    roughTarget: 14,
  })
  if (
    cardLineFromGroupSlotMap &&
    !cardLineFromGroupSlotMap.every((g, d) => g === d)
  ) {
    return { ...base, cardLineFromGroupSlotMap }
  }
  return base
}
