import { IpcClientController, IpcServerController } from '../../src/index.js'

type Functions = {
  say(who: string): string
}

type ClientEvents = {
  hey(who: string): void
}

type ServerEvents = {
  hi(who: string): void
}

export const client = new IpcClientController<Functions, ClientEvents, ServerEvents>('controller2')

export const server = new IpcServerController<Functions, ClientEvents, ServerEvents>('controller2')
