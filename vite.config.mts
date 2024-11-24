import path from 'node:path'
import { type UserConfig, defineConfig } from 'vite'

export default defineConfig((config) => {
  const mode = config.mode

  const isPreload = mode === 'preload'

  return {
    build: {
      emptyOutDir: !isPreload,
      lib: {
        entry: path.join(__dirname, 'src', isPreload ? 'preload.ts' : 'index.ts'),
        fileName: isPreload ? 'preload' : 'index',
        formats: isPreload ? ['cjs'] : ['es', 'cjs'],
      },
      minify: false,
      rollupOptions: {
        external: ['electron', 'electron/renderer'],
      },
      reportCompressedSize: false,
      target: ['chrome89', 'node14'], // electron 12
    },
  } satisfies UserConfig
})
