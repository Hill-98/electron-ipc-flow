import callsites from 'callsites'
import { deserializeError, serializeError } from 'serialize-error'

declare global {
  namespace globalThis {
    // noinspection ES6ConvertVarToLetConst
    var ELECTRON_IPC_FLOW_DEBUG: string | undefined
  }
}

export interface ErrorHandlerInterface {
  serialize(error: any): object

  deserialize(errorObject: any): Error
}

export type AnyFunction = (...args: any[]) => any

export type AnyObject = Record<any, any>

export type ChannelTypes = 'c' | 'i' | 's'

export type ExactType<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false) : false

export type FunctionParameters<T> = T extends AnyFunction ? Parameters<T> : any[]

export type FunctionPropertyNames<T> = {
  [K in keyof T]: T[K] extends AnyFunction ? K : never
}[keyof T]

export type FunctionProperties<T> = T extends AnyObject
  ? Extract<keyof Pick<T, FunctionPropertyNames<T>>, string>
  : string

export type IpcEventListener<T extends Electron.Event, K extends AnyFunction = AnyFunction> = (
  event: T,
  ...args: FunctionParameters<K>
) => ExactType<T, Electron.IpcMainInvokeEvent> extends true ? ReturnType<K> : void

export enum InvokeReturnType {
  error = 'error',
  result = 'result',
}

export interface InvokeReturnObject<T> {
  type: InvokeReturnType
  value: T
}

export const channelGenerator = (controller: string, event: string, type: ChannelTypes) =>
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

export function assertIsNull<T>(message: string, value?: T | null): asserts value is NonNullable<T> {
  if (typeof value === 'undefined' || value === null) {
    throw new TypeError(message)
  }
}

export const isDebug = () => (typeof process === 'undefined' ? window : process.env).ELECTRON_IPC_FLOW_DEBUG === 'true'

export function debug(this: any, action: string, detail?: any, event?: string, channelType?: ChannelTypes) {
  if (!isDebug()) {
    return
  }

  const firstCallStack = callsites()[1]
  if (typeof firstCallStack === 'undefined') {
    return
  }

  const typeName = firstCallStack.getTypeName()
  const methodName = firstCallStack.getMethodName() ?? firstCallStack.getFunctionName() ?? '<anonymous>'
  const controller = this?.name

  const obj = {
    controller,
    method: `${typeName ? typeName.concat('.') : ''}${methodName}`,
    action,
    event,
    channel: channelType ? channelGenerator(controller, event ?? 'x', channelType) : undefined,
    [detail instanceof Error ? 'error' : 'detail']: detail,
    source: `${firstCallStack.getFileName()}:${firstCallStack.getLineNumber()}:${firstCallStack.getColumnNumber()}`,
  }

  for (const key of Object.keys(obj)) {
    if (typeof Reflect.get(obj, key) === 'undefined') {
      Reflect.deleteProperty(obj, key)
    }
  }

  console.debug(obj)
}
