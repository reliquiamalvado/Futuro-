# Guia de montagem e instalação — ESP32 AuggeControl

## 1. Lista de compras

| Item | Quantidade | Observação | Preço aprox. |
|---|---|---|---|
| **ESP32 DevKit V1 (30 ou 38 pinos)** | 1 | Placa com Wi-Fi. Evite "ESP32-CAM" e "ESP8266". | R$ 35–50 |
| **Módulo relé 5 V com optoacoplador** | 1 (1 canal) ou 2 canais | 2 canais se a central tiver abrir/fechar separados, ou para 2 portões | R$ 10–20 |
| **Fonte 5 V 2 A** (USB ou de parafuso) | 1 | Ou um **conversor step-down** (LM2596 / Mini-360) se for usar os 12/24 V da central | R$ 15–30 |
| **Cabo USB de dados** | 1 | Para gravar o firmware (alguns cabos só carregam!) | — |
| **Jumpers fêmea-fêmea** | 6 | Para ligar ESP32 ↔ relé | R$ 5 |
| **Caixa plástica (patola / passagem)** | 1 | Para proteger da chuva | R$ 10–20 |
| *Opcional:* **sensor magnético com fio** (reed switch de alarme) | 1 por portão | Mostra no app se o portão está aberto/fechado | R$ 10–15 |

Total: **cerca de R$ 80–130** por portão.

> O Wi-Fi do ESP32 é **2,4 GHz**. Redes só 5 GHz não funcionam.

## 2. Ligação

```
ESP32                 Módulo relé
VIN (5 V) ──────────▶ VCC
GND       ──────────▶ GND
GPIO 26   ──────────▶ IN1   (portão no "Relé 1")
GPIO 27   ──────────▶ IN2   (opcional: "Relé 2")

Módulo relé (saída)        Central do portão
COM ─────────────────────▶ borne BOTOEIRA / BOT / PUL
NA (NO) ─────────────────▶ borne COMUM / GND da botoeira

Sensor (opcional): um fio no GPIO 32, outro no GND do ESP32
```

- Use os bornes **COM** e **NA** (normalmente aberto) do relé — nunca o NF.
- Os bornes de botoeira são os mesmos onde ficaria um botão de interfone ou o receptor externo.
  No manual da central eles aparecem como **BOT, BOTOEIRA, PUL, PB, START** ou **AUX**.
- ⚠️ **Nunca** ligue o relé na rede 127/220 V do motor. Os contatos do relé só substituem o **botão**
  (sinal de baixa tensão). Na dúvida, chame um técnico de portões.

## 3. Cadastro no app

1. **Portões e dispositivos → Novo dispositivo**: dê um nome (ex.: "ESP32 garagem").
2. Aparecem **3 linhas de credenciais** — **copie e guarde** (o segredo não aparece de novo).
3. **Novo portão** (ou "+ Portão" dentro do dispositivo): escolha o equipamento, **Relé 1**, tipo **Pulso**.
4. Em condomínio: em **Residências**, use **Vincular portões** para liberar o portão às unidades
   (em casa comum isso é automático).

## 4. Gravar o firmware

1. Instale o **Arduino IDE 2** (arduino.cc/en/software).
2. **Arquivo → Preferências → URLs adicionais de gerenciadores de placas**, cole:
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
3. **Ferramentas → Placa → Gerenciador de placas**: instale **"esp32" da Espressif**.
4. **Ferramentas → Gerenciar bibliotecas**: instale **"ArduinoJson" de Benoit Blanchon (versão 7)**.
5. Na pasta `firmware/auggecontrol-esp32/`, copie `config.exemplo.h` para **`config.h`** e preencha:
   - `WIFI_SSID` e `WIFI_SENHA` (rede 2,4 GHz)
   - as **3 linhas** copiadas no passo 3.2 (`DC_API_URL`, `DC_DEVICE_ID`, `DC_SECRET`)
   - se usar sensor: `SENSOR_FECHADO_PINOS { 32, -1, -1, -1 }`
6. Abra `auggecontrol-esp32.ino`, escolha **Ferramentas → Placa → ESP32 Dev Module** e a **Porta** (COM / ttyUSB).
7. Clique em **Carregar (→)**. Se ficar em "Connecting....", **segure o botão BOOT** da placa até começar.

## 5. Primeiro teste (na bancada, antes de ligar no portão)

1. Abra **Ferramentas → Monitor Serial** em **115200**. O esperado:
   ```
   AuggeControl ESP32 v1.0.0
   Conectando ao Wi-Fi "SuaRede"....
   Wi-Fi conectado. IP 192.168.0.42, sinal -55 dBm
   Sincronizando relógio... ok
   ```
2. Em até 30 s o dispositivo fica **Online** no app.
3. No app, toque em **Acionar** (com a senha de abertura ou digital). O relé deve dar **um clique**
   e o Monitor Serial mostra `Comando ...: pulso no canal 1`. No app aparece **"Comando executado"**.
4. Só depois disso ligue o relé na central e teste com o portão.

## 6. Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Não conecta no Wi-Fi | Rede 5 GHz, senha errada ou sinal fraco (aproxime o roteador / use repetidor) |
| "Credenciais recusadas" | `DC_DEVICE_ID` / `DC_SECRET` errados — gere um novo segredo no app e grave de novo |
| "HTTP -1" repetido | Relógio não sincronizou ou rede bloqueia HTTPS; confira a internet |
| Relé não clica | Fio no pino errado; teste `RELE_ATIVO_EM_BAIXO` como `0` |
| Relé clica mas portão não mexe | Fios na botoeira errada ou usando NF em vez de NA |
| Portão abre e fecha sozinho / repete | Pulso longo demais: diminua a duração no cadastro do portão |
| Dispositivo fica offline às vezes | Sinal Wi-Fi fraco (veja "Sinal" no diagnóstico do app; abaixo de −80 dBm é ruim) |
