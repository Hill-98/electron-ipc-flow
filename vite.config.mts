import path from 'node:path'
import { defineConfig, UserConfig } from 'vite'

export default defineConfig((config) => {
  const mode = config.mode
  if (mode === 'test') {
    console.log(config)
    return config
  }
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
      target: 'ESNext'
    },
  } satisfies UserConfig
})
