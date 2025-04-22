import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
  build: {
    emptyOutDir: mode !== 'preload',
    lib: {
      entry: mode === 'preload' ? 'src/preload.ts' : 'src/index.ts',
      fileName: mode === 'preload' ? 'preload' : 'index',
      formats: mode === 'preload' ? ['cjs'] : ['es', 'cjs'],
    },
    minify: false,
    rollupOptions: {
      external: ['electron', 'electron/renderer'],
    },
    reportCompressedSize: false,
    target: ['chrome89', 'node14'], // electron 12
  },
}))
