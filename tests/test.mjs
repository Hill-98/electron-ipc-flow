import assert from 'node:assert'
import child_process from 'node:child_process'
import fs from 'node:fs'
import module from 'node:module'
import path from 'node:path'
import { build } from 'vite'

const ELECTRON_BIN = path.join(import.meta.dirname, '../node_modules/electron/dist/electron'.concat((process.platform === 'win32' ? '.exe' : '')))

/**
 * @param {string} dir
 * @returns {Promise<string>}
 */
async function buildTest(dir) {
  const main = path.join(dir, 'main.ts')
  const preload = path.join(dir, 'preload.ts')
  const output = path.join(path.join(import.meta.dirname, '../dist', path.basename(dir)))

  if (fs.existsSync(output)) {
    fs.rmSync(output, { recursive: true })
  }

  // main
  await build({
    configFile: false,
    root: dir,
    build: {
      emptyOutDir: false,
      lib: {
        entry: main,
        fileName: path.parse(main).name,
        formats: ['cjs'],
      },
      minify: false,
      rollupOptions: {
        external: [
          ...module.builtinModules,
          ...module.builtinModules.map((m) => `node:${m}`),
          'electron',
          'electron/renderer'
        ],
      },
      outDir: output,
      sourcemap: 'inline',
      target: 'ESNext',
    },
  })

  // preload
  await build({
    configFile: false,
    root: dir,
    build: {
      emptyOutDir: false,
      lib: {
        entry: preload,
        fileName: path.parse(preload).name,
        formats: ['cjs'],
      },
      minify: false,
      rollupOptions: {
        external: [
          'electron',
          'electron/renderer',
        ],
      },
      outDir: output,
      sourcemap: 'inline',
      target: 'ESNext',
    },
  })

  // renderer
  await build({
    configFile: false,
    base: './',
    root: dir,
    build: {
      emptyOutDir: false,
      minify: false,
      modulePreload: false,
      outDir: output,
      sourcemap: 'inline',
      target: 'ESNext',
    },
  })

  return output
}

/**
 * @param {string} dir
 * @returns {Promise<boolean>}
 */
async function runTest(dir) {
  return new Promise((resolve, reject) => {
    const electron = child_process.spawn(ELECTRON_BIN, [path.join(dir, 'main.js')], {
      shell: true,
      stdio: 'inherit',
    })
    electron.on('error', reject)
    electron.on('exit', (code) => {
      resolve(code === 0)
    })
  })
}

assert(await runTest(await buildTest(path.join(import.meta.dirname, 'IpcBroadcastControllerTest'))), 'IpcBroadcastControllerTest')

assert(await runTest(await buildTest(path.join(import.meta.dirname, 'IpcControllerTest'))), 'IpcControllerTest')

assert(await runTest(await buildTest(path.join(import.meta.dirname, 'IpcControllerRegisterTest'))), 'IpcControllerRegisterTest')

assert(await runTest(await buildTest(path.join(import.meta.dirname, 'TrustHandlerTest'))), 'TrustHandlerTest')

console.log('* All tests pass!')
