import type { Dragon, Suit, TileDef, TileInstance } from '../mahjong/types'
import { tileDefsEqual } from '../mahjong/tileUtils'
import type { CardInk } from '../card/cardText'
import {
  firstOpposingConsecutiveStandInPairFromTitle,
  patternLinePreviewCardInks,
  patternLinePreviewDefs,
  patternLinePreviewGroupOrderDefs,
  patternPreviewJokerEligibleBySlot,
  reorderConsec6GroupTileDefsToDisplay,
  reorderLikeThreeGroupTileDefsToDisplay,
  reorderLikeTwoGroupTileDefsToDisplay,
  reorderMath2GroupTileDefsToDisplay,
  reorder2468_2GroupTileDefsToDisplay,
  reorder13579_1bGroupTileDefsToDisplay,
  srsDragonCoupledColumn,
} from '../card/patternLinePreview'
import { PRACTICE_PATTERNS } from '../card/practicePatterns'
import { suitPermutations } from '../card/nmjlSuitSlots'
import type { PatternGroup, PracticePattern } from '../card/practicePatterns'
import type { SuggestedHandLine } from '../training/types'
import type { BotExposure } from './types'
import {
  claimMeldsFitPracticePattern,
  tileInstancesWithClaimMeldJokersResolved,
} from './eastExposurePatternFit'

/** Discards + all bot melds + East’s face-up claim melds (table visibility for dead-tile math). */
function tableVisibleTiles(
  discards: TileInstance[],
  botExposures: BotExposure[],
  eastTableClaimMelds: ReadonlyArray<{ tiles: TileInstance[] }>,
): TileInstance[] {
  return [
    ...discards,
    ...botExposures.flatMap((e) => e.tiles),
    ...eastTableClaimMelds.flatMap((e) => e.tiles),
  ]
}

/** Hand + claim melds for `computeGroupMatch` / greedy detail: exposure jokers use their meld tile. */
function rackForPatternWithClaimMelds(
  hand: TileInstance[],
  playerClaimMelds: ReadonlyArray<{ tiles: TileInstance[] }>,
): TileInstance[] {
  return tileInstancesWithClaimMeldJokersResolved(hand, playerClaimMelds)
}

function pressureLabel(need: number, wall: number): SuggestedHandLine['pressure'] {
  const ratio = need / Math.max(1, wall)
  if (ratio < 0.28) return 'comfortable'
  if (ratio < 0.52) return 'tight'
  return 'desperate'
}

/**
 * Returns a grouping key for a tile:
 *   suit tiles  → the rank as a string ("1"…"9")
 *   dragon tiles → dragon type ("red" | "green" | "soap")
 *   wind tiles   → wind direction ("N" | "E" | "W" | "S")
 *   others       → the category string
 */
function tileKey(def: TileInstance['def']): string {
  if (def.cat === 'suit')   return String(def.rank)
  if (def.cat === 'dragon') return def.dragon
  if (def.cat === 'wind')   return def.wind
  return def.cat
}

const SUITS: Suit[] = ['bam', 'dot', 'crak']

/**
 * After you **pick** a real suit for a suit-locked line, American mahjong pairs that suit’s
 * column dragons (bam→green, dot→soap, crak→red). This is **not** the same thing as “red ink on
 * the card always means craks” — see `nmjlSuitSlots.ts` for three-color **slots** vs stand-in preview.
 */
const DRAGON_FOR_SUIT: Record<Suit, 'red' | 'green' | 'soap'> = {
  crak: 'red',
  bam: 'green',
  dot: 'soap',
}

/** True when `g` is an unconstrained dragon `fixed` group (any of the three dragons). */
function isGenericAllDragonsFixedGroup(g: PatternGroup): boolean {
  if (g.kind !== 'fixed') return false
  return (
    g.test({ cat: 'dragon', dragon: 'red' }) &&
    g.test({ cat: 'dragon', dragon: 'green' }) &&
    g.test({ cat: 'dragon', dragon: 'soap' })
  )
}

/** One tile consumed by `computeGroupMatch` (natural or joker fill), for preview-strip alignment. */
export type GroupUsedMeta = {
  id: string
  groupIdx: number
  /** Natural tiles in the first vs second rank arm of a `consec` group. */
  consecPart?: 0 | 1
  isJoker?: boolean
}

type GroupMatchOpts = {
  /**
   * NMJL / common card notes: jokers never count toward **Singles and Pairs** hands
   * (see e.g. Southern Sparrow, “Singles and Pairs: No Jokers can be used in these hands” —
   * https://southernsparrow.com/pages/how-to-read-the-national-mah-jongg-league-card-nmjl-card ).
   */
  noJokers?: boolean
  /** When set, each tile id removed by the greedy matcher is appended in order (for UI + rack sort). */
  usedOut?: string[]
  /** Parallel detail: which pattern group each `usedOut` id belongs to (and consec arm / joker fill). */
  usedMeta?: GroupUsedMeta[]
  /**
   * When true, take tiles left-to-right instead of right-to-left. Used by the highlight and
   * sort paths so that leftmost copies of duplicate tiles are always the ones marked "best" —
   * keeping the rack sort and the highlight computation consistent with each other.
   */
  leftToRight?: boolean
  /**
   * Tile ids in this seat’s exposure melds. A kong-sized natural commit in one column of a
   * `shared-rank-suits` group (e.g. ANY LIKE NUMBERS) fixes the like-number rank to that exposure.
   */
  exposureTileIds?: ReadonlySet<string>
}

/**
 * When an exposure shows `max(...needs)` naturals of the same rank R in one suit column of a
 * `shared-rank-suits` group, only R is legal for that card line — do not score a different rank
 * higher from the concealed hand.
 */
function forcedSharedRankSuitsRankFromExposures(
  rack: TileInstance[],
  exposureTileIds: ReadonlySet<string> | undefined,
  g: Extract<PatternGroup, { kind: 'shared-rank-suits' }>,
): number | null {
  if (!exposureTileIds || exposureTileIds.size === 0) return null
  const maxNeed = Math.max(...g.needs)
  const counts = new Map<string, number>()
  for (const t of rack) {
    if (!exposureTileIds.has(t.id)) continue
    if (t.def.cat !== 'suit' || !g.test(t.def)) continue
    const k = `${t.def.rank}\0${t.def.suit}`
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  let locked: number | null = null
  for (const [k, c] of counts) {
    if (c < maxNeed) continue
    const sep = k.indexOf('\0')
    if (sep < 0) continue
    const rank = parseInt(k.slice(0, sep), 10)
    if (!Number.isFinite(rank) || rank < 1 || rank > 9) continue
    if (locked != null && locked !== rank) return null
    locked = rank
  }
  return locked
}

/**
 * Computes how many tiles in `hand` productively fill the pattern's explicit groups.
 * Each tile can only be used once (greedy left-to-right allocation).
 *
 * **Jokers** (aligned with [I Love Mahj — Using jokers](https://ilovemahj.com/american-mahjong-getting-started)):
 * substitute only in **3+ identical** combinations (pung / kong / quint / sextet), including a
 * flower pung/kong when the card shows FFF/FFFF; never singles, pairs, or “fake runs” like NEWS /
 * year digits (those are singles in code via `fixed` / small `need`). Pairs of flowers (FF) get no jokers.
 */
function countGroupPreviewSlots(g: PatternGroup): number {
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
    default:
      return 0
  }
}

/**
 * `[start, end)` indices into `patternLinePreviewGroupOrderDefs(p)` for each `p.groups[i]`, when tile counts
 * match the preview strip length (same order as groups on the card).
 */
/** True if this preview tile “kind” matches what `g` consumes (strip must align with group semantics). */
function previewDefFitsGroupTileType(d: TileDef, g: PatternGroup): boolean {
  switch (g.kind) {
    case 'fixed':
      return g.test(d)
    case 'shared-rank':
    case 'shared-rank-suits':
      return d.cat === 'suit'
    case 'consec':
    case 'consec-multi':
    case 'suit-locked-consec-multi':
      return d.cat === 'suit'
    case 'suit-locked-rank':
      return d.cat === 'suit' || (d.cat === 'dragon' && (g.dragonCount ?? 0) > 0)
    case 'suit-locked-consec':
      return d.cat === 'suit' || d.cat === 'dragon'
    case 'rank':
      return d.cat === 'suit' || d.cat === 'dragon'
    case 'suit-locked':
      return d.cat === 'suit' || d.cat === 'dragon'
    case 'suit-permute':
      return d.cat === 'suit' || (d.cat === 'dragon' && (
        (g.colorGroupDragonCounts?.some((dc) => dc > 0) ?? false) ||
        (g.trailingDragonCount ?? 0) > 0
      ))
    default:
      return true
  }
}

export function groupPreviewIndexSpans(p: PracticePattern): [number, number][] | null {
  if (!p.groups?.length) return null
  const defs = patternLinePreviewGroupOrderDefs(p)
  const defsLen = defs.length
  const spans: [number, number][] = []
  let c = 0
  for (let i = 0; i < p.groups.length; i++) {
    const g = p.groups[i]!
    const n = countGroupPreviewSlots(g)
    const a = c
    const b = c + n
    if (b > defsLen) return null
    for (let si = a; si < b; si++) {
      if (!previewDefFitsGroupTileType(defs[si]!, g)) return null
    }
    spans.push([a, b])
    c = b
  }
  if (c !== defsLen) return null
  return spans
}

