# Smart House UPX — Contexto Completo do Projeto

> **Para uso em outras LLMs:** Este documento contém todo o contexto necessário para continuar o desenvolvimento deste projeto. Leia-o integralmente antes de fazer qualquer pergunta ou solicitar qualquer implementação.

---

## 1. Visão Geral

Projeto acadêmico (UPX) de casa inteligente com ESP32, backend Node.js, frontend React e integração com IA (Claude). O objetivo central é **demonstrar economia de energia** através de automação e controle inteligente de dispositivos residenciais.

**Status atual:** Projeto funcional e rodando. Frontend na porta `5174`, backend na porta `3001`.

---

## 2. Arquitetura

```
┌─────────────────────────────────┐
│   React Frontend (porta 5174)   │
│   Dashboard + Automações +      │
│   Histórico + Chat IA           │
└────────────┬────────────────────┘
             │ HTTP REST + SSE + Socket.io
┌────────────▼────────────────────┐
│  Node.js Backend (porta 3001)   │
│  Express + Prisma (SQLite) +    │
│  MQTT + Socket.io + Claude AI   │
└────────────┬────────────────────┘
             │ MQTT
┌────────────▼────────────────────┐
│  HiveMQ Broker (público)        │
│  broker.hivemq.com:1883         │
└────────────┬────────────────────┘
             │ MQTT
┌────────────▼────────────────────┐
│  ESP32 (simulado no Wokwi)      │
│  DHT22 + PIR + 6 Relés +        │
│  Servo + Buzzer + OLED + RGB    │
└─────────────────────────────────┘
```

---

## 3. Estrutura de Pastas

```
projeto-casa-inteligente-upx/
├── backend/
│   ├── index.js          ← servidor principal (MQTT, rotas, motor de regras)
│   ├── aiService.js      ← integração com Claude (Anthropic SDK)
│   ├── prisma/
│   │   └── schema.prisma ← modelos: Device, Log, Rule, Telemetry
│   └── .env              ← variáveis de ambiente (ANTHROPIC_API_KEY, etc.)
├── frontend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── index.tsx       ← Dashboard (sensores + dispositivos)
│   │   │   ├── automacoes.tsx  ← Editor de regras
│   │   │   └── historico.tsx   ← Gráficos de telemetria
│   │   ├── components/smart/
│   │   │   ├── DeviceCard.tsx
│   │   │   ├── SensorCard.tsx
│   │   │   └── ChatPanel.tsx   ← Chat com "Cláudio" (Claude)
│   │   └── lib/api.ts          ← API_BASE, axios, socket.io, interfaces
│   └── package.json
└── esp32/
    └── src/main.cpp      ← firmware Arduino/PlatformIO
```

---

## 4. Dispositivos Controlados

| ID | Nome | Cômodo | Tipo | Pino ESP32 |
|---|---|---|---|---|
| `sala-luz` | Luz da Sala | Sala | light | 2 |
| `sala-ventilador` | Ventilador | Sala | fan | 4 |
| `quarto-luz` | Luz do Quarto | Quarto | light | 5 |
| `quarto-ar` | Ar-condicionado | Quarto | ac | 18 |
| `cozinha-luz` | Luz da Cozinha | Cozinha | light | 19 |
| `cozinha-cafeteira` | Cafeteira | Cozinha | plug | 21 |

---

## 5. Sensores e Atuadores (ESP32)

| Componente | Pino | Função |
|---|---|---|
| DHT22 | 15 | Temperatura (°C) e Umidade (%) — leitura a cada 500ms |
| PIR | 27 | Detecção de movimento — debounce de 5s |
| Servo SG90 | 25 | Porta: 0° = fechada, 90° = aberta |
| Buzzer | 17 | Alertas sonoros |
| LED RGB | R:26, G:13, B:14 | Status da conexão |
| OLED SSD1306 | SDA:23, SCL:22 | Display de status |
| HC-SR04 | TRIG:32, ECHO:33 | Sensor ultrassônico (não utilizado ativamente) |

**Significado do LED RGB:**
- Verde = conectado e funcionando
- Azul = reconectando ao MQTT
- Vermelho = inicializando / alarme
- Amarelo = movimento detectado
- Ciano = (legado — não usar)

---

## 6. Tópicos MQTT

### ESP32 publica:
| Tópico | Payload | Descrição |
|---|---|---|
| `smarthause-upx/temperatura` | `"24.5"` | Temperatura em °C |
| `smarthause-upx/umidade` | `"60.0"` | Umidade em % |
| `smarthause-upx/movimento` | `"true"/"false"` | Detecção PIR |
| `smarthause-upx/{device-id}/status` | `"ON"/"OFF"` | Confirmação de estado |
| `smarthause-upx/porta/status` | `"aberta"/"fechada"` | Estado da porta |
| `smarthause-upx/alarme` | `"intruso_detectado"/"calor_extremo"` | Eventos de alarme |

