import { client } from './controller.js'

client.send('say', 'electron-ipc-flow')

client.listeners = {
  hi(_, who) {
    document.body.textContent += `hi ${who}`
    document.body.textContent += '|'
  },
}
await client.functions.emit()

document.body.textContent += await client.functions.hey('electron-ipc-flow')
document.body.textContent += '|'

client.listeners = {
  hi(_, who) {
    document.body.textContent += `hi hi ${who}`
    document.body.textContent += '|'
  },
}
await client.functions.emit()
