#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ESP32Servo.h>

// ── WiFi / MQTT ───────────────────────────────────────────────────────────────
const char* ssid        = "Wokwi-GUEST";
const char* password    = "";
const char* mqtt_server = "broker.hivemq.com";
const int   mqtt_port   = 1883;

// ── Pinos ─────────────────────────────────────────────────────────────────────
#define DHT_PIN    15
#define PIR_PIN    4
#define TRIG_PIN   18
#define ECHO_PIN   19
#define RELAY_LUZ  16
#define RELAY_VENT 26
#define SERVO_PIN  5
#define BUZZER_PIN 17
#define LED_PIN    2

// ── OLED ──────────────────────────────────────────────────────────────────────
#define SCREEN_WIDTH  128
#define SCREEN_HEIGHT 64

DHT dht(DHT_PIN, DHT22);
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
Servo servoPorta;

WiFiClient   espClient;
PubSubClient client(espClient);

// ── Estado dos dispositivos ───────────────────────────────────────────────────
bool luzLigada     = false;
bool ventLigado    = false;
bool portaAberta   = false;
bool modoSeguranca = false;

// ── Leituras dos sensores ─────────────────────────────────────────────────────
float temperatura    = 23.0;
float umidade        = 60.0;
bool  movimentoAtivo = false;

// ── Modo offline ──────────────────────────────────────────────────────────────
bool modoOffline = false;
unsigned long tUltimaReconexao = 0;
const unsigned long INTERVALO_RECONEXAO = 30000; // tenta reconectar a cada 30s

// ── Porta: fecha automaticamente após 3s sem bloquear o loop ─────────────────
bool          portaTimer    = false;
unsigned long tPortaAberta  = 0;
const unsigned long PORTA_TIMEOUT = 3000;

// ── IA Local ──────────────────────────────────────────────────────────────────
int  contadorLuz      = 0;
int  ciclosObservados = 0;
bool iaAtiva          = false;
unsigned long tUltimaAnaliseIA = 0;
const unsigned long INTERVALO_IA = 20000;   // 20s = 1 "dia" simulado

// ── Timers ────────────────────────────────────────────────────────────────────
unsigned long tUltimaPublicacao = 0;
const unsigned long INTERVALO_SENSOR = 2000;

// ── Funções de controle ───────────────────────────────────────────────────────

void bip() {
  digitalWrite(BUZZER_PIN, HIGH); delay(100); digitalWrite(BUZZER_PIN, LOW);
}

void melodia() {
  for (int i = 0; i < 3; i++) { bip(); delay(80); }
}

// Publica no MQTT somente se conectado
void mqttPublish(const char* topic, const char* payload) {
  if (!modoOffline && client.connected()) client.publish(topic, payload);
}

void ligarLuz(bool estado) {
  if (luzLigada == estado) return;
  luzLigada = estado;
  digitalWrite(RELAY_LUZ, estado ? HIGH : LOW);
  mqttPublish("casa/luz/status", estado ? "ligada" : "desligada");
  if (estado) contadorLuz++;
  Serial.printf("[LUZ] %s\n", estado ? "LIGADA" : "DESLIGADA");
}

void ligarVentilador(bool estado) {
  if (ventLigado == estado) return;
  ventLigado = estado;
  digitalWrite(RELAY_VENT, estado ? HIGH : LOW);
  mqttPublish("casa/ventilador/status", estado ? "ligado" : "desligado");
  Serial.printf("[VENT] %s\n", estado ? "LIGADO" : "DESLIGADO");
}

void abrirPorta() {
  if (portaAberta) return;
  portaAberta = true;
  servoPorta.write(90);
  bip();
  portaTimer   = true;
  tPortaAberta = millis();
  mqttPublish("casa/porta/status", "aberta");
  Serial.println("[PORTA] ABERTA");
}

void fecharPorta() {
  portaAberta = false;
  portaTimer  = false;
  servoPorta.write(0);
  bip();
  mqttPublish("casa/porta/status", "fechada");
  Serial.println("[PORTA] FECHADA");
}

void ativarAlarme() {
  Serial.println("[ALARME] INTRUSO DETECTADO!");
  for (int i = 0; i < 5; i++) {
    digitalWrite(BUZZER_PIN, HIGH); digitalWrite(LED_PIN, HIGH); delay(200);
    digitalWrite(BUZZER_PIN, LOW);  digitalWrite(LED_PIN, LOW);  delay(200);
  }
  mqttPublish("casa/alarme", "intruso_detectado");
}

// ── IA Local: aprendizado de padrões ─────────────────────────────────────────

