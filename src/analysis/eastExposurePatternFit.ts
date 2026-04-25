import type { TileDef, TileInstance } from '../mahjong/types'
import { suitPermutations } from '../card/nmjlSuitSlots'
import { PRACTICE_PATTERNS, type PatternGroup, type PracticePattern } from '../card/practicePatterns'

type Suit = 'bam' | 'dot' | 'crak'
const SUITS: Suit[] = ['bam', 'dot', 'crak']
const DRAGONS = ['red', 'green', 'soap'] as const

function keyFromDef(def: TileDef): string {
  if (def.cat === 'suit') return `s:${def.suit}:${def.rank}`
  if (def.cat === 'wind') return `w:${def.wind}`
  if (def.cat === 'dragon') return `d:${def.dragon}`
  if (def.cat === 'flower') return 'flower'
  return 'joker'
}

function inc(m: Map<string, number>, k: string, v: number) {
  m.set(k, (m.get(k) ?? 0) + v)
}

function mergeCap(base: Map<string, number>, delta: Map<string, number>): Map<string, number> {
  const out = new Map(base)
  for (const [k, v] of delta) inc(out, k, v)
  return out
}

function aggregateExposureKeys(defs: TileDef[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const d of defs) {
    if (d.cat === 'joker') continue
    const k = keyFromDef(d)
    inc(m, k, 1)
  }
  return m
}

function exposureFitsCap(exp: Map<string, number>, cap: Map<string, number>): boolean {
  for (const [k, v] of exp) {
    if (v > (cap.get(k) ?? 0)) return false
  }
  return true
}

/**
 * Expand jokers in each exposure meld using the majority concrete tile (NMJL-style).
 * Omits jokers that cannot be anchored.
 */
function normalizeExposureTiles(exposures: ReadonlyArray<{ tiles: TileInstance[] }>): TileDef[] {
  const out: TileDef[] = []
  for (const exp of exposures) {
    const tiles = exp.tiles
    const nonJ = tiles.filter((t) => t.def.cat !== 'joker')
    const jokers = tiles.filter((t) => t.def.cat === 'joker')
    if (nonJ.length === 0) {
      continue
    }
    const f = nonJ[0]!.def
    if (f.cat === 'suit') {
      const ok = nonJ.every(
        (t) => t.def.cat === 'suit' && t.def.suit === f.suit && t.def.rank === f.rank,
      )
      if (!ok) continue
      for (const t of nonJ) out.push(t.def)
      for (let j = 0; j < jokers.length; j++) {
        out.push({ cat: 'suit', suit: f.suit, rank: f.rank })
      }
      continue
    }
    if (f.cat === 'wind') {
      const ok = nonJ.every((t) => t.def.cat === 'wind' && t.def.wind === f.wind)
      if (!ok) continue
      for (const t of nonJ) out.push(t.def)
      for (let j = 0; j < jokers.length; j++) out.push({ cat: 'wind', wind: f.wind })
      continue
    }
    if (f.cat === 'dragon') {
      const ok = nonJ.every((t) => t.def.cat === 'dragon' && t.def.dragon === f.dragon)
      if (!ok) continue
      for (const t of nonJ) out.push(t.def)
      for (let j = 0; j < jokers.length; j++) {
        out.push({ cat: 'dragon', dragon: f.dragon })
      }
      continue
    }
    if (f.cat === 'flower') {
      for (const t of nonJ) out.push(t.def)
    }
  }
  return out
}

function dragonForSuit(s: Suit): (typeof DRAGONS)[number] {
  if (s === 'bam') return 'green'
  if (s === 'dot') return 'soap'
  return 'red'
}

const opposingForSuit: Record<Suit, [typeof DRAGONS[number], typeof DRAGONS[number]]> = {
  bam: ['soap', 'red'],
  dot: ['green', 'red'],
  crak: ['green', 'soap'],
}

function isDragonRankGroup(g: PatternGroup): g is Extract<PatternGroup, { kind: 'rank' }> {
  return (
    g.kind === 'rank' &&
    g.test({ cat: 'dragon', dragon: 'red' }) &&
    g.test({ cat: 'dragon', dragon: 'green' }) &&
    g.test({ cat: 'dragon', dragon: 'soap' })
  )
}

