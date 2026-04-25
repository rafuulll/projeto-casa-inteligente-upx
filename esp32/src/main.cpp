#include <WiFi.h>
#include <PubSubClient.h>

const char* ssid     = "Wokwi-GUEST";  // rede padrão do Wokwi
const char* password = "";

// broker público gratuito — sem precisar instalar nada
const char* mqtt_server = "broker.hivemq.com";
const int   mqtt_port   = 1883;

const int LED_PIN = 2;

WiFiClient   espClient;
PubSubClient client(espClient);

void callback(char* topic, byte* payload, unsigned int length) {
  String msg = "";
  for (int i = 0; i < length; i++) msg += (char)payload[i];
  Serial.println("Recebeu: " + msg);

  if (msg == "ON")  digitalWrite(LED_PIN, HIGH);
  if (msg == "OFF") digitalWrite(LED_PIN, LOW);

  // publica status de volta
  client.publish("casa/led/status", msg.c_str());
}

void reconnect() {
  while (!client.connected()) {
    Serial.println("Conectando ao MQTT...");
    if (client.connect("esp32-wokwi")) {
      Serial.println("Conectado!");
      client.subscribe("casa/led");
    } else {
      delay(2000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);

  WiFi.begin(ssid, password);
  Serial.print("Conectando ao Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWi-Fi conectado!");

  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
}

void loop() {
  if (!client.connected()) reconnect();
  client.loop();
}