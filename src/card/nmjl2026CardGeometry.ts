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
type RankSlot = { ink: CardInk; ranks: Map<number, number>; dragonCount: number }

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

function addDigitRun(slot: RankSlot, part: string, soapCount: { value: number }): void {
  for (const ch of part) {
    if (ch === '0') soapCount.value += 1
    else addRank(slot, Number(ch), 1)
  }
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

function isFlexibleConsecutive(row: Nmjl2026CsvHandRow): boolean {
  return hasText(row, 'Consec') && !hasText(row, 'These Nos. Only')
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

function buildRankGroups(row: Nmjl2026CsvHandRow, rankSlots: RankSlot[]): PatternGroup[] {
  const slotsWithRanks = rankSlots.filter((slot) => slot.ranks.size > 0)
  if (!slotsWithRanks.length) return []

  if (isFlexibleLikeNumber(row)) {
    const needs = slotsWithRanks.map((slot) =>
      [...slot.ranks.values()].reduce((sum, n) => sum + n, 0),
    )
    const groups: PatternGroup[] =
      needs.length >= 2
        ? [{ kind: 'shared-rank-suits', needs, test: anySuit }]
        : [{ kind: 'suit-locked-rank', need: needs[0] ?? 0, test: anySuit }]
    const dragonNeed = rankSlots.reduce((sum, slot) => sum + slot.dragonCount, 0)
    if (dragonNeed > 0) groups.push({ kind: 'fixed', need: dragonNeed, test: dragon })
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
          colorGroupDragonCounts: anyDragon ? undefined : [slot.dragonCount],
          consecRanks: true,
        },
        ...(anyDragon && slot.dragonCount > 0
          ? ([{ kind: 'fixed', need: slot.dragonCount, test: dragon }] as PatternGroup[])
          : []),
      ]
    }
    return [
      {
        kind: 'suit-locked',
        rankNeeds,
        dragonCount: anyDragon ? 0 : slot.dragonCount,
        opposingDragons:
          hasText(row, 'Opposing Dragon') && slot.dragonCount > 0 ? { need: slot.dragonCount } : undefined,
      },
      ...(anyDragon && !hasText(row, 'Opposing Dragon') && slot.dragonCount > 0
        ? ([{ kind: 'fixed', need: slot.dragonCount, test: dragon }] as PatternGroup[])
        : []),
    ]
  }

  const colorGroups = slotsWithRanks.map((slot) => slotColorGroup(slot, flexibleConsec, minRank))
  const colorGroupDragonCounts = slotsWithRanks.map((slot) => (anyDragon ? 0 : slot.dragonCount))
  const fixedDragonNeed = anyDragon ? rankSlots.reduce((sum, slot) => sum + slot.dragonCount, 0) : 0
  return [
    {
      kind: 'suit-permute',
      colorGroups,
      colorGroupDragonCounts,
      consecRanks: flexibleConsec ? true : undefined,
    },
    ...(fixedDragonNeed > 0
      ? ([{ kind: 'fixed', need: fixedDragonNeed, test: dragon }] as PatternGroup[])
      : []),
  ]
}

function buildGroupsAndMatches(row: Nmjl2026CsvHandRow): { groups: PatternGroup[]; matches: Test } {
  const groups: PatternGroup[] = []
  const matchTests: Test[] = []
  const rankSlots: RankSlot[] = []
  const soapCount = { value: 0 }

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
          addDigitRun(slot, part, soapCount)
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

  groups.push(...buildRankGroups(row, rankSlots))
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
