import { IpcController } from '../../src/index.js'

type Functions = {
  say(who: string): string
}

type Events = {
  hi(who: string): void
}

export default new IpcController<Functions, Events>('controller2')
