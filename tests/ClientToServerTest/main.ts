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
      preload: path.join(__dirname, 'preload.js'),
    },
  })
  await win.loadFile(path.resolve(__dirname, 'index.html'))
  return win
}

async function runTest() {
  const win = await createBrowserWindow()
  await sleep(1000)
  const body = await getWebContentsBody(win.webContents)

  assert.strictEqual(includeCount(body, 'hey electron-ipc-flow'), 1, 'test hey call')
  assert.strictEqual(includeCount(body, 'say electron-ipc-flow'), 1, 'test say call')
  assert.strictEqual(includeCount(CONTROLLER_EVENT_RESULTS, 'hi electron-ipc-flow'), 3, 'test send event')
  assert.strictEqual(includeCount(CONTROLLER_EVENT_RESULTS, 'hi electron-ipc-flow once'), 1, 'test send once event')
  assert.strictEqual(includeCount(CONTROLLER_EVENT_RESULTS, 'hi electron-ipc-flow off'), 1, 'test send and off event')
  win.close()
}

process.env.ELECTRON_IPC_FLOW_DEBUG = 'true'

IpcServerController.IpcMain = ipcMain

server.on('hi', (_, who) => {
  CONTROLLER_EVENT_RESULTS.push(`hi ${who}`)
})

const hi = (_: Electron.IpcMainEvent, who: string) => {
  CONTROLLER_EVENT_RESULTS.push(`hi ${who} off`)
  server.off('hi', hi)
}

server.on('hi', hi)

server.once('hi', (_, who) => {
  CONTROLLER_EVENT_RESULTS.push(`hi ${who} once`)
})

server.functions.hey = (who) => Promise.resolve(Promise.resolve(Promise.resolve(`hey ${who}`)))

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