void iaAprenderPadroes() {
  unsigned long agora = millis();
  if (agora - tUltimaAnaliseIA < INTERVALO_IA) return;
  tUltimaAnaliseIA = agora;
  ciclosObservados++;

  Serial.printf("[IA] ciclos=%d contadorLuz=%d\n", ciclosObservados, contadorLuz);

  if (ciclosObservados >= 5) {
    float freq = (float)contadorLuz / ciclosObservados;
    Serial.printf("[IA] frequencia=%.0f%%\n", freq * 100);

    if (freq >= 0.8f && !iaAtiva) {
      iaAtiva = true;
      mqttPublish("casa/ia/status", "ativa");
      Serial.println("[IA] PADRAO DETECTADO - IA ATIVA!");
      melodia();
    }
  }

  // IA ativa: liga luz proativamente quando há movimento
  if (iaAtiva && !luzLigada && movimentoAtivo) {
    Serial.println("[IA] Acao proativa: ligando luz");
    ligarLuz(true);
  }
}

// ── Display OLED ──────────────────────────────────────────────────────────────

void atualizarDisplay() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  display.setCursor(0, 0);
  display.println("=== SMART HOME v3 ===");

  char buf[32];
  display.setCursor(0, 12);
  sprintf(buf, "T: %.1fC  H: %.0f%%", temperatura, umidade);
  display.print(buf);

  display.setCursor(0, 22);
  sprintf(buf, "Luz: %-3s  Vent: %-3s", luzLigada ? "ON" : "OFF", ventLigado ? "ON" : "OFF");
  display.print(buf);

  display.setCursor(0, 32);
  sprintf(buf, "Mov: %-3s  Porta: %-3s", movimentoAtivo ? "SIM" : "NAO", portaAberta ? "ABT" : "FCH");
  display.print(buf);

  display.setCursor(0, 42);
  sprintf(buf, "Seg: %-3s", modoSeguranca ? "ON" : "OFF");
  display.print(buf);

  display.setCursor(0, 52);
  if (modoOffline) {
    display.print("OFFLINE");
  } else if (iaAtiva) {
    display.print("IA: ATIVA");
  } else {
    sprintf(buf, "IA: aprendendo %d/5", ciclosObservados);
    display.print(buf);
  }

  display.display();
}

// ── HC-SR04: mede distância em cm ────────────────────────────────────────────

float medirDistancia() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long dur = pulseIn(ECHO_PIN, HIGH, 30000);
  return (dur == 0) ? 999.0f : dur * 0.034f / 2.0f;
}

// ── MQTT Callback ─────────────────────────────────────────────────────────────

void callback(char* topic, byte* payload, unsigned int length) {
  String msg = "";
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];
  String t = String(topic);
  Serial.printf("[MQTT] %s -> %s\n", topic, msg.c_str());

  if (t == "casa/luz/comando") {
    ligarLuz(msg == "ON");
  } else if (t == "casa/ventilador/comando") {
    ligarVentilador(msg == "ON");
  } else if (t == "casa/porta/comando") {
    if (msg == "ABRIR") abrirPorta();
    else fecharPorta();
  } else if (t == "casa/alarme/comando") {
    modoSeguranca = (msg == "ATIVAR");
    client.publish("casa/alarme/status", modoSeguranca ? "ativado" : "desativado");
    Serial.printf("[SEGURANCA] %s\n", modoSeguranca ? "ATIVADA" : "DESATIVADA");
  } else if (t == "casa/reset" && msg == "RESET_IA") {
    contadorLuz = ciclosObservados = 0;
    iaAtiva = false;
    client.publish("casa/ia/status", "inativa");
    Serial.println("[IA] Reiniciada pelo backend");
  }
}

// ── Reconexão MQTT (não-bloqueante) ──────────────────────────────────────────

void tentarReconectarMQTT() {
  if (WiFi.status() != WL_CONNECTED || client.connected()) return;
  Serial.print("Conectando MQTT...");
  String cid = "esp32-smarthome-" + String(random(0xffff), HEX);
  if (client.connect(cid.c_str())) {
    modoOffline = false;
    Serial.println(" OK");
    client.subscribe("casa/luz/comando");
    client.subscribe("casa/ventilador/comando");
    client.subscribe("casa/porta/comando");
    client.subscribe("casa/alarme/comando");
    client.subscribe("casa/reset");
    client.publish("casa/luz/status",       luzLigada     ? "ligada"    : "desligada");
    client.publish("casa/ventilador/status", ventLigado   ? "ligado"    : "desligado");
    client.publish("casa/porta/status",      portaAberta  ? "aberta"    : "fechada");
    client.publish("casa/alarme/status",     modoSeguranca? "ativado"   : "desativado");
    client.publish("casa/ia/status",         iaAtiva      ? "ativa"     : "inativa");
  } else {
    Serial.printf(" falhou rc=%d\n", client.state());
  }
}

// ── Tenta reconectar WiFi (não-bloqueante) ────────────────────────────────────

void tentarReconectarWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.println("[WiFi] Reconectando...");
  WiFi.disconnect();
  WiFi.begin(ssid, password);
}

