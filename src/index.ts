import { preloadInit as InitIpcClientController } from './IpcClientController.js'
import { isDebug } from './common.ts'

export interface InitOptions {
  /**
   * Auto register `IpcClientController`, default is `true`.
   *
   * If you do not use it, you need to manually call {@link IpcClientController.register} in the preload script.
   *
   * If you want to strictly control which IPC each renderer can use, you can disable auto register.
   */
  autoRegister?: boolean
  /**
   * If the value is greater than 0, use `contextBridge.exposeInIsolatedWorld` to
   * expose the global object in isolated world.
   *
   * require Electron 22+
   */
  isolatedWorldId?: number
}

/**
 * Initialize the required global objects (must be called in the preload script).
 */
export function preloadInit(
  contextBridge: Electron.ContextBridge,
  ipcRenderer: Electron.IpcRenderer,
  options?: InitOptions,
) {
  const opt: Required<InitOptions> = {
    autoRegister: true,
    isolatedWorldId: 0,
    ...(options ?? {}),
  }
  const items = [
    {
      api: isDebug() ? 'true' : 'false',
      key: 'ELECTRON_IPC_FLOW_DEBUG',
    },
    InitIpcClientController(ipcRenderer, opt.autoRegister),
  ]
  for (const item of items) {
    if (opt.isolatedWorldId > 0) {
      contextBridge.exposeInIsolatedWorld(opt.isolatedWorldId, item.key, item.api)
    } else {
      contextBridge.exposeInMainWorld(item.key, item.api)
    }
  }
}

export { IpcClientController, createIpcClient } from './IpcClientController.js'
export { IpcServerController, createIpcServer } from './IpcServerController.js'
export { ErrorHandler } from './common.ts'
