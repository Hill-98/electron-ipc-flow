import { IpcBroadcastController } from '../../src/index.js'

type Events = {
  say(who: string): void
}

export default new IpcBroadcastController<Events>('controller')
