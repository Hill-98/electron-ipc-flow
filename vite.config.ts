import { rmSync as rm } from 'node:fs'
import { join } from 'node:path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

process.on('exit', () => {
  rm(join(import.meta.dirname, 'dist/preload.js'))
  rm(join(import.meta.dirname, 'dist/preload.d.ts'))
})

export default defineConfig({
  build: {
    lib: {
      entry: ['src/preload.ts', 'src/index.ts'],
      formats: ['es', 'cjs'],
    },
    minify: false,
    rollupOptions: {
      external: ['electron', 'electron/renderer'],
    },
    reportCompressedSize: false,
    target: ['chrome108', 'node16'], // electron 12
  },
  plugins: [dts({ rollupTypes: true })],
})
