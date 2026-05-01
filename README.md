# 🏠 Casa Inteligente — IoT + IA
 
Sistema de controle residencial com ESP32, MQTT, React e Inteligência Artificial.
 
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
git clone https://github.com/rafuulll/projeto-casa-inteligente.git
cd projeto-casa-inteligente
```
 
### Passo 2 — Configure as Variáveis de Ambiente

Para o Chat com Inteligência Artificial funcionar, o backend precisa da sua chave de API.
Copie o arquivo de exemplo na pasta `backend`:

```bash
cd backend
cp .env.example .env
```
> Abra o arquivo `backend/.env` que acabou de ser criado e preencha a variável `GROQ_API_KEY` com sua chave (obtida no console da plataforma escolhida). Volte para a raiz (`cd ..`) antes de continuar.
 
### Passo 3 — Suba o Docker
 
```bash
docker-compose up --build
```
 
> Na primeira vez, o Docker vai baixar as imagens e instalar as dependências. Pode demorar alguns minutos.
 
Após subir, acesse o dashboard em **http://localhost:5173**
 
### Passo 4 — Abra a pasta do ESP32 no VS Code
 
> ⚠️ **Importante:** o PlatformIO só reconhece o projeto se você abrir **especificamente a pasta `esp32/`** no VS Code. Se abrir a pasta raiz do projeto, o PlatformIO não vai encontrar o `platformio.ini` e o comando Build não vai aparecer.
 
```
Arquivo → Abrir Pasta → seleciona a pasta esp32/
```
 
### Passo 5 — Aguarde o PlatformIO inicializar
 
Na primeira vez em uma máquina nova, o PlatformIO precisa baixar as ferramentas do ESP32. Aguarde alguns minutos até aparecer os ícones na barra inferior do VS Code:
 
```
✔ Build   → Upload   🔌 Serial Monitor
```
 
### Passo 6 — Compile o firmware do ESP32
 
```
Ctrl+Shift+P → PlatformIO: Build
```
 
Ou clique no ícone ✔ na barra inferior do VS Code. Aguarde aparecer `SUCCESS` no terminal.
 
> Se o comando `PlatformIO: Build` não aparecer no `Ctrl+Shift+P`, clique no ícone do PlatformIO (👾 alienígena) na barra lateral → Project Tasks → esp32dev → General → Build.
 
### Passo 7 — Inicie o simulador Wokwi
 
```
F1 → Wokwi: Start Simulator
```
 
Ou abra o arquivo `diagram.json` e clique em **Play**.
 
### Passo 8 — Teste o sistema
 
Com tudo rodando, acesse **http://localhost:5173**, teste os botões e converse com a IA para controlar os dispositivos.
 
---
 
## 🔁 Resumo da ordem de inicialização
 
```
1. Configurar backend/.env         → Adicionar chave da API de IA
2. docker-compose up --build       → Sobe backend + frontend + banco + MQTT
3. Abrir pasta esp32/ no VS Code   → Reconhece o platformio.ini
4. PlatformIO: Build               → Compila o firmware (aguarda SUCCESS)
5. Wokwi: Start Simulator          → Simula o ESP32
6. Acessar localhost:5173          → Dashboard web com IA funcionando
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
- [x] Nível 02 — Múltiplos dispositivos + banco de dados + dashboard
- [x] Nível 03 — Chat com IA + automações por linguagem natural
- [ ] Nível 04 — Integração WhatsApp + automações por horário
---
 
## 👥 Equipe
 
Projeto acadêmico desenvolvido por estudantes como parte da disciplina de UPx.