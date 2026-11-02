// Copie este arquivo para "config.h" (mesma pasta) e preencha.
// O config.h fica fora do git: ele contém o segredo do dispositivo.
#pragma once

// ---------- Wi-Fi ----------
#define WIFI_SSID   "NomeDaRede"
#define WIFI_SENHA  "SenhaDoWifi"

// ---------- DigitalControl ----------
// Copie estas 3 linhas da tela "Credenciais" que aparece ao cadastrar o
// dispositivo em Portões e dispositivos (ou ao gerar um novo segredo).
#define DC_API_URL    "https://SEU-PROJETO.supabase.co/functions/v1/device-api"
#define DC_DEVICE_ID  "00000000-0000-0000-0000-000000000000"
#define DC_SECRET     "cole-aqui-o-segredo"

// ---------- Relés ----------
// Pino de cada relé, na ordem dos canais (Relé 1, Relé 2, ...).
// No painel, cada portão aponta para um canal.
// Portão "abrir e fechar separados" no canal N usa o relé N para abrir e N+1 para fechar.
#define RELE_PINOS          { 26, 27, 25, 33 }
#define RELE_ATIVO_EM_BAIXO 1   // módulos de relé comuns ligam com nível LOW

// ---------- Sensores de estado (opcional) ----------
// Reed switch / fim de curso entre o pino e o GND, um par por canal.
// Use -1 quando não houver sensor.
#define SENSOR_ABERTO_PINOS  { -1, -1, -1, -1 }
#define SENSOR_FECHADO_PINOS { -1, -1, -1, -1 }
