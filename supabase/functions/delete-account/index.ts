// AuggeControl - exclusão da própria conta (LGPD, art. 18, VI).
//
// POST /delete-account  { confirmacao: "EXCLUIR" }   (com o token do usuário logado)
// Regras: login recente (≤ 10 min), confirmação digitada e não deixar um local sem administrador.
// Apaga o usuário de auth.users; o banco apaga em cascata perfil, vínculos, senha de abertura e biometrias.
// O histórico de acionamentos permanece para o condomínio, mas sem o nome da pessoa (fica anônimo).
import { createClient } from "@supabase/supabase-js";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORIGINS = (Deno.env.get("APP_ORIGINS") ??
  "https://auggecontrol.vercel.app,http://localhost:5173,http://localhost:4173").split(",").map((s) => s.trim());

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });

function cors(origin: string | null) {
  const h: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
  if (origin && ORIGINS.includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return json({ erro: "Método não permitido." }, 405);

  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ erro: "Não autenticado." }, 401);
  const { data: who, error: whoErr } = await admin.auth.getUser(jwt);
  if (whoErr || !who?.user) return json({ erro: "Não autenticado." }, 401);
  const uid = who.user.id;

  let body: { confirmacao?: string } = {};
  try { body = await req.json(); } catch { /* corpo vazio */ }
  if (body.confirmacao !== "EXCLUIR") return json({ erro: 'Digite EXCLUIR para confirmar.' }, 400);

  const asUser = createClient(URL_, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: m } = await asUser.rpc("my_unlock_methods");
  if (!m?.login_recente) {
    return json({ erro: "Por segurança, entre novamente na sua conta e tente de novo em até 10 minutos.", reautenticar: true }, 403);
  }
  const { data: check } = await asUser.rpc("account_deletion_check");
  if (!check?.ok) return json({ erro: check?.erro ?? "Não foi possível excluir a conta." }, 409);

  await admin.from("audit_logs").insert({
    action: "conta.excluida", entity: "profiles", entity_id: uid, severity: "alerta", details: {},
  });
  const { error } = await admin.auth.admin.deleteUser(uid);
  if (error) return json({ erro: "Não foi possível excluir a conta agora. Tente de novo." }, 500);
  return json({ ok: true });
});
