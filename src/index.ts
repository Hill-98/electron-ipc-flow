import { isDebug } from './common.ts'
import { preloadInit as initIpcBroadcastController } from './IpcBroadcastController.ts'
import { preloadInit as initIpcController } from './IpcController.ts'

interface InitOptions {
  /**
   * Auto register `IpcController`, default is `true`.
   *
   * If you do not use it, you need to manually call `IpcController.register` in the preload script.
   *
   * If you want to strictly control which IPC each renderer can use, you can disable auto register.
   */
  autoRegisterIpcController: boolean
  /**
   * Global object required to initialize `IpcBroadcastController`, default is `false`.
   */
  initBroadcastController: boolean
}

/**
 * Initialize the required global objects (must be called in the preload script).
 */
export const preloadInit = (contextBridge: Electron.ContextBridge, ipcRenderer: Electron.IpcRenderer, options?: Partial<InitOptions>) => {
  const opt: InitOptions = {
    autoRegisterIpcController: true,
    initBroadcastController: false,
    ...(options ?? {}),
  }
  initIpcController(contextBridge, ipcRenderer, opt.autoRegisterIpcController)
  if (opt.initBroadcastController) {
    initIpcBroadcastController(contextBridge, ipcRenderer)
  }
  contextBridge.exposeInMainWorld('ELECTRON_IPC_FLOW_DEBUG', isDebug() ? 'true' : 'false')
}

export { IpcController } from './IpcController.ts'
export { IpcBroadcastController } from './IpcBroadcastController.ts'
export { TrustHandler, ErrorHandler } from './common.ts'
