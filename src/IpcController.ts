import { debug, ErrorHandler, isNull, TrustHandler, TrustHandlerFunc } from './common.ts'

declare global {
  namespace globalThis {
    // noinspection ES6ConvertVarToLetConst
    var $IpcController: GlobalIpcController | undefined

    interface GlobalIpcController {
      invoke(controllerName: string, name: string, ...args: any): Promise<InvokeHandlerReturnValue>

      register: (name: string) => void | undefined

      send (controllerName: string, name: string, ...args: any): void
    }
  }
}

export enum Status {
  error,
  result
}

export interface InvokeHandlerReturnValue<T = any> {
  status: Status
  value: T
}

export type IpcControllerHandler = (...args: any[]) => any
export type IpcControllerEvents = Record<string, IpcControllerHandler>
export type IpcControllerFunctions = Record<string, IpcControllerHandler>
export type IpcControllerInvokeHandler<T extends IpcControllerHandler = IpcControllerHandler> = (event: Electron.IpcMainInvokeEvent, ...args: Parameters<T>) => ReturnType<T>
export type IpcControllerEventHandler<T extends IpcControllerHandler = IpcControllerHandler> = (event: Electron.IpcMainEvent, ...args: Parameters<T>) => ReturnType<T>
export type IpcControllerKey<T extends IpcControllerFunctions | IpcControllerEvents> = Extract<keyof T, string>;
export type IpcControllerCallers<T extends IpcControllerFunctions> = {
  readonly [P in keyof T]: (...args: Parameters<T[P]>) => Promise<Awaited<ReturnType<T[P]>>>
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
    if (typeof p === 'string') {
      return target.invoke.bind(target, p)
    }
    return undefined
  },
}

const handlersHandler: ProxyHandler<IpcController> = {
  set (target, p, newValue) {
    if (typeof p === 'string') {
      target.handle(p, newValue)
      return true
    }
    return false
  },
}

/**
 * This controller can call functions defined in the main process from the renderer process or
 * send messages to the main process, and it has an optional trust handler.
 *
 * `calls` and `handlers` are `Proxy` objects used for elegantly calling `invoke()` and `handle()`.
 */
export class IpcController<Functions extends IpcControllerFunctions = any, Events extends IpcControllerEvents = any> {
  /**
   * `ipcMain` exported by the `electron` package, which must be set before using the controller.
   */
  static ipcMain: Electron.IpcMain | undefined

  readonly name: string = ''

  /**
   * Can only be used in the renderer process
   */
  readonly calls: IpcControllerCallers<Functions> = new Proxy(this as any, callersHandler)

  /**
   * @deprecated Please use calls.
   * @see {calls}
   */
  readonly callers = this.calls

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

  #ipcMainEventListeners = new Map<string, IpcControllerEventHandler>()

  #eventsListeners = new Map<string, { listener: IpcControllerEventHandler, once: boolean }[]>()

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

  #addEventListener (event: IpcControllerKey<Events>, listener: IpcControllerHandler, once = false) {
    ipcMainIsNull(IpcController.ipcMain)

    if (!this.#ipcMainEventListeners.has(event)) {
      const channel = this.#eventChannel(event)
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

  #eventChannel (name: string) {
    return channelGenerator(this.name, name).concat(EventChannelSuffix)
  }

