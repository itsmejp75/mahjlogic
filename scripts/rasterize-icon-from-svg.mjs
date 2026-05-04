#!/usr/bin/env node
/**
 * Rasterize a square app icon SVG to PNGs (PWA + Capacitor Android / iOS).
 * Uses Puppeteer (already a devDependency) when ImageMagick/rsvg are unavailable.
 *
 * Usage: node scripts/rasterize-icon-from-svg.mjs [path/to/icon.svg]
 * Default: src/assets/mahjlogic-icon-logo.svg
 *
 * Inset: macOS Dock / iOS use a squircle mask; artwork that touches the square’s edges reads as
 * “clipped” vs phone icons (adaptive-icon safe zone, different chrome). We letterbox with a
 * small inset so the mark stays clear of the rounded mask while remaining readable on mobile.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const svgPath = path.resolve(process.argv[2] ?? path.join(root, 'src', 'assets', 'mahjlogic-icon-logo.svg'))
const masterPng = path.join(root, '.tmp-app-icon-master.png')
/** Padding on each edge of the raster (percent of canvas). Increase if Dock still clips corners. */
const SAFE_INSET_PERCENT = Number(process.env.ICON_SAFE_INSET_PERCENT ?? 8)

function sipsZ(w, h, input, output) {
  execFileSync('sips', ['-z', String(h), String(w), input, '--out', output], { stdio: 'inherit' })
}

async function rasterMaster() {
  const svg = fs.readFileSync(svgPath, 'utf8')
  const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  const chromeCandidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter(Boolean)
  const executablePath = chromeCandidates.find((p) => {
    try {
      fs.accessSync(p, fs.constants.X_OK)
      return true
    } catch {
      return false
    }
  })
  const browser = await puppeteer.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 1 })
  const pad = `${SAFE_INSET_PERCENT}%`
  await page.setContent(
    `<!DOCTYPE html><html><body style="margin:0;background:#1a1a1a;box-sizing:border-box;width:1024px;height:1024px;padding:${pad};display:flex;align-items:center;justify-content:center;">
<img src="${dataUrl}" alt="" style="width:100%;height:100%;object-fit:contain;object-position:center center"/></body></html>`,
    { waitUntil: 'networkidle0' },
  )
  await new Promise((r) => setTimeout(r, 150))
  await page.screenshot({
    path: masterPng,
    clip: { x: 0, y: 0, width: 1024, height: 1024 },
    type: 'png',
  })
  await browser.close()
  console.log('rasterize-icon-from-svg: wrote', masterPng)
}

async function main() {
  if (!fs.existsSync(svgPath)) {
    console.error('rasterize-icon-from-svg: missing', svgPath)
    process.exit(1)
  }
  await rasterMaster()

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
  console.log('rasterize-icon-from-svg: done.')
}

await main()
