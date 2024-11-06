import type { AnyFunction, FunctionsObj, InvokeReturnObject, IpcEventListener, StringKey } from './common.ts'
import { ErrorHandler, InvokeReturnStatus, assertIsNull, channelGenerator, debug } from './common.ts'

declare global {
  namespace globalThis {
    // noinspection ES6ConvertVarToLetConst
    var $IpcClientController: GlobalIpcClientController | undefined

    interface GlobalIpcClientController {
      invoke(controllerName: string, name: string, ...args: any): Promise<InvokeReturnObject>

      on(controllerName: string, event: string, listener: RendererEventListener): void

      register?: (controllerName: string) => void

      send(controllerName: string, event: string, ...args: any): void
    }
  }
}

export type RendererEventListener<T extends AnyFunction = AnyFunction> = IpcEventListener<Electron.IpcRendererEvent, T>

export type RendererEventListeners<T extends FunctionsObj<T>> = {
  [P in keyof T]: RendererEventListener<T[P]>
}

export type ClientFunctionsProxy<T extends FunctionsObj<T>> = {
  readonly [P in keyof T]: (...args: Parameters<T[P]>) => Promise<Awaited<ReturnType<T[P]>>>
}

const IpcClientControllerRegistered = new Set<string>()

const functionsProxy: ProxyHandler<IpcClientController> = {
  get(target, p) {
    if (typeof p === 'string') {
      return target.invoke.bind(target, p)
    }
    return undefined
  },
}

const sendersProxy: ProxyHandler<IpcClientController> = {
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
  Functions extends FunctionsObj<Functions> = any,
  ClientEvents extends FunctionsObj<ClientEvents> = any,
  ServerEvents extends FunctionsObj<ServerEvents> = any,
> {
  readonly #name: string = ''

  readonly #functions: ClientFunctionsProxy<Functions> = new Proxy(this as any, functionsProxy)

  readonly #senders: Readonly<ServerEvents> = new Proxy(this as any, sendersProxy)

  readonly #debug = debug.bind(this)

  readonly #ipcRendererEventListeners = new Map<string, RendererEventListener>()

  readonly #eventsListeners = new Map<string, { listener: RendererEventListener; once: boolean }[]>()

  #listeners?: Partial<RendererEventListeners<ClientEvents>>

  /**
   * @param name {string} Controller name
   * @param listeners {Partial<RendererEventListeners<ClientEvents>>=} {@link listeners}
   */
  constructor(name: string, listeners?: Partial<RendererEventListeners<ClientEvents>>) {
    if (name.trim() === '') {
      throw new SyntaxError('IpcClientController: "name" cannot be an empty string.')
    }
    this.#name = name
    this.listeners = listeners

    const g = typeof globalThis === 'undefined' ? window : globalThis
    // 调用 preloadInit 时 autoRegister 参数为 true 时可用
    if (typeof g.$IpcClientController?.register === 'function') {
      this.#debug('auto register')
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
   * Usage: `IpcClientController.senders.[ServerEvent](...args)`
   */
  get senders() {
    return this.#senders
  }

  get listeners() {
    return this.#listeners
  }

  /**
   * Use the `on()` to set all properties of an object as event listeners, with the
   * property names being used as event names.
   *
   * If the value is set to `undefined` or if the property has been set previously, the
   * existing event listener will be removed using `off()` first.
   *
   * @see {on}
   * @see {off}
   */
  set listeners(value: Partial<RendererEventListeners<ClientEvents>> | undefined) {
    // noinspection DuplicatedCode
    if (typeof this.#listeners === 'object') {
      for (const event in this.#listeners) {
        if (this.#listeners[event]) {
          this.off(event, this.#listeners[event])
        }
      }
    }
    this.#listeners = value
    if (typeof this.#listeners === 'object') {
      for (const event in this.#listeners) {
        if (this.#listeners[event]) {
          this.on(event, this.#listeners[event])
        }
      }
    }
  }

  #addEventListener(event: StringKey<ClientEvents>, listener: AnyFunction, once = false) {
    if (!this.#ipcRendererEventListeners.has(event)) {
      this.#debug('add global event listener', null, event, 'c')

      const globalListener = this.#ipcRendererEventListener.bind(this, event)
      IpcClientController.#getGlobalIpcController().on(this.name, event, globalListener)
      this.#ipcRendererEventListeners.set(event, globalListener)
    }

    this.#debug('add event listener', { once }, event, 'c')

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
    this.#debug('received', { args }, event, 'c')

    const listeners = this.#eventsListeners.get(event) ?? []
    const onceListeners = listeners.filter((item) => {
      try {
        item.listener(eventObj, ...args)
      } catch (error) {
        this.#debug('catch error', error, event, 'c')
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
    this.#debug('invoke', { args }, name, 'i')

    const result = await IpcClientController.#getGlobalIpcController().invoke(this.name, name, ...args)

    this.#debug('received', result, name, 'i')

    if (result.status === InvokeReturnStatus.error) {
      throw ErrorHandler.deserialize(result.value)
    }

    return result.value
  }

  postMessage<K extends StringKey<ServerEvents>>(event: K, message: any, transfer?: MessagePort[]) {
    this.#debug('postMessage', { message }, event, 's')

    globalThis.postMessage(
      {
        $action: 'postMessage.send',
        controller: this.name,
        event,
        message,
      },
      '*',
      transfer,
    )
  }

  /**
   * Removes event listeners added using `on()` and `once()`.
   *
   * If the `listener` parameter is not provided, all listeners for
   * the corresponding event will be removed.
   */
  off<K extends StringKey<ClientEvents>>(event: K, listener?: RendererEventListener<ClientEvents[K]>) {
    if (!this.#ipcRendererEventListeners.has(event)) {
      return
    }

    this.#debug('remove event listener', null, event, 'c')

    /**
     * Why not use `IpcRenderer.off()` to remove the global event listener?
     *
     * Because the function passed from the renderer to the preload script cannot be equal.
     */
    const listeners = (listener ? (this.#eventsListeners.get(event) ?? []) : []).filter(
      (item) => item.listener !== listener,
    )
    this.#eventsListeners.set(event, listeners)
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
    this.#debug('send', { args }, event, 's')

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
    assertIsNull(
      'IpcClientController: Can\'t find the "globalThis.$IpcClientController", Forgot to use "preloadInit" in the preload script?',
      global.$IpcClientController,
    )
    return global.$IpcClientController
  }
}

export function preloadInit(ipcRenderer: Electron.IpcRenderer, autoRegister: boolean) {
  function checkControllerRegistered(controllerName: string) {
    if (!IpcClientControllerRegistered.has(controllerName)) {
      throw new RangeError(`IpcClientController "${controllerName}" not registered.`)
    }
  }

  // noinspection JSUnusedGlobalSymbols
  const obj = {
    invoke(controllerName: string, name: string, ...args: any[]) {
      checkControllerRegistered(controllerName)

      return ipcRenderer.invoke(channelGenerator(controllerName, name, 'i'), ...args)
    },
    on(controllerName: string, event: string, listener: RendererEventListener) {
      checkControllerRegistered(controllerName)

      ipcRenderer.on(channelGenerator(controllerName, event, 'c'), listener)
    },
    register(name: string) {
      IpcClientControllerRegistered.add(name)
    },
    send(controllerName: string, event: string, ...args: any[]) {
      checkControllerRegistered(controllerName)

      ipcRenderer.send(channelGenerator(controllerName, event, 's'), ...args)
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
