const Groq            = require('groq-sdk')
const schedule        = require('node-schedule')
const { DEVICE_MQTT } = require('./config')

// ── Groq lazy init ────────────────────────────────────────────────────────────
let _groq = null
function getGroq() {
  if (!_groq) {
    if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY não configurada.')
    _groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
  }
  return _groq
}

// ── Dependências injetadas pelo servidor ──────────────────────────────────────
let _prisma, _mqttClient, _io

function init(prisma, mqttClient, io) {
  _prisma     = prisma
  _mqttClient = mqttClient
  _io         = io
}

// ── Telemetria em tempo real (atualizada pelo index.js) ───────────────────────
let _telemetry = { temperature: null, humidity: null, movement: false, iaStatus: 'inativa' }

function updateTelemetry(data) {
  _telemetry = { ..._telemetry, ...data }
}

// ── Ferramentas disponíveis para o Groq ──────────────────────────────────────
const tools = [
  {
    type: 'function',
    function: {
      name: 'control_device',
      description: 'Liga ou desliga um ou mais dispositivos específicos da casa.',
      parameters: {
        type: 'object',
        properties: {
          deviceIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Lista de IDs: "sala-luz", "ventilador", "porta", "alarme"'
          },
          state: { type: 'boolean', description: 'true para ligar/abrir/ativar, false para desligar/fechar/desativar' }
        },
        required: ['deviceIds', 'state']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'control_all_devices',
      description: 'Liga ou desliga TODOS os dispositivos da casa de uma vez.',
      parameters: {
        type: 'object',
        properties: {
          state: { type: 'boolean', description: 'true para ligar todos, false para desligar todos' }
        },
        required: ['state']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'control_room',
      description: 'Liga ou desliga todos os dispositivos de um cômodo.',
      parameters: {
        type: 'object',
        properties: {
          room:  { type: 'string',  description: 'Nome do cômodo: Sala, Entrada ou Casa' },
          state: { type: 'boolean', description: 'true para ligar, false para desligar' }
        },
        required: ['room', 'state']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'schedule_action',
      description: 'Agenda uma ação para o futuro (horário específico ou daqui a X segundos/minutos).',
      parameters: {
        type: 'object',
        properties: {
          delay_seconds: { type: 'number', description: 'Para agendamentos relativos. Ex: "daqui 30 segundos" → 30' },
          time:          { type: 'string', description: 'Horário exato no formato HH:MM (24h). Ex: "23:30"' },
          action:        { type: 'string', description: 'Qual ação: control_device, control_all_devices ou control_room' },
          deviceIds:     { type: 'array', items: { type: 'string' }, description: 'IDs dos dispositivos (se action=control_device)' },
          room:          { type: 'string', description: 'Cômodo (se action=control_room)' },
          state:         { type: 'boolean', description: 'true para ligar, false para desligar' },
          repeat:        { type: 'boolean', description: 'true para repetir todo dia no horário "time"' }
        },
        required: ['action', 'state']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_status',
      description: 'Retorna o estado atual de todos os dispositivos da casa.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_sensor_data',
      description: 'Retorna as leituras atuais dos sensores: temperatura, umidade e movimento.',
      parameters: { type: 'object', properties: {} }
    }
  }
]

// ── Executores das ferramentas ─────────────────────────────────────────────────
async function applyDeviceState(deviceId, state) {
  const device = await _prisma.device.findUnique({ where: { id: deviceId } })
  if (!device) return null
  if (device.state === state) return device

  const updated = await _prisma.device.update({ where: { id: deviceId }, data: { state } })
  const log     = await _prisma.log.create({
    data: { deviceId, action: state ? 'ON' : 'OFF', source: 'ia_chat' },
    include: { device: true }
  })

  const cmd = DEVICE_MQTT[deviceId]
  if (cmd) _mqttClient.publish(cmd.topic, state ? cmd.on : cmd.off)

  _io.emit('device_update', updated)
  _io.emit('new_log', log)
  return updated
}

async function executeTool(name, args) {
  switch (name) {

    case 'control_device': {
      const ids     = args.deviceIds || []
      const results = await Promise.all(ids.map(id => applyDeviceState(id, args.state)))
      const changed = results.filter(Boolean)
      return changed.length > 0
        ? `${args.state ? 'Ligado' : 'Desligado'}: ${changed.map(d => d.name).join(', ')}.`
        : 'Nenhum dispositivo encontrado.'
    }

    case 'control_all_devices': {
      const devices = await _prisma.device.findMany()
      await Promise.all(devices.map(d => applyDeviceState(d.id, args.state)))
      return `Todos os ${devices.length} dispositivos foram ${args.state ? 'ligados' : 'desligados'}.`
    }

    case 'control_room': {
      const devices = await _prisma.device.findMany({ where: { room: args.room } })
      if (devices.length === 0) return `Cômodo "${args.room}" não encontrado.`
      await Promise.all(devices.map(d => applyDeviceState(d.id, args.state)))
      return `Todos os dispositivos de "${args.room}" foram ${args.state ? 'ligados' : 'desligados'}.`
    }

    case 'schedule_action': {
      const jobName  = `${args.action}-${Date.now()}`

      const executeFn = async () => {
        console.log(`[Agendamento] Executando: ${args.action}`)
        if (args.action === 'control_device') {
          await Promise.all((args.deviceIds || []).map(id => applyDeviceState(id, args.state)))
        } else if (args.action === 'control_all_devices') {
          const all = await _prisma.device.findMany()
          await Promise.all(all.map(d => applyDeviceState(d.id, args.state)))
        } else if (args.action === 'control_room') {
          const devs = await _prisma.device.findMany({ where: { room: args.room } })
          await Promise.all(devs.map(d => applyDeviceState(d.id, args.state)))
        }
      }

      if (args.delay_seconds) {
        const date = new Date(Date.now() + args.delay_seconds * 1000)
        schedule.scheduleJob(jobName, date, executeFn)
        return `Ação agendada para daqui a ${args.delay_seconds} segundos.`
      }

      if (args.time) {
        const [hour, minute] = args.time.split(':').map(Number)
        if (args.repeat) {
          const rule  = new schedule.RecurrenceRule()
          rule.hour   = hour
          rule.minute = minute
          rule.tz     = 'America/Sao_Paulo'
          schedule.scheduleJob(jobName, rule, executeFn)
          return `Ação agendada para as ${args.time} todos os dias.`
        } else {
          const nowBrtStr = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
          const brtDate   = new Date(nowBrtStr)
          brtDate.setHours(hour, minute, 0, 0)
          const nowBrt = new Date(nowBrtStr)
          let diff     = brtDate.getTime() - nowBrt.getTime()
          if (diff <= 0) {
            if (-diff < 5 * 60 * 1000) { executeFn(); return `Ação executada (${args.time} acabou de passar).` }
            diff += 24 * 60 * 60 * 1000
          }
          schedule.scheduleJob(jobName, new Date(Date.now() + diff), executeFn)
          return `Ação agendada para as ${args.time}.`
        }
      }

      return 'Erro: informe "time" ou "delay_seconds".'
    }

    case 'get_status': {
      const devices = await _prisma.device.findMany({ orderBy: { room: 'asc' } })
      const lines   = devices.map(d => `- ${d.name} (${d.room}): ${d.state ? 'LIGADO' : 'DESLIGADO'}`)
      return `Estado atual:\n${lines.join('\n')}`
    }

    case 'get_sensor_data': {
      const t = _telemetry.temperature !== null ? `${_telemetry.temperature}°C` : 'sem leitura'
      const h = _telemetry.humidity    !== null ? `${_telemetry.humidity}%`     : 'sem leitura'
      const m = _telemetry.movement ? 'detectado' : 'nenhum'
      const ia = _telemetry.iaStatus
      return `Sensores: Temperatura=${t}, Umidade=${h}, Movimento=${m}, IA Local=${ia}`
    }

    default:
      return `Ferramenta "${name}" não reconhecida.`
  }
}

// ── Handler principal do chat ─────────────────────────────────────────────────
async function handleChat(userMessage) {
  const devices    = await _prisma.device.findMany({ orderBy: { room: 'asc' } })
  const deviceList = devices.map(d =>
    `- ID: "${d.id}" | Nome: "${d.name}" | Cômodo: ${d.room} | Estado: ${d.state ? 'LIGADO' : 'DESLIGADO'}`
  ).join('\n')

  const now      = new Date()
  const horaBRT  = now.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
  const tempInfo = _telemetry.temperature !== null
    ? `${_telemetry.temperature}°C`
    : 'sem leitura (ESP32 desconectado)'
  const humInfo  = _telemetry.humidity !== null
    ? `${_telemetry.humidity}%`
    : 'sem leitura'

  const systemPrompt = `Você é o assistente inteligente da Casa Inteligente (Smart Home Híbrido v3.0).
Responda sempre em português brasileiro de forma natural, curta e amigável.
A hora atual é: ${horaBRT} (Horário de Brasília).

SENSORES ATUAIS:
- Temperatura: ${tempInfo}
- Umidade: ${humInfo}
- Movimento: ${_telemetry.movement ? 'detectado' : 'nenhum'}
- IA Local: ${_telemetry.iaStatus}

DISPOSITIVOS DISPONÍVEIS:
${deviceList}

REGRAS CRÍTICAS:
1. Use APENAS chamadas de função nativas. NUNCA escreva nomes de funções no texto.
2. Dispositivos específicos: chame "control_device" com a lista de IDs.
3. Todo um cômodo: chame "control_room".
4. Todos os dispositivos: chame "control_all_devices".
5. Agendamentos por delay: use "delay_seconds". Por horário exato: use "time" (HH:MM). Todo dia: "repeat=true".
6. Para perguntas sobre temperatura/sensores: chame "get_sensor_data".
7. Após executar, confirme em uma frase curta. Não liste JSONs ou nomes de funções ao usuário.`

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: userMessage  }
  ]

  try {
    const response = await getGroq().chat.completions.create({
      model:       'llama-3.3-70b-versatile',
      messages,
      tools,
      tool_choice: 'auto',
    })

    const msg = response.choices[0].message

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      messages.push(msg)

      const toolResults = await Promise.all(
        msg.tool_calls.map(async (tc) => {
          let result
          try {
            const args = JSON.parse(tc.function.arguments)
            result = await executeTool(tc.function.name, args)
          } catch (e) {
            console.error('Erro tool call:', e)
            result = 'Erro interno ao executar a ação.'
          }
          return { role: 'tool', tool_call_id: tc.id, content: result }
        })
      )

      messages.push(...toolResults)

      const final = await getGroq().chat.completions.create({
        model:    'llama-3.3-70b-versatile',
        messages,
      })

      return final.choices[0].message.content || 'Ação executada! ✓'
    }

    return msg.content || 'Pronto!'
  } catch (error) {
    console.error('Erro de IA:', error.message || error)
    return 'Desculpe, houve uma falha de comunicação com a IA. Tente novamente.'
  }
}

module.exports = { init, handleChat, updateTelemetry }
