# DigitalControl

Plataforma de controle de acesso inteligente e automação de portões para
residências, condomínios e empresas.

```
 App (React)  ──HTTPS──▶  Supabase (Auth + Postgres/RLS)  ◀──HTTPS──  Equipamento (ESP32)
                               │                                   long-polling, sem abrir portas
                               └── Edge Function device-api ───────┘
```

## O que já funciona (etapa 1: núcleo)

| Área | Recursos |
|---|---|
| Autenticação | E-mail e senha, Google, cadastro, recuperação e troca de senha, encerrar sessões em outros aparelhos |
| Níveis de acesso | Super Admin, Admin (por organização), Titular e Morador, garantidos por RLS no banco |
| Clientes | Cadastro de empresas, condomínios e residenciais, administradores, suspensão de cliente |
| Residências | Cadastro, moradores, aprovação, bloqueio, permissões por portão, convites por código e QR Code |
| Portões e dispositivos | Cadastro com credencial própria, vários portões por equipamento (relés), pulso ou abrir/fechar, online/offline, diagnóstico |
| Acionamento | Comando real enviado ao equipamento, confirmação de execução, estado do portão (com sensor), limite de repetição |
| Chaves temporárias | Validade, horários, dias da semana, limite de usos, revogação, link/QR para visitante sem conta, registro de uso |
| Auditoria | Histórico de todas as alterações, falhas, tentativas negadas e credenciais inválidas; exportação CSV de acionamentos |
| Visual | Tema claro/escuro, responsivo (celular, tablet, computador), instalável na tela inicial |

**Próximas etapas:** comunicados e notificações, relatórios por período,
planos/contratos, drivers MQTT e de outros fabricantes.

## Estrutura

```
web/                         App React + TypeScript + Tailwind
supabase/migrations/         Banco: tabelas, RLS, funções (já aplicado no projeto)
supabase/functions/device-api/  API dos equipamentos (já publicada)
supabase/tests/              Testes de permissão (rodam num Postgres local)
firmware/digitalcontrol-esp32/  Firmware do ESP32
tools/simulador-dispositivo.mjs Simula um equipamento real para testes
```

## Colocando no ar

### 1. Primeiro acesso (Super Admin)
O **primeiro usuário cadastrado** vira Super Admin automaticamente. Crie a sua
conta antes de divulgar o app.

### 2. Configurações do Supabase (painel)
Em **Authentication → URL Configuration**:
- **Site URL**: o endereço onde o app ficará (ex.: `https://app.digitalcontrol.com.br`).
- **Redirect URLs**: adicione `https://SEU-DOMINIO/**` e `http://localhost:5173/**`.

Para **Login com Google**: em **Authentication → Providers → Google**, ative e
cole o *Client ID* e *Client Secret* criados no Google Cloud Console
(OAuth, tipo "Aplicativo da Web", com a URL de callback que o Supabase mostra).

Recomendado para produção: configurar um SMTP próprio em
**Authentication → Emails** (o envio padrão do Supabase tem limite baixo).

### 3. Publicar o app
```bash
cd web
npm install
npm run build        # gera web/dist
```
Funciona em Vercel, Netlify ou qualquer hospedagem estática (já inclui
`vercel.json` e `_redirects`). Configure as variáveis do arquivo `web/.env`.

Para desenvolver localmente: `npm run dev` e abra http://localhost:5173.

### 4. Fluxo de uso
1. **Super Admin** → Clientes → cria o cliente e adiciona o administrador (pelo e-mail).
2. **Admin** → Portões e dispositivos → cadastra o equipamento (recebe as credenciais) e os portões.
3. **Admin** → Residências → cria a residência, vincula os portões e gera um convite de **Titular**.
4. **Titular** → entra com o convite, convida **Moradores**, aprova e define permissões.
5. Titular cria **chaves temporárias** para visitantes.

## Equipamento (ESP32)

Ligação: cada relé do módulo vai nos bornes de **botoeira** da central do
portão (contato seco, baixa tensão). Nunca ligue o relé na rede de 127/220 V.

1. Arduino IDE com a placa **esp32 (Espressif)** e a biblioteca **ArduinoJson 7**.
2. Copie `firmware/digitalcontrol-esp32/config.exemplo.h` para `config.h`,
   preencha o Wi-Fi e cole as 3 linhas de credenciais mostradas no painel.
3. Carregue `digitalcontrol-esp32.ino`. No Monitor Serial (115200) aparecem
   as conexões e os comandos recebidos.

Pinos padrão dos relés: 26, 27, 25, 33 (canais 1 a 4). Sensores de
aberto/fechado são opcionais.

### Testar sem hardware
Cadastre um dispositivo no painel e rode, com as credenciais exibidas:
```bash
DC_API_URL=... DC_DEVICE_ID=... DC_SECRET=... node tools/simulador-dispositivo.mjs
```
O simulador se conecta à API real, recebe os comandos e confirma a execução.

### Protocolo (para novos fabricantes)
`POST {DC_API_URL}/poll` e `POST {DC_API_URL}/ack` com os cabeçalhos
`X-Device-Id` e `Authorization: Device <segredo>`. Detalhes em
`supabase/functions/device-api/index.ts`. Novos tipos de equipamento entram
como linhas na tabela `device_drivers`.

## Segurança

- RLS em todas as tabelas; cada cliente só vê os próprios dados.
- Comandos só são criados por funções no servidor que verificam a permissão.
- Segredos dos equipamentos guardados como hash, numa tabela inacessível ao app.
- HTTPS com validação de certificado no firmware.
- Auditoria automática de alterações e de atividades suspeitas.

Testes de permissão (46 verificações), num Postgres local:
```bash
PGHOST=... PGPORT=... PGUSER=postgres supabase/tests/rodar.sh
```
