# electron-ipc-flow

Fluently and type-safely write IPC for [Electron](https://www.electronjs.org/).

Just focus on the IPC handlers and calls, without any trivial matters; everything will happen as you envision.

## Features

* Invoke and send just like using a local function.
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
import { IpcServerController } from 'electron-ipc-flow'
import { server } from './hello.ts'

IpcServerController.IpcMain = ipcMain

// server.functions is proxy object
server.functions.say = (who) => `Hello ${who}!`
// server.handle('say', (who) => `Hello ${who}!`)

// hello.ts
import { IpcClientController, IpcServerController } from 'electron-ipc-flow'

type Functions = {
  say(who: string): string
}

export const client = new IpcClientController<Functions>('hello')
export const server = new IpcServerController<Functions>('hello')

// preload.ts
import { contextBridge, ipcRenderer } from 'electron/renderer'
import { preloadInit } from 'electron-ipc-flow'
import { client } from './hello.ts'

preloadInit(contextBridge, ipcRenderer, {
  autoRegisterIpcController: false, // Optional, default to true.
})
// If `autoRegister` is false, client controller needs to be register manually.
client.register()

// renderer.ts
import { client } from './hello.ts'

// client.functions is proxy object
console.log(await client.functions.say('World')) // Hello World!
// console.log(await client.invoke('say', 'World')) // Hello World!
```

### Renderer send message to main

```typescript
// main.ts
import { ipcMain } from 'electron'
import { IpcServerController } from 'electron-ipc-flow'
import { server } from './hello.ts'

IpcServerController.IpcMain = ipcMain

server.on('say', (e, who) => {
  console.log(`Hello ${who}!`) // Hello World!
})

// hello.ts
import { IpcClientController, IpcServerController } from 'electron-ipc-flow'

type ServerEvents = {
  say(who: string): void
}

export const client = new IpcClientController<any, any, ServerEvents>('hello')
export const server = new IpcServerController<any, any, ServerEvents>('hello')

// preload.ts
import { contextBridge, ipcRenderer } from 'electron/renderer'
import { preloadInit } from 'electron-ipc-flow'

preloadInit(contextBridge, ipcRenderer)

// renderer.ts
import { client } from './hello.ts'

client.send('say', 'World')
```

### Main send (broadcasts) message to renderer

```typescript
// main.ts
import { BrowserWindow } from 'electron'
import { IpcServerController } from 'electron-ipc-flow'
import { server } from './hello.ts'

// Define to send messages to those renderers. (global)
IpcServerController.WebContentsGetter = () => BrowserWindow.getAllWindows().map((win) => win.webContents)
 
server.send('say', 'World')

// hello.ts
import { IpcClientController, IpcServerController } from 'electron-ipc-flow'

type ClientEvents = {
    say(who: string): void
}

export const client = new IpcClientController<any, ClientEvents, any>('hello')
export const server = new IpcServerController<any, ClientEvents, any>('hello')

// preload.ts
import { contextBridge, ipcRenderer } from 'electron/renderer'
import { preloadInit } from 'electron-ipc-flow'

preloadInit(contextBridge, ipcRenderer)

// renderer.ts
import { client } from './hello.ts'

client.on('say', (e, who) => {
  console.log(`Hello ${who}!`) // Hello World!
})
```

### Declaring types using JSDoc

If you don't want to use TypeScript, you can use JSDoc to get type support:

```javascript
/**
 * @typedef Functions
 * @property {(who: string) => string} say
 */

/** @type {IpcClientController<Functions>} */
const controller = new IpcClientController('hello')
```

> Some editors may not be able to handle it, VSCode will work.

### Not using bundler

If you don't want to use bundler, or don't need to do anything else in the preload script, you can use this preload script: [`node_modules/electron-ipc-flow/dist/preload.js`](https://unpkg.com/electron-ipc-flow/dist/preload.js).

Then you can import it in the renderer like this:
```javascript
import { IpcClientController } from './node_modules/electron-ipc-flow/dist/index.mjs'
```

## API

You can check the definition file [`dist/index.d.ts`](https://unpkg.com/electron-ipc-flow/dist/index.d.ts) for the API and comments.

## Debug

> The internal `debug()` method uses the [callsites](https://www.npmjs.com/package/callsites) library to obtain the call stack, and callsites internally utilizes the [V8 stack trace API](https://v8.dev/docs/stack-trace-api).

You can set the environment variable `ELECTRON_IPC_FLOW_DEBUG` to `true` to enable debug mode. In debug mode, some data will be output to the console (verbose level).

**enable**: `process.env.ELECTRON_IPC_FLOW_DEBUG = 'true'` in `main.js` first line.

**disable**: `process.env.ELECTRON_IPC_FLOW_DEBUG = 'false'` in `main.js` first line.

**You should always disable debug mode on production release ! ! !**

## Thanks

* [**callsites**](https://www.npmjs.com/package/callsites): Get callsites from the [V8 stack trace API](https://v8.dev/docs/stack-trace-api)
  
* [**serialize-error**](https://www.npmjs.com/package/serialize-error): Serialize/deserialize an error into a plain object

Thanks to [JetBrains](https://jb.gg/OpenSourceSupport) for providing the JetBrains IDEs open source license.

<a href="https://jb.gg/OpenSourceSupport"><img src="https://resources.jetbrains.com/storage/products/company/brand/logos/jb_beam.png" alt="JetBrains Logo (Main) logo." width="256px" height="256px"></a>
