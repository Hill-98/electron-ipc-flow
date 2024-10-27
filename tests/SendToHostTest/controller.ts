import { IpcClientController, IpcServerController } from '../../src/index.js'

type Events = {
  say(who: string): void
}

export const client = new IpcClientController<any, Events, Events>('controller')
export const server = new IpcServerController<any, Events, Events>('controller')
