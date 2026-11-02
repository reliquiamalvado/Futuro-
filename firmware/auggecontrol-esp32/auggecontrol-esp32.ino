// AuggeControl - firmware para ESP32 + relé.
//
// Não é preciso editar código:
//  1. Grave pelo navegador (página "Instalar equipamento" do app).
//  2. Na primeira vez, o ESP32 cria a rede Wi-Fi "AuggeControl-XXXX".
//     Conecte o celular nela: abre uma página para escolher o Wi-Fi da casa
//     e digitar o código de pareamento mostrado no app.
//  3. Pronto: o equipamento conecta na nuvem e recebe comandos (HTTPS, long-polling).
//
// Para refazer a configuração: segure o botão BOOT da placa por 5 segundos.
//
// Bibliotecas: placa "esp32" da Espressif (3.x) e ArduinoJson 7.x.

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <time.h>

#include "certificados.h"

#if __has_include("config.h")
#include "config.h"   // opcional: só para desenvolvimento (outra URL de API etc.)
#endif

#ifndef DC_API_URL
#define DC_API_URL "https://miqjabshccauhvzcqzle.supabase.co/functions/v1/device-api"
#endif

#define FIRMWARE_VERSAO "2.0.0"
#define PINO_BOOT 0              // botão BOOT das placas ESP32
#define MAX_RELES 4

Preferences prefs;
WiFiClientSecure tls;
WebServer portal(80);
DNSServer dns;

struct Config {
  String ssid, senha, deviceId, segredo;
  int reles[MAX_RELES] = {26, 27, 25, 33};
  int sensorFechado[MAX_RELES] = {-1, -1, -1, -1};
  bool ativoEmBaixo = true;
} cfg;

bool modoConfiguracao = false;
unsigned long esperaErro = 2000;
int falhas401 = 0;

// ------------------------------------------------------------- configuração salva

void lerLista(const String& texto, int* destino, int padrao) {
  for (int i = 0; i < MAX_RELES; i++) destino[i] = padrao;
  int i = 0, ini = 0;
  while (i < MAX_RELES && ini <= (int)texto.length()) {
    int fim = texto.indexOf(',', ini);
    if (fim < 0) fim = texto.length();
    String parte = texto.substring(ini, fim);
    parte.trim();
    if (parte.length()) destino[i] = parte.toInt();
    i++;
    ini = fim + 1;
  }
}

void carregarConfig() {
  prefs.begin("augge", true);
  cfg.ssid = prefs.getString("ssid", "");
  cfg.senha = prefs.getString("senha", "");
  cfg.deviceId = prefs.getString("dev", "");
  cfg.segredo = prefs.getString("seg", "");
  cfg.ativoEmBaixo = prefs.getBool("baixo", true);
  String reles = prefs.getString("reles", "26,27,25,33");
  String sens = prefs.getString("sensF", "-1,-1,-1,-1");
  prefs.end();
  lerLista(reles, cfg.reles, -1);
  lerLista(sens, cfg.sensorFechado, -1);
}

void apagarConfig() {
  prefs.begin("augge", false);
  prefs.clear();
  prefs.end();
}

// ------------------------------------------------------------- relés e sensores

int nivelLigado() { return cfg.ativoEmBaixo ? LOW : HIGH; }
int nivelDesligado() { return cfg.ativoEmBaixo ? HIGH : LOW; }

void prepararPinos() {
  for (int i = 0; i < MAX_RELES; i++) {
    if (cfg.reles[i] < 0) continue;
    digitalWrite(cfg.reles[i], nivelDesligado());  // nível seguro antes de virar saída
    pinMode(cfg.reles[i], OUTPUT);
  }
  for (int i = 0; i < MAX_RELES; i++)
    if (cfg.sensorFechado[i] >= 0) pinMode(cfg.sensorFechado[i], INPUT_PULLUP);
  pinMode(PINO_BOOT, INPUT_PULLUP);
}

bool pulso(int canal, int ms) {
  if (canal < 1 || canal > MAX_RELES || cfg.reles[canal - 1] < 0) return false;
  int pino = cfg.reles[canal - 1];
  digitalWrite(pino, nivelLigado());
  delay(constrain(ms, 100, 10000));
  digitalWrite(pino, nivelDesligado());
  return true;
}

