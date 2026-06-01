#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ESP32Servo.h>

// ── WiFi / MQTT ───────────────────────────────────────────────────────────────
const char* ssid        = "iPhone de Murilo";
const char* password    = "murilete";
const char* mqtt_server = "broker.hivemq.com";
const int   mqtt_port   = 1883;

// ── Modo de operação ─────────────────────────────────────────────────────────
#define RELAY_ON  HIGH
#define RELAY_OFF LOW

// ── Pinos dos dispositivos ────────────────────────────────────────────────────
#define PIN_SALA_LUZ       2   // Luz da Sala
#define PIN_QUARTO_LUZ     4   // Luz do Quarto
#define PIN_COZ_LUZ        5   // Luz da Cozinha
#define PIN_COZ_CAFETEIRA 18   // Luz do Banheiro

// ── Pinos sensores e atuadores ────────────────────────────────────────────────
#define PIN_DHT22          15
#define PIN_BUZZER         17
#define PIN_OLED_SCL       22
#define PIN_OLED_SDA       23
#define PIN_SERVO          25
#define PIN_LED_R          26
#define PIN_PIR            27
#define PIN_LED_G          13
#define PIN_LED_B          14

// ── Configurações ─────────────────────────────────────────────────────────────
#define DHT_TYPE      DHT22
#define SCREEN_WIDTH  128
#define SCREEN_HEIGHT  64

DHT                 dht(PIN_DHT22, DHT_TYPE);
Adafruit_SSD1306    display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
Servo               doorServo;

// ── Estado dos dispositivos ───────────────────────────────────────────────────
bool salaLuz      = false;
bool quartoLuz    = false;
bool cozLuz       = false;
bool cozCafeteira = false;

// ── Estado dos atuadores ──────────────────────────────────────────────────────
bool portaAberta   = false;
bool alarmeAtivo   = false;
bool modoSeguranca = false;

// ── Telemetria ────────────────────────────────────────────────────────────────
float temperatura = 0;
float umidade     = 0;
bool  movimento   = false;

// ── Timers ────────────────────────────────────────────────────────────────────
unsigned long tUltimoDHT        = 0;
unsigned long tUltimoMQTT       = 0;
unsigned long tMovimento        = 0;
unsigned long tUltimoAlarmeTemp = 0;
const unsigned long DT_DHT     = 500;
const unsigned long DT_MQTT    = 1000;
const unsigned long DT_MOV     = 10000;
const unsigned long PIR_WARMUP = 30000;

// ── MQTT ──────────────────────────────────────────────────────────────────────
WiFiClient   espClient;
PubSubClient client(espClient);

// ── Protótipos ────────────────────────────────────────────────────────────────
void setupWifi();
void reconnectMQTT();
void callback(char* topic, byte* payload, unsigned int length);
void lerDHT();
void verificarPIR();
void setDispositivo(int pino, bool estado, bool* var, const char* topico);
void setPorta(bool abrir);
void setAlarme(bool estado);
void setLedRGB(bool r, bool g, bool b);
void beep(int freq, int ms);
void publicarTelemetria();
void atualizarDisplay();
void pub(const char* topico, const char* payload);

// ─────────────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);

  int leds[] = { PIN_SALA_LUZ, PIN_QUARTO_LUZ, PIN_COZ_LUZ, PIN_COZ_CAFETEIRA };
  for (int p : leds) { pinMode(p, OUTPUT); digitalWrite(p, RELAY_OFF); }

  int saidas[] = { PIN_BUZZER, PIN_LED_R, PIN_LED_G, PIN_LED_B };
  for (int p : saidas) { pinMode(p, OUTPUT); digitalWrite(p, LOW); }
  pinMode(PIN_PIR, INPUT_PULLDOWN);

  setLedRGB(true, false, false); // vermelho: inicializando

  Wire.begin(PIN_OLED_SDA, PIN_OLED_SCL);
  if (display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0, 0);
    display.println("Iniciando...");
    display.display();
  }

  dht.begin();
  doorServo.attach(PIN_SERVO);
  doorServo.write(0);

  setupWifi();
  client.setServer(mqtt_server, mqtt_port);
  client.setKeepAlive(15);
  client.setCallback(callback);

  setLedRGB(false, true, false); // verde: pronto
  beep(1000, 200);
  Serial.println("Sistema iniciado!");
}

void loop() {
  if (!client.connected()) reconnectMQTT();
  client.loop();

  unsigned long agora = millis();

  if (agora - tUltimoDHT >= DT_DHT) { lerDHT(); tUltimoDHT = agora; }

  verificarPIR();

  if (movimento && (agora - tMovimento >= DT_MOV)) {
    movimento = false;
    if (!alarmeAtivo) setLedRGB(false, true, false);
  }

  if (agora - tUltimoMQTT >= DT_MQTT) { publicarTelemetria(); tUltimoMQTT = agora; }

  atualizarDisplay();
  delay(100);
}

// ── WiFi ──────────────────────────────────────────────────────────────────────
void setupWifi() {
  WiFi.begin(ssid, password);
  Serial.print("WiFi");
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  WiFi.config(WiFi.localIP(), WiFi.gatewayIP(), WiFi.subnetMask(), IPAddress(8, 8, 8, 8));
  Serial.println(" OK: " + WiFi.localIP().toString());
}

