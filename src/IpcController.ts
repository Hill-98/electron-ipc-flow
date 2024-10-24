import { debug, ErrorHandler, isNull, TrustHandler, TrustHandlerFunc } from './common.ts'

declare global {
  namespace globalThis {
    // noinspection ES6ConvertVarToLetConst
    var $IpcController: GlobalIpcController | undefined

    interface GlobalIpcController {
      invoke (controllerName: string, name: string, ...args: any): Promise<any>

      register: (name: string) => void | undefined

      send (controllerName: string, name: string, ...args: any): void
    }
  }
}

export enum Status {
  error,
  result
}

export interface InvokeHandlerReturnValue {
  status: Status
  value: any
}

export type IpcControllerHandler = (...args: any[]) => any
export type IpcControllerEvents = Record<string, IpcControllerHandler>
export type IpcControllerFunctions = Record<string, IpcControllerHandler>
export type IpcControllerHandlerWithEvent<T extends IpcControllerHandler = IpcControllerHandler> = (event: Electron.IpcMainInvokeEvent, ...args: Parameters<T>) => ReturnType<T>
export type IpcControllerKey<T extends IpcControllerFunctions | IpcControllerEvents> = Extract<keyof T, string>;
export type InvokeReturnType<T extends IpcControllerHandler> = ReturnType<T> extends Promise<any>
  ? ReturnType<T>
  : Promise<ReturnType<T>>
export type IpcControllerCallers<T extends IpcControllerFunctions> = {
  readonly [P in keyof T]: (...args: Parameters<T[P]>) => InvokeReturnType<T[P]>
}

const EventChannelSuffix = ':event'
const InvokeChannelSuffix = ':invoke'
const IpcControllerRegistered = new Set<string>()

const channelGenerator = (controller: string, name: string) => `IpcController:${controller}:${name}`
const ipcMainIsNull: (value: any) => asserts value is Electron.IpcMain = isNull.bind(this, 'IpcController: ipcMain is null.')

function getGlobalIpcController (): GlobalIpcController {
  const global = typeof window !== 'undefined' ? window : globalThis
  isNull('IpcController: Can\'t find the "globalThis.$IpcController", Forgot to use "preloadInit" in the preload script?', global.$IpcController)
  return global.$IpcController
}

const callersHandler: ProxyHandler<IpcController> = {
  get (target, p) {
    return target.invoke.bind(target, p as any)
  },
}

const handlersHandler: ProxyHandler<IpcController> = {
  set (target, p, newValue) {
    target.handle(p as any, newValue)
    return true
  },
}

/**
 * This controller can call functions defined in the main process from the renderer process or
 * send messages to the main process, and it has an optional trust handler.
 *
 * `callers` and `handlers` are `Proxy` objects used for elegantly calling `invoke()` and `handle()`.
 */
export class IpcController<Functions extends IpcControllerFunctions = any, Events extends IpcControllerEvents = any> {
  /**
   * `ipcMain` exported by the `electron` package, which must be set before using the controller.
   */
  static ipcMain: Electron.IpcMain | null = null

  readonly name: string = ''

  /**
   * Can only be used in the renderer process
   */
  readonly callers: IpcControllerCallers<Functions> = new Proxy(this as any, callersHandler)

  /**
   * Can only be used in the main process
   */
  readonly handlers: Functions = new Proxy(this as any, handlersHandler)

  /**
   * This controller specific trust handler
   *
   * @see {TrustHandler}
   */
  trustHandler: TrustHandlerFunc | undefined

  #ipcMainEventListeners = new Map<string, Function>()

  #eventsListeners = new Map<string, { listener: IpcControllerHandlerWithEvent, once: boolean }[]>()

  constructor (name: string) {
    if (name.trim() === '') {
      throw new SyntaxError('IpcController: "name" cannot be an empty string.')
    }
    this.name = name

    const g = typeof globalThis === 'undefined' ? window : globalThis
    // 调用 preloadInit 时 autoRegister 参数为 true 时可用
    if (typeof g.$IpcController?.register === 'function') {
      g.$IpcController.register(this.name)
    }
  }

