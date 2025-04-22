import { spawn } from 'node:child_process'
import { existsSync as exists } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import module from 'node:module'
import { basename, join } from 'node:path'
import { test } from 'node:test'
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

  if (exists(output)) {
    await rm(output, { recursive: true })
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
      reportCompressedSize: false,
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
      reportCompressedSize: false,
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
      reportCompressedSize: false,
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
  const packageJson = {
    name: 'electron-ipc-flow-test',
    main: 'main.cjs',
  }
  await writeFile(join(dir, 'package.json'), JSON.stringify(packageJson))
  return new Promise((resolve, reject) => {
    const electron = spawn(ELECTRON_BIN, [dir], {
      shell: true,
      stdio: 'inherit',
    })
    electron.on('error', reject)
    electron.on('exit', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(`electron exit code is ${code}.`)
      }
    })
  })
}

await test('ClientToServerTest', runTest.bind(this, await buildTest(join(__dirname, 'ClientToServerTest'))))

await test('BroadcastTest', runTest.bind(this, await buildTest(join(__dirname, 'BroadcastTest'))))

await test('ClientRegisterTest', runTest.bind(this, await buildTest(join(__dirname, 'ClientRegisterTest'))))

await test('QuickPropertyTest', runTest.bind(this, await buildTest(join(__dirname, 'QuickPropertyTest'))))

await test('SendToHostTest', runTest.bind(this, await buildTest(join(__dirname, 'SendToHostTest'))))

await test('TrustHandlerTest', runTest.bind(this, await buildTest(join(__dirname, 'TrustHandlerTest'))))
