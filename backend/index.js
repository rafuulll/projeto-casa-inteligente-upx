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

// ── Helpers de mapeamento ─────────────────────────────────────────────────────
const toDeviceDTO = (d) => ({
  id:     d.id,
  nome:   d.name,
  comodo: d.room,
  tipo:   d.type,
  estado: d.state
})

const toTelemetriaDTO = (t) => ({
  temperatura: t.temperature,
  umidade:     t.humidity,
  movimento:   t.movement,
  ia_status:   t.iaStatus === 'ativa' ? 'online' : 'aprendendo',
  porta:       t.doorStatus,
  alarme:      t.alarmeStatus || 'desarmado',
  timestamp:   t.updatedAt
})

// ── Motor de regras ───────────────────────────────────────────────────────────
const ruleCooldowns = new Map()
const RULE_COOLDOWN_MS = 60000

function parseRuleTrigger(trigger) {
  const t = trigger.toLowerCase().trim()
  const delayMatch = t.match(/(\d+)\s*s\s*$/)
  const delay = delayMatch ? parseInt(delayMatch[1]) * 1000 : 0
  const tempMatch = t.match(/temp(?:eratura)?\s*([><]=?)\s*(\d+(?:\.\d+)?)/)
  if (tempMatch) return { type: 'temp', op: tempMatch[1], value: parseFloat(tempMatch[2]), delay }
  const humMatch = t.match(/umidade?\s*([><]=?)\s*(\d+(?:\.\d+)?)/)
  if (humMatch) return { type: 'humidity', op: humMatch[1], value: parseFloat(humMatch[2]), delay }
  if (t.includes('movimento') || t.includes('pir')) return { type: 'movement', delay }
  return null
}

function evalCondition(condition, tel) {
  const check = (actual, op, threshold) => {
    if (actual == null) return false
    if (op === '>')  return actual > threshold
    if (op === '>=') return actual >= threshold
    if (op === '<')  return actual < threshold
    if (op === '<=') return actual <= threshold
    return false
  }
  if (condition.type === 'temp')     return check(tel.temperature, condition.op, condition.value)
  if (condition.type === 'humidity') return check(tel.humidity,    condition.op, condition.value)
  if (condition.type === 'movement') return tel.movement === true
  return false
}

function inferDeviceAction(nome, descricao) {
  const direct = descricao.match(/^device:([^:]+):(\w+)$/)
  if (direct) {
    const id  = direct[1]
    const act = direct[2]
    if (id === 'porta')  return { deviceId: 'porta',  state: act === 'ABRIR' }
    if (id === 'alarme') return { deviceId: 'alarme', state: act === 'ARMAR' }
    return { deviceId: id, state: act === 'ON' }
  }
  const text = (nome + ' ' + descricao).toLowerCase()
  let deviceId = null
  if      (text.match(/ar.condicionado|quarto.ar/))                deviceId = 'quarto-ar'
  else if (text.match(/ventilador|sala.ventilador/))                deviceId = 'sala-ventilador'
  else if (text.match(/luz.*(sala)|sala.*(luz)/))                   deviceId = 'sala-luz'
  else if (text.match(/luz.*(quarto)|quarto.*(luz)/))               deviceId = 'quarto-luz'
  else if (text.match(/luz.*(cozinha)|cozinha.*(luz)/))             deviceId = 'cozinha-luz'
  else if (text.includes('cafeteira') || text.includes('banheiro')) deviceId = 'cozinha-cafeteira'
  let state = null
  if      (text.match(/deslig|desativ|\boff\b/)) state = false
  else if (text.match(/\bliga|\bativ|\bon\b/))   state = true
  return { deviceId, state }
}

