import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
})
