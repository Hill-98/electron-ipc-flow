import isPromise from 'is-promise'
import type { AnyFunction, FunctionsObj, InvokeReturnObject, IpcEventListener, StringKey } from './common.ts'
import { ErrorHandler, InvokeReturnStatus, assertIsNull, channelGenerator, debug } from './common.ts'

export type MainInvokeHandler<T extends AnyFunction> = (
  event: Electron.IpcMainInvokeEvent,
  ...args: Parameters<T>
) => ReturnType<T>

export type MainEventListener<T extends AnyFunction = AnyFunction> = IpcEventListener<Electron.IpcMainEvent, T>

export type MainEventListeners<T extends FunctionsObj<T>> = {
  [P in keyof T]: MainEventListener<T[P]>
}

export type TrustHandlerFunc = {
  (
    controller: IpcServerController,
    name: string,
    type: 'event',
    event: Electron.IpcMainInvokeEvent,
  ): Promise<boolean> | boolean
  (
    controller: IpcServerController,
    name: string,
    type: 'invoke',
    event: Electron.IpcMainInvokeEvent,
  ): Promise<boolean> | boolean
}

export type WebContentsGetterFunc = () => Promise<Electron.WebContents[]> | Electron.WebContents[]

const functionsProxy: ProxyHandler<IpcServerController> = {
  set(target, p, newValue) {
    if (typeof p === 'string') {
      target.handle(p, newValue)
      return true
    }
    return false
  },
}

const sendersProxy: ProxyHandler<IpcServerController> = {
  get(target, p) {
    if (typeof p === 'string') {
      return target.send.bind(target, p)
    }
    return undefined
  },
}

// noinspection JSUnusedGlobalSymbols
/**
 * Controller used in the main process
 *
 * The `Functions` generic defines the constraints for the handlers that can be added using `handle()`.
 *
 * The `ClientEvents` generic defines the constraints for the events that can be sent using the `send()`.
 *
 * The `ServerEvents` generic defines the constraints for the events that can be listened to using `on()`, `once()` and `off()`.
 */
export class IpcServerController<
  Functions extends FunctionsObj<Functions> = any,
  ClientEvents extends FunctionsObj<ClientEvents> = any,
  ServerEvents extends FunctionsObj<ServerEvents> = any,
