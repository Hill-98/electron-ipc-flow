import assert from 'node:assert'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import module from 'node:module'
import { basename, join } from 'node:path'
import { build } from 'vite'

const __dirname = import.meta.dirname

const ELECTRON_BIN = join(__dirname, '../node_modules/.bin/electron'.concat(process.platform === 'win32' ? '.cmd' : ''))

/**
 * @param {string} dir
 * @returns {Promise<string>}
 */
async function buildTest(dir) {
  const main = join(dir, 'main.ts')
  const preload = join(dir, 'preload.ts')
  const output = join(join(__dirname, '../dist', basename(dir)))

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
        fileName: 'main',
        formats: ['cjs'],
      },
      minify: false,
      rollupOptions: {
        external: [
          ...module.builtinModules,
          ...module.builtinModules.map((m) => `node:${m}`),
          'electron',
          'electron/renderer',
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
        fileName: 'preload',
        formats: ['cjs'],
      },
      minify: false,
      rollupOptions: {
        external: ['electron', 'electron/renderer'],
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
    const electron = spawn(ELECTRON_BIN, [join(dir, 'main.js')], {
      shell: true,
      stdio: 'inherit',
    })
    electron.on('error', reject)
    electron.on('exit', (code) => {
      resolve(code === 0)
    })
  })
}

assert(await runTest(await buildTest(join(__dirname, 'IpcBroadcastControllerTest'))), 'IpcBroadcastControllerTest')

assert(await runTest(await buildTest(join(__dirname, 'IpcControllerTest'))), 'IpcControllerTest')

assert(await runTest(await buildTest(join(__dirname, 'IpcControllerRegisterTest'))), 'IpcControllerRegisterTest')

assert(await runTest(await buildTest(join(__dirname, 'TrustHandlerTest'))), 'TrustHandlerTest')

console.log('* All tests pass!')
