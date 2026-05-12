# Smart Home Híbrido — IoT + IA Local + IA Cloud

Sistema de automação residencial completo com ESP32, sensores físicos, IA local de aprendizado de padrões, chat com IA em linguagem natural, dashboard web em tempo real e infraestrutura containerizada.

---

## Sumário

- [Sobre o projeto](#sobre-o-projeto)
- [Arquitetura](#arquitetura)
- [Hardware](#hardware)
- [Stack tecnológica](#stack-tecnológica)
- [Funcionalidades](#funcionalidades)
- [Tópicos MQTT](#tópicos-mqtt)
- [API REST](#api-rest)
- [Estrutura de arquivos](#estrutura-de-arquivos)
- [Como rodar](#como-rodar)
- [Ordem de inicialização](#ordem-de-inicialização)
- [Fluxo de comunicação](#fluxo-de-comunicação)
- [Comandos úteis](#comandos-úteis)
- [Roadmap](#roadmap)
- [Equipe](#equipe)

---

## Sobre o projeto

Sistema híbrido de automação residencial que opera em dois modos simultâneos:

- **Modo offline (local):** o ESP32 lê sensores, exibe dados no OLED, executa automações e aprende padrões de uso sem depender de internet.
- **Modo online (conectado):** publica telemetria via MQTT, recebe comandos remotos do dashboard web e responde a perguntas em linguagem natural via IA Cloud (Groq).

O diferencial está na **dupla camada de inteligência**: uma IA local embarcada no ESP32 que aprende hábitos do usuário, e uma IA Cloud que interpreta comandos em português e os converte em ações MQTT.

---

## Arquitetura

```
┌─────────────────────────────────────────┐
│         CAMADA 1 — HARDWARE             │
│  ESP32 + DHT22 + PIR + HC-SR04 + OLED   │
│  Relé 2ch · Servo · Buzzer · LED status │
│              ↓ IA Local                 │
│  Aprende padrões offline, age sozinho   │
└─────────────────────────────────────────┘
                    ↓ WiFi
┌─────────────────────────────────────────┐
│       CAMADA 2 — BROKER MQTT            │
│   HiveMQ público (broker.hivemq.com)    │
│   Publica telemetria · Recebe comandos  │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│        CAMADA 3 — BACKEND               │
│  Node.js + Express + Socket.io          │
│  Prisma ORM + PostgreSQL                │
│  Groq API (llama-3.3-70b) — IA Cloud   │
└─────────────────────────────────────────┘
                    ↓ WebSocket
┌─────────────────────────────────────────┐
│        CAMADA 4 — FRONTEND              │
│  React + Vite — dark mode               │
│  Dashboard · Histórico · Automações     │
│  Chat IA flutuante                      │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│      CAMADA 5 — INFRAESTRUTURA          │
│  Docker Compose                         │
│  backend · frontend · postgres          │
│  mosquitto (broker local opcional)      │
└─────────────────────────────────────────┘
```

---

## Hardware

| Componente | Especificação | GPIO | Função |
|---|---|---|---|
| ESP32 DevKit V1 | Dual-core 240MHz, WiFi | — | Processador central |
| DHT22 | Temp: -40~80°C / Umid: 0-100% | GPIO 15 | Sensor de clima |
| PIR HC-SR501 | Alcance 7m, ângulo 120° | GPIO 4 | Detecção de movimento |
| HC-SR04 | Distância 2cm–4m | GPIO 18 (TRIG) / 19 (ECHO) | Abertura automática de porta |
| OLED SSD1306 | 128×64px, I2C | GPIO 21 (SDA) / 22 (SCL) | Display local |
| Relé módulo | Canal 1 — optoisolado | GPIO 16 | Luz da sala |
| Relé (ch2) | Canal 2 | GPIO 26 | Ventilador |
| Servo SG90 | 0°–180° | GPIO 5 | Porta automática |
| Buzzer | 5V ativo | GPIO 17 | Alarme sonoro |
| LED status | — | GPIO 2 | Indicador de movimento |

> Na simulação Wokwi, os relés são representados por: módulo relay real (luz) e LED azul (ventilador).

---

## Stack tecnológica

### ESP32
| Biblioteca | Versão | Uso |
|---|---|---|
| PubSubClient | ^2.8 | Cliente MQTT |
| DHT sensor library | ^1.4.6 | Leitura DHT22 |
| Adafruit SSD1306 | ^2.5.9 | Display OLED |
| Adafruit GFX Library | ^1.11.9 | Renderização OLED |
| ESP32Servo | ^0.13.0 | Controle do servo |
| ArduinoJson | ^6.21.5 | Serialização JSON |

### Backend
| Tecnologia | Versão | Uso |
|---|---|---|
| Node.js | 20 LTS | Runtime |
| Express | ^5.2.1 | API REST |
| Socket.io | ^4.7.5 | WebSocket real-time |
| mqtt | ^5.15.1 | Cliente MQTT |
| Prisma | ^5.13.0 | ORM PostgreSQL |
| groq-sdk | ^1.1.2 | IA Cloud (Groq) |
| node-schedule | ^2.1.1 | Agendamentos |

### Frontend
| Tecnologia | Versão | Uso |
|---|---|---|
| React | ^19.2.5 | UI |
| Vite | ^8.0.10 | Build tool |
| Socket.io-client | ^4.7.5 | WebSocket |

### Infraestrutura
| Componente | Tecnologia |
|---|---|
| Containerização | Docker + Docker Compose |
| Banco de dados | PostgreSQL 15 |
| MQTT Cloud | HiveMQ (gratuito) |
| MQTT Local | Eclipse Mosquitto (opcional) |

---

## Funcionalidades

### Dashboard (aba principal)
- Cards em tempo real: temperatura, umidade, movimento e status da IA local
- Controles de dispositivos com toggle (luz, ventilador, porta, alarme)
- Gráfico sparkline de temperatura das últimas leituras
- Indicador de conexão WebSocket

### Histórico (aba)
- Gráfico de temperatura histórica (últimas 100 leituras salvas no banco)
- Gráfico de umidade histórica
- Log de ações com timestamp, dispositivo, origem (manual / IA) e estado

### Automações (aba)
- Status da IA Local: ativa ou aprendendo (com progresso de ciclos)
- Regras automáticas sempre ativas:
  - Temperatura > 28°C → liga ventilador
  - Temperatura < 26°C → desliga ventilador
  - Movimento detectado → liga luz da sala
  - Alarme ativado + movimento → dispara alarme sonoro
  - Objeto a < 10cm no HC-SR04 → abre porta por 3 segundos
  - IA Local ativa → age proativamente ao detectar movimento
- Botão de reset da IA local

### Chat IA (flutuante em todas as abas)
Comandos aceitos em português natural:
- `"Acende a luz da sala"` → liga sala-luz via MQTT
- `"Desliga tudo"` → desliga todos os dispositivos
- `"Ligue tudo na sala"` → controla o cômodo inteiro
- `"Desligue a luz em 30 segundos"` → agendamento por delay
- `"Apaga tudo às 23:30"` → agendamento por horário
- `"Apaga tudo às 23:00 todo dia"` → agendamento recorrente
- `"Qual a temperatura?"` → consulta sensor em tempo real
- `"Status da casa"` → lista todos os dispositivos

### IA Local (ESP32 — offline)
Algoritmo de aprendizado por frequência de eventos:
1. Observa quantas vezes o usuário liga a luz a cada ciclo de 20 segundos
2. Após 5 ciclos, calcula a frequência de uso
3. Se frequência ≥ 80%: ativa automação proativa (liga luz ao detectar movimento)
4. Publica `casa/ia/status = "ativa"` no MQTT e exibe no OLED

---

## Tópicos MQTT

### Publicações do ESP32 → Broker
| Tópico | Payload | Frequência |
|---|---|---|
| `casa/temperatura` | `"23.5"` | A cada 2s |
| `casa/umidade` | `"65.0"` | A cada 2s |
| `casa/movimento` | `"true"` / `"false"` | On change |
| `casa/luz/status` | `"ligada"` / `"desligada"` | On change |
| `casa/ventilador/status` | `"ligado"` / `"desligado"` | On change |
| `casa/porta/status` | `"aberta"` / `"fechada"` | On change |
| `casa/alarme/status` | `"ativado"` / `"desativado"` | On change |
| `casa/ia/status` | `"ativa"` / `"inativa"` | On change |
| `casa/alarme` | `"intruso_detectado"` / `"temperatura_critica"` | On event |

### Subscrições do ESP32 ← Backend
| Tópico | Payload | Ação |
|---|---|---|
| `casa/luz/comando` | `"ON"` / `"OFF"` | Liga/desliga relé (GPIO 16) |
| `casa/ventilador/comando` | `"ON"` / `"OFF"` | Liga/desliga relé (GPIO 26) |
| `casa/porta/comando` | `"ABRIR"` / `"FECHAR"` | Controla servo (fecha em 3s) |
| `casa/alarme/comando` | `"ATIVAR"` / `"DESATIVAR"` | Ativa modo segurança |
| `casa/reset` | `"RESET_IA"` | Reinicia aprendizado da IA local |

---

## API REST

### Dispositivos
| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/devices` | Lista todos os dispositivos e estados |
| `POST` | `/api/devices/:id/toggle` | Alterna estado de um dispositivo |
| `GET` | `/api/status` | Estado de dispositivos + telemetria atual |

### Sensores / Telemetria
| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/sensores` | Leitura atual (temp, umidade, movimento, IA) |
| `GET` | `/api/sensores/historico` | Últimas 100 leituras salvas no banco |
| `GET` | `/api/movimento/eventos` | Últimos 30 eventos de movimento |

### Logs
| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/logs` | Últimas 50 ações registradas |

### IA
| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/api/ai/chat` | Envia mensagem para IA Cloud (Groq) |
| `POST` | `/api/ia/reset` | Envia comando de reset da IA local ao ESP32 |

### WebSocket (Socket.io)
| Evento | Direção | Payload |
|---|---|---|
| `telemetry` | servidor → cliente | `{ temperature, humidity, movement, iaStatus }` |
| `device_update` | servidor → cliente | objeto Device atualizado |
| `new_log` | servidor → cliente | objeto Log com device incluído |
| `ia_update` | servidor → cliente | `{ status: "ativa" \| "inativa" }` |
| `alarme` | servidor → cliente | `{ event, timestamp }` |

---

## Estrutura de arquivos

```
projeto-casa-inteligente-upx/
├── esp32/
│   ├── src/
│   │   └── main.cpp          # Firmware completo (sensores + IA local + MQTT)
│   ├── diagram.json           # Circuito Wokwi (ESP32 + todos os componentes)
│   ├── platformio.ini         # Dependências e configuração do PlatformIO
│   └── wokwi.toml             # Aponta firmware compilado para o simulador
│
├── backend/
│   ├── index.js               # Servidor Express + MQTT + Socket.io + rotas
│   ├── aiService.js           # Integração Groq, tools, agendamentos
│   ├── prisma/
│   │   └── schema.prisma      # Modelos: Device, Log, Telemetry
│   ├── .env.example           # Variáveis de ambiente necessárias
│   ├── package.json
│   └── Dockerfile
│
├── frontend/
│   ├── src/
│   │   └── App.jsx            # Dashboard (tabs + sensores + gráfico + chat IA)
│   ├── package.json
│   ├── vite.config.js
│   └── Dockerfile
│
├── docker-compose.yml         # Orquestra backend + frontend + postgres + mosquitto
├── mosquitto.conf             # Configuração do broker MQTT local
└── README.md
```

---

## Como rodar

### Pré-requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop) instalado e rodando
- [VS Code](https://code.visualstudio.com/) com as extensões:
  - **PlatformIO IDE** — compila o firmware do ESP32
  - **Wokwi Simulator** — simula o circuito no VS Code
- Conta Groq com chave de API: [console.groq.com](https://console.groq.com)

---

### Passo 1 — Clone o repositório

```bash
git clone https://github.com/rafuulll/projeto-casa-inteligente.git
cd projeto-casa-inteligente-upx
```

---

### Passo 2 — Configure as variáveis de ambiente

```bash
cd backend
cp .env.example .env
```

Abra `backend/.env` e preencha:

```env
GROQ_API_KEY=sua_chave_aqui
DATABASE_URL=postgresql://user:password@db:5432/casa_inteligente?schema=public
MQTT_BROKER=mqtt://broker.hivemq.com:1883
PORT=3001
```

> A `DATABASE_URL` já está configurada para o container Docker. Só altere se rodar o banco localmente.

---

### Passo 3 — Suba os containers

Se for a **primeira vez** ou se os dispositivos do banco mudaram:

```bash
docker-compose down -v          # remove volume antigo
docker-compose up --build       # reconstrói e sobe tudo
```

Para atualizações normais (sem mudar o banco):

```bash
docker-compose up --build
```

Após subir, acesse o dashboard em **http://localhost:5173**

---

### Passo 4 — Abra a pasta do ESP32 no VS Code

> **Importante:** o PlatformIO só reconhece o projeto se você abrir **especificamente a pasta `esp32/`**.

```
Arquivo → Abrir Pasta → selecione a pasta esp32/
```

---

### Passo 5 — Compile o firmware

```
Ctrl+Shift+P → PlatformIO: Build
```

Aguarde aparecer `SUCCESS` no terminal. Na primeira vez o PlatformIO vai baixar as ferramentas e bibliotecas (pode demorar alguns minutos).

> Se o comando não aparecer: clique no ícone do PlatformIO (alienígena) na barra lateral → Project Tasks → esp32dev → Build.

---

### Passo 6 — Inicie o simulador Wokwi

```
F1 → Wokwi: Start Simulator
```

Ou abra `diagram.json` e clique em **Play**. O Serial Monitor mostrará os logs do ESP32 em tempo real.

---

### Passo 7 — Teste o sistema

Com tudo rodando:

1. Acesse **http://localhost:5173**
2. Teste os toggles no Dashboard — os LEDs acendem no Wokwi
3. Clique no botão 🤖 e escreva `"acende a luz"` — a IA executa o comando via MQTT
4. Observe os cards de temperatura e umidade atualizando em tempo real
5. Acione o sensor PIR no Wokwi — o movimento aparece no dashboard instantaneamente

---

## Ordem de inicialização

```
1. backend/.env configurado     → GROQ_API_KEY preenchida
2. docker-compose up --build    → backend + frontend + postgres + mosquitto
3. Abrir pasta esp32/ no VSCode → PlatformIO reconhece o projeto
4. PlatformIO: Build            → compilar firmware (aguarda SUCCESS)
5. Wokwi: Start Simulator       → ESP32 conecta no WiFi e no MQTT
6. http://localhost:5173        → dashboard com tudo em tempo real
```

---

## Fluxo de comunicação

```
Usuário digita "acende a luz" no chat
        ↓
React (frontend) — POST /api/ai/chat
        ↓
Node.js + Groq (IA interpreta → control_device)
        ↓
mqttClient.publish("casa/luz/comando", "ON")
        ↓
HiveMQ (broker MQTT público)
        ↓
ESP32 (Wokwi) recebe no callback MQTT
        ↓
digitalWrite(RELAY_LUZ, HIGH)  → relé fecha → LED acende
        ↓
client.publish("casa/luz/status", "ligada")  → backend confirma
        ↓
io.emit("device_update", ...)  → frontend atualiza card em tempo real
```

---

## Comandos úteis

```bash
# Parar todos os serviços
docker-compose down

# Subir em segundo plano
docker-compose up -d --build

# Ver logs em tempo real por serviço
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f mosquitto

# Reiniciar só o backend (após editar código)
docker-compose restart backend

# Limpar banco de dados e recriar do zero
docker-compose down -v
docker-compose up --build

# Acessar o banco PostgreSQL diretamente
docker exec -it db psql -U user -d casa_inteligente
```

---

## Banco de dados

### Modelos (Prisma)

**Device** — estado atual de cada dispositivo
| Campo | Tipo | Descrição |
|---|---|---|
| id | String | `"sala-luz"`, `"ventilador"`, `"porta"`, `"alarme"` |
| name | String | Nome amigável |
| room | String | Cômodo (`"Sala"`, `"Entrada"`, `"Casa"`) |
| type | String | `"light"`, `"fan"`, `"door"`, `"security"` |
| state | Boolean | Estado atual (true = ligado) |

**Log** — histórico de todas as ações
| Campo | Tipo | Descrição |
|---|---|---|
| deviceId | String | Referência ao Device |
| action | String | `"ON"` ou `"OFF"` |
| source | String | `"manual"` ou `"ia_chat"` |
| createdAt | DateTime | Timestamp |

**Telemetry** — histórico dos sensores
| Campo | Tipo | Descrição |
|---|---|---|
| temperature | Float | Temperatura em °C |
| humidity | Float | Umidade em % |
| movement | Boolean | Movimento detectado |
| createdAt | DateTime | Timestamp (salvo a cada 30s) |

---

## Roadmap

- [x] Nível 01 — Controle de LED via web + MQTT
- [x] Nível 02 — Múltiplos dispositivos + banco de dados + dashboard
- [x] Nível 03 — Chat com IA + automações por linguagem natural
- [x] Nível 04 — Sensores físicos (DHT22, PIR, HC-SR04) + IA local + display OLED
- [ ] Nível 05 — Integração WhatsApp (Twilio) + notificações de alarme
- [ ] Nível 06 — App mobile (React Native) + geofencing

---

## Equipe

Projeto acadêmico desenvolvido por estudantes como parte da disciplina de UPx — Facens.
