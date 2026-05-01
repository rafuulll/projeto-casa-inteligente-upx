const express    = require('express')
const http       = require('http')
const { Server } = require('socket.io')
const mqtt       = require('mqtt')
const cors       = require('cors')
const { PrismaClient } = require('@prisma/client')
const aiService  = require('./aiService')

const prisma = new PrismaClient()
const app    = express()
const server = http.createServer(app)
const io     = new Server(server, { cors: { origin: '*' } })

app.use(cors())
app.use(express.json())

// ── MQTT ──────────────────────────────────────────────────────────────────────
const mqttBroker = process.env.MQTT_BROKER || 'mqtt://broker.hivemq.com:1883'
const mqttClient = mqtt.connect(mqttBroker)

mqttClient.on('connect', () => {
  console.log(`MQTT conectado: ${mqttBroker}`)
  mqttClient.subscribe('casa/+/status')
})

mqttClient.on('message', (topic, message) => {
  const parts = topic.split('/')
  if (parts.length !== 3 || parts[2] !== 'status') return
  console.log(`ESP32 confirmou [${parts[1]}]: ${message.toString()}`)
})

// ── Inicializa o serviço de IA com as dependências do servidor ────────────────
aiService.init(prisma, mqttClient, io)

// ── SEED ──────────────────────────────────────────────────────────────────────
async function seed() {
  const count = await prisma.device.count()
  if (count > 0) return

  console.log('Criando dispositivos iniciais...')
  await prisma.device.createMany({
    data: [
      { id: 'sala-luz',          name: 'Luz da Sala',     room: 'Sala',    type: 'light' },
      { id: 'sala-ventilador',   name: 'Ventilador',      room: 'Sala',    type: 'fan'   },
      { id: 'quarto-luz',        name: 'Luz do Quarto',   room: 'Quarto',  type: 'light' },
      { id: 'quarto-ar',         name: 'Ar-condicionado', room: 'Quarto',  type: 'ac'    },
      { id: 'cozinha-luz',       name: 'Luz da Cozinha',  room: 'Cozinha', type: 'light' },
      { id: 'cozinha-cafeteira', name: 'Cafeteira',       room: 'Cozinha', type: 'plug'  },
    ]
  })
  console.log('Dispositivos criados!')
}

// ── ROTAS ─────────────────────────────────────────────────────────────────────

app.get('/api/devices', async (req, res) => {
  const devices = await prisma.device.findMany({ orderBy: { room: 'asc' } })
  res.json(devices)
})

app.get('/api/logs', async (req, res) => {
  const logs = await prisma.log.findMany({
    take: 30,
    orderBy: { createdAt: 'desc' },
    include: { device: true }
  })
  res.json(logs)
})

app.post('/api/devices/:id/toggle', async (req, res) => {
  const { id } = req.params
  const device = await prisma.device.findUnique({ where: { id } })
  if (!device) return res.status(404).json({ error: 'Dispositivo não encontrado' })

  const newState = !device.state
  const updated  = await prisma.device.update({ where: { id }, data: { state: newState } })
  const log      = await prisma.log.create({
    data: { deviceId: id, action: newState ? 'ON' : 'OFF' },
    include: { device: true }
  })

  mqttClient.publish(`casa/${id}`, newState ? 'ON' : 'OFF')
  io.emit('device_update', updated)
  io.emit('new_log', log)

  res.json(updated)
})

// ── ROTA DA IA ────────────────────────────────────────────────────────────────
app.post('/api/ai/chat', async (req, res) => {
  const { message } = req.body
  if (!message) return res.status(400).json({ error: 'Campo "message" obrigatório.' })

  try {
    const reply = await aiService.handleChat(message)
    res.json({ reply })
  } catch (err) {
    console.error('Erro na IA:', err.message)
    res.status(500).json({ error: 'Falha ao comunicar com a IA.', detail: err.message })
  }
})

// ── START ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001
server.listen(PORT, async () => {
  await seed()
  console.log(`Backend rodando em http://localhost:${PORT}`)
})