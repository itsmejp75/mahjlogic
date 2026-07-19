/**
 * Packs NMJL card CSVs into opaque payloads for the client bundle.
 * Source CSV stays in git for editing; production JS never embeds the CSV as plaintext.
 *
 * Run: node scripts/encrypt-nmjl-card.mjs
 * (also via npm prebuild / pretest)
 */
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

/** Must match `NMJL_CARD_PAYLOAD_KEY_MATERIAL` in `src/card/nmjlCardPayloadCrypto.ts`. */
const KEY_MATERIAL = 'mahjlogic.nmjl-card.payload.v1'

/** League years packed into the client bundle. */
const YEARS = ['2025', '2026']

function xorBytes(data, key) {
  const out = Buffer.alloc(data.length)
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i] ^ key[i % key.length]
  }
  return out
}

function mixKey(key, salt) {
  const saltPad = Buffer.alloc(key.length)
  for (let i = 0; i < saltPad.length; i++) saltPad[i] = salt[i % salt.length]
  return xorBytes(key, saltPad)
}

function packYear(year) {
  const csvPath = join(root, `src/card/data/${year}-nmjl-card.csv`)
  const outPath = join(root, `src/card/data/${year}-nmjl-card.payload.json`)
  const csv = readFileSync(csvPath)
  const key = createHash('sha256').update(KEY_MATERIAL).digest()
  const salt = randomBytes(16)
  const mixedKey = mixKey(key, salt)
  const body = xorBytes(csv, mixedKey)
  const payload = {
    v: 1,
    s: salt.toString('base64'),
    d: body.toString('base64'),
  }
  writeFileSync(outPath, `${JSON.stringify(payload)}\n`, 'utf8')
  console.log(`Wrote ${outPath} (${csv.length} bytes → payload)`)
}

for (const year of YEARS) {
  packYear(year)
}
