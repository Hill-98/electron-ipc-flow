import { app, BrowserWindow, ipcMain } from 'electron'
import assert from 'node:assert'
import path from 'node:path'
import { IpcController } from '../../src/index.js'
import controller from './controller.js'

const CONTROLLER_EVENT_RESULTS: string[] = []

async function createBrowserWindow () {
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

async function getWebContentsBody(webContents: Electron.WebContents): Promise<string[]> {
  return webContents.executeJavaScript('document.body.textContent.trim().split("|")')
}

function includeCount(strs: string[], need: string): number {
  return strs.filter((str) => str === need).length
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function runTest() {
  const win = await createBrowserWindow()
  await sleep(1000)
  const body1 = await getWebContentsBody(win.webContents)
  assert(includeCount(body1, 'Blocked by trust handler') === 2, 'test default trust handler')

  controller.trustHandler = (_, name) => name === 'hey' || name === 'hi'

  win.reload()
  await sleep(1000)
  const body2 = await getWebContentsBody(win.webContents)
  assert(includeCount(body2, 'hey electron-ipc-flow') === 1, 'test controller trust handler call pass')
  assert(includeCount(CONTROLLER_EVENT_RESULTS, 'hi electron-ipc-flow') === 1, 'test controller trust handler event pass')
  assert(includeCount(body2, 'Blocked by trust handler') === 1, 'test controller trust handler call block')
  assert(includeCount(CONTROLLER_EVENT_RESULTS, 'hello electron-ipc-flow') === 0, 'test controller trust handler event block')

  win.close()
}

process.env.ELECTRON_IPC_FLOW_DEBUG = 'true'

IpcController.ipcMain = ipcMain
IpcController.TrustHandler = () => Promise.resolve(false)

controller.on('hi', (_, who) => {
  CONTROLLER_EVENT_RESULTS.push(`hi ${who}`)
})

controller.on('hello', (_, who) => {
  CONTROLLER_EVENT_RESULTS.push(`hello ${who}`)
})

controller.handle('hey', (who) => Promise.resolve(`hey ${who}`))

controller.handle('say', (who) => `say ${who}`)

app.on('web-contents-created', (_, webContents) => {
  setImmediate(webContents.openDevTools.bind(webContents, { mode: 'detach' }))
})

app.on('window-all-closed', () => {
  app.quit()
})

app.whenReady().then(runTest).catch((err) => {
  console.error(err)
  process.exit(1)
})
