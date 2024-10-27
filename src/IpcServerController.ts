import isPromise from 'is-promise'
import type { AnyFunction, EventFunction, FunctionsObj, InvokeReturnObject, StringKey } from './common.ts'
import { ErrorHandler, InvokeReturnStatus, channelGenerator, debug, isNull } from './common.ts'

export type MainInvokeHandler<T extends AnyFunction = AnyFunction> = EventFunction<Electron.IpcMainInvokeEvent, T>

export type MainEventListener<T extends AnyFunction = AnyFunction> = EventFunction<Electron.IpcMainEvent, T>

export type ServerEventsProxy<T extends FunctionsObj> = {
  [P in keyof T]: MainEventListener<T[P]>
}

export type TrustHandlerFunc = (
  controller: IpcServerController,
  name: string,
  type: 'event' | 'invoke',
  event: Electron.IpcMainInvokeEvent,
) => Promise<boolean> | boolean

export type WebContentsGetterFunc = () => Promise<Electron.WebContents[]> | Electron.WebContents[]

const ipcMainIsNull: (value: any) => asserts value is Electron.IpcMain = isNull.bind(
  this,
  'IpcServerController.IpcMain is null.',
)

const clientEventsProxy: ProxyHandler<IpcServerController> = {
  get(target, p) {
    if (typeof p === 'string') {
      return target.send.bind(target, p)
    }
    return undefined
  },
}

const functionsProxy: ProxyHandler<IpcServerController> = {
  set(target, p, newValue) {
    if (typeof p === 'string') {
      target.handle(p, newValue)
      return true
    }
    return false
  },
}

