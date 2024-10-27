import type { AnyFunction, EventFunction, FunctionsObj, InvokeReturnObject, StringKey } from './common.ts'
import { ErrorHandler, InvokeReturnStatus, channelGenerator, debug, isNull } from './common.ts'

declare global {
  namespace globalThis {
    // noinspection ES6ConvertVarToLetConst
    var $IpcClientController: GlobalIpcClientController | undefined

    interface GlobalIpcClientController {
      invoke(controllerName: string, name: string, ...args: any): Promise<InvokeReturnObject>

      off(controllerName: string, name: string, listener: RendererEventListener): void

      on(controllerName: string, name: string, listener: RendererEventListener): void

      register?: (controllerName: string) => void

      send(controllerName: string, name: string, ...args: any): void
    }
  }
}

export type RendererEventListener<T extends AnyFunction = AnyFunction> = EventFunction<Electron.IpcRendererEvent, T>

export type ClientEventsProxy<T extends FunctionsObj> = {
  [P in keyof T]: RendererEventListener<T[P]>
}

export type ClientFunctionsProxy<T extends FunctionsObj> = {
  readonly [P in keyof T]: (...args: Parameters<T[P]>) => Promise<Awaited<ReturnType<T[P]>>>
}

const IpcClientControllerRegistered = new Set<string>()

const clientEventsProxy: ProxyHandler<IpcClientController> = {
  set(target, p, newValue) {
    if (typeof p === 'string') {
      target.on(p, newValue)
      return true
    }
    return false
  },
}

const functionsProxy: ProxyHandler<IpcClientController> = {
  get(target, p) {
    if (typeof p === 'string') {
      return target.invoke.bind(target, p)
    }
    return undefined
  },
}

const serverEventsProxy: ProxyHandler<IpcClientController> = {
  get(target, p) {
    if (typeof p === 'string') {
      return target.send.bind(target, p)
    }
    return undefined
  },
}

// noinspection JSUnusedGlobalSymbols
/**
 * Controller used in the renderer process
 *
 * The `Functions` generic defines the constraints for the functions that can be invoked using the invoke() method.
 *
 * The `ClientEvents` generic defines the constraints for the events that can be listened to using `on()`, `once()`, and `off()`.
 *
 * The `ServerEvents` generic defines the constraints for the events that can be sent using the `send()` method.
 */
export class IpcClientController<
  Functions extends FunctionsObj = any,
  ClientEvents extends FunctionsObj = any,
  ServerEvents extends FunctionsObj = any,
