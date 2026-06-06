import { NMJL_2026_PATTERNS } from '../src/card/nmjl2026Patterns.ts'
import { patternLinePreviewDefs } from '../src/card/patternLinePreview.ts'

const p = NMJL_2026_PATTERNS.find((x) => x.title.includes('FFF 2026 222 6666'))
const fmt = (d) =>
  d.cat === 'suit'
    ? `${d.rank}${d.suit[0]}`
    : d.cat === 'dragon'
      ? d.dragon === 'soap'
        ? '0'
        : d.dragon[0]
      : d.cat === 'flower'
        ? 'F'
        : '?'

console.log('title segments:', p.titleSegments?.map((s) => `${s.ink}:${s.t}`))
console.log('card line preview:', patternLinePreviewDefs(p).map(fmt).join(', '))
console.log('cardLineFromGroupSlotMap:', p.cardLineFromGroupSlotMap)
