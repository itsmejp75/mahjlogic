import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@mahjlogic/card-books': path.resolve(rootDir, 'src/card/cardBooks.full.ts'),
    },
  },
  define: {
    'import.meta.env.VITE_CARD_CONTENT': JSON.stringify('1'),
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
