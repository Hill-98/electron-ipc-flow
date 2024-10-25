import controller from './controller.js'

controller.on('say', (_, who) => {
  document.body.textContent += `hello ${who}.|`
})

controller.once('say', (_, who) => {
  document.body.textContent += `hello once ${who}.|`
})
