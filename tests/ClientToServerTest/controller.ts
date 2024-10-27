import { IpcClientController, IpcServerController } from '../../src/index.js'

type Functions = {
  hey(who: string): Promise<string>

  say(who: string): string
}

type Events = {
  hi(who: string): void
}

export const client = new IpcClientController<Functions, any, Events>('controller')
export const server = new IpcServerController<Functions, any, Events>('controller')