function dragonsPassing(test: (d: TileDef) => boolean): (typeof DRAGONS)[number][] {
  return DRAGONS.filter((d) => test({ cat: 'dragon', dragon: d }))
}

function branchesForFixed(g: Extract<PatternGroup, { kind: 'fixed' }>): Map<string, number>[] {
  const { need, test } = g
  const flowerDef: TileDef = { cat: 'flower', flower: 1 }
  if (test(flowerDef)) return [new Map([['flower', need]])]

  const winds: TileDef[] = [
    { cat: 'wind', wind: 'N' },
    { cat: 'wind', wind: 'E' },
    { cat: 'wind', wind: 'W' },
    { cat: 'wind', wind: 'S' },
  ]
  for (const w of winds) {
    if (test(w)) return [new Map([[keyFromDef(w), need]])]
  }

  const ds = dragonsPassing(test)
  if (ds.length) return ds.map((d) => new Map([[`d:${d}`, need]]))
  return []
}

function branchesForRank(g: Extract<PatternGroup, { kind: 'rank' }>): Map<string, number>[] {
  const ds = dragonsPassing(g.test)
  if (ds.length) return ds.map((d) => new Map([[`d:${d}`, g.need]]))
  return []
}

function branchesSharedRankSuits(
  g: Extract<PatternGroup, { kind: 'shared-rank-suits' }>,
): Map<string, number>[] {
  const n = g.needs.length
  if (n < 2 || n > 3) return []
  const out: Map<string, number>[] = []
  for (let rank = 1; rank <= 9; rank++) {
    for (const perm of suitPermutations(n)) {
      let ok = true
      const m = new Map<string, number>()
      for (let i = 0; i < n; i++) {
        const def: TileDef = { cat: 'suit', suit: perm[i]!, rank }
        if (!g.test(def)) {
          ok = false
          break
        }
        inc(m, keyFromDef(def), g.needs[i]!)
      }
      if (ok) out.push(m)
    }
  }
  return out
}

function branchesSuitLockedRank(
  g: Extract<PatternGroup, { kind: 'suit-locked-rank' }>,
): Map<string, number>[] {
  const out: Map<string, number>[] = []
  for (const s of SUITS) {
    for (let rank = 1; rank <= 9; rank++) {
      const def: TileDef = { cat: 'suit', suit: s, rank }
      if (!g.test(def)) continue
      out.push(new Map([[keyFromDef(def), g.need]]))
    }
  }
  return out
}

function branchesSuitLocked(g: Extract<PatternGroup, { kind: 'suit-locked' }>): Map<string, number>[] {
  const out: Map<string, number>[] = []
  for (const s of SUITS) {
    const m = new Map<string, number>()
    for (const { rank, need } of g.rankNeeds) {
      inc(m, `s:${s}:${rank}`, need)
    }
    if (g.dragonCount > 0) {
      inc(m, `d:${dragonForSuit(s)}`, g.dragonCount)
    }
    if (g.opposingDragons) {
      const [d1, d2] = opposingForSuit[s]
      inc(m, `d:${d1}`, g.opposingDragons.need)
      inc(m, `d:${d2}`, g.opposingDragons.need)
    }
    out.push(m)
  }
  return out
}

/** All (a,b,c) with a+b+c = total and a,b,c >= 0. */
function suitCountTriples(total: number): [number, number, number][] {
  const out: [number, number, number][] = []
  for (let a = 0; a <= total; a++) {
    for (let b = 0; b <= total - a; b++) {
      out.push([a, b, total - a - b])
    }
  }
  return out
}

/**
 * Two consecutive ranks, `need1` + `need2` suit tiles (any suit per tile, like `computeGroupMatch` consec).
 */
