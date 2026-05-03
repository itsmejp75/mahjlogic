#!/usr/bin/env node
/**
 * Rasterize splash artwork SVG → `src/assets/Splash page - MahjLogic.png` (then run `sync-splash-native.sh`).
 * Matches `build-ios-splash-image.py` max side (2048) for JPEG quality headroom.
 *
 * Usage: node scripts/rasterize-splash-from-svg.mjs [path/to/splash.svg]
 * Default: src/assets/splash-logo-master.svg
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const svgPath = path.resolve(process.argv[2] ?? path.join(root, 'src', 'assets', 'splash-logo-master.svg'))
const outPng = path.join(root, 'src', 'assets', 'Splash page - MahjLogic.png')
const PX = 2048

async function main() {
  if (!fs.existsSync(svgPath)) {
    console.error('rasterize-splash-from-svg: missing', svgPath)
    process.exit(1)
  }
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
  await page.setViewport({ width: PX, height: PX, deviceScaleFactor: 1 })
  await page.setContent(
    `<!DOCTYPE html><html><body style="margin:0;background:#1a1a1a;display:flex;align-items:center;justify-content:center;width:${PX}px;height:${PX}px;">
<img src="${dataUrl}" alt="" width="${PX}" height="${PX}" style="width:100%;height:100%;object-fit:contain"/></body></html>`,
    { waitUntil: 'networkidle0' },
  )
  await new Promise((r) => setTimeout(r, 200))
  await page.screenshot({
    path: outPng,
    clip: { x: 0, y: 0, width: PX, height: PX },
    type: 'png',
  })
  await browser.close()
  console.log('rasterize-splash-from-svg: wrote', outPng)
}

await main()
