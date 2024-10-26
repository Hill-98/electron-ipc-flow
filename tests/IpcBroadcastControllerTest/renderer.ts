import controller from './controller.js'

controller.on('say', (_, who) => {
  document.body.textContent += `hello ${who}.`
  document.body.textContent += '|'
})

controller.once('say', (_, who) => {
  document.body.textContent += `hello once ${who}.`
  document.body.textContent += '|'
})
