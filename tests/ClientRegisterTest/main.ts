import assert from 'node:assert/strict'
import path from 'node:path'
import { BrowserWindow, app, ipcMain } from 'electron'
import { IpcServerController } from '../../src/index.js'
import { getWebContentsBody, includeCount, sleep } from '../common.js'
import { server as server1 } from './controller1.js'
import { server as server2 } from './controller2.js'

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
  server1.send('hey', 'electron-ipc-flow')
  await sleep(1000)
  const body = await getWebContentsBody(win.webContents)

  assert.strictEqual(includeCount(body, 'say electron-ipc-flow 1'), 1, 'test registered controller call')
  assert.strictEqual(includeCount(body, 'hey electron-ipc-flow 1'), 1, 'test registered controller client event')
  assert.strictEqual(
    includeCount(body, 'IpcClientController "controller2" not registered.'),
    3,
    'test not registered controller',
  )
  assert.strictEqual(
    includeCount(CONTROLLER_EVENT_RESULTS, 'hi electron-ipc-flow 1'),
    1,
    'test registered controller server event result',
  )
  assert.strictEqual(
    includeCount(CONTROLLER_EVENT_RESULTS, 'hi electron-ipc-flow 2'),
    0,
    'test not registered controller server event result',
  )
  win.close()
}

process.env.ELECTRON_IPC_FLOW_DEBUG = 'true'

IpcServerController.IpcMain = ipcMain
IpcServerController.WebContentsGetter = () => BrowserWindow.getAllWindows().map((win) => win.webContents)

server1.handle('say', (who) => `say ${who} 1`)
server1.on('hi', (_, who) => {
  CONTROLLER_EVENT_RESULTS.push(`hi ${who} 1`)
})

server2.handle('say', (who) => `say ${who} 2`)
server2.on('hi', (_, who) => {
  CONTROLLER_EVENT_RESULTS.push(`hi ${who} 2`)
})

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
