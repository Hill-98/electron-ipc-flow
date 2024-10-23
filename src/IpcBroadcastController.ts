import { debug, isNull } from './common.ts'

declare global {
  namespace globalThis {
    // noinspection ES6ConvertVarToLetConst
    var $IpcBroadcastController: GlobalIpcBroadcastController | undefined

    interface GlobalIpcBroadcastController {
      off (controllerName: string, name: string, listener: IpcBroadcastControllerListenerWithEvent): void

      on (controllerName: string, name: string, listener: IpcBroadcastControllerListenerWithEvent): void
    }
  }
}

export type IpcBroadcastControllerListener = (...args: any[]) => any
export type IpcBroadcastControllerEvents = Record<string, IpcBroadcastControllerListener>
export type IpcBroadcastControllerListenerWithEvent<T extends IpcBroadcastControllerListener = IpcBroadcastControllerListener> = (event: Electron.IpcRendererEvent, ...args: Parameters<T>) => ReturnType<T>
export type IpcBroadcastControllerKey<T extends IpcBroadcastControllerEvents> = Extract<keyof T, string>;

export type WebContentsGetter = () => Promise<Electron.WebContents[]>

const channelGenerator = (controller: string, name: string) => `IpcBroadcastController:${controller}:${name}`

async function getAllWebContents () {
  if (typeof process !== 'object' || process.type !== 'browser') {
    throw new Error('The current process is not the main process')
  }
  const electron = await import('electron')
  return electron.BrowserWindow.getAllWindows().map((w) => w.webContents)
}

function getGlobalIpcBroadcastController (): GlobalIpcBroadcastController {
  const global = typeof window !== 'undefined' ? window : globalThis
  isNull('IpcBroadcastController: Can\'t find the "globalThis.$IpcBroadcastController", Forgot to use "preloadInit" in the preload script?', global.$IpcBroadcastController)
  return global.$IpcBroadcastController
}

/**
 * This controller can send messages from the main process to all/specific renderer processes
 *
 * By default, messages are sent to all renderers. You can set the `webContentsGetter` to send messages only to specific renderers.
 *
 * The `webContentsGetter` needs to return a Promise that resolves to an array of `Electron.WebContents`.
 */
export class IpcBroadcastController<Events extends IpcBroadcastControllerEvents = any> {
  readonly name: string = ''

  webContentsGetter: WebContentsGetter | undefined

  #ipcRendererEventListeners = new Map<string, Function>()

  #eventsListeners = new Map<string, { listener: IpcBroadcastControllerListenerWithEvent, once: boolean }[]>()

  constructor (name: string) {
    if (name.trim() === '') {
      throw new SyntaxError('IpcBroadcastController: "name" cannot be an empty string.')
    }
    if (name.includes(':')) {
      throw new SyntaxError('IpcBroadcastController: "name" cannot contain ":".')
    }
    this.name = name
  }

  #addEventListener (event: string, listener: IpcBroadcastControllerListener, once = false) {
    if (!this.#ipcRendererEventListeners.has(event)) {
      const channel = this.#channel(event)
      const listener = this.#ipcRendererEventListener.bind(this, channel, event)
      getGlobalIpcBroadcastController().on(this.name, event, listener)
      this.#ipcRendererEventListeners.set(event, listener)
    }

    const listeners = [
      ...(this.#eventsListeners.get(event) ?? []),
      {
        listener,
        once,
      },
    ]
    this.#eventsListeners.set(event, listeners)
  }

  #channel (event: string) {
    return channelGenerator(this.name, event)
  }

  #ipcRendererEventListener (channel: string, name: string, event: Electron.IpcRendererEvent, ...args: any) {
    debug(`IpcController.#ipRendererEventListener: ${this.name}:${name}: received (channel: ${channel}) `)
    debug('params:', args)

    const listeners = this.#eventsListeners.get(name) ?? []
    const onceListeners = listeners.filter((item) => {
      try {
        item.listener(event, ...args)
      } catch (error) {
        debug(`IpcBroadcastController.#ipRendererEventListener: ${this.name}:${name}: catch error (channel: ${channel}) `)
        debug('error:', error)
      }
      return item.once
    })
    onceListeners.forEach((item) => {
      this.off(name as any, item.listener as any)
    })
  }

  /**
   * Can only be called in the renderer process
   */
  off<K extends IpcBroadcastControllerKey<Events>> (event: K, listener?: IpcBroadcastControllerListenerWithEvent<Events[K]>) {
    const handlers = (listener ? (this.#eventsListeners.get(event) ?? []) : []).filter((item) => item.listener !== listener)
    if (handlers.length === 0) {
      if (this.#ipcRendererEventListeners.has(event)) {
        getGlobalIpcBroadcastController().off(this.name, event, this.#ipcRendererEventListeners.get(event) as any)
      }
      this.#eventsListeners.delete(event)
    } else {
      this.#eventsListeners.set(event, handlers)
    }
  }

  /**
   * Can only be called in the renderer process
   */
  on<K extends IpcBroadcastControllerKey<Events>> (event: K, listener: IpcBroadcastControllerListenerWithEvent<Events[K]>) {
    this.#addEventListener(event, listener)
  }

  /**
   * Can only be called in the renderer process
   */
  once<K extends IpcBroadcastControllerKey<Events>> (event: K, listener: IpcBroadcastControllerListenerWithEvent<Events[K]>) {
    this.#addEventListener(event, listener, true)
  }

  /**
   * Can only be called in the main process
   */
  send<K extends IpcBroadcastControllerKey<Events>> (event: K, ...args: Parameters<Events[K]>) {
    const getter = this.webContentsGetter ?? getAllWebContents
    getter()
      .then((items) => {
        items.forEach((webContents) => {
          webContents.send(this.#channel(event), ...args)
        })
      })
      .catch((err) => {
        console.error(err)
      })
  }
}

export const preloadInit = function preloadInit (contextBridge: Electron.ContextBridge, ipcRenderer: Electron.IpcRenderer) {
  const obj = {
    name: 'GlobalIpcBroadcastController',
    off (controllerName: string, name: string, listener: IpcBroadcastControllerListenerWithEvent) {
      const channel = channelGenerator(controllerName, name)
      const funcName = `${this.name}.off`

      debug(`${funcName}: off: ${controllerName}:${name} (channel: ${channel})`)

      ipcRenderer.off(channel, listener)
    },
    on (controllerName: string, name: string, listener: IpcBroadcastControllerListenerWithEvent) {
      const channel = channelGenerator(controllerName, name)
      const funcName = `${this.name}.on`

      debug(`${funcName}: on: ${controllerName}:${name} (channel: ${channel})`)

      ipcRenderer.on(channel, listener)
    },
  }
  contextBridge.exposeInMainWorld('$IpcBroadcastController', obj satisfies GlobalIpcBroadcastController)
}
