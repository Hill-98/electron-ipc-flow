import { client } from './controller.js'

document.body.textContent += await client.functions.hey('electron-ipc-flow')
document.body.textContent += '|'
document.body.textContent += await client.invoke('say', 'electron-ipc-flow')
document.body.textContent += '|'

client.senders.hi('electron-ipc-flow')
client.send('hi', 'electron-ipc-flow')
client.send('hi', 'electron-ipc-flow')
