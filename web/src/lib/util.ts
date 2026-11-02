import { useCallback, useEffect, useRef, useState } from "react";

export function errMsg(e: unknown): string {
  if (!e) return "Erro desconhecido.";
  if (typeof e === "string") return e;
  const m = (e as { message?: string }).message ?? String(e);
  if (m.includes("Invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("Email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (m.includes("User already registered")) return "Este e-mail já está cadastrado.";
  if (m.includes("Password should be")) return "A senha deve ter pelo menos 8 caracteres.";
  if (m.includes("rate limit")) return "Muitas tentativas. Aguarde alguns minutos.";
  if (m.includes("Failed to fetch")) return "Sem conexão com o servidor.";
  if (m.includes("duplicate key")) return "Já existe um registro com esses dados.";
  if (m.includes("row-level security") || m.includes("permission denied")) return "Você não tem permissão para isso.";
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