function computeGroupMatch(hand: TileInstance[], groups: PatternGroup[], opts?: GroupMatchOpts): number {
  const remaining = [...hand]
  let total = 0
  const noJokers = opts?.noJokers ?? false
  const usedOut = opts?.usedOut
  const usedMeta = opts?.usedMeta
  const jokerSlotsByGroup = new Array(groups.length).fill(0)
  let jokerEligibleUnfilled = 0
  /** After a winning `shared-rank-suits`, pair the next DD groups to those suit columns (card order). */
  let srsDragonCoupling: { groupIndex: number; perm: Suit[] } | null = null

  /** Build a map from tileKey → tiles for all remaining tiles matching `pred`. */
  function byKey(pred: (def: TileInstance['def']) => boolean): Map<string, TileInstance[]> {
    const m = new Map<string, TileInstance[]>()
    for (const t of remaining) {
      if (!pred(t.def)) continue
      const k = tileKey(t.def)
      const arr = m.get(k) ?? []
      arr.push(t)
      m.set(k, arr)
    }
    return m
  }

  /** Build rank→count map for suit tiles matching `pred`. */
  function suitByRank(pred: (def: TileInstance['def']) => boolean): Map<number, number> {
    const m = new Map<number, number>()
    for (const t of remaining) {
      if (pred(t.def) && t.def.cat === 'suit') {
        m.set(t.def.rank, (m.get(t.def.rank) ?? 0) + 1)
      }
    }
    return m
  }

  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi]!

    function take(pred: (def: TileInstance['def']) => boolean, n: number, consecPart?: 0 | 1): number {
      let taken = 0
      if (opts?.leftToRight) {
        // Scan left-to-right so leftmost copies are consumed first (used by highlight/sort paths).
        for (let i = 0; i < remaining.length && taken < n; ) {
          if (pred(remaining[i]!.def)) {
            const [t] = remaining.splice(i, 1)
            if (t && usedOut) usedOut.push(t.id)
            if (t && usedMeta) {
              const row: GroupUsedMeta = { id: t.id, groupIdx: gi }
              if (consecPart !== undefined) row.consecPart = consecPart
              usedMeta.push(row)
            }
            taken++
            // don't increment i — next element has shifted into position i
          } else {
            i++
          }
        }
      } else {
        for (let i = remaining.length - 1; i >= 0 && taken < n; i--) {
          if (pred(remaining[i]!.def)) {
            const [t] = remaining.splice(i, 1)
            if (t && usedOut) usedOut.push(t.id)
            if (t && usedMeta) {
              const row: GroupUsedMeta = { id: t.id, groupIdx: gi }
              if (consecPart !== undefined) row.consecPart = consecPart
              usedMeta.push(row)
            }
            taken++
          }
        }
      }
      return taken
    }

    function noteJokerSlots(need: number, matched: number, skip = false) {
      if (noJokers || skip) return
      if (need < 3) return
      const u = need - matched
      if (u <= 0) return
      jokerEligibleUnfilled += u
      jokerSlotsByGroup[gi] += u
    }

    switch (g.kind) {

      case 'fixed': {
        let pred: (def: TileInstance['def']) => boolean = g.test
        const couple = srsDragonCoupling
        if (couple && g.need === 2 && isGenericAllDragonsFixedGroup(g)) {
          if (gi === couple.groupIndex + 1) {
            const dr = DRAGON_FOR_SUIT[couple.perm[0]!]!
            pred = d => d.cat === 'dragon' && d.dragon === dr
          } else if (gi === couple.groupIndex + 2 && couple.perm.length >= 2) {
            const dr = DRAGON_FOR_SUIT[couple.perm[1]!]!
            pred = d => d.cat === 'dragon' && d.dragon === dr
          }
        }
        const m = take(pred, g.need)
        total += m
        noteJokerSlots(g.need, m)
        break
      }

      case 'rank': {
        // Pick the key (rank/type) with the most matching tiles, take up to `need`.
        const map = byKey(g.test)
        let bestKey = '', bestCount = 0
        for (const [k, ts] of map) {
          if (ts.length > bestCount) { bestCount = ts.length; bestKey = k }
        }
        if (bestKey) {
          const k = bestKey
          const m = take(d => g.test(d) && tileKey(d) === k, g.need)
          total += m
          noteJokerSlots(g.need, m)
        }
        break
      }

      case 'suit-locked-rank': {
        // One suit + one rank (e.g. “1111” kong in a single suit), optionally with matched dragons.
        const drgForSuitSlr = { bam: 'green' as const, dot: 'soap' as const, crak: 'red' as const }
        const dcSlr = g.dragonCount ?? 0
        let bestFill = 0
        let bestSuit: Suit | null = null
        let bestRank = -1
        for (const s of SUITS) {
          for (let rank = 1; rank <= 9; rank++) {
            const c = remaining.filter(
              t => t.def.cat === 'suit' && t.def.suit === s && t.def.rank === rank && g.test(t.def),
            ).length
            let fill = Math.min(c, g.need)
            if (dcSlr > 0) {
              const drg = drgForSuitSlr[s]
              fill += Math.min(remaining.filter(t => t.def.cat === 'dragon' && t.def.dragon === drg).length, dcSlr)
            }
            if (fill > bestFill) {
              bestFill = fill
              bestSuit = s
              bestRank = rank
            }
          }
        }
        if (bestSuit !== null && bestRank >= 0) {
          const s = bestSuit
          const r = bestRank
          const m = take(
            d => d.cat === 'suit' && d.suit === s && d.rank === r && g.test(d),
            g.need,
          )
          total += m
          noteJokerSlots(g.need, m)
          if (dcSlr > 0) {
            const drg = drgForSuitSlr[s]
            const dm = take(d => d.cat === 'dragon' && d.dragon === drg, dcSlr)
            total += dm
            noteJokerSlots(dcSlr, dm)
          }
        }
        break
      }

      case 'consec': {
        // Each arm must be same-suit tiles (the two arms may use different suits).
        // Count per suit+rank so 3B+3C+3D does NOT inflate a single arm's fill count.
        const bySR = new Map<string, number>() // `${suit}:${rank}` → count
        for (const t of remaining) {
          if (t.def.cat === 'suit' && g.test(t.def)) {
            const k = `${t.def.suit}:${t.def.rank}`
            bySR.set(k, (bySR.get(k) ?? 0) + 1)
          }
        }
        let bestFill = 0, bestBalance = -1, bestR = -1
        let bestS1: string | null = null, bestS2: string | null = null
        for (const [k1, c1] of bySR) {
          const [s1, rStr] = k1.split(':') as [string, string]
          const r = parseInt(rStr)
          const f1 = Math.min(c1, g.need1)
          // Best suit for arm2 (rank r+1); if opposingSuits, arm2 suit must differ from arm1.
          let bestF2 = 0, bestSuit2: string | null = null
          for (const [k2, c2] of bySR) {
            const [s2, rStr2] = k2.split(':') as [string, string]
            if (parseInt(rStr2) !== r + 1) continue
            if (g.opposingSuits && s2 === s1) continue
            const f2 = Math.min(c2, g.need2)
            if (f2 > bestF2) { bestF2 = f2; bestSuit2 = s2 }
          }
          const fill = f1 + bestF2
          // Tiebreak: prefer pairs where BOTH arms have naturals (min of the two arms is higher).
          const balance = Math.min(f1, bestF2)
          if (fill > bestFill || (fill === bestFill && balance > bestBalance)) {
            bestFill = fill; bestBalance = balance; bestR = r; bestS1 = s1; bestS2 = bestSuit2
          }
        }
        if (bestR >= 0 && bestS1 !== null) {
          const s1 = bestS1
          const m1 = take(d => d.cat === 'suit' && d.suit === s1 && d.rank === bestR && g.test(d), g.need1, 0)
          total += m1
          noteJokerSlots(g.need1, m1)
          // For opposing-suit hands fall back to any suit that isn't s1; never reuse arm1's suit.
          const SUITS_ALL = ['bam', 'dot', 'crak'] as const
          const s2 = bestS2 ?? (g.opposingSuits
            ? (SUITS_ALL.find(s => s !== s1) ?? s1)
            : s1)
          const m2 = take(d => d.cat === 'suit' && d.suit === s2 && d.rank === bestR + 1 && g.test(d), g.need2, 1)
          total += m2
          noteJokerSlots(g.need2, m2)
        }
        break
      }

      case 'shared-rank': {
        // All sub-groups must use the same rank/key. Find the key that maximises
        // min(available, totalNeed) then distribute greedily across sub-groups.
        const totalNeed = g.needs.reduce((a, b) => a + b, 0)
        const map = byKey(g.test)
        let bestKey = '', bestFill = 0
        for (const [k, ts] of map) {
          const fill = Math.min(ts.length, totalNeed)
          if (fill > bestFill) { bestFill = fill; bestKey = k }
        }
        if (bestKey) {
          const k = bestKey
          let rem = bestFill
          for (const need of g.needs) {
            if (rem <= 0) break
            const n = Math.min(need, rem)
            const m = take(d => g.test(d) && tileKey(d) === k, n)
            total += m
            noteJokerSlots(need, m)
            rem -= n
          }
        }
        break
      }

      case 'shared-rank-suits': {
        // Same rank R; each needs[i] must come from a different suit (2 or 3 groups).
        const n = g.needs.length
        if (n < 2 || n > 3) break
        const forcedRank = forcedSharedRankSuitsRankFromExposures(remaining, opts?.exposureTileIds, g)
        const ranksToTry =
          forcedRank != null ? [forcedRank] : ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const)
        let bestFill = 0
        let bestRank = -1
        let bestPerm: Suit[] = []
        for (const rank of ranksToTry) {
          const counts: Record<Suit, number> = { bam: 0, dot: 0, crak: 0 }
          for (const t of remaining) {
            if (t.def.cat === 'suit' && g.test(t.def) && t.def.rank === rank) {
              counts[t.def.suit]++
            }
          }
          for (const perm of suitPermutations(n)) {
            let fill = 0
            for (let i = 0; i < n; i++) {
              fill += Math.min(counts[perm[i]!], g.needs[i]!)
            }
            if (fill > bestFill) {
              bestFill = fill
              bestRank = rank
              bestPerm = [...perm]
            }
          }
        }
        if (bestRank >= 0 && bestPerm.length === n) {
          srsDragonCoupling = { groupIndex: gi, perm: bestPerm }
          for (let i = 0; i < n; i++) {
            const s = bestPerm[i]!
            const need = g.needs[i]!
            const m = take(
              d => d.cat === 'suit' && d.suit === s && d.rank === bestRank && g.test(d),
              need,
            )
            total += m
            noteJokerSlots(need, m)
          }
        }
        break
      }

      case 'suit-locked-consec': {
        // Find the (suit, startRank) pair that fills the most tiles.
        // Starting ranks 1 … (10 - numGroups) are valid for ranks 1-9.
        const dragonForSuit = { bam: 'green', dot: 'soap', crak: 'red' } as const
        const suits = ['bam', 'dot', 'crak'] as const
        const maxStart = 10 - g.numGroups

        let bestFill = 0
        let bestSuit: (typeof suits)[number] | null = null
        let bestStart = -1

        for (const s of suits) {
          // Build rank→count for this suit
          const byRank = new Map<number, number>()
          for (const t of remaining) {
            if (t.def.cat === 'suit' && t.def.suit === s) {
              byRank.set(t.def.rank, (byRank.get(t.def.rank) ?? 0) + 1)
            }
          }
          const drg = dragonForSuit[s]
          const dCount = Math.min(
            remaining.filter(t => t.def.cat === 'dragon' && t.def.dragon === drg).length,
            g.dragonCount
          )

          for (let r = 1; r <= maxStart; r++) {
            let fill = 0
            for (let i = 0; i < g.numGroups; i++) {
              fill += Math.min(byRank.get(r + i) ?? 0, g.rankCount)
            }
            fill += dCount
            if (fill > bestFill) { bestFill = fill; bestSuit = s; bestStart = r }
          }
        }

        if (bestSuit && bestStart >= 0) {
          const s = bestSuit
          for (let i = 0; i < g.numGroups; i++) {
            const rank = bestStart + i
            const m = take(d => d.cat === 'suit' && d.suit === s && d.rank === rank, g.rankCount)
            total += m
            noteJokerSlots(g.rankCount, m)
          }
          if (g.dragonCount > 0) {
            const drg = dragonForSuit[s]
            const md = take(d => d.cat === 'dragon' && d.dragon === drg, g.dragonCount)
            total += md
            noteJokerSlots(g.dragonCount, md)
          }
        }
        break
      }

      case 'consec-multi': {
        // N consecutive rank groups of sizes needs[0..N-1]. Find best starting rank.
        const rc = suitByRank(g.test)
        const n = g.needs.length
        let bestFill = 0, bestR = -1
        for (const [r] of rc) {
          let fill = 0
          for (let i = 0; i < n; i++) fill += Math.min(rc.get(r + i) ?? 0, g.needs[i])
          if (fill > bestFill) { bestFill = fill; bestR = r }
        }
        if (bestR >= 0) {
          for (let i = 0; i < n; i++) {
            const rank = bestR + i
            const need = g.needs[i]!
            const m = take(d => d.cat === 'suit' && d.rank === rank, need)
            total += m
            noteJokerSlots(need, m)
          }
        }
        break
      }

      case 'suit-locked-consec-multi': {
        // Like consec-multi, but every rank group must come from the **same** suit (NMJL quints line).
        const suits = ['bam', 'dot', 'crak'] as const
        const n = g.needs.length
        const maxStart = 10 - n
        let bestFill = 0
        let bestSuit: (typeof suits)[number] | null = null
        let bestStart = -1

        for (const s of suits) {
          const byRank = new Map<number, number>()
          for (const t of remaining) {
            if (t.def.cat === 'suit' && t.def.suit === s && g.test(t.def)) {
              byRank.set(t.def.rank, (byRank.get(t.def.rank) ?? 0) + 1)
            }
          }
          for (let r = 1; r <= maxStart; r++) {
            let fill = 0
            for (let i = 0; i < n; i++) {
              fill += Math.min(byRank.get(r + i) ?? 0, g.needs[i])
            }
            if (fill > bestFill) {
              bestFill = fill
              bestSuit = s
              bestStart = r
            }
          }
        }

        if (bestSuit && bestStart >= 0) {
          const s = bestSuit
          for (let i = 0; i < n; i++) {
            const rank = bestStart + i
            const need = g.needs[i]!
            const m = take(
              d => d.cat === 'suit' && d.suit === s && d.rank === rank && g.test(d),
              need,
            )
            total += m
            noteJokerSlots(need, m)
          }
        }
        break
      }

      case 'suit-locked': {
        // All tiles must share one suit. The matching dragon type is suit-specific:
        //   bam → green,  dot → soap,  crak → red
        // Pairs (need < 3) never get joker slots; 3+ groups do (see noteJokerSlots).
        const dragonForSuit = { bam: 'green', dot: 'soap', crak: 'red' } as const
        // The two dragon types that do NOT match each suit (used for opposingDragons hands)
        const opposingForSuit = {
          bam:  ['soap', 'red'],
          dot:  ['green', 'red'],
          crak: ['green', 'soap'],
        } as const
        const suits = ['bam', 'dot', 'crak'] as const

        let bestFill = 0
        let bestSuit: (typeof suits)[number] | null = null

        for (const s of suits) {
          let fill = 0
          for (const { rank, need } of g.rankNeeds) {
            const count = remaining.filter(
              t => t.def.cat === 'suit' && t.def.suit === s && t.def.rank === rank
            ).length
            fill += Math.min(count, need)
          }
          if (g.dragonCount > 0) {
            const drg = dragonForSuit[s]
            const dCount = remaining.filter(
              t => t.def.cat === 'dragon' && t.def.dragon === drg
            ).length
            fill += Math.min(dCount, g.dragonCount)
          }
          if (g.opposingDragons) {
            const [drg1, drg2] = opposingForSuit[s]
            fill += Math.min(
              remaining.filter(t => t.def.cat === 'dragon' && t.def.dragon === drg1).length,
              g.opposingDragons.need
            )
            fill += Math.min(
              remaining.filter(t => t.def.cat === 'dragon' && t.def.dragon === drg2).length,
              g.opposingDragons.need
            )
          }
          if (fill > bestFill) { bestFill = fill; bestSuit = s }
        }

        if (bestSuit) {
          const s = bestSuit
          if (g.dragonCount > 0) {
            const drg = dragonForSuit[s]
            const md = take(d => d.cat === 'dragon' && d.dragon === drg, g.dragonCount)
            total += md
            noteJokerSlots(g.dragonCount, md)
          }
          if (g.opposingDragons) {
            const [drg1, drg2] = opposingForSuit[s]
            const need = g.opposingDragons.need
            const mo1 = take(d => d.cat === 'dragon' && d.dragon === drg1, need)
            total += mo1
            noteJokerSlots(need, mo1)
            const mo2 = take(d => d.cat === 'dragon' && d.dragon === drg2, need)
            total += mo2
            noteJokerSlots(need, mo2)
          }
          for (const { rank, need } of g.rankNeeds) {
            const m = take(d => d.cat === 'suit' && d.suit === s && d.rank === rank, need)
            total += m
            noteJokerSlots(need, m)
          }
        }
        break
      }

      case 'suit-permute': {
        // Card ink “colors” = distinct suit slots A/B/C — assign real suits via every permutation.
        // Same outer-array index = same slot (same chosen suit); different index = different suit.
        // When consecRanks is true, rank values are 1-indexed offsets and we also search over
        // every valid base rank so the hand can match any consecutive rank pair (not just rank 1+2).
        const n = g.colorGroups.length
        const drgForSuitPerm = { bam: 'green' as const, dot: 'soap' as const, crak: 'red' as const }
        const tdcPerm = g.trailingDragonCount ?? 0
        const maxRankOff = g.consecRanks
          ? Math.max(...g.colorGroups.flatMap((cg) => cg.map((sg) => sg.rank))) - 1
          : 0
        const searchBases = g.consecRanks
          ? Array.from({ length: 9 - maxRankOff }, (_, i) => i + 1)
          : [1]

        let bestFill = 0
        let bestExposureFill = -1
        let bestPerm: Suit[] = []
        let bestBase = 1

        for (const base of searchBases) {
          for (const perm of suitPermutations(n)) {
            let fill = 0
            let exposureFill = 0
            for (let ci = 0; ci < n; ci++) {
              const s = perm[ci]!
              for (const sg of g.colorGroups[ci]!) {
                const rank = sg.rank - 1 + base
                const matching = remaining.filter(
                  t => t.def.cat === 'suit' && t.def.suit === s && t.def.rank === rank
                )
                const count = matching.length
                fill += Math.min(count, sg.need)
                if (opts?.exposureTileIds) {
                  exposureFill += Math.min(
                    matching.filter((t) => opts.exposureTileIds!.has(t.id)).length,
                    sg.need,
                  )
                }
              }
              // Count dragons of this slot's assigned suit (e.g. DDDD in a middle color slot).
              const dc = g.colorGroupDragonCounts?.[ci] ?? 0
              if (dc > 0) {
                const drg = drgForSuitPerm[s]
                const matching = remaining.filter(t => t.def.cat === 'dragon' && t.def.dragon === drg)
                fill += Math.min(matching.length, dc)
                if (opts?.exposureTileIds) {
                  exposureFill += Math.min(
                    matching.filter((t) => opts.exposureTileIds!.has(t.id)).length,
                    dc,
                  )
                }
              }
            }
            // Count trailing dragons — suit not assigned to any slot in this permutation.
            if (tdcPerm > 0) {
              const trailSuit = SUITS.find(s => !perm.includes(s))
              if (trailSuit) {
                const drg = drgForSuitPerm[trailSuit]
                const matching = remaining.filter(t => t.def.cat === 'dragon' && t.def.dragon === drg)
                fill += Math.min(matching.length, tdcPerm)
                if (opts?.exposureTileIds) {
                  exposureFill += Math.min(
                    matching.filter((t) => opts.exposureTileIds!.has(t.id)).length,
                    tdcPerm,
                  )
                }
              }
            }
            if (exposureFill > bestExposureFill || (exposureFill === bestExposureFill && fill > bestFill)) {
              bestFill = fill
              bestExposureFill = exposureFill
              bestPerm = perm
              bestBase = base
            }
          }
        }

        // Remove matched tiles for the best (permutation, base) and track unfilled joker slots.
        for (let ci = 0; ci < n; ci++) {
          const s = bestPerm[ci] as Suit
          for (const sg of g.colorGroups[ci]!) {
            const rank = sg.rank - 1 + bestBase
            const matched = take(
              d => d.cat === 'suit' && d.suit === s && d.rank === rank,
              sg.need
            )
            total += matched
            if (sg.canUseJoker && sg.need >= 3) {
              const u = sg.need - matched
              jokerEligibleUnfilled += u
              jokerSlotsByGroup[gi] += u
            }
          }
          // Take dragons of this slot's assigned suit.
          const dc = g.colorGroupDragonCounts?.[ci] ?? 0
          if (dc > 0) {
            const drg = drgForSuitPerm[bestPerm[ci]!]
            const md = take(d => d.cat === 'dragon' && d.dragon === drg, dc)
            total += md
            noteJokerSlots(dc, md)
          }
        }
        // Take trailing dragons (suit not used in any slot).
        if (tdcPerm > 0) {
          const trailSuit = SUITS.find(s => !bestPerm.includes(s))
          if (trailSuit) {
            const drg = drgForSuitPerm[trailSuit]
            const md = take(d => d.cat === 'dragon' && d.dragon === drg, tdcPerm)
            total += md
            noteJokerSlots(tdcPerm, md)
          }
        }
        break
      }
    }
  }

  // Apply jokers: each joker fills one unfilled slot in a 3+ identical-tile group (exposure).
  if (!noJokers) {
    const jokers = remaining.filter(t => t.def.cat === 'joker').length
    const jFill = Math.min(jokers, jokerEligibleUnfilled)
    total += jFill
    if (jFill > 0 && usedOut) {
      let need = jFill
      for (const t of remaining) {
        if (need <= 0) break
        if (t.def.cat !== 'joker') continue
        let placed = false
        for (let gj = 0; gj < groups.length; gj++) {
          if (jokerSlotsByGroup[gj]! <= 0) continue
          usedOut.push(t.id)
          usedMeta?.push({ id: t.id, groupIdx: gj, isJoker: true })
          jokerSlotsByGroup[gj]!--
          need--
          placed = true
          break
        }
        if (!placed) break
      }
    }
  }

  return total
}

/**
 * Rack tiles whose removal does **not** lower the greedy `computeGroupMatch` score for `p`
 * (or the simple `matches` count when the pattern has no explicit groups).
 * Used only for coaching UI — not authoritative NMJL tile assignment.
 */
export function getRackTilesNotHelpingPattern(
  rack: TileInstance[],
  p: PracticePattern,
): TileInstance[] {
  const noJokers = p.section === 'SINGLES AND PAIRS'
  const full = p.groups
    ? computeGroupMatch([...rack], p.groups, { noJokers })
    : rack.filter((t) => p.matches(t.def)).length
  return rack.filter((t) => {
    const rest = rack.filter((x) => x.id !== t.id)
    const partial = p.groups
      ? computeGroupMatch([...rest], p.groups, { noJokers })
      : rest.filter((x) => p.matches(x.def)).length
    return partial >= full
  })
}

export type GreedyPatternMatchOpts = {
  exposureTileIds?: ReadonlySet<string>
}

/** Greedy match with ids + per-group metadata (for suggested-hand strip vs rack alignment). */
export function greedyPatternMatchDetail(
  rack: TileInstance[],
  p: PracticePattern,
  opts?: GreedyPatternMatchOpts,
): { usedOrder: string[]; usedMeta: GroupUsedMeta[] } {
  if (!p.groups) {
    return {
      usedOrder: rack.filter((t) => p.matches(t.def)).map((t) => t.id),
      usedMeta: [],
    }
  }
  const usedOut: string[] = []
  const usedMeta: GroupUsedMeta[] = []
  computeGroupMatch([...rack], p.groups, {
    noJokers: p.section === 'SINGLES AND PAIRS',
    leftToRight: true,
    usedOut,
    usedMeta,
    exposureTileIds: opts?.exposureTileIds,
  })
  return { usedOrder: usedOut, usedMeta }
}

/**
 * Tile ids to ring on the rack for the focused line. With explicit `p.groups`, uses the same
 * strip placement as the suggested-hand preview (`computePreviewStripAssignment`) so tiles the
 * matcher consumed but did **not** place on the card strip (e.g. an odd duplicate suit) stay
 * un-highlighted. Jokers appear only when assigned to joker-eligible strip slots.
 */
export function computeRackPatternHighlightIds(
  rack: TileInstance[],
  p: PracticePattern,
  detail: { usedOrder: string[]; usedMeta: GroupUsedMeta[] },
  exposureTileIds?: ReadonlySet<string>,
): Set<string> {
  const byId = new Map(rack.map((t) => [t.id, t] as const))
  const out = new Set<string>()
  if (detail.usedOrder.length > 0) {
    if (p.groups) {
      const rackIdSet = new Set(rack.map((t) => t.id))
      let bestIds = new Set(detail.usedOrder.filter((id) => rackIdSet.has(id)))
      if (bestIds.size === 0) {
        for (const t of rack) {
          if (p.matches(t.def)) bestIds.add(t.id)
        }
      }
      const stripDefs = resolveStripTargetDefsForGreedyMatch(p, rack, detail.usedMeta, exposureTileIds)
      const assign = computePreviewStripAssignment(
        p,
        rack,
        detail.usedOrder,
        bestIds,
        detail.usedMeta,
        stripDefs,
        exposureTileIds ? { exposureTileIds } : undefined,
      )
      for (const id of assign.slotTileIdByStripIndex) {
        if (id != null) out.add(id)
      }
      return out
    }
    for (const id of detail.usedOrder) {
      const t = byId.get(id)
      if (t) out.add(t.id)
    }
    return out
  }
  for (const t of rack) {
    if (p.matches(t.def)) out.add(t.id)
  }
  return out
}

/** Greedy assignment order of tile ids toward `p` (same logic as `computeGroupMatch`). */
export function greedyUsedTileOrderForPattern(
  rack: TileInstance[],
  p: PracticePattern,
  opts?: GreedyPatternMatchOpts,
): string[] {
  return greedyPatternMatchDetail(rack, p, opts).usedOrder
}

export type PreviewSlotSuggestKind = 'best' | 'joker' | null

/** One entry per strip cell (card display order): rack tile id (natural or joker) filling that slot. */
export type PreviewStripAssignment = {
  kinds: PreviewSlotSuggestKind[]
  /** Physical tile ids in card strip order (before circled-J badge redistribution). */
  slotTileIdByStripIndex: (string | null)[]
}

function jokerMeldKey(defs: TileDef[], i: number): string | null {
  const d = defs[i]
  if (!d) return null
  if (d.cat === 'suit') return `s:${d.suit}:${d.rank}`
  if (d.cat === 'dragon') return `d:${d.dragon}`
  if (d.cat === 'flower') return 'flower'
  if (d.cat === 'wind') return `w:${d.wind}`
  return null
}

/**
 * Contiguous strip ranges of one identical-tile meld (same suit+rank etc.) where jokers are allowed.
 */
function jokerMeldPreviewIndexRanges(defs: TileDef[], jokerEligible: boolean[]): [number, number][] {
  const out: [number, number][] = []
  let i = 0
  while (i < defs.length) {
    if (!jokerEligible[i]) {
      i++
      continue
    }
    const a = i
    const key0 = jokerMeldKey(defs, i)
    i++
    while (i < defs.length && jokerEligible[i] && jokerMeldKey(defs, i) === key0) {
      i++
    }
    if (i - a >= 3) out.push([a, i])
  }
  return out
}

/**
 * Move all joker marks (real rack jokers with tile IDs + suggestion markers) to the leftmost
 * joker-eligible meld slots in card order, regardless of where pattern-matching initially placed them.
 *
 * `nMarks` = total joker badges to place (usually rackJokerCount, or +1 for an unplaced suggestion).
 * `jokerTileIds` = real rack-joker tile IDs to assign in order (remaining badges are null markers).
 */