  #invokeChannel (name: string) {
    return channelGenerator(this.name, name).concat(InvokeChannelSuffix)
  }

  async #ipcMainEventListener (channel: string, name: IpcControllerKey<Events>, event: Electron.IpcMainEvent, ...args: any) {
    try {
      const trustHandler = this.trustHandler ?? TrustHandler
      if (!await trustHandler(this, name, 'event', event)) {
        debug(`IpcController.#ipcMainEventListener: ${this.name}:${name}: blocked (channel: ${channel})`)
        return
      }
    } catch (err) {
      console.error('An error occurred in the trust handler:', err)
      return
    }

    debug(`IpcController.#ipcMainEventListener: ${this.name}:${name}: received (channel: ${channel}) `)
    debug('args:', args)

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
      this.off(name, item.listener)
    })
  }

  async #handle (channel: string, name: string, passEvent: boolean, func: IpcControllerHandler, event: Electron.IpcMainInvokeEvent, ...args: any): Promise<InvokeHandlerReturnValue> {
    debug(`IpcController.#handle: ${this.name}:${name}: received (channel: ${channel})`)
    debug('args:', args)

    try {
      const trustHandler = this.trustHandler ?? TrustHandler
      if (!await trustHandler(this, name, 'invoke', event)) {
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
      const value = await this.#tryPromise(passEvent ? func(event, ...args) : func(...args))
      debug(`IpcController.#handle: ${this.name}:${name}: send result (channel: ${channel})`)
      debug('value:', value)
      return {
        status: Status.result,
        value,
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
    const channel = this.#invokeChannel(name)
    IpcController.ipcMain.handle(channel, this.#handle.bind(this, channel, name, false, handler))
  }

  /**
   * Can only be called in the main process
   *
   * Like `handle()`, it will just pass the event object.
   */
  handleWithEvent<K extends IpcControllerKey<Functions>> (name: K, handler: IpcControllerInvokeHandler<Functions[K]>) {
    ipcMainIsNull(IpcController.ipcMain)
    const channel = this.#invokeChannel(name)
    IpcController.ipcMain.handle(channel, this.#handle.bind(this, channel, name, true, handler))
  }

  /**
   * Can only be called in the renderer process
   */
  async invoke<K extends IpcControllerKey<Functions>> (name: K, ...args: Parameters<Functions[K]>): Promise<Awaited<ReturnType<Functions[K]>>> {
    const result = await getGlobalIpcController().invoke(this.name, name, ...args)

    debug(`IpcController.invoke: ${this.name}:${name}: received result (channel: ${this.#invokeChannel(name)})`)
    debug('status:', result.status)
    debug('value:', result.value)

    if (result.status === Status.error) {
      throw ErrorHandler.deserialize(result.value)
    }

    return result.value
  }

  /**
   * Can only be called in the main process
   */
  off<K extends IpcControllerKey<Events>> (event: K, listener?: IpcControllerEventHandler<Functions[K]>) {
    ipcMainIsNull(IpcController.ipcMain)

    const handlers = (listener ? (this.#eventsListeners.get(event) ?? []) : []).filter((item) => item.listener !== listener)
    if (handlers.length === 0) {
      const listener = this.#ipcMainEventListeners.get(event)
      if (listener) {
        IpcController.ipcMain.off(this.#eventChannel(event), listener)
      }
      this.#eventsListeners.delete(event)
    } else {
      this.#eventsListeners.set(event, handlers)
    }
  }

  /**
   * Can only be called in the main process
   */
  on<K extends IpcControllerKey<Events>> (event: K, listener: IpcControllerEventHandler<Events[K]>) {
    this.#addEventListener(event, listener)
  }

  /**
   * Can only be called in the main process
   */
  once<K extends IpcControllerKey<Events>> (event: K, listener: IpcControllerEventHandler<Events[K]>) {
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

export function preloadInit (contextBridge: Electron.ContextBridge, ipcRenderer: Electron.IpcRenderer, autoRegister: boolean) {
  const obj = {
    name: 'GlobalIpcController',
    invoke (controllerName: string, name: string, ...args: any[]) {
      const channel = channelGenerator(controllerName, name).concat(InvokeChannelSuffix)
      const funcName = `${this.name}.invoke`

      if (!IpcControllerRegistered.has(controllerName)) {
        throw new RangeError(`${funcName}: ${controllerName}: controller not registered.`)
      }

      debug(`${funcName}: ${controllerName}:${name}: invoke (channel: ${channel})`)
      debug('args:', args)

      return ipcRenderer.invoke(channel, ...args)
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

      debug(`${funcName}: ${controllerName}:${name} send (channel: ${channel})`)
      debug('args:', args)

      ipcRenderer.send(channel, ...args)
    },
  }

  if (!autoRegister) {
    Reflect.deleteProperty(obj, 'register')
  }
  contextBridge.exposeInMainWorld('$IpcController', obj satisfies GlobalIpcController)
}
