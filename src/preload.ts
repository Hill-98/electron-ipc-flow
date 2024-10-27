import { contextBridge, ipcRenderer } from 'electron/renderer'
import { preloadInit as init } from './index.ts'

init(contextBridge, ipcRenderer, {
  autoRegister: true,
})