function redistributeJokerPreviewMarksToFirstMeld(
  kinds: PreviewSlotSuggestKind[],
  defs: TileDef[],
  jokerEligible: boolean[],
  nMarks: number,
  slotTileIdByStripIndex?: (string | null)[],
  jokerTileIds?: readonly string[],
): void {
  if (nMarks <= 0) return
  // Clear ALL existing joker marks (both real-rack and suggestion markers) so we can re-anchor them.
  for (let i = 0; i < kinds.length; i++) {
    if (kinds[i] === 'joker') {
      kinds[i] = null
      if (slotTileIdByStripIndex) slotTileIdByStripIndex[i] = null
    }
  }
  let left = nMarks
  let idIdx = 0
  const placeJoker = (i: number) => {
    kinds[i] = 'joker'
    if (slotTileIdByStripIndex && jokerTileIds && idIdx < jokerTileIds.length) {
      slotTileIdByStripIndex[i] = jokerTileIds[idIdx++]
    }
    left--
  }
  for (const [a, b] of jokerMeldPreviewIndexRanges(defs, jokerEligible)) {
    for (let i = a; i < b && left > 0; i++) {
      if (!jokerEligible[i]) continue
      if (kinds[i] !== null) continue
      placeJoker(i)
    }
    if (left === 0) return
  }
  for (let i = 0; i < kinds.length && left > 0; i++) {
    if (!jokerEligible[i] || kinds[i] !== null) continue
    placeJoker(i)
  }
}

/** NMJL: jokers only in 3+ identical melds — slot list from `patternPreviewJokerEligibleBySlot`. */
function previewSlotAllowsJoker(
  d: TileDef,
  p: PracticePattern,
  slotIndex: number,
  jokerEligible: boolean[],
): boolean {
  if (p.section === 'SINGLES AND PAIRS') return false
  if (d.cat === 'joker') return false
  return jokerEligible[slotIndex] === true
}

function rackOrderIndex(rack: TileInstance[], id: string): number {
  const i = rack.findIndex((t) => t.id === id)
  return i < 0 ? 9999 : i
}

/**
 * Map `usedMeta` onto the pattern strip when preview tile counts match `p.groups` (title strip).
 * Consecutive kongs: naturals in main-rack order first in each rank arm, then jokers in remaining cells.
 */
function buildPreviewSlotKindsFromGroups(
  p: PracticePattern,
  rack: TileInstance[],
  defs: TileDef[],
  spans: [number, number][],
  usedMeta: readonly GroupUsedMeta[],
  bestIds: ReadonlySet<string>,
  jokerEligible: readonly boolean[],
): PreviewStripAssignment {
  const kinds: PreviewSlotSuggestKind[] = defs.map(() => null)
  const slotTileIdByStripIndex = defs.map<string | null>(() => null)
  const byId = new Map(rack.map((t) => [t.id, t] as const))
  const groups = p.groups!

  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi]!
    const span = spans[gi]
    if (!span) continue
    const [a, b] = span
    const nat = usedMeta
      .filter((m) => m.groupIdx === gi && !m.isJoker)
      .sort((x, y) => rackOrderIndex(rack, x.id) - rackOrderIndex(rack, y.id))
    const joks = usedMeta.filter((m) => m.groupIdx === gi && m.isJoker).map((m) => m.id)

    if (g.kind === 'consec') {
      const n1 = g.need1
      const n2 = g.need2
      const nat0 = nat.filter((m) => m.consecPart === 0)
      const nat1 = nat.filter((m) => m.consecPart === 1)
      let jj = 0
      const placeArm = (start: number, len: number, arm: readonly GroupUsedMeta[]) => {
        let ni = 0
        for (let k = 0; k < len; k++) {
          const idx = start + k
          if (ni < arm.length) {
            const id = arm[ni++]!.id
            // Only anchor the natural when it exactly matches the slot's target def.
            // In variant rows (e.g. consec arm1=7C but greedy chose 7D), a mismatched
            // tile must NOT claim the slot — redistribution will place a joker there instead.
            const t = byId.get(id)
            if (t && defs[idx] && tileDefsEqual(t.def, defs[idx]!)) {
              kinds[idx] = bestIds.has(id) ? 'best' : null
              slotTileIdByStripIndex[idx] = id
            }
            continue
          }
          if (!jokerEligible[idx]) continue
          const jid = joks[jj++]
          if (jid && bestIds.has(jid)) {
            kinds[idx] = 'joker'
            slotTileIdByStripIndex[idx] = jid
          }
        }
      }
      placeArm(a, n1, nat0)
      placeArm(a + n1, n2, nat1)
      continue
    }

    const usedSlots = new Set<number>()
    for (const m of nat) {
      const t = byId.get(m.id)
      if (!t) continue
      for (let si = a; si < b; si++) {
        if (usedSlots.has(si)) continue
        if (stripSlotAcceptsNatural(p, defs[si]!, t.def)) {
          kinds[si] = bestIds.has(m.id) ? 'best' : null
          slotTileIdByStripIndex[si] = m.id
          usedSlots.add(si)
          break
        }
      }
    }
    let jr = 0
    for (let si = a; si < b; si++) {
      if (kinds[si] != null) continue
      if (!jokerEligible[si]) continue
      const jid = joks[jr++]
      if (jid && bestIds.has(jid)) {
        kinds[si] = 'joker'
        slotTileIdByStripIndex[si] = jid
      }
    }
  }

  return { kinds, slotTileIdByStripIndex }
}

/** `like-2` group-order assignment → NMJL card line order (kong₁, DD₁, kong₂, DD₂). */
function permuteLikeTwoStripAssignment(a: PreviewStripAssignment): PreviewStripAssignment {
  const map = [0, 1, 2, 3, 4, 5, 10, 11, 6, 7, 8, 9, 12, 13]
  const n = a.kinds.length
  if (n !== 14) return a
  const kinds: PreviewSlotSuggestKind[] = new Array(n).fill(null)
  const slotTileIdByStripIndex: (string | null)[] = new Array(n).fill(null)
  for (let d = 0; d < 14; d++) {
    const g = map[d]!
    kinds[d] = a.kinds[g]!
    slotTileIdByStripIndex[d] = a.slotTileIdByStripIndex[g]!
  }
  return { kinds, slotTileIdByStripIndex }
}

/** `like-3` group-order assignment → NMJL card line order (FFF, 1111, DDD, 1111). */
function permuteLikeThreeStripAssignment(a: PreviewStripAssignment): PreviewStripAssignment {
  const map = [0, 1, 2, 3, 4, 5, 6, 11, 12, 13, 7, 8, 9, 10]
  const n = a.kinds.length
  if (n !== 14) return a
  const kinds: PreviewSlotSuggestKind[] = new Array(n).fill(null)
  const slotTileIdByStripIndex: (string | null)[] = new Array(n).fill(null)
  for (let d = 0; d < 14; d++) {
    const g = map[d]!
    kinds[d] = a.kinds[g]!
    slotTileIdByStripIndex[d] = a.slotTileIdByStripIndex[g]!
  }
  return { kinds, slotTileIdByStripIndex }
}

/**
 * `consec-6` group-order assignment → NMJL card line order (1111(A)|22(A)|22(B)|22(C)|3333(A)).
 * The permutation map is self-inverse (same map converts group→card and card→group).
 */
function permuteConsec6StripAssignment(a: PreviewStripAssignment): PreviewStripAssignment {
  // Card order for consec-6: 1111(A)|22(B)|22(A)|22(C)|3333(A)
  // group order: [1111(0-3)][22A(4-5)][3333(6-9)][22B(10-11)][22C(12-13)]
  const map = [0, 1, 2, 3, 10, 11, 4, 5, 12, 13, 6, 7, 8, 9]
  const n = a.kinds.length
  if (n !== 14) return a
  const kinds: PreviewSlotSuggestKind[] = new Array(n).fill(null)
  const slotTileIdByStripIndex: (string | null)[] = new Array(n).fill(null)
  for (let d = 0; d < 14; d++) {
    const g = map[d]!
    kinds[d] = a.kinds[g]!
    slotTileIdByStripIndex[d] = a.slotTileIdByStripIndex[g]!
  }
  return { kinds, slotTileIdByStripIndex }
}

/** `patternPreviewJokerEligibleBySlot` is card/display order; group-order `defs` need flags per group index. */
function reorderLikeTwoJokerEligibleToGroupOrder(elig: readonly boolean[]): boolean[] {
  const gToD = [0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 6, 7, 12, 13]
  if (elig.length !== 14) return [...elig]
  return gToD.map((d) => elig[d]!)
}

/** `patternPreviewJokerEligibleBySlot` is card/display order; convert to group order for `like-3`. */
function reorderLikeThreeJokerEligibleToGroupOrder(elig: readonly boolean[]): boolean[] {
  const gToD = [0, 1, 2, 3, 4, 5, 6, 10, 11, 12, 13, 7, 8, 9]
  if (elig.length !== 14) return [...elig]
  return gToD.map((d) => elig[d]!)
}

/**
 * `patternPreviewJokerEligibleBySlot` is card/display order; convert to group order for `like-4`.
 * Card order:  11(0-1) DD(2-3) 111(4-6) DDD(7-9) 1111(10-13)
 * Group order: 11(0-1) 111(2-4) 1111(5-8) DD(9-10) DDD(11-13)
 * gToD[g] = card-order position whose eligibility applies to group-order slot g.
 */
function reorderLikeFourJokerEligibleToGroupOrder(elig: readonly boolean[]): boolean[] {
  const gToD = [0, 1, 4, 5, 6, 10, 11, 12, 13, 2, 3, 7, 8, 9]
  if (elig.length !== 14) return [...elig]
  return gToD.map((d) => elig[d]!)
}

/**
 * `patternPreviewJokerEligibleBySlot` is card/display order; convert to group order for `consec-6`.
 * gToD[g] = display position that holds group-index g.
 * group[4,5] (22A) → display[6,7]; group[6-9] (3333) → display[10-13]; group[10,11] (22B) → display[4,5]; group[12,13] (22C) → display[8,9].
 */
function reorderConsec6JokerEligibleToGroupOrder(elig: readonly boolean[]): boolean[] {
  const gToD = [0, 1, 2, 3, 6, 7, 10, 11, 12, 13, 4, 5, 8, 9]
  if (elig.length !== 14) return [...elig]
  return gToD.map((d) => elig[d]!)
}

/**
 * `math-2` group-order assignment → NMJL card line order (DDDD|3333|7777|2|1).
 * Group order: [DDDD(0-3)][2(4)][1(5)][3333(6-9)][7777(10-13)]
 * Card order:  [DDDD(0-3)][3333(4-7)][7777(8-11)][2(12)][1(13)]
 */
function permuteMath2StripAssignment(a: PreviewStripAssignment): PreviewStripAssignment {
  const map = [0, 1, 2, 3, 6, 7, 8, 9, 10, 11, 12, 13, 4, 5]
  const n = a.kinds.length
  if (n !== 14) return a
  const kinds: PreviewSlotSuggestKind[] = new Array(n).fill(null)
  const slotTileIdByStripIndex: (string | null)[] = new Array(n).fill(null)
  for (let d = 0; d < 14; d++) {
    const g = map[d]!
    kinds[d] = a.kinds[g]!
    slotTileIdByStripIndex[d] = a.slotTileIdByStripIndex[g]!
  }
  return { kinds, slotTileIdByStripIndex }
}

/**
 * `2468-2` group-order assignment → NMJL card line order ([22 4444][666-red][666-green][88]).
 * Group order: [22(0-1)][4444(2-5)][88(6-7)][666-red(8-10)][666-green(11-13)]
 * Card order:  [22(0-1)][4444(2-5)][666-red(6-8)][666-green(9-11)][88(12-13)]
 */
function permute2468_2StripAssignment(a: PreviewStripAssignment): PreviewStripAssignment {
  const map = [0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13, 6, 7]
  const n = a.kinds.length
  if (n !== 14) return a
  const kinds: PreviewSlotSuggestKind[] = new Array(n).fill(null)
  const slotTileIdByStripIndex: (string | null)[] = new Array(n).fill(null)
  for (let d = 0; d < 14; d++) {
    const g = map[d]!
    kinds[d] = a.kinds[g]!
    slotTileIdByStripIndex[d] = a.slotTileIdByStripIndex[g]!
  }
  return { kinds, slotTileIdByStripIndex }
}

/**
 * `patternPreviewJokerEligibleBySlot` is card/display order; convert to group order for `2468-2`.
 * Inverse map (group→display): [0,1,2,3,4,5, 12,13, 6,7,8,9,10,11]
 */
function reorder2468_2JokerEligibleToGroupOrder(elig: readonly boolean[]): boolean[] {
  const gToD = [0, 1, 2, 3, 4, 5, 12, 13, 6, 7, 8, 9, 10, 11]
  if (elig.length !== 14) return [...elig]
  return gToD.map((d) => elig[d]!)
}

/**
 * `patternPreviewJokerEligibleBySlot` is card/display order; convert to group order for `math-2`.
 * gToD[g] = the display position that holds group-index g.
 * Group positions 4-5 (the 2,1 ranks) land at display positions 12-13; 6-13 (3333+7777) land at 4-11.
 */
function reorderMath2JokerEligibleToGroupOrder(elig: readonly boolean[]): boolean[] {
  const gToD = [0, 1, 2, 3, 12, 13, 4, 5, 6, 7, 8, 9, 10, 11]
  if (elig.length !== 14) return [...elig]
  return gToD.map((d) => elig[d]!)
}

/**
 * `13579-1b` group-order assignment → NMJL card line order (11 333 5555 777 99).
 * Group order: colorGroup[0]=[1×2, 3×3, 7×3, 9×2] at 0-9; colorGroup[1]=[5×4] at 10-13.
 * Forward map (display→group): 5s move from group[10-13] to display[5-8]; 7s/9s shift right.
 */
function permute13579_1bStripAssignment(a: PreviewStripAssignment): PreviewStripAssignment {
  const map = [0, 1, 2, 3, 4, 10, 11, 12, 13, 5, 6, 7, 8, 9]
  const n = a.kinds.length
  if (n !== 14) return a
  const kinds: PreviewSlotSuggestKind[] = new Array(n).fill(null)
  const slotTileIdByStripIndex: (string | null)[] = new Array(n).fill(null)
  for (let d = 0; d < 14; d++) {
    const g = map[d]!
    kinds[d] = a.kinds[g]!
    slotTileIdByStripIndex[d] = a.slotTileIdByStripIndex[g]!
  }
  return { kinds, slotTileIdByStripIndex }
}

/**
 * `patternPreviewJokerEligibleBySlot` is card/display order; convert to group order for `13579-1b`.
 * gToD[g] = the display position that holds group-index g.
 * Group[5-7] (7s) land at display[9-11]; group[8-9] (9s) land at display[12-13]; group[10-13] (5s) land at display[5-8].
 */
function reorder13579_1bJokerEligibleToGroupOrder(elig: readonly boolean[]): boolean[] {
  const gToD = [0, 1, 2, 3, 4, 9, 10, 11, 12, 13, 5, 6, 7, 8]
  if (elig.length !== 14) return [...elig]
  return gToD.map((d) => elig[d]!)
}

/**
 * When title strip order interleaves groups (e.g. `1111 DD 1111 DD`), contiguous group spans are
 * invalid — map rack naturals onto strip cells by category + suit column / dragon color so
 * highlights match `bestIds` like the main rack.
 */
function buildPreviewKindsByCategoryPartition(
  p: PracticePattern,
  rack: TileInstance[],
  defs: TileDef[],
  usedMeta: readonly GroupUsedMeta[],
  bestIds: ReadonlySet<string>,
  jokerEligible: boolean[],
): PreviewStripAssignment {
  const kinds: PreviewSlotSuggestKind[] = defs.map(() => null)
  const slotTileIdByStripIndex = defs.map<string | null>(() => null)
  const usedSlot = new Set<number>()
  const assignedId = new Set<string>()
  const byId = new Map(rack.map((t) => [t.id, t] as const))
  const likeLikeNumbers =
    p.groups?.some((g) => g.kind === 'shared-rank-suits' || g.kind === 'shared-rank') ?? false

  const naturals = usedMeta
    .filter((m) => !m.isJoker)
    .sort((a, b) => rackOrderIndex(rack, a.id) - rackOrderIndex(rack, b.id))
  const jokerIds = usedMeta.filter((m) => m.isJoker).map((m) => m.id)

  function occupy(si: number, id: string, jok: boolean) {
    if (jok) kinds[si] = bestIds.has(id) ? 'joker' : null
    else kinds[si] = bestIds.has(id) ? 'best' : null
    slotTileIdByStripIndex[si] = id
    usedSlot.add(si)
    assignedId.add(id)
  }

  function placePass(match: (si: number, def: TileDef, t: TileInstance) => boolean) {
    for (const m of naturals) {
      if (assignedId.has(m.id)) continue
      const t = byId.get(m.id)
      if (!t) continue
      for (let si = 0; si < defs.length; si++) {
        if (usedSlot.has(si)) continue
        if (match(si, defs[si]!, t)) occupy(si, m.id, false)
        if (assignedId.has(m.id)) break
      }
    }
  }

  placePass((_si, d, t) => tileDefsEqual(d, t.def))
  placePass((_si, d, t) => d.cat === 'flower' && t.def.cat === 'flower')

  for (const m of naturals) {
    if (assignedId.has(m.id)) continue
    const t = byId.get(m.id)
    if (!t || t.def.cat !== 'wind') continue
    for (let si = 0; si < defs.length; si++) {
      if (usedSlot.has(si)) continue
      const d = defs[si]!
      if (d.cat === 'wind' && d.wind === t.def.wind) {
        occupy(si, m.id, false)
        break
      }
    }
  }

  placePass((_, d, t) => d.cat === 'dragon' && t.def.cat === 'dragon' && d.dragon === t.def.dragon)
  placePass((_, d, t) => d.cat === 'dragon' && t.def.cat === 'dragon')

  for (const m of naturals) {
    if (assignedId.has(m.id)) continue
    const t = byId.get(m.id)
    if (!t || t.def.cat !== 'suit') continue
    for (let si = 0; si < defs.length; si++) {
      if (usedSlot.has(si)) continue
      const d = defs[si]!
      if (d.cat !== 'suit') continue
      if (d.suit !== t.def.suit) continue
      if (!likeLikeNumbers && d.rank !== t.def.rank) continue
      occupy(si, m.id, false)
      break
    }
  }

  placePass((_, d, t) => {
    if (d.cat !== 'suit' || t.def.cat !== 'suit') return false
    return d.rank === t.def.rank
  })

  placePass((_, d, t) => d.cat === 'suit' && t.def.cat === 'suit')

  let jx = 0
  for (let si = 0; si < defs.length; si++) {
    if (kinds[si] != null) continue
    if (!jokerEligible[si]) continue
    const jid = jokerIds[jx++]
    if (jid && bestIds.has(jid)) {
      kinds[si] = 'joker'
      slotTileIdByStripIndex[si] = jid
    }
  }

  const rackJokerTileIdsBcp = rack
    .filter((t) => t.def.cat === 'joker' && bestIds.has(t.id))
    .map((t) => t.id)
  const rackJokerCountBcp = rack.filter((t) => t.def.cat === 'joker').length
  const nMarksBcp = rackJokerTileIdsBcp.length + (rackJokerCountBcp > rackJokerTileIdsBcp.length ? 1 : 0)
  if (nMarksBcp > 0) {
    redistributeJokerPreviewMarksToFirstMeld(
      kinds,
      defs,
      jokerEligible,
      nMarksBcp,
      slotTileIdByStripIndex,
      rackJokerTileIdsBcp,
    )
  }

  return { kinds, slotTileIdByStripIndex }
}

