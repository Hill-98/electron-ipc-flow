import { client } from './controller.js'

try {
  document.body.textContent += await client.invoke('hey', 'electron-ipc-flow')
} catch (error: any) {
  document.body.textContent += error.message
}
document.body.textContent += '|'

try {
  document.body.textContent += await client.invoke('say', 'electron-ipc-flow')
} catch (error: any) {
  document.body.textContent += error.message
}
document.body.textContent += '|'

client.send('hi', 'electron-ipc-flow')
client.send('hello', 'electron-ipc-flow')
