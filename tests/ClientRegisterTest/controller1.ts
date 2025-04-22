import { createIpcClient, createIpcServer } from '../../src/index.js'

type Functions = {
  say(who: string): string
}

type ClientEvents = {
  hey(who: string): void
}

type ServerEvents = {
  hi(who: string): void
}

export const client = createIpcClient<Functions, ClientEvents, ServerEvents>('controller1')

export const server = createIpcServer<Functions, ClientEvents, ServerEvents>('controller1')