> {
  readonly #name: string = ''

  readonly #clientEvents: ClientEventsProxy<ClientEvents> = new Proxy(this as any, clientEventsProxy)

  readonly #functions: ClientFunctionsProxy<Functions> = new Proxy(this as any, functionsProxy)

  readonly #serverEvents: Readonly<ServerEvents> = new Proxy(this as any, serverEventsProxy)

  #ipcRendererEventListeners = new Map<string, RendererEventListener>()

  #eventsListeners = new Map<string, { listener: RendererEventListener; once: boolean }[]>()

  constructor(name: string) {
    if (name.trim() === '') {
      throw new SyntaxError('IpcClientController: "name" cannot be an empty string.')
    }
    this.#name = name

    const g = typeof globalThis === 'undefined' ? window : globalThis
    // 调用 preloadInit 时 autoRegister 参数为 true 时可用
    if (typeof g.$IpcClientController?.register === 'function') {
      g.$IpcClientController.register(this.name)
    }
  }

  /**
   * Controller name
   */
  get name() {
    return this.#name
  }

  /**
   * The proxy object for the `on()` method.
   *
   * Usage: `IpcClientController.clientEvents.[ClientEvent] = [listener]`
   */
  get clientEvents() {
    return this.#clientEvents
  }

  /**
   * The proxy object for the `invoke()` method.
   *
   * Usage: `IpcClientController.functions.[Function](...args)`
   */
  get functions() {
    return this.#functions
  }

  /**
   * The proxy object for the `send()` method.
   *
   * Usage: `IpcClientController.serverEvents.[ServerEvent](...args)`
   */
  get serverEvents() {
    return this.#serverEvents
  }

  #clientEventChannel(event: string) {
    return channelGenerator(this.name, event, 'ClientEvent')
  }

  #invokeChannel(name: string) {
    return channelGenerator(this.name, name, 'Invoke')
  }

  #serverEventChannel(event: string) {
    return channelGenerator(this.name, event, 'ServerEvent')
  }

  #addEventListener(event: StringKey<ClientEvents>, listener: AnyFunction, once = false) {
    const channel = this.#clientEventChannel(event)

    if (!this.#ipcRendererEventListeners.has(event)) {
      debug(`IpcClientController.#addEventListener: ${this.name}:${event}: add global listener (channel: ${channel})`)

      const listener = this.#ipcRendererEventListener.bind(this, event)
      IpcClientController.#getGlobalIpcController().on(this.name, event, listener)
      this.#ipcRendererEventListeners.set(event, listener)
    }

    debug(
      `IpcClientController.#addEventListener: ${this.name}:${event}: add listener (once: ${once}) (channel: ${channel})`,
    )

    const listeners = [
      ...(this.#eventsListeners.get(event) ?? []),
      {
        listener,
        once,
      },
    ]
    this.#eventsListeners.set(event, listeners)
  }

  #ipcRendererEventListener(event: StringKey<ClientEvents>, eventObj: Electron.IpcRendererEvent, ...args: any) {
    const channel = this.#clientEventChannel(event)

    debug(`IpcClientController.#ipRendererEventListener: ${this.name}:${event}: received (channel: ${channel}) `)
    debug('args:', args)

    const listeners = this.#eventsListeners.get(event) ?? []
    const onceListeners = listeners.filter((item) => {
      try {
        item.listener(eventObj, ...args)
      } catch (error) {
        debug(`IpcClientController.#ipRendererEventListener: ${this.name}:${event}: catch error (channel: ${channel}) `)
        debug('error:', error)
      }
      return item.once
    })
    for (const item of onceListeners) {
      this.off(event, item.listener)
    }
  }

  /**
   * Use `ipcRenderer.invoke()` to call the function defined by `IpcServerController.handle()`.
   */
  async invoke<K extends StringKey<Functions>>(
    name: K,
    ...args: Parameters<Functions[K]>
  ): Promise<Awaited<ReturnType<Functions[K]>>> {
    const channel = this.#invokeChannel(name)

    debug(`IpcClientController.invoke: ${this.name}:${name}: invoke (channel: ${channel})`)
    debug('args:', args)

    const result = await IpcClientController.#getGlobalIpcController().invoke(this.name, name, ...args)

    debug(`IpcClientController.invoke: ${this.name}:${name}: received result (channel: ${channel})`)
    debug('status:', result.status)
    debug('value:', result.value)

    if (result.status === InvokeReturnStatus.error) {
      throw ErrorHandler.deserialize(result.value)
    }

    return result.value
  }

  /**
   * Removes event listeners added using `on()` and `once()`.
   *
   * If the `listener` parameter is not provided, all listeners for
   * the corresponding event will be removed.
   */
  off<K extends StringKey<ClientEvents>>(event: K, listener?: RendererEventListener<ClientEvents[K]>) {
    const channel = this.#clientEventChannel(event)

    debug(`IpcClientController.off: ${this.name}:${event}: off listener (channel: ${channel})`)

    const handlers = (listener ? (this.#eventsListeners.get(event) ?? []) : []).filter(
      (item) => item.listener !== listener,
    )
    if (handlers.length === 0) {
      const listener = this.#ipcRendererEventListeners.get(event)
      if (listener) {
        debug(`IpcClientController.off: ${this.name}:${event}: off global listener (channel: ${channel})`)

        IpcClientController.#getGlobalIpcController().off(this.name, event, listener)
      }
      this.#eventsListeners.delete(event)
    } else {
      this.#eventsListeners.set(event, handlers)
    }
  }

  /**
   * Adds a specific client event listener, where the first parameter of
   * the listener is of type `Electron.IpcRendererEvent`.
   */
  on<K extends StringKey<ClientEvents>>(event: K, listener: RendererEventListener<ClientEvents[K]>) {
    this.#addEventListener(event, listener)
  }

  /**
   * Like `on()`, but the listener is removed after it is triggered once.
   *
   * @see {on}
   */
  once<K extends StringKey<ClientEvents>>(event: K, listener: RendererEventListener<ClientEvents[K]>) {
    this.#addEventListener(event, listener, true)
  }

  /**
   * Uses `ipcRenderer.send()` to send to the server event listeners added with `IpcServerController.on()`.
   */
  send<K extends StringKey<ServerEvents>>(event: K, ...args: Parameters<ServerEvents[K]>) {
    debug(`IpcClientController.send: ${this.name}:${event}: send (channel: ${this.#serverEventChannel(event)})`)
    debug('args:', args)

    IpcClientController.#getGlobalIpcController().send(this.name, event, ...args)
  }

  /**
   * If auto register is not enabled, use this method in the
   * **preload script** to manually register the controller.
   */
  register() {
    IpcClientControllerRegistered.add(this.name)
  }

  /**
   * Can use this method in the **preload script** to unregister the controller
   */
  unregister() {
    IpcClientControllerRegistered.delete(this.name)
  }

  static #getGlobalIpcController(): GlobalIpcClientController {
    const global = typeof window !== 'undefined' ? window : globalThis
    isNull(
      'IpcClientController: Can\'t find the "globalThis.$IpcClientController", Forgot to use "preloadInit" in the preload script?',
      global.$IpcClientController,
    )
    return global.$IpcClientController
  }
}

