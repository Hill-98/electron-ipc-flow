import { contextBridge, ipcRenderer } from 'electron/renderer'
import { preloadInit } from '../../src/index.js'

preloadInit(contextBridge, ipcRenderer)
