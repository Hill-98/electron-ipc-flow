import { client } from './controller.js'

if (window.parent === window) {
  const iframe = document.createElement('iframe')
  iframe.src = location.href
  document.body.append(iframe)
} else {
  setTimeout(() => {
    client.send('say', '')
  }, 1000)
  client.on('say', (_, who) => {
    document.body.textContent += `hello ${who}.`
    document.body.textContent += '|'
  })
}
