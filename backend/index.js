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

// ── Mapeamento dispositivo → tópico MQTT ──────────────────────────────────────
const DEVICE_MQTT = {
  'sala-luz':   { topic: 'casa/luz/comando',        on: 'ON',      off: 'OFF'       },
  'ventilador': { topic: 'casa/ventilador/comando', on: 'ON',      off: 'OFF'       },
  'porta':      { topic: 'casa/porta/comando',      on: 'ABRIR',   off: 'FECHAR'    },
  'alarme':     { topic: 'casa/alarme/comando',     on: 'ATIVAR',  off: 'DESATIVAR' },
}

// ── Telemetria em memória ─────────────────────────────────────────────────────
let latestTelemetry = {
  temperature: null,
  humidity:    null,
  movement:    false,
  iaStatus:    'inativa',
  updatedAt:   null,
}

// Salva telemetria no banco a cada 30s para não sobrecarregar
let lastTelemetrySave = 0
async function maybeSaveTelemetry() {
  if (Date.now() - lastTelemetrySave < 30000) return
  if (latestTelemetry.temperature === null)   return
  lastTelemetrySave = Date.now()
  try {
    await prisma.telemetry.create({
      data: {
        temperature: latestTelemetry.temperature,
        humidity:    latestTelemetry.humidity,
        movement:    latestTelemetry.movement,
      }
    })
  } catch (e) {
    console.error('Erro ao salvar telemetria:', e.message)
  }
}

// ── MQTT ──────────────────────────────────────────────────────────────────────
const mqttBroker = process.env.MQTT_BROKER || 'mqtt://broker.hivemq.com:1883'
const mqttClient = mqtt.connect(mqttBroker)

mqttClient.on('connect', () => {
  console.log(`MQTT conectado: ${mqttBroker}`)
  // Status dos dispositivos (confirmação do ESP32)
  mqttClient.subscribe('casa/+/status')
  // Telemetria dos sensores
  mqttClient.subscribe('casa/temperatura')
  mqttClient.subscribe('casa/umidade')
  mqttClient.subscribe('casa/movimento')
  mqttClient.subscribe('casa/ia/status')
  mqttClient.subscribe('casa/alarme')
})

mqttClient.on('message', async (topic, message) => {
  const val = message.toString().trim()

  // Telemetria
  if (topic === 'casa/temperatura') {
    const v = parseFloat(val)
    if (!isNaN(v)) {
      latestTelemetry.temperature = v
      latestTelemetry.updatedAt   = new Date()
      io.emit('telemetry', latestTelemetry)
      aiService.updateTelemetry(latestTelemetry)
      maybeSaveTelemetry()
    }
    return
  }

  if (topic === 'casa/umidade') {
    const v = parseFloat(val)
    if (!isNaN(v)) {
      latestTelemetry.humidity  = v
      latestTelemetry.updatedAt = new Date()
      io.emit('telemetry', latestTelemetry)
      aiService.updateTelemetry(latestTelemetry)
    }
    return
  }

  if (topic === 'casa/movimento') {
    latestTelemetry.movement  = val === 'true'
    latestTelemetry.updatedAt = new Date()
    io.emit('telemetry', latestTelemetry)
    aiService.updateTelemetry(latestTelemetry)
    return
  }

  if (topic === 'casa/ia/status') {
    latestTelemetry.iaStatus  = val
    latestTelemetry.updatedAt = new Date()
    io.emit('telemetry', latestTelemetry)
    io.emit('ia_update', { status: val })
    return
  }

  if (topic === 'casa/alarme') {
    console.log(`ALARME ESP32: ${val}`)
    io.emit('alarme', { event: val, timestamp: new Date() })
    return
  }

  // Confirmações de status dos dispositivos
  const parts = topic.split('/')
  if (parts.length === 3 && parts[2] === 'status') {
    const deviceKey = parts[1] === 'luz' ? 'sala-luz' : parts[1]
    console.log(`ESP32 confirmou [${deviceKey}]: ${val}`)
  }
})

// ── Inicializa IA com dependências ────────────────────────────────────────────
aiService.init(prisma, mqttClient, io)

// ── Seed: cria dispositivos se banco estiver vazio ────────────────────────────
async function seed() {
  const count = await prisma.device.count()
  if (count > 0) return

  console.log('Criando dispositivos iniciais...')
  await prisma.device.createMany({
    data: [
      { id: 'sala-luz',   name: 'Luz da Sala',          room: 'Sala',     type: 'light'    },
      { id: 'ventilador', name: 'Ventilador',            room: 'Sala',     type: 'fan'      },
      { id: 'porta',      name: 'Porta Principal',       room: 'Entrada',  type: 'door'     },
      { id: 'alarme',     name: 'Alarme de Segurança',   room: 'Casa',     type: 'security' },
    ]
  })
  console.log('Dispositivos criados!')
}

// ── ROTAS ─────────────────────────────────────────────────────────────────────

// Lista todos os dispositivos
app.get('/api/devices', async (req, res) => {
  const devices = await prisma.device.findMany({ orderBy: { room: 'asc' } })
  res.json(devices)
})

// Toggle de um dispositivo
app.post('/api/devices/:id/toggle', async (req, res) => {
  const { id } = req.params
  const device = await prisma.device.findUnique({ where: { id } })
  if (!device) return res.status(404).json({ error: 'Dispositivo não encontrado' })

  const newState = !device.state
  const updated  = await prisma.device.update({ where: { id }, data: { state: newState } })
  const log      = await prisma.log.create({
    data: { deviceId: id, action: newState ? 'ON' : 'OFF', source: 'manual' },
    include: { device: true }
  })

  // Publica no tópico correto do ESP32
  const cmd = DEVICE_MQTT[id]
  if (cmd) {
    mqttClient.publish(cmd.topic, newState ? cmd.on : cmd.off)
  }

  io.emit('device_update', updated)
  io.emit('new_log', log)
  res.json(updated)
})

// Status atual de todos os dispositivos + telemetria
app.get('/api/status', async (req, res) => {
  const devices = await prisma.device.findMany()
  res.json({ devices, telemetry: latestTelemetry })
})

// Logs / histórico de ações
app.get('/api/logs', async (req, res) => {
  const logs = await prisma.log.findMany({
    take: 50,
    orderBy: { createdAt: 'desc' },
    include: { device: true }
  })
  res.json(logs)
})

// Leitura atual dos sensores
app.get('/api/sensores', (req, res) => {
  res.json(latestTelemetry)
})

// Histórico de telemetria (últimas 100 leituras)
app.get('/api/sensores/historico', async (req, res) => {
  const rows = await prisma.telemetry.findMany({
    take: 100,
    orderBy: { createdAt: 'desc' }
  })
  res.json(rows.reverse())
})

// Eventos de movimento (últimas leituras com movement=true)
app.get('/api/movimento/eventos', async (req, res) => {
  const rows = await prisma.telemetry.findMany({
    where: { movement: true },
    take: 30,
    orderBy: { createdAt: 'desc' }
  })
  res.json(rows)
})

// Reset da IA local no ESP32
app.post('/api/ia/reset', (req, res) => {
  mqttClient.publish('casa/reset', 'RESET_IA')
  latestTelemetry.iaStatus = 'inativa'
  io.emit('ia_update', { status: 'inativa' })
  res.json({ ok: true, message: 'Comando de reset enviado ao ESP32' })
})

// Chat com IA
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