### Backend publica:
| Tópico | Payload | Descrição |
|---|---|---|
| `smarthause-upx/{device-id}` | `"ON"/"OFF"` | Comando para relé |
| `smarthause-upx/porta/comando` | `"ABRIR"/"FECHAR"` | Controle da porta |
| `smarthause-upx/alarme/comando` | `"ATIVAR"/"DESATIVAR"` | Controle do alarme |

---

## 7. Banco de Dados (Prisma + SQLite)

```prisma
model Device {
  id        String   // "sala-luz", "quarto-ar", etc.
  name      String   // "Luz da Sala"
  room      String   // "Sala", "Quarto", "Cozinha"
  type      String   // "light", "fan", "ac", "plug"
  state     Boolean  // true = ligado
  updatedAt DateTime
  logs      Log[]
}

model Log {
  id        Int
  deviceId  String
  action    String   // "ON" ou "OFF"
  createdAt DateTime // timestamp exato de cada acionamento
}

model Rule {
  id        String
  nome      String
  descricao String
  trigger   String   // ex: "temp > 28", "umidade >= 80", "movimento"
  ativa     Boolean
}

model Telemetry {
  id          Int
  temperature Float?
  humidity    Float?
  movement    Boolean
  createdAt   DateTime // salvo a cada 30 segundos
}
```

---

## 8. API do Backend (porta 3001)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/devices` | Lista todos os dispositivos |
| POST | `/api/devices/:id/toggle` | Liga/desliga dispositivo |
| GET | `/api/telemetria/atual` | Telemetria atual (em memória) |
| GET | `/api/telemetria/historico?periodo=24h` | Histórico (1h/6h/24h/7d) |
| GET | `/api/movimento` | Eventos de movimento |
| POST | `/api/porta/abrir` | Abre a porta |
| POST | `/api/porta/fechar` | Fecha a porta |
| POST | `/api/alarme/armar` | Arma o alarme |
| POST | `/api/alarme/desarmar` | Desarma o alarme |
| GET | `/api/ai/regras` | Lista regras de automação |
| POST | `/api/ai/regras` | Cria nova regra |
| PUT | `/api/ai/regras/:id` | Atualiza regra |
| POST | `/api/ai/regras/:id/toggle` | Ativa/desativa regra |
| DELETE | `/api/ai/regras/:id` | Remove regra |
| POST | `/api/ai/chat` | Chat com Claude ("Cláudio") |
| GET | `/api/events` | SSE — stream de telemetria em tempo real |

---

## 9. Motor de Regras

O backend avalia condições em tempo real a cada mensagem MQTT recebida. Sintaxe dos triggers:

```
"temp > 28"        → quando temperatura ultrapassar 28°C
"temp < 26"        → quando temperatura cair abaixo de 26°C
"umidade >= 80"    → quando umidade atingir 80%
"movimento"        → quando PIR detectar movimento
```

Cooldown de 60 segundos por regra para evitar acionamentos repetidos.

**Regras padrão criadas no seed:**
1. Ventilador automático — `temp > 28°C` → liga sala-ventilador
2. Desliga ventilador — `temp < 26°C` → desliga sala-ventilador
3. Alerta calor extremo — `temp > 35°C`
4. Detector de intrusos — `PIR + modo seguro`
5. Fecha porta automática — `porta aberta 3s`

---

## 10. IA (Claude — "Cláudio")

Integração via Anthropic SDK usando `claude-haiku-4-5-20251001`. O assistente pode executar ferramentas (tool use):

- `control_device` — liga/desliga dispositivo específico
- `control_all_devices` — liga/desliga todos
- `control_room` — liga/desliga todos de um cômodo
- `schedule_action` — agenda ação futura (delay em segundos ou horário HH:MM)
- `control_alarm` — arma/desarma alarme
- `control_door` — abre/fecha porta
- `get_status` — retorna estado atual de tudo

Requer `ANTHROPIC_API_KEY` no `.env` do backend. Sem a chave, o chat retorna erro mas o resto do sistema funciona normalmente.

---

## 11. Comunicação em Tempo Real (Frontend)

O frontend usa **dois canais simultâneos**:

1. **SSE (Server-Sent Events)** — `/api/events` — recebe telemetria (temperatura, umidade, movimento) a cada 1 segundo
2. **Socket.io** — recebe eventos de dispositivos (`device_update`) e logs (`new_log`)

> ⚠️ **Bug conhecido:** O SSE usa `window.__sseEs` para evitar duplicatas, mas isso impede reconexão automática se o backend reiniciar. Se os dados pararem de atualizar, recarregue a página.

