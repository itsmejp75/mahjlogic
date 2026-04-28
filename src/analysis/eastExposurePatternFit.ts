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
/**
 * In an open meld, each joker represents the same tile as the naturals in that meld (NMJL).
 * Returns a full rack list: `hand` tiles first (concealed jokers unchanged), then each claim-meld
 * tile, with exposure jokers replaced by concrete `TileDef`s so pattern distance / `p.matches`
 * see the stand-in tile. Tile `id`s are preserved for highlights and strip assignment.
 */
export function tileInstancesWithClaimMeldJokersResolved(
  hand: TileInstance[],
  claimMelds: ReadonlyArray<{ tiles: TileInstance[] }>,
): TileInstance[] {
  if (claimMelds.length === 0) return [...hand]
  const jokerIdToDef = new Map<string, TileDef>()
  for (const exp of claimMelds) {
    const nonJ = exp.tiles.filter((t) => t.def.cat !== 'joker')
    if (nonJ.length === 0) continue
    const f = nonJ[0]!.def
    let valid = false
    if (f.cat === 'suit') {
      valid = nonJ.every(
        (t) => t.def.cat === 'suit' && t.def.suit === f.suit && t.def.rank === f.rank,
      )
    } else if (f.cat === 'wind') {
      valid = nonJ.every((t) => t.def.cat === 'wind' && t.def.wind === f.wind)
    } else if (f.cat === 'dragon') {
      valid = nonJ.every((t) => t.def.cat === 'dragon' && t.def.dragon === f.dragon)
    }
    if (!valid) continue
    for (const t of exp.tiles) {
      if (t.def.cat === 'joker') {
        jokerIdToDef.set(t.id, f)
      }
    }
  }
  const mapOne = (t: TileInstance): TileInstance => {
    if (t.def.cat !== 'joker') return t
    const d = jokerIdToDef.get(t.id)
    return d != null ? { ...t, def: d } : t
  }
  return [...hand.map(mapOne), ...claimMelds.flatMap((e) => e.tiles.map(mapOne))]
}

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

/**
 * All ways to pick one branch map per (possibly paired) group. The merged sum
 * may collapse the same key from two groups; use this list to recover **separate**
 * (key, need) slots for meld matching.
 */
function enumerateGroupDeltaLists(groups: PatternGroup[]): Map<string, number>[][] {
  const out: Map<string, number>[][] = []

  function dfs(i: number, acc: Map<string, number>[]) {
    if (i >= groups.length) {
      out.push([...acc])
      return
    }
    const pair = pairedDistinctDragonKongs(groups, i)
    if (pair) {
      for (const d of pair.deltas) {
        dfs(i + pair.consume, [...acc, d])
      }
      return
    }
    const choices = branchesForGroup(groups[i]!)
    if (choices.length === 0) return
    for (const d of choices) {
      dfs(i + 1, [...acc, d])
    }
  }

  dfs(0, [])
  return out
}

/**
 * One (tileKey, count) per meld after joker stand-in; every natural in a table meld must
 * be the same tile, so a single key (flowers aggregate to one `flower` key).
 */
function meldKeyCount(
  exposure: { tiles: TileInstance[] },
): { key: string; count: number } | null {
  const meldDefs = normalizeExposureTiles([exposure])
  if (meldDefs.length === 0) return null
  const mm = aggregateExposureKeys(meldDefs)
  if (mm.size !== 1) return null
  const [key, count] = [...mm.entries()][0]!
  return { key, count }
}

type Slot = { key: string; need: number }

/**
 * True if we can assign each meld to a **distinct** slot (key + need) with
 * `meld.key === slot.key` and `meld.count === slot.need` — all melds use one
 * hand embedding. Slots come from the **per-group** branch maps, not a merged
 * `Map` (so two 7D pungs from two groups are two 3s, not one 6-bucket).
 */
function canMatchMeldsToSlots(sigs: { key: string; count: number }[], slots: Slot[]): boolean {
  if (sigs.length > slots.length) return false
  const used = new Array(slots.length).fill(false)
  const dfs = (i: number): boolean => {
    if (i >= sigs.length) return true
    const s = sigs[i]!
    for (let j = 0; j < slots.length; j++) {
      if (used[j]) continue
      const sl = slots[j]!
      if (s.key === sl.key && s.count === sl.need) {
        used[j] = true
        if (dfs(i + 1)) return true
        used[j] = false
      }
    }
    return false
  }
  return dfs(0)
}

