import path from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => {
  const isPreload = mode === 'preload'
  return {
    build: {
      emptyOutDir: !isPreload,
      lib: {
        entry: path.resolve(__dirname, 'src', isPreload ? 'preload.ts' : 'index.ts'),
        fileName: isPreload ? 'preload' : 'index',
        formats: isPreload ? ['cjs'] : ['es', 'cjs'],
      },
      minify: false,
      rollupOptions: {
        external: isPreload ? ['electron/renderer'] : ['electron'],
      },
    },
  }
})
