/**
 * Splits a full app stylesheet into src/styles/fragments/part-XXXX.css (one file per
 * consecutive same-category run; global order preserved).
 *
 * style.css imports base.css → layout.css → components.css → animations.css. Each of
 * those files lists ~¼ of the fragment @imports in original order (quarters for bundling,
 * not semantic “theme” boundaries — see thematic/*.css for concat-by-classifier copies).
 *
 * Usage:
 *   npm run split-css
 *   node scripts/split-app-css.mjs path/to/full.css
 *
 * Default input: backup folder/safe_backup.css (edit that file or pass another path, then re-run).
 */
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const defaultInput = path.join(root, 'backup folder', 'safe_backup.css')
const srcPath = path.resolve(process.argv[2] || defaultInput)
const outDir = path.join(root, 'src', 'styles')
const fragDir = path.join(outDir, 'fragments')

const text = fs.readFileSync(srcPath, 'utf8')
if (!text.trim()) {
  console.error('split-app-css: empty or missing input:', srcPath)
  process.exit(1)
}

function splitTopLevel(css) {
  const blocks = []
  let i = 0
  const n = css.length

  const skipWs = () => {
    while (i < n && /\s/.test(css[i])) i++
  }

  while (i < n) {
    const start = i
    if (i >= n) break

    while (i < n && css[i] === '/' && css[i + 1] === '*') {
      i += 2
      while (i < n && !(css[i] === '*' && css[i + 1] === '/')) i++
      i = Math.min(n, i + 2)
      skipWs()
    }

    const ruleStart = i
    if (ruleStart >= n) break

    let depth = 0
    let inStr = null
    let escaped = false
    let inComment = false

    const startDepthAt = (idx) => {
      if (css[idx] === '@') {
        let j = idx + 1
        while (j < n && css[j] !== '{') {
          if (css[j] === '"' || css[j] === "'") {
            const q = css[j]
            j++
            while (j < n && css[j] !== q) {
              if (css[j] === '\\') j++
              j++
            }
            j++
            continue
          }
          if (css[j] === '/' && css[j + 1] === '*') {
            j += 2
            while (j < n && !(css[j] === '*' && css[j + 1] === '/')) j++
            j += 2
            continue
          }
          j++
        }
        return j < n && css[j] === '{' ? j : idx
      }
      const o = css.indexOf('{', idx)
      return o === -1 ? idx : o
    }

    let braceAt = startDepthAt(ruleStart)
    if (braceAt >= n || css[braceAt] !== '{') {
      blocks.push(css.slice(start))
      break
    }
    depth = 1
    i = braceAt + 1

    while (i < n && depth > 0) {
      const c = css[i]
      if (inComment) {
        if (c === '*' && css[i + 1] === '/') {
          inComment = false
          i += 2
        } else i++
        continue
      }
      if (inStr) {
        if (escaped) {
          escaped = false
          i++
          continue
        }
        if (c === '\\') {
          escaped = true
          i++
          continue
        }
        if (c === inStr) inStr = null
        i++
        continue
      }
      if (c === '/' && css[i + 1] === '*') {
        inComment = true
        i += 2
        continue
      }
      if (c === '"' || c === "'") {
        inStr = c
        i++
        continue
      }
      if (c === '{') depth++
      else if (c === '}') depth--
      i++
    }

    blocks.push(css.slice(start, i))
  }

  return blocks
}

function trimBlock(b) {
  return b.replace(/^\s+/, '').replace(/\s+$/, '')
}

function isRootOnlyWrapper(block) {
  const t = trimBlock(block)
  if (!/^@(media|supports)\b/.test(t)) return false
  const open = t.indexOf('{')
  if (open === -1) return false
  let inner = t.slice(open + 1)
  inner = inner.replace(/\s*}\s*$/, '')
  const innerTrim = inner.replace(/\/\*[\s\S]*?\*\/|\s+/g, ' ').trim()
  return /^(:root\s*\{[\s\S]*\}\s*)+$/.test(innerTrim)
}

