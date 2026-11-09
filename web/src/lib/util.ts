import { useCallback, useEffect, useRef, useState } from "react";

// Mensagens do servidor (em inglês) traduzidas para o português, em linguagem simples.
const ERROS: [RegExp, string][] = [
  [/invalid login credentials/i, "E-mail ou senha incorretos."],
  [/email not confirmed/i, "Confirme seu e-mail antes de entrar. Procure o e-mail do AuggeControl (veja também o spam)."],
  [/user already registered|already been registered/i, "Este e-mail já está cadastrado. Tente entrar ou use “Esqueci a senha”."],
  [/known to be weak|pwned|leaked/i, "Esta senha é muito conhecida ou já vazou na internet. Escolha outra."],
  [/should be different from the old password/i, "A nova senha precisa ser diferente da atual."],
  [/password should be|password is too short|weak password/i, "A senha deve ter pelo menos 8 caracteres."],
  [/captcha/i, "A verificação de segurança não terminou. Aguarde aparecer “Sucesso” na caixinha e tente de novo."],
  [/for security purposes, you can only request this after/i, "Por segurança, aguarde alguns segundos antes de pedir de novo."],
  [/rate limit|too many requests/i, "Muitas tentativas. Aguarde alguns minutos."],
  [/unable to validate email|invalid format|email address .* is invalid/i, "Este e-mail não parece válido. Confira se digitou certo."],
  [/signups? not allowed|signup is disabled/i, "Novos cadastros estão desativados no momento."],
  [/invalid totp|invalid mfa|mfa .*invalid/i, "Código incorreto. Digite o código que aparece agora no aplicativo autenticador."],
  [/token has expired|otp_expired|link is invalid or has expired/i, "Este link ou código expirou. Peça um novo."],
  [/jwt expired|session.*(missing|not found)|refresh token/i, "Sua sessão expirou. Entre novamente."],
  [/failed to fetch|networkerror|load failed|network request failed/i, "Sem conexão com o servidor. Confira a internet e tente de novo."],
  [/timeout|timed out/i, "O servidor demorou para responder. Tente de novo."],
  [/duplicate key/i, "Já existe um registro com esses dados."],
  [/row-level security|permission denied/i,
    "Você não tem permissão para isso. Se você é administrador, confira se a verificação em duas etapas está ativa em Minha conta."],
];

export function errMsg(e: unknown): string {
  if (!e) return "Erro desconhecido.";
  if (typeof e === "string") return e;
  const m = (e as { message?: string }).message ?? String(e);
  for (const [re, txt] of ERROS) if (re.test(m)) return txt;
  return m;
}

const dtf = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
export const fmtDate = (d: string | null | undefined) => (d ? dtf.format(new Date(d)) : "—");

export function fmtAgo(d: string | null | undefined): string {
  if (!d) return "nunca";
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 10) return "agora";
  if (s < 60) return `há ${s} s`;
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return fmtDate(d);
}

export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Carrega dados de forma assíncrona e expõe recarregar. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const reload = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setData(await fnRef.current());
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, reload, setData };
}

/** Lança erro do Supabase ou devolve os dados. */
export function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

export const ROLE_LABEL = { titular: "Titular", morador: "Morador" } as const;
export const STATUS_LABEL = { pendente: "Pendente", ativo: "Ativo", bloqueado: "Bloqueado" } as const;
export const KIND_LABEL = { residencial: "Residencial", condominio: "Condomínio", empresa: "Empresa" } as const;
export const STATE_LABEL = {
  aberto: "Aberto", fechado: "Fechado", movendo: "Em movimento", desconhecido: "Sem sensor",
} as const;
export const CMD_LABEL = {
  pendente: "Aguardando", enviado: "Enviado", sucesso: "Executado", falha: "Falhou", expirado: "Expirado",
} as const;
export const ACTION_LABEL = { abrir: "Abrir", fechar: "Fechar", pulso: "Acionar" } as const;
export const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Só aceita caminhos internos do app (evita redirecionar para sites externos). */
export function safePath(p: unknown, fallback = "/"): string {
  if (typeof p !== "string") return fallback;
  if (!p.startsWith("/") || p.startsWith("//") || p.includes("\\") || /[\u0000-\u001f]/.test(p)) return fallback;
  try {
    const u = new URL(p, window.location.origin);
    return u.origin === window.location.origin ? u.pathname + u.search + u.hash : fallback;
  } catch {
    return fallback;
  }
}
