# Casa Inteligente — IoT + IA

Sistema de controle residencial com ESP32, MQTT, React e Inteligência Artificial (Claude).

---

## Sobre o projeto

Permite controlar dispositivos elétricos de uma residência (luzes, ventilador, ar-condicionado, cafeteira e porta) através de um dashboard web em tempo real. A comunicação entre o servidor e o ESP32 é feita via MQTT. O assistente **Cláudio** (powered by Claude) entende comandos em linguagem natural e executa ações nos dispositivos. Regras automáticas disparam com base em temperatura, umidade ou movimento.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Microcontrolador | ESP32 + PlatformIO + Arduino |
| Protocolo IoT | MQTT (HiveMQ público) |
| Backend | Node.js + Express + Prisma + Socket.IO |
| Banco de dados | SQLite |
| Frontend | React + TanStack Router + Tailwind CSS |
| IA | Anthropic Claude (claude-haiku-4-5) |
| Simulador | Wokwi for VS Code |
| Infraestrutura | Docker + Docker Compose |

---

## Funcionalidades

- Dashboard em tempo real com temperatura, umidade e detecção de movimento
- Controle de 6 dispositivos por cômodo (Sala, Quarto, Cozinha)
- Controle de porta (abrir/fechar via servo motor)
- Alarme com arme/desarme — LED vermelho só acende ao detectar invasão
- Assistente **Cláudio**: controla tudo por linguagem natural via chat
- Regras automáticas: `temp > 28°C` liga ventilador, `temp > 30°C` liga ar-condicionado
- Histórico de telemetria com gráfico (1h / 6h / 24h / 7d)
- Registro de eventos de movimento com timestamp
- LEDs RGB de status: verde = ok, azul = reconectando, vermelho = alarme disparado

---

## Estrutura do projeto

```
projeto-casa-inteligente-upx/
├── backend/
│   ├── index.js          # servidor, MQTT, motor de regras, WebSocket
│   ├── aiService.js      # integração Claude (chat + ferramentas)
│   ├── prisma/
│   │   └── schema.prisma
│   └── .env.example
├── frontend/
│   └── src/
│       ├── routes/
│       │   ├── index.tsx       # Dashboard
│       │   ├── historico.tsx   # Gráficos e eventos
│       │   └── automacoes.tsx  # Regras automáticas
│       └── components/smart/
│           ├── ChatPanel.tsx   # Chat com Cláudio
│           ├── DeviceCard.tsx
│           └── SensorCard.tsx
├── esp32/
│   ├── src/main.cpp      # firmware completo
│   ├── diagram.json      # circuito Wokwi
│   ├── wokwi.toml
│   └── platformio.ini
└── docker-compose.yml
```

---

## Como rodar

### Pré-requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop)
- [VS Code](https://code.visualstudio.com/) com as extensões:
  - **PlatformIO IDE**
  - **Wokwi Simulator** (requer licença gratuita em wokwi.com)

### 1 — Clone o repositório

```bash
git clone https://github.com/rafuulll/projeto-casa-inteligente-upx.git
cd projeto-casa-inteligente-upx
```

### 2 — Configure o ambiente

```bash
cd backend
cp .env.example .env
```

Abra `backend/.env` e preencha:

```env
DATABASE_URL="file:./dev.db"
MQTT_BROKER="mqtt://broker.hivemq.com:1883"
ANTHROPIC_API_KEY="sua_chave_aqui"
PORT=3001
```

> A chave da Anthropic é necessária para o Cláudio funcionar. Sem ela, o chat fica desativado mas o restante funciona normalmente.

### 3 — Suba o backend e frontend

```bash
cd ..
docker-compose up --build
```

Acesse o dashboard em **http://localhost:5173**

### 4 — Compile e simule o ESP32

Abra a pasta `esp32/` no VS Code:

```
Arquivo → Abrir Pasta → seleciona esp32/
```

Compile o firmware:
```
Ctrl+Shift+P → PlatformIO: Build
```

Inicie o simulador:
```
Ctrl+Shift+P → Wokwi: Start Simulator
```

### Ordem de inicialização

```
1. backend/.env configurado com ANTHROPIC_API_KEY
2. docker-compose up --build   → backend + frontend + banco
3. PlatformIO: Build           → gera firmware.bin
4. Wokwi: Start Simulator      → ESP32 conecta ao MQTT
5. http://localhost:5173        → dashboard funcionando
```

---

## Fluxo de comunicação

```
Usuário (dashboard ou chat Cláudio)
    ↓ HTTP / WebSocket
Node.js backend
    ↓ publish MQTT  ex: casa/quarto-ar → ON
HiveMQ (broker público)
    ↓ subscribe
ESP32 (Wokwi)
    ↓ aciona relé / servo / buzzer
    ↓ publica telemetria  ex: casa/temperatura → 28.4
Backend recebe → atualiza banco → emite via Socket.IO
    ↓
Dashboard atualiza em tempo real
```

---

## Como criar uma regra automática

Na página **Automações**, clique em **Nova regra** e preencha:

| Campo | Exemplo |
|---|---|
| Nome | Ligar ar quando calor |
| Descrição | Liga o ar condicionado |
| Trigger | `temp > 30` |

Triggers suportados: `temp > X`, `temp < X`, `umidade > X`, `umidade < X`, `movimento`

---

## Como parar

```bash
docker-compose down
```

---

## Equipe

Projeto acadêmico desenvolvido como parte da disciplina de UPx.
