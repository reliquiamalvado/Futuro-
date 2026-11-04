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

type RegOptions = Parameters<typeof startRegistration>[0]["optionsJSON"];
type AuthOptions = Parameters<typeof startAuthentication>[0]["optionsJSON"];

/*
 * iPhone (Safari) só abre o Face ID / Touch ID se o pedido acontecer logo depois do toque.
 * Por isso o desafio é buscado ANTES (ao abrir a tela) e o toque chama a biometria na hora,
 * sem esperar a internet. O desafio vale 2 minutos no servidor; renovamos a cada 90 s.
 */
export const OPTIONS_TTL_MS = 90_000;

export function prepareRegistration(pin?: string): Promise<RegOptions> {
  return call<RegOptions>("register-options", { pin });
}
export async function finishRegistration(optionsJSON: RegOptions, deviceName: string) {
  const response = await startRegistration({ optionsJSON }).catch(wrapBrowserError);
  await call("register-verify", { response, device_name: deviceName });
}
export async function registerBiometric(deviceName: string, pin?: string) {
  await finishRegistration(await prepareRegistration(pin), deviceName);
}

export function prepareAuthentication(): Promise<AuthOptions> {
  return call<AuthOptions>("auth-options");
}

/** Confere a biometria e aciona o portão; devolve o id do comando. */
export async function openWithBiometric(gateId: string, action: GateAction, prepared?: AuthOptions): Promise<{ ok: boolean; erro?: string; command_id?: string }> {
  const optionsJSON = prepared ?? await prepareAuthentication();
  const response = await startAuthentication({ optionsJSON }).catch(wrapBrowserError);
  return call("open", { response, gate_id: gateId, action });
}

/** Confere a biometria e devolve um tíquete de uso único (ex.: recuperar a senha de abertura). */
export async function verifyBiometric(prepared?: AuthOptions): Promise<string> {
  const optionsJSON = prepared ?? await prepareAuthentication();
  const response = await startAuthentication({ optionsJSON }).catch(wrapBrowserError);
  const r = await call<{ ticket: string }>("verify", { response });
  return r.ticket;
}

export async function openWithPin(gateId: string, action: GateAction, pin: string) {
  return must(await supabase.rpc("request_gate_command", { p_gate: gateId, p_action: action, p_pin: pin })) as
    { ok: boolean; erro?: string; command_id?: string; confirmacao?: string };
}

/** Nome da biometria deste aparelho, do jeito que a pessoa conhece. */
export function biometricName(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "Face ID / Touch ID";
  if (/Mac OS/.test(ua)) return "Touch ID";
  if (/Windows/.test(ua)) return "Windows Hello";
  return "digital ou rosto";
}

/** Abriu dentro do WhatsApp/Instagram/Facebook? Esses navegadores internos bloqueiam a biometria. */
export function inAppBrowser(): boolean {
  return /FBAN|FBAV|Instagram|WhatsApp|Line\/|; wv\)/.test(navigator.userAgent);
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
