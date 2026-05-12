import type { TileDef } from '../mahjong/types'
import type { CardInk, CardTextSeg } from './cardText'
import type { Nmjl2026CsvHandRow } from './nmjl2026Csv'
import type { PatternGroup, PracticePattern } from './practicePatterns'
import {
  anySuit,
  dragon,
  eastW,
  flower,
  northW,
  or,
  soapDrg,
  southW,
  suit,
  westW,
  wind,
} from './practicePatterns'

type Geometry = Pick<PracticePattern, 'groups' | 'matches' | 'titleSegments'>
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
 * Dragons that live on “ink” rows with **no suit ranks** (e.g. `green:DDD` next to `blue:1234`)
 * must become their own meld groups. Previously `buildRankGroups` only looked at slots with
 * `ranks.size > 0`, so Wind–Dragons 2 lost two pungs and Quints 3 lost the opposing DDDD.
 */
function dragonOrphanRankGroups(rankSlots: RankSlot[]): PatternGroup[] {
  return rankSlots
    .filter((s) => s.ranks.size === 0 && s.dragonCount > 0)
    .map((s) => ({ kind: 'rank' as const, need: s.dragonCount, test: dragon }))
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
        ...dragonOrphanRankGroups(rankSlots),
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
    groups.push(...dragonOrphanRankGroups(rankSlots))
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
        ...dragonOrphanRankGroups(rankSlots),
      ]
    }
    return [
      {
        kind: 'suit-locked',
        rankNeeds,
        dragonCount: anyDragon ? 0 : slot.dragonCount,
        opposingDragons:
          isOpposingDragonParenthetical(row) && slot.dragonCount > 0 ? { need: slot.dragonCount } : undefined,
      },
      ...(anyDragon && !isOpposingDragonParenthetical(row) && slot.dragonCount > 0
        ? ([{ kind: 'fixed', need: slot.dragonCount, test: dragon }] as PatternGroup[])
        : []),
      ...dragonOrphanRankGroups(rankSlots),
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
    ...dragonOrphanRankGroups(rankSlots),
  ]
}

function buildGroupsAndMatches(row: Nmjl2026CsvHandRow): { groups: PatternGroup[]; matches: Test } {
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
          slot.dragonCount += part.length
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
    const dragonNeed = rankSlots.reduce((sum, slot) => sum + slot.dragonCount, 0)
    pushFixedGroup(groups, dragonNeed, dragon)
  }

  const exactRanks = rankSlots.flatMap((slot) => [...slot.ranks.keys()])
  const suitMatch =
    isFlexibleConsecutive(row) || isFlexibleLikeNumber(row)
      ? anySuit
      : exactRanks.length
        ? suit(...exactRanks)
        : anySuit
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
  return {
    groups,
    matches,
    titleSegments: titleSegmentsForRow(row),
  }
}
