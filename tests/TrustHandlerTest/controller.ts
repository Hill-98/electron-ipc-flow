import { IpcController } from '../../src/index.js'

type Functions = {
  hey(who: string): Promise<string>

  say(who: string): string
}

type Events = {
  hi(who: string): void

  hello(who: string): void
}

export default new IpcController<Functions, Events>('controller')
