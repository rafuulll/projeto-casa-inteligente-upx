const Groq = require('groq-sdk')
const schedule = require('node-schedule')

// Cliente inicializado de forma lazy
let _groq = null
function getGroq() {
  if (!_groq) {
    if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY não configurada no ambiente.')
    _groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
  }
  return _groq
}

// Referências injetadas pelo servidor principal
let _prisma, _mqttClient, _io

function init(prisma, mqttClient, io) {
  _prisma     = prisma
  _mqttClient = mqttClient
  _io         = io
}

// ── Ferramentas disponíveis para o Groq ──────────────────────────────────────
const tools = [
  {
    type: 'function',
    function: {
      name: 'control_device',
      description: 'Liga ou desliga um dispositivo específico da casa.',
      parameters: {
        type: 'object',
        properties: {
          deviceId: { type: 'string',  description: 'ID do dispositivo (ex: sala-luz, quarto-ar)' },
          state:    { type: 'boolean', description: 'true para ligar, false para desligar' }
        },
        required: ['deviceId', 'state']
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
      description: 'Liga ou desliga todos os dispositivos de um cômodo específico.',
      parameters: {
        type: 'object',
        properties: {
          room:  { type: 'string',  description: 'Nome do cômodo: Sala, Quarto ou Cozinha' },
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
      description: 'Agenda uma ação para ser executada em um horário específico do dia (repete todo dia).',
      parameters: {
        type: 'object',
        properties: {
          time:     { type: 'string',  description: 'Horário no formato HH:MM (24h), ex: "23:30"' },
          action:   { type: 'string',  description: 'Qual ação: control_device, control_all_devices ou control_room' },
          deviceId: { type: 'string',  description: 'ID do dispositivo (apenas se action for control_device)' },
          room:     { type: 'string',  description: 'Cômodo (apenas se action for control_room)' },
          state:    { type: 'boolean', description: 'true para ligar, false para desligar' }
        },
        required: ['time', 'action', 'state']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_status',
      description: 'Retorna o estado atual de todos os dispositivos da casa.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  }
]

// ── Executores das ferramentas ────────────────────────────────────────────────
async function applyDeviceState(deviceId, state) {
  const device = await _prisma.device.findUnique({ where: { id: deviceId } })
  if (!device) return null
  if (device.state === state) return device

  const updated = await _prisma.device.update({ where: { id: deviceId }, data: { state } })
  const log     = await _prisma.log.create({
    data: { deviceId, action: state ? 'ON' : 'OFF' },
    include: { device: true }
  })

  _mqttClient.publish(`casa/${deviceId}`, state ? 'ON' : 'OFF')
  _io.emit('device_update', updated)
  _io.emit('new_log', log)

  return updated
}

async function executeTool(name, args) {
  switch (name) {
    case 'control_device': {
      const result = await applyDeviceState(args.deviceId, args.state)
      return result
        ? `Dispositivo "${result.name}" foi ${args.state ? 'ligado' : 'desligado'}.`
        : `Dispositivo "${args.deviceId}" não encontrado.`
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
      return `Todos os dispositivos da ${args.room} foram ${args.state ? 'ligados' : 'desligados'}.`
    }

        case 'schedule_action': {
      const [hour, minute] = args.time.split(':').map(Number)
      const rule      = new schedule.RecurrenceRule()
      rule.hour       = hour
      rule.minute     = minute
      rule.tz         = 'America/Sao_Paulo'  // ← adiciona essa linha

      const jobName = `${args.action}-${Date.now()}`
      schedule.scheduleJob(jobName, rule, async () => {
        console.log(`[Agendamento] Executando: ${args.action} às ${args.time}`)
        if (args.action === 'control_device') {
          await applyDeviceState(args.deviceId, args.state)
        } else if (args.action === 'control_all_devices') {
          const all = await _prisma.device.findMany()
          await Promise.all(all.map(d => applyDeviceState(d.id, args.state)))
        } else if (args.action === 'control_room') {
          const roomDevs = await _prisma.device.findMany({ where: { room: args.room } })
          await Promise.all(roomDevs.map(d => applyDeviceState(d.id, args.state)))
        }
      })

      return `Ação agendada para as ${args.time} (horário de Brasília) todos os dias.`
    }

    case 'get_status': {
      const devices = await _prisma.device.findMany({ orderBy: { room: 'asc' } })
      const lines   = devices.map(d => `- ${d.name} (${d.room}): ${d.state ? 'LIGADO' : 'DESLIGADO'}`)
      return `Estado atual:\n${lines.join('\n')}`
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

  const systemPrompt = `Você é um assistente inteligente de controle residencial.
Responda sempre em português brasileiro de forma natural e amigável.

DISPOSITIVOS DISPONÍVEIS:
${deviceList}

SUAS CAPACIDADES:
- Ligar/desligar dispositivos específicos
- Ligar/desligar todos os dispositivos
- Ligar/desligar dispositivos de um cômodo inteiro
- Agendar ações para um horário específico (repete todo dia)
- Verificar o estado atual de todos os dispositivos

REGRAS IMPORTANTES:
- Se o usuário pedir uma ação SEM mencionar horário → execute IMEDIATAMENTE com control_device, control_room ou control_all_devices
- Se o usuário pedir uma ação COM horário específico (ex: "às 22h", "às 23:30") → use schedule_action para agendar
- Nunca agende uma ação quando o usuário quer que ela aconteça agora
- Se a ação for agendada, responda:
  ✅ "Ok! Vou ligar/desligar [dispositivo] às HH:MM todos os dias."
- Se a ação for imediata, responda:
  ✅ "Pronto! O [dispositivo] está ligado/desligado."
- Se o usuário pedir algo sem especificar dispositivo, pergunte de forma educada qual dispositivo ele quer controlar
- Seja sempre objetivo, direto e utilize emojis relevantes
- Responda sempre em portugês brasileiro de forma natural e amigável.`

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: userMessage  }
  ]

  // Primeira chamada ao Groq
  const response = await getGroq().chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages,
    tools,
    tool_choice: 'auto',
  })

  const msg = response.choices[0].message

  // Se o Groq quer usar ferramentas
  if (msg.tool_calls && msg.tool_calls.length > 0) {
    messages.push(msg)

    const toolResults = await Promise.all(
      msg.tool_calls.map(async (tc) => {
        const args   = JSON.parse(tc.function.arguments)
        const result = await executeTool(tc.function.name, args)
        return {
          role:         'tool',
          tool_call_id: tc.id,
          content:      result
        }
      })
    )

    messages.push(...toolResults)

    // Segunda chamada — Groq formula a resposta final
    const finalResponse = await getGroq().chat.completions.create({
      model:    'llama-3.1-8b-instant',
      messages,
    })

    const finalContent = finalResponse.choices[0].message.content
    return finalContent || 'Ação executada com sucesso! ✓'
  }

  return msg.content || 'Pronto!'
}

module.exports = { init, handleChat }