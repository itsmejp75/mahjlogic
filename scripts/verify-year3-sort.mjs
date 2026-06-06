import { NMJL_2026_PATTERNS } from '../src/card/nmjl2026Patterns.ts'
import { setActiveCardPatterns } from '../src/card/activeCardPatternsScope.ts'

setActiveCardPatterns(NMJL_2026_PATTERNS)

// Import after setActive so internal defaults see league book if any init reads it
const { sortHandForSuggestedPattern, greedyPatternMatchDetail } = await import(
  '../src/analysis/suggestedHands.ts'
)

const ti = (def, id) => ({ id, def })
const label = (t) => {
  if (!t) return '_'
  const d = t.def
  if (d.cat === 'flower') return `F${d.flower ?? ''}`
  if (d.cat === 'dragon') return d.dragon === 'soap' ? '0' : d.dragon
  if (d.cat === 'suit') return `${d.rank}${d.suit[0].toUpperCase()}`
  return '?'
}

const p = NMJL_2026_PATTERNS.find((x) => x.title.includes('FFF 2026 222 6666'))
const hand = [
  ti({ cat: 'flower', flower: 3 }, 'f1'),
  ti({ cat: 'flower', flower: 4 }, 'f2'),
  ti({ cat: 'suit', suit: 'bam', rank: 2 }, '2b'),
  ti({ cat: 'dragon', dragon: 'soap' }, 'soap'),
  ti({ cat: 'suit', suit: 'dot', rank: 6 }, '6d'),
  ti({ cat: 'suit', suit: 'bam', rank: 6 }, '6b'),
  ti({ cat: 'suit', suit: 'dot', rank: 4 }, '4d'),
  ti({ cat: 'suit', suit: 'dot', rank: 5 }, '5d'),
]

const rankInput = {
  hand,
  wallRemaining: 50,
  discards: [],
  exposures: [],
  patterns: NMJL_2026_PATTERNS,
}

const sorted = sortHandForSuggestedPattern(hand, p.id, rankInput)
console.log('app-like sort:', sorted.map(label).join(' '))

const detail = greedyPatternMatchDetail(hand, p)
console.log(
  'greedy usedOrder:',
  detail.usedOrder.map((id) => label(hand.find((t) => t.id === id))),
)

const i6b = sorted.findIndex((t) => t.id === '6b')
const i6d = sorted.findIndex((t) => t.id === '6d')
const iSoap = sorted.findIndex((t) => t.id === 'soap')
console.log('6b after soap:', i6b > iSoap ? 'OK' : 'FAIL')
console.log('6b before 6d:', i6b < i6d ? 'OK' : 'FAIL')
