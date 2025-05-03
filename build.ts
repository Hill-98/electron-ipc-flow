import { build } from 'vite'
import dts from 'vite-plugin-dts'

// main
await build({
  build: {
    lib: {
      entry: ['src/index.ts'],
      formats: ['es', 'cjs'],
    },
    minify: false,
    reportCompressedSize: false,
    target: ['chrome108', 'node16'], // electron 12
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
    rollupOptions: {
      external: ['electron/renderer'],
    },
    target: ['chrome108', 'node16'], // electron 12
  },
})