/**
 * Strip kinds plus which rack tile id sits in each card cell (for matching rack sort order to the line).
 */
export function computePreviewStripAssignment(
  p: PracticePattern,
  rackForPattern: TileInstance[],
  usedOrder: readonly string[],
  bestIds: ReadonlySet<string>,
  usedMetaArg?: readonly GroupUsedMeta[] | null,
  stripTargetDefs?: readonly TileDef[] | null,
  greedyOpts?: GreedyPatternMatchOpts,
): PreviewStripAssignment {
  const defs =
    stripTargetDefs && stripTargetDefs.length > 0
      ? [...stripTargetDefs]
      : patternLinePreviewGroupOrderDefs(p)
  if (defs.length === 0) return { kinds: [], slotTileIdByStripIndex: [] }

  const usedMeta = usedMetaArg ?? greedyPatternMatchDetail(rackForPattern, p, greedyOpts).usedMeta
  let jokerEligible = patternPreviewJokerEligibleBySlot(p)
  if (p.id === 'like-2' && jokerEligible.length === 14) {
    jokerEligible = reorderLikeTwoJokerEligibleToGroupOrder(jokerEligible)
  }
  if (p.id === 'like-3' && jokerEligible.length === 14) {
    jokerEligible = reorderLikeThreeJokerEligibleToGroupOrder(jokerEligible)
  }
  if (p.id === 'like-4' && jokerEligible.length === 14) {
    jokerEligible = reorderLikeFourJokerEligibleToGroupOrder(jokerEligible)
  }
  if (p.id === 'consec-6' && jokerEligible.length === 14) {
    jokerEligible = reorderConsec6JokerEligibleToGroupOrder(jokerEligible)
  }
  if (p.id === 'math-2' && jokerEligible.length === 14) {
    jokerEligible = reorderMath2JokerEligibleToGroupOrder(jokerEligible)
  }
  if (p.id === '2468-2' && jokerEligible.length === 14) {
    jokerEligible = reorder2468_2JokerEligibleToGroupOrder(jokerEligible)
  }
  if (p.id === '13579-1b' && jokerEligible.length === 14) {
    jokerEligible = reorder13579_1bJokerEligibleToGroupOrder(jokerEligible)
  }
  const spans = groupPreviewIndexSpans(p)

  if (p.groups && spans && usedMeta.length > 0) {
    const r = buildPreviewSlotKindsFromGroups(p, rackForPattern, defs, spans, usedMeta, bestIds, jokerEligible)
    // Redistribute ALL joker marks to leftmost joker-eligible meld, regardless of where they were placed.
    const rackJokerTileIds = rackForPattern
      .filter((t) => t.def.cat === 'joker' && bestIds.has(t.id))
      .map((t) => t.id)
    const rackJokerCount = rackForPattern.filter((t) => t.def.cat === 'joker').length
    // +1 suggestion marker if there are unplaced jokers (rack has more jokers than bestIds used)
    const nMarks = rackJokerTileIds.length + (rackJokerCount > rackJokerTileIds.length ? 1 : 0)
    if (nMarks > 0) {
      redistributeJokerPreviewMarksToFirstMeld(r.kinds, defs, jokerEligible, nMarks, r.slotTileIdByStripIndex, rackJokerTileIds)
    }
    if (p.id === 'like-2' && r.kinds.length === 14) return permuteLikeTwoStripAssignment(r)
    if (p.id === 'like-3' && r.kinds.length === 14) return permuteLikeThreeStripAssignment(r)
    if (p.id === 'consec-6' && r.kinds.length === 14) return permuteConsec6StripAssignment(r)
    if (p.id === 'math-2' && r.kinds.length === 14) return permuteMath2StripAssignment(r)
    if (p.id === '2468-2' && r.kinds.length === 14) return permute2468_2StripAssignment(r)
    if (p.id === '13579-1b' && r.kinds.length === 14) return permute13579_1bStripAssignment(r)
    return r
  }
  if (usedMeta.length > 0) {
    const r = buildPreviewKindsByCategoryPartition(p, rackForPattern, defs, usedMeta, bestIds, jokerEligible)
    if (p.id === 'like-2' && r.kinds.length === 14) return permuteLikeTwoStripAssignment(r)
    if (p.id === 'like-3' && r.kinds.length === 14) return permuteLikeThreeStripAssignment(r)
    if (p.id === 'consec-6' && r.kinds.length === 14) return permuteConsec6StripAssignment(r)
    if (p.id === 'math-2' && r.kinds.length === 14) return permuteMath2StripAssignment(r)
    if (p.id === '2468-2' && r.kinds.length === 14) return permute2468_2StripAssignment(r)
    if (p.id === '13579-1b' && r.kinds.length === 14) return permute13579_1bStripAssignment(r)
    return r
  }

  const byId = new Map(rackForPattern.map((t) => [t.id, t] as const))

  const kindForId = (id: string): PreviewSlotSuggestKind => {
    if (bestIds.has(id)) return 'best'
    return null
  }

  const queue: TileInstance[] = []
  for (const id of usedOrder) {
    const t = byId.get(id)
    if (t) queue.push(t)
  }

  const kinds: PreviewSlotSuggestKind[] = defs.map(() => null)
  const slotTileIdByStripIndex = defs.map<string | null>(() => null)
  const working = [...queue]

  for (let i = 0; i < defs.length; i++) {
    const d = defs[i]!
    const qi = working.findIndex((t) => tileDefsEqual(t.def, d))
    if (qi < 0) continue
    const t = working.splice(qi, 1)[0]!
    kinds[i] = kindForId(t.id)
    slotTileIdByStripIndex[i] = t.id
  }

  for (let i = 0; i < defs.length; i++) {
    if (kinds[i] != null) continue
    const d = defs[i]!
    if (!previewSlotAllowsJoker(d, p, i, jokerEligible)) continue
    const qi = working.findIndex((t) => t.def.cat === 'joker' && bestIds.has(t.id))
    if (qi < 0) continue
    const t = working.splice(qi, 1)[0]!
    kinds[i] = 'joker'
    slotTileIdByStripIndex[i] = t.id
  }

  const rackJokerTileIdsFb = rackForPattern
    .filter((t) => t.def.cat === 'joker' && bestIds.has(t.id))
    .map((t) => t.id)
  const rackJokerCountFb = rackForPattern.filter((t) => t.def.cat === 'joker').length
  const nMarksFb = rackJokerTileIdsFb.length + (rackJokerCountFb > rackJokerTileIdsFb.length ? 1 : 0)
  redistributeJokerPreviewMarksToFirstMeld(
    kinds,
    defs,
    jokerEligible,
    nMarksFb,
    slotTileIdByStripIndex,
    rackJokerTileIdsFb,
  )

  const r = { kinds, slotTileIdByStripIndex }
  if (p.id === 'like-2' && kinds.length === 14) return permuteLikeTwoStripAssignment(r)
  if (p.id === 'like-3' && kinds.length === 14) return permuteLikeThreeStripAssignment(r)
  if (p.id === 'consec-6' && kinds.length === 14) return permuteConsec6StripAssignment(r)
  if (p.id === 'math-2' && kinds.length === 14) return permuteMath2StripAssignment(r)
  if (p.id === '2468-2' && kinds.length === 14) return permute2468_2StripAssignment(r)
  if (p.id === '13579-1b' && kinds.length === 14) return permute13579_1bStripAssignment(r)
  return r
}

function rackAfterPriorGroups(
  rack: TileInstance[],
  usedMeta: readonly GroupUsedMeta[],
  stopGi: number,
): TileInstance[] {
  const drop = new Set(usedMeta.filter((m) => m.groupIdx < stopGi).map((m) => m.id))
  return rack.filter((t) => !drop.has(t.id))
}

function metaNatTilesForGroup(
  rack: TileInstance[],
  usedMeta: readonly GroupUsedMeta[],
  gi: number,
): TileInstance[] {
  const byId = new Map(rack.map((t) => [t.id, t] as const))
  const out: TileInstance[] = []
  for (const m of usedMeta) {
    if (m.groupIdx !== gi || m.isJoker) continue
    const t = byId.get(m.id)
    if (t) out.push(t)
  }
  return out
}

function peekSharedRankSuitsPlan(
  remaining: TileInstance[],
  g: Extract<PatternGroup, { kind: 'shared-rank-suits' }>,
  forcedRank: number | null = null,
): { rank: number; perm: Suit[] } | null {
  const n = g.needs.length
  if (n < 2 || n > 3) return null
  const ranksToTry =
    forcedRank != null && forcedRank >= 1 && forcedRank <= 9
      ? [forcedRank]
      : ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const)
  let bestFill = 0
  let bestRank = -1
  let bestPerm: Suit[] = []
  for (const rank of ranksToTry) {
    const counts: Record<Suit, number> = { bam: 0, dot: 0, crak: 0 }
    for (const t of remaining) {
      if (t.def.cat === 'suit' && g.test(t.def) && t.def.rank === rank) {
        counts[t.def.suit]++
      }
    }
    for (const perm of suitPermutations(n)) {
      let fill = 0
      for (let i = 0; i < n; i++) {
        fill += Math.min(counts[perm[i]!], g.needs[i]!)
      }
      if (fill > bestFill) {
        bestFill = fill
        bestRank = rank
        bestPerm = [...perm]
      }
    }
  }
  if (bestRank < 0 || bestPerm.length !== n) return null
  return { rank: bestRank, perm: bestPerm }
}

function inferSharedRankSuitsFromMeta(
  rack: TileInstance[],
  usedMeta: readonly GroupUsedMeta[],
  gi: number,
  g: Extract<PatternGroup, { kind: 'shared-rank-suits' }>,
): { rank: number; perm: Suit[] } | null {
  const ordered = metaNatTilesForGroup(rack, usedMeta, gi)
  const suitTiles = ordered.filter((t) => t.def.cat === 'suit')
  if (suitTiles.length === 0) return null
  const ranks = new Set<number>()
  for (const t of suitTiles) {
    if (t.def.cat === 'suit') ranks.add(t.def.rank)
  }
  if (ranks.size !== 1) return null
  const head = suitTiles[0]!.def
  if (head.cat !== 'suit') return null
  const rank = head.rank
  let off = 0
  const perm: Suit[] = []
  for (let col = 0; col < g.needs.length; col++) {
    const need = g.needs[col]!
    const chunk = ordered.slice(off, off + need)
    off += need
    const st = chunk.find((t) => t.def.cat === 'suit')
    if (!st || st.def.cat !== 'suit') return null
    perm.push(st.def.suit)
  }
  if (perm.length !== g.needs.length) return null
  // If tiles didn't land cleanly into each column (e.g. fewer naturals than needs[i]),
  // the slice-by-size approach produces duplicate suits. Fall back to the full search.
  if (new Set(perm).size !== perm.length) return null
  return { rank, perm }
}

function majoritySuitAmongSuitTiles(tiles: TileInstance[]): Suit | null {
  const counts: Record<Suit, number> = { bam: 0, dot: 0, crak: 0 }
  for (const t of tiles) {
    if (t.def.cat === 'suit') counts[t.def.suit]++
  }
  let best: Suit | null = null
  let bestC = -1
  for (const s of SUITS) {
    if (counts[s] > bestC) {
      bestC = counts[s]
      best = s
    }
  }
  return best
}

function fillSpan(out: TileDef[], a: number, b: number, def: TileDef) {
  for (let i = a; i < b; i++) out[i] = def
}

function fillSpanTileDefs(out: TileDef[], a: number, tiles: TileInstance[]) {
  let idx = a
  for (const t of tiles) {
    if (idx >= out.length) break
    out[idx++] = t.def
  }
}

function isDragonKey(k: string): k is Dragon {
  return k === 'red' || k === 'green' || k === 'soap'
}

function stripSlotAcceptsNatural(p: PracticePattern, targetDef: TileDef, naturalDef: TileDef): boolean {
  if (tileDefsEqual(targetDef, naturalDef)) return true
  if (targetDef.cat === 'dragon' && targetDef.dragon === 'any' && naturalDef.cat === 'dragon') {
    return true
  }
  if (firstOpposingConsecutiveStandInPairFromTitle(p) == null) return false
  if (!p.groups?.some((g) => g.kind === 'consec')) return false
  if (targetDef.cat !== 'suit' || naturalDef.cat !== 'suit') return false
  return targetDef.rank === naturalDef.rank
}

/**
 * Target defs for the suggested strip: same layout as `groupPreviewIndexSpans`, but ranks / suit
 * slots / dragons chosen by the same greedy logic as `computeGroupMatch` (fixes e.g. ANY LIKE
 * NUMBERS showing “1” while the matcher uses your “2” tiles).
 */
