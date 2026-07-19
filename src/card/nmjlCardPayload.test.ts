import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { decodeNmjlCardPayload, type NmjlCardPayloadV1 } from './nmjlCardPayloadCrypto'
import { loadNmjl2025CsvText } from './nmjl2025CardPayload'
import { NMJL_2025_PATTERNS } from './nmjl2025Patterns'
import { loadNmjl2026CsvText } from './nmjl2026CardPayload'
import { NMJL_2026_PATTERNS } from './nmjl2026Patterns'
import { PLAYABLE_CARD_IDS, patternsForCard } from './cardCatalog'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

describe('NMJL card payload', () => {
  it('decodes 2026 to the source CSV', () => {
    const payload = JSON.parse(
      readFileSync(join(root, 'src/card/data/2026-nmjl-card.payload.json'), 'utf8'),
    ) as NmjlCardPayloadV1
    const orig = readFileSync(join(root, 'src/card/data/2026-nmjl-card.csv'), 'utf8')
    expect(decodeNmjlCardPayload(payload)).toBe(orig)
    expect(loadNmjl2026CsvText()).toBe(orig)
  })

  it('decodes 2025 to the source CSV', () => {
    const payload = JSON.parse(
      readFileSync(join(root, 'src/card/data/2025-nmjl-card.payload.json'), 'utf8'),
    ) as NmjlCardPayloadV1
    const orig = readFileSync(join(root, 'src/card/data/2025-nmjl-card.csv'), 'utf8')
    expect(decodeNmjlCardPayload(payload)).toBe(orig)
    expect(loadNmjl2025CsvText()).toBe(orig)
  })

  it('builds the 2026 pattern book', () => {
    expect(NMJL_2026_PATTERNS.length).toBeGreaterThan(50)
    expect(NMJL_2026_PATTERNS.some((p) => p.id.startsWith('nmjl2026:'))).toBe(true)
  })

  it('builds the 2025 pattern book and menus it between mock and 2026', () => {
    expect(NMJL_2025_PATTERNS.length).toBeGreaterThan(40)
    expect(NMJL_2025_PATTERNS.some((p) => p.id.startsWith('nmjl2025:'))).toBe(true)
    expect([...PLAYABLE_CARD_IDS]).toEqual(['mock', '2025', '2026'])
    expect(patternsForCard('2025')).toBe(NMJL_2025_PATTERNS)
  })
})
