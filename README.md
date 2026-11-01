# Portão Wi-Fi

App para abrir e fechar o portão pelo celular.

Um **ESP32** com **módulo relé** é ligado à entrada de botoeira da central do
portão. O ESP32 se conecta ao Wi-Fi da casa e entrega o próprio app. Basta abrir
`http://portao.local` no celular e escolher **"Adicionar à tela inicial"** para
ele virar um ícone igual a um app comum.

```
Celular (app)  ──Wi-Fi──▶  ESP32  ──▶  Relé  ──▶  Central do portão (botoeira)
```

## Materiais

| Item | Observação |
|---|---|
| ESP32 DevKit | qualquer modelo com Wi-Fi |
| Módulo relé 1 canal 5 V | 2 canais se a central tiver entradas separadas para abrir e fechar |
| Fonte 5 V | muitas centrais já têm saída 12 V/24 V; nesse caso use um conversor step-down |
| Reed switch / fim de curso (opcional) | para o app mostrar se o portão está aberto ou fechado |

## Ligação

```
ESP32 GPIO26 ──▶ IN  do relé
ESP32 5V/VIN ──▶ VCC do relé
ESP32 GND    ──▶ GND do relé

Relé COM ──┐
           ├──▶ bornes "BOTOEIRA" (ou "BOT"/"PUL") da central do portão
Relé NA  ──┘    (os mesmos onde ficaria um botão de interfone)

Sensor (opcional): GPIO32 ── reed switch ── GND
```

> ⚠️ Nunca ligue o relé na alimentação de 127/220 V do motor. Os contatos do
> relé só substituem o **botão** da central, que é um sinal de baixa tensão.
> Se tiver dúvida, peça a um eletricista ou técnico de portões.

## Instalação do firmware

1. Instale o [Arduino IDE](https://www.arduino.cc/en/software) e adicione o
   suporte ao ESP32 (Gerenciador de Placas → "esp32" da Espressif).
2. Copie `firmware/portao/config.exemplo.h` para `firmware/portao/config.h` e
   preencha:
   - `WIFI_SSID` e `WIFI_SENHA`: sua rede Wi-Fi
   - `TOKEN_ACESSO`: a senha que o app vai pedir (use uma senha forte)
   - `ABRIR_FECHAR_SEPARADOS`: `1` só se sua central tiver entradas separadas
   - `SENSOR_*_PINO`: o pino do sensor, se você instalou um
3. Abra `firmware/portao/portao.ino`, selecione a placa "ESP32 Dev Module" e
   clique em **Carregar**.
4. No Monitor Serial (115200) aparece o IP. No celular, conectado ao mesmo
   Wi-Fi, abra `http://portao.local` (ou o IP), digite a senha e pronto.

## Usando o app

- **Acionar portão**: envia um pulso na botoeira (abre, para ou fecha, como o
  controle remoto).
- **Abrir / Fechar**: aparecem no lugar de "Acionar" quando a central tem
  entradas separadas.
- **Estado**: mostra Aberto / Fechado / Em movimento se houver sensores.
- ⚙️: muda a senha ou o endereço do dispositivo.

## Testar sem hardware

```bash
python3 tools/simulador.py
```

Abra http://localhost:8080 e use a senha `teste`. O simulador imita o portão
abrindo e fechando.

## Alterando o app

O app fica em `app/`. Depois de editar, gere de novo o arquivo que vai dentro
do firmware:

```bash
python3 tools/gerar_header.py
```

## Segurança

- Todo comando exige a senha (`X-Token`). Sem ela o ESP32 responde 401.
- Há um intervalo mínimo entre comandos para evitar acionamentos repetidos.
- O acesso é só pela rede local. **Não** abra a porta do ESP32 no roteador:
  a conexão é HTTP sem criptografia. Para acesso fora de casa, use uma VPN
  (por exemplo Tailscale ou WireGuard no roteador).

## Estrutura

```
app/                     app (página web instalável)
firmware/portao/         código do ESP32 (Arduino)
  portao.ino
  config.exemplo.h       modelo de configuração
  pagina.h               app embutido (gerado)
tools/
  gerar_header.py        gera pagina.h a partir de app/
  simulador.py           simula o ESP32 no computador
```
