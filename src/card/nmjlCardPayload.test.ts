import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { decodeNmjlCardPayload, type NmjlCardPayloadV1 } from './nmjlCardPayloadCrypto'
import { loadNmjl2026CsvText } from './nmjl2026CardPayload'
import { NMJL_2026_PATTERNS } from './nmjl2026Patterns'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

describe('NMJL card payload', () => {
  it('decodes to the source CSV', () => {
    const payload = JSON.parse(
      readFileSync(join(root, 'src/card/data/2026-nmjl-card.payload.json'), 'utf8'),
    ) as NmjlCardPayloadV1
    const orig = readFileSync(join(root, 'src/card/data/2026-nmjl-card.csv'), 'utf8')
    expect(decodeNmjlCardPayload(payload)).toBe(orig)
    expect(loadNmjl2026CsvText()).toBe(orig)
  })

  it('builds the 2026 pattern book', () => {
    expect(NMJL_2026_PATTERNS.length).toBeGreaterThan(50)
    expect(NMJL_2026_PATTERNS.some((p) => p.id.startsWith('nmjl2026:'))).toBe(true)
  })
})