> {
  /**
   * `IpcServerController` calls the trust handler when it receives a call or event.
   * If the trust handler returns false, an exception is thrown to the renderer process: "*Blocked by trust handler.*".
   *
   *
   * @see {trustHandler}
   */
  static TrustHandler: TrustHandlerFunc = () => true

  /**
   * Used to specify which renderers the `IpcServerController.send` method sends events to.
   * by default, it does not send to any renderers.
   *
   * @see {webContentsGetter}
   */
  static WebContentsGetter: WebContentsGetterFunc | undefined

  /**
   * `IpcMain` exported by the `electron` package, which must be set before using the controller.
   */
  static IpcMain: Electron.IpcMain | undefined

  /**
   * This controller specific trust handler.
   *
   * @see {TrustHandler}
   */
  trustHandler: TrustHandlerFunc | undefined

  /**
   * This controller specific webContents getter.
   *
   * @see {WebContentsGetter}
   */
  webContentsGetter: WebContentsGetterFunc | undefined

  readonly #name: string = ''

  readonly #functions: Functions = new Proxy(this as any, functionsProxy)

  readonly #senders: Readonly<ClientEvents> = new Proxy(this as any, sendersProxy)

  readonly #debug = debug.bind(this)

  readonly #ipcMainEventListeners = new Map<string, MainEventListener>()

  readonly #eventsListeners = new Map<string, { listener: MainEventListener; once: boolean }[]>()

  #handlers?: Partial<Functions>

  #listeners?: Partial<MainEventListeners<ServerEvents>>

  /**
   * @param name {string} Controller name
   * @param handlers {Partial<Functions>=} {@link handlers}
   * @param listeners {Partial<MainEventListeners<ServerEvents>>=} {@link listeners}
   */
  constructor(name: string, handlers?: Partial<Functions>, listeners?: Partial<MainEventListeners<ServerEvents>>) {
    if (name.trim() === '') {
      throw new SyntaxError('IpcBroadcastController: "name" cannot be an empty string.')
    }
    this.#name = name
    this.handlers = handlers
    this.listeners = listeners
  }

  /**
   * Controller name
   */
  get name() {
    return this.#name
  }

  /**
   * The proxy object for the `handle()` method.
   *
   * Usage: `IpcClientController.functions.[Function] = [handler]`
   */
  get functions() {
    return this.#functions
  }

  /**
   * The proxy object for the `send()` method.
   *
   * Usage: `IpcClientController.senders.[ClientEvent](...args)`
   */
  get senders() {
    return this.#senders
  }

  get handlers() {
    return this.#handlers
  }

  /**
   * Use the `handle()` to set all properties of an object as function handlers, with the
   * property names being used as function names.
   *
   * If the value is set to `undefined` or if the property has been set previously, the
   * existing function handler will be removed using `removeHandler()` first.
   *
   * @see {handle}
   * @see {removeHandler}
   */
  set handlers(value: Partial<Functions> | undefined) {
    if (typeof this.#handlers === 'object') {
      for (const name in this.#handlers) {
        this.removeHandler(name)
      }
    }
    this.#handlers = value
    if (typeof this.#handlers === 'object') {
      for (const name in this.#handlers) {
        if (this.#handlers[name]) {
          this.handle(name, this.#handlers[name])
        }
      }
    }
  }

  get listeners() {
    return this.#listeners
  }

  /**
   * Use the `on` method to set all properties of an object as event listeners, with the
   * property names being used as event names.
   *
   * If the value is set to `undefined` or if the property has been set previously, the
   * existing event listener will be removed using `off` first.
   *
   * @see {on}
   * @see {off}
   */
  set listeners(value: Partial<MainEventListeners<ServerEvents>> | undefined) {
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

  #clientEventChannel(event: string) {
    return channelGenerator(this.name, event, 'c')
  }

  #invokeChannel(name: string) {
    return channelGenerator(this.name, name, 'i')
  }

  #serverEventChannel(event: string) {
    return channelGenerator(this.name, event, 's')
  }

  #addEventListener(event: StringKey<ServerEvents>, listener: AnyFunction, once = false) {
    IpcServerController.#ipcMainIsNull(IpcServerController.IpcMain)

    const channel = this.#serverEventChannel(event)

    if (!this.#ipcMainEventListeners.has(event)) {
      this.#debug('add global event listener', null, event, 's')

      const globalListener = this.#ipcMainEventListener.bind(this, event)
      IpcServerController.IpcMain.on(channel, globalListener)
      this.#ipcMainEventListeners.set(event, globalListener)
    }

    this.#debug('add event listener', { once }, event, 's')

    const listeners = [
      ...(this.#eventsListeners.get(event) ?? []),
      {
        listener,
        once,
      },
    ]
    this.#eventsListeners.set(event, listeners)
  }

  async #ipcMainEventListener(event: StringKey<ServerEvents>, eventObj: Electron.IpcMainEvent, ...args: any) {
    try {
      const trust = (this.trustHandler ?? IpcServerController.TrustHandler)(this, event, 'event', eventObj)
      if (trust === false || !(await trust)) {
        this.#debug('blocked', null, event, 's')
        return
      }
    } catch (err) {
      console.error('An error occurred in the trust handler:', err)
      return
    }

    this.#debug('received', { args }, event, 's')

    const listeners = this.#eventsListeners.get(event) ?? []
    const onceListeners = listeners.filter((item) => {
      try {
        item.listener(eventObj, ...args)
      } catch (error) {
        this.#debug('catch error', error, event, 's')
      }
      return item.once
    })
    for (const item of onceListeners) {
      this.off(event, item.listener)
    }
  }

  #callWebContentsGetter(cb: (items: Electron.WebContents[]) => void) {
    try {
      const getter = (this.webContentsGetter ?? IpcServerController.WebContentsGetter ?? (() => []))()
      if (isPromise(getter)) {
        getter.then(cb).catch((err) => {
          console.error('An error occurred in the webContents getter:', err)
        })
      } else {
        cb(getter)
      }
    } catch (err) {
      console.error('An error occurred in the webContents getter:', err)
    }
  }

  async #handle(
    name: string,
    passEvent: boolean,
    func: AnyFunction,
    event: Electron.IpcMainInvokeEvent,
    ...args: any
  ): Promise<InvokeReturnObject> {
    this.#debug('received', { args }, name, 'i')

    try {
      const trust = (this.trustHandler ?? IpcServerController.TrustHandler)(this, name, 'invoke', event)
      if (trust === false || !(await trust)) {
        this.#debug('blocked', null, name, 'i')
        return {
          status: InvokeReturnStatus.error,
          value: ErrorHandler.serialize(new Error('Blocked by trust handler')),
        }
      }
    } catch (err) {
      console.error('An error occurred in the trust handler:', err)
      return {
        status: InvokeReturnStatus.error,
        value: ErrorHandler.serialize(new Error('Blocked by trust handler')),
      }
    }

    try {
      let value = this.#tryPromise(passEvent ? func(event, ...args) : func(...args))
      if (isPromise(value)) {
        value = await value
      }

      this.#debug('send result', { value }, name, 'i')

      return {
        status: InvokeReturnStatus.result,
        value,
      }
    } catch (err) {
      this.#debug('catch error', err, name, 'i')
      return {
        status: InvokeReturnStatus.error,
        value: ErrorHandler.serialize(err),
      }
    }
  }

  #send<K extends StringKey<ClientEvents>>(
    frameId: number | [number, number] | null,
    event: K,
    ...args: Parameters<ClientEvents[K]>
  ) {
    this.#callWebContentsGetter((items: Electron.WebContents[]) => {
      const channel = this.#clientEventChannel(event)
      for (const webContents of items) {
        this.#debug('send', { args, webContents: webContents.id, frameId: frameId }, event, 'c')

        try {
          if (frameId === null) {
            webContents.send(channel, ...args)
          } else {
            webContents.sendToFrame(frameId, channel, ...args)
          }
        } catch (err) {
          console.error(`An error occurred in the webContents.${frameId === null ? 'send' : 'sendToFrame'}:`, err)
        }
      }
    })
  }

  #tryPromise(result: any): Promise<any> | any {
    if (isPromise(result)) {
      return result.then(this.#tryPromise.bind(this))
    }
    return result
  }

  /**
   * Uses `IpcMain.handle()` to add a specific function handler.
   */
  handle<K extends StringKey<Functions>>(name: K, handler: Functions[K]) {
    IpcServerController.#ipcMainIsNull(IpcServerController.IpcMain)

    this.#debug('add function handler', null, name, 'i')

    IpcServerController.IpcMain.handle(this.#invokeChannel(name), this.#handle.bind(this, name, false, handler))
  }

  /**
   * Like `handle()`, it will just pass the event object.
   *
   * @see {handle}
   */
  handleWithEvent<K extends StringKey<Functions>>(name: K, handler: MainInvokeHandler<Functions[K]>) {
    IpcServerController.#ipcMainIsNull(IpcServerController.IpcMain)

    this.#debug('add function handler with event', null, name, 'i')

    IpcServerController.IpcMain.handle(this.#invokeChannel(name), this.#handle.bind(this, name, true, handler))
  }

  /**
   * Uses `IpcMain.removeHandler()` to remove a specific function handler.
   */
  removeHandler<K extends StringKey<Functions>>(name: K) {
    IpcServerController.#ipcMainIsNull(IpcServerController.IpcMain)

    this.#debug('remove function handler', null, name, 'i')

    IpcServerController.IpcMain.removeHandler(this.#invokeChannel(name))
  }

  /**
   * Removes event listeners added using `on()` and `once()`.
   *
   * If the `listener` parameter is not provided, all listeners for
   * the corresponding event will be removed.
   */
  off<K extends StringKey<ServerEvents>>(event: K, listener?: MainEventListener<ServerEvents[K]>) {
    if (!this.#ipcMainEventListeners.has(event)) {
      return
    }

    IpcServerController.#ipcMainIsNull(IpcServerController.IpcMain)

    const channel = this.#serverEventChannel(event)

    this.#debug('remove event listener', null, event, 's')

    const handlers = (listener ? (this.#eventsListeners.get(event) ?? []) : []).filter(
      (item) => item.listener !== listener,
    )
    if (handlers.length === 0) {
      const listener = this.#ipcMainEventListeners.get(event)
      if (listener) {
        this.#debug('remove global event listener', null, event, 's')

        IpcServerController.IpcMain.removeListener(channel, listener)
        this.#ipcMainEventListeners.delete(event)
      }
      this.#eventsListeners.delete(event)
    } else {
      this.#eventsListeners.set(event, handlers)
    }
  }

  /**
   * Adds a specific server event listener, where the first parameter of
   * the listener is of type `Electron.IpcMainEvent`.
   */
  on<K extends StringKey<ServerEvents>>(event: K, listener: MainEventListener<ServerEvents[K]>) {
    this.#addEventListener(event, listener)
  }

  /**
   * Like `on()`, but the listener is removed after it is triggered once.
   *
   * @see {on}
   */
  once<K extends StringKey<ServerEvents>>(event: K, listener: MainEventListener<ServerEvents[K]>) {
    this.#addEventListener(event, listener, true)
  }

  /**
   * Uses `WebContents.send()` to send to the server event listeners added with `IpcClientController.on()`.
   */
  send<K extends StringKey<ClientEvents>>(event: K, ...args: Parameters<ClientEvents[K]>) {
    this.#send(null, event, ...args)
  }

  /**
   * Like `send()`, but use `WebContents.sendToFrame()`.
   *
   * @see {send}
   */
  sendToFrame<K extends StringKey<ClientEvents>>(
    frameId: number | [number, number],
    event: K,
    ...args: Parameters<ClientEvents[K]>
  ) {
    this.#send(frameId, event, ...args)
  }

  static #ipcMainIsNull(v?: Electron.IpcMain | null): asserts v is Electron.IpcMain {
    assertIsNull('IpcServerController.IpcMain is null.', v)
  }
}
