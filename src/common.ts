import { deserializeError, serializeError } from 'serialize-error'

declare global {
  namespace globalThis {
    // noinspection ES6ConvertVarToLetConst
    var ELECTRON_IPC_FLOW_DEBUG: string | undefined
  }
}

declare namespace NodeJS {
  interface ProcessEnv {
    ELECTRON_IPC_FLOW_DEBUG?: string
  }
}

export interface ErrorHandlerInterface {
  serialize (error: any): object

  deserialize (errorObject: any): Error
}

export type TrustHandlerFunc = (controller: string, name: string, type: 'event' | 'invoke', event: Electron.IpcMainInvokeEvent) => Promise<boolean>

/**
 * The error handler used by `IpcController` defaults to using the
 * `serialize-error` package to serialize and deserialize error objects.
 */
export const ErrorHandler: ErrorHandlerInterface = {
  serialize: serializeError,
  deserialize: deserializeError,
}

export function isDebug () {
  const env = (typeof process === 'undefined' ? window : process.env)
  return env.ELECTRON_IPC_FLOW_DEBUG === 'true'
}

export function isNull<T> (message: string, value?: T | null): asserts value is NonNullable<T> {
  if (typeof value === 'undefined' || value === null) {
    throw new TypeError(message)
  }
}

/**
 * Global trust handler
 *
 * `IpcController` calls the trust handler when it receives a call or event.
 * If the trust handler returns false, an exception is thrown to the renderer process: "*Blocked by trust handler.*"
 *
 * `IpcController` has `trustHandler` property that can be set to specific trust handler.
 */
export let TrustHandler: TrustHandlerFunc = () => Promise.resolve(true)

export function debug (...args: any[]) {
  if (!isDebug()) {
    return
  }
  if (args[0] instanceof Error) {
    console.error(...args)
  } else {
    console.debug(...args)
  }
}
