import type { AnyFunction, FunctionProperties, InvokeReturnObject, IpcEventListener } from './common.ts'
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

export type ClientFunctionReturnType<T extends AnyFunction> = Promise<Awaited<ReturnType<T>>>

export type RendererEventListener<T extends AnyFunction = AnyFunction> = IpcEventListener<Electron.IpcRendererEvent, T>

export type RendererEventListeners<T> = {
  [P in keyof T]: T[P] extends AnyFunction ? RendererEventListener<T[P]> : never
}

export type IpcClientControllerProxy<T> = {
  [K in FunctionProperties<T> as `\$${K}`]: T[K] extends AnyFunction
    ? (...args: Parameters<T[K]>) => ClientFunctionReturnType<T[K]>
    : never
}

const IpcClientControllerRegistered = new Set<string>()

/**
 * Controller used in the renderer process
 */
export class IpcClientController<
  Functions extends Record<any, any>,
  ClientEvents extends Record<any, any>,
  ServerEvents extends Record<any, any>,
> {
  readonly #name: string = ''

  readonly #debug = debug.bind(this)

  readonly #ipcRendererEventListeners = new Map<string, RendererEventListener>()

  readonly #eventsListeners = new Map<string, { listener: RendererEventListener; once: boolean }[]>()

  /**
   * @param name {string} Controller name
   */
  constructor(name: string) {
    if (name.trim() === '') {
      throw new SyntaxError('IpcClientController: "name" cannot be an empty string.')
    }
    this.#name = name

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

  #addEventListener(event: FunctionProperties<ClientEvents>, listener: AnyFunction, once = false) {
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

  #ipcRendererEventListener(
    event: FunctionProperties<ClientEvents>,
    eventObj: Electron.IpcRendererEvent,
    ...args: any
  ) {
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
  async invoke<K extends FunctionProperties<Functions>>(
    name: K,
    ...args: Parameters<Functions[K]>
  ): ClientFunctionReturnType<Functions[K]> {
    this.#debug('invoke', { args }, name, 'i')

    const result = await IpcClientController.#getGlobalIpcController().invoke(this.name, name, ...args)

    this.#debug('received', result, name, 'i')

    if (result.status === InvokeReturnStatus.error) {
      throw ErrorHandler.deserialize(result.value)
    }

    return result.value
  }

  postMessage<K extends FunctionProperties<ServerEvents>>(event: K, message: any, transfer?: MessagePort[]) {
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
  off<K extends FunctionProperties<ClientEvents>>(event: K, listener?: RendererEventListener<ClientEvents[K]>) {
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
  on<K extends FunctionProperties<ClientEvents>>(event: K, listener: RendererEventListener<ClientEvents[K]>) {
    this.#addEventListener(event, listener)
  }

  /**
   * Like `on()`, but the listener is removed after it is triggered once.
   *
   * @see {on}
   */
  once<K extends FunctionProperties<ClientEvents>>(event: K, listener: RendererEventListener<ClientEvents[K]>) {
    this.#addEventListener(event, listener, true)
  }

  /**
   * Uses `ipcRenderer.send()` to send to the server event listeners added with `IpcServerController.on()`.
   */
  send<K extends FunctionProperties<ServerEvents>>(event: K, ...args: Parameters<ServerEvents[K]>) {
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

export function createIpcClient<
  Functions extends Record<any, any> = any,
  ClientEvents extends Record<any, any> = any,
  ServerEvents extends Record<any, any> = any,
>(
  ...args: ConstructorParameters<typeof IpcClientController>
): IpcClientController<Functions, ClientEvents, ServerEvents> & IpcClientControllerProxy<Functions> {
  const controller = new IpcClientController<Functions, ClientEvents, ServerEvents>(...args)
  return new Proxy(controller, {
    get(target, p, receiver): any {
      if (typeof p === 'string' && p.startsWith('$')) {
        return target.invoke.bind(target, p.substring(1) as any)
      }
      const result = Reflect.get(target, p, receiver)
      return typeof result === 'function' ? result.bind(target) : result
    },
  }) as any
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