  #addEventListener (event: string, listener: IpcControllerHandler, once = false) {
    ipcMainIsNull(IpcController.ipcMain)

    if (!this.#ipcMainEventListeners.has(event)) {
      const channel = this.#channel(event).concat(EventChannelSuffix)
      const listener = this.#ipcMainEventListener.bind(this, channel, event)
      IpcController.ipcMain.on(channel, listener)
      this.#ipcMainEventListeners.set(event, listener)
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

  #channel (name: string) {
    return channelGenerator(this.name, name)
  }

  async #ipcMainEventListener (channel: string, name: string, event: Electron.IpcMainInvokeEvent, ...args: any) {
    try {
      const trustHandler = this.trustHandler ?? TrustHandler
      if (!await trustHandler(this.name, name, 'event', event)) {
        debug(`IpcController.#ipcMainEventListener: ${this.name}:${name}: blocked (channel: ${channel})`)
        return
      }
    } catch (err) {
      console.error('An error occurred in the trust handler:', err)
      return
    }

    debug(`IpcController.#ipcMainEventListener: ${this.name}:${name}: received (channel: ${channel}) `)
    debug('params:', args)

    const listeners = this.#eventsListeners.get(name) ?? []
    const onceListeners = listeners.filter((item) => {
      try {
        item.listener(event, ...args)
      } catch (error) {
        debug(`IpcController.#ipcMainEventListener: ${this.name}:${name}: catch error (channel: ${channel}) `)
        debug('error:', error)
      }
      return item.once
    })
    onceListeners.forEach((item) => {
      this.off(name as any, item.listener as any)
    })
  }

  async #handle (channel: string, name: string, passEvent: boolean, func: IpcControllerHandler, event: Electron.IpcMainInvokeEvent, ...args: any): Promise<InvokeHandlerReturnValue> {
    debug(`IpcController.#handle: ${this.name}:${name}: received (channel: ${channel})`)
    debug('params:', args)

    try {
      const trustHandler = this.trustHandler ?? TrustHandler
      if (!await trustHandler(this.name, name, 'invoke', event)) {
        debug(`IpcController.#handle: ${this.name}:${name}: blocked (channel: ${channel})`)
        return {
          status: Status.error,
          value: ErrorHandler.serialize(new Error('InvokeController：Blocked by trust handler')),
        }
      }
    } catch (err) {
      console.error('An error occurred in the trust handler:', err)
      return {
        status: Status.error,
        value: ErrorHandler.serialize(new Error('InvokeController：Blocked by trust handler')),
      }
    }

    try {
      const result = await this.#tryPromise(passEvent ? func(event, ...args) : func(...args))
      debug(`IpcController.#handle: ${this.name}:${name}: send result (channel: ${channel})`)
      debug('result:', result)
      return {
        status: Status.result,
        value: result,
      }
    } catch (err) {
      debug(`IpcController.#handle: ${this.name}:${name}: catch error (channel: ${channel})`)
      debug('error:', err)
      return {
        status: Status.error,
        value: ErrorHandler.serialize(err),
      }
    }
  }

  #tryPromise (result: any): Promise<any> {
    if (result instanceof Promise) {
      return result.then(this.#tryPromise.bind(this))
    }
    return Promise.resolve(result)
  }

  /**
   * Can only be called in the main process
   */
  handle<K extends IpcControllerKey<Functions>> (name: K, handler: Functions[K]) {
    ipcMainIsNull(IpcController.ipcMain)
    const channel = this.#channel(name).concat(InvokeChannelSuffix)
    IpcController.ipcMain.handle(channel, this.#handle.bind(this, channel, name, false, handler))
  }

  /**
   * Can only be called in the main process
   *
   * Like `handle()`, it will just pass the event object.
   */
  handleWithEvent<K extends IpcControllerKey<Functions>> (name: K, handler: IpcControllerHandlerWithEvent<Functions[K]>) {
    ipcMainIsNull(IpcController.ipcMain)
    const channel = this.#channel(name).concat(InvokeChannelSuffix)
    IpcController.ipcMain.handle(channel, this.#handle.bind(this, channel, name, true, handler))
  }

  /**
   * Can only be called in the renderer process
   */
  invoke<K extends IpcControllerKey<Functions>> (name: K, ...args: Parameters<Functions[K]>): InvokeReturnType<Functions[K]> {
    return getGlobalIpcController().invoke(this.name, name, ...args) as InvokeReturnType<Functions[K]>
  }

  /**
   * Can only be called in the main process
   */
  off<K extends IpcControllerKey<Events>> (event: K, listener?: IpcControllerHandlerWithEvent<Functions[K]>) {
    ipcMainIsNull(IpcController.ipcMain)

    const handlers = (listener ? (this.#eventsListeners.get(event) ?? []) : []).filter((item) => item.listener !== listener)
    if (handlers.length === 0) {
      if (this.#ipcMainEventListeners.has(event)) {
        IpcController.ipcMain.off(
          this.#channel(event).concat(EventChannelSuffix),
          this.#ipcMainEventListeners.get(event) as any,
        )
      }
      this.#eventsListeners.delete(event)
    } else {
      this.#eventsListeners.set(event, handlers)
    }
  }

  /**
   * Can only be called in the main process
   */
  on<K extends IpcControllerKey<Events>> (event: K, listener: IpcControllerHandlerWithEvent<Events[K]>) {
    this.#addEventListener(event, listener)
  }

  /**
   * Can only be called in the main process
   */
  once<K extends IpcControllerKey<Events>> (event: K, listener: IpcControllerHandlerWithEvent<Events[K]>) {
    this.#addEventListener(event, listener, true)
  }

  /**
   * Can only be called in the renderer process
   */
  send<K extends IpcControllerKey<Events>> (event: K, ...args: Parameters<Events[K]>) {
    getGlobalIpcController().send(this.name, event, ...args)
  }

  /**
   * Can only be called in the preload script
   */
  register () {
    IpcControllerRegistered.add(this.name)
  }

  /**
   * Can only be called in the preload script
   */
  unregister () {
    IpcControllerRegistered.delete(this.name)
  }
}

export const preloadInit = function preloadInit (contextBridge: Electron.ContextBridge, ipcRenderer: Electron.IpcRenderer, autoRegister = false) {
  const obj = {
    name: 'GlobalIpcController',
    invoke (controllerName: string, name: string, ...args: any[]) {
      const channel = channelGenerator(controllerName, name).concat(InvokeChannelSuffix)
      const funcName = `${this.name}.invoke`

      if (!IpcControllerRegistered.has(controllerName)) {
        throw new RangeError(`${funcName}: ${controllerName}: controller not registered.`)
      }

      debug(`${funcName}: invoke: ${controllerName}:${name} (channel: ${channel})`)
      debug('params:', args)

      return ipcRenderer.invoke(channel, ...args)
        .then((data: InvokeHandlerReturnValue) => {
          debug(`${funcName}: received: ${controllerName}:${name} (channel: ${channel})`)
          debug('data:', data)
          return data.status === Status.error ? Promise.reject(ErrorHandler.deserialize(data.value)) : Promise.resolve(data.value)
        })
    },
    register (name: string) {
      if (name.trim() !== '' && !IpcControllerRegistered.has(name)) {
        debug(`${this.name}.register: ${name}`)
        IpcControllerRegistered.add(name)
      }
    },
    send (controllerName: string, name: string, ...args: any[]) {
      const channel = channelGenerator(controllerName, name).concat(EventChannelSuffix)
      const funcName = `${this.name}.send`

      if (!IpcControllerRegistered.has(controllerName)) {
        throw new RangeError(`${funcName}: ${controllerName}: controller not registered.`)
      }

      debug(`${funcName}: send: ${controllerName}:${name} (channel: ${channel})`)
      debug('params:', args)

      ipcRenderer.send(channel, ...args)
    },
  }

  if (!autoRegister) {
    Reflect.deleteProperty(obj, 'register')
  }
  contextBridge.exposeInMainWorld('$IpcController', obj satisfies GlobalIpcController)
}
