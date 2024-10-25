import { app, BrowserWindow, ipcMain } from 'electron'
import assert from 'node:assert'
import path from 'node:path'
import { IpcController } from '../../src/index.js'
import { controller, handlers } from './controller.js'

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
  const body = await getWebContentsBody(win.webContents)

  assert(includeCount(body, 'hey electron-ipc-flow') === 1, 'test hey call')
  assert(includeCount(body, 'say electron-ipc-flow') === 1, 'test say call')
  assert(includeCount(CONTROLLER_EVENT_RESULTS, 'hi electron-ipc-flow') === 3, 'test send event')
  assert(includeCount(CONTROLLER_EVENT_RESULTS, 'hi electron-ipc-flow once') === 1, 'test send once event')
  assert(includeCount(CONTROLLER_EVENT_RESULTS, 'hi electron-ipc-flow off') === 1, 'test send and off event')
  win.close()
}

process.env.ELECTRON_IPC_FLOW_DEBUG = 'true'

IpcController.ipcMain = ipcMain

controller.on('hi', (_, who) => {
  CONTROLLER_EVENT_RESULTS.push(`hi ${who}`)
})

const hi = (_: Electron.IpcMainEvent, who: string) => {
  CONTROLLER_EVENT_RESULTS.push(`hi ${who} off`)
  controller.off('hi', hi)
}

controller.on('hi', hi)

controller.once('hi', (_, who) => {
  CONTROLLER_EVENT_RESULTS.push(`hi ${who} once`)
})

handlers.hey = (who) => Promise.resolve(`hey ${who}`)

handlers.say = (who) => `say ${who}`

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
