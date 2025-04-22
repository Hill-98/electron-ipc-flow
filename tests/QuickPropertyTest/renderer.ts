import { client } from './controller.js'

document.body.textContent += await client.$hey('electron-ipc-flow')
document.body.textContent += '|'