function resolveStripTargetDefsForGreedyMatch(
  p: PracticePattern,
  rack: TileInstance[],
  usedMeta: readonly GroupUsedMeta[],
  exposureTileIds?: ReadonlySet<string>,
): TileDef[] {
  const base = patternLinePreviewGroupOrderDefs(p)
  if (!p.groups?.length || base.length === 0) return base
  const spans = groupPreviewIndexSpans(p)
  if (!spans) return base

  const out = [...base]
  // Tracks suits already committed by suit-locked groups so suit-permute won't collide.
  const lockedSuits = new Set<Suit>()

  for (let gi = 0; gi < p.groups.length; gi++) {
    const g = p.groups[gi]!
    const span = spans[gi]
    if (!span) continue
    const [a, b] = span
    const rem = rackAfterPriorGroups(rack, usedMeta, gi)

    switch (g.kind) {
      case 'shared-rank-suits': {
        const forcedRank = forcedSharedRankSuitsRankFromExposures(rack, exposureTileIds, g)
        const plan =
          inferSharedRankSuitsFromMeta(rack, usedMeta, gi, g) ??
          peekSharedRankSuitsPlan(rem, g, forcedRank)
        if (!plan) break
        let idx = a
        for (let col = 0; col < g.needs.length; col++) {
          const suit = plan.perm[col]!
          const n = g.needs[col]!
          for (let k = 0; k < n && idx < b; k++) {
            out[idx++] = { cat: 'suit', suit, rank: plan.rank }
          }
        }
        break
      }
      case 'fixed': {
        const taken = metaNatTilesForGroup(rack, usedMeta, gi)
        if (taken.length > 0) {
          fillSpanTileDefs(out, a, taken)
        }
        break
      }
      case 'rank': {
        const map = new Map<string, TileInstance[]>()
        for (const t of rem) {
          if (!g.test(t.def)) continue
          const k = tileKey(t.def)
          const arr = map.get(k) ?? []
          arr.push(t)
          map.set(k, arr)
        }
        let bestKey = '', bestCount = 0
        for (const [k, ts] of map) {
          if (ts.length > bestCount) {
            bestCount = ts.length
            bestKey = k
          }
        }
        if (!bestKey) break
        if (isDragonKey(bestKey)) {
          fillSpan(out, a, b, { cat: 'dragon', dragon: bestKey })
        } else {
          const rank = Number(bestKey)
          const st = rem.find((t) => t.def.cat === 'suit' && tileKey(t.def) === bestKey && g.test(t.def))
          const suit = st?.def.cat === 'suit' ? st.def.suit : 'bam'
          if (rank >= 1 && rank <= 9) fillSpan(out, a, b, { cat: 'suit', suit, rank })
        }
        break
      }
      case 'shared-rank': {
        const totalNeed = g.needs.reduce((x, y) => x + y, 0)
        const map = new Map<string, TileInstance[]>()
        for (const t of rem) {
          if (!g.test(t.def)) continue
          const k = tileKey(t.def)
          const arr = map.get(k) ?? []
          arr.push(t)
          map.set(k, arr)
        }
        let bestKey = '', bestFill = 0
        for (const [k, ts] of map) {
          const fill = Math.min(ts.length, totalNeed)
          if (fill > bestFill) {
            bestFill = fill
            bestKey = k
          }
        }
        if (!bestKey) break
        if (isDragonKey(bestKey)) {
          fillSpan(out, a, b, { cat: 'dragon', dragon: bestKey })
        } else {
          const rank = Number(bestKey)
          const st = rem.find((t) => t.def.cat === 'suit' && tileKey(t.def) === bestKey && g.test(t.def))
          const suit = st?.def.cat === 'suit' ? st.def.suit : 'bam'
          if (rank >= 1 && rank <= 9) fillSpan(out, a, b, { cat: 'suit', suit, rank })
        }
        break
      }
      case 'suit-locked-rank': {
        const dragonForSuit = { bam: 'green' as const, dot: 'soap' as const, crak: 'red' as const }
        const dc = g.dragonCount ?? 0
        let bestFill = 0
        let bestSuit: Suit | null = null
        let bestRank = -1
        for (const s of SUITS) {
          for (let rank = 1; rank <= 9; rank++) {
            const c = rem.filter(
              (t) => t.def.cat === 'suit' && t.def.suit === s && t.def.rank === rank && g.test(t.def),
            ).length
            let fill = Math.min(c, g.need)
            if (dc > 0) {
              const drg = dragonForSuit[s]
              fill += Math.min(rem.filter((t) => t.def.cat === 'dragon' && t.def.dragon === drg).length, dc)
            }
            if (fill > bestFill) {
              bestFill = fill
              bestSuit = s
              bestRank = rank
            }
          }
        }
        if (bestSuit && bestRank >= 0) {
          const drg = dragonForSuit[bestSuit]
          let idx = a
          if (g.dragonsFirst && dc > 0) {
            for (let k = 0; k < dc && idx < b; k++) out[idx++] = { cat: 'dragon', dragon: drg }
          }
          for (let k = 0; k < g.need && idx < b; k++) {
            out[idx++] = { cat: 'suit', suit: bestSuit, rank: bestRank }
          }
          if (!g.dragonsFirst && dc > 0) {
            for (let k = 0; k < dc && idx < b; k++) out[idx++] = { cat: 'dragon', dragon: drg }
          }
          lockedSuits.add(bestSuit)
        }
        break
      }
      case 'consec': {
        // Derive bestR from usedMeta first (the greedy matcher now selects per-suit-rank correctly).
        const metaById = new Map(usedMeta.map((m) => [m.id, m] as const))
        const groupTiles = metaNatTilesForGroup(rack, usedMeta, gi)
        const arm0Tiles = groupTiles.filter((t) => {
          const m = metaById.get(t.id)
          return m && m.groupIdx === gi && !m.isJoker && m.consecPart === 0 && t.def.cat === 'suit' && g.test(t.def)
        })
        const arm1Tiles = groupTiles.filter((t) => {
          const m = metaById.get(t.id)
          return m && m.groupIdx === gi && !m.isJoker && m.consecPart === 1 && t.def.cat === 'suit' && g.test(t.def)
        })
        // Determine bestR from actual arm0 tiles; fall back to per-suit-rank calculation.
        let bestR = arm0Tiles.length > 0 && arm0Tiles[0]!.def.cat === 'suit' ? arm0Tiles[0]!.def.rank : -1
        if (bestR < 0 && arm1Tiles.length > 0 && arm1Tiles[0]!.def.cat === 'suit') {
          bestR = arm1Tiles[0]!.def.rank - 1
        }
        if (bestR < 0) {
          // No naturals assigned — pick rank by per-suit-rank fill, same logic as the greedy matcher.
          const bySR = new Map<string, number>()
          for (const t of rem) {
            if (t.def.cat === 'suit' && g.test(t.def)) {
              const k = `${t.def.suit}:${t.def.rank}`
              bySR.set(k, (bySR.get(k) ?? 0) + 1)
            }
          }
          let bestFill = 0, bestBalance = -1
          for (const [k1, c1] of bySR) {
            const r = parseInt(k1.split(':')[1]!)
            const f1 = Math.min(c1, g.need1)
            let bestF2 = 0
            for (const [k2, c2] of bySR) {
              if (parseInt(k2.split(':')[1]!) !== r + 1) continue
              const f2 = Math.min(c2, g.need2)
              if (f2 > bestF2) bestF2 = f2
            }
            const fill = f1 + bestF2
            const balance = Math.min(f1, bestF2)
            if (fill > bestFill || (fill === bestFill && balance > bestBalance)) {
              bestFill = fill; bestBalance = balance; bestR = r
            }
          }
        }
        if (bestR < 0) break
        let suit1 = majoritySuitAmongSuitTiles(arm0Tiles)
        let suit2 = majoritySuitAmongSuitTiles(arm1Tiles)
        if (suit1 == null) {
          const t = rem.find((x) => x.def.cat === 'suit' && x.def.rank === bestR && g.test(x.def))
          suit1 = t?.def.cat === 'suit' ? t.def.suit : 'bam'
        }
        if (suit2 == null) {
          const t = g.opposingSuits
            ? rem.find((x) => x.def.cat === 'suit' && x.def.rank === bestR + 1 && g.test(x.def) && x.def.suit !== suit1)
            : rem.find((x) => x.def.cat === 'suit' && x.def.rank === bestR + 1 && g.test(x.def))
          if (t?.def.cat === 'suit') {
            suit2 = t.def.suit
          } else if (g.opposingSuits) {
            const SUITS_ALL = ['bam', 'dot', 'crak'] as const
            suit2 = SUITS_ALL.find(s => s !== suit1) ?? suit1
          } else {
            suit2 = suit1
          }
        }
        // For opposing-suit hands, ensure arm2 never uses arm1's suit even if meta placed it there.
        if (g.opposingSuits && suit2 === suit1) {
          const SUITS_ALL = ['bam', 'dot', 'crak'] as const
          suit2 = SUITS_ALL.find(s => s !== suit1) ?? suit1
        }
        let idx = a
        for (let k = 0; k < g.need1 && idx < b; k++) out[idx++] = { cat: 'suit', suit: suit1, rank: bestR }
        for (let k = 0; k < g.need2 && idx < b; k++) out[idx++] = { cat: 'suit', suit: suit2, rank: bestR + 1 }
        break
      }
      case 'suit-locked-consec': {
        const dragonForSuit = { bam: 'green' as const, dot: 'soap' as const, crak: 'red' as const }
        const maxStart = 10 - g.numGroups
        let bestFill = 0
        let bestSuit: Suit | null = null
        let bestStart = -1
        for (const s of SUITS) {
          const byRank = new Map<number, number>()
          for (const t of rem) {
            if (t.def.cat === 'suit' && t.def.suit === s) {
              byRank.set(t.def.rank, (byRank.get(t.def.rank) ?? 0) + 1)
            }
          }
          const dCount = Math.min(
            rem.filter((t) => t.def.cat === 'dragon' && t.def.dragon === dragonForSuit[s]).length,
            g.dragonCount,
          )
          for (let r = 1; r <= maxStart; r++) {
            let fill = 0
            for (let i = 0; i < g.numGroups; i++) {
              fill += Math.min(byRank.get(r + i) ?? 0, g.rankCount)
            }
            fill += dCount
            if (fill > bestFill) {
              bestFill = fill
              bestSuit = s
              bestStart = r
            }
          }
        }
        if (!bestSuit || bestStart < 0) break
        let idx = a
        for (let i = 0; i < g.numGroups; i++) {
          const rank = bestStart + i
          for (let k = 0; k < g.rankCount && idx < b; k++) {
            out[idx++] = { cat: 'suit', suit: bestSuit, rank }
          }
        }
        if (g.dragonCount > 0) {
          const drg = dragonForSuit[bestSuit]
          for (let k = 0; k < g.dragonCount && idx < b; k++) {
            out[idx++] = { cat: 'dragon', dragon: drg }
          }
        }
        break
      }
      case 'suit-permute': {
        const drgForSuitPerm = { bam: 'green' as const, dot: 'soap' as const, crak: 'red' as const }
        const n = g.colorGroups.length
        const tdc = g.trailingDragonCount ?? 0
        const maxRankOff = g.consecRanks
          ? Math.max(...g.colorGroups.flatMap((cg) => cg.map((sg) => sg.rank))) - 1
          : 0
        const searchBases = g.consecRanks
          ? Array.from({ length: 9 - maxRankOff }, (_, i) => i + 1)
          : [1]
        let bestFill = 0
        let bestExposureFill = -1
        let bestPerm: Suit[] = []
        let bestBase = 1
        for (const base of searchBases) {
          for (const perm of suitPermutations(n)) {
            // Skip permutations that reuse a suit already committed by a suit-locked group.
            if (lockedSuits.size > 0 && perm.some((s) => lockedSuits.has(s))) continue
            let fill = 0
            let exposureFill = 0
            for (let ci = 0; ci < n; ci++) {
              const s = perm[ci]!
              for (const sg of g.colorGroups[ci]) {
                const rank = sg.rank - 1 + base
                const matching = rem.filter(
                  (t) => t.def.cat === 'suit' && t.def.suit === s && t.def.rank === rank,
                )
                const count = matching.length
                fill += Math.min(count, sg.need)
                if (exposureTileIds) {
                  exposureFill += Math.min(matching.filter((t) => exposureTileIds.has(t.id)).length, sg.need)
                }
              }
              const dc = g.colorGroupDragonCounts?.[ci] ?? 0
              if (dc > 0) {
                const drg = drgForSuitPerm[s]
                const matching = rem.filter((t) => t.def.cat === 'dragon' && t.def.dragon === drg)
                fill += Math.min(matching.length, dc)
                if (exposureTileIds) {
                  exposureFill += Math.min(matching.filter((t) => exposureTileIds.has(t.id)).length, dc)
                }
              }
            }
            if (tdc > 0) {
              const remaining = SUITS.find((s) => !perm.includes(s))
              if (remaining) {
                const drg = drgForSuitPerm[remaining]
                const matching = rem.filter((t) => t.def.cat === 'dragon' && t.def.dragon === drg)
                fill += Math.min(matching.length, tdc)
                if (exposureTileIds) {
                  exposureFill += Math.min(matching.filter((t) => exposureTileIds.has(t.id)).length, tdc)
                }
              }
            }
            if (exposureFill > bestExposureFill || (exposureFill === bestExposureFill && fill > bestFill)) {
              bestFill = fill
              bestExposureFill = exposureFill
              bestPerm = [...perm]
              bestBase = base
            }
          }
        }
        if (bestPerm.length !== n) break
        let idx = a
        for (let ci = 0; ci < n; ci++) {
          const s = bestPerm[ci]!
          for (const sg of g.colorGroups[ci]) {
            const rank = sg.rank - 1 + bestBase
            for (let k = 0; k < sg.need && idx < b; k++) {
              out[idx++] = { cat: 'suit', suit: s, rank }
            }
          }
          const dc = g.colorGroupDragonCounts?.[ci] ?? 0
          if (dc > 0) {
            const drg = drgForSuitPerm[s]
            for (let k = 0; k < dc && idx < b; k++) out[idx++] = { cat: 'dragon', dragon: drg }
          }
        }
        if (tdc > 0) {
          const remaining = SUITS.find((s) => !bestPerm.includes(s))
          if (remaining) {
            const drg = drgForSuitPerm[remaining]
            for (let k = 0; k < tdc && idx < b; k++) out[idx++] = { cat: 'dragon', dragon: drg }
          }
        }
        break
      }
      case 'suit-locked': {
        const dragonForSuit = { bam: 'green' as const, dot: 'soap' as const, crak: 'red' as const }
        const opposingForSuit = {
          bam: ['soap', 'red'] as const,
          dot: ['green', 'red'] as const,
          crak: ['green', 'soap'] as const,
        } as const
        let bestFill = 0
        let bestSuit: Suit | null = null
        for (const s of SUITS) {
          let fill = 0
          for (const { rank, need } of g.rankNeeds) {
            const count = rem.filter(
              (t) => t.def.cat === 'suit' && t.def.suit === s && t.def.rank === rank,
            ).length
            fill += Math.min(count, need)
          }
          if (g.dragonCount > 0) {
            const drg = dragonForSuit[s]
            const dCount = rem.filter((t) => t.def.cat === 'dragon' && t.def.dragon === drg).length
            fill += Math.min(dCount, g.dragonCount)
          }
          if (g.opposingDragons) {
            const [drg1, drg2] = opposingForSuit[s]
            fill += Math.min(
              rem.filter((t) => t.def.cat === 'dragon' && t.def.dragon === drg1).length,
              g.opposingDragons.need,
            )
            fill += Math.min(
              rem.filter((t) => t.def.cat === 'dragon' && t.def.dragon === drg2).length,
              g.opposingDragons.need,
            )
          }
          if (fill > bestFill) {
            bestFill = fill
            bestSuit = s
          }
        }
        if (!bestSuit) break
        lockedSuits.add(bestSuit)
        let idx = a
        const drg = dragonForSuit[bestSuit]
        // dragonsFirst: dragons before rank tiles (e.g. "DDDD 3333…"); default: ranks first.
        if (g.dragonsFirst && g.dragonCount > 0) {
          for (let k = 0; k < g.dragonCount && idx < b; k++) out[idx++] = { cat: 'dragon', dragon: drg }
        }
        for (const { rank, need } of g.rankNeeds) {
          for (let k = 0; k < need && idx < b; k++) {
            out[idx++] = { cat: 'suit', suit: bestSuit, rank }
          }
        }
        if (!g.dragonsFirst && g.dragonCount > 0) {
          for (let k = 0; k < g.dragonCount && idx < b; k++) out[idx++] = { cat: 'dragon', dragon: drg }
        }
        if (g.opposingDragons) {
          const [drg1, drg2] = opposingForSuit[bestSuit]
          const need = g.opposingDragons.need
          for (let k = 0; k < need && idx < b; k++) out[idx++] = { cat: 'dragon', dragon: drg1 }
          for (let k = 0; k < need && idx < b; k++) out[idx++] = { cat: 'dragon', dragon: drg2 }
        }
        break
      }
      case 'suit-locked-consec-multi': {
        // QUINTS #1 etc.: same search as `computeGroupMatch` / tiles-away (defaults were all `bam`,
        // so naturals in the *chosen* suit did not line up and rack highlights were wrong).
        const rem = rackAfterPriorGroups(rack, usedMeta, gi)
        const n = g.needs.length
        const maxStart = 10 - n
        let bestFill = 0
        let bestSuit: Suit | null = null
        let bestStart = -1
        for (const s of SUITS) {
          const byRank = new Map<number, number>()
          for (const t of rem) {
            if (t.def.cat === 'suit' && t.def.suit === s && g.test(t.def)) {
              byRank.set(t.def.rank, (byRank.get(t.def.rank) ?? 0) + 1)
            }
          }
          for (let r = 1; r <= maxStart; r++) {
            let fill = 0
            for (let i = 0; i < n; i++) {
              fill += Math.min(byRank.get(r + i) ?? 0, g.needs[i]!)
            }
            if (fill > bestFill) {
              bestFill = fill
              bestSuit = s
              bestStart = r
            }
          }
        }
        if (bestSuit == null || bestStart < 0) break
        lockedSuits.add(bestSuit)
        const s = bestSuit
        let idx = a
        for (let i = 0; i < n; i++) {
          const rank = bestStart + i
          const need = g.needs[i]!
          for (let k = 0; k < need && idx < b; k++) {
            out[idx++] = { cat: 'suit', suit: s, rank }
          }
        }
        break
      }
      default:
        break
    }
  }

  // After resolving SRS suits, patch any coupled generic-dragon fixed groups so their
  // dragon type matches the actual chosen suit (bam→green, dot→soap, crak→red).
  patchCoupledSrsDragonStripDefs(out, p, spans)

  return out
}

/**
 * Re-derives the dragon type for each SRS-coupled generic-dragon `fixed` group using the
 * actual suits already written into `out` (rather than whatever rack tiles the greedy match
 * happened to assign, which may be the wrong dragon flavor).
 */
function patchCoupledSrsDragonStripDefs(
  out: TileDef[],
  p: PracticePattern,
  spans: readonly ([number, number] | undefined)[],
): void {
  const groups = p.groups
  if (!groups?.length) return
  const dragonForSuit = { bam: 'green', dot: 'soap', crak: 'red' } as const
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi]!
    if (!isGenericAllDragonsFixedGroup(g)) continue
    const col = srsDragonCoupledColumn(p, gi, g)
    if (col == null) continue
    const srsGi = col === 0 ? gi - 1 : gi - 2
    const srsG = groups[srsGi]
    if (!srsG || srsG.kind !== 'shared-rank-suits') continue
    const srsSpan = spans[srsGi]
    const span = spans[gi]
    if (!srsSpan || !span) continue
    const [srsA] = srsSpan
    const [a, b] = span
    // Column col starts after the sum of prior column needs within the SRS span
    const colOffset = srsG.needs.slice(0, col).reduce((s, n) => s + n, 0)
    const colTile = out[srsA + colOffset]
    if (colTile?.cat !== 'suit') continue
    const dragon = dragonForSuit[colTile.suit]
    for (let k = a; k < b; k++) out[k] = { cat: 'dragon', dragon }
  }
}

/** One card-order cell in the suggested-hands strip: actual rack face when held, else pattern target (never a joker face). */
export type SuggestedStripSlot = {
  displayDef: TileDef
  cardInk?: CardInk
  /** True when this cell shows a natural tile from your rack that counts toward the line. */
  highlight: boolean
  /** True when this cell is the next legal joker fill target in the suggested meld. */
  jokerSuggested: boolean
}

function leftAnchorNaturalsByMeldRun(
  defs: readonly TileDef[],
  slots: readonly SuggestedStripSlot[],
): SuggestedStripSlot[] {
  if (defs.length !== slots.length) return [...slots]
  const out = slots.map((s) => ({ ...s }))
  let i = 0
  while (i < defs.length) {
    const a = i
    const d0 = defs[i]!
    i++
    while (i < defs.length && tileDefsEqual(defs[i]!, d0)) i++
    const b = i
    const nHighlighted = out.slice(a, b).reduce((acc, s) => acc + (s.highlight ? 1 : 0), 0)
    if (nHighlighted <= 0) continue
    for (let k = a; k < b; k++) out[k]!.highlight = k - a < nHighlighted
  }
  return out
}

/** Card-line defs sometimes use `{ cat: 'joker' }` placeholders — replace with the natural tile that meld represents. */
function normalizeSuggestedStripTargetDefs(defs: TileDef[]): TileDef[] {
  const naturalNeighbor = (i: number): TileDef | null => {
    for (let j = i - 1; j >= 0; j--) {
      const d = defs[j]!
      if (d.cat === 'joker') continue
      if (d.cat === 'suit' || d.cat === 'wind' || d.cat === 'dragon' || d.cat === 'flower') return d
    }
    for (let j = i + 1; j < defs.length; j++) {
      const d = defs[j]!
      if (d.cat === 'joker') continue
      if (d.cat === 'suit' || d.cat === 'wind' || d.cat === 'dragon' || d.cat === 'flower') return d
    }
    return null
  }
  return defs.map((d, i) => {
    if (d.cat !== 'joker') return d
    return naturalNeighbor(i) ?? d
  })
}

/**
 * Builds strip cells for a **full** winning hand (`roughTarget` tiles, usually 14): rack naturals
 * where assigned, otherwise the completed-hand target tile (joker placeholders → that meld’s natural).
 * `highlight` only for naturals you hold (no joker faces).
 */
function buildSuggestedStripSlotsFromStripDefs(
  p: PracticePattern,
  rack: TileInstance[],
  usedOrder: readonly string[],
  bestIdsForAssignment: ReadonlySet<string>,
  usedMeta: readonly GroupUsedMeta[] | null,
  stripDefsGroup: TileDef[],
  /** When true (variant rows), a rack tile only shows in a slot when it exactly matches the slot's
   * resolved suit+rank. Prevents mixed-suit display in consec / suit-permute variant rows. */
  strictSuitMatching = false,
): SuggestedStripSlot[] {
  const rawDefs =
    p.id === 'like-2' && stripDefsGroup.length === 14
      ? reorderLikeTwoGroupTileDefsToDisplay(stripDefsGroup)
      : p.id === 'like-3' && stripDefsGroup.length === 14
        ? reorderLikeThreeGroupTileDefsToDisplay(stripDefsGroup)
      : p.id === 'consec-6' && stripDefsGroup.length === 14
        ? reorderConsec6GroupTileDefsToDisplay(stripDefsGroup)
        : p.id === 'math-2' && stripDefsGroup.length === 14
          ? reorderMath2GroupTileDefsToDisplay(stripDefsGroup)
          : p.id === '2468-2' && stripDefsGroup.length === 14
            ? reorder2468_2GroupTileDefsToDisplay(stripDefsGroup)
            : p.id === '13579-1b' && stripDefsGroup.length === 14
              ? reorder13579_1bGroupTileDefsToDisplay(stripDefsGroup)
              : stripDefsGroup
  const defs = normalizeSuggestedStripTargetDefs(rawDefs).slice(0, p.roughTarget)
  const cardInks = patternLinePreviewCardInks(p)
  if (defs.length === 0) return []
  const assign = computePreviewStripAssignment(
    p,
    rack,
    usedOrder,
    bestIdsForAssignment,
    usedMeta,
    stripDefsGroup,
  )
  const byId = new Map(rack.map((t) => [t.id, t] as const))
  const naturalUsed = new Set(
    usedOrder.filter((id) => {
      const t = byId.get(id)
      return t && t.def.cat !== 'joker'
    }),
  )
  const provisional = defs.map((targetDef, i) => {
    const cardInk = i < cardInks.length ? cardInks[i] : undefined
    const tid = assign.slotTileIdByStripIndex[i] ?? null
    let displayDef: TileDef = targetDef
    let highlight = false
    let jokerSuggested = false
    if (tid) {
      const t = byId.get(tid)
      if (t && t.def.cat === 'joker') {
        // Real rack joker filling this slot: keep the target tile's color/identifier;
        // the JOKER badge renders on top so the meld type stays readable.
        displayDef = targetDef
        jokerSuggested = true
      } else if (t && t.def.cat !== 'joker') {
        const compatible = strictSuitMatching
          ? tileDefsEqual(targetDef, t.def)
          : stripSlotAcceptsNatural(p, targetDef, t.def)
        displayDef = compatible ? t.def : targetDef
        highlight = compatible && naturalUsed.has(tid)
      }
    } else if (assign.kinds[i] === 'joker') {
      // No rack joker assigned yet but slot is marked as the next legal joker target.
      jokerSuggested = true
    }

    return { displayDef, cardInk, highlight, jokerSuggested }
  })
  return leftAnchorNaturalsByMeldRun(defs, provisional)
}

