// AuggeControl - API dos equipamentos.
//
// O equipamento (ex.: ESP32 com firmware AuggeControl) se conecta para fora,
// por HTTPS, então não é preciso abrir portas no roteador do cliente.
//
// Autenticação em todas as rotas:
//   X-Device-Id: <uuid do dispositivo>
//   Authorization: Device <segredo gerado no cadastro>
//
// POST /device-api/poll  { "states": {"1": "fechado"}, "info": {"firmware": "1.0.0", "ip": "...", "rssi": -60} }
//   Long-polling: responde assim que houver comando ou após ~20 s.
//   -> { "commands": [{ "id", "action", "channel", "mode", "pulse_ms" }] }
//
// POST /device-api/ack   { "command_id": "...", "success": true, "error": null, "states": {...} }
//   -> { "ok": true }
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const LONG_POLL_MS = 20_000;
const POLL_INTERVAL_MS = 700;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATES = new Set(["aberto", "fechado", "movendo", "desconhecido"]);

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function cleanStates(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const ch = Number(k);
    if (Number.isInteger(ch) && ch >= 1 && ch <= 16 && typeof v === "string" && STATES.has(v)) {
      out[String(ch)] = v;
    }
  }
  return Object.keys(out).length ? out : null;
}

function cleanInfo(raw: unknown): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  if (typeof r.firmware === "string") out.firmware = r.firmware.slice(0, 40);
  if (typeof r.ip === "string") out.ip = r.ip.slice(0, 45);
  if (typeof r.rssi === "number" && Number.isFinite(r.rssi)) out.rssi = Math.round(r.rssi);
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function authenticate(req: Request): Promise<string | null> {
  const id = req.headers.get("x-device-id") ?? "";
  const auth = req.headers.get("authorization") ?? "";
  const secret = auth.startsWith("Device ") ? auth.slice(7).trim() : "";
  if (!UUID.test(id) || !/^[0-9a-f]{48}$/.test(secret)) return null;

  const { data, error } = await db.rpc("device_auth", { p_device: id, p_secret: secret });
  if (error) throw error;
  if (data !== true) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    await db.rpc("device_auth_failed", { p_device: id, p_ip: ip });
    return null;
  }
  return id;
}

async function poll(req: Request, deviceId: string, body: Record<string, unknown>) {
  const states = cleanStates(body.states);
  const info = cleanInfo(body.info);
  const deadline = Date.now() + LONG_POLL_MS;
  let first = true;

  while (true) {
    // Se o equipamento desconectou, não marca comandos como enviados.
    if (req.signal.aborted) return json(499, { commands: [] });

    const { data, error } = await db.rpc("device_poll", {
      p_device: deviceId,
      p_states: first ? states : null,
      p_info: info,
    });
    if (error) throw error;
    first = false;

    const commands = Array.isArray(data) ? data : [];
    if (commands.length > 0 || Date.now() + POLL_INTERVAL_MS >= deadline) {
      return json(200, { commands, server_time: new Date().toISOString() });
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

async function ack(deviceId: string, body: Record<string, unknown>) {
  const commandId = String(body.command_id ?? "");
  if (!UUID.test(commandId)) return json(400, { error: "command_id inválido" });

  const { data, error } = await db.rpc("device_ack", {
    p_device: deviceId,
    p_command: commandId,
    p_success: body.success === true,
    p_error: typeof body.error === "string" ? body.error.slice(0, 300) : null,
  });
  if (error) throw error;

  const states = cleanStates(body.states);
  if (states) {
    const { error: e2 } = await db.rpc("device_set_states", { p_device: deviceId, p_states: states });
    if (e2) console.error("estados:", e2.message);
  }
  return json(200, { ok: data === true });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "use POST" });
  const route = new URL(req.url).pathname.split("/").filter(Boolean).pop();

  try {
    const deviceId = await authenticate(req);
    if (!deviceId) return json(401, { error: "não autorizado" });

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    if (route === "poll") return await poll(req, deviceId, body);
    if (route === "ack") return await ack(deviceId, body);
    return json(404, { error: "rota não encontrada" });
  } catch (e) {
    console.error(e);
    return json(500, { error: "erro interno" });
  }
});