async function processRules() {
  if (telemetria.temperature === null) return
  try {
    const rules = await prisma.rule.findMany({ where: { ativa: true } })
    for (const rule of rules) {
      const condition = parseRuleTrigger(rule.trigger)
      if (!condition) continue
      if (!evalCondition(condition, telemetria)) continue
      const last = ruleCooldowns.get(rule.id) || 0
      if (Date.now() - last < RULE_COOLDOWN_MS) continue
      const { deviceId, state } = inferDeviceAction(rule.nome, rule.descricao)
      if (!deviceId || state === null) continue
      const device = await prisma.device.findUnique({ where: { id: deviceId } })
      if (!device || device.state === state) { ruleCooldowns.set(rule.id, Date.now()); continue }
      console.log(`[Regra] "${rule.nome}" → ${deviceId} ${state ? 'ON' : 'OFF'}${condition.delay ? ` (delay ${condition.delay}ms)` : ''}`)
      ruleCooldowns.set(rule.id, Date.now())
      const execAction = async () => {
        if (deviceId === 'porta') {
          const cmd = state ? 'ABRIR' : 'FECHAR'
          mqttClient.publish('upx2025/casa/porta/comando', cmd)
          telemetria.doorStatus = state ? 'aberta' : 'fechada'
          telemetria.updatedAt  = new Date()
          io.emit('telemetria', toTelemetriaDTO(telemetria))
          broadcastSSE()
          return
        }
        if (deviceId === 'alarme') {
          const cmd = state ? 'ATIVAR' : 'DESATIVAR'
          mqttClient.publish('upx2025/casa/alarme/comando', cmd)
          telemetria.alarmeStatus = state ? 'armado' : 'desarmado'
          io.emit('telemetria', toTelemetriaDTO(telemetria))
          broadcastSSE()
          return
        }
        const updated = await prisma.device.update({ where: { id: deviceId }, data: { state } })
        const log = await prisma.log.create({ data: { deviceId, action: state ? 'ON' : 'OFF' }, include: { device: true } })
        mqttClient.publish(`upx2025/casa/${deviceId}`, state ? 'ON' : 'OFF')
        io.emit('device_update', toDeviceDTO(updated))
        io.emit('new_log', { ...log, descricao: `${updated.name} ${state ? 'ligado' : 'desligado'} (regra: ${rule.nome})`, tipo: state ? 'on' : 'off' })
      }
      if (condition.delay > 0) setTimeout(execAction, condition.delay)
      else await execAction()
    }
  } catch (e) { console.error('[Regra] Erro:', e.message) }
}

async function triggerPortaRules() {
  try {
    const rules = await prisma.rule.findMany({ where: { ativa: true } })
    for (const rule of rules) {
      const t = rule.trigger.toLowerCase().trim()
      const match = t.match(/porta\s+aberta\s+(\d+)\s*s/)
      if (!match) continue
      const segundos = parseInt(match[1])
      console.log(`[Regra] "${rule.nome}" → fecha porta em ${segundos}s`)
      setTimeout(() => {
        mqttClient.publish('upx2025/casa/porta/comando', 'FECHAR')
        telemetria.doorStatus = 'fechada'
        telemetria.updatedAt  = new Date()
        io.emit('telemetria', toTelemetriaDTO(telemetria))
        broadcastSSE()
      }, segundos * 1000)
    }
  } catch (e) { console.error('[Porta] Erro:', e.message) }
}

// ── Estado de telemetria em memória ──────────────────────────────────────────
const telemetria = {
  temperature:  null,
  humidity:     null,
  movement:     false,
  iaStatus:     'inativa',
  doorStatus:   'fechada',
  alarmeStatus: 'desarmado',
  lastMovement: null,
  updatedAt:    null
}

// ── MQTT ──────────────────────────────────────────────────────────────────────
const mqttBroker = process.env.MQTT_BROKER || 'mqtt://broker.hivemq.com:1883'
const mqttClient = mqtt.connect(mqttBroker)

mqttClient.on('connect', () => {
  console.log(`MQTT conectado: ${mqttBroker}`)

  // Dispositivos (confirmações do ESP32)
  mqttClient.subscribe('upx2025/casa/+/status')

  // Telemetria
  mqttClient.subscribe('upx2025/casa/temperatura')
  mqttClient.subscribe('upx2025/casa/umidade')
  mqttClient.subscribe('upx2025/casa/movimento')
  mqttClient.subscribe('upx2025/casa/ia/status')
  mqttClient.subscribe('upx2025/casa/alarme')
})

