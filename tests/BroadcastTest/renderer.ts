import { client } from './controller.js'

client.on('say', (_, who) => {
  document.body.textContent += `hello ${who}.`
  document.body.textContent += '|'
})

client.once('say', (_, who) => {
  document.body.textContent += `hello once ${who}.`
  document.body.textContent += '|'
})
