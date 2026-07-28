#!/usr/bin/env node
/**
 * Rasterize a square app icon PNG (PWA + Capacitor Android / iOS).
 * App icons only — does not touch favicon PNGs/SVG (use `npm run icon:favicon`).
 *
 * Usage: node scripts/rasterize-icon-from-png.mjs [path/to/icon.png]
 * Default: src/assets/mahjlogic-app-icon.png
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const srcPath = path.resolve(process.argv[2] ?? path.join(root, 'src', 'assets', 'mahjlogic-app-icon.png'))
const masterPng = path.join(root, '.tmp-app-icon-master.png')
/** Padding on each edge (percent of canvas). Env `ICON_SAFE_INSET_PERCENT` overrides. */
const SAFE_INSET_PERCENT = Number(process.env.ICON_SAFE_INSET_PERCENT ?? 8)
const OUT_SIZE = 1024
const BG = [13, 21, 34] /* #0d1522 Abyss — matches SVG app-icon raster canvas */

function sipsZ(w, h, input, output) {
  execFileSync('sips', ['-z', String(h), String(w), input, '--out', output], { stdio: 'inherit' })
}

function buildMaster() {
  if (!fs.existsSync(srcPath)) {
    console.error('rasterize-icon-from-png: missing', srcPath)
    process.exit(1)
  }
  const py = `
import sys
from PIL import Image

src = sys.argv[1]
out = sys.argv[2]
inset = float(sys.argv[3]) / 100.0
size = int(sys.argv[4])
r, g, b = (int(x) for x in sys.argv[5].split(","))

img = Image.open(src).convert("RGBA")
canvas = Image.new("RGB", (size, size), (r, g, b))
usable = 1.0 - 2.0 * inset
inner_w = size * usable
inner_h = size * usable
scale = min(inner_w / img.width, inner_h / img.height)
nw = max(1, round(img.width * scale))
nh = max(1, round(img.height * scale))
resized = img.resize((nw, nh), Image.Resampling.LANCZOS)
x = (size - nw) // 2
y = (size - nh) // 2
canvas.paste(resized, (x, y), resized)
canvas.save(out, optimize=True)
`
  execFileSync(
    'python3',
    [
      '-c',
      py.trim(),
      srcPath,
      masterPng,
      String(SAFE_INSET_PERCENT),
      String(OUT_SIZE),
      BG.join(','),
    ],
    { stdio: 'inherit' },
  )
  console.log('rasterize-icon-from-png: wrote', masterPng)
}

function main() {
  buildMaster()

  sipsZ(192, 192, masterPng, path.join(root, 'public', 'icon-192.png'))
  sipsZ(180, 180, masterPng, path.join(root, 'public', 'apple-touch-icon.png'))
  sipsZ(512, 512, masterPng, path.join(root, 'public', 'icon-512.png'))
  fs.copyFileSync(
    masterPng,
    path.join(root, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset', 'AppIcon-512@2x.png'),
  )

  const androidRoot = path.join(root, 'android', 'app', 'src', 'main', 'res')
  const fg = [
    ['mipmap-mdpi', 108],
    ['mipmap-hdpi', 162],
    ['mipmap-xhdpi', 216],
    ['mipmap-xxhdpi', 324],
    ['mipmap-xxxhdpi', 432],
  ]
  for (const [dir, size] of fg) {
    sipsZ(size, size, masterPng, path.join(androidRoot, dir, 'ic_launcher_foreground.png'))
  }
  const legacy = [
    ['mipmap-mdpi', 48],
    ['mipmap-hdpi', 72],
    ['mipmap-xhdpi', 96],
    ['mipmap-xxhdpi', 144],
    ['mipmap-xxxhdpi', 192],
  ]
  for (const [dir, size] of legacy) {
    const base = path.join(androidRoot, dir)
    sipsZ(size, size, masterPng, path.join(base, 'ic_launcher.png'))
    sipsZ(size, size, masterPng, path.join(base, 'ic_launcher_round.png'))
  }

  fs.unlinkSync(masterPng)
  console.log('rasterize-icon-from-png: done.')
}

main()
