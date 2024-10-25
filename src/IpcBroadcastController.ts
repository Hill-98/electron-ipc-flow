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

function getGlobalIpcBroadcastController (): GlobalIpcBroadcastController {
  const global = typeof window !== 'undefined' ? window : globalThis
  isNull('IpcBroadcastController: Can\'t find the "globalThis.$IpcBroadcastController", Forgot to use "preloadInit" in the preload script?', global.$IpcBroadcastController)
  return global.$IpcBroadcastController
}

/**
 * This controller can send messages from the main process to renderer processes.
 *
 * IpcBroadcastController has a static property WebContentsGetter, and each
 * controller instance also has a webContentsGetter property. They are function that return Promise<Electron.WebContents[]>.
 *
 * They are called before sending messages each time to get the renderers to which message can be sent.
 */
export class IpcBroadcastController<Events extends IpcBroadcastControllerEvents = any> {
  /**
   * The global WebContentsGetter will be used if the controller instance does not define webContentsGetter.
   * @see {webContentsGetter}
   */
  static WebContentsGetter: WebContentsGetter | undefined

  readonly name: string = ''

  /**
   * @see {WebContentsGetter}
   */
  webContentsGetter: WebContentsGetter | undefined

  #ipcRendererEventListeners = new Map<string, IpcBroadcastControllerListenerWithEvent>()

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

  #addEventListener (event: IpcBroadcastControllerKey<Events>, listener: IpcBroadcastControllerListener, once = false) {
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

  #ipcRendererEventListener (channel: string, name: IpcBroadcastControllerKey<Events>, event: Electron.IpcRendererEvent, ...args: any) {
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
      this.off(name, item.listener)
    })
  }

  /**
   * Can only be called in the renderer process
   */
  off<K extends IpcBroadcastControllerKey<Events>> (event: K, listener?: IpcBroadcastControllerListenerWithEvent<Events[K]>) {
    const handlers = (listener ? (this.#eventsListeners.get(event) ?? []) : []).filter((item) => item.listener !== listener)
    if (handlers.length === 0) {
      const listener = this.#ipcRendererEventListeners.get(event)
      if (listener) {
        getGlobalIpcBroadcastController().off(this.name, event, listener)
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
    const getter = this.webContentsGetter ?? IpcBroadcastController.WebContentsGetter ?? (() => Promise.resolve([]))
    getter()
      .then((items) => {
        const channel = this.#channel(event)
        items.forEach((webContents) => {
          debug(`IpcController.send: ${this.name}:${event}: send (channel: ${channel}) (webContents: ${webContents.id})`)
          debug('args:', args)

          webContents.send(channel, ...args)
        })
      })
      .catch((err) => {
        console.error('IpcBroadcastController.send: An error occurred in the webContents getter:', err)
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
