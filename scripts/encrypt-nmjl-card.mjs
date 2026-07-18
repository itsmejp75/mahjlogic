/**
 * Packs `src/card/data/2026-nmjl-card.csv` into an opaque payload for the client bundle.
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
const csvPath = join(root, 'src/card/data/2026-nmjl-card.csv')
const outPath = join(root, 'src/card/data/2026-nmjl-card.payload.json')

/** Must match `NMJL_CARD_PAYLOAD_KEY_MATERIAL` in `src/card/nmjlCardPayloadCrypto.ts`. */
const KEY_MATERIAL = 'mahjlogic.nmjl-card.payload.v1'

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
