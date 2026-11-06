import { useCallback, useEffect, useState } from "react";
import { KeyRound, ShieldOff } from "lucide-react";
import { supabase } from "../lib/supabase";
import { errMsg, must } from "../lib/util";
import { Badge, Button } from "./ui";

export interface PinStatus { tem_senha: boolean; recuperacoes_restantes: number; tem_2fa?: boolean }
type Row = PinStatus & { user_id: string };

/** Situação da senha de abertura de cada pessoa das organizações que eu administro. Chave: "org:usuario". */
export function usePinStatus(orgIds: string[]) {
  const key = [...new Set(orgIds)].sort().join(",");
  const [map, setMap] = useState<Map<string, PinStatus>>(new Map());
  const reload = useCallback(async () => {
    const next = new Map<string, PinStatus>();
    await Promise.all(key.split(",").filter(Boolean).map(async (org) => {
      const [{ data }, { data: mfa }] = await Promise.all([
        supabase.rpc("org_pin_status", { p_org: org }),
        supabase.rpc("org_mfa_status", { p_org: org }),
      ]);
      const with2fa = new Set(((mfa ?? []) as { user_id: string }[]).map((r) => r.user_id));
      for (const r of (data ?? []) as Row[]) next.set(`${org}:${r.user_id}`, { ...r, tem_2fa: with2fa.has(r.user_id) });
    }));
    setMap(next);
  }, [key]);
  useEffect(() => { reload(); }, [reload]);
  return { get: (org: string, user: string) => map.get(`${org}:${user}`), reload };
}

/** Selo "usou a chance" + botão para o administrador liberar uma nova senha de abertura. */
export function PinResetButton({ orgId, userId, name, status, onDone, onError }: {
  orgId: string; userId: string; name: string; status?: PinStatus;
  onDone: () => void; onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  if (!status?.tem_senha) return null;
  async function reset() {
    if (!confirm(`Liberar uma nova senha de abertura para ${name}?\n\nA senha atual deixa de valer. A pessoa cria outra em Minha conta (entrando de novo na conta).`)) return;
    setBusy(true);
    try {
      const r = must(await supabase.rpc("admin_reset_gate_pin", { p_user: userId, p_org: orgId })) as { ok: boolean; erro?: string };
      if (!r.ok) onError(r.erro ?? "Não foi possível liberar.");
      else onDone();
    } catch (e) { onError(errMsg(e)); }
    finally { setBusy(false); }
  }
  return (
    <>
      {status.recuperacoes_restantes === 0 && <span title="Já usou a chance de recuperar a senha sozinho"><Badge tone="amber">Já recuperou</Badge></span>}
      <Button size="sm" variant="ghost" loading={busy} onClick={reset}
        title="Liberar nova senha de abertura (para quem esqueceu)"><KeyRound className="size-4" /></Button>
    </>
  );
}

/** Botão para o administrador liberar a verificação em duas etapas de quem perdeu o celular. */
export function MfaResetButton({ orgId, userId, name, status, onDone, onError }: {
  orgId: string; userId: string; name: string; status?: PinStatus;
  onDone: () => void; onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  if (!status?.tem_2fa) return null;
  async function reset() {
    if (!confirm(`Liberar a verificação em duas etapas de ${name}?\n\nFaça isso só se a pessoa perdeu o celular e você confirmou que é ela mesma (por telefone ou pessoalmente). Depois ela entra só com a senha e pode ativar a verificação de novo em Minha conta.`)) return;
    setBusy(true);
    try {
      const r = must(await supabase.rpc("admin_reset_mfa", { p_user: userId, p_org: orgId })) as { ok: boolean; erro?: string };
      if (!r.ok) onError(r.erro ?? "Não foi possível liberar.");
      else onDone();
    } catch (e) { onError(errMsg(e)); }
    finally { setBusy(false); }
  }
  return (
    <Button size="sm" variant="ghost" loading={busy} onClick={reset}
      title="Liberar verificação em duas etapas (para quem perdeu o celular)"><ShieldOff className="size-4" /></Button>
  );
}
