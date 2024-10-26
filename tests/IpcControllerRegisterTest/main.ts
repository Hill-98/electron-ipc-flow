import assert from 'node:assert'
import path from 'node:path'
import { BrowserWindow, app, ipcMain } from 'electron'
import { IpcController } from '../../src/index.js'
import controller1 from './controller1.js'
import controller2 from './controller2.js'

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

function getWebContentsBody(webContents: Electron.WebContents) {
  return webContents.executeJavaScript('document.body.textContent.trim().split("|")') as Promise<string[]>
}

function includeCount(strs: string[], need: string): number {
  return strs.filter((str) => str === need).length
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function runTest() {
  const win = await createBrowserWindow()
  await sleep(1000)
  const body = await getWebContentsBody(win.webContents)

  assert(includeCount(body, 'say electron-ipc-flow 1') === 1, 'test registered controller call')
  assert(
    includeCount(body, 'GlobalIpcController.invoke: controller2: controller not registered.') === 1,
    'test not registered controller call',
  )
  assert(includeCount(CONTROLLER_EVENT_RESULTS, 'hi electron-ipc-flow 1') === 1, 'test registered controller event')
  assert(includeCount(CONTROLLER_EVENT_RESULTS, 'hi electron-ipc-flow 2') === 0, 'test not registered controller event')
  win.close()
}

process.env.ELECTRON_IPC_FLOW_DEBUG = 'true'

IpcController.ipcMain = ipcMain

controller1.handle('say', (who) => `say ${who} 1`)
controller1.on('hi', (_, who) => {
  CONTROLLER_EVENT_RESULTS.push(`hi ${who} 1`)
})

controller2.handle('say', (who) => `say ${who} 2`)
controller2.on('hi', (_, who) => {
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
