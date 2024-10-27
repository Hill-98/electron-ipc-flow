import { contextBridge, ipcRenderer } from 'electron/renderer'
import { preloadInit } from '../../src/index.js'
import { client } from './controller1.js'

preloadInit(contextBridge, ipcRenderer, {
  autoRegister: false,
})

client.register()