/**
 * WINDS-DRAGONS-style `consec` + card title with two digit-column inks: every ordered pair of
 * **distinct** suits for the two consecutive ranks (e.g. 1B+2C, 1C+2D, …), greedy match first.
 *
 * Scans ALL valid consecutive rank pairs (1,2)–(8,9) (not just the primary greedy's choice) so
 * that a player holding, say, 5B tiles will see both "5B+6x" variants (5B as arm-1) AND "4x+5B"
 * variants (5B as arm-2) when they are tied at the highest joker-inclusive fill score.
 */
function buildConsecOpposingSuitStripVariantRows(
  p: PracticePattern,
  rack: TileInstance[],
  usedMeta: readonly GroupUsedMeta[] | null,
  stripResolved: TileDef[],
): {
  rows: SuggestedStripSlot[][]
  maxFill: number
  /** Parallel to `rows`: the (r, s1, s2) combo each row was built from. */
  combos: Array<{ r: number; s1: Suit; s2: Suit }>
} | null {
  if (!firstOpposingConsecutiveStandInPairFromTitle(p)) return null
  const groups = p.groups
  if (!groups?.length) return null
  const gi = groups.findIndex((g) => g.kind === 'consec')
  if (gi < 0) return null
  const g = groups[gi]!
  if (g.kind !== 'consec') return null
  const spans = groupPreviewIndexSpans(p)
  if (!spans) return null
  const span = spans[gi]
  if (!span) return null
  const [a, b] = span
  const mid = a + g.need1
  const d0 = stripResolved[a]
  const d1 = stripResolved[mid]
  if (d0?.cat !== 'suit' || d1?.cat !== 'suit') return null
  const rLo = d0.rank
  const rHi = d1.rank
  if (rHi !== rLo + 1) return null

  const um = usedMeta ?? []
  const rem = rackAfterPriorGroups(rack, um, gi)
  const jokerCount = rem.filter((t) => t.def.cat === 'joker').length

  // The primary greedy's suit choice — used to sort that combo first.
  const prim = d0.suit
  const sec = d1.suit

  /** Build one variant strip row for the given (r, r+1, s1, s2) combination. */
  const buildRow = (r: number, s1: Suit, s2: Suit): SuggestedStripSlot[] => {
    const strip = [...stripResolved]
    let idx = a
    for (let k = 0; k < g.need1 && idx < b; k++) strip[idx++] = { cat: 'suit', suit: s1, rank: r }
    for (let k = 0; k < g.need2 && idx < b; k++) strip[idx++] = { cat: 'suit', suit: s2, rank: r + 1 }
    // Re-run greedy match with a pinned version of the pattern so highlight ids reflect THIS
    // variant's (suit, rank) assignment rather than the primary greedy match result.
    // We keep kind='consec' (not 'fixed') so that usedMeta entries carry consecPart (0 or 1),
    // which buildPreviewSlotKindsFromGroups requires to place arm-0 and arm-1 tiles correctly.
    const pinnedGroups: PatternGroup[] = groups.map((grp, i) => {
      if (i !== gi) return grp
      return {
        ...g,
        kind: 'consec' as const,
        test: (def: TileDef) =>
          def.cat === 'suit' &&
          ((def.suit === s1 && def.rank === r) || (def.suit === s2 && def.rank === r + 1)),
      }
    })
    const pinnedP: PracticePattern = { ...p, groups: pinnedGroups }
    const variantDetail = greedyPatternMatchDetail(rack, pinnedP)
    const variantBestIds = computeRackPatternHighlightIds(rack, pinnedP, variantDetail)
    return buildSuggestedStripSlotsFromStripDefs(
      p,
      rack,
      variantDetail.usedOrder,
      variantBestIds,
      variantDetail.usedMeta,
      strip,
      true,
    )
  }

  // Evaluate every (r, r+1, s1, s2) combo across all valid ranks and distinct suit pairs.
  // Include rack jokers in the fill score so that e.g. "5B(×2) + joker" at rank 5 correctly
  // competes with or ties "7B(×2) + 8D(×2)" at rank 7 when the joker bridges the gap.
  // n1/n2 are stored separately (natural tiles only) so the sort can prefer combos where
  // the player has multiple tiles toward the same arm (e.g. 7D×2 → arm1 max=2) over combos
  // where tiles are split across both arms 1+1 (e.g. 3B + 4D → arm max=1).
  type Combo = { r: number; s1: Suit; s2: Suit; fill: number; n1: number; n2: number }
  const allCombos: Combo[] = []
  for (let r = 1; r <= 8; r++) {
    for (const s1 of SUITS) {
      for (const s2 of SUITS) {
        if (s1 === s2) continue
        const n1 = Math.min(
          rem.filter((t) => t.def.cat === 'suit' && t.def.suit === s1 && t.def.rank === r).length,
          g.need1,
        )
        const n2 = Math.min(
          rem.filter((t) => t.def.cat === 'suit' && t.def.suit === s2 && t.def.rank === r + 1).length,
          g.need2,
        )
        const jokerFill = Math.min(jokerCount, (g.need1 - n1) + (g.need2 - n2))
        allCombos.push({ r, s1, s2, fill: n1 + n2 + jokerFill, n1, n2 })
      }
    }
  }

  const maxFill = allCombos.reduce((mx, c) => Math.max(mx, c.fill), 0)

  // When no tiles match any combo, fall back to showing the 6 suit-pair variants at the
  // primary greedy rank only — same as the original single-rank behavior.
  const sourceCombos: Combo[] =
    maxFill === 0
      ? SUITS.flatMap((s1) =>
          SUITS.filter((s2) => s2 !== s1).map((s2) => ({ r: rLo, s1, s2, fill: 0, n1: 0, n2: 0 })),
        )
      : allCombos.filter((c) => c.fill === maxFill)

  const bestCombos = sourceCombos.sort((a, b) => {
    // 1. Prefer the combo where the player has the most tiles concentrated in a single arm
    //    (2 naturals in one arm beats 1+1 split across both, even though total naturals tie).
    //    The primary greedy often picks same-suit (excluded here as s1≠s2), so its (rLo,prim,sec)
    //    may not appear in this list — use arm-concentration as the primary sort key instead.
    const aArmMax = Math.max(a.n1, a.n2)
    const bArmMax = Math.max(b.n1, b.n2)
    if (bArmMax !== aArmMax) return bArmMax - aArmMax
    // 2. Then total naturals descending.
    const aNat = a.n1 + a.n2
    const bNat = b.n1 + b.n2
    if (bNat !== aNat) return bNat - aNat
    // 3. Finally put the primary greedy's (rLo, prim, sec) combo first as a stable tiebreaker.
    const ap = a.r === rLo && a.s1 === prim && a.s2 === sec ? 0 : 1
    const bp = b.r === rLo && b.s1 === prim && b.s2 === sec ? 0 : 1
    return ap - bp
  })

  const rows = bestCombos.map(({ r, s1, s2 }) => buildRow(r, s1, s2))
  if (rows.length <= 1) return null
  return {
    rows,
    maxFill,
    combos: bestCombos.map(({ r, s1, s2 }) => ({ r, s1, s2 })),
  }
}

/**
 * `suit-permute` groups: one strip row per ordered suit assignment across color slots, greedy first.
 * e.g. FF 2222 44 66 8888 → 6 rows (all 3! orderings of bam/dot/crak to red/navy/green slots).
 */
function buildSuitPermuteStripVariantRows(
  p: PracticePattern,
  rack: TileInstance[],
  usedOrder: readonly string[],
  bestIdsForAssignment: ReadonlySet<string>,
  usedMeta: readonly GroupUsedMeta[] | null,
  stripResolved: TileDef[],
): { rows: SuggestedStripSlot[][]; maxFill: number } | null {
  const groups = p.groups
  if (!groups?.length) return null
  const gi = groups.findIndex((g) => g.kind === 'suit-permute')
  if (gi < 0) return null
  const g = groups[gi]!
  if (g.kind !== 'suit-permute') return null
  const nSlots = g.colorGroups.length
  if (nSlots < 2) return null
  const spans = groupPreviewIndexSpans(p)
  if (!spans) return null
  const span = spans[gi]
  if (!span) return null
  const [a, b] = span

  const um = usedMeta ?? []
  const rem = rackAfterPriorGroups(rack, um, gi)
  const perms = suitPermutations(nSlots)

  // Collect suits already committed by suit-locked groups (read from the resolved strip).
  const lockedSuitsForVariants = new Set<Suit>()
  const dragonToSuit: Record<string, Suit> = { green: 'bam', soap: 'dot', red: 'crak' }
  for (let gi2 = 0; gi2 < groups.length; gi2++) {
    const g2 = groups[gi2]
    if (!g2 || g2.kind !== 'suit-locked') continue
    const span2 = spans[gi2]
    if (!span2) continue
    const [a2, b2] = span2
    for (let k = a2; k < b2; k++) {
      const def = stripResolved[k]
      if (def?.cat === 'suit') { lockedSuitsForVariants.add(def.suit); break }
      if (def?.cat === 'dragon') { const s = dragonToSuit[def.dragon]; if (s) lockedSuitsForVariants.add(s); break }
    }
  }

  const drgForSuitVar = { bam: 'green' as const, dot: 'soap' as const, crak: 'red' as const }
  const tdc = g.trailingDragonCount ?? 0

  // When consecRanks, also iterate over valid base ranks; otherwise base is always 1
  // (actualRank = sg.rank - 1 + base; when base=1 and not consecRanks, actualRank = sg.rank).
  const maxRankOff = g.consecRanks
    ? Math.max(...g.colorGroups.flatMap((cg) => cg.map((sg) => sg.rank))) - 1
    : 0
  const searchBases = g.consecRanks
    ? Array.from({ length: 9 - maxRankOff }, (_, i) => i + 1)
    : [1]

  // Build all (perm, base) combos, compute fill for each, track the best.
  const combos: { perm: Suit[]; base: number }[] = []
  const comboFills: number[] = []
  let bestFill = -1
  let bestComboIdx = -1

  for (const base of searchBases) {
    for (const perm of perms) {
      if (lockedSuitsForVariants.size > 0 && perm.some((s) => lockedSuitsForVariants.has(s))) {
        combos.push({ perm, base })
        comboFills.push(-1)
        continue
      }
      let fill = 0
      for (let ci = 0; ci < nSlots; ci++) {
        const s = perm[ci]!
        for (const sg of g.colorGroups[ci]!) {
          const rank = sg.rank - 1 + base
          fill += Math.min(
            rem.filter((t) => t.def.cat === 'suit' && t.def.suit === s && t.def.rank === rank).length,
            sg.need,
          )
        }
        const dc = g.colorGroupDragonCounts?.[ci] ?? 0
        if (dc > 0) {
          const drg = drgForSuitVar[s]
          fill += Math.min(rem.filter((t) => t.def.cat === 'dragon' && t.def.dragon === drg).length, dc)
        }
      }
      if (tdc > 0) {
        const remaining = SUITS.find((s) => !perm.includes(s))
        if (remaining) {
          const drg = drgForSuitVar[remaining]
          fill += Math.min(rem.filter((t) => t.def.cat === 'dragon' && t.def.dragon === drg).length, tdc)
        }
      }
      combos.push({ perm, base })
      comboFills.push(fill)
      if (fill > bestFill) {
        bestFill = fill
        bestComboIdx = combos.length - 1
      }
    }
  }

  if (bestComboIdx < 0) return null
  const maxFill = bestFill

  // Always show only the single greedy-best combo. Secondary-tier combos are exposed as separate
  // SuggestedHandLine entries generated by rankSuggestedHands, not as stacked rows here.
  const sorted = [combos[bestComboIdx]!]

  const rows: SuggestedStripSlot[][] = sorted.map(({ perm, base }) => {
    const strip = [...stripResolved]
    let idx = a
    for (let ci = 0; ci < nSlots && idx < b; ci++) {
      const s = perm[ci]!
      for (const sg of g.colorGroups[ci]!) {
        const rank = sg.rank - 1 + base
        for (let k = 0; k < sg.need && idx < b; k++) {
          strip[idx++] = { cat: 'suit', suit: s, rank }
        }
      }
      const dc = g.colorGroupDragonCounts?.[ci] ?? 0
      if (dc > 0) {
        const drg = drgForSuitVar[s]
        for (let k = 0; k < dc && idx < b; k++) strip[idx++] = { cat: 'dragon', dragon: drg }
      }
    }
    if (tdc > 0) {
      const remaining = SUITS.find((s) => !perm.includes(s))
      if (remaining) {
        const drg = drgForSuitVar[remaining]
        for (let k = 0; k < tdc && idx < b; k++) strip[idx++] = { cat: 'dragon', dragon: drg }
      }
    }
    return buildSuggestedStripSlotsFromStripDefs(p, rack, usedOrder, bestIdsForAssignment, um, strip, true)
  })
  return rows.length > 0 ? { rows, maxFill } : null
}

/**
 * Build the single strip-slot row for a consecRanks suit-permute pattern with the suit permutation
 * and base rank pinned to a specific tier combo. Used by the suggested-hands panel to render
 * secondary-tier entries (e.g. "10 away" variant) with the correct suit/rank assignment.
 * @param rackForMatch — tiles with exposure jokers expanded to their stand-in defs for the matcher.
 * @param rackForDisplay — optional; same ids, real joker defs for strip faces (defaults to `rackForMatch`).
 */
export function buildConsecRanksTierStripRow(
  p: PracticePattern,
  rackForMatch: TileInstance[],
  tierPerm: Suit[],
  tierBase: number,
  rackForDisplay: TileInstance[] = rackForMatch,
): SuggestedStripSlot[] | null {
  const gi = p.groups?.findIndex((g) => g.kind === 'suit-permute') ?? -1
  if (gi < 0) return null
  const spg = p.groups![gi] as Extract<PatternGroup, { kind: 'suit-permute' }>
  if (!spg.consecRanks) return null

  // Build a pinned PracticePattern replacing the suit-permute group with fixed groups
  // so the greedy matcher uses only tiles that match the specific (perm, base) combo.
  // This gives correct usedOrder / usedMeta for highlighting tiles in the tier row.
  const drgForSuitPin = { bam: 'green' as const, dot: 'soap' as const, crak: 'red' as const }
  const trailSuit = (['bam', 'dot', 'crak'] as Suit[]).find((s) => !tierPerm.includes(s))!
  const pinnedGroups: PatternGroup[] = [
    ...(p.groups!.slice(0, gi) as PatternGroup[]),
    ...spg.colorGroups.flatMap((cgSlot, ci) => {
      const s = tierPerm[ci]!
      return cgSlot.map((sg): PatternGroup => {
        const rank = sg.rank - 1 + tierBase
        return {
          kind: 'fixed',
          need: sg.need,
          test: (d) => d.cat === 'suit' && d.suit === s && d.rank === rank,
        }
      })
    }),
    ...(spg.trailingDragonCount
      ? [{ kind: 'fixed' as const, need: spg.trailingDragonCount, test: (d: TileDef) => d.cat === 'dragon' && d.dragon === drgForSuitPin[trailSuit] }]
      : []),
    ...(p.groups!.slice(gi + 1) as PatternGroup[]),
  ]
  const pinnedP: PracticePattern = { ...p, groups: pinnedGroups }
  const tierDetail = greedyPatternMatchDetail(rackForMatch, pinnedP)
  const rackIdSet = new Set(rackForMatch.map((t) => t.id))
  const tierBestIds = new Set(tierDetail.usedOrder.filter((id) => rackIdSet.has(id)))
  if (tierBestIds.size === 0) {
    for (const t of rackForMatch) {
      if (p.matches(t.def)) tierBestIds.add(t.id)
    }
  }

  // Build the overridden strip: start from the primary pattern's resolved strip and
  // overwrite the suit-permute span with concrete suit/rank values for this tier.
  const primaryUsedMeta = greedyPatternMatchDetail(rackForMatch, p).usedMeta ?? []
  const primaryStrip = resolveStripTargetDefsForGreedyMatch(p, rackForMatch, primaryUsedMeta)
  const span = groupPreviewIndexSpans(p)?.[gi]
  const strip = [...primaryStrip]
  if (span) {
    const [a, b] = span
    const nSlots = spg.colorGroups.length
    let idx = a
    for (let ci = 0; ci < nSlots && idx < b; ci++) {
      const s = tierPerm[ci]!
      for (const sg of spg.colorGroups[ci]!) {
        const rank = sg.rank - 1 + tierBase
        for (let k = 0; k < sg.need && idx < b; k++) strip[idx++] = { cat: 'suit', suit: s, rank }
      }
      const dc = spg.colorGroupDragonCounts?.[ci] ?? 0
      const drg = drgForSuitPin[s]
      for (let k = 0; k < dc && idx < b; k++) strip[idx++] = { cat: 'dragon', dragon: drg }
    }
    if (spg.trailingDragonCount) {
      const trailDrg = drgForSuitPin[trailSuit]
      for (let k = 0; k < spg.trailingDragonCount && idx < b; k++) strip[idx++] = { cat: 'dragon', dragon: trailDrg }
    }
  }

  // Pass pinnedP — not p — because tierDetail.usedMeta has groupIdx values referencing
  // pinnedP's groups (which split the suit-permute group into multiple fixed groups).
  // Using p would map e.g. a "2222 in bam" used tile (groupIdx=2 in pinnedP) to the
  // "DDD" dragon group in p, where it can't be placed and would silently fail to highlight.
  return buildSuggestedStripSlotsFromStripDefs(
    pinnedP,
    rackForDisplay,
    tierDetail.usedOrder,
    tierBestIds,
    tierDetail.usedMeta ?? [],
    strip,
    true,
  )
}

/**
 * One or more full strip rows: a single row normally; for opposing `consec` suit columns or
 * `suit-permute` color-slot hands, one row per valid suit assignment, greedy match first.
 */
