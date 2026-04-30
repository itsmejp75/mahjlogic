/**
 * Moves "dead" CSS rules (same heuristic as analyze-unused-css.mjs) from
 * backup folder/safe_backup.css into src/styles/deprecated.css.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS_PATH = path.join(ROOT, 'backup folder', 'safe_backup.css');
const DEPRECATED_PATH = path.join(ROOT, 'src', 'styles', 'deprecated.css');
const SRC = path.join(ROOT, 'src');

const CLASS_IN_SEL = /\.([a-zA-Z_-][\w-]*)/g;
const ID_IN_SEL = /#([a-zA-Z_-][\w-]*)/g;

const HEADER = `/* These styles were flagged as unused on April 29, 2026. Move back to safe_backup if something breaks. */

`;

function walkFiles(dir, exts, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(p, exts, out);
    else if (exts.has(path.extname(ent.name))) out.push(p);
  }
  return out;
}

function addSplitTokens(s, used) {
  if (!s) return;
  for (const part of String(s).split(/\s+/)) {
    const t = part.trim();
    if (
      /^[a-zA-Z_][\w-]*$/.test(t) &&
      t !== 'true' &&
      t !== 'false' &&
      t !== 'null' &&
      t !== 'undefined'
    ) {
      used.add(t);
    }
  }
}

function readJsxExpressionBody(text, openIdx) {
  let depth = 0;
  let i = openIdx;
  if (text[i] !== '{') return null;
  depth = 1;
  i++;
  const start = i;
  let q = null;
  let escaped = false;

  while (i < text.length && depth > 0) {
    const ch = text[i];

    if (q) {
      if (escaped) {
        escaped = false;
        i++;
        continue;
      }
      if (q !== '`' && ch === '\\') {
        escaped = true;
        i++;
        continue;
      }
      if (ch === q) {
        q = null;
        i++;
        continue;
      }
      if (q === '`' && ch === '$' && text[i + 1] === '{') {
        let bd = 1;
        i += 2;
        while (i < text.length && bd > 0) {
          if (text[i] === '{') bd++;
          else if (text[i] === '}') bd--;
          i++;
        }
        continue;
      }
      i++;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      q = ch;
      i++;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    i++;
  }
  if (depth !== 0) return null;
  return text.slice(start, i - 1);
}

function harvestQuotedStringsFromCode(body, used) {
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      let esc = false;
      while (j < body.length) {
        if (esc) {
          esc = false;
          j++;
          continue;
        }
        if (body[j] === '\\') {
          esc = true;
          j++;
          continue;
        }
        if (body[j] === ch) {
          const raw = body.slice(i + 1, j).replace(/\\(.)/g, '$1');
          if (/^[\w\s-]+$/.test(raw)) addSplitTokens(raw, used);
          i = j + 1;
          break;
        }
        j++;
      }
      if (j >= body.length) break;
      continue;
    }
    if (ch === '`') {
      let j = i + 1;
      let chunkStart = j;
      while (j < body.length) {
        if (body[j] === '\\') {
          j += 2;
          continue;
        }
        if (body[j] === '`') {
          addSplitTokens(body.slice(chunkStart, j), used);
          i = j + 1;
          break;
        }
        if (body[j] === '$' && body[j + 1] === '{') {
          addSplitTokens(body.slice(chunkStart, j), used);
          let bd = 1;
          j += 2;
          while (j < body.length && bd > 0) {
            if (body[j] === '{') bd++;
            else if (body[j] === '}') bd--;
            j++;
          }
          chunkStart = j;
          continue;
        }
        j++;
      }
      if (j >= body.length) break;
      continue;
    }
    i++;
  }
}

