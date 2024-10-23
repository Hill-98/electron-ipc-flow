import { contextBridge, ipcRenderer } from 'electron/renderer'
import { preloadInit as init } from './index.ts'

init(contextBridge, ipcRenderer, {
  autoRegisterIpcController: true,
  initBroadcastController: true,
})