function slotsFromDeltaList(deltaList: ReadonlyArray<Map<string, number>>): Slot[] {
  const out: Slot[] = []
  for (const m of deltaList) {
    for (const [key, need] of m) {
      out.push({ key, need })
    }
  }
  return out
}

/**
 * For one hand embedding (ordered group maps), every exposure matches a
 * different atomic slot; aggregate counts still fit `exposureFitsCap`.
 */
function eachMeldMatchesThisEmbedding(
  exposures: ReadonlyArray<{ tiles: TileInstance[] }>,
  merged: Map<string, number>,
  deltaList: ReadonlyArray<Map<string, number>>,
  exp: Map<string, number>,
): boolean {
  if (!exposureFitsCap(exp, merged)) return false
  const sigs: { key: string; count: number }[] = []
  for (const exposure of exposures) {
    const sig = meldKeyCount(exposure)
    if (sig == null) return false
    sigs.push(sig)
  }
  return canMatchMeldsToSlots(sigs, slotsFromDeltaList(deltaList))
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

  // Aggregate + one hand embedding: merged counts fit, and every table meld
  // matches a **distinct** atomic (key, need) from the per-group branch maps.
  // Comparing to a merged `Map` alone is wrong when two groups need the same key
  // (e.g. two 7D pungs); the old per-meld/branch check let mixed embeddings through.
  const exp = aggregateExposureKeys(defs)
  for (const deltaList of enumerateGroupDeltaLists(pat.groups)) {
    let merged = new Map<string, number>()
    for (const d of deltaList) {
      merged = mergeCap(merged, d)
    }
    if (eachMeldMatchesThisEmbedding(exposures, merged, deltaList, exp)) return true
  }
  return false
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

/**
 * Assigns each hand embedding slot (card group order) to a meld index, if possible.
 * Prefers the same key/need matching as {@link canMatchMeldsToSlots}, but recovers
 * the slot index per meld for left-to-right display order.
 */
function findMeldToSlotOrder(sigs: { key: string; count: number }[], slots: Slot[]): number[] | null {
  const n = sigs.length
  const S = slots.length
  if (n === 0) return null
  const used = new Array<boolean>(S).fill(false)
  const meldToSlot: number[] = new Array(n).fill(-1)

  function dfs(mi: number): boolean {
    if (mi === n) return true
    for (let j = 0; j < S; j++) {
      if (used[j]!) continue
      const s = sigs[mi]!
      const sl = slots[j]!
      if (s.key === sl.key && s.count === sl.need) {
        used[j] = true
        meldToSlot[mi] = j
        if (dfs(mi + 1)) return true
        used[j] = false
        meldToSlot[mi] = -1
      }
    }
    return false
  }
  if (!dfs(0)) return null
  return meldToSlot
}

/**
 * Reorder East (or any) claim-meld row to match the **left-to-right group order** of one valid
 * NMJL embedding of `pat`, using the first such embedding in {@link enumerateGroupDeltaLists} order
 * for which a meld-to-slot bijection exists. If the new order is unchanged, returns `null`.
 *
 * The caller should pick `pat` from the closest suggested hand line
 * (same as {@link rankSuggestedHands} / {@link summarizeRackTowardWin}).
 */
export function reorderEastExposuresToPatternGroupOrder(
  exposures: ReadonlyArray<{ tiles: TileInstance[] }>,
  pat: PracticePattern,
): { tiles: TileInstance[] }[] | null {
  if (exposures.length < 2) return null
  if (!pat.groups?.length) return null
  const defs = normalizeExposureTiles([...exposures])
  if (defs.length === 0) return null
  const exp = aggregateExposureKeys(defs)

  const sigs: { key: string; count: number }[] = []
  for (const exposure of exposures) {
    const sig = meldKeyCount(exposure)
    if (sig == null) return null
    sigs.push(sig)
  }

  for (const deltaList of enumerateGroupDeltaLists(pat.groups)) {
    let merged = new Map<string, number>()
    for (const d of deltaList) {
      merged = mergeCap(merged, d)
    }
    if (!exposureFitsCap(exp, merged)) continue
    if (!eachMeldMatchesThisEmbedding(exposures, merged, deltaList, exp)) continue

    const slots = slotsFromDeltaList(deltaList)
    const meldToSlot = findMeldToSlotOrder(sigs, slots)
    if (meldToSlot == null) continue

    const n = sigs.length
    const orderIdx = [...Array(n).keys()].sort((a, b) => meldToSlot[a]! - meldToSlot[b]!)
    if (orderIdx.every((i, k) => i === k)) return null
    return orderIdx.map((i) => exposures[i]!)
  }
  return null
}