function scanJsxAttr(text, attr, used) {
  const re = new RegExp(`\\b${attr}\\s*=`, 'g');
  let m;
  while ((m = re.exec(text))) {
    let pos = m.index + m[0].length;
    while (pos < text.length && /\s/.test(text[pos])) pos++;

    if (text[pos] === '"' || text[pos] === "'") {
      const q = text[pos];
      let j = pos + 1;
      while (j < text.length && text[j] !== q) {
        if (text[j] === '\\') j++;
        j++;
      }
      addSplitTokens(text.slice(pos + 1, j), used);
      continue;
    }
    if (text[pos] === '{') {
      const exprBody = readJsxExpressionBody(text, pos);
      if (exprBody) harvestQuotedStringsFromCode(exprBody, used);
    }
  }
}

function collectUsedTokens(paths) {
  const used = new Set();
  for (const file of paths) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    scanJsxAttr(text, 'className', used);
    scanJsxAttr(text, 'id', used);
    for (const m of text.matchAll(/\bclass\s*=\s*["']([^"']*)["']/g)) {
      addSplitTokens(m[1], used);
    }
    for (const m of text.matchAll(/['"]([a-zA-Z_][\w-]*-\w[\w-]*)['"]/g)) {
      used.add(m[1]);
    }
    for (const m of text.matchAll(
      /['"]([a-zA-Z_][\w-]*__[a-z0-9_-]+(?:--[a-z0-9_-]+)?)['"]/g
    )) {
      addSplitTokens(m[1], used);
    }
  }
  return used;
}

function tokensFromSelector(selector) {
  const classes = [...selector.matchAll(CLASS_IN_SEL)].map((x) => x[1]);
  const ids = [...selector.matchAll(ID_IN_SEL)].map((x) => x[1]);
  return { all: [...classes, ...ids] };
}

function collectDeadRules(root, used) {
  const dead = [];
  root.walkRules((rule) => {
    if (rule.parent?.type === 'atrule' && rule.parent.name === 'keyframes') return;
    const sel = rule.selector;
    if (!sel) return;
    const { all } = tokensFromSelector(sel);
    if (all.length === 0) return;
    if (!all.some((t) => used.has(t))) dead.push(rule);
  });
  return dead;
}

function pruneEmptyAtRules(node) {
  if (node.type === 'atrule' && node.nodes) {
    for (const child of [...node.nodes]) {
      pruneEmptyAtRules(child);
    }
    if (node.nodes.length === 0) {
      node.remove();
      return;
    }
  }
  if (node.nodes) {
    for (const child of [...node.nodes]) {
      pruneEmptyAtRules(child);
    }
  }
}

function main() {
  const htmlInSrc = walkFiles(SRC, new Set(['.tsx', '.html']));
  const indexHtml = path.join(ROOT, 'index.html');
  const scanPaths = [...htmlInSrc];
  if (fs.existsSync(indexHtml)) scanPaths.push(indexHtml);

  const used = collectUsedTokens(scanPaths);
  const cssText = fs.readFileSync(CSS_PATH, 'utf8');
  const root = postcss.parse(cssText, { from: CSS_PATH });
  const dead = collectDeadRules(root, used);

  dead.sort((a, b) => {
    const sa = a.source?.start?.offset ?? 0;
    const sb = b.source?.start?.offset ?? 0;
    return sa - sb;
  });

  const chunks = dead.map((r) => r.toString().trimEnd());
  fs.writeFileSync(DEPRECATED_PATH, HEADER + chunks.join('\n\n') + '\n', 'utf8');

  for (const r of dead) {
    r.remove();
  }

  pruneEmptyAtRules(root);

  fs.writeFileSync(CSS_PATH, root.toString(), 'utf8');

  const lineCount = fs.readFileSync(CSS_PATH, 'utf8').split('\n').length;
  console.log(
    JSON.stringify({
      movedRules: dead.length,
      deprecatedPath: path.relative(ROOT, DEPRECATED_PATH),
      safeBackupPath: path.relative(ROOT, CSS_PATH),
      safeBackupLineCount: lineCount,
    })
  );
}

main();
