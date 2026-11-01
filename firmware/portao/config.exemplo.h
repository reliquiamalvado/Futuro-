// Copie este arquivo para "config.h" (na mesma pasta) e ajuste os valores.
// O config.h fica fora do git para não vazar a senha do Wi-Fi.
#pragma once

// ---------- Rede ----------
#define WIFI_SSID      "NomeDaSuaRede"
#define WIFI_SENHA     "SenhaDoWifi"
#define NOME_MDNS      "portao"          // app acessível em http://portao.local

// ---------- Segurança ----------
// Senha que o app envia em cada comando. Use algo longo e difícil de adivinhar.
#define TOKEN_ACESSO   "troque-esta-senha"

// ---------- Relés ----------
// A maioria das centrais de portão tem uma entrada de "botoeira": cada pulso
// alterna abrir / parar / fechar. Nesse caso use só RELE_ACIONAR_PINO.
//
// Se a sua central tiver entradas separadas para ABRIR e FECHAR, defina
// ABRIR_FECHAR_SEPARADOS como 1 e ligue um relé em cada entrada.
#define ABRIR_FECHAR_SEPARADOS 0

#define RELE_ACIONAR_PINO 26   // usado quando ABRIR_FECHAR_SEPARADOS == 0
#define RELE_ABRIR_PINO   26   // usados quando ABRIR_FECHAR_SEPARADOS == 1
#define RELE_FECHAR_PINO  27

// Módulos de relé baratos costumam ligar com nível BAIXO (LOW).
#define RELE_ATIVO_EM_BAIXO 1

// Tempo que o relé fica fechado, simulando o aperto do botão.
#define DURACAO_PULSO_MS 500

// Intervalo mínimo entre comandos (evita acionamentos repetidos sem querer).
#define INTERVALO_MIN_MS 1500

// ---------- Sensores (opcional) ----------
// Sensores de fim de curso / reed switch, ligados entre o pino e o GND.
// Use -1 para desativar. Sem sensores o estado aparece como "Desconhecido".
#define SENSOR_ABERTO_PINO  -1
#define SENSOR_FECHADO_PINO -1
