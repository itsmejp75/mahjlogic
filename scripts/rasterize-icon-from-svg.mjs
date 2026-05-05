#!/usr/bin/env node
/**
 * Rasterize SVG → PNGs via Puppeteer + macOS `sips`.
 *
 * App icons (default): PWA + Capacitor — uses src/assets/mahjlogic-app-icon.svg (Mahj Logic bird+M v4;
 * matches the in-app menu chip). Tab favicon copies mahjlogic-favicon.svg (same mark + #121419 + pad).
 *
 * Tab favicon only: copies src/assets/mahjlogic-favicon.svg → public/favicon.svg (expanded
 * viewBox so the tab glyph matches install-chip padding). Raster PNG fallbacks use
 * mahjlogic-app-icon.svg + the same 7% inset as manifest icons — identical pipeline to icon-192.
 *
 * Inset: Tab favicon raster defaults match app icons (7%) so omnibox/tab PNGs align with the
 * install-chip artwork; override with FAVICON_SAFE_INSET_PERCENT. App icons: APP_ICON_SAFE_INSET_PERCENT.
 *
 * Desktop Chrome often keeps using old bitmaps for the omnibox “Open in app” chip even after you
 * regenerate PNGs. Bump the `?v=` query on manifest `icons[].src` (and `apple-touch-icon` in
 * index.html) when artwork or inset changes so clients refetch.
 *
 *   npm run icon:app
 *   npm run icon:favicon
 *   npm run icons
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const argv = process.argv.slice(2)
const faviconOnly = argv.includes('--favicon-only')
const positional = argv.filter((a) => a !== '--favicon-only')
const faviconSvgSrc = path.join(root, 'src', 'assets', 'mahjlogic-favicon.svg')
const appIconSvgSrc = path.join(root, 'src', 'assets', 'mahjlogic-app-icon.svg')
const positionalPath = positional[0]

const svgPath = path.resolve(positionalPath ?? (faviconOnly ? faviconSvgSrc : appIconSvgSrc))
/** SVG file read for Puppeteer raster (may differ from svgPath when copying padded favicon.svg). */
const rasterSvgPath = positionalPath ? svgPath : faviconOnly ? appIconSvgSrc : svgPath
const masterPng = path.join(root, '.tmp-app-icon-master.png')
/** Install / launcher PNG background (matches menu app-icon chip). */
const ICON_CANVAS_BG = '#121419'

/** Edge padding (% of 1024 master). Favicon raster defaults match app icons (7%). */
function safeInsetPercent() {
  if (faviconOnly) {
    return Number(
      process.env.FAVICON_SAFE_INSET_PERCENT ?? process.env.ICON_SAFE_INSET_PERCENT ?? 7,
    )
  }
  return Number(
    process.env.APP_ICON_SAFE_INSET_PERCENT ?? process.env.ICON_SAFE_INSET_PERCENT ?? 7,
  )
}
function sipsZ(w, h, input, output) {
  execFileSync('sips', ['-z', String(h), String(w), input, '--out', output], { stdio: 'inherit' })
}

async function rasterMaster() {
  const svg = fs.readFileSync(rasterSvgPath, 'utf8')
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
  const inset = safeInsetPercent()
  const pad = `${inset}%`
  await page.setContent(
    `<!DOCTYPE html><html><body style="margin:0;background:${ICON_CANVAS_BG};box-sizing:border-box;width:1024px;height:1024px;padding:${pad};display:flex;align-items:center;justify-content:center;">
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
  if (!fs.existsSync(rasterSvgPath)) {
    console.error('rasterize-icon-from-svg: missing raster source', rasterSvgPath)
    process.exit(1)
  }
  if (faviconOnly) {
    fs.copyFileSync(svgPath, path.join(root, 'public', 'favicon.svg'))
    console.log('rasterize-icon-from-svg: copied public/favicon.svg from', svgPath)
  }

  await rasterMaster()

  if (faviconOnly) {
    sipsZ(32, 32, masterPng, path.join(root, 'public', 'favicon-32.png'))
    sipsZ(16, 16, masterPng, path.join(root, 'public', 'favicon-16.png'))
  } else {
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
  }

  fs.unlinkSync(masterPng)
  console.log('rasterize-icon-from-svg: done.')
}

await main()