// ── Setup ─────────────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  Serial.println("\n=============================");
  Serial.println("  SMART HOME HIBRIDO v3.0");
  Serial.println("=============================");

  pinMode(RELAY_LUZ,  OUTPUT); digitalWrite(RELAY_LUZ,  LOW);
  pinMode(RELAY_VENT, OUTPUT); digitalWrite(RELAY_VENT, LOW);
  pinMode(BUZZER_PIN, OUTPUT); digitalWrite(BUZZER_PIN, LOW);
  pinMode(LED_PIN,    OUTPUT); digitalWrite(LED_PIN,    LOW);
  pinMode(PIR_PIN,    INPUT);
  pinMode(TRIG_PIN,   OUTPUT);
  pinMode(ECHO_PIN,   INPUT);

  Wire.begin(21, 22);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("ERRO: OLED nao encontrado!");
  } else {
    display.clearDisplay();
    display.setTextSize(2);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(8, 16);
    display.println("SMART HOME");
    display.setTextSize(1);
    display.setCursor(28, 48);
    display.println("iniciando...");
    display.display();
    Serial.println("[OK] OLED iniciado");
  }

  dht.begin();
  Serial.println("[OK] DHT22 iniciado");

  servoPorta.attach(SERVO_PIN);
  servoPorta.write(0);
  Serial.println("[OK] Servo iniciado (porta fechada)");

  WiFi.begin(ssid, password);
  Serial.print("Conectando WiFi (timeout 10s)");
  unsigned long tWifi = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - tWifi < 10000) {
    delay(500); Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[OK] WiFi conectado: " + WiFi.localIP().toString());
    client.setServer(mqtt_server, mqtt_port);
    client.setCallback(callback);
    tentarReconectarMQTT();
  } else {
    modoOffline = true;
    Serial.println("\n[OFFLINE] WiFi nao disponivel — modo local ativo");
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(10, 20);
    display.println("MODO OFFLINE");
    display.setCursor(4, 36);
    display.println("Sensores + IA local");
    display.display();
    delay(1500);
  }

  melodia();
  Serial.println("[OK] Sistema pronto!\n");
}

// ── Loop ──────────────────────────────────────────────────────────────────────

void loop() {
  // Tenta reconectar WiFi + MQTT periodicamente sem bloquear o loop
  unsigned long agora = millis();
  if (agora - tUltimaReconexao >= INTERVALO_RECONEXAO) {
    tUltimaReconexao = agora;
    tentarReconectarWiFi();
    tentarReconectarMQTT();
  }

  if (!modoOffline && client.connected()) client.loop();

  unsigned long agora = millis();

  // Fecha porta automaticamente após timeout
  if (portaTimer && (agora - tPortaAberta >= PORTA_TIMEOUT)) {
    fecharPorta();
  }

  // Ciclo de leitura e publicação dos sensores
  if (agora - tUltimaPublicacao >= INTERVALO_SENSOR) {
    tUltimaPublicacao = agora;

    // ── DHT22 ──
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    if (!isnan(t)) temperatura = t;
    if (!isnan(h)) umidade     = h;

    char buf[16];
    dtostrf(temperatura, 5, 1, buf); mqttPublish("casa/temperatura", buf);
    dtostrf(umidade,     5, 1, buf); mqttPublish("casa/umidade",     buf);

    // ── PIR ──
    bool pirAgora = (digitalRead(PIR_PIN) == HIGH);
    if (pirAgora != movimentoAtivo) {
      movimentoAtivo = pirAgora;
      mqttPublish("casa/movimento", movimentoAtivo ? "true" : "false");
      if (movimentoAtivo) {
        digitalWrite(LED_PIN, HIGH);
        if (modoSeguranca) ativarAlarme();
        else               ligarLuz(true);
        Serial.println("[PIR] Movimento detectado!");
      } else {
        digitalWrite(LED_PIN, LOW);
        Serial.println("[PIR] Sem movimento");
      }
    }

    // ── HC-SR04: abre porta quando objeto próximo ──
    float dist = medirDistancia();
    if (dist < 10.0f && !portaAberta) {
      Serial.printf("[HC-SR04] Objeto a %.1fcm — abrindo porta\n", dist);
      abrirPorta();
    }

    // ── Automação de temperatura ──
    if (temperatura > 28.0f) {
      ligarVentilador(true);
    } else if (temperatura < 26.0f && !movimentoAtivo) {
      ligarVentilador(false);
    }
    if (temperatura > 35.0f) {
      mqttPublish("casa/alarme", "temperatura_critica");
      Serial.println("[ALERTA] Temperatura critica!");
    }

    atualizarDisplay();

    Serial.printf("[Status] T=%.1f H=%.0f Luz=%s Vent=%s Mov=%s Seg=%s IA=%s\n",
      temperatura, umidade,
      luzLigada   ? "ON" : "OFF",
      ventLigado  ? "ON" : "OFF",
      movimentoAtivo  ? "SIM" : "NAO",
      modoSeguranca   ? "ON"  : "OFF",
      iaAtiva         ? "ATIVA" : "aprendendo");
  }

  iaAprenderPadroes();
}