void preencherEstados(JsonObject estados) {
  for (int i = 0; i < MAX_RELES; i++) {
    int f = cfg.sensorFechado[i];
    if (f < 0) continue;
    estados[String(i + 1)] = digitalRead(f) == LOW ? "fechado" : "aberto";
  }
}

// Segurar BOOT por 5 s apaga a configuração e volta ao modo de configuração.
void verificarBotaoReset() {
  if (digitalRead(PINO_BOOT) != LOW) return;
  unsigned long inicio = millis();
  while (digitalRead(PINO_BOOT) == LOW) {
    if (millis() - inicio > 5000) {
      Serial.println("Botão BOOT por 5 s: apagando configuração...");
      apagarConfig();
      delay(300);
      ESP.restart();
    }
    delay(20);
  }
}

// ------------------------------------------------------------- rede e nuvem

bool conectarWifi(const String& ssid, const String& senha, unsigned long limiteMs) {
  WiFi.begin(ssid.c_str(), senha.c_str());
  unsigned long inicio = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - inicio < limiteMs) {
    delay(300);
    Serial.print(".");
  }
  Serial.println();
  return WiFi.status() == WL_CONNECTED;
}

void sincronizarRelogio() {
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  time_t agora = time(nullptr);
  unsigned long inicio = millis();
  while (agora < 1700000000 && millis() - inicio < 20000) {
    delay(300);
    agora = time(nullptr);
  }
  Serial.println(agora >= 1700000000 ? "Relógio sincronizado" : "Relógio não sincronizou (tentando mesmo assim)");
}

// POST na API. Retorna o código HTTP (negativo em erro de conexão).
int postar(const char* rota, const String& corpo, String& resposta, uint16_t timeoutMs, bool autenticar) {
  HTTPClient http;
  String url = String(DC_API_URL) + "/" + rota;
  if (!http.begin(tls, url)) return -1;
  http.setTimeout(timeoutMs);
  http.setConnectTimeout(10000);
  http.addHeader("Content-Type", "application/json");
  if (autenticar) {
    http.addHeader("X-Device-Id", cfg.deviceId);
    http.addHeader("Authorization", String("Device ") + cfg.segredo);
  }
  int codigo = http.POST(corpo);
  if (codigo > 0) resposta = http.getString();
  http.end();
  return codigo;
}

// ------------------------------------------------------------- modo configuração (portal)

String nomeRede() {
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char s[24];
  snprintf(s, sizeof(s), "AuggeControl-%02X%02X", mac[4], mac[5]);
  return String(s);
}

String escapar(const String& t) {
  String o;
  for (size_t i = 0; i < t.length(); i++) {
    char c = t[i];
    if (c == '&') o += "&amp;"; else if (c == '<') o += "&lt;"; else if (c == '>') o += "&gt;";
    else if (c == '"') o += "&quot;"; else o += c;
  }
  return o;
}

