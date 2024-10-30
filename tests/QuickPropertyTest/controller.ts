import { IpcClientController, IpcServerController } from '../../src/index.js'

type Functions = {
  emit(): Promise<void>

  hey(who: string): Promise<string>
}

type ClientEvents = {
  hi(who: string): void
}

type ServerEvents = {
  say(who: string): void
}

export const client = new IpcClientController<Functions, ClientEvents, ServerEvents>('controller')
export const server = new IpcServerController<Functions, ClientEvents, ServerEvents>('controller')
