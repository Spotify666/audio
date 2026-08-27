import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// SINGLEFILE=1 collapses the app into one JS chunk so scripts/build-singlefile.mjs
// can inline the whole thing into a single self-contained page.
const single = process.env.SINGLEFILE === '1'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: single ? Infinity : 8192,
    cssCodeSplit: !single,
    rolldownOptions: single ? { output: { inlineDynamicImports: true } } : undefined,
  },
})