const char ESTILO[] PROGMEM = R"CSS(
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:system-ui,-apple-system,sans-serif;background:#0a0f1e;color:#f1f5f9;margin:0;padding:20px}
.c{max-width:420px;margin:auto;background:#141d33;border-radius:18px;padding:22px}
h1{font-size:22px;margin:0 0 4px}h1 b{color:#2f7bff}p{color:#94a3b8;font-size:14px}
label{display:block;margin:16px 0 6px;font-size:14px;color:#cbd5e1}
input,select{width:100%;box-sizing:border-box;padding:13px;border-radius:12px;border:1px solid #1e2a45;background:#0a0f1e;color:#fff;font-size:16px}
button{margin-top:22px;width:100%;padding:15px;border:0;border-radius:14px;background:#2f7bff;color:#fff;font-size:17px;font-weight:600}
.e{background:#7f1d1d;color:#fecaca;padding:12px;border-radius:12px;margin-top:14px}
.ok{background:#14532d;color:#bbf7d0;padding:12px;border-radius:12px}
details{margin-top:18px;color:#94a3b8;font-size:14px}
</style>)CSS";

void paginaInicial(const String& erro = "") {
  int n = WiFi.scanNetworks();
  String redes;
  for (int i = 0; i < n; i++) {
    String s = WiFi.SSID(i);
    if (!s.length() || redes.indexOf(">" + escapar(s) + "<") >= 0) continue;
    redes += "<option value=\"" + escapar(s) + "\">" + escapar(s) + "</option>";
  }
  String h = "<!doctype html><html lang=pt-BR><head><meta charset=utf-8><title>AuggeControl</title>";
  h += FPSTR(ESTILO);
  h += "</head><body><div class=c><h1>Augge<b>Control</b></h1><p>Configuração do equipamento</p>";
  if (erro.length()) h += "<div class=e>" + escapar(erro) + "</div>";
  h += "<form method=post action=/salvar>";
  h += "<label>Wi-Fi da casa (2,4 GHz)</label><select name=ssid>" + redes + "<option value=\"\">Outra rede (digitar)</option></select>";
  h += "<input name=ssid2 placeholder=\"Ou digite o nome da rede\" style=margin-top:8px>";
  h += "<label>Senha do Wi-Fi</label><input name=senha type=password autocomplete=off>";
  h += "<label>Código de pareamento (aparece no app)</label><input name=codigo maxlength=8 required autocapitalize=characters placeholder=\"EX: K7M2Q9XA\" style=\"text-transform:uppercase;letter-spacing:4px;font-family:monospace\">";
  h += "<details><summary>Opções do instalador</summary>";
  h += "<label>Pinos dos relés (GPIO, separados por vírgula)</label><input name=reles value=\"26,27,25,33\">";
  h += "<label>Pinos dos sensores de fechado (-1 = sem sensor)</label><input name=sensF value=\"-1,-1,-1,-1\">";
  h += "<label>Relé liga com</label><select name=baixo><option value=1>Nível baixo (módulos comuns)</option><option value=0>Nível alto</option></select>";
  h += "</details><button>Conectar</button></form></div></body></html>";
  portal.send(200, "text/html; charset=utf-8", h);
}

void paginaResultado(bool ok, const String& texto) {
  String h = "<!doctype html><html lang=pt-BR><head><meta charset=utf-8><title>AuggeControl</title>";
  h += FPSTR(ESTILO);
  h += "</head><body><div class=c><h1>Augge<b>Control</b></h1>";
  h += ok ? "<div class=ok>" : "<div class=e>";
  h += escapar(texto) + "</div>";
  if (!ok) h += "<p><a href=/ style=color:#5b97ff>Tentar de novo</a></p>";
  h += "</div></body></html>";
  portal.send(200, "text/html; charset=utf-8", h);
}

void salvarConfiguracao() {
  String ssid = portal.arg("ssid2").length() ? portal.arg("ssid2") : portal.arg("ssid");
  String senha = portal.arg("senha");
  String codigo = portal.arg("codigo");
  codigo.trim();
  codigo.toUpperCase();
  if (!ssid.length()) return paginaInicial("Escolha ou digite o nome do Wi-Fi.");
  if (codigo.length() != 8) return paginaInicial("O código de pareamento tem 8 caracteres.");

  Serial.printf("Testando Wi-Fi \"%s\"", ssid.c_str());
  if (!conectarWifi(ssid, senha, 20000)) {
    WiFi.disconnect(false, false);
    return paginaInicial("Não conectou nesse Wi-Fi. Confira a senha e se a rede é 2,4 GHz.");
  }
  sincronizarRelogio();

  String resposta;
  JsonDocument req;
  req["code"] = codigo;
  String corpo;
  serializeJson(req, corpo);
  int http = postar("pair", corpo, resposta, 15000, false);
  JsonDocument doc;
  if (http != 200 || deserializeJson(doc, resposta) || !doc["device_id"].is<const char*>()) {
    String motivo = http == 400 ? "Código inválido ou expirado. Gere um novo código no app."
                  : http == 429 ? "Muitas tentativas. Aguarde 10 minutos."
                  : "Sem resposta da nuvem (HTTP " + String(http) + "). Confira a internet.";
    return paginaInicial(motivo);
  }

  prefs.begin("augge", false);
  prefs.putString("ssid", ssid);
  prefs.putString("senha", senha);
  prefs.putString("dev", doc["device_id"].as<const char*>());
  prefs.putString("seg", doc["secret"].as<const char*>());
  prefs.putString("reles", portal.arg("reles").length() ? portal.arg("reles") : "26,27,25,33");
  prefs.putString("sensF", portal.arg("sensF").length() ? portal.arg("sensF") : "-1,-1,-1,-1");
  prefs.putBool("baixo", portal.arg("baixo") != "0");
  prefs.end();

  paginaResultado(true, "Pronto! Equipamento conectado. Pode voltar para o app: em alguns segundos ele aparece como Online.");
  delay(2500);
  ESP.restart();
}

void iniciarModoConfiguracao() {
  modoConfiguracao = true;
  String rede = nomeRede();
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(rede.c_str());
  dns.start(53, "*", WiFi.softAPIP());
  portal.on("/", HTTP_GET, []() { paginaInicial(); });
  portal.on("/salvar", HTTP_POST, salvarConfiguracao);
  // Celulares abrem a página sozinhos ao conectar na rede (portal cativo).
  portal.onNotFound([]() {
    portal.sendHeader("Location", "http://192.168.4.1/", true);
    portal.send(302, "text/plain", "");
  });
  portal.begin();
  Serial.printf("Modo configuração: conecte o celular na rede \"%s\"\n", rede.c_str());
}

// ------------------------------------------------------------- modo normal (nuvem)

void confirmar(const char* id, bool ok, const char* erro) {
  JsonDocument doc;
  doc["command_id"] = id;
  doc["success"] = ok;
  if (!ok && erro) doc["error"] = erro;
  preencherEstados(doc["states"].to<JsonObject>());
  String corpo, resposta;
  serializeJson(doc, corpo);
  for (int t = 0; t < 3; t++) {
    if (postar("ack", corpo, resposta, 10000, true) == 200) return;
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
  confirmar(id, ok, ok ? nullptr : "Relé não configurado neste canal");
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

  int codigo = postar("poll", corpo, resposta, 30000, true);
  if (codigo == 200) {
    esperaErro = 2000;
    falhas401 = 0;
    JsonDocument doc;
    if (!deserializeJson(doc, resposta))
      for (JsonObject cmd : doc["commands"].as<JsonArray>()) executar(cmd);
    return;
  }
  if (codigo == 401) {
    // Equipamento excluído ou pareado de novo em outro lugar: após 10 recusas, volta a pedir configuração.
    Serial.println("Credenciais recusadas.");
    if (++falhas401 >= 10) { apagarConfig(); ESP.restart(); }
    esperaErro = 30000;
  } else {
    Serial.printf("Erro ao falar com a nuvem (HTTP %d)\n", codigo);
    esperaErro = min<unsigned long>(esperaErro * 2, 30000);
  }
  unsigned long inicio = millis();
  while (millis() - inicio < esperaErro) { verificarBotaoReset(); delay(50); }
}

// ------------------------------------------------------------- principal

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.printf("\nAuggeControl ESP32 v%s\n", FIRMWARE_VERSAO);
  carregarConfig();
  prepararPinos();
  tls.setCACert(DC_ROOT_CA);

  if (!cfg.ssid.length() || !cfg.deviceId.length() || !cfg.segredo.length()) {
    iniciarModoConfiguracao();
    return;
  }

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  Serial.printf("Conectando ao Wi-Fi \"%s\"", cfg.ssid.c_str());
  if (!conectarWifi(cfg.ssid, cfg.senha, 30000)) {
    Serial.println("Sem Wi-Fi agora; vai tentando em segundo plano.");
  }
  sincronizarRelogio();
}

void loop() {
  verificarBotaoReset();
  if (modoConfiguracao) {
    dns.processNextRequest();
    portal.handleClient();
    return;
  }
  if (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    return;
  }
  ciclo();
}