function classify(block) {
  const t = trimBlock(block)
  if (t.startsWith('@keyframes')) return 'animations'
  if (t.startsWith(':root') && t.includes('{')) return 'base'
  if (isRootOnlyWrapper(block)) return 'base'

  const trimmed = t.replace(/\/\*[\s\S]*?\*\//g, '')
  if (/^@media\b/m.test(trimmed) || /^@supports\b/m.test(trimmed)) {
    if (/\n\s*#root\b/.test(block) || /\n\s*\.app-main\b/.test(block)) return 'layout'
    if (/\n\s*\.app-layout\b/.test(block)) return 'layout'
  }

  const firstLine =
    t.split('\n').find((l) => {
      const s = l.trim()
      return s && !s.startsWith('/*')
    }) ?? ''
  const prelude = firstLine.split('{')[0] ?? firstLine

  const layoutRes = [
    /^\.app\b/,
    /\.app-main\b/,
    /\.app-layout\b/,
    /\.app-dnd-frame\b/,
    /\.app-play-split\b/,
    /\.app-rack-stage\b/,
    /\.app-opponents-rail\b/,
    /^#root\b/,
    /\.rack-stack\b/,
    /\.rack-stage\b/,
    /\.panel--hand\b/,
    /\.panel--discard-tracker\b/,
    /\.panel--bot-exposures\b/,
    /\.panel--hands\b/,
    /\.panel--main-game\b/,
    /\.discard-tracker\b/,
    /\.app-data\b/,
    /\.app-rail\b/,
    /\.app__header\b/,
  ]

  for (const re of layoutRes) {
    if (re.test(prelude)) return 'layout'
  }

  return 'components'
}

const blocks = splitTopLevel(text).filter((b) => trimBlock(b))

const tagged = blocks.map((block) => ({ block, cat: classify(block) }))

const runs = []
let cur = null
for (const row of tagged) {
  if (!cur || cur.cat !== row.cat) {
    cur = { cat: row.cat, parts: [row.block] }
    runs.push(cur)
  } else {
    cur.parts.push(row.block)
  }
}

fs.mkdirSync(fragDir, { recursive: true })
for (const f of fs.readdirSync(fragDir)) {
  if (/^part-\d{4}( \d+)?\.css$/.test(f)) fs.unlinkSync(path.join(fragDir, f))
}

const aggregate = { base: [], layout: [], components: [], animations: [] }
const styleImports = []

runs.forEach((run, idx) => {
  const part = `part-${String(idx + 1).padStart(4, '0')}.css`
  const body = run.parts.join('')
  fs.writeFileSync(path.join(fragDir, part), body, 'utf8')
  styleImports.push(`@import "./fragments/${part}";`)
  aggregate[run.cat].push(body)
})

const genHdr =
  '/* Generated by scripts/split-app-css.mjs — run `npm run split-css` after editing the source backup. */\n\n'
const themeHdr =
  '/* Thematic concat (classifier: base/layout/components/animations). Not imported — use ../style.css. */\n\n'

const thematicDir = path.join(outDir, 'thematic')
fs.mkdirSync(thematicDir, { recursive: true })
for (const name of ['base', 'layout', 'components', 'animations']) {
  const blob = aggregate[name].join('')
  fs.writeFileSync(
    path.join(thematicDir, `${name}.css`),
    themeHdr + blob + (blob.endsWith('\n') ? '' : '\n'),
    'utf8',
  )
}

const nImp = styleImports.length
const q = Math.ceil(nImp / 4)
const quarters = [
  styleImports.slice(0, q),
  styleImports.slice(q, 2 * q),
  styleImports.slice(2 * q, 3 * q),
  styleImports.slice(3 * q),
]
const barrelNames = ['base.css', 'layout.css', 'components.css', 'animations.css']
const barrelExplain =
  genHdr +
  '/* Cascade-ordered quarter of fragment imports (not the same as thematic/base — see thematic/base.css). */\n\n'
barrelNames.forEach((fname, i) => {
  const lines = quarters[i]
  fs.writeFileSync(
    path.join(outDir, fname),
    barrelExplain + (lines.length ? lines.join('\n') + '\n' : '/* empty */\n'),
    'utf8',
  )
})

const styleExplain = [
  '/* App entry — four barrels are consecutive quarters of the original rule order. */',
  '',
]

fs.writeFileSync(
  path.join(outDir, 'style.css'),
  genHdr + styleExplain.join('\n') +
    `@import "./base.css";\n@import "./layout.css";\n@import "./components.css";\n@import "./animations.css";\n`,
  'utf8',
)

console.log('parts:', runs.length, 'style imports:', styleImports.length)
