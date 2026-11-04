// AuggeControl - confirmação de abertura com digital / rosto (WebAuthn).
//
// Rotas (todas POST, com o token do usuário logado):
//   /unlock/register-options  { pin? }                → opções para cadastrar a biometria
//   /unlock/register-verify   { response, device_name } → salva a credencial
//   /unlock/auth-options                               → desafio para confirmar
//   /unlock/open              { response, gate_id, action } → confere a biometria e aciona o portão
//   /unlock/verify            { response }          → confere a biometria e devolve um tíquete de 60 s
//
// Cadastrar biometria exige login recente (≤ 10 min) ou a senha de abertura,
// para que um celular roubado com o app aberto não cadastre a digital do ladrão.
import { createClient } from "@supabase/supabase-js";
import * as core from "./core.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORIGINS = (Deno.env.get("APP_ORIGINS") ??
  "https://auggecontrol.vercel.app,http://localhost:5173,http://localhost:4173").split(",").map((s) => s.trim());
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

const store: core.Store = {
  async credentials(userId) {
    const { data, error } = await admin.from("webauthn_credentials")
      .select("id, public_key, counter, transports").eq("user_id", userId);
    if (error) throw error;
    return (data ?? []) as core.StoredCredential[];
  },
  async saveChallenge(userId, kind, challenge) {
    const { error } = await admin.from("webauthn_challenges").upsert({
      user_id: userId, kind, challenge, expires_at: new Date(Date.now() + 2 * 60_000).toISOString(),
    });
    if (error) throw error;
  },
  async takeChallenge(userId, kind) {
    const { data, error } = await admin.from("webauthn_challenges").delete()
      .eq("user_id", userId).eq("kind", kind).gt("expires_at", new Date().toISOString())
      .select("challenge").maybeSingle();
    if (error) throw error;
    return (data?.challenge as string) ?? null;
  },
  async saveCredential(userId, c, deviceName) {
    const { error } = await admin.from("webauthn_credentials").insert({
      id: c.id, user_id: userId, public_key: c.public_key, counter: c.counter, transports: c.transports,
      device_name: deviceName,
    });
    if (error) throw error;
    await admin.from("audit_logs").insert({
      actor_id: userId, action: "abertura.biometria_cadastrada", entity: "profiles", entity_id: userId,
      severity: "alerta", details: { aparelho: deviceName },
    });
  },
  async updateCounter(id, counter) {
    await admin.from("webauthn_credentials")
      .update({ counter, last_used_at: new Date().toISOString() }).eq("id", id);
  },
};

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = { ...cors(origin), "Content-Type": "application/json", "Cache-Control": "no-store" };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return json(405, { erro: "use POST" });

  const rp = core.rpFromOrigin(origin, ORIGINS);
  if (!rp) return json(403, { erro: "origem não permitida" });

  // Usuário logado (o token é conferido pelo próprio Supabase Auth).
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: who } = await admin.auth.getUser(jwt);
  const user = who?.user;
  if (!user) return json(401, { erro: "não autenticado" });
  const asUser = createClient(URL_, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* sem corpo */ }
  const route = new URL(req.url).pathname.split("/").filter(Boolean).pop();

  try {
    if (route === "register-options") {
      const { data: m } = await asUser.rpc("my_unlock_methods");
      const methods = (m ?? {}) as { login_recente?: boolean; pin?: boolean };
      if (methods.login_recente !== true) {
        if (!methods.pin) {
          return json(403, { erro: "Por segurança, entre novamente na sua conta para cadastrar a biometria.", precisa: "reautenticar" });
        }
        const pin = typeof body.pin === "string" ? body.pin : "";
        if (!pin) return json(403, { erro: "Confirme com a sua senha de abertura para cadastrar a biometria.", precisa: "pin" });
        const { data: chk } = await admin.rpc("check_gate_pin", { p_user: user.id, p_pin: pin });
        if (chk !== "ok") {
          return json(403, {
            erro: chk === "bloqueado" ? "Senha de abertura bloqueada por 15 minutos." : "Senha de abertura incorreta.",
            precisa: "pin",
          });
        }
      }
      const opts = await core.registrationOptions(store, {
        id: user.id, email: user.email ?? user.id, name: (user.user_metadata?.full_name as string) ?? "",
      }, rp);
      return json(200, opts);
    }

    if (route === "register-verify") {
      const name = typeof body.device_name === "string" ? body.device_name.slice(0, 80) : null;
      const ok = await core.verifyRegistration(store, user.id, body.response, rp, name);
      return ok ? json(200, { ok: true }) : json(400, { erro: "Não foi possível confirmar a biometria. Tente de novo." });
    }

    if (route === "auth-options") {
      const opts = await core.authenticationOptions(store, user.id, rp);
      return opts ? json(200, opts) : json(404, { erro: "Nenhuma biometria cadastrada neste usuário." });
    }

    if (route === "open") {
      const gate = String(body.gate_id ?? "");
      const action = String(body.action ?? "");
      if (!UUID.test(gate) || !["abrir", "fechar", "pulso"].includes(action)) return json(400, { erro: "dados inválidos" });
      const ok = await core.verifyAuthentication(store, user.id, body.response, rp);
      if (!ok) {
        await admin.from("audit_logs").insert({
          actor_id: user.id, action: "acionamento.biometria_recusada", entity: "gates", entity_id: gate,
          severity: "alerta", details: {},
        });
        return json(403, { erro: "Biometria não confirmada." });
      }
      const { data: ticket, error: e1 } = await admin.rpc("issue_unlock_ticket", { p_user: user.id });
      if (e1) throw e1;
      const { data, error } = await asUser.rpc("request_gate_command", {
        p_gate: gate, p_action: action, p_pin: null, p_ticket: ticket,
      });
      if (error) throw error;
      return json(200, data);
    }

    // Só confere a biometria e devolve um tíquete de 60 s (ex.: criar nova senha de abertura).
    if (route === "verify") {
      const ok = await core.verifyAuthentication(store, user.id, body.response, rp);
      if (!ok) return json(403, { erro: "Biometria não confirmada." });
      const { data: ticket, error } = await admin.rpc("issue_unlock_ticket", { p_user: user.id });
      if (error) throw error;
      return json(200, { ticket });
    }

    return json(404, { erro: "rota não encontrada" });
  } catch (e) {
    console.error(e);
    return json(500, { erro: "erro interno" });
  }
});
