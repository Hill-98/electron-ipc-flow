import assert from 'node:assert/strict'
import path from 'node:path'
import { BrowserWindow, app } from 'electron'
import { IpcServerController } from '../../src/index.js'
import { getWebContentsBody, includeCount, sleep } from '../common.js'
import { server } from './controller.js'

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
  const wins: Electron.BrowserWindow[] = []
  wins.push(await createBrowserWindow())
  server.send('say', 'electron-ipc-flow-1')
  wins.push(await createBrowserWindow())
  server.send('say', 'electron-ipc-flow-2')
  await sleep(1)
  server.webContentsGetter = () => [wins[1].webContents]
  server.send('say', 'electron-ipc-flow-3')
  await sleep(1)
  server.webContentsGetter = undefined
  await sleep(1)
  server.send('say', 'electron-ipc-flow-4')
  await sleep(1000)
  const body1 = await getWebContentsBody(wins[0].webContents)
  const body2 = await getWebContentsBody(wins[1].webContents)

  assert.strictEqual(includeCount(body1, 'hello electron-ipc-flow-1.'), 1, 'test on win1 (number: 1) (once: false)')
  assert.strictEqual(includeCount(body1, 'hello once electron-ipc-flow-1.'), 1, 'test on win1 (number: 1) (once: true)')
  assert.strictEqual(includeCount(body2, 'hello electron-ipc-flow-1.'), 0, 'test on win2 (number: 1) (once: false)')
  assert.strictEqual(includeCount(body2, 'hello once electron-ipc-flow-1.'), 0, 'test on win2 (number: 1) (once: true)')

  assert.strictEqual(includeCount(body1, 'hello electron-ipc-flow-2.'), 1, 'test on win1 (number: 2) (once: false)')
  assert.strictEqual(includeCount(body1, 'hello once electron-ipc-flow-2.'), 0, 'test on win1 (number: 2) (once: true)')
  assert.strictEqual(includeCount(body2, 'hello electron-ipc-flow-2.'), 1, 'test on win2 (number: 2) (once: false)')
  assert.strictEqual(includeCount(body2, 'hello once electron-ipc-flow-2.'), 1, 'test on win2 (number: 2) (once: true)')

  assert.strictEqual(includeCount(body1, 'hello electron-ipc-flow-3.'), 0, 'test on win1 (number: 3) (once: false)')
  assert.strictEqual(includeCount(body1, 'hello once electron-ipc-flow-3.'), 0, 'test on win1 (number: 3) (once: true)')
  assert.strictEqual(includeCount(body2, 'hello electron-ipc-flow-3.'), 1, 'test on win2 (number: 3) (once: false)')
  assert.strictEqual(includeCount(body2, 'hello once electron-ipc-flow-3.'), 0, 'test on win2 (number: 3) (once: true)')

  assert.strictEqual(includeCount(body1, 'hello electron-ipc-flow-4.'), 1, 'test on win1 (number: 4) (once: false)')
  assert.strictEqual(includeCount(body1, 'hello once electron-ipc-flow-4.'), 0, 'test on win1 (number: 4) (once: true)')
  assert.strictEqual(includeCount(body2, 'hello electron-ipc-flow-4.'), 1, 'test on win2 (number: 4) (once: false)')
  assert.strictEqual(includeCount(body2, 'hello once electron-ipc-flow-4.'), 0, 'test on win2 (number: 4) (once: true)')

  for (const win of wins) {
    win.close()
  }
}

process.env.ELECTRON_IPC_FLOW_DEBUG = 'true'

IpcServerController.WebContentsGetter = () =>
  Promise.resolve(BrowserWindow.getAllWindows().map((win) => win.webContents))

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
