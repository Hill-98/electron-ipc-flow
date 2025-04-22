import { createIpcClient, createIpcServer } from '../../src/index.js'

type Functions = {
  hey(who: string): Promise<string>

  say(who: string): string
}

type Events = {
  hi(who: string): void
}

export const client = createIpcClient<Functions, any, Events>('controller')

export const server = createIpcServer<Functions, any, Events>('controller')