function branchesForConsec(g: Extract<PatternGroup, { kind: 'consec' }>): Map<string, number>[] {
  const out: Map<string, number>[] = []
  for (let r = 1; r <= 8; r++) {
    for (const p1 of suitCountTriples(g.need1)) {
      for (const p2 of suitCountTriples(g.need2)) {
        const m = new Map<string, number>()
        let ok = true
        for (let si = 0; si < SUITS.length; si++) {
          const s = SUITS[si]!
          const n1 = p1[si]!
          const n2 = p2[si]!
          if (n1 > 0) {
            const def: TileDef = { cat: 'suit', suit: s, rank: r }
            if (!g.test(def)) {
              ok = false
              break
            }
            inc(m, keyFromDef(def), n1)
          }
          if (n2 > 0) {
            const def: TileDef = { cat: 'suit', suit: s, rank: r + 1 }
            if (!g.test(def)) {
              ok = false
              break
            }
            inc(m, keyFromDef(def), n2)
          }
        }
        if (ok) out.push(m)
      }
    }
  }
  return out
}

function branchesSuitLockedConsec(
  g: Extract<PatternGroup, { kind: 'suit-locked-consec' }>,
): Map<string, number>[] {
  const out: Map<string, number>[] = []
  const maxStart = 10 - g.numGroups
  for (const s of SUITS) {
    for (let start = 1; start <= maxStart; start++) {
      const m = new Map<string, number>()
      for (let i = 0; i < g.numGroups; i++) {
        inc(m, `s:${s}:${start + i}`, g.rankCount)
      }
      if (g.dragonCount > 0) {
        inc(m, `d:${dragonForSuit(s)}`, g.dragonCount)
      }
      out.push(m)
    }
  }
  return out
}

function branchesSuitLockedConsecMulti(
  g: Extract<PatternGroup, { kind: 'suit-locked-consec-multi' }>,
): Map<string, number>[] {
  const n = g.needs.length
  const maxStart = 10 - n
  const out: Map<string, number>[] = []
  for (const s of SUITS) {
    for (let start = 1; start <= maxStart; start++) {
      const m = new Map<string, number>()
      let ok = true
      for (let i = 0; i < n; i++) {
        const rank = start + i
        const def: TileDef = { cat: 'suit', suit: s, rank }
        if (!g.test(def)) {
          ok = false
          break
        }
        inc(m, keyFromDef(def), g.needs[i]!)
      }
      if (ok) out.push(m)
    }
  }
  return out
}

function branchesSuitPermute(
  g: Extract<PatternGroup, { kind: 'suit-permute' }>,
): Map<string, number>[] {
  const n = g.colorGroups.length
  const out: Map<string, number>[] = []
  for (const perm of suitPermutations(n)) {
    const m = new Map<string, number>()
    for (let ci = 0; ci < n; ci++) {
      const s = perm[ci]!
      for (const sg of g.colorGroups[ci]!) {
        const def: TileDef = { cat: 'suit', suit: s, rank: sg.rank }
        inc(m, keyFromDef(def), sg.need)
      }
    }
    out.push(m)
  }
  return out
}

function branchesForGroup(g: PatternGroup): Map<string, number>[] {
  switch (g.kind) {
    case 'fixed':
      return branchesForFixed(g)
    case 'rank':
      return branchesForRank(g)
    case 'shared-rank-suits':
      return branchesSharedRankSuits(g)
    case 'suit-locked-rank':
      return branchesSuitLockedRank(g)
    case 'consec':
      return branchesForConsec(g)
    case 'suit-locked':
      return branchesSuitLocked(g)
    case 'suit-locked-consec':
      return branchesSuitLockedConsec(g)
    case 'suit-locked-consec-multi':
      return branchesSuitLockedConsecMulti(g)
    case 'suit-permute':
      return branchesSuitPermute(g)
    default:
      return []
  }
}

/** Two consecutive NMJL “DDDD / DDDD” style dragon kongs must be different types. */
function pairedDistinctDragonKongs(
  groups: PatternGroup[],
  i: number,
): { deltas: Map<string, number>[]; consume: 2 } | null {
  const a = groups[i]
  const b = groups[i + 1]
  if (!a || !b) return null
  if (!isDragonRankGroup(a) || !isDragonRankGroup(b)) return null
  if (a.need !== 4 || b.need !== 4) return null
  const deltas: Map<string, number>[] = []
  for (const d1 of dragonsPassing(a.test)) {
    for (const d2 of dragonsPassing(b.test)) {
      if (d1 === d2) continue
      deltas.push(
        new Map([
          [`d:${d1}`, 4],
          [`d:${d2}`, 4],
        ]),
      )
    }
  }
  return deltas.length ? { deltas, consume: 2 } : null
}

