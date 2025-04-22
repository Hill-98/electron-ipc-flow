import { createIpcClient, createIpcServer } from '../../src/index.js'

type Events = {
  say(who: string): void
}

export const client = createIpcClient<any, Events>('controller')

export const server = createIpcServer<any, Events>('controller')
