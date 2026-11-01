// Controle de portão via Wi-Fi para ESP32.
//
// O ESP32 aciona um relé ligado à entrada de botoeira da central do portão
// e serve o app (página web instalável) em http://portao.local
//
// API (todas exigem o cabeçalho "X-Token: <TOKEN_ACESSO>"):
//   GET  /api/status   -> {"estado": "...", "abrirFecharSeparados": bool}
//   POST /api/acionar  -> pulso na botoeira (abre/para/fecha)
//   POST /api/abrir    -> pulso no relé de abrir (ou na botoeira)
//   POST /api/fechar   -> pulso no relé de fechar (ou na botoeira)

#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>

#if __has_include("config.h")
#include "config.h"
#else
#warning "config.h não encontrado: usando config.exemplo.h. Copie e ajuste!"
#include "config.exemplo.h"
#endif

#include "pagina.h"

WebServer servidor(80);
unsigned long ultimoComando = 0;
bool jaAcionou = false;

// ---------- Relés ----------

const int NIVEL_LIGADO    = RELE_ATIVO_EM_BAIXO ? LOW : HIGH;
const int NIVEL_DESLIGADO = RELE_ATIVO_EM_BAIXO ? HIGH : LOW;

void prepararRele(int pino) {
  digitalWrite(pino, NIVEL_DESLIGADO);  // define o nível antes de virar saída
  pinMode(pino, OUTPUT);
}

void pulso(int pino) {
  digitalWrite(pino, NIVEL_LIGADO);
  delay(DURACAO_PULSO_MS);
  digitalWrite(pino, NIVEL_DESLIGADO);
}

// ---------- Sensores ----------

const char* estadoAtual() {
  bool temAberto  = SENSOR_ABERTO_PINO  >= 0;
  bool temFechado = SENSOR_FECHADO_PINO >= 0;
  if (!temAberto && !temFechado) return "desconhecido";

  bool aberto  = temAberto  && digitalRead(SENSOR_ABERTO_PINO)  == LOW;
  bool fechado = temFechado && digitalRead(SENSOR_FECHADO_PINO) == LOW;

  if (fechado && !aberto) return "fechado";
  if (aberto && !fechado) return "aberto";
  if (temAberto && temFechado && !aberto && !fechado) return "movendo";
  // Só um sensor instalado e ele não está ativo.
  if (temFechado && !fechado) return "aberto";
  if (temAberto && !aberto) return "fechado";
  return "desconhecido";
}

// ---------- HTTP ----------

// Comparação em tempo constante para não vazar a senha por tempo de resposta.
bool tokenValido() {
  String recebido = servidor.header("X-Token");
  const char* esperado = TOKEN_ACESSO;
  size_t n = strlen(esperado);
  if (recebido.length() != n) return false;
  uint8_t dif = 0;
  for (size_t i = 0; i < n; i++) dif |= recebido[i] ^ esperado[i];
  return dif == 0;
}

void responderJson(int codigo, const String& corpo) {
  servidor.send(codigo, "application/json", corpo);
}

bool autorizar() {
  if (tokenValido()) return true;
  responderJson(401, "{\"erro\":\"nao autorizado\"}");
  return false;
}

void comando(int pino) {
  if (!autorizar()) return;
  unsigned long agora = millis();
  if (jaAcionou && agora - ultimoComando < INTERVALO_MIN_MS) {
    responderJson(429, "{\"erro\":\"aguarde\"}");
    return;
  }
  jaAcionou = true;
  ultimoComando = agora;
  pulso(pino);
  responderJson(200, "{\"ok\":true}");
}

void rotaStatus() {
  if (!autorizar()) return;
  String corpo = "{\"estado\":\"";
  corpo += estadoAtual();
  corpo += "\",\"abrirFecharSeparados\":";
  corpo += ABRIR_FECHAR_SEPARADOS ? "true" : "false";
  corpo += "}";
  responderJson(200, corpo);
}

void configurarRotas() {
  servidor.on("/", HTTP_GET, [] { servidor.send_P(200, "text/html; charset=utf-8", PAGINA_HTML); });
  servidor.on("/manifest.json", HTTP_GET, [] { servidor.send_P(200, "application/manifest+json", MANIFEST_JSON); });
  servidor.on("/icon.svg", HTTP_GET, [] { servidor.send_P(200, "image/svg+xml", ICONE_SVG); });

  servidor.on("/api/status", HTTP_GET, rotaStatus);
#if ABRIR_FECHAR_SEPARADOS
  servidor.on("/api/abrir",   HTTP_POST, [] { comando(RELE_ABRIR_PINO); });
  servidor.on("/api/fechar",  HTTP_POST, [] { comando(RELE_FECHAR_PINO); });
  servidor.on("/api/acionar", HTTP_POST, [] { comando(RELE_ABRIR_PINO); });
#else
  servidor.on("/api/abrir",   HTTP_POST, [] { comando(RELE_ACIONAR_PINO); });
  servidor.on("/api/fechar",  HTTP_POST, [] { comando(RELE_ACIONAR_PINO); });
  servidor.on("/api/acionar", HTTP_POST, [] { comando(RELE_ACIONAR_PINO); });
#endif

  servidor.onNotFound([] { responderJson(404, "{\"erro\":\"nao encontrado\"}"); });

  const char* cabecalhos[] = {"X-Token"};
  servidor.collectHeaders(cabecalhos, 1);
}

// ---------- Wi-Fi ----------

void conectarWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.setHostname(NOME_MDNS);
  WiFi.begin(WIFI_SSID, WIFI_SENHA);
  Serial.print("Conectando ao Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\nConectado! IP: %s\n", WiFi.localIP().toString().c_str());
  if (MDNS.begin(NOME_MDNS)) {
    MDNS.addService("http", "tcp", 80);
    Serial.printf("Abra http://%s.local no celular\n", NOME_MDNS);
  }
}

void setup() {
  Serial.begin(115200);

#if ABRIR_FECHAR_SEPARADOS
  prepararRele(RELE_ABRIR_PINO);
  prepararRele(RELE_FECHAR_PINO);
#else
  prepararRele(RELE_ACIONAR_PINO);
#endif
  if (SENSOR_ABERTO_PINO  >= 0) pinMode(SENSOR_ABERTO_PINO,  INPUT_PULLUP);
  if (SENSOR_FECHADO_PINO >= 0) pinMode(SENSOR_FECHADO_PINO, INPUT_PULLUP);

  conectarWifi();
  configurarRotas();
  servidor.begin();
}

void loop() {
  servidor.handleClient();

  // Reconecta se o Wi-Fi cair.
  static unsigned long ultimaVerificacao = 0;
  if (millis() - ultimaVerificacao > 10000) {
    ultimaVerificacao = millis();
    if (WiFi.status() != WL_CONNECTED) WiFi.reconnect();
  }
}
