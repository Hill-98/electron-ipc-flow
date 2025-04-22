import { createIpcClient, createIpcServer } from '../../src/index.js'

type Functions = {
  hey(who: string): Promise<string>
}

export const client = createIpcClient<Functions>('controller')

export const server = createIpcServer<Functions>('controller')
