import assert from 'node:assert'
import path from 'node:path'
import { BrowserWindow, app, ipcMain } from 'electron'
import { IpcBroadcastController, IpcController } from '../../src/index.js'
import { broadcast, controller } from './controller.js'

async function createBrowserWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegrationInSubFrames: true,
    },
  })
  await win.loadFile(path.resolve(__dirname, 'index.html'))
  return win
}

async function getFrame() {
  return new Promise<Electron.WebFrameMain>((resolve) => {
    controller.once('say', (e) => {
      resolve(e.senderFrame)
    })
  })
}

function getWebFrameBody(webFrame: Electron.WebFrameMain) {
  return webFrame.executeJavaScript('document.body.textContent.trim().split("|")') as Promise<string[]>
}

function includeCount(strs: string[], need: string): number {
  return strs.filter((str) => str === need).length
}

async function runTest() {
  const win = await createBrowserWindow()
  const frame = await getFrame()
  broadcast.sendToFrame(frame.routingId, 'say', 'electron-ipc-flow')
  const body = await getWebFrameBody(frame)
  assert(includeCount(body, 'hello electron-ipc-flow.') === 1, 'test on sendToFrame')
  win.close()
}

process.env.ELECTRON_IPC_FLOW_DEBUG = 'true'

IpcBroadcastController.WebContentsGetter = () => BrowserWindow.getAllWindows().map((win) => win.webContents)
IpcController.ipcMain = ipcMain

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
