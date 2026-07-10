import puppeteer from 'puppeteer'

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox'],
})
const p = await b.newPage()
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle0', timeout: 15000 })
await new Promise((r) => setTimeout(r, 2000))

await p.evaluate(() => {
  const tilesBtn = [...document.querySelectorAll('button')].find((el) =>
    /suggested tiles/i.test(el.getAttribute('aria-label') ?? ''),
  )
  if (tilesBtn?.getAttribute('aria-pressed') !== 'true') tilesBtn?.click()
  const logic = [...document.querySelectorAll('button')].find((el) =>
    /logic/i.test(el.getAttribute('aria-label') ?? el.textContent ?? ''),
  )
  if (logic?.getAttribute('aria-pressed') !== 'true') logic?.click()
})

await new Promise((r) => setTimeout(r, 2000))

const found = await p.evaluate(() => {
  const rows = [...document.querySelectorAll('.hands-sheet__row-btn, .hands-list__row-hit--with-tiles')]
  for (const row of rows) {
    row.click()
    const jokerCell = document.querySelector('.hands-sheet__tile-cell--suggest-joker, .hands-list__pattern-tile-cell--suggest-joker')
    if (jokerCell) {
      const cells = [...row.querySelectorAll('.hands-sheet__tile-cell, .hands-list__pattern-tile-cell')]
      return {
        title: row.textContent?.slice(0, 60),
        cells: cells.map((cell, i) => {
          const face = cell.querySelector('.tile-face')
          const cellAfter = getComputedStyle(cell, '::after')
          return {
            i,
            best: cell.className.includes('suggest-best'),
            joker: cell.className.includes('suggest-joker'),
            dim: cell.className.includes('suggest-dim'),
            faceClass: face?.className,
            cellOverflow: getComputedStyle(cell).overflow,
            cellZ: getComputedStyle(cell).zIndex,
            cellAfterShadow: cellAfter.boxShadow?.slice(0, 50),
          }
        }),
      }
    }
  }
  return null
})

console.log(JSON.stringify(found, null, 2))
await b.close()
