import assert from 'node:assert/strict'
import path from 'node:path'
import { BrowserWindow, app, ipcMain } from 'electron'
import { IpcServerController } from '../../src/index.js'
import { sleep } from '../common.js'
import { server } from './controller.js'

async function createBrowserWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegrationInSubFrames: true,
    },
  })
  await win.loadFile(path.resolve(__dirname, 'index.html'))
  return win
}

async function getFrame() {
  return new Promise<Electron.WebFrameMain>((resolve) => {
    server.once('say', (e) => {
      resolve(e.senderFrame as Electron.WebFrameMain)
    })
  })
}

function getWebFrameBody(webFrame: Electron.WebFrameMain) {
  return webFrame.executeJavaScript(
    'document.body.textContent.trim().split("|").filter((v) => v.trim() !== "")',
  ) as Promise<string[]>
}

async function runTest() {
  const win = await createBrowserWindow()
  const frame = await getFrame()
  server.sendToFrame(frame.routingId, 'say', 'electron-ipc-flow')
  await sleep(1000)
  const body = await getWebFrameBody(frame)
  assert.strictEqual(JSON.stringify(body), JSON.stringify(['hello electron-ipc-flow.']), 'test on sendToFrame')
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
