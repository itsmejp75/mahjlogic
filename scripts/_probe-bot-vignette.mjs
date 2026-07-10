import puppeteer from 'puppeteer'

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox'],
})
const p = await b.newPage()
await p.setViewport({ width: 1400, height: 900 })
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle0', timeout: 20000 })
await new Promise((r) => setTimeout(r, 2000))

const data = await p.evaluate(() => {
  const sample = (face) => {
    if (!face) return null
    const before = getComputedStyle(face, '::before')
    const slot = face.closest('.exposure-rack__slot, .sortable-tile-wrap')
    const slotAfter = slot ? getComputedStyle(slot, '::after') : null
    return {
      faceClass: face.className,
      slotSuggest: slot?.className?.match(/suggest-\w+/g) ?? [],
      rackTileW: getComputedStyle(face).getPropertyValue('--rack-tile-w').trim(),
      beforeContent: before.content,
      beforeOpacity: before.opacity,
      beforeDisplay: before.display,
      beforeBgCount: before.backgroundImage?.split(',').length,
      beforeBoxShadow: before.boxShadow?.slice(0, 100),
      slotOverflow: slot ? getComputedStyle(slot).overflow : null,
      slotAfterContent: slotAfter?.content,
      slotAfterShadow: slotAfter?.boxShadow?.slice(0, 100),
    }
  }

  const botFaces = [...document.querySelectorAll('.exposure-rack--discard-tracker-bot-row .tile-face')].slice(0, 5)
  const handFaces = [...document.querySelectorAll('.panel--hand .hand-row .tile-face')].slice(0, 5)

  return {
    phase: document.querySelector('.app')?.getAttribute('data-phase'),
    tileGraphics: document.querySelector('.app')?.getAttribute('data-tile-graphics'),
    botSlots: document.querySelectorAll('.exposure-rack--discard-tracker-bot-row .exposure-rack__slot').length,
    botSuggestBest: document.querySelectorAll('.exposure-rack--discard-tracker-bot-row .exposure-rack__slot--suggest-best').length,
    bot: botFaces.map(sample),
    hand: handFaces.map(sample),
  }
})

console.log(JSON.stringify(data, null, 2))
await b.close()