function enumerateTotalCaps(groups: PatternGroup[]): Map<string, number>[] {
  const caps: Map<string, number>[] = []

  function dfs(i: number, cap: Map<string, number>) {
    if (i >= groups.length) {
      caps.push(cap)
      return
    }
    const pair = pairedDistinctDragonKongs(groups, i)
    if (pair) {
      for (const d of pair.deltas) {
        dfs(i + pair.consume, mergeCap(cap, d))
      }
      return
    }
    const choices = branchesForGroup(groups[i]!)
    if (choices.length === 0) return
    for (const d of choices) {
      dfs(i + 1, mergeCap(cap, d))
    }
  }

  dfs(0, new Map())
  return caps
}

/**
 * Each individual exposed meld has a locked size (pung=3, kong=4, quint=5).
 * Return true if every (tileKey, meldSize) pair from this single meld has an
 * exact-count match in some branch of some group in the pattern.
 *
 * This prevents a pung of 3 from satisfying a kong group of 4 — the meld is
 * locked on the table and cannot be extended.
 */
function eachMeldHasExactGroupMatch(
  exposures: ReadonlyArray<{ tiles: TileInstance[] }>,
  groups: PatternGroup[],
): boolean {
  for (const exposure of exposures) {
    const meldDefs = normalizeExposureTiles([exposure])
    if (meldDefs.length === 0) continue
    const meldMap = aggregateExposureKeys(meldDefs)
    for (const [key, count] of meldMap) {
      let found = false
      outer: for (const g of groups) {
        for (const branch of branchesForGroup(g)) {
          if ((branch.get(key) ?? 0) === count) {
            found = true
            break outer
          }
        }
      }
      if (!found) return false
    }
  }
  return true
}

/**
 * True when every tile in these discard-claim melds can sit on some NMJL-valid embedding
 * of this practice pattern (East or any other seat), AND each individual meld's locked
 * size exactly matches a group in the pattern (a pung of 3 cannot satisfy a kong of 4).
 */
export function claimMeldsFitPracticePattern(
  pat: PracticePattern,
  exposures: ReadonlyArray<{ tiles: TileInstance[] }>,
): boolean {
  if (!exposures.length) return true
  const defs = normalizeExposureTiles(exposures)
  if (defs.length === 0) return true

  if (!pat.groups) {
    return defs.every((d) => pat.matches(d))
  }

  // Check 1 — aggregate tile counts fit within some valid instantiation of the pattern.
  const exp = aggregateExposureKeys(defs)
  const caps = enumerateTotalCaps(pat.groups)
  if (caps.length === 0) return false
  if (!caps.some((cap) => exposureFitsCap(exp, cap))) return false

  // Check 2 — each individual meld's locked size must exactly match a group.
  // e.g. an exposed pung (3) of flowers cannot satisfy a kong group (4) even
  // though 3 ≤ 4 passes the aggregate check above.
  return eachMeldHasExactGroupMatch(exposures, pat.groups)
}

/**
 * True if these open-claim melds (one seat, including jokers as normalized in
 * `claimMeldsFitPracticePattern`) can all come from at least one **non–closed** book
 * line on the practice card — the same family of lines `rankSuggestedHands` considers
 * when the player (or a bot) has table exposures. Used to block bot calls that
 * would combine into melds that no real card hand can contain together.
 */
export function openClaimMeldsFitSomePracticeLine(
  melds: ReadonlyArray<{ tiles: TileInstance[] }>,
): boolean {
  if (melds.length === 0) return true
  return PRACTICE_PATTERNS.some((p) => {
    if (p.closed) return false
    return claimMeldsFitPracticePattern(p, melds)
  })
}