mqttClient.on('message', (topic, message) => {
  const msg   = message.toString()
  const parts = topic.split('/')

  // Confirmações de dispositivos: upx2025/casa/sala-luz/status, etc.
  if (parts.length === 4 && parts[3] === 'status' && parts[2] !== 'ia' && parts[2] !== 'porta') {
    const deviceId = parts[2]
    const newState = msg === 'ON'
    console.log(`ESP32 confirmou [${deviceId}]: ${msg}`)

    prisma.device.findUnique({ where: { id: deviceId } }).then(async (device) => {
      if (!device || device.state === newState) return
      const updated = await prisma.device.update({ where: { id: deviceId }, data: { state: newState } })
      const log = await prisma.log.create({
        data: { deviceId, action: newState ? 'ON' : 'OFF' },
        include: { device: true }
      })
      io.emit('device_update', toDeviceDTO(updated))
      io.emit('new_log', { ...log, descricao: `${updated.name} ${newState ? 'ligado' : 'desligado'} (automático)`, tipo: newState ? 'on' : 'off' })
    }).catch(() => {})
    return
  }

  switch (topic) {
    case 'upx2025/casa/temperatura':
      telemetria.temperature = parseFloat(msg)
      telemetria.updatedAt   = new Date()
      io.emit('telemetria', toTelemetriaDTO(telemetria))
      broadcastSSE()
      processRules()
      break

    case 'upx2025/casa/umidade':
      telemetria.humidity  = parseFloat(msg)
      telemetria.updatedAt = new Date()
      io.emit('telemetria', toTelemetriaDTO(telemetria))
      broadcastSSE()
      processRules()
      break

    case 'upx2025/casa/movimento':
      telemetria.movement = msg === 'true'
      if (msg === 'true') {
        telemetria.lastMovement = new Date()
        prisma.telemetry.create({
          data: { temperature: telemetria.temperature, humidity: telemetria.humidity, movement: true }
        }).catch(() => {})
      }
      telemetria.updatedAt = new Date()
      io.emit('telemetria', toTelemetriaDTO(telemetria))
      broadcastSSE()
      break

    case 'upx2025/casa/ia/status':
      telemetria.iaStatus  = msg
      telemetria.updatedAt = new Date()
      io.emit('telemetria', toTelemetriaDTO(telemetria))
      break

    case 'upx2025/casa/porta/status':
      telemetria.doorStatus = msg
      telemetria.updatedAt  = new Date()
      io.emit('telemetria', toTelemetriaDTO(telemetria))
      broadcastSSE()
      if (msg === 'aberta') triggerPortaRules()
      break

    case 'upx2025/casa/alarme':
      console.log(`ALARME: ${msg}`)
      io.emit('alarm_event', { event: msg, timestamp: new Date() })
      if (msg === 'intruso_detectado') {
        telemetria.alarmeStatus = 'desarmado'
        telemetria.updatedAt = new Date()
        io.emit('telemetria', toTelemetriaDTO(telemetria))
        broadcastSSE()
      }
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
if (process.env.ANTHROPIC_API_KEY) {
  try {
    aiService.init(prisma, mqttClient, io,
      (alarmeStatus) => {
        telemetria.alarmeStatus = alarmeStatus
        io.emit('telemetria', toTelemetriaDTO(telemetria))
        broadcastSSE()
      },
      (portaStatus) => {
        telemetria.doorStatus = portaStatus
        telemetria.updatedAt  = new Date()
        io.emit('telemetria', toTelemetriaDTO(telemetria))
        broadcastSSE()
      }
    )
    telemetria.iaStatus = 'ativa'
  } catch (e) {
    console.error('Falha ao iniciar IA Service:', e.message)
    telemetria.iaStatus = 'inativa'
  }
} else {
  console.log('IA Service desativado (chave não encontrada).')
  telemetria.iaStatus = 'inativa'
}

// ── Seed ──────────────────────────────────────────────────────────────────────
async function seed() {
  const deviceCount = await prisma.device.count()
  if (deviceCount === 0) {
    console.log('Criando dispositivos iniciais...')
    await prisma.device.createMany({
      data: [
        { id: 'sala-luz',          name: 'Luz da Sala',     room: 'Sala',    type: 'light' },
        { id: 'sala-ventilador',   name: 'Ventilador',      room: 'Sala',    type: 'fan'   },
        { id: 'quarto-luz',        name: 'Luz do Quarto',   room: 'Quarto',  type: 'light' },
        { id: 'quarto-ar',         name: 'Ar-condicionado', room: 'Quarto',  type: 'ac'    },
        { id: 'cozinha-luz',       name: 'Luz da Cozinha',  room: 'Cozinha', type: 'light' },
        { id: 'cozinha-cafeteira', name: 'Luz do Banheiro', room: 'Banheiro', type: 'light' },
      ]
    })
    console.log('Dispositivos criados!')
  } else {
    await prisma.device.update({
      where: { id: 'cozinha-cafeteira' },
      data:  { name: 'Luz do Banheiro', room: 'Banheiro', type: 'light' }
    }).catch(() => {})
  }

  const ruleCount = await prisma.rule.count()
  if (ruleCount === 0) {
    await prisma.rule.createMany({
      data: [
        { nome: 'Ventilador automático',  descricao: 'Liga o ventilador da sala',       trigger: 'temp > 28°C'       },
        { nome: 'Desliga ventilador',     descricao: 'Desliga o ventilador da sala',    trigger: 'temp < 26°C'       },
        { nome: 'Alerta calor extremo',   descricao: 'Dispara buzzer e publica alarme', trigger: 'temp > 35°C'       },
        { nome: 'Detector de intrusos',   descricao: 'Alarme ao detectar movimento',    trigger: 'PIR + modo seguro' },
        { nome: 'Fecha porta automática', descricao: 'Fecha a porta após 3s aberta',    trigger: 'porta aberta 3s'   },
      ]
    })
    console.log('Regras criadas!')
  }
}

// ── Rotas: dispositivos ───────────────────────────────────────────────────────
app.get('/api/devices', async (req, res) => {
  const devices = await prisma.device.findMany({ orderBy: { room: 'asc' } })
  res.json(devices.map(toDeviceDTO))
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

  mqttClient.publish(`upx2025/casa/${id}`, newState ? 'ON' : 'OFF')
  io.emit('device_update', toDeviceDTO(updated))
  io.emit('new_log', { ...log, descricao: `${updated.name} ${newState ? 'ligado' : 'desligado'}`, tipo: newState ? 'on' : 'off' })

  res.json(toDeviceDTO(updated))
})

// ── Rotas: telemetria ─────────────────────────────────────────────────────────
app.get('/api/telemetria/atual', (req, res) => {
  res.json(toTelemetriaDTO(telemetria))
})

app.get('/api/telemetria/historico', async (req, res) => {
  const { periodo = '24h' } = req.query
  const horas = { '1h': 1, '6h': 6, '24h': 24, '1d': 24, '7d': 168, '30d': 720 }[periodo] ?? 24
  const desde = new Date(Date.now() - horas * 60 * 60 * 1000)

  const dados = await prisma.telemetry.findMany({
    where:   { createdAt: { gte: desde } },
    orderBy: { createdAt: 'asc' },
    take:    500
  })
  res.json(dados.map(d => ({
    temperatura: d.temperature,
    umidade:     d.humidity,
    timestamp:   d.createdAt
  })))
})

app.get('/api/movimento', async (req, res) => {
  const eventos = await prisma.telemetry.findMany({
    where:   { movement: true },
    orderBy: { createdAt: 'desc' },
    take:    20
  })
  res.json(eventos.map(e => ({
    id:        e.id,
    timestamp: e.createdAt,
    local:     'Entrada principal'
  })))
})

// ── Rotas: porta e alarme ─────────────────────────────────────────────────────
app.post('/api/porta/:acao', (req, res) => {
  const { acao } = req.params
  if (!['abrir', 'fechar'].includes(acao)) return res.status(400).json({ error: 'Ação inválida' })
  mqttClient.publish('upx2025/casa/porta/comando', acao === 'abrir' ? 'ABRIR' : 'FECHAR')
  telemetria.doorStatus = acao === 'abrir' ? 'aberta' : 'fechada'
  telemetria.updatedAt  = new Date()
  io.emit('telemetria', toTelemetriaDTO(telemetria))
  broadcastSSE()
  res.json({ ok: true, acao })
})

app.post('/api/alarme/:acao', (req, res) => {
  const { acao } = req.params
  const ligar    = ['ativar', 'armar'].includes(acao)
  const desligar = ['desativar', 'desarmar'].includes(acao)
  if (!ligar && !desligar) return res.status(400).json({ error: 'Ação inválida' })
  mqttClient.publish('upx2025/casa/alarme/comando', ligar ? 'ATIVAR' : 'DESATIVAR')
  telemetria.alarmeStatus = ligar ? 'armado' : 'desarmado'
  io.emit('telemetria', toTelemetriaDTO(telemetria))
  broadcastSSE()
  res.json({ ok: true, acao })
})

// ── Rotas: IA / automações ────────────────────────────────────────────────────
app.get('/api/ai/stats', (req, res) => {
  res.json({
    status:              telemetria.iaStatus === 'ativa' ? 'online' : 'aprendendo',
    precisao:            telemetria.iaStatus === 'ativa' ? 0.85 : null,
    eventos_aprendidos:  telemetria.iaStatus === 'ativa' ? 5 : null,
    modelos:             1,
    uptime:              telemetria.updatedAt
  })
})

app.get('/api/ai/regras', async (req, res) => {
  const regras = await prisma.rule.findMany({ orderBy: { createdAt: 'asc' } })
  res.json(regras)
})

app.post('/api/ai/regras', async (req, res) => {
  const { nome, descricao, trigger } = req.body
  if (!nome || !descricao || !trigger) return res.status(400).json({ error: 'nome, descricao e trigger são obrigatórios' })
  const regra = await prisma.rule.create({ data: { nome, descricao, trigger } })
  res.json(regra)
})

app.put('/api/ai/regras/:id', async (req, res) => {
  const { id } = req.params
  const { nome, descricao, trigger, ativa } = req.body
  const regra = await prisma.rule.update({ where: { id }, data: { nome, descricao, trigger, ativa } })
  res.json(regra)
})

app.post('/api/ai/regras/:id/toggle', async (req, res) => {
  const { id } = req.params
  const regra = await prisma.rule.findUnique({ where: { id } })
  if (!regra) return res.status(404).json({ error: 'Regra não encontrada' })
  const updated = await prisma.rule.update({ where: { id }, data: { ativa: !regra.ativa } })
  res.json(updated)
})

app.delete('/api/ai/regras/:id', async (req, res) => {
  const { id } = req.params
  await prisma.rule.delete({ where: { id } })
  res.json({ ok: true })
})

app.post('/api/ia/reset', (req, res) => {
  mqttClient.publish('upx2025/casa/reset', 'RESET_IA')
  res.json({ ok: true })
})

// ── Rota: IA chat ─────────────────────────────────────────────────────────────
app.post('/api/ai/chat', async (req, res) => {
  const { message, history = [] } = req.body
  if (!message) return res.status(400).json({ error: 'Campo "message" obrigatório.' })

  try {
    const reply = await aiService.handleChat(message, history)
    res.json({ reply })
  } catch (err) {
    console.error('Erro na IA:', err.message)
    res.status(500).json({ error: 'Falha ao comunicar com a IA.', detail: err.message })
  }
})

// ── Server-Sent Events ───────────────────────────────────────────────────────
const sseClients = new Set()

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.flushHeaders()

  const send = () => {
    res.write(`data: ${JSON.stringify(toTelemetriaDTO(telemetria))}\n\n`)
  }

  send()
  const interval = setInterval(send, 1000)
  sseClients.add({ send, interval, res })

  req.on('close', () => {
    clearInterval(interval)
    sseClients.forEach(c => { if (c.res === res) sseClients.delete(c) })
  })
})

function broadcastSSE() {
  sseClients.forEach(({ send }) => { try { send() } catch {} })
}

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001
server.listen(PORT, async () => {
  await seed()
  console.log(`Backend rodando em http://localhost:${PORT}`)
})
