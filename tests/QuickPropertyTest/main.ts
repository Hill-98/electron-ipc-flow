import assert from 'node:assert/strict'
import path from 'node:path'
import { BrowserWindow, app, ipcMain } from 'electron'
import { IpcServerController } from '../../src/index.js'
import { getWebContentsBody, includeCount, sleep } from '../common.js'
import { server } from './controller.js'

class AppIpc {
  readonly num: number

  constructor(num: number) {
    this.num = num
  }

  hey(who: string): Promise<string> {
    return Promise.resolve(`hey${this.num} ${who}`)
  }
}

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
  server.handlers = new AppIpc(1)

  const win = await createBrowserWindow()
  await sleep(2000)
  const body1 = await getWebContentsBody(win.webContents)

  assert.strictEqual(includeCount(body1, 'hey1 electron-ipc-flow'), 1, 'test hey call 1')

  server.handlers = {
    hey(who: string): Promise<string> {
      return Promise.resolve(`hey2 ${who}`)
    },
  }

  win.reload()
  await sleep(2000)
  const body2 = await getWebContentsBody(win.webContents)

  assert.strictEqual(includeCount(body2, 'hey2 electron-ipc-flow'), 1, 'test hey call 2')

  win.close()
}

process.env.ELECTRON_IPC_FLOW_DEBUG = 'true'

IpcServerController.IpcMain = ipcMain
IpcServerController.WebContentsGetter = () => BrowserWindow.getAllWindows().map((win) => win.webContents)

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