export type SuggestedStripRowsResult = {
  rows: SuggestedStripSlot[][]
  /** Per-row focus-key suffix for stacked opposing-consec rows (parallel to `rows`).
   * Format: `oc::<r>-<s1>-<s2>`. Empty array when the stack isn't opposing-consec or rows.length <= 1. */
  ocVariantSuffixes: string[]
  /** Combined "all" suffix for opposing-consec stacks: `ocall::<r1>-<s1a>-<s1b>|...`. Empty otherwise. */
  ocAllSuffix: string
}

export function buildSuggestedStripSlotRowsWithVariants(
  p: PracticePattern,
  rack: TileInstance[],
  usedOrder: readonly string[],
  bestIdsForAssignment: ReadonlySet<string>,
  usedMeta: readonly GroupUsedMeta[] | null,
  exposureTileIds?: ReadonlySet<string>,
): SuggestedStripRowsResult {
  const um = usedMeta ?? []
  const stripResolved = resolveStripTargetDefsForGreedyMatch(p, rack, um, exposureTileIds)
  const altConsec = buildConsecOpposingSuitStripVariantRows(
    p,
    rack,
    usedMeta,
    stripResolved,
  )
  if (altConsec) {
    // When the player holds real tiles toward the consec group, show all tied suit-pair variants
    // so they can see every combination they're closest to (different suits = genuinely different tiles).
    // When maxFill is 0 the player has nothing for any variant — all strips look identical, show one.
    if (altConsec.maxFill > 0) {
      const suffixes = altConsec.combos.map(({ r, s1, s2 }) => `oc::${r}-${s1}-${s2}`)
      return {
        rows: altConsec.rows,
        ocVariantSuffixes: suffixes,
        ocAllSuffix:
          altConsec.combos.length > 0
            ? `ocall::${altConsec.combos.map(({ r, s1, s2 }) => `${r}-${s1}-${s2}`).join('|')}`
            : '',
      }
    }
    return { rows: [altConsec.rows[0]!], ocVariantSuffixes: [], ocAllSuffix: '' }
  }
  const altPerm = buildSuitPermuteStripVariantRows(
    p,
    rack,
    usedOrder,
    bestIdsForAssignment,
    usedMeta,
    stripResolved,
  )
  if (altPerm) {
    return { rows: altPerm.rows, ocVariantSuffixes: [], ocAllSuffix: '' }
  }
  return {
    rows: [buildSuggestedStripSlotsFromStripDefs(p, rack, usedOrder, bestIdsForAssignment, um, stripResolved, true)],
    ocVariantSuffixes: [],
    ocAllSuffix: '',
  }
}

export function buildSuggestedStripSlotRows(
  p: PracticePattern,
  rack: TileInstance[],
  usedOrder: readonly string[],
  bestIdsForAssignment: ReadonlySet<string>,
  usedMeta: readonly GroupUsedMeta[] | null,
  exposureTileIds?: ReadonlySet<string>,
): SuggestedStripSlot[][] {
  return buildSuggestedStripSlotRowsWithVariants(
    p,
    rack,
    usedOrder,
    bestIdsForAssignment,
    usedMeta,
    exposureTileIds,
  ).rows
}

export function buildSuggestedStripSlots(
  p: PracticePattern,
  rack: TileInstance[],
  usedOrder: readonly string[],
  bestIdsForAssignment: ReadonlySet<string>,
  usedMeta: readonly GroupUsedMeta[] | null,
  exposureTileIds?: ReadonlySet<string>,
): SuggestedStripSlot[] {
  const rows = buildSuggestedStripSlotRows(
    p,
    rack,
    usedOrder,
    bestIdsForAssignment,
    usedMeta,
    exposureTileIds,
  )
  return rows[0] ?? []
}

/**
 * Per preview-tile index: matches rack “associated tiles” (`bestIds`).
 * Pass 1: each card-order preview def takes the earliest unused `usedOrder` tile with the same def.
 * Pass 2: remaining preview naturals that allow jokers take earliest unused joker from the same
 * pool (still in `bestIds`), so strip highlights match rack jokers standing in for those melds.
 */
export function previewSlotSuggestKinds(
  p: PracticePattern,
  rackForPattern: TileInstance[],
  usedOrder: readonly string[],
  bestIds: ReadonlySet<string>,
  usedMetaArg?: readonly GroupUsedMeta[] | null,
): PreviewSlotSuggestKind[] {
  return computePreviewStripAssignment(p, rackForPattern, usedOrder, bestIds, usedMetaArg).kinds
}

/**
 * Picks which strip row(s) match the current focus. Multi-combo "all" keys use every row; a single
 * opposing-consec variant matches `patternId::oc::…`.
 */
function pickStripRowsForFocusKey(
  patternId: string,
  focusKey: string,
  isMulti: boolean,
  res: SuggestedStripRowsResult,
): SuggestedStripSlot[][] {
  if (res.rows.length === 0) return []
  if (isMulti) return res.rows
  if (res.rows.length === 1) return [res.rows[0]!]
  if (res.ocVariantSuffixes.length > 0 && res.ocVariantSuffixes.length === res.rows.length) {
    const i = res.ocVariantSuffixes.findIndex(
      (suf) => focusKey === `${patternId}::${suf}` || focusKey.endsWith(suf),
    )
    if (i >= 0) return [res.rows[i]!]
  }
  return [res.rows[0]!]
}

function collectNeededNaturalDefsFromStripRows(rows: SuggestedStripSlot[][]): TileDef[] {
  const out: TileDef[] = []
  for (const row of rows) {
    for (const s of row) {
      if (s.highlight) continue
      if (s.displayDef.cat === 'joker') continue
      out.push(s.displayDef)
    }
  }
  return out
}

function discardIdsMatchingNeededDefs(
  discards: readonly TileInstance[],
  needDefs: readonly TileDef[],
): Set<string> {
  const ids = new Set<string>()
  for (const t of discards) {
    if (needDefs.some((d) => tileDefsEqual(d, t.def))) {
      ids.add(t.id)
    }
  }
  return ids
}

/**
 * For the same suggested-hand focus as the rack guide, which discard-pile tile ids are naturals
 * the pattern is still short (non-highlight strip slots) — "dead" copies of tiles you need.
 * Empty when `focusKey` is null/invalid or the strip cannot be built.
 */
export function computeSuggestedDiscardNeedHighlightIds(
  focusKey: string | null,
  rack: TileInstance[],
  discards: readonly TileInstance[],
  exposureTileIds?: ReadonlySet<string>,
): Set<string> {
  if (!focusKey) return new Set()
  const variantSep = ['::tier::', '::oc::', '::ocall::']
    .map((s) => focusKey.indexOf(s))
    .filter((i) => i >= 0)
    .reduce((m, i) => (m < 0 ? i : Math.min(m, i)), -1)
  const patternId = variantSep >= 0 ? focusKey.slice(0, variantSep) : focusKey
  const p = PRACTICE_PATTERNS.find((x) => x.id === patternId)
  if (!p) return new Set()
  const greedyUiOpts: GreedyPatternMatchOpts | undefined =
    exposureTileIds && exposureTileIds.size > 0
      ? { exposureTileIds }
      : undefined

  const addFromStripWork = (pinnedP: PracticePattern, isMulti: boolean, fk: string) => {
    const detail = greedyPatternMatchDetail(rack, pinnedP, greedyUiOpts)
    const rackIdSet = new Set(rack.map((t) => t.id))
    const bestIds = isMulti
      ? new Set(detail.usedOrder.filter((id) => rackIdSet.has(id)))
      : computeRackPatternHighlightIds(
          rack,
          pinnedP,
          detail,
          exposureTileIds,
        )
    const result = buildSuggestedStripSlotRowsWithVariants(
      pinnedP,
      rack,
      detail.usedOrder,
      bestIds,
      detail.usedMeta,
      exposureTileIds,
    )
    const rows = pickStripRowsForFocusKey(p.id, fk, isMulti, result)
    const needDefs = collectNeededNaturalDefsFromStripRows(rows)
    return discardIdsMatchingNeededDefs(discards, needDefs)
  }

  if (variantSep >= 0) {
    const pinnedPatterns = buildPinnedPatternsFromFocusKey(p, focusKey)
    if (pinnedPatterns.length > 0) {
      const isMulti = isMultiComboFocusKey(focusKey)
      const out = new Set<string>()
      for (const pinnedP of pinnedPatterns) {
        for (const id of addFromStripWork(pinnedP, isMulti, focusKey)) {
          out.add(id)
        }
      }
      return out
    }
  }
  return addFromStripWork(p, false, focusKey)
}

/**
 * Hand tiles appearing in the greedy “used” set for both `focus` and another line with the same
 * `matchedInHand` + `tilesNeededRough` (contested between two equally-close card lines).
 */
export function contestedFlexibleHandTileIds(
  rack: TileInstance[],
  focus: PracticePattern,
  lines: SuggestedHandLine[],
): Set<string> {
  const fl = lines.find((l) => l.id === focus.id)
  if (!fl) return new Set()
  const usedF = new Set(greedyUsedTileOrderForPattern(rack, focus))
  const out = new Set<string>()
  for (const line of lines) {
    if (line.id === focus.id) continue
    if (line.tilesNeededRough !== fl.tilesNeededRough || line.matchedInHand !== fl.matchedInHand)
      continue
    const q = PRACTICE_PATTERNS.find((x) => x.id === line.id)
    if (!q) continue
    const usedQ = new Set(greedyUsedTileOrderForPattern(rack, q))
    for (const id of usedF) {
      if (usedQ.has(id)) out.add(id)
    }
  }
  return out
}

/**
 * Reorder East’s concealed tiles: **card-line / suggested-strip order** (suits then their dragons,
 * etc.), then any other matched hand tiles in matcher order, then pattern-helping tiles sorted by
 * table scarcity, then the rest.
 */
/** Build a pinned pattern from an opposing-consec combo string `<r>-<s1>-<s2>`.
 * Mirrors the inline construction in `buildConsecOpposingSuitStripVariantRows`. */
function buildPinnedPatternFromOpposingConsecComboStr(
  basePattern: PracticePattern,
  comboStr: string,
): PracticePattern | null {
  const parts = comboStr.split('-')
  if (parts.length !== 3) return null
  const r = parseInt(parts[0]!)
  const s1 = parts[1] as Suit
  const s2 = parts[2] as Suit
  if (!Number.isFinite(r) || r < 1 || r > 8) return null
  if (!basePattern.groups) return null
  const gi = basePattern.groups.findIndex((g) => g.kind === 'consec')
  if (gi < 0) return null
  const g = basePattern.groups[gi]!
  if (g.kind !== 'consec') return null
  const pinnedGroups: PatternGroup[] = basePattern.groups.map((grp, i) => {
    if (i !== gi) return grp
    return {
      ...g,
      kind: 'consec' as const,
      test: (def: TileDef) =>
        def.cat === 'suit' &&
        ((def.suit === s1 && def.rank === r) || (def.suit === s2 && def.rank === r + 1)),
    }
  })
  return { ...basePattern, groups: pinnedGroups }
}

/** Build pinned pattern(s) from a focus key. Returns one pinned pattern per combo for the
 * multi-combo "all" cases (`::tier::` with `|`, `::ocall::` with `|`); returns a single
 * pinned pattern wrapped in an array for individual variant keys. Returns empty array if
 * the focus key isn't a recognized variant key (caller falls back to base pattern). */
export function buildPinnedPatternsFromFocusKey(
  basePattern: PracticePattern,
  focusKey: string,
): PracticePattern[] {
  // Tier (suit-permute consecRanks): `::tier::<base>:<perm>` (single) or `::tier::<c1>|<c2>|...` (multi)
  const tierSep = focusKey.indexOf('::tier::')
  if (tierSep >= 0) {
    const tierStr = focusKey.slice(tierSep + '::tier::'.length)
    const comboStrs = tierStr.split('|').filter(Boolean)
    return comboStrs
      .map((c) => buildPinnedPatternFromComboStr(basePattern, c))
      .filter((x): x is PracticePattern => x != null)
  }
  // Opposing-consec stack — "all" variant: `::ocall::<r1>-<s1a>-<s1b>|...`
  const ocallSep = focusKey.indexOf('::ocall::')
  if (ocallSep >= 0) {
    const ocStr = focusKey.slice(ocallSep + '::ocall::'.length)
    const comboStrs = ocStr.split('|').filter(Boolean)
    return comboStrs
      .map((c) => buildPinnedPatternFromOpposingConsecComboStr(basePattern, c))
      .filter((x): x is PracticePattern => x != null)
  }
  // Opposing-consec stack — single variant: `::oc::<r>-<s1>-<s2>`
  const ocSep = focusKey.indexOf('::oc::')
  if (ocSep >= 0) {
    const comboStr = focusKey.slice(ocSep + '::oc::'.length)
    const pp = buildPinnedPatternFromOpposingConsecComboStr(basePattern, comboStr)
    return pp ? [pp] : []
  }
  return []
}

/** Returns true when the focus key represents a multi-combo "all" / category selection
 * (i.e., the rack should be lit by the UNION of all variants' contributing tiles). */
export function isMultiComboFocusKey(focusKey: string): boolean {
  if (focusKey.includes('::ocall::')) return true
  const tierSep = focusKey.indexOf('::tier::')
  if (tierSep < 0) return false
  return focusKey.slice(tierSep + '::tier::'.length).includes('|')
}

/** Build a pinned pattern (concrete fixed groups) from a single tier combo string `<base>:<perm>`. */
function buildPinnedPatternFromComboStr(
  basePattern: PracticePattern,
  comboStr: string,
): PracticePattern | null {
  const colonIdx = comboStr.indexOf(':')
  if (colonIdx < 0) return null
  const base = parseInt(comboStr.slice(0, colonIdx))
  if (!Number.isFinite(base)) return null
  const permSuits = comboStr.slice(colonIdx + 1).split('-') as Suit[]
  const gi = basePattern.groups?.findIndex((g) => g.kind === 'suit-permute') ?? -1
  if (gi < 0 || !basePattern.groups) return null
  const spg = basePattern.groups[gi]
  if (!spg || spg.kind !== 'suit-permute' || !spg.consecRanks) return null
  const drgForSuitPin = { bam: 'green' as const, dot: 'soap' as const, crak: 'red' as const }
  const trailSuit = (['bam', 'dot', 'crak'] as Suit[]).find((s) => !permSuits.includes(s))!
  const pinnedGroups: PatternGroup[] = [
    ...basePattern.groups.slice(0, gi),
    ...spg.colorGroups.flatMap((cgSlot, ci) => {
      const s = permSuits[ci]!
      return cgSlot.map((sg): PatternGroup => {
        const rank = sg.rank - 1 + base
        return { kind: 'fixed', need: sg.need, test: (d) => d.cat === 'suit' && d.suit === s && d.rank === rank }
      })
    }),
    ...(spg.trailingDragonCount
      ? [{ kind: 'fixed' as const, need: spg.trailingDragonCount, test: (d: TileDef) => d.cat === 'dragon' && d.dragon === drgForSuitPin[trailSuit] }]
      : []),
    ...basePattern.groups.slice(gi + 1),
  ]
  return { ...basePattern, groups: pinnedGroups }
}

/** Compute the strip-ordered, deduplicated list of hand-tile IDs that the pinned pattern uses. */
function stripOrderedHandIdsForPattern(
  pinnedP: PracticePattern,
  rackForPattern: TileInstance[],
  handIds: Set<string>,
  exposureTileIds?: ReadonlySet<string>,
): { orderedIds: string[]; usedIds: Set<string> } {
  const greedyOpts = exposureTileIds?.size ? { exposureTileIds } : undefined
  const detail = greedyPatternMatchDetail(rackForPattern, pinnedP, greedyOpts)
  const rackIdSet = new Set(rackForPattern.map((t) => t.id))
  const bestIds = new Set(detail.usedOrder.filter((id) => rackIdSet.has(id)))
  if (bestIds.size === 0) {
    for (const t of rackForPattern) {
      if (pinnedP.matches(t.def)) bestIds.add(t.id)
    }
  }
  const stripDefs = resolveStripTargetDefsForGreedyMatch(
    pinnedP,
    rackForPattern,
    detail.usedMeta,
    exposureTileIds,
  )
  const { slotTileIdByStripIndex } = computePreviewStripAssignment(
    pinnedP,
    rackForPattern,
    detail.usedOrder,
    bestIds,
    detail.usedMeta,
    stripDefs,
    greedyOpts,
  )
  // `slotTileIdByStripIndex` is in **suggested-hands** line order (after internal permute for
  // e.g. like-2, consec-6). `patternLinePreviewDefs` is the same left-to-right sequence as the
  // double-click / strip preview, not the raw `resolveStrip` group order.
  const displayDefs = patternLinePreviewDefs(pinnedP)
  const defsByDisplay =
    displayDefs.length > 0 && displayDefs.length === slotTileIdByStripIndex.length
      ? displayDefs
      : stripDefs
  const jokerEli = patternPreviewJokerEligibleBySlot(pinnedP)

  const slots: (string | null)[] =
    slotTileIdByStripIndex.length > 0
      ? [...slotTileIdByStripIndex]
      : defsByDisplay.map(() => null)
  const n = Math.min(slots.length, defsByDisplay.length)
  const byId = new Map(rackForPattern.map((t) => [t.id, t] as const))
  const inSlots = new Set<string>(slots.filter((x): x is string => x != null))

  // Fill any gaps left by `buildPreviewSlotKindsFromGroups` in **card index** order, using
  // `detail.usedOrder` only as a tie / priority list — not as the final left-to-right order
  // (the old `usedOrder` tail put greedy match order first and scrambled FF before consec, etc.).
  for (let i = 0; i < n; i++) {
    if (slots[i] != null) continue
    const d = defsByDisplay[i]!
    for (const id of detail.usedOrder) {
      if (inSlots.has(id) || !handIds.has(id) || !bestIds.has(id)) continue
      const t = byId.get(id)
      if (!t) continue
      if (tileDefsEqual(t.def, d) || stripSlotAcceptsNatural(pinnedP, d, t.def)) {
        slots[i] = id
        inSlots.add(id)
        break
      }
    }
  }
  for (let i = 0; i < n; i++) {
    if (slots[i] != null) continue
    const d = defsByDisplay[i]!
    if (!previewSlotAllowsJoker(d, pinnedP, i, jokerEli)) continue
    for (const id of detail.usedOrder) {
      if (inSlots.has(id) || !handIds.has(id) || !bestIds.has(id)) continue
      const t = byId.get(id)
      if (t?.def.cat === 'joker') {
        slots[i] = id
        inSlots.add(id)
        break
      }
    }
  }

  const orderedIds: string[] = []
  const seen = new Set<string>()
  for (let i = 0; i < n; i++) {
    const id = slots[i]
    if (id == null || !handIds.has(id) || seen.has(id)) continue
    orderedIds.push(id)
    seen.add(id)
  }
  for (const id of detail.usedOrder) {
    if (!handIds.has(id) || seen.has(id)) continue
    if (!bestIds.has(id)) continue
    orderedIds.push(id)
    seen.add(id)
  }
  return { orderedIds, usedIds: new Set(orderedIds) }
}

