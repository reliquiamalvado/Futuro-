// AuggeControl - entrega notificações ao dono da plataforma por WhatsApp.
//
// Chamada pelo banco (gatilho em admin_notifications) com { "id": "<uuid>" }.
// Só envia notificações ainda pendentes, então chamadas repetidas ou de
// terceiros não geram mensagens extras.
//
// Canais (configure os segredos em Edge Functions → Secrets):
//   CallMeBot (gratuito, para o seu próprio número):
//     CALLMEBOT_PHONE   ex.: 5511999998888
//     CALLMEBOT_APIKEY  chave recebida do CallMeBot
//   WhatsApp Cloud API oficial (Meta):
//     WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TO (ex.: 5511999998888)
//     WHATSAPP_TEMPLATE (opcional; modelo aprovado com 1 variável no corpo)
//     WHATSAPP_TEMPLATE_LANG (opcional, padrão pt_BR)
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const env = (k: string) => Deno.env.get(k)?.trim() || "";

const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function viaCallMeBot(text: string): Promise<void> {
  const url = new URL("https://api.callmebot.com/whatsapp.php");
  url.searchParams.set("phone", env("CALLMEBOT_PHONE"));
  url.searchParams.set("text", text);
  url.searchParams.set("apikey", env("CALLMEBOT_APIKEY"));
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const body = await r.text();
  if (!r.ok || /error|invalid|not allowed/i.test(body.slice(0, 500))) {
    throw new Error(`CallMeBot HTTP ${r.status}: ${body.replace(/<[^>]+>/g, " ").slice(0, 200).trim()}`);
  }
}

async function viaMeta(text: string): Promise<void> {
  const template = env("WHATSAPP_TEMPLATE");
  const payload = template
    ? {
        messaging_product: "whatsapp",
        to: env("WHATSAPP_TO"),
        type: "template",
        template: {
          name: template,
          language: { code: env("WHATSAPP_TEMPLATE_LANG") || "pt_BR" },
          components: [{ type: "body", parameters: [{ type: "text", text: text.replace(/\n+/g, " | ") }] }],
        },
      }
    : { messaging_product: "whatsapp", to: env("WHATSAPP_TO"), type: "text", text: { body: text } };

  const r = await fetch(`https://graph.facebook.com/v21.0/${env("WHATSAPP_PHONE_NUMBER_ID")}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env("WHATSAPP_TOKEN")}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`WhatsApp API HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "use POST" });
  let id = "";
  try {
    id = String((await req.json())?.id ?? "");
  } catch { /* corpo inválido */ }
  if (!UUID.test(id)) return json(400, { error: "id inválido" });

  // Reserva a notificação (evita envio duplicado).
  const { data: n, error } = await db
    .from("admin_notifications")
    .update({ status: "falha", error: "processando" })
    .eq("id", id)
    .eq("status", "pendente")
    .select("id, message")
    .maybeSingle();
  if (error) return json(500, { error: error.message });
  if (!n) return json(200, { ok: true, skipped: true });

  let channel: string | null = null;
  try {
    if (env("CALLMEBOT_PHONE") && env("CALLMEBOT_APIKEY")) {
      channel = "whatsapp_callmebot";
      await viaCallMeBot(n.message);
    } else if (env("WHATSAPP_TOKEN") && env("WHATSAPP_PHONE_NUMBER_ID") && env("WHATSAPP_TO")) {
      channel = "whatsapp_meta";
      await viaMeta(n.message);
    } else {
      await db.from("admin_notifications")
        .update({ status: "sem_canal", error: "Nenhum canal de WhatsApp configurado" }).eq("id", id);
      return json(200, { ok: false, reason: "sem_canal" });
    }
    await db.from("admin_notifications")
      .update({ status: "enviada", channel, error: null, sent_at: new Date().toISOString() }).eq("id", id);
    return json(200, { ok: true, channel });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("falha ao notificar:", msg);
    await db.from("admin_notifications").update({ status: "falha", channel, error: msg.slice(0, 300) }).eq("id", id);
    return json(200, { ok: false, error: msg });
  }
});
