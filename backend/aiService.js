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
      description: 'Liga ou desliga um ou mais dispositivos específicos da casa.',
      parameters: {
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
      description: 'Agenda uma ação para o futuro (seja num horário específico ou daqui a alguns segundos/minutos).',
      parameters: {
        type: 'object',
        properties: {
          delay_seconds: { type: 'number',  description: 'Use isso para agendamentos relativos, ex: "daqui 30 segundos" -> 30, "daqui 5 minutos" -> 300' },
          time:     { type: 'string',  description: 'Use apenas para horários exatos no formato HH:MM (24h), ex: "23:30"' },
          action:   { type: 'string',  description: 'Qual ação: control_device, control_all_devices ou control_room' },
          deviceIds:{ type: 'array', items: { type: 'string' }, description: 'Lista de IDs dos dispositivos (se action for control_device)' },
          room:     { type: 'string',  description: 'Cômodo (se action for control_room)' },
          state:    { type: 'boolean', description: 'true para ligar, false para desligar' },
          repeat:   { type: 'boolean', description: 'true para repetir todos os dias no horário especificado em "time"' }
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
      const ids = args.deviceIds || (args.deviceId ? [args.deviceId] : []);
      const results = await Promise.all(ids.map(id => applyDeviceState(id, args.state)));
      const changed = results.filter(Boolean);
      return changed.length > 0
        ? `Os seguintes dispositivos foram ${args.state ? 'ligados' : 'desligados'}: ${changed.map(d => d.name).join(', ')}.`
        : `Nenhum dispositivo encontrado.`;
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
      const jobName = `${args.action}-${Date.now()}`
      
      const executeFn = async () => {
        console.log(`[Agendamento] Executando: ${args.action}`)
        if (args.action === 'control_device') {
          const ids = args.deviceIds || (args.deviceId ? [args.deviceId] : []);
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
          const rule      = new schedule.RecurrenceRule()
          rule.hour       = hour
          rule.minute     = minute
          rule.tz         = 'America/Sao_Paulo'
          schedule.scheduleJob(jobName, rule, executeFn)
          return `Ação agendada para as ${args.time} todos os dias.`
        } else {
          const nowBrtStr = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
          const brtDate = new Date(nowBrtStr)
          brtDate.setHours(hour, minute, 0, 0)
          
          const nowBrt = new Date(nowBrtStr)
          let diff = brtDate.getTime() - nowBrt.getTime()
          
          if (diff <= 0) {
            if (-diff < 5 * 60 * 1000) {
              executeFn();
              return `Ação executada imediatamente (horário ${args.time} acabou de passar).`
            } else {
              diff += 24 * 60 * 60 * 1000
            }
          }
          
          const targetDate = new Date(Date.now() + diff)
          schedule.scheduleJob(jobName, targetDate, executeFn)
          return `Ação agendada para as ${args.time} apenas uma vez.`
        }
      }

      return `Erro: Informe 'time' ou 'delay_seconds'.`
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

  const now = new Date()
  const horaAtual = now.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })

  const systemPrompt = `Você é um assistente inteligente de controle residencial.
Responda sempre em português brasileiro de forma natural, curta e amigável.
A hora atual é: ${horaAtual} (Horário de Brasília).

DISPOSITIVOS DISPONÍVEIS:
${deviceList}

REGRAS CRÍTICAS DE USO DE FERRAMENTAS:
1. USE APENAS CHAMADAS DE FUNÇÃO (TOOL CALLS) NATIVAS DO MODELO. NUNCA ESCREVA O NOME DA FUNÇÃO DIRETAMENTE NO TEXTO COMO "control_device(...)".
2. Ligar/desligar dispositivos específicos (mesmo que sejam vários): Chame a ferramenta "control_device" passando a lista de IDs no argumento "deviceIds".
3. Ligar/desligar TODO um cômodo: Chame a ferramenta "control_room". Exemplo: Usuário pede "Ligue a sala" ou "Desligue tudo no quarto".
4. Ligar/desligar ABSOLUTAMENTE TUDO da casa: Chame a ferramenta "control_all_devices".
5. Agendamentos e delays: Use a ferramenta "schedule_action". Se for para daqui a pouco (ex: "30 segundos", "2 minutos"), use "delay_seconds". Se for um horário exato (ex: "às 20:00"), use "time" (formato HH:MM). Se for todo dia, coloque repeat=true.
6. Após a execução, apenas confirme em uma frase curta o que foi feito. Não liste o estado de todos os dispositivos. NUNCA mostre os dados em JSON ou texto que pareça código de função na resposta final para o usuário.`

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: userMessage  }
  ]

  try {
    // Primeira chamada ao Groq
    const response = await getGroq().chat.completions.create({
      model: 'llama-3.3-70b-versatile',
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
          let result;
          try {
            const args = JSON.parse(tc.function.arguments)
            result = await executeTool(tc.function.name, args)
          } catch (e) {
            console.error("Erro JSON IA:", e);
            result = "Erro interno: argumentos inválidos fornecidos pela IA.";
          }
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
        model:    'llama-3.3-70b-versatile',
        messages,
      })

      const finalContent = finalResponse.choices[0].message.content
      return finalContent || 'Ação executada com sucesso! ✓'
    }

    return msg.content || 'Pronto!'
  } catch (error) {
    console.error("Erro de IA:", error.message || error);
    return "Desculpe, houve uma falha de comunicação com a inteligência artificial ao processar sua ação. Tente novamente sendo mais claro.";
  }
}

module.exports = { init, handleChat }