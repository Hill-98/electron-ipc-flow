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
    target: ['chrome108', 'node16'], // electron 12
  },
}))
