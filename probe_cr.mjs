import { chromium } from 'playwright-core'
const b = await chromium.launch()
const p = await b.newPage({viewport:{width:520,height:1000}, deviceScaleFactor:4})
const url = process.env.URL || 'http://localhost:5174/'
await p.goto(url,{waitUntil:'domcontentloaded',timeout:60000})
await p.waitForTimeout(2500)
await p.evaluate(()=>{const h=[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()==='Hands');h&&h.click()})
await p.waitForTimeout(1500)
const info = await p.evaluate(()=>{
  const sheet=document.querySelector('.suggested-hands-popup .hands-sheet')||document.querySelector('.hands-sheet')
  const rowEls=[...sheet.querySelectorAll('.hands-sheet__rows > .hands-sheet__row')]
  const chk=(el,w)=>{const cs=getComputedStyle(el,w);return {bg:cs.backgroundColor.slice(0,30),h:cs.height,shadow:cs.boxShadow.slice(0,20)}}
  const cellShadow=(()=>{const c=rowEls[0].querySelector('.hands-sheet__cell--away:not(.hands-sheet__cell--detail-pad)');return getComputedStyle(c).boxShadow})()
  return {row0after:chk(rowEls[0],'::after'), awayCellShadow:cellShadow,
    seams:(()=>{const s=[];for(let k=0;k+1<Math.min(5,rowEls.length);k++){const a=rowEls[k].getBoundingClientRect(),c=rowEls[k+1].getBoundingClientRect();s.push(+(c.top-a.bottom).toFixed(3))}return s})()}
})
console.log(JSON.stringify(info))
const sheet = await p.$('.suggested-hands-popup .hands-sheet') || await p.$('.hands-sheet')
const box = await sheet.boundingBox()
await p.screenshot({path:'probe_seam_cr.png', clip:{x:box.x, y:box.y, width:box.width, height:170}})
await b.close()
