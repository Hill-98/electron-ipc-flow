import { IpcClientController, IpcServerController } from '../../src/index.js'

type Events = {
  say(who: string): void
}

export const client = new IpcClientController<any, Events>('controller')

export const server = new IpcServerController<any, Events>('controller')
