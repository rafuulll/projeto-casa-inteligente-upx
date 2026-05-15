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

// ── Estado de telemetria em memória ──────────────────────────────────────────
const telemetria = {
  temperature:  null,
  humidity:     null,
  movement:     false,
  iaStatus:     'inativa',
  doorStatus:   'fechada',
  lastMovement: null,
  updatedAt:    null
}

// ── MQTT ──────────────────────────────────────────────────────────────────────
const mqttBroker = process.env.MQTT_BROKER || 'mqtt://broker.hivemq.com:1883'
const mqttClient = mqtt.connect(mqttBroker)

mqttClient.on('connect', () => {
  console.log(`MQTT conectado: ${mqttBroker}`)

  // Dispositivos (confirmações do ESP32)
  mqttClient.subscribe('casa/+/status')

  // Telemetria
  mqttClient.subscribe('casa/temperatura')
  mqttClient.subscribe('casa/umidade')
  mqttClient.subscribe('casa/movimento')
  mqttClient.subscribe('casa/ia/status')
  mqttClient.subscribe('casa/alarme')
})

mqttClient.on('message', (topic, message) => {
  const msg   = message.toString()
  const parts = topic.split('/')

  // Confirmações de dispositivos: casa/sala-luz/status, etc.
  if (parts.length === 3 && parts[2] === 'status' && parts[1] !== 'ia' && parts[1] !== 'porta') {
    console.log(`ESP32 confirmou [${parts[1]}]: ${msg}`)
    return
  }

  switch (topic) {
    case 'casa/temperatura':
      telemetria.temperature = parseFloat(msg)
      telemetria.updatedAt   = new Date()
      io.emit('telemetry_update', telemetria)
      break

    case 'casa/umidade':
      telemetria.humidity  = parseFloat(msg)
      telemetria.updatedAt = new Date()
      io.emit('telemetry_update', telemetria)
      break

    case 'casa/movimento':
      telemetria.movement = msg === 'true'
      if (msg === 'true') telemetria.lastMovement = new Date()
      telemetria.updatedAt = new Date()
      io.emit('telemetry_update', telemetria)
      break

    case 'casa/ia/status':
      telemetria.iaStatus  = msg
      telemetria.updatedAt = new Date()
      io.emit('telemetry_update', telemetria)
      break

    case 'casa/porta/status':
      telemetria.doorStatus = msg
      telemetria.updatedAt  = new Date()
      io.emit('telemetry_update', telemetria)
      break

    case 'casa/alarme':
      console.log(`ALARME: ${msg}`)
      io.emit('alarm_event', { event: msg, timestamp: new Date() })
      break
  }
})

// Salva telemetria no banco a cada 30 segundos
setInterval(async () => {
  if (telemetria.temperature === null) return
  await prisma.telemetry.create({
    data: {
      temperature: telemetria.temperature,
      humidity:    telemetria.humidity,
      movement:    telemetria.movement
    }
  }).catch(e => console.error('Erro ao salvar telemetria:', e))
}, 30000)

// ── IA Service ────────────────────────────────────────────────────────────────
aiService.init(prisma, mqttClient, io)

// ── Seed ──────────────────────────────────────────────────────────────────────
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

// ── Rotas: dispositivos ───────────────────────────────────────────────────────
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
  const device  = await prisma.device.findUnique({ where: { id } })
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

// ── Rotas: telemetria ─────────────────────────────────────────────────────────
app.get('/api/telemetria/atual', (req, res) => {
  res.json(telemetria)
})

app.get('/api/telemetria/historico', async (req, res) => {
  const { periodo = '24h' } = req.query
  const horas = periodo === '7d' ? 168 : periodo === '1h' ? 1 : 24
  const desde = new Date(Date.now() - horas * 60 * 60 * 1000)

  const dados = await prisma.telemetry.findMany({
    where:   { createdAt: { gte: desde } },
    orderBy: { createdAt: 'asc' },
    take:    500
  })
  res.json(dados)
})

app.get('/api/movimento', async (req, res) => {
  const eventos = await prisma.telemetry.findMany({
    where:   { movement: true },
    orderBy: { createdAt: 'desc' },
    take:    20
  })
  res.json(eventos)
})

// ── Rotas: porta e alarme ─────────────────────────────────────────────────────
app.post('/api/porta/:acao', (req, res) => {
  const { acao } = req.params
  if (!['abrir', 'fechar'].includes(acao)) return res.status(400).json({ error: 'Ação inválida' })
  mqttClient.publish('casa/porta/comando', acao === 'abrir' ? 'ABRIR' : 'FECHAR')
  res.json({ ok: true, acao })
})

app.post('/api/alarme/:acao', (req, res) => {
  const { acao } = req.params
  if (!['ativar', 'desativar'].includes(acao)) return res.status(400).json({ error: 'Ação inválida' })
  mqttClient.publish('casa/alarme/comando', acao === 'ativar' ? 'ATIVAR' : 'DESATIVAR')
  res.json({ ok: true, acao })
})

// ── Rota: IA ──────────────────────────────────────────────────────────────────
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

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001
server.listen(PORT, async () => {
  await seed()
  console.log(`Backend rodando em http://localhost:${PORT}`)
})
