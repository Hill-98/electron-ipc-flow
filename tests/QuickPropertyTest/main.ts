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
  server.handlers = {
    hey(who: string): Promise<string> {
      return Promise.resolve(`hey1 ${who}`)
    },
  }
  server.listeners = {
    say(_, who) {
      CONTROLLER_EVENT_RESULTS.push(`say1 ${who}`)
    },
  }

  const win = await createBrowserWindow()
  await sleep(2000)
  const body1 = await getWebContentsBody(win.webContents)

  assert.strictEqual(includeCount(body1, 'hey1 electron-ipc-flow'), 1, 'test hey call 1')
  assert.strictEqual(includeCount(body1, 'hi1 electron-ipc-flow'), 1, 'test hi1 event listener 1')
  assert.strictEqual(includeCount(body1, 'hi2 electron-ipc-flow'), 1, 'test hi2 event listener 1')
  assert.strictEqual(includeCount(CONTROLLER_EVENT_RESULTS, 'say1 electron-ipc-flow'), 1, 'test say event listener 1')

  server.handlers = {
    hey(who: string): Promise<string> {
      return Promise.resolve(`hey2 ${who}`)
    },
  }
  server.listeners = {
    say(_, who) {
      CONTROLLER_EVENT_RESULTS.push(`say2 ${who}`)
    },
  }

  win.reload()
  await sleep(2000)
  const body2 = await getWebContentsBody(win.webContents)

  assert.strictEqual(includeCount(body2, 'hey2 electron-ipc-flow'), 1, 'test hey call 2')
  assert.strictEqual(includeCount(body2, 'hi1 electron-ipc-flow'), 1, 'test hi1 event listener 2')
  assert.strictEqual(includeCount(body2, 'hi2 electron-ipc-flow'), 1, 'test hi2 event listener 2')
  assert.strictEqual(includeCount(CONTROLLER_EVENT_RESULTS, 'say2 electron-ipc-flow'), 1, 'test say event listener 2')

  win.close()
}

process.env.ELECTRON_IPC_FLOW_DEBUG = 'true'

IpcServerController.IpcMain = ipcMain
IpcServerController.WebContentsGetter = () => BrowserWindow.getAllWindows().map((win) => win.webContents)

server.handle('emit', () => {
  server.send('hi', 'electron-ipc-flow')
  return sleep(500)
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
