import puppeteer from 'puppeteer'
const b = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox']})
const p = await b.newPage()
await p.setViewport({width:900,height:1400,deviceScaleFactor:2})
await p.goto('http://localhost:5174/',{waitUntil:'domcontentloaded',timeout:60000})
await new Promise(r=>setTimeout(r,2500))
const info = await p.evaluate(()=>{
  const sheet=document.querySelector('.hands-sheet')
  const rows=sheet.querySelector('.hands-sheet__rows')
  const rowEls=[...rows.querySelectorAll(':scope > .hands-sheet__row')]
  const hdr=sheet.querySelector('.hands-sheet__cell--header')
  const r=(e)=>{const b=e.getBoundingClientRect();return {top:+b.top.toFixed(2),bottom:+b.bottom.toFixed(2),h:+b.height.toFixed(2)}}
  const cs=(e,props)=>{const c=getComputedStyle(e);const o={};props.forEach(k=>o[k]=c[k]);return o}
  const out={scrollTop:rows.scrollTop, rowsRect:r(rows), header:r(hdr), headerCS:cs(hdr,['boxShadow','borderBottomWidth','position']), rows:[]}
  for(let i=0;i<Math.min(3,rowEls.length);i++){
    const row=rowEls[i]
    const combined=row.querySelector('.hands-sheet__cell--combined-hands')
    const main=row.querySelector('.hands-sheet__hand-stack-main')
    const detail=row.querySelector('.hands-sheet__hand-stack-detail')
    const away=row.querySelector('.hands-sheet__cell--away:not(.hands-sheet__cell--detail-pad)')
    out.rows.push({i, row:r(row), rowCS:cs(row,['gridTemplateRows']), main:main&&r(main), detail:detail&&r(detail), away:away&&r(away), mainCS:main&&cs(main,['boxShadow','alignSelf']) })
  }
  return out
})
console.log(JSON.stringify(info,null,1))
await b.close()
