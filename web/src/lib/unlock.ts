import { browserSupportsWebAuthn, platformAuthenticatorIsAvailable, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { supabase, type GateAction } from "./supabase";
import { must } from "./util";

export interface UnlockMethods { pin: boolean; bloqueado_ate: string | null; biometrias: number; login_recente: boolean; recuperacoes_restantes?: number }

export async function getUnlockMethods(): Promise<UnlockMethods> {
  return must(await supabase.rpc("my_unlock_methods")) as UnlockMethods;
}

export async function biometricAvailable(): Promise<boolean> {
  try { return browserSupportsWebAuthn() && (await platformAuthenticatorIsAvailable()); } catch { return false; }
}

/** Chama a Edge Function "unlock" e devolve o JSON (ou lança com a mensagem do servidor). */
async function call<T>(route: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke(`unlock/${route}`, { body });
  if (error) {
    let msg = error.message;
    let extra: Record<string, unknown> = {};
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) { extra = await ctx.json(); msg = (extra.erro as string) ?? msg; }
    } catch { /* sem corpo */ }
    throw Object.assign(new Error(msg), extra);
  }
  return data as T;
}

export class CancelledError extends Error { constructor() { super("cancelado"); } }

function wrapBrowserError(e: unknown): never {
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "AbortError") throw new CancelledError();
  throw e;
}

export async function registerBiometric(deviceName: string, pin?: string) {
  const optionsJSON = await call<Parameters<typeof startRegistration>[0]["optionsJSON"]>("register-options", { pin });
  const response = await startRegistration({ optionsJSON }).catch(wrapBrowserError);
  await call("register-verify", { response, device_name: deviceName });
}

/** Confere a biometria e aciona o portão; devolve o id do comando. */
export async function openWithBiometric(gateId: string, action: GateAction): Promise<{ ok: boolean; erro?: string; command_id?: string }> {
  const optionsJSON = await call<Parameters<typeof startAuthentication>[0]["optionsJSON"]>("auth-options");
  const response = await startAuthentication({ optionsJSON }).catch(wrapBrowserError);
  return call("open", { response, gate_id: gateId, action });
}

export async function openWithPin(gateId: string, action: GateAction, pin: string) {
  return must(await supabase.rpc("request_gate_command", { p_gate: gateId, p_action: action, p_pin: pin })) as
    { ok: boolean; erro?: string; command_id?: string; confirmacao?: string };
}

export function deviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Mac OS/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "Este aparelho";
}
