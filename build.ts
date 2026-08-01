import { build } from 'tsdown'

const target = ['chrome128', 'node20']

// main
await build({
  dts: true,
  entry: ['src/index.ts'],
  format: ['es'],
  inputOptions: {
    experimental: {
      attachDebugInfo: 'none',
    },
  },
  target,
})

// preload
await build({
  clean: false,
  deps: {
    neverBundle: ['electron/renderer'],
  },
  dts: false,
  entry: ['src/preload.ts'],
  format: ['commonjs'],
  inputOptions: {
    experimental: {
      attachDebugInfo: 'none',
    },
  },
  target,
})
