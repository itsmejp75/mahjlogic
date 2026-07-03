import { webkit } from 'playwright-core'
const b = await webkit.launch()
const p = await b.newPage({viewport:{width:520,height:1000}, deviceScaleFactor:4})
await p.goto('http://localhost:5174/',{waitUntil:'domcontentloaded',timeout:60000})
await p.waitForTimeout(2500)
await p.evaluate(()=>{const h=[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()==='Hands');h&&h.click()})
await p.waitForTimeout(1500)
const info = await p.evaluate(()=>{
  const rows=[...document.querySelectorAll('.hands-sheet__row')]
  const detRow=rows.find(r=>r.querySelector('.hands-sheet__hand-stack-detail'))
  if(!detRow) return {found:false}
  const rr=detRow.getBoundingClientRect()
  const main=detRow.querySelector('.hands-sheet__hand-stack-main')
  const det=detRow.querySelector('.hands-sheet__hand-stack-detail')
  const mr=main.getBoundingClientRect(), dr=det.getBoundingClientRect()
  return {found:true, rowH:rr.height, mainH:mr.height, detH:dr.height, mainTop:mr.top, detTop:dr.top, rowTop:rr.top, rowBot:rr.bottom,
    mainLeft:mr.left, gap: mr.top-rr.top + (dr.top-mr.bottom)}
})
console.log(JSON.stringify(info))
await b.close()
