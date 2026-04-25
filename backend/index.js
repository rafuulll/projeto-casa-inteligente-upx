const express = require('express')
const mqtt    = require('mqtt')
const cors    = require('cors')

const app = express()
app.use(cors())
app.use(express.json())

// mesmo broker do Wokwi
const client = mqtt.connect('mqtt://broker.hivemq.com:1883')
let ledState  = false

client.on('connect', () => {
  console.log('Backend conectado ao broker MQTT')
  client.subscribe('casa/led/status')  // ouve o status que o ESP32 publica
})

client.on('message', (topic, message) => {
  console.log(`Status recebido do ESP32: ${message.toString()}`)
})

app.post('/api/led/toggle', (req, res) => {
  ledState = !ledState
  const msg = ledState ? 'ON' : 'OFF'
  client.publish('casa/led', msg)
  res.json({ state: ledState })
})

app.get('/api/led', (req, res) => {
  res.json({ state: ledState })
})

app.listen(3001, () => console.log('Backend rodando em http://localhost:3001'))