export function preloadInit(ipcRenderer: Electron.IpcRenderer, autoRegister: boolean) {
  // noinspection JSUnusedGlobalSymbols
  const obj = {
    name: 'GlobalIpcController',
    invoke(controllerName: string, name: string, ...args: any[]) {
      if (!IpcClientControllerRegistered.has(controllerName)) {
        throw new RangeError(`${this.name}.invoke: ${controllerName}: controller not registered.`)
      }

      return ipcRenderer.invoke(channelGenerator(controllerName, name, 'Invoke'), ...args)
    },
    off(controllerName: string, name: string, listener: RendererEventListener) {
      if (!IpcClientControllerRegistered.has(controllerName)) {
        throw new RangeError(`${this.name}.off: ${controllerName}: controller not registered.`)
      }

      ipcRenderer.off(channelGenerator(controllerName, name, 'ClientEvent'), listener)
    },
    on(controllerName: string, name: string, listener: RendererEventListener) {
      if (!IpcClientControllerRegistered.has(controllerName)) {
        throw new RangeError(`${this.name}.on: ${controllerName}: controller not registered.`)
      }

      ipcRenderer.on(channelGenerator(controllerName, name, 'ClientEvent'), listener)
    },
    register(name: string) {
      if (name.trim() !== '' && !IpcClientControllerRegistered.has(name)) {
        debug(`${this.name}.register: ${name}`)
        IpcClientControllerRegistered.add(name)
      }
    },
    send(controllerName: string, name: string, ...args: any[]) {
      if (!IpcClientControllerRegistered.has(controllerName)) {
        throw new RangeError(`${this.name}.send: ${controllerName}: controller not registered.`)
      }

      ipcRenderer.send(channelGenerator(controllerName, name, 'ServerEvent'), ...args)
    },
  }

  if (!autoRegister) {
    Reflect.deleteProperty(obj, 'register')
  }

  return {
    api: obj satisfies GlobalIpcClientController,
    key: '$IpcClientController',
  }
}