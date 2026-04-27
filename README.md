# 🏠 Casa Inteligente — IoT + IA
 
Sistema de controle residencial com ESP32, MQTT, React e Inteligência Artificial.
 
> **Nível 01 — Protótipo:** controle de dispositivos via web com comunicação MQTT em tempo real.
 
---
 
## 📋 Sobre o projeto
 
Este projeto permite controlar dispositivos elétricos de uma residência (luzes, tomadas, ar-condicionado etc.) através de um dashboard web moderno. A comunicação entre o servidor e o microcontrolador ESP32 é feita via protocolo MQTT, garantindo baixa latência e alta confiabilidade.
 
### Stack utilizada
 
| Camada | Tecnologia |
|---|---|
| Microcontrolador | ESP32 + PlatformIO |
| Protocolo IoT | MQTT (HiveMQ público) |
| Backend | Node.js + Express |
| Frontend | React + Vite |
| Simulador | Wokwi for VS Code |
| Infraestrutura | Docker + Docker Compose |
 
---
 
## 📁 Estrutura do projeto
 
```
projeto-casa-inteligente/
├── backend/
│   ├── index.js
│   ├── package.json
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   └── App.jsx
│   ├── package.json
│   └── Dockerfile
├── esp32/
│   ├── src/
│   │   └── main.cpp
│   ├── diagram.json
│   ├── wokwi.toml
│   └── platformio.ini
├── docker-compose.yml
├── mosquitto.conf
└── README.md
```
 
---
 
## 🚀 Como rodar na sua máquina
 
### Pré-requisitos
 
- [Docker Desktop](https://www.docker.com/products/docker-desktop) instalado e rodando
- [VS Code](https://code.visualstudio.com/) instalado
- Extensões do VS Code necessárias (instalar na primeira vez):
  - **PlatformIO IDE** — para compilar o código do ESP32
  - **Wokwi Simulator** — para simular o ESP32 com o LED
### Passo 1 — Clone o repositório
 
```bash
git clone https://github.com/seu-usuario/projeto-casa-inteligente.git
cd projeto-casa-inteligente
```
 
### Passo 2 — Suba o Docker
 
```bash
docker-compose up --build
```
 
> Na primeira vez, o Docker vai baixar as imagens e instalar as dependências. Pode demorar alguns minutos.
 
Após subir, acesse o dashboard em **http://localhost:5173**
 
### Passo 3 — Abra a pasta do ESP32 no VS Code
 
> ⚠️ **Importante:** o PlatformIO só reconhece o projeto se você abrir **especificamente a pasta `esp32/`** no VS Code. Se abrir a pasta raiz do projeto, o PlatformIO não vai encontrar o `platformio.ini` e o comando Build não vai aparecer.
 
```
Arquivo → Abrir Pasta → seleciona a pasta esp32/
```
 
### Passo 4 — Aguarde o PlatformIO inicializar
 
Na primeira vez em uma máquina nova, o PlatformIO precisa baixar as ferramentas do ESP32. Aguarde alguns minutos até aparecer os ícones na barra inferior do VS Code:
 
```
✔ Build   → Upload   🔌 Serial Monitor
```
 
### Passo 5 — Compile o firmware do ESP32
 
```
Ctrl+Shift+P → PlatformIO: Build
```
 
Ou clique no ícone ✔ na barra inferior do VS Code. Aguarde aparecer `SUCCESS` no terminal.
 
> Se o comando `PlatformIO: Build` não aparecer no `Ctrl+Shift+P`, clique no ícone do PlatformIO (👾 alienígena) na barra lateral → Project Tasks → esp32dev → General → Build.
 
### Passo 6 — Inicie o simulador Wokwi
 
```
F1 → Wokwi: Start Simulator
```
 
Ou abra o arquivo `diagram.json` e clique em **Play**.
 
### Passo 7 — Teste o sistema
 
Com tudo rodando, acesse **http://localhost:5173** e clique no botão de ligar/desligar. O LED no simulador Wokwi deve acender e apagar.
 
---
 
## 🔁 Resumo da ordem de inicialização
 
```
1. docker-compose up --build       → sobe backend + frontend + MQTT
2. Abrir pasta esp32/ no VS Code   → reconhece o platformio.ini
3. PlatformIO: Build               → compila o firmware (aguarda SUCCESS)
4. Wokwi: Start Simulator          → simula o ESP32 com o LED
5. Acessar localhost:5173          → dashboard web funcionando
```
 
---
 
## 🔌 Fluxo de comunicação
 
```
React (frontend)
    ↓ POST /api/led/toggle
Node.js (backend)
    ↓ publish "casa/led" → ON/OFF
HiveMQ (broker MQTT público)
    ↓ subscribe "casa/led"
ESP32 (Wokwi)
    ↓ digitalWrite(LED_PIN, HIGH/LOW)
LED acende/apaga na simulação
```
 
---
 
## 🛑 Como parar os serviços
 
```bash
docker-compose down
```
 
### Comandos úteis
 
```bash
# Subir em segundo plano
docker-compose up -d --build
 
# Ver logs de um serviço
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f mosquitto
 
# Reiniciar um serviço
docker-compose restart backend
```
 
---
 
## 🗺️ Roadmap
 
- [x] Nível 01 — Controle de LED via web + MQTT
- [ ] Nível 02 — Múltiplos dispositivos + banco de dados + dashboard
- [ ] Nível 03 — Chat com IA + automações por linguagem natural
- [ ] Nível 04 — Integração WhatsApp + automações por horário
---
 
## 👥 Equipe
 
Projeto acadêmico desenvolvido por estudantes como parte da disciplina de UPx.