export function sortHandForSuggestedPattern(
  hand: TileInstance[],
  patternId: string,
  input: RankSuggestedHandsInput,
  /** Optional hand-entry key to sort toward a specific stack variant (or the union of all
   * variants for the "all" / category-row case). Recognized formats:
   *  - `<patternId>::tier::<base>:<perm>` — single suit-permute consecRanks variant
   *  - `<patternId>::tier::<c1>|<c2>|...` — multi (category "all") of suit-permute consecRanks
   *  - `<patternId>::oc::<r>-<s1>-<s2>` — single opposing-consec variant
   *  - `<patternId>::ocall::<r1>-<s1a>-<s1b>|...` — multi (category "all") of opposing-consec
   *  Multi-combo: union of all variants' matching tiles is sorted to the left of the rack,
   *  in combo-order then strip-order. */
  focusKey?: string,
): TileInstance[] {
  const basePattern = PRACTICE_PATTERNS.find((x) => x.id === patternId)
  if (!basePattern) return [...hand]
  const playerClaimMelds = input.playerClaimMelds ?? []
  const rackForPattern = rackForPatternWithClaimMelds(hand, playerClaimMelds)
  const handIds = new Set(hand.map((t) => t.id))
  const exposureTileIds: ReadonlySet<string> | undefined =
    playerClaimMelds.length > 0
      ? new Set(playerClaimMelds.flatMap((e) => e.tiles).map((t) => t.id))
      : undefined

  // Build pinned patterns from the focus key (handles `::tier::`, `::oc::`, and `::ocall::`).
  const pinnedPatterns: PracticePattern[] = focusKey
    ? buildPinnedPatternsFromFocusKey(basePattern, focusKey)
    : []

  // Effective pattern used for the "matches/not-helping/dead-copies" tail sort. For the
  // multi-combo "all" case we fall back to the base pattern so any tile that fits ANY
  // variant is treated as a match in the tail comparator.
  const orderedBest: TileInstance[] = []
  const seen = new Set<string>()
  if (pinnedPatterns.length > 0) {
    // Walk each combo in order; accumulate strip-ordered IDs with global dedup so the
    // first combo's tiles come first, then any additional tiles only the later combos use.
    for (const pp of pinnedPatterns) {
      const { orderedIds } = stripOrderedHandIdsForPattern(pp, rackForPattern, handIds, exposureTileIds)
      for (const id of orderedIds) {
        if (seen.has(id)) continue
        const t = hand.find((x) => x.id === id)
        if (t) {
          orderedBest.push(t)
          seen.add(id)
        }
      }
    }
  } else {
    // No tier focus — original behavior: sort toward the base pattern's primary greedy match.
    const { orderedIds } = stripOrderedHandIdsForPattern(
      basePattern,
      rackForPattern,
      handIds,
      exposureTileIds,
    )
    for (const id of orderedIds) {
      if (seen.has(id)) continue
      const t = hand.find((x) => x.id === id)
      if (t) {
        orderedBest.push(t)
        seen.add(id)
      }
    }
  }

  // Dim tiles keep their current rack order so repeated double-clicks on different hands
  // slide the best tiles left without scrambling everything to the right.
  const rest = hand.filter((t) => !seen.has(t.id))
  return [...orderedBest, ...rest]
}

/**
 * **Concealed + claim-meld** tiles in one list, left-to-right as on the card strip (same
 * `computePreviewStripAssignment` order as the suggested-hands line). Use for end-game review
 * when the rack should read as the full 14, not “melds in table order, then sorted concealed”.
 */
export function sortFullRackTilesForPattern(
  patternId: string,
  input: RankSuggestedHandsInput,
  focusKey?: string,
): TileInstance[] {
  const basePattern = PRACTICE_PATTERNS.find((x) => x.id === patternId)
  const playerClaimMelds = input.playerClaimMelds ?? []
  const rackRaw = [...input.hand, ...playerClaimMelds.flatMap((e) => e.tiles)]
  const rackForPattern = rackForPatternWithClaimMelds(input.hand, playerClaimMelds)
  if (!basePattern) return rackRaw

  const byIdRaw = new Map(rackRaw.map((t) => [t.id, t] as const))
  const rackIds = new Set(rackForPattern.map((t) => t.id))
  const exposureTileIds: ReadonlySet<string> | undefined =
    playerClaimMelds.length > 0
      ? new Set(playerClaimMelds.flatMap((e) => e.tiles).map((t) => t.id))
      : undefined

  const pinnedPatterns: PracticePattern[] = focusKey
    ? buildPinnedPatternsFromFocusKey(basePattern, focusKey)
    : []
  const ordered: TileInstance[] = []
  const seen = new Set<string>()

  const appendStripOrder = (pinned: PracticePattern) => {
    const { orderedIds } = stripOrderedHandIdsForPattern(
      pinned,
      rackForPattern,
      rackIds,
      exposureTileIds,
    )
    for (const id of orderedIds) {
      if (seen.has(id)) continue
      const t = byIdRaw.get(id)
      if (t) {
        ordered.push(t)
        seen.add(id)
      }
    }
  }

  if (pinnedPatterns.length > 0) {
    for (const pp of pinnedPatterns) appendStripOrder(pp)
  } else {
    appendStripOrder(basePattern)
  }

  const rest = rackRaw.filter((t) => !seen.has(t.id))
  return [...ordered, ...rest]
}

/**
 * Suggested-hands `focusKey` for strip sort / match detail (suit-permute stack rows only today).
 * Mirrors `SuggestedHandsPanel` double-click / tier keys.
 */
export function focusKeyForSuggestedHandLine(line: SuggestedHandLine): string | undefined {
  if (line.consecRanksTier && line.consecRanksTier.combos.length > 0) {
    return `${line.id}::tier::${line.consecRanksTier.combos
      .map((c) => `${c.base}:${c.perm.join('-')}`)
      .join('|')}`
  }
  return undefined
}

/**
 * Card-order rack + which tile ids “count” toward the line (greedy, same as in-play highlights).
 * Uses pinned pattern for tiered `id` + `consecRanksTier` when present.
 */
export function postGameRackAndHighlights(
  line: SuggestedHandLine,
  rankInput: RankSuggestedHandsInput,
): { fullRack: TileInstance[]; bestIds: Set<string> } {
  const fk = focusKeyForSuggestedHandLine(line)
  const fullRack = sortFullRackTilesForPattern(line.id, rankInput, fk)
  const base = PRACTICE_PATTERNS.find((x) => x.id === line.id)
  if (!base) return { fullRack, bestIds: new Set() }
  const playerClaimMelds = rankInput.playerClaimMelds ?? []
  const rack = rackForPatternWithClaimMelds(rankInput.hand, playerClaimMelds)
  const opt: GreedyPatternMatchOpts | undefined =
    playerClaimMelds.length > 0
      ? { exposureTileIds: new Set(playerClaimMelds.flatMap((e) => e.tiles).map((t) => t.id)) }
      : undefined
  let pForMatch: PracticePattern = base
  if (fk) {
    const pinned = buildPinnedPatternsFromFocusKey(base, fk)
    if (pinned.length > 0) pForMatch = pinned[0]!
  }
  const detail = greedyPatternMatchDetail(rack, pForMatch, opt)
  const rackIdSet = new Set(rack.map((t) => t.id))
  const bestIds = new Set(detail.usedOrder.filter((id) => rackIdSet.has(id)))
  if (bestIds.size === 0) {
    for (const t of rack) {
      if (pForMatch.matches(t.def)) bestIds.add(t.id)
    }
  }
  return { fullRack, bestIds }
}

/**
 * All practice lines that share the best (minimum) `tilesNeededRough` for this rack, ordered with
 * the same tiebreak as {@link summarizeRackTowardWin} — `[0]` is that function’s `closestLine`.
 * Post-game: use when several hands tie in distance; offer a chooser to flip strip + highlights.
 */
export function suggestedHandsTiedAtBest(input: RankSuggestedHandsInput): {
  bestTilesAway: number
  linesAtMin: SuggestedHandLine[]
} {
  const lines = rankSuggestedHands(input)
  if (!lines.length) return { bestTilesAway: 14, linesAtMin: [] }
  let minAway = 14
  for (const line of lines) {
    if (line.tilesNeededRough < minAway) minAway = line.tilesNeededRough
  }
  const tied = lines.filter((l) => l.tilesNeededRough === minAway)
  tied.sort((a, b) => {
    if (b.matchedInHand !== a.matchedInHand) return b.matchedInHand - a.matchedInHand
    if (a.visibleDeadMatches !== b.visibleDeadMatches) return a.visibleDeadMatches - b.visibleDeadMatches
    if (a.section !== b.section) return a.section.localeCompare(b.section)
    if (a.cardLineNumber !== b.cardLineNumber) return (a.cardLineNumber ?? 0) - (b.cardLineNumber ?? 0)
    return a.title.localeCompare(b.title)
  })
  return { bestTilesAway: minAway, linesAtMin: tied }
}

/**
 * Ranks placeholder “hands” using your **hand + East exposures** (14-tile total toward Mah Jongg),
 * wall height, discards, and bot racks.
 * When the real card arrives, swap `PRACTICE_PATTERNS` for NMJL definitions + legality.
 */
export type RankSuggestedHandsInput = {
  hand: TileInstance[]
  wallRemaining: number
  discards: TileInstance[]
  exposures: BotExposure[]
  /**
   * This seat’s discard-claim melds — **C** lines omitted when non-empty; pattern fit + rack merge.
   * For East, pass their `eastExposures`; for a bot, pass that seat’s `BotExposure[]` entries only.
   */
  playerClaimMelds?: ReadonlyArray<{ tiles: TileInstance[] }>
  /**
   * East’s claim melds on the table (always include in `visible` dead-tile pool for every seat).
   * Omit to default to `playerClaimMelds` (correct when the scoring seat is East).
   */
  eastTableClaimMelds?: ReadonlyArray<{ tiles: TileInstance[] }>
}

export function rankSuggestedHands(input: RankSuggestedHandsInput): SuggestedHandLine[] {
  const { hand, wallRemaining, discards, exposures } = input
  const playerClaimMelds = input.playerClaimMelds ?? []
  const eastTableClaimMelds = input.eastTableClaimMelds ?? input.playerClaimMelds ?? []
  const hasPlayerClaimMelds = playerClaimMelds.length > 0
  /** Concealed hand + this seat’s exposed claim melds — all count toward the 14. */
  const rackForPattern = rackForPatternWithClaimMelds(hand, playerClaimMelds)
  const exposureTileIds: ReadonlySet<string> | undefined =
    hasPlayerClaimMelds ? new Set(playerClaimMelds.flatMap((e) => e.tiles).map((t) => t.id)) : undefined
  const groupMatchExposureOpts: Pick<GroupMatchOpts, 'exposureTileIds'> =
    exposureTileIds && exposureTileIds.size > 0 ? { exposureTileIds } : {}
  const greedyExposureOpts: GreedyPatternMatchOpts | undefined =
    exposureTileIds && exposureTileIds.size > 0 ? { exposureTileIds } : undefined
  const visible = tableVisibleTiles(discards, exposures, eastTableClaimMelds)

  // Pre-compute fixed card line numbers (never changes regardless of sort order)
  const cardLineNumbers = new Map<string, number>()
  const sectionLineCount: Record<string, number> = {}
  for (const p of PRACTICE_PATTERNS) {
    sectionLineCount[p.section] = (sectionLineCount[p.section] ?? 0) + 1
    cardLineNumbers.set(p.id, sectionLineCount[p.section])
  }

  const patternsToRank = PRACTICE_PATTERNS.filter((p) => {
    if (hasPlayerClaimMelds && p.closed) return false
    if (hasPlayerClaimMelds && !claimMeldsFitPracticePattern(p, playerClaimMelds)) return false
    return true
  })

  const drgForSuit = { bam: 'green' as const, dot: 'soap' as const, crak: 'red' as const }

  const rows: SuggestedHandLine[] = patternsToRank.flatMap((p) => {
    const matchedInHand = p.groups
      ? computeGroupMatch(rackForPattern, p.groups, {
          noJokers: p.section === 'SINGLES AND PAIRS',
          ...groupMatchExposureOpts,
        })
      : rackForPattern.filter((t) => p.matches(t.def)).length
    const visibleDeadMatches = visible.filter((t) => p.matches(t.def)).length
    const tilesNeededRough = Math.max(0, p.roughTarget - matchedInHand)
    const pressure = pressureLabel(tilesNeededRough, wallRemaining)

    const note =
      visible.length === 0
        ? 'No discards or exposures yet — table info will tighten these estimates next.'
        : `${visibleDeadMatches} tile(s) that help this shape are already visible on discards or bot racks — fewer copies are hidden in other hands or the wall.`

    const primary: SuggestedHandLine = {
      id: p.id,
      title: p.title,
      titleSegments: p.titleSegments,
      matchedInHand,
      tilesNeededRough,
      wallRemaining,
      visibleDeadMatches,
      pressure,
      note,
      section: p.section,
      points: p.points,
      closed: p.closed,
      cardLineNumber: cardLineNumbers.get(p.id) ?? 1,
    }

    // For consecRanks patterns generate additional tier entries (each at a different tiles-away
    // level) so the player sees this hand at every distance up to 12 away.
    const consecPermuteGroup = p.groups?.find(
      (g): g is Extract<PatternGroup, { kind: 'suit-permute' }> =>
        g.kind === 'suit-permute' && !!g.consecRanks,
    )
    if (!consecPermuteGroup) return [primary]

    const nSlots = consecPermuteGroup.colorGroups.length
    const tdc = consecPermuteGroup.trailingDragonCount ?? 0
    const maxRankOff =
      Math.max(...consecPermuteGroup.colorGroups.flatMap((cg) => cg.map((sg) => sg.rank))) - 1
    const searchBases = Array.from({ length: 9 - maxRankOff }, (_, i) => i + 1)
    const perms = suitPermutations(nSlots)
    const jokerCount = rackForPattern.filter((t) => t.def.cat === 'joker').length

    // Score for each (perm, base) combo: natural fill + joker contribution to suit-permute group.
    // Other groups (e.g. flower) use their score from the primary matchedInHand minus the
    // suit-permute group's contribution (primary natural fill for that group).
    const primaryDetail = greedyPatternMatchDetail(rackForPattern, p, greedyExposureOpts)
    const gi = p.groups!.findIndex((g) => g.kind === 'suit-permute')
    const remForPermute = rackAfterPriorGroups(rackForPattern, primaryDetail.usedMeta, gi)
    // Natural tiles consumed by groups BEFORE the suit-permute group (e.g. flowers).
    // These are fixed regardless of which (perm, base) we use for the suit-permute group.
    const priorGroupsMatched = primaryDetail.usedMeta.filter((m) => m.groupIdx < gi).length

    type ComboScore = { perm: Suit[]; base: number; total: number }
    const comboScores: ComboScore[] = []

    for (const base of searchBases) {
      for (const perm of perms) {
        let naturalFill = 0
        let jokerEligibleUnfilled = 0
        for (let ci = 0; ci < nSlots; ci++) {
          const s = perm[ci]!
          for (const sg of consecPermuteGroup.colorGroups[ci]!) {
            const rank = sg.rank - 1 + base
            const count = Math.min(
              remForPermute.filter(
                (t) => t.def.cat === 'suit' && t.def.suit === s && t.def.rank === rank,
              ).length,
              sg.need,
            )
            naturalFill += count
            if (sg.canUseJoker && sg.need >= 3) jokerEligibleUnfilled += sg.need - count
          }
        }
        if (tdc > 0) {
          const trailSuit = (['bam', 'dot', 'crak'] as Suit[]).find((s) => !perm.includes(s))
          if (trailSuit) {
            const drg = drgForSuit[trailSuit]
            const count = Math.min(
              remForPermute.filter((t) => t.def.cat === 'dragon' && t.def.dragon === drg).length,
              tdc,
            )
            naturalFill += count
            jokerEligibleUnfilled += tdc - count
          }
        }
        const jokerFill = Math.min(jokerCount, jokerEligibleUnfilled)
        const total = priorGroupsMatched + naturalFill + jokerFill
        comboScores.push({ perm, base, total })
      }
    }

    // Group combos by total matched count and produce one tier entry per distinct count
    // that is worse than the primary (lower total) but still yields ≤ 12 tiles away.
    const MAX_TILES_AWAY = 12
    const byTotal = new Map<number, ComboScore[]>()
    for (const cs of comboScores) {
      if (cs.total >= matchedInHand) continue // primary level or better — skip
      const tilesAway = Math.max(0, p.roughTarget - cs.total)
      if (tilesAway > MAX_TILES_AWAY) continue
      const arr = byTotal.get(cs.total) ?? []
      arr.push(cs)
      byTotal.set(cs.total, arr)
    }

    const tierEntries: SuggestedHandLine[] = []
    for (const [total, tierCombos] of [...byTotal.entries()].sort((a, b) => b[0] - a[0])) {
      const tierNeeded = Math.max(0, p.roughTarget - total)
      // Sort within tier: by base ascending, then perm lexicographically.
      const sorted = [...tierCombos].sort((a, b) =>
        a.base !== b.base ? a.base - b.base : a.perm.join('').localeCompare(b.perm.join('')),
      )
      tierEntries.push({
        id: p.id,
        title: p.title,
        titleSegments: p.titleSegments,
        matchedInHand: total,
        tilesNeededRough: tierNeeded,
        wallRemaining,
        visibleDeadMatches,
        pressure: pressureLabel(tierNeeded, wallRemaining),
        note,
        section: p.section,
        points: p.points,
        closed: p.closed,
        cardLineNumber: cardLineNumbers.get(p.id) ?? 1,
        consecRanksTier: { combos: sorted.map((c) => ({ perm: c.perm, base: c.base })) },
      })
    }

    return [primary, ...tierEntries]
  })

  rows.sort((a, b) => {
    if (b.matchedInHand !== a.matchedInHand) return b.matchedInHand - a.matchedInHand
    if (a.tilesNeededRough !== b.tilesNeededRough) {
      return a.tilesNeededRough - b.tilesNeededRough
    }
    return a.visibleDeadMatches - b.visibleDeadMatches
  })

  return rows
}

/** Best “tiles away” across all surviving practice lines for this seat (0 = could declare on card). */
export function summarizeRackTowardWin(input: RankSuggestedHandsInput): {
  bestTilesAway: number
  closestLine: SuggestedHandLine | null
} {
  const { bestTilesAway, linesAtMin } = suggestedHandsTiedAtBest(input)
  if (!linesAtMin.length) return { bestTilesAway: 14, closestLine: null }
  return { bestTilesAway, closestLine: linesAtMin[0]! }
}
