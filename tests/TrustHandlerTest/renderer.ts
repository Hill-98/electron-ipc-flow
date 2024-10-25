import controller from './controller.js'

try {
  document.body.textContent += await controller.invoke('hey', 'electron-ipc-flow')
} catch (error: any) {
  document.body.textContent += error.message
}
document.body.textContent += '|'

try {
  document.body.textContent += await controller.invoke('say', 'electron-ipc-flow')
} catch (error: any) {
  document.body.textContent += error.message
}
document.body.textContent += '|'

controller.send('hi', 'electron-ipc-flow')
controller.send('hello', 'electron-ipc-flow')
