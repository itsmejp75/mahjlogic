import puppeteer from 'puppeteer'

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox'],
})
const p = await b.newPage()
await p.setViewport({ width: 900, height: 1200, deviceScaleFactor: 2 })

for (const port of [5173, 5174, 5175]) {
  try {
    await p.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded', timeout: 8000 })
    console.log('port', port)
    break
  } catch {
    /* try next port */
  }
}

await new Promise((r) => setTimeout(r, 3000))

const step = async (label, fn) => {
  const r = await fn()
  console.log(label, JSON.stringify(r))
  return r
}

await step('popup', () =>
  p.evaluate(() => {
    const openBtn = [...document.querySelectorAll('button')].find((el) =>
      /suggested|hands/i.test(el.getAttribute('aria-label') ?? el.textContent ?? ''),
    )
    openBtn?.click()
    return !!document.querySelector('.suggested-hands-popup, .hands-panel__content')
  }),
)

await new Promise((r) => setTimeout(r, 800))

await step('tiles btn', () =>
  p.evaluate(() => {
    const tilesBtn = [...document.querySelectorAll('button')].find((el) =>
      /^tiles$/i.test(el.textContent?.trim() ?? ''),
    )
    if (!tilesBtn) return { clicked: false, labels: [...document.querySelectorAll('button')].map((b) => b.textContent?.trim()).filter(Boolean).slice(0, 30) }
    const pressed = tilesBtn.getAttribute('aria-pressed')
    if (pressed !== 'true') tilesBtn.click()
    return { clicked: true, pressed: tilesBtn.getAttribute('aria-pressed') }
  }),
)

await new Promise((r) => setTimeout(r, 2000))

await step('click rows', () =>
  p.evaluate(() => {
    const rows = [
      ...document.querySelectorAll('.hands-sheet__row-btn'),
      ...document.querySelectorAll('.hands-list__row-hit--with-tiles'),
    ]
    let best = null
    for (const row of rows.slice(0, 12)) {
      row.click()
      const cell = document.querySelector('.hands-sheet__tile-cell--suggest-best, .hands-list__pattern-tile-cell--suggest-best')
      if (cell) {
        best = { rowClass: row.className, cellClass: cell.className }
        break
      }
    }
    return {
      rowCount: rows.length,
      tileCells: document.querySelectorAll('.hands-sheet__tile-cell, .hands-list__pattern-tile-cell').length,
      dimCells: document.querySelectorAll('.hands-sheet__tile-cell--suggest-dim, .hands-list__pattern-tile-cell--suggest-dim').length,
      bestCells: document.querySelectorAll('.hands-sheet__tile-cell--suggest-best, .hands-list__pattern-tile-cell--suggest-best').length,
      best,
      detailTiles: document.querySelector('.hands-sheet--detail-tiles')?.className ?? null,
    }
  }),
)

const info = await p.evaluate(() => {
  const cell = document.querySelector('.hands-sheet__tile-cell--suggest-best, .hands-list__pattern-tile-cell--suggest-best')
  if (!cell) return { found: false }
  const after = getComputedStyle(cell, '::after')
  const rowHit = cell.closest('.hands-list__row-hit')
  const tilesGrid = cell.closest('.hands-sheet__tiles-grid, .hands-list__pattern-tiles-grid')
  const detailPad = cell.closest('.hands-sheet__cell--detail-pad')
  return {
    found: true,
    className: cell.className,
    cellOverflow: getComputedStyle(cell).overflow,
    cellZ: getComputedStyle(cell).zIndex,
    afterContent: after.content,
    afterBoxShadow: after.boxShadow,
    rowHitOverflow: rowHit ? getComputedStyle(rowHit).overflow : null,
    tilesGridOverflow: tilesGrid ? getComputedStyle(tilesGrid).overflow : null,
    detailPadOverflow: detailPad ? getComputedStyle(detailPad).overflow : null,
  }
})

console.log('shadow', JSON.stringify(info, null, 2))
await p.screenshot({ path: 'scripts/_probe-shadow.png', fullPage: false })
await b.close()
