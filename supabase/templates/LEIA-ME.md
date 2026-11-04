# Modelos de e-mail do AuggeControl

Cole cada arquivo em **Supabase → Authentication → Emails → Templates**.

| Modelo no Supabase | Arquivo | Assunto |
|---|---|---|
| Reset Password | `redefinir-senha.html` | Crie uma nova senha · AuggeControl |
| Confirm signup | `confirmar-cadastro.html` | Confirme seu e-mail · AuggeControl |
| Magic Link | `link-magico.html` | Seu link de acesso · AuggeControl |
| Change Email Address | `trocar-email.html` | Confirme seu novo e-mail · AuggeControl |
| Invite user | `convite.html` | Você foi convidado · AuggeControl |

## Como colar
1. Supabase → **Authentication** → **Emails** → **Templates**.
2. Escolha o modelo (ex.: *Reset Password*), troque o **Subject** pelo assunto da tabela.
3. Em **Message body**, apague tudo e cole o conteúdo do arquivo `.html`. Salve.

## Remetente e entrega
O servidor de e-mail padrão do Supabase é só para testes (poucos e-mails por hora).
Para clientes reais, configure um SMTP próprio (ex.: Resend) com o domínio do app em
**Authentication → Emails → SMTP Settings**, com remetente "AuggeControl".
