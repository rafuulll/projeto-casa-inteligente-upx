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

// ── Modo de operação ─────────────────────────────────────────────────────────
// Wokwi (LEDs):        RELAY_ON = HIGH, RELAY_OFF = LOW
// Hardware (relé active LOW): RELAY_ON = LOW,  RELAY_OFF = HIGH
#define RELAY_ON  LOW
#define RELAY_OFF HIGH

// ── Pinos existentes (dispositivos) ──────────────────────────────────────────
#define PIN_SALA_LUZ        2
#define PIN_SALA_FAN        4
#define PIN_QUARTO_LUZ      5
#define PIN_QUARTO_AR      18
#define PIN_COZ_LUZ        19
#define PIN_COZ_CAFETEIRA  21

// ── Pinos novos (sensores e atuadores) ───────────────────────────────────────
#define PIN_DHT22          15
#define PIN_BUZZER         17
#define PIN_OLED_SCL       22
#define PIN_OLED_SDA       23
#define PIN_SERVO          25
#define PIN_LED_R          26
#define PIN_PIR            27
#define PIN_TRIG           32
#define PIN_ECHO           33
#define PIN_LED_G          13
#define PIN_LED_B          14

// ── Configurações ─────────────────────────────────────────────────────────────
#define DHT_TYPE      DHT22
#define SCREEN_WIDTH  128
#define SCREEN_HEIGHT  64

DHT                 dht(PIN_DHT22, DHT_TYPE);
Adafruit_SSD1306    display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
Servo               doorServo;

// ── Estado dos dispositivos existentes ───────────────────────────────────────
bool salaLuz      = false;
bool salaFan      = false;
bool quartoLuz    = false;
bool quartoAr     = false;
bool cozLuz       = false;
bool cozCafeteira = false;

// ── Estado dos novos atuadores ────────────────────────────────────────────────
bool portaAberta   = false;
bool alarmeAtivo   = false;
bool modoSeguranca = false;

// ── Telemetria ────────────────────────────────────────────────────────────────
float temperatura = 0;
float umidade     = 0;
bool  movimento   = false;

// ── IA Local ──────────────────────────────────────────────────────────────────
int           contadorLuzManual = 0;
int           ciclosObservados  = 0;
bool          iaAtiva           = false;
unsigned long ultimoCicloIA     = 0;

const unsigned long CICLO_MS      = 20000;
const int           CICLOS_TREINO = 5;
const float         FREQ_ATIVACAO = 0.80f;

// ── Timers ────────────────────────────────────────────────────────────────────
unsigned long tUltimoDHT       = 0;
unsigned long tUltimoMQTT      = 0;
unsigned long tMovimento       = 0;
unsigned long tPortaAberta     = 0;
unsigned long tUltimoAlarmeTemp = 0;
unsigned long tUltimoAlarmeMov  = 0;

const unsigned long DT_DHT   = 2000;
const unsigned long DT_MQTT  = 5000;
const unsigned long DT_MOV   = 5000;
const unsigned long DT_PORTA = 3000;

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
void processarIALocal();
void publicarTelemetria();
void atualizarDisplay();
void pub(const char* topico, const char* payload);

// ─────────────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);

  // Relés iniciam desligados (RELAY_OFF), demais saídas em LOW
  int relays[] = { PIN_SALA_LUZ, PIN_SALA_FAN, PIN_QUARTO_LUZ,
                   PIN_QUARTO_AR, PIN_COZ_LUZ, PIN_COZ_CAFETEIRA };
  for (int p : relays) { pinMode(p, OUTPUT); digitalWrite(p, RELAY_OFF); }

  int saidas[] = { PIN_BUZZER, PIN_TRIG, PIN_LED_R, PIN_LED_G, PIN_LED_B };
  for (int p : saidas) { pinMode(p, OUTPUT); digitalWrite(p, LOW); }
  pinMode(PIN_PIR,  INPUT);
  pinMode(PIN_ECHO, INPUT);

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
  doorServo.write(0); // porta fechada

  setupWifi();
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);

  setLedRGB(false, true, false); // verde: pronto
  beep(1000, 200);
  Serial.println("Sistema iniciado!");
}

