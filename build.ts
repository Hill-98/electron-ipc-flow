import { build } from 'vite'
import dts from 'vite-plugin-dts'

const target = ['chrome128', 'node20']

// main
await build({
  build: {
    lib: {
      entry: ['src/index.ts'],
      formats: ['es'],
    },
    minify: false,
    reportCompressedSize: false,
    target,
  },
  plugins: [dts({ rollupTypes: true })],
})

// preload
await build({
  build: {
    emptyOutDir: false,
    lib: {
      entry: ['src/preload.ts'],
      formats: ['cjs'],
    },
    minify: false,
    reportCompressedSize: false,
    rolldownOptions: {
      external: ['electron/renderer'],
    },
    target,
  },
})
