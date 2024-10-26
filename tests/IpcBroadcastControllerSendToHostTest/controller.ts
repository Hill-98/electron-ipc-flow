import { IpcBroadcastController, IpcController } from '../../src/index.js'

type Events = {
  say(who: string): void
}

export const controller = new IpcController<any, Events>('controller')
export const broadcast = new IpcBroadcastController<Events>('controller')
