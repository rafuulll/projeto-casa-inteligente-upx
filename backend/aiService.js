const Anthropic = require('@anthropic-ai/sdk')
const schedule  = require('node-schedule')

let _client = null
function getClient() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada no ambiente.')
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _client
}

let _prisma, _mqttClient, _io

function init(prisma, mqttClient, io) {
  _prisma     = prisma
  _mqttClient = mqttClient
  _io         = io
}

// ── Ferramentas (formato Anthropic) ──────────────────────────────────────────
const tools = [
  {
    name: 'control_device',
    description: 'Liga ou desliga um ou mais dispositivos específicos da casa.',
    input_schema: {
      type: 'object',
      properties: {
        deviceIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Lista de IDs dos dispositivos (ex: ["sala-luz", "quarto-ar"])'
        },
        state: { type: 'boolean', description: 'true para ligar, false para desligar' }
      },
      required: ['deviceIds', 'state']
    }
  },
  {
    name: 'control_all_devices',
    description: 'Liga ou desliga TODOS os dispositivos da casa de uma vez.',
    input_schema: {
      type: 'object',
      properties: {
        state: { type: 'boolean', description: 'true para ligar todos, false para desligar todos' }
      },
      required: ['state']
    }
  },
  {
    name: 'control_room',
    description: 'Liga ou desliga todos os dispositivos de um cômodo específico.',
    input_schema: {
      type: 'object',
      properties: {
        room:  { type: 'string',  description: 'Nome do cômodo: Sala, Quarto ou Cozinha' },
        state: { type: 'boolean', description: 'true para ligar, false para desligar' }
      },
      required: ['room', 'state']
    }
  },
  {
    name: 'schedule_action',
    description: 'Agenda uma ação para o futuro (seja num horário específico ou daqui a alguns segundos/minutos).',
    input_schema: {
      type: 'object',
      properties: {
        delay_seconds: { type: 'number',  description: 'Delay relativo em segundos (ex: "daqui 5 minutos" → 300)' },
        time:          { type: 'string',  description: 'Horário exato no formato HH:MM (24h), ex: "23:30"' },
        action:        { type: 'string',  description: 'Qual ação: control_device, control_all_devices ou control_room' },
        deviceIds:     { type: 'array', items: { type: 'string' }, description: 'IDs dos dispositivos (se action for control_device)' },
        room:          { type: 'string',  description: 'Cômodo (se action for control_room)' },
        state:         { type: 'boolean', description: 'true para ligar, false para desligar' },
        repeat:        { type: 'boolean', description: 'true para repetir todos os dias no horário especificado em "time"' }
      },
      required: ['action', 'state']
    }
  },
  {
    name: 'get_status',
    description: 'Retorna o estado atual de todos os dispositivos da casa.',
    input_schema: {
      type: 'object',
      properties: {}
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
  _io.emit('device_update', { id: updated.id, nome: updated.name, comodo: updated.room, tipo: updated.type, estado: updated.state })
  _io.emit('new_log', { ...log, descricao: `${updated.name} ${state ? 'ligado' : 'desligado'} (IA)`, tipo: state ? 'on' : 'off' })

  return updated
}

async function executeTool(name, args) {
  switch (name) {
    case 'control_device': {
      const ids     = args.deviceIds || (args.deviceId ? [args.deviceId] : [])
      const results = await Promise.all(ids.map(id => applyDeviceState(id, args.state)))
      const changed = results.filter(Boolean)
      return changed.length > 0
        ? `Dispositivos ${args.state ? 'ligados' : 'desligados'}: ${changed.map(d => d.name).join(', ')}.`
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
      return `Todos os dispositivos da ${args.room} foram ${args.state ? 'ligados' : 'desligados'}.`
    }

    case 'schedule_action': {
      const jobName  = `${args.action}-${Date.now()}`

      const executeFn = async () => {
        console.log(`[Agendamento] Executando: ${args.action}`)
        if (args.action === 'control_device') {
          const ids = args.deviceIds || (args.deviceId ? [args.deviceId] : [])
          await Promise.all(ids.map(id => applyDeviceState(id, args.state)))
        } else if (args.action === 'control_all_devices') {
          const all = await _prisma.device.findMany()
          await Promise.all(all.map(d => applyDeviceState(d.id, args.state)))
        } else if (args.action === 'control_room') {
          const roomDevs = await _prisma.device.findMany({ where: { room: args.room } })
          await Promise.all(roomDevs.map(d => applyDeviceState(d.id, args.state)))
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
            if (-diff < 5 * 60 * 1000) { executeFn(); return `Ação executada imediatamente (${args.time} acabou de passar).` }
            else diff += 24 * 60 * 60 * 1000
          }
          schedule.scheduleJob(jobName, new Date(Date.now() + diff), executeFn)
          return `Ação agendada para as ${args.time} (única vez).`
        }
      }

      return "Erro: informe 'time' ou 'delay_seconds'."
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

  const horaAtual = new Date().toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit'
  })

  const systemPrompt = `Você é um assistente inteligente de controle residencial.
Responda sempre em português brasileiro de forma natural, curta e amigável.
A hora atual é: ${horaAtual} (Horário de Brasília).

DISPOSITIVOS DISPONÍVEIS:
${deviceList}

REGRAS:
1. Para ligar/desligar dispositivos específicos: use "control_device" com a lista de IDs.
2. Para ligar/desligar um cômodo inteiro: use "control_room".
3. Para ligar/desligar tudo: use "control_all_devices".
4. Para agendamentos: use "schedule_action" com "delay_seconds" (relativo) ou "time" (HH:MM).
5. Após executar, confirme em uma frase curta. Nunca mostre JSON ou código na resposta final.`

  const messages = [{ role: 'user', content: userMessage }]

  try {
    const response = await getClient().messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system:     systemPrompt,
      tools,
      messages,
    })

    // Verificar se Claude quer usar ferramentas
    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use')

    if (toolUseBlocks.length > 0) {
      // Adicionar resposta do assistente ao histórico
      messages.push({ role: 'assistant', content: response.content })

      // Executar todas as ferramentas solicitadas
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          let result
          try {
            result = await executeTool(block.name, block.input)
          } catch (e) {
            console.error('Erro na ferramenta:', e)
            result = 'Erro interno ao executar a ação.'
          }
          return { type: 'tool_result', tool_use_id: block.id, content: result }
        })
      )

      // Enviar resultados de volta para o Claude formular a resposta final
      messages.push({ role: 'user', content: toolResults })

      const finalResponse = await getClient().messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system:     systemPrompt,
        tools,
        messages,
      })

      const textBlock = finalResponse.content.find(b => b.type === 'text')
      return textBlock?.text || 'Ação executada com sucesso!'
    }

    const textBlock = response.content.find(b => b.type === 'text')
    return textBlock?.text || 'Pronto!'

  } catch (error) {
    console.error('Erro de IA:', error.message || error)
    return 'Desculpe, houve uma falha de comunicação com a IA. Tente novamente.'
  }
}

module.exports = { init, handleChat }
