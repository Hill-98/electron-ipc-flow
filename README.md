# electron-ipc-flow

Fluently and type-safely write IPC for [Electron](https://www.electronjs.org/).

Just focus on the IPC handlers and calls, without any trivial matters; everything will happen as you envision.

## Features

* Just like using local functions.
* Type declarations are in one place, so you can also use [JSDoc](https://jsdoc.app/).
* All methods are type-safe.
* Everything is module, with no `window` and `global.d.ts`.
* By default, the [serialize-error](https://www.npmjs.com/package/serialize-error) library is used to serialize error objects, so you don't have to worry about error handling. You can also customize the error handler.
* Provide some optional security mechanisms to enhance security.

## Install

Use npm: `npm install electron-ipc-flow`

Use yarn: `yarn add electron-ipc-flow`

## Usage

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
// If `autoRegisterIpcController` is false, the controller1 needs to be register manually.
hello.register()

// renderer.ts
import { calls as hello } from './hello.ts'

console.log(await hello.say('World')) // Hello World!
```

### Renderer send message to main

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

### Main send (broadcasts) message to renderer

```typescript
// main.ts
import { BrowserWindow } from 'electron'
import { IpcBroadcastController } from 'electron-ipc-flow'
import hello from './hello.ts'

// Define to send messages to those renderers. (global)
IpcBroadcastController.WebContentsGetter = () => BrowserWindow.getAllWindows().map((win) => win.webContents)

// Define to send messages to those renderers. (controller1)
// hello.webContentsGetter = () => Promise.resolve([BrowserWindow.getAllWindows()[0].webContents]) 
hello.send('World')

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
  initBroadcastController: true, // Broadcast controller1 is not initialized by default
})

// renderer.ts
import hello from './hello.ts'

hello.on('say', (event, who) => {
  console.log(`Hello ${who}!`) // Hello World!
})
```

---

If you don't want to use TypeScript, you can use JSDoc to get type support:

```javascript
/**
 * @typedef Functions
 * @property {(who: string) => string} say
 */

/** @type {import('electron-ipc-flow').IpcController<Functions>} */
const controller = new IpcController('hello')
```

---

If you don't want to use bundler, or don't need to do anything else in the preload script, you can use this preload script: [`node_modules/electron-ipc-flow/dist/preload.js`](https://unpkg.com/electron-ipc-flow/dist/preload.js).

## API

You can check the definition file [`dist/index.d.ts`](https://unpkg.com/electron-ipc-flow/dist/index.d.ts) for the API and comments.

## Debug

You can set the environment variable `ELECTRON_IPC_FLOW_DEBUG` to `true` to enable debug mode. In debug mode, some data will be output to the console (verbose level).

**enable**: `process.env.ELECTRON_IPC_FLOW_DEBUG = 'true'` in main.js first line.

**disable**: `process.env.ELECTRON_IPC_FLOW_DEBUG = 'false'` in main.js first line.

**You should always disable debug mode on production release ! ! !**

## Thanks

* [**serialize-error**](https://www.npmjs.com/package/serialize-error): Serialize/deserialize an error into a plain object

Thanks to [JetBrains](https://jb.gg/OpenSourceSupport) for providing the JetBrains IDEs open source license.

<a href="https://jb.gg/OpenSourceSupport"><img src="https://resources.jetbrains.com/storage/products/company/brand/logos/jb_beam.png" alt="JetBrains Logo (Main) logo." width="256px" height="256px"></a>
