-- Tentativa de fechar o pg_net (chamadas HTTP saindo do banco) para anônimos e usuários comuns.
--
-- RESULTADO: sem efeito. As permissões do esquema "net" pertencem ao supabase_admin
-- (padrão de todo projeto Supabase) e o usuário "postgres" não pode retirá-las.
-- Mitigação: o esquema "net" NÃO é exposto pela API (Project Settings → Data API →
-- Exposed schemas deve conter apenas public e graphql_public). Sem isso, não há caminho
-- pela internet até essas funções. Confira esse ajuste no painel do Supabase de tempos
-- em tempos (o SQL não consegue ler essa configuração).
revoke usage on schema net from public, anon, authenticated;
revoke execute on all functions in schema net from public, anon, authenticated;