const serverEventsProxy: ProxyHandler<IpcServerController> = {
  set(target, p, newValue) {
    if (typeof p === 'string') {
      target.on(p, newValue)
      return true
    }
    return false
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
  Functions extends FunctionsObj = any,
  ClientEvents extends FunctionsObj = any,
  ServerEvents extends FunctionsObj = any,
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

  readonly #name: string = ''

  readonly #clientEvents: Readonly<ClientEvents> = new Proxy(this as any, clientEventsProxy)

  readonly #functions: Functions = new Proxy(this as any, functionsProxy)

  readonly #serverEvents: ServerEventsProxy<ServerEvents> = new Proxy(this as any, serverEventsProxy)

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

  #ipcMainEventListeners = new Map<string, MainEventListener>()

  #eventsListeners = new Map<string, { listener: MainEventListener; once: boolean }[]>()

  constructor(name: string) {
    if (name.trim() === '') {
      throw new SyntaxError('IpcBroadcastController: "name" cannot be an empty string.')
    }
    this.#name = name
  }

  /**
   * Controller name
   */
  get name() {
    return this.#name
  }

  /**
   * The proxy object for the `send()` method.
   *
   * Usage: `IpcClientController.clientEvents.[ClientEvent](...args)`
   */
  get clientEvents() {
    return this.#clientEvents
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
   * The proxy object for the `on()` method.
   *
   * Usage: `IpcClientController.serverEvents.[ServerEvent] = [listener]`
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

  #addEventListener(event: StringKey<ServerEvents>, listener: AnyFunction, once = false) {
    ipcMainIsNull(IpcServerController.IpcMain)

    const channel = this.#serverEventChannel(event)

    if (!this.#ipcMainEventListeners.has(event)) {
      debug(`IpcServerController.#addEventListener: ${this.name}:${event}: add global listener (channel: ${channel})`)

      const listener = this.#ipcMainEventListener.bind(this, event)
      IpcServerController.IpcMain.on(channel, listener)
      this.#ipcMainEventListeners.set(event, listener)
    }

    debug(
      `IpcServerController.#addEventListener: ${this.name}:${event}: add listener (once: ${once}) (channel: ${channel})`,
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

  async #ipcMainEventListener(event: StringKey<ServerEvents>, eventObj: Electron.IpcMainEvent, ...args: any) {
    const channel = this.#serverEventChannel(event)

    try {
      const trust = (this.trustHandler ?? IpcServerController.TrustHandler)(this, event, 'event', eventObj)
      if (trust === false || !(await trust)) {
        debug(`IpcServerController.#ipcMainEventListener: ${this.name}:${event}: blocked (channel: ${channel})`)
        return
      }
    } catch (err) {
      console.error('IpcServerController.#ipcMainEventListener: An error occurred in the trust handler:', err)
      return
    }

    debug(`IpcServerController.#ipcMainEventListener: ${this.name}:${event}: received (channel: ${channel}) `)
    debug('args:', args)

    const listeners = this.#eventsListeners.get(event) ?? []
    const onceListeners = listeners.filter((item) => {
      try {
        item.listener(eventObj, ...args)
      } catch (error) {
        debug(`IpcServerController.#ipcMainEventListener: ${this.name}:${event}: catch error (channel: ${channel}) `)
        debug('error:', error)
      }
      return item.once
    })
    for (const item of onceListeners) {
      this.off(event, item.listener)
    }
  }

  async #handle(
    name: string,
    passEvent: boolean,
    func: AnyFunction,
    event: Electron.IpcMainInvokeEvent,
    ...args: any
  ): Promise<InvokeReturnObject> {
    const channel = this.#invokeChannel(name)

    debug(`IpcServerController.#handle: ${this.name}:${name}: received (channel: ${channel})`)
    debug('args:', args)

    try {
      const trust = (this.trustHandler ?? IpcServerController.TrustHandler)(this, name, 'invoke', event)
      if (trust === false || !(await trust)) {
        debug(`IpcServerController.#handle: ${this.name}:${name}: blocked (channel: ${channel})`)
        return {
          status: InvokeReturnStatus.error,
          value: ErrorHandler.serialize(new Error('Blocked by trust handler')),
        }
      }
    } catch (err) {
      console.error('IpcServerController.#handle: An error occurred in the trust handler:', err)
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
      debug(`IpcServerController.#handle: ${this.name}:${name}: send result (channel: ${channel})`)
      debug('value:', value)
      return {
        status: InvokeReturnStatus.result,
        value,
      }
    } catch (err) {
      debug(`IpcServerController.#handle: ${this.name}:${name}: catch error (channel: ${channel})`)
      debug('error:', err)
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
    const sender = (items: Electron.WebContents[]) => {
      const channel = this.#clientEventChannel(event)
      for (const webContents of items) {
        debug(
          `IpcServerController.#send: ${this.name}:${event}: send (channel: ${channel}) (webContents: ${webContents.id} (frameId: ${frameId}))`,
        )
        debug('args:', args)
        try {
          if (frameId === null) {
            webContents.send(channel, ...args)
          } else {
            webContents.sendToFrame(frameId, channel, ...args)
          }
        } catch (err) {
          console.error(
            `IpcServerController.#send: An error occurred in the webContents.${frameId === null ? 'send' : 'sendToFrame'}:`,
            err,
          )
        }
      }
    }

    try {
      const getter = (this.webContentsGetter ?? IpcServerController.WebContentsGetter ?? (() => []))()
      if (isPromise(getter)) {
        getter
          .then((items) => {
            sender(items)
          })
          .catch((err) => {
            console.error('IpcServerController.#send: An error occurred in the webContents getter:', err)
          })
      } else {
        sender(getter)
      }
    } catch (err) {
      console.error('IpcServerController.#send: An error occurred in the webContents getter:', err)
    }
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
    ipcMainIsNull(IpcServerController.IpcMain)

    const channel = this.#invokeChannel(name)

    debug(`IpcServerController.#handle: ${this.name}:${name}: handle (channel: ${channel})`)

    IpcServerController.IpcMain.handle(channel, this.#handle.bind(this, name, false, handler))
  }

  /**
   * Like `handle()`, it will just pass the event object.
   *
   * @see {handle}
   */
  handleWithEvent<K extends StringKey<Functions>>(name: K, handler: MainInvokeHandler<Functions[K]>) {
    ipcMainIsNull(IpcServerController.IpcMain)

    const channel = this.#invokeChannel(name)

    debug(`IpcServerController.#handle: ${this.name}:${name}: handle (channel: ${channel})`)

    IpcServerController.IpcMain.handle(channel, this.#handle.bind(this, name, true, handler))
  }

  /**
   * Removes event listeners added using `on()` and `once()`.
   *
   * If the `listener` parameter is not provided, all listeners for
   * the corresponding event will be removed.
   */
  off<K extends StringKey<ServerEvents>>(event: K, listener?: MainEventListener<Functions[K]>) {
    ipcMainIsNull(IpcServerController.IpcMain)

    const channel = this.#serverEventChannel(event)

    debug(`IpcServerController.off: ${this.name}:${event}: off listener (channel: ${channel})`)

    const handlers = (listener ? (this.#eventsListeners.get(event) ?? []) : []).filter(
      (item) => item.listener !== listener,
    )
    if (handlers.length === 0) {
      const listener = this.#ipcMainEventListeners.get(event)
      if (listener) {
        debug(`IpcServerController.off: ${this.name}:${event}: off global listener (channel: ${channel})`)

        IpcServerController.IpcMain.off(channel, listener)
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
}
