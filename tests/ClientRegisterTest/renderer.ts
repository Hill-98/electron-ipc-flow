import { client as client1 } from './controller1.js'
import { client as client2 } from './controller2.js'

try {
  document.body.textContent += await client1.invoke('say', 'electron-ipc-flow')
} catch (error: any) {
  document.body.textContent += error.message
}
document.body.textContent += '|'

try {
  document.body.textContent += await client2.invoke('say', 'electron-ipc-flow')
} catch (error: any) {
  document.body.textContent += error.message
}
document.body.textContent += '|'

try {
  client1.send('hi', 'electron-ipc-flow')
} catch (error: any) {
  document.body.textContent += error.message
}
document.body.textContent += '|'

try {
  client2.send('hi', 'electron-ipc-flow')
} catch (error: any) {
  document.body.textContent += error.message
}
document.body.textContent += '|'

try {
  client1.on('hey', (_, who) => {
    document.body.textContent += `hey ${who} 1`
    document.body.textContent += '|'
  })
} catch (error: any) {
  document.body.textContent += error.message
}
document.body.textContent += '|'

try {
  client2.on('hey', (_, who) => {
    document.body.textContent += `hey ${who} 2`
    document.body.textContent += '|'
  })
} catch (error: any) {
  document.body.textContent += error.message
}
document.body.textContent += '|'
