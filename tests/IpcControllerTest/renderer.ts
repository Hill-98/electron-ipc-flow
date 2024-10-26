import { calls, controller } from './controller.js'

document.body.textContent += await calls.hey('electron-ipc-flow')
document.body.textContent += '|'
document.body.textContent += await calls.say('electron-ipc-flow')
document.body.textContent += '|'

controller.send('hi', 'electron-ipc-flow')
controller.send('hi', 'electron-ipc-flow')
controller.send('hi', 'electron-ipc-flow')
