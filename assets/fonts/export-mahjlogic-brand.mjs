/**
 * Writes canonical MahjLogic logo files to assets/brand/ (matches src/styles rack watermark).
 * - mahjlogic-logo.svg  : vector paths (no font files required to view)
 * - mahjlogic-logo.png  : transparent PNG
 *
 * Run: node assets/fonts/export-mahjlogic-brand.mjs
 * Or:  npm run export-logo
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Path, loadSync } from 'opentype.js';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const brandDir = path.join(__dirname, '..', 'brand');

/* Same base em as render-logo: fixed “parent” size for export (App uses clamp; this is the design size). */
const parentPx = 259.2;
const mahjSize = parentPx * 1.08;
const logicSize = parentPx * 1.14;
const marginLeftLogicEm = -0.04; /* of logic’s own font size */
const trackMahjEm = -0.056;
const trackLogicEm = -0.02;
const BASELINE_Y = 600;

const noto = loadSync(
  path.join(__dirname, 'Noto_Serif/static/NotoSerif-Black.ttf'),
);
const fig = loadSync(
  path.join(__dirname, 'Figtree/static/Figtree-Medium.ttf'),
);

/**
 * @param {import('opentype.js').Font} font
 * @param {string} text
 * @param {number} x0
 * @param {number} y
 * @param {number} fontSize
 * @param {number} letterSpacingEm
 */
function buildTextPath(font, text, x0, y, fontSize, letterSpacingEm) {
  const glyphs = font.stringToGlyphs(text);
  const scale = fontSize / font.unitsPerEm;
  const letterSpacing = letterSpacingEm * fontSize;
  const p = new Path();
  let x = x0;
  for (let i = 0; i < glyphs.length; i += 1) {
    const g = glyphs[i];
    if (i > 0) {
      const kern = font.getKerningValue(glyphs[i - 1], g);
      x += kern * scale;
      x += letterSpacing;
    }
    p.extend(g.getPath(x, y, fontSize));
    x += g.advanceWidth * scale;
  }
  return { path: p, endX: x };
}

const mahj = buildTextPath(noto, 'Mahj', 0, BASELINE_Y, mahjSize, trackMahjEm);
const logicX = mahj.endX + marginLeftLogicEm * logicSize;
const logic = buildTextPath(fig, 'Logic', logicX, BASELINE_Y, logicSize, trackLogicEm);

const bb1 = mahj.path.getBoundingBox();
const bb2 = logic.path.getBoundingBox();
const minX = Math.min(bb1.x1, bb2.x1);
const minY = Math.min(bb1.y1, bb2.y1);
const maxX = Math.max(bb1.x2, bb2.x2);
const maxY = Math.max(bb1.y2, bb2.y2);
const pad = 12;
const vbW = maxX - minX + pad * 2;
const vbH = maxY - minY + pad * 2;
const shiftX = -minX + pad;
const shiftY = -minY + pad;

const d1 = mahj.path.toPathData(2);
const d2 = logic.path.toPathData(2);

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(vbW)}" height="${Math.ceil(
  vbH,
)}" viewBox="0 0 ${vbW} ${vbH}">
  <g transform="translate(${shiftX} ${shiftY})">
    <path fill="#00B4D8" d="${d1}"/>
    <path fill="#FFB800" d="${d2}"/>
  </g>
</svg>
`;

fs.mkdirSync(brandDir, { recursive: true });
const svgPath = path.join(brandDir, 'mahjlogic-logo.svg');
const pngPath = path.join(brandDir, 'mahjlogic-logo.png');
fs.writeFileSync(svgPath, svg, 'utf8');

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({
  width: Math.ceil(vbW),
  height: Math.ceil(vbH),
  deviceScaleFactor: 2,
});
await page.setContent(
  `<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`,
  { waitUntil: 'load' },
);
await page.screenshot({
  path: pngPath,
  omitBackground: true,
  clip: { x: 0, y: 0, width: Math.ceil(vbW), height: Math.ceil(vbH) },
});
await browser.close();

console.log(`Wrote ${svgPath}\nWrote ${pngPath}`);
