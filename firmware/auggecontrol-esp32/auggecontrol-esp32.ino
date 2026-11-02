// AuggeControl - firmware para ESP32 + módulo relé.
//
// O ESP32 conecta para fora (HTTPS) na API do AuggeControl e fica aguardando
// comandos por long-polling. Não é preciso abrir portas no roteador.
//
// Bibliotecas: placa "esp32" da Espressif (2.x ou 3.x) e ArduinoJson 7.x.

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>

#if __has_include("config.h")
#include "config.h"
#else
#error "Crie o arquivo config.h a partir de config.exemplo.h"
#endif

#include "certificados.h"

#define FIRMWARE_VERSAO "1.0.0"

static const int RELES[] = RELE_PINOS;
static const int SENS_ABERTO[] = SENSOR_ABERTO_PINOS;
static const int SENS_FECHADO[] = SENSOR_FECHADO_PINOS;
static const int N_RELES = sizeof(RELES) / sizeof(RELES[0]);
static const int N_SENS = sizeof(SENS_ABERTO) / sizeof(SENS_ABERTO[0]);

static const int NIVEL_LIGADO = RELE_ATIVO_EM_BAIXO ? LOW : HIGH;
static const int NIVEL_DESLIGADO = RELE_ATIVO_EM_BAIXO ? HIGH : LOW;

WiFiClientSecure tls;
unsigned long esperaErro = 2000;  // backoff em caso de falha

// ---------------------------------------------------------------- relés

bool pulso(int canal, int ms) {
  if (canal < 1 || canal > N_RELES) return false;
  int pino = RELES[canal - 1];
  digitalWrite(pino, NIVEL_LIGADO);
  delay(constrain(ms, 100, 10000));
  digitalWrite(pino, NIVEL_DESLIGADO);
  return true;
}

// ---------------------------------------------------------------- sensores

const char* estadoCanal(int i) {
  int a = i < N_SENS ? SENS_ABERTO[i] : -1;
  int f = i < N_SENS ? SENS_FECHADO[i] : -1;
  if (a < 0 && f < 0) return nullptr;
  bool aberto = a >= 0 && digitalRead(a) == LOW;
  bool fechado = f >= 0 && digitalRead(f) == LOW;
  if (fechado && !aberto) return "fechado";
  if (aberto && !fechado) return "aberto";
  if (a >= 0 && f >= 0 && !aberto && !fechado) return "movendo";
  if (f >= 0 && a < 0) return fechado ? "fechado" : "aberto";
  if (a >= 0 && f < 0) return aberto ? "aberto" : "fechado";
  return "desconhecido";
}

void preencherEstados(JsonObject estados) {
  for (int i = 0; i < N_RELES; i++) {
    const char* e = estadoCanal(i);
    if (e) estados[String(i + 1)] = e;
  }
}

// ---------------------------------------------------------------- rede

void conectarWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.printf("Conectando ao Wi-Fi \"%s\"", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_SENHA);
  unsigned long inicio = millis();
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    if (millis() - inicio > 30000) {
      Serial.println("\nSem Wi-Fi. Reiniciando...");
      ESP.restart();
    }
  }
  Serial.printf("\nWi-Fi conectado. IP %s, sinal %d dBm\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
}

// A validação do certificado HTTPS precisa do relógio certo.
void sincronizarRelogio() {
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  Serial.print("Sincronizando relógio");
  time_t agora = time(nullptr);
  unsigned long inicio = millis();
  while (agora < 1700000000 && millis() - inicio < 20000) {
    delay(300);
    Serial.print(".");
    agora = time(nullptr);
  }
  Serial.println(agora >= 1700000000 ? " ok" : " falhou (tentando mesmo assim)");
}

