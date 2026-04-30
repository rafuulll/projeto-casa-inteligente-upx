#include <WiFi.h>
#include <PubSubClient.h>

const char* ssid        = "Wokwi-GUEST";
const char* password    = "";
const char* mqtt_server = "broker.hivemq.com";
const int   mqtt_port   = 1883;

// ── Mapeamento ID → Pino ──────────────────────────────────────────────────────
struct Device {
  const char* id;
  int         pin;
};

const Device devices[] = {
  { "sala-luz",          2  },
  { "sala-ventilador",   4  },
  { "quarto-luz",        5  },
  { "quarto-ar",         18 },
  { "cozinha-luz",       19 },
  { "cozinha-cafeteira", 21 },
};
const int NUM_DEVICES = sizeof(devices) / sizeof(devices[0]);

WiFiClient   espClient;
PubSubClient client(espClient);

// ── Callback MQTT ─────────────────────────────────────────────────────────────
void callback(char* topic, byte* payload, unsigned int length) {
  String msg = "";
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];

  String topicStr = String(topic);
  Serial.println("MQTT recebeu [" + topicStr + "]: " + msg);

  for (int i = 0; i < NUM_DEVICES; i++) {
    String expected = "casa/" + String(devices[i].id);
    if (topicStr == expected) {
      bool state = (msg == "ON");
      digitalWrite(devices[i].pin, state ? HIGH : LOW);

      // Publica confirmação de volta
      String statusTopic = expected + "/status";
      client.publish(statusTopic.c_str(), msg.c_str());
      Serial.println("Confirmado: " + statusTopic + " = " + msg);
      break;
    }
  }
}

// ── Reconexão MQTT ────────────────────────────────────────────────────────────
void reconnect() {
  while (!client.connected()) {
    Serial.println("Conectando ao MQTT...");
    if (client.connect("esp32-casa-inteligente")) {
      Serial.println("MQTT conectado!");
      // Assina todos os tópicos de comando
      for (int i = 0; i < NUM_DEVICES; i++) {
        String topic = "casa/" + String(devices[i].id);
        client.subscribe(topic.c_str());
        Serial.println("Inscrito: " + topic);
      }
    } else {
      Serial.print("Falhou (rc=");
      Serial.print(client.state());
      Serial.println("). Tentando em 3s...");
      delay(3000);
    }
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);

  // Inicializa todos os pinos como OUTPUT
  for (int i = 0; i < NUM_DEVICES; i++) {
    pinMode(devices[i].pin, OUTPUT);
    digitalWrite(devices[i].pin, LOW);
  }

  // Conecta ao Wi-Fi
  WiFi.begin(ssid, password);
  Serial.print("Conectando ao Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWi-Fi conectado!");

  // Configura MQTT
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
}

// ── Loop ──────────────────────────────────────────────────────────────────────
void loop() {
  if (!client.connected()) reconnect();
  client.loop();
}