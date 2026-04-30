/**
 * Merges the three most common flex-centered declaration clusters in safe_backup.css
 * into shared rules + utility classes. Respects @media (and other rule parents).
 *
 * Usage: node scripts/dedupe-flex-clusters.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'

const rootDir = path.resolve(import.meta.dirname, '..')
const file = path.join(rootDir, 'backup folder', 'safe_backup.css')

const CLUSTER1 = ['display:flex', 'align-items:center', 'justify-content:center']
const CLUSTER2 = ['display:inline-flex', 'align-items:center', 'justify-content:center']
const CLUSTER3 = ['display:flex', 'flex-direction:column', 'align-items:stretch']

const SPECS = [
  { id: 'c1', utility: '.flex-center', cluster: CLUSTER1 },
  { id: 'c2', utility: '.inline-flex-center', cluster: CLUSTER2 },
  { id: 'c3', utility: '.flex-col-stretch', cluster: CLUSTER3 },
]

function normDecl(decl) {
  return `${decl.prop.toLowerCase().trim()}:${decl.value.replace(/\s+/g, ' ').trim()}`
}

function directDecls(rule) {
  const out = []
  rule.each((node) => {
    if (node.type === 'decl') out.push(node)
  })
  return out
}

function clusterStartIndex(declNodes, clusterNorm) {
  const w = clusterNorm.length
  outer: for (let i = 0; i <= declNodes.length - w; i++) {
    for (let j = 0; j < w; j++) {
      if (normDecl(declNodes[i + j]) !== clusterNorm[j]) continue outer
    }
    return i
  }
  return -1
}

function declsToRemove(declNodes, start, w) {
  return declNodes.slice(start, start + w)
}

function ruleHasAnyChildren(rule) {
  let has = false
  rule.each(() => {
    has = true
  })
  return has
}

function makeClusterRule(spec, selectorList, includeUtility) {
  const util = spec.utility
  const rest = selectorList.filter((s) => s && s !== util).sort((a, b) => a.localeCompare(b))
  const parts = includeUtility ? [util, ...rest] : [...rest].sort((a, b) => a.localeCompare(b))
  const r = postcss.rule({ selector: parts.join(',\n') })
  if (spec.id === 'c1') {
    r.append(postcss.decl({ prop: 'display', value: 'flex' }))
    r.append(postcss.decl({ prop: 'align-items', value: 'center' }))
    r.append(postcss.decl({ prop: 'justify-content', value: 'center' }))
  } else if (spec.id === 'c2') {
    r.append(postcss.decl({ prop: 'display', value: 'inline-flex' }))
    r.append(postcss.decl({ prop: 'align-items', value: 'center' }))
    r.append(postcss.decl({ prop: 'justify-content', value: 'center' }))
  } else {
    r.append(postcss.decl({ prop: 'display', value: 'flex' }))
    r.append(postcss.decl({ prop: 'flex-direction', value: 'column' }))
    r.append(postcss.decl({ prop: 'align-items', value: 'stretch' }))
  }
  return r
}

const css = fs.readFileSync(file, 'utf8')
const ast = postcss.parse(css, { from: file })

/** spec.id -> Map(parent -> Set(selectors)) */
const groups = new Map()
for (const spec of SPECS) {
  groups.set(spec.id, new Map())
}

const toStrip = []

ast.walkRules((rule) => {
  const declNodes = directDecls(rule)
  for (const spec of SPECS) {
    const idx = clusterStartIndex(declNodes, spec.cluster)
    if (idx === -1) continue
    const p = rule.parent
    const gmap = groups.get(spec.id)
    if (!gmap.has(p)) gmap.set(p, new Set())
    gmap.get(p).add(rule.selector)
    toStrip.push({ rule, idx, w: spec.cluster.length })
  }
})

let insertBeforeComment = null
ast.each((node) => {
  if (
    node.type === 'comment' &&
    node.text.includes('Hand / exposure') &&
    node.text.includes('Charleston')
  ) {
    insertBeforeComment = node
  }
})

if (!insertBeforeComment) {
  console.error('Could not find insertion anchor comment')
  process.exit(1)
}

/** Insert merged rules first (while parent pointers are valid). */
const rootMerges = []
const nestMerges = new Map()

for (const spec of SPECS) {
  const gmap = groups.get(spec.id)
  for (const [parent, selSet] of gmap) {
    const selectors = [...selSet].filter(Boolean)
    if (selectors.length === 0) continue

    const merged = makeClusterRule(spec, selectors, parent.type === 'root')

    if (parent.type === 'root') {
      rootMerges.push(merged)
    } else {
      if (!nestMerges.has(parent)) nestMerges.set(parent, [])
      nestMerges.get(parent).push(merged)
    }
  }
}

const colorRoot = ast.first
if (!colorRoot || colorRoot.type !== 'rule') {
  console.error('Expected first AST node to be color :root rule')
  process.exit(1)
}
let anchor = colorRoot
for (const merged of rootMerges) {
  anchor.after(merged)
  anchor = merged
}

for (const [parent, arr] of nestMerges) {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (parent.first) parent.insertBefore(parent.first, arr[i])
    else parent.append(arr[i])
  }
}

/** Strip duplicate declaration triples and drop empty rules. */
for (const { rule, idx, w } of toStrip) {
  if (!rule.parent) continue
  const declNodes = directDecls(rule)
  for (const d of declsToRemove(declNodes, idx, w)) {
    if (d.parent) d.remove()
  }
  if (!ruleHasAnyChildren(rule)) {
    rule.remove()
  }
}

fs.writeFileSync(file, ast.toString(), 'utf8')

console.log(
  'dedupe-flex-clusters: strip ops',
  toStrip.length,
  'parents c1/c2/c3',
  SPECS.map((s) => groups.get(s.id).size).join('/'),
)
