# Segurança do AuggeControl

## Como os dados são protegidos

| Camada | Proteção |
|---|---|
| **Banco (Postgres)** | RLS em 100% das tabelas; cada cliente só vê os próprios dados. Comandos, convites, chaves e cadastros sensíveis passam por funções que validam permissão no servidor. Auditoria imutável (ninguém apaga). Objetos criados no futuro nascem fechados. |
| **Login** | Supabase Auth (senha com hash, Google OAuth). **2FA (TOTP)**, obrigatória para Super Admin e exigida pelo banco para quem a ativou. Sair de outros aparelhos. |
| **Equipamentos** | Segredo de 192 bits por equipamento, guardado só como hash (SHA-256). HTTPS com certificado validado no ESP32. IP bloqueado por 10 min após 20 credenciais erradas. |
| **Funções na nuvem** | `device-api`: autenticação própria + bloqueio de força bruta. `notify-admin`: só aceita chamadas do banco (segredo no Vault, nunca exposto). |
| **Site** | CSP (só scripts do próprio site), HSTS, anti-clickjacking, `no-referrer` (links de chave/convite não vazam), redirecionamentos só para páginas internas. |
| **Abrir portão** | Toda abertura/fechamento exige **digital, rosto (WebAuthn/passkey) ou senha de abertura**, conferida no servidor. Senha só como hash bcrypt; 5 erros bloqueiam 15 min. Criar/trocar senha ou cadastrar biometria exige login recente (≤ 10 min) ou a senha atual — celular roubado com o app aberto não abre o portão. Biometria nunca sai do aparelho; o servidor confere a assinatura e emite um tíquete de uso único (60 s). |
| **Abuso** | Limites: 1 comando a cada 2 s por portão, 10 convites inválidos/hora, registros de falha limitados. |

## Chaves e segredos

| Chave | Onde fica | Pode ser pública? |
|---|---|---|
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `web/.env` (no Git) | **Sim.** Feita para o navegador; quem protege os dados é o RLS. |
| `service_role` / chaves secretas do Supabase | Só nas Edge Functions (variável automática do Supabase) | **Nunca.** Não colocar no app, no Git nem em prints. |
| Segredo de cada equipamento | `config.h` no ESP32 (fora do Git) e hash no banco | Nunca. Renove em "Portões e dispositivos" se vazar. |
| Segredo das notificações | Vault do Supabase | Nunca sai do banco. |
| Client Secret do Google | Painel do Supabase | Nunca. |

## Testes

1. **Permissões (local, 124 verificações):** `PGHOST=... PGPORT=... PGUSER=postgres supabase/tests/rodar.sh`
2. **Auditoria em produção (38 verificações, não grava nada):** cole `supabase/tests/auditoria_producao.sql`
   no SQL Editor do Supabase e rode. Tudo deve sair ✅.
3. **Biometria (12 verificações, autenticador virtual):** `supabase/tests/biometria/rodar.sh`
4. **Dependências:** `cd web && npm audit` (deve dar 0 vulnerabilidades).
5. **Analisador do Supabase:** Advisors → Security.

## Riscos aceitos (conhecidos)

- **Biometria e domínio**: digitais/rostos ficam ligados ao domínio do app. Ao trocar o endereço
  (ex.: domínio próprio), cada pessoa cadastra a biometria de novo e é preciso atualizar
  `APP_ORIGINS` na função `unlock` (Edge Functions → Secrets). A senha de abertura continua valendo.

- **pg_net**: as funções de chamada HTTP do banco são liberadas pelo próprio Supabase e não podem ser
  fechadas pelo usuário `postgres`. Não são alcançáveis pela internet porque o esquema `net` não é
  exposto pela API. **Nunca adicione `net` em Project Settings → Data API → Exposed schemas.**
- **Links de chave temporária** ficam guardados para o titular poder reenviar. Quem tiver o link usa a
  chave dentro do período: revogue se for enviado à pessoa errada.

## Checklist do responsável (painéis)

- [ ] 2FA ativa na conta de Super Admin do app
- [ ] Client Secret do Google renovado (o anterior apareceu em um print)
- [ ] Supabase → Authentication: proteção contra senhas vazadas, senha mínima de 8 com letras e números, confirmação de e-mail ligada
- [ ] 2FA ativa nas contas de Supabase, Vercel, GitHub e Google
- [ ] Supabase → Data API: esquemas expostos apenas `public` e `graphql_public`
- [ ] Backups: no plano Pro, ativar backups diários / Point-in-time recovery
