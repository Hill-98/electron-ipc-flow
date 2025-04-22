import assert from 'node:assert/strict'
import path from 'node:path'
import { BrowserWindow, app, ipcMain } from 'electron'
import { IpcServerController } from '../../src/index.js'
import { getWebContentsBody, includeCount, sleep } from '../common.js'
import { server } from './controller.js'

const CONTROLLER_EVENT_RESULTS: string[] = []

async function createBrowserWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })
  await win.loadFile(path.resolve(__dirname, 'index.html'))
  return win
}

async function runTest() {
  const win = await createBrowserWindow()
  await sleep(1000)
  const body1 = await getWebContentsBody(win.webContents)
  assert.strictEqual(includeCount(body1, 'Blocked by trust handler'), 2, 'test default trust handler')

  server.trustHandler = (_, name) => name === 'hey' || name === 'hi'

  win.reload()
  await sleep(1000)

  const body2 = await getWebContentsBody(win.webContents)
  assert.strictEqual(includeCount(body2, 'hey electron-ipc-flow'), 1, 'test controller trust handler call pass')
  assert.strictEqual(
    includeCount(CONTROLLER_EVENT_RESULTS, 'hi electron-ipc-flow'),
    1,
    'test controller trust handler event pass',
  )
  assert.strictEqual(includeCount(body2, 'Blocked by trust handler'), 1, 'test controller trust handler call block')
  assert.strictEqual(
    includeCount(CONTROLLER_EVENT_RESULTS, 'hello electron-ipc-flow'),
    0,
    'test controller trust handler event block',
  )

  win.close()
}

process.env.ELECTRON_IPC_FLOW_DEBUG = 'true'

IpcServerController.IpcMain = ipcMain
IpcServerController.TrustHandler = () => Promise.resolve(false)

server.on('hi', (_, who) => {
  CONTROLLER_EVENT_RESULTS.push(`hi ${who}`)
})

server.on('hello', (_, who) => {
  CONTROLLER_EVENT_RESULTS.push(`hello ${who}`)
})

server.handle('hey', (who) => Promise.resolve(`hey ${who}`))

server.handle('say', (who) => `say ${who}`)

app.on('web-contents-created', (_, webContents) => {
  setImmediate(webContents.openDevTools.bind(webContents, { mode: 'detach' }))
})

app.on('window-all-closed', () => {
  app.quit()
})

app
  .whenReady()
  .then(runTest)
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
