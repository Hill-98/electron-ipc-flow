import { IpcController } from '../../src/index.js'

type Functions = {
  hey(who: string): Promise<string>

  say(who: string): string
}

type Events = {
  hi(who: string): void
}

export const controller = new IpcController<Functions, Events>('controller')
export const calls = controller.calls
export const handlers = controller.handlers
