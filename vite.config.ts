import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

/**
 * PWA / default builds ship full card books. Optional locked marketing build:
 * `MAHJLOGIC_CARD_CONTENT=0` → empty stub (`npm run build:web-locked`).
 */
const includeCardContent = process.env.MAHJLOGIC_CARD_CONTENT !== '0'

/** Capacitor WKWebView: first paint used module-before-CSS order and missed `data-native-app` timing — keep stylesheet first. */
function cssLinkBeforeModuleScript(): Plugin {
  return {
    name: 'css-link-before-module-script',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const scriptMatch = html.match(
          /<script type="module" crossorigin src="\/assets\/[^"]+\.js"><\/script>/,
        )
        const linkMatch = html.match(
          /<link rel="stylesheet" crossorigin href="\/assets\/[^"]+\.css">/,
        )
        if (!scriptMatch || !linkMatch) return html
        const fullScript = scriptMatch[0]
        const fullLink = linkMatch[0]
        const iS = html.indexOf(fullScript)
        const iL = html.indexOf(fullLink)
        if (iS === -1 || iL === -1 || iS > iL) return html
        return (
          html.slice(0, iS) +
          fullLink +
          html.slice(iS + fullScript.length, iL) +
          fullScript +
          html.slice(iL + fullLink.length)
        )
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cssLinkBeforeModuleScript()],
  resolve: {
    alias: {
      '@mahjlogic/card-books': path.resolve(
        rootDir,
        includeCardContent ? 'src/card/cardBooks.full.ts' : 'src/card/cardBooks.stub.ts',
      ),
    },
  },
  define: {
    'import.meta.env.VITE_CARD_CONTENT': JSON.stringify(includeCardContent ? '1' : '0'),
  },
  build: {
    // Keep each emitted JS chunk under Vite’s 500 kB warning threshold (monolithic App + suggestedHands).
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            if (id.includes('/analysis/suggestedHands')) return 'suggested-hands'
            if (
              id.includes('/card/practicePatterns') ||
              id.includes('/card/nmjl2026Patterns') ||
              id.includes('/card/nmjl2026CardBook') ||
              id.includes('/card/cardBooks.full')
            ) {
              return 'patterns'
            }
            return undefined
          }
          if (id.includes('react-dom') || /\/react\//.test(id)) return 'react-vendor'
          if (id.includes('@dnd-kit')) return 'dnd-kit'
          if (id.includes('@capacitor')) return 'capacitor'
          return 'vendor'
        },
      },
    },
  },
})
