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
  serialize(error: any): object

  deserialize(errorObject: any): Error
}

export type AnyFunction = (...args: any[]) => any

export type EventFunction<T, K extends AnyFunction = AnyFunction> = (event: T, ...args: Parameters<K>) => ReturnType<K>

export type FunctionsObj = Record<string, AnyFunction>

export enum InvokeReturnStatus {
  error,
  result,
}

export interface InvokeReturnObject<T = any> {
  status: InvokeReturnStatus
  value: T
}

export type StringKey<T> = Extract<keyof T, string>

export type channelTypes = 'ClientEvent' | 'Invoke' | 'ServerEvent'

export const channelGenerator = (controller: string, event: string, type: channelTypes) =>
  `$electron-ipc-flow$||${type}||${controller}||${event}`

/**
 * The error handler defaults to using the [serialize-error]{@link https://www.npmjs.com/package/serialize-error}
 * package to serialize and deserialize error objects.
 *
 * The serialize method must be defined in the main process and the
 * deserialize method must be defined in the renderer process.
 */
export const ErrorHandler: ErrorHandlerInterface = {
  serialize: serializeError,
  deserialize: deserializeError,
}

export function isDebug() {
  return (typeof process === 'undefined' ? window : process.env).ELECTRON_IPC_FLOW_DEBUG === 'true'
}

export function isNull<T>(message: string, value?: T | null): asserts value is NonNullable<T> {
  if (typeof value === 'undefined' || value === null) {
    throw new TypeError(message)
  }
}

export function debug(...args: any[]) {
  if (!isDebug()) {
    return
  }
  if (args.some((arg) => arg instanceof Error)) {
    console.error(...args)
  } else {
    console.debug(...args)
  }
}
