import controller1 from './controller1.js'
import controller2 from './controller2.js'

try {
  document.body.textContent += await controller1.invoke('say', 'electron-ipc-flow')
} catch (error: any) {
  document.body.textContent += error.message
}
document.body.textContent += '|'

try {
  document.body.textContent += await controller2.invoke('say', 'electron-ipc-flow')
} catch (error: any) {
  document.body.textContent += error.message
}

controller1.send('hi', 'electron-ipc-flow')
controller2.send('hi', 'electron-ipc-flow')
