import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: { port: 4030, host: '127.0.0.1' },
  resolve: {
    alias: {
      '@fosivo/line-rich-menu-ui': fileURLToPath(new URL('../../packages/ui/src/index.ts', import.meta.url)),
      '@fosivo/line-rich-menu-core/browser': fileURLToPath(new URL('../../packages/core/src/browser.ts', import.meta.url)),
    },
  },
})