// Faz POST na API. Retorna o código HTTP (ou negativo em erro de conexão).
int postar(const char* rota, const String& corpo, String& resposta, uint16_t timeoutMs) {
  HTTPClient http;
  String url = String(DC_API_URL) + "/" + rota;
  if (!http.begin(tls, url)) return -1;
  http.setTimeout(timeoutMs);
  http.setConnectTimeout(10000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Id", DC_DEVICE_ID);
  http.addHeader("Authorization", String("Device ") + DC_SECRET);
  int codigo = http.POST(corpo);
  if (codigo > 0) resposta = http.getString();
  http.end();
  return codigo;
}

void confirmar(const char* id, bool ok, const char* erro) {
  JsonDocument doc;
  doc["command_id"] = id;
  doc["success"] = ok;
  if (!ok && erro) doc["error"] = erro;
  preencherEstados(doc["states"].to<JsonObject>());
  String corpo, resposta;
  serializeJson(doc, corpo);
  // Tenta algumas vezes: a confirmação é o que aparece no app.
  for (int t = 0; t < 3; t++) {
    int c = postar("ack", corpo, resposta, 10000);
    if (c == 200) return;
    Serial.printf("Falha ao confirmar comando (HTTP %d), tentando de novo\n", c);
    delay(1000);
  }
}

void executar(JsonObject cmd) {
  const char* id = cmd["id"] | "";
  const char* acao = cmd["action"] | "";
  const char* modo = cmd["mode"] | "pulso";
  int canal = cmd["channel"] | 0;
  int ms = cmd["pulse_ms"] | 500;

  int alvo = canal;
  if (strcmp(modo, "abrir_fechar") == 0 && strcmp(acao, "fechar") == 0) alvo = canal + 1;

  Serial.printf("Comando %s: %s no canal %d (relé %d)\n", id, acao, canal, alvo);
  bool ok = pulso(alvo, ms);
  confirmar(id, ok, ok ? nullptr : "Canal de relé não configurado no firmware");
}

void ciclo() {
  JsonDocument req;
  preencherEstados(req["states"].to<JsonObject>());
  JsonObject info = req["info"].to<JsonObject>();
  info["firmware"] = FIRMWARE_VERSAO;
  info["ip"] = WiFi.localIP().toString();
  info["rssi"] = WiFi.RSSI();
  String corpo, resposta;
  serializeJson(req, corpo);

  // O servidor segura a conexão por até ~20 s esperando comandos.
  int codigo = postar("poll", corpo, resposta, 30000);

  if (codigo == 200) {
    esperaErro = 2000;
    JsonDocument doc;
    if (deserializeJson(doc, resposta)) {
      Serial.println("Resposta inválida do servidor");
      return;
    }
    for (JsonObject cmd : doc["commands"].as<JsonArray>()) executar(cmd);
    return;
  }

  if (codigo == 401) {
    Serial.println("Credenciais recusadas. Confira DC_DEVICE_ID e DC_SECRET no config.h.");
    esperaErro = 60000;
  } else {
    Serial.printf("Erro ao falar com o servidor (HTTP %d)\n", codigo);
    esperaErro = min<unsigned long>(esperaErro * 2, 30000);
  }
  delay(esperaErro);
}

// ---------------------------------------------------------------- principal

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.printf("\nAuggeControl ESP32 v%s\n", FIRMWARE_VERSAO);

  for (int i = 0; i < N_RELES; i++) {
    digitalWrite(RELES[i], NIVEL_DESLIGADO);  // nível seguro antes de virar saída
    pinMode(RELES[i], OUTPUT);
  }
  for (int i = 0; i < N_SENS; i++) {
    if (SENS_ABERTO[i] >= 0) pinMode(SENS_ABERTO[i], INPUT_PULLUP);
    if (SENS_FECHADO[i] >= 0) pinMode(SENS_FECHADO[i], INPUT_PULLUP);
  }

  conectarWifi();
  sincronizarRelogio();
  tls.setCACert(DC_ROOT_CA);
}

void loop() {
  conectarWifi();
  ciclo();
}
