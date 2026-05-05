#!/usr/bin/env node
/**
 * Rasterize SVG → PNGs via Puppeteer + macOS `sips`.
 *
 * App icons (default): PWA + Capacitor — uses src/assets/mahjlogic-app-icon.svg (same artwork as
 * the tab favicon SVG; keep in sync with mahjlogic-favicon.svg). Raster canvas background is
 * always #1a1a1a so manifest / install UI icons match the brand chrome.
 *
 * Tab favicon only: --favicon-only uses src/assets/mahjlogic-favicon.svg; copies to
 * public/favicon.svg (typically transparent). PNG fallbacks come from the same raster step.
 *
 * Inset: Favicon defaults (FAVICON_SAFE_INSET_PERCENT) vs app (APP_ICON_SAFE_INSET_PERCENT).
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
const svgPath = path.resolve(
  positional[0] ??
    path.join(
      root,
      'src',
      'assets',
      faviconOnly ? 'mahjlogic-favicon.svg' : 'mahjlogic-app-icon.svg',
    ),
)
const masterPng = path.join(root, '.tmp-app-icon-master.png')
/** Install / launcher PNG background (matches manifest theme_color treatment). */
const ICON_CANVAS_BG = '#1a1a1a'

/** Edge padding (% of 1024 master). Favicon defaults smaller for max tab size; app inset leaves a slim margin so icons don’t kiss launcher / install-chip edges. */
function safeInsetPercent() {
  if (faviconOnly) {
    return Number(
      process.env.FAVICON_SAFE_INSET_PERCENT ?? process.env.ICON_SAFE_INSET_PERCENT ?? 2,
    )
  }
  return Number(
    process.env.APP_ICON_SAFE_INSET_PERCENT ?? process.env.ICON_SAFE_INSET_PERCENT ?? 5,
  )
}
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
  if (faviconOnly) {
    fs.copyFileSync(svgPath, path.join(root, 'public', 'favicon.svg'))
    console.log('rasterize-icon-from-svg: copied public/favicon.svg from', svgPath)
  }

  await rasterMaster()

  if (faviconOnly) {
    sipsZ(32, 32, masterPng, path.join(root, 'public', 'favicon-32.png'))
    sipsZ(16, 16, masterPng, path.join(root, 'public', 'favicon-16.png'))
  } else {
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
