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
  await sleep(2000)
  const body = await getWebContentsBody(win.webContents)

  assert.strictEqual(includeCount(body, 'hey electron-ipc-flow'), 1, 'test hey call')
  assert.strictEqual(includeCount(body, 'hi electron-ipc-flow'), 1, 'test hi event listener')
  assert.strictEqual(includeCount(body, 'hi hi electron-ipc-flow'), 1, 'test hi hi event listener')
  assert.strictEqual(includeCount(CONTROLLER_EVENT_RESULTS, 'say electron-ipc-flow'), 1, 'test say event listener')
  win.close()
}

process.env.ELECTRON_IPC_FLOW_DEBUG = 'true'

IpcServerController.IpcMain = ipcMain
IpcServerController.WebContentsGetter = () => BrowserWindow.getAllWindows().map((win) => win.webContents)

server.handle('emit', () => {
  server.send('hi', 'electron-ipc-flow')
  return sleep(500)
})
server.handle('hey', (who) => Promise.resolve(`hey ${who}`))
server.on('say', (_, who) => {
  CONTROLLER_EVENT_RESULTS.push(`say ${who}`)
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
