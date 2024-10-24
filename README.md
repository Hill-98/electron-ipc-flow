# electron-ipc-flow

Fluently and type-safely write IPC for Electron

Focus on IPC implementation without worrying about trivial matters, and you can modify the code as you like.

## Features

* Just like using local functions.
* Type declarations are in one place.
* All methods are type-safe.
* Everything is module, with no `window` and `global.d.ts`.
* By default, the [serialize-error](https://www.npmjs.com/package/serialize-error) library is used to serialize error objects, so you don't have to worry about error handling. You can also customize the error handler.
* Provide some optional security mechanisms to enhance security.

**Even if you don't use TypeScript, you can use this library, which can help alleviate the burden of using IPC.**

## Install

Use npm: `npm install electron-ipc-flow`

Use yarn: `yarn add electron-ipc-flow`

## Examples

### Easy handle and invoke

```typescript
// main.ts
import { ipcMain } from 'electron'
import { IpcController } from 'electron-ipc-flow'
import { handlers as hello } from './hello.ts'

IpcController.ipcMain = ipcMain

hello.say = (who) => `Hello ${who}!`

// hello.ts
import { IpcController } from 'electron-ipc-flow'

type Functions = {
  say(who: string): string
}

export const controller = new IpcController<Functions>('hello')
export const calls = controller.calls // Proxy object
export const handlers = controller.handlers // Proxy object

// preload.ts
import { contextBridge, ipcRenderer } from 'electron/renderer'
import { preloadInit } from 'electron-ipc-flow' // need bundler
import { controller as hello } from './hello.ts'

preloadInit(contextBridge, ipcRenderer, {
  autoRegisterIpcController: false, // Optional, default to true.
})
// If `autoRegisterIpcController` is false, the controller needs to be register manually.
hello.register()

// renderer.ts
import { calls as hello } from './hello.ts'

console.log(await hello.say('World')) // Hello World!
```

### The renderer send message to the main

```typescript
// main.ts
import { ipcMain } from 'electron'
import { IpcController } from 'electron-ipc-flow'
import hello from './hello.ts'

IpcController.ipcMain = ipcMain

hello.on('say', (event, who) => {
  console.log(`Hello ${who}!`) // Hello World!
})

// hello.ts
import { IpcController } from 'electron-ipc-flow'

type Events = {
  say(who: string): void
}

export default new IpcController<any, Events>('hello')

// preload.ts
import { contextBridge, ipcRenderer } from 'electron/renderer'
import { preloadInit } from 'electron-ipc-flow' // need bundler

preloadInit(contextBridge, ipcRenderer)

// renderer.ts
import hello from './hello.ts'

hello.send('World')
```

### The main send (broadcasts) message to the renderer.

```typescript
// main.ts
import hello from './hello.ts'

// You can define a getter to determine which renderers to send to.
// hello.webContentsGetter = () => Promise.resolve([])
hello.send('World') // Sent to all renderers by default

// hello.ts
import { IpcBroadcastController } from 'electron-ipc-flow'

type Events = {
  say(who: string): void
}

export default new IpcBroadcastController<Events>('hello')

// preload.ts
import { contextBridge, ipcRenderer } from 'electron/renderer'
import { preloadInit } from 'electron-ipc-flow' // need bundler

preloadInit(contextBridge, ipcRenderer, {
  initBroadcastController: true, // Broadcast controller is not initialized by default
})

// renderer.ts
import hello from './hello.ts'

hello.on('say', (event, who) => {
  console.log(`Hello ${who}!`) // Hello World!
})
```

This requires a bundler to make the preload script work, but you should already be using one, right?

If you don't want to use a bundler, or if you don't need to do anything else in the preload script, you can use the entire precompiled preload script: `node_modules/electron-ipc-flow/dist/preload.js`.

## API

You can check the definition file `dist/index.d.ts` for the API and comments.

## Debug

You can set the environment variable `ELECTRON_IPC_FLOW_DEBUG` to `true` to enable debug mode. In debug mode, some data will be output to the console (verbose level).

**enable**: `process.env.ELECTRON_IPC_FLOW_DEBUG = 'true'` in main.js first line.

**disable**: `process.env.ELECTRON_IPC_FLOW_DEBUG = 'false'` in main.js first line.

**You should always disable debug mode on production release ! ! !**

## Thanks

* **[serialize-error](https://www.npmjs.com/package/serialize-error)**: Serialize/deserialize an error into a plain object

Thanks to [JetBrains](https://jb.gg/OpenSourceSupport) for providing the JetBrains IDEs open source license.

<a href="https://jb.gg/OpenSourceSupport"><img src="https://resources.jetbrains.com/storage/products/company/brand/logos/jb_beam.png" alt="JetBrains Logo (Main) logo." width="256px" height="256px"></a>
