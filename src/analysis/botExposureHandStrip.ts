import type { TileDef, TileInstance } from '../mahjong/types'

export type ExposureMeld = { tiles: TileInstance[] }

function defKey(def: TileDef): string {
  if (def.cat === 'suit') return `s:${def.suit}:${def.rank}`
  if (def.cat === 'dragon') return `d:${def.dragon}`
  if (def.cat === 'wind') return `w:${def.wind}`
  if (def.cat === 'flower') return 'flower'
  if (def.cat === 'joker') return 'joker'
  return def.cat
}

/**
 * One concrete tile key + size for an open claim meld (jokers stand in as the natural).
 * Same idea as eastExposurePatternFit’s meld signature.
 */
export function exposureMeldSignature(
  meld: ExposureMeld,
): { key: string; count: number; def: TileDef } | null {
  const naturals = meld.tiles.filter((t) => t.def.cat !== 'joker')
  if (naturals.length === 0) return null
  const anchor = naturals[0]!.def
  const key = defKey(anchor)
  if (!naturals.every((t) => defKey(t.def) === key)) return null
  return { key, count: meld.tiles.length, def: anchor }
}

type PrintedRun = { start: number; end: number; key: string }

/** Maximal contiguous runs of the same printed tile key (card-line meld boundaries). */
function printedMeldRuns(defs: readonly TileDef[]): PrintedRun[] {
  const runs: PrintedRun[] = []
  let i = 0
  while (i < defs.length) {
    const key = defKey(defs[i]!)
    const start = i
    i++
    while (i < defs.length && defKey(defs[i]!) === key) i++
    runs.push({ start, end: i, key })
  }
  return runs
}

function runAcceptsExposure(run: PrintedRun, exposureKey: string): boolean {
  if (run.key === exposureKey) return true
  // Matching / any dragons: a green pung may sit on a DDD printed as another dragon ink.
  if (exposureKey.startsWith('d:') && run.key.startsWith('d:')) return true
  return false
}

/**
 * Place each exposed meld on the best **printed** card-line meld of the same size.
 * Uses same-key runs from the preview (DDD vs DDDD stay separate) so a pung cannot park on
 * the last three tiles of a kong just because every dragon cell “accepts” it.
 */
export function placeExposureMeldsOnCardLine(
  defs: readonly TileDef[],
  melds: readonly ExposureMeld[],
): { defs: TileDef[]; meldRunId: Array<number | null> } {
  const outDefs = [...defs]
  const meldRunId: Array<number | null> = defs.map(() => null)
  const takenRuns = new Set<number>()

  melds.forEach((meld, meldIdx) => {
    const sig = exposureMeldSignature(meld)
    if (!sig) return
    const { key, count, def } = sig
    const runs = printedMeldRuns(outDefs)

    let bestRunIdx = -1
    let bestScore = -1
    for (let ri = 0; ri < runs.length; ri++) {
      if (takenRuns.has(ri)) continue
      const run = runs[ri]!
      const len = run.end - run.start
      if (len !== count) continue
      if (!runAcceptsExposure(run, key)) continue
      // Exact printed type wins over a matching-dragon stand-in of the same size.
      const score = run.key === key ? 200 : 100
      if (score > bestScore) {
        bestScore = score
        bestRunIdx = ri
      }
    }
    if (bestRunIdx < 0) return
    takenRuns.add(bestRunIdx)
    const run = runs[bestRunIdx]!
    for (let i = run.start; i < run.end; i++) {
      outDefs[i] = def
      meldRunId[i] = meldIdx
    }
  })

  return { defs: outDefs, meldRunId }
}