void reconnectMQTT() {
  setLedRGB(false, false, true); // azul: reconectando
  while (!client.connected()) {
    Serial.print("MQTT...");
    String clientId = "esp32-smarthome-" + String(random(0xffff), HEX);
    if (client.connect(clientId.c_str())) {
      client.subscribe("upx2025/casa/sala-luz");
      client.subscribe("upx2025/casa/sala-ventilador");
      client.subscribe("upx2025/casa/quarto-luz");
      client.subscribe("upx2025/casa/quarto-ar");
      client.subscribe("upx2025/casa/cozinha-luz");
      client.subscribe("upx2025/casa/cozinha-cafeteira");
      client.subscribe("upx2025/casa/porta/comando");
      client.subscribe("upx2025/casa/alarme/comando");
      client.subscribe("upx2025/casa/reset");
      pub("upx2025/casa/status", "online");
      Serial.println("OK");
    } else {
      Serial.println("falhou rc=" + String(client.state()));
      delay(3000);
    }
  }
  setLedRGB(false, true, false);
}

void callback(char* topic, byte* payload, unsigned int length) {
  String msg = "";
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];
  String t = String(topic);
  Serial.println("[" + t + "] " + msg);

  if      (t == "upx2025/casa/sala-luz")          setDispositivo(PIN_SALA_LUZ,     msg == "ON", &salaLuz,      "upx2025/casa/sala-luz/status");
  else if (t == "upx2025/casa/quarto-luz")        setDispositivo(PIN_QUARTO_LUZ,   msg == "ON", &quartoLuz,    "upx2025/casa/quarto-luz/status");
  else if (t == "upx2025/casa/cozinha-luz")       setDispositivo(PIN_COZ_LUZ,      msg == "ON", &cozLuz,       "upx2025/casa/cozinha-luz/status");
  else if (t == "upx2025/casa/cozinha-cafeteira") setDispositivo(PIN_COZ_CAFETEIRA,msg == "ON", &cozCafeteira, "upx2025/casa/cozinha-cafeteira/status");
  else if (t == "upx2025/casa/porta/comando")     setPorta(msg == "ABRIR");
  else if (t == "upx2025/casa/alarme/comando") {
    if (msg == "ATIVAR") { modoSeguranca = true; }
    else { modoSeguranca = false; setAlarme(false); }
  }
}

// ── Sensores ──────────────────────────────────────────────────────────────────
void lerDHT() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if (!isnan(t)) temperatura = t;
  if (!isnan(h)) umidade     = h;

  if (temperatura > 35.0 && (millis() - tUltimoAlarmeTemp > 60000)) {
    tUltimoAlarmeTemp = millis();
    pub("upx2025/casa/alarme", "calor_extremo");
    beep(2000, 500);
  }
}

void verificarPIR() {
  if (millis() < PIR_WARMUP) return;
  if (digitalRead(PIN_PIR) && !movimento) {
    movimento  = true;
    tMovimento = millis();
    setLedRGB(true, true, false);
    pub("upx2025/casa/movimento", "true");
    Serial.println("Movimento detectado!");
    if (modoSeguranca) {
      setAlarme(true);
      pub("upx2025/casa/alarme", "intruso_detectado");
      modoSeguranca = false;
      pub("upx2025/casa/alarme/status", "desarmado");
    }
  }
}

// ── Atuadores ─────────────────────────────────────────────────────────────────
void setDispositivo(int pino, bool estado, bool* var, const char* topico) {
  *var = estado;
  digitalWrite(pino, estado ? RELAY_ON : RELAY_OFF);
  pub(topico, estado ? "ON" : "OFF");
}

void setPorta(bool abrir) {
  portaAberta = abrir;
  doorServo.write(abrir ? 90 : 0);
  pub("upx2025/casa/porta/status", abrir ? "aberta" : "fechada");
  delay(600);
  beep(abrir ? 1500 : 500, 150);
}

void setAlarme(bool estado) {
  alarmeAtivo = estado;
  if (estado) {
    setLedRGB(true, false, false);
    for (int i = 0; i < 5; i++) { beep(2000, 200); delay(100); }
  } else {
    setLedRGB(false, true, false);
  }
}

void setLedRGB(bool r, bool g, bool b) {
  digitalWrite(PIN_LED_R, r ? HIGH : LOW);
  digitalWrite(PIN_LED_G, g ? HIGH : LOW);
  digitalWrite(PIN_LED_B, b ? HIGH : LOW);
}

void beep(int freq, int ms) { tone(PIN_BUZZER, freq, ms); }

// ── Publicação ────────────────────────────────────────────────────────────────
void publicarTelemetria() {
  char buf[16];
  dtostrf(temperatura, 4, 1, buf); pub("upx2025/casa/temperatura", buf);
  dtostrf(umidade,     4, 1, buf); pub("upx2025/casa/umidade",     buf);
  pub("upx2025/casa/movimento", movimento ? "true" : "false");
}

void pub(const char* topico, const char* payload) {
  if (client.connected()) client.publish(topico, payload);
}

// ── Display OLED ──────────────────────────────────────────────────────────────
void atualizarDisplay() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  display.setCursor(0,  0); display.print("T:"); display.print(temperatura, 1);
                            display.print("C U:"); display.print(umidade, 1); display.println("%");
  display.setCursor(0, 12); display.print("Sala:"); display.print(salaLuz ? "ON " : "OFF");
                            display.print(" Qto:"); display.println(quartoLuz ? "ON" : "OFF");
  display.setCursor(0, 24); display.print("Coz:"); display.print(cozLuz ? "ON " : "OFF");
                            display.print(" Banh:"); display.println(cozCafeteira ? "ON" : "OFF");
  display.setCursor(0, 36); display.print("Porta:"); display.println(portaAberta ? "ABERTA" : "FECHADA");
  display.setCursor(0, 48); display.print("Mov:"); display.println(movimento ? "SIM" : "NAO");
  display.display();
}
