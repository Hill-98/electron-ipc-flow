import { contextBridge, ipcRenderer } from 'electron/renderer'
import { preloadInit } from '../../src/index.js'
import controller1 from './controller1.js'

preloadInit(contextBridge, ipcRenderer, {
  autoRegisterIpcController: false,
})

controller1.register()