void loop() {
  if (!client.connected()) reconnectMQTT();
  client.loop();

  unsigned long agora = millis();

  if (agora - tUltimoDHT >= DT_DHT) {
    lerDHT();
    tUltimoDHT = agora;
  }

  verificarPIR();

  if (portaAberta && (agora - tPortaAberta >= DT_PORTA)) setPorta(false);

  if (movimento && (agora - tMovimento >= DT_MOV)) {
    movimento = false;
    if (!alarmeAtivo) setLedRGB(false, true, false);
  }

  if (agora - tUltimoMQTT >= DT_MQTT) {
    publicarTelemetria();
    tUltimoMQTT = agora;
  }

  processarIALocal();
  atualizarDisplay();
  delay(100);
}

// ── WiFi / MQTT ───────────────────────────────────────────────────────────────
void setupWifi() {
  WiFi.begin(ssid, password);
  Serial.print("WiFi");
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println(" OK: " + WiFi.localIP().toString());
}

void reconnectMQTT() {
  setLedRGB(false, false, true); // azul: reconectando
  while (!client.connected()) {
    Serial.print("MQTT...");
    if (client.connect("esp32-smarthome")) {
      // Tópicos existentes
      client.subscribe("casa/sala-luz");
      client.subscribe("casa/sala-ventilador");
      client.subscribe("casa/quarto-luz");
      client.subscribe("casa/quarto-ar");
      client.subscribe("casa/cozinha-luz");
      client.subscribe("casa/cozinha-cafeteira");
      // Tópicos novos
      client.subscribe("casa/porta/comando");
      client.subscribe("casa/alarme/comando");
      client.subscribe("casa/reset");
      pub("casa/status", "online");
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

  if      (t == "casa/sala-luz")           setDispositivo(PIN_SALA_LUZ,      msg == "ON", &salaLuz,      "casa/sala-luz/status");
  else if (t == "casa/sala-ventilador")    setDispositivo(PIN_SALA_FAN,       msg == "ON", &salaFan,      "casa/sala-ventilador/status");
  else if (t == "casa/quarto-luz")         setDispositivo(PIN_QUARTO_LUZ,     msg == "ON", &quartoLuz,    "casa/quarto-luz/status");
  else if (t == "casa/quarto-ar")          setDispositivo(PIN_QUARTO_AR,      msg == "ON", &quartoAr,     "casa/quarto-ar/status");
  else if (t == "casa/cozinha-luz")        setDispositivo(PIN_COZ_LUZ,        msg == "ON", &cozLuz,       "casa/cozinha-luz/status");
  else if (t == "casa/cozinha-cafeteira")  setDispositivo(PIN_COZ_CAFETEIRA,  msg == "ON", &cozCafeteira, "casa/cozinha-cafeteira/status");
  else if (t == "casa/porta/comando")      setPorta(msg == "ABRIR");
  else if (t == "casa/alarme/comando") {
    if (msg == "ATIVAR") {
      modoSeguranca = true;
      // LED permanece verde — alarme só dispara ao detectar movimento
    } else {
      modoSeguranca = false;
      setAlarme(false);
    }
  }
  else if (t == "casa/reset" && msg == "RESET_IA") {
    contadorLuzManual = 0; ciclosObservados = 0; iaAtiva = false;
    pub("casa/ia/status", "inativa");
    Serial.println("IA reiniciada");
  }
}

// ── Sensores ──────────────────────────────────────────────────────────────────
void lerDHT() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if (!isnan(t)) temperatura = t;
  if (!isnan(h)) umidade     = h;

  // Automação: temperatura alta liga ventilador da sala automaticamente
  if (temperatura > 28.0 && !salaFan) {
    setDispositivo(PIN_SALA_FAN, true, &salaFan, "casa/sala-ventilador/status");
    Serial.println("Auto: ventilador ligado (temp=" + String(temperatura) + ")");
  } else if (temperatura < 26.0 && salaFan) {
    setDispositivo(PIN_SALA_FAN, false, &salaFan, "casa/sala-ventilador/status");
  }

  if (temperatura > 35.0 && (millis() - tUltimoAlarmeTemp > 60000)) {
    tUltimoAlarmeTemp = millis();
    pub("casa/alarme", "calor_extremo");
    beep(2000, 500);
  }
}

void verificarPIR() {
  if (digitalRead(PIN_PIR) && !movimento) {
    movimento  = true;
    tMovimento = millis();
    setLedRGB(true, true, false); // amarelo: movimento
    pub("casa/movimento", "true");
    Serial.println("Movimento detectado!");
    if (modoSeguranca) {
      setAlarme(true);
      pub("casa/alarme", "intruso_detectado");
      modoSeguranca = false; // desarma automaticamente após detectar movimento
      pub("casa/alarme/status", "desarmado");
    }
  }
}

// ── Atuadores ─────────────────────────────────────────────────────────────────
void setDispositivo(int pino, bool estado, bool* var, const char* topico) {
  *var = estado;
  digitalWrite(pino, estado ? RELAY_ON : RELAY_OFF);
  pub(topico, estado ? "ON" : "OFF");

  // IA Local: contabiliza acionamentos manuais da sala-luz
  if (pino == PIN_SALA_LUZ && estado && !iaAtiva) {
    contadorLuzManual++;
    Serial.println("IA: contador=" + String(contadorLuzManual));
  }
}

void setPorta(bool abrir) {
  portaAberta  = abrir;
  tPortaAberta = millis();
  doorServo.write(abrir ? 90 : 0);
  pub("casa/porta/status", abrir ? "aberta" : "fechada");
  beep(abrir ? 1500 : 500, 150);
}

void setAlarme(bool estado) {
  alarmeAtivo = estado;
  if (estado) {
    setLedRGB(true, false, false); // vermelho: alarme
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

void beep(int freq, int ms) { digitalWrite(PIN_BUZZER, HIGH); delay(ms); digitalWrite(PIN_BUZZER, LOW); }

// ── IA Local ──────────────────────────────────────────────────────────────────
void processarIALocal() {
  unsigned long agora = millis();
  if (agora - ultimoCicloIA < CICLO_MS || iaAtiva) return;
  ultimoCicloIA = agora;
  ciclosObservados++;

  Serial.println("IA ciclo=" + String(ciclosObservados) +
                 " manual="  + String(contadorLuzManual));

  if (ciclosObservados >= CICLOS_TREINO) {
    float freq = (float)contadorLuzManual / ciclosObservados;
    Serial.println("IA freq=" + String(freq));

    if (freq >= FREQ_ATIVACAO) {
      iaAtiva = true;
      pub("casa/ia/status", "ativa");
      Serial.println("=== IA ATIVADA! freq=" + String(freq) + " ===");
      beep(1000, 100); delay(100);
      beep(1500, 100); delay(100);
      beep(2000, 200);
      setLedRGB(false, true, true); // ciano: IA ativa
    } else {
      contadorLuzManual = 0;
      ciclosObservados  = 0;
    }
  }
}

// ── Publicação ────────────────────────────────────────────────────────────────
void publicarTelemetria() {
  char buf[16];
  dtostrf(temperatura, 4, 1, buf); pub("casa/temperatura", buf);
  dtostrf(umidade,     4, 1, buf); pub("casa/umidade",     buf);
  pub("casa/movimento", movimento ? "true" : "false");
  pub("casa/ia/status", iaAtiva   ? "ativa" : "inativa");
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
  display.setCursor(0, 10); display.print("Sala Luz:"); display.print(salaLuz ? "ON " : "OFF");
                            display.print(" Fan:"); display.println(salaFan ? "ON" : "OFF");
  display.setCursor(0, 20); display.print("Qto  Luz:"); display.print(quartoLuz ? "ON " : "OFF");
                            display.print(" Ar:"); display.println(quartoAr ? "ON" : "OFF");
  display.setCursor(0, 30); display.print("Coz  Luz:"); display.print(cozLuz ? "ON " : "OFF");
                            display.print(" Cafe:"); display.println(cozCafeteira ? "ON" : "OFF");
  display.setCursor(0, 42); display.print("Porta:"); display.println(portaAberta ? "ABERTA " : "FECHADA");
  display.setCursor(0, 52); display.print("Mov:"); display.print(movimento ? "SIM " : "NAO ");
                            display.print("IA:"); display.println(iaAtiva ? "ATIVA" : "APND");
  display.display();
}
