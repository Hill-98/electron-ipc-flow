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
  autoRegisterIpcController?: boolean
  /**
   * If the value is greater than 0, use `contextBridge.exposeInIsolatedWorld` to expose the global object in isolated world.
   */
  isolatedWorldId?: number
  /**
   * Global object required to initialize `IpcBroadcastController`, default is `false`.
   */
  initBroadcastController?: boolean
}

export interface PreloadInitResult {
  api: any
  key: string
}

/**
 * Initialize the required global objects (must be called in the preload script).
 */
export function preloadInit (contextBridge: Electron.ContextBridge, ipcRenderer: Electron.IpcRenderer, options?: InitOptions) {
  const opt: Required<InitOptions> = {
    autoRegisterIpcController: true,
    isolatedWorldId: 0,
    initBroadcastController: false,
    ...(options ?? {}),
  }
  const items: PreloadInitResult[] = [
    {
      api: isDebug() ? 'true' : 'false',
      key: 'ELECTRON_IPC_FLOW_DEBUG',
    },
    initIpcController(ipcRenderer, opt.autoRegisterIpcController),
  ]
  if (opt.initBroadcastController) {
    items.push(initIpcBroadcastController(ipcRenderer))
  }
  items.forEach((item) => {
    if (opt.isolatedWorldId > 0) {
      contextBridge.exposeInIsolatedWorld(opt.isolatedWorldId, item.key, item.api)
    } else {
      contextBridge.exposeInMainWorld(item.key, item.api)
    }
  })
}

export { IpcController } from './IpcController.ts'
export { IpcBroadcastController } from './IpcBroadcastController.ts'
export { ErrorHandler } from './common.ts'