---

## 12. Problemas de Energia Identificados (foco da apresentação)

### Problemas atuais dos dispositivos:

| Dispositivo | Problema atual |
|---|---|
| Luz da sala | Acende com qualquer movimento, mesmo de madrugada |
| Ventilador | Liga/desliga só por temperatura, ignora horário e presença |
| Ar-condicionado | Sem controle inteligente nenhum |
| Cafeteira | Fica ligada sem necessidade |
| Luzes em geral | Não detectam se há alguém no cômodo |

### Desperdícios no código:

| Problema | Arquivo | Impacto |
|---|---|---|
| MQTT publicado a cada 1s mesmo sem mudança de valor | `esp32/src/main.cpp:87` | Transmissões WiFi desnecessárias (~160mA por transmissão) |
| ESP32 nunca dorme — `delay(100)` sem sleep mode | `esp32/src/main.cpp:178` | ~240mA constante vs ~0.8mA com Light Sleep |
| SSE enviado a cada 1s mesmo com dados parados | `backend/index.js:456` | Banda e CPU do servidor desperdiçados |
| SSE + Socket.io simultâneos | `frontend/src/routes/index.tsx:40,50` | Duas conexões persistentes onde uma bastaria |

---

## 13. Objetivo do Trabalho de ML / Análise de Economia

> **Importante:** O ML aqui é usado para **simular resultados para apresentação**, não para implementação real de modelos.

### O que será feito:

1. **Pesquisar dados reais** de consumo médio de uma casa brasileira (fontes: ANEEL, PROCEL, IBGE)
2. **Calcular o cenário sem o sistema** — quanto os 6 dispositivos gastariam com uso descuidado (luzes esquecidas, ventilador sem ninguém, etc.)
3. **Calcular o cenário com o sistema** — mesmo cálculo mas com as automações atuando
4. **Apresentar a diferença** em kWh/mês → em reais → em % de economia

### Consumo estimado dos dispositivos:

| Dispositivo | Consumo médio | Uso descuidado/dia | Uso inteligente/dia |
|---|---|---|---|
| Luz da sala | 15W | 8h | 5h |
| Luz do quarto | 10W | 6h | 4h |
| Luz da cozinha | 12W | 5h | 3h |
| Ventilador | 60W | 6h | 4h |
| Ar-condicionado | 1200W | 4h | 3h |
| Cafeteira | 900W | 0.5h | 0.3h |

**Economia estimada: ~48 kWh/mês ≈ R$ 45/mês (tarifa ~R$0,95/kWh)**

---

## 14. Bugs Corrigidos Durante o Desenvolvimento

### MQTT Client ID fixo — conflito de conexão (CORRIGIDO)
**Problema:** O ESP32 tentava conectar ao HiveMQ com o ID fixo `"esp32-smarthome"`. Quando mais de uma instância do Wokwi estava ativa (ou após reconexão), o HiveMQ derrubava a conexão anterior, causando loop verde/azul no LED.

**Correção aplicada em** `esp32/src/main.cpp`:
```cpp
// Antes:
if (client.connect("esp32-smarthome")) {

// Depois:
String clientId = "esp32-smarthome-" + String(random(0xffff), HEX);
if (client.connect(clientId.c_str())) {
```

---

## 15. O que NÃO existe no projeto

- **IA Local no ESP32** — foi removida do escopo. O código ainda existe fisicamente no firmware (`processarIALocal`, `iaAtiva`, etc.) mas não é considerado funcionalidade ativa.
- **Sensor de corrente elétrica** — não há medição real de kWh. O consumo é estimado por tempo ligado × potência fixa.
- **PIR por cômodo** — existe apenas um PIR global. Não é possível detectar qual cômodo está ocupado sem adição de hardware.

---

## 16. Como Rodar o Projeto

### Backend:
```bash
cd projeto-casa-inteligente-upx/backend
npm install
npx prisma generate
npx prisma db push
node index.js
```

### Frontend:
```bash
cd projeto-casa-inteligente-upx/frontend
npm install
npm run dev
```

### ESP32:
- Abrir o projeto no [Wokwi](https://wokwi.com) ou compilar com PlatformIO
- O ESP32 conecta automaticamente ao WiFi `"Wokwi-GUEST"` e ao broker `broker.hivemq.com`

---

## 17. Variáveis de Ambiente (backend/.env)

```env
ANTHROPIC_API_KEY=sua_chave_aqui   # necessário para o chat com Claude
MQTT_BROKER=mqtt://broker.hivemq.com:1883  # padrão (pode alterar)
PORT=3001                           # porta do servidor
```

---

*Documento gerado em 27/05/2026. Atualizar conforme o projeto evoluir.*
