import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { supabase, type GateAction, type GateMode, type GateState } from "../lib/supabase";
import { WEEKDAYS, fmtDate, must, useLoad } from "../lib/util";
import { Alert, Card, Loading } from "../components/ui";
import { GateCard } from "../components/GateCard";
import { Logo } from "../components/Layout";

interface KeyInfo {
  label: string;
  residencia: string;
  valid_from: string;
  valid_until: string;
  daily_start: string | null;
  daily_end: string | null;
  weekdays: number[] | null;
  usos: number;
  max_usos: number | null;
  bloqueio: string | null;
  portoes: { id: string; nome: string; modo: GateMode; estado: GateState; online: boolean }[];
}

export default function GuestKeyPage() {
  const { token = "" } = useParams();
  const info = useLoad(async () => must(await supabase.rpc("guest_key_info", { p_token: token })) as KeyInfo | null, [token]);

  useEffect(() => {
    const t = setInterval(() => !document.hidden && info.reload(true), 6000);
    return () => clearInterval(t);
  }, [info.reload]);

  async function send(gateId: string, action: GateAction) {
    const r = must(await supabase.rpc("guest_request_command", { p_token: token, p_gate: gateId, p_action: action })) as
      { ok: boolean; erro?: string; command_id?: string };
    if (!r.ok || !r.command_id) throw new Error(r.erro ?? "Não foi possível acionar.");
    return r.command_id;
  }
  async function status(id: string) {
    const r = (await supabase.rpc("guest_command_status", { p_token: token, p_command: id })).data as
      { status: "pendente" | "enviado" | "sucesso" | "falha" | "expirado"; erro: string | null } | null;
    return r ? { status: r.status, error: r.erro } : null;
  }

  const k = info.data;
  return (
    <div className="mx-auto min-h-screen max-w-md px-4 py-8">
      <Logo className="mb-8 justify-center" />
      {info.loading ? <Loading /> : !k ? (
        <Alert>Chave não encontrada. Confira o link recebido.</Alert>
      ) : (
        <div className="space-y-4">
          <Card className="text-center">
            <KeyRound className="mx-auto mb-2 size-7 text-brand-500" />
            <h1 className="text-lg font-semibold">{k.label}</h1>
            <p className="text-sm text-slate-500">{k.residencia}</p>
            <p className="mt-2 text-xs text-slate-500">
              Válida de {fmtDate(k.valid_from)} até {fmtDate(k.valid_until)}
              {k.daily_start && ` · das ${k.daily_start.slice(0, 5)} às ${k.daily_end?.slice(0, 5)}`}
              {k.weekdays && ` · ${k.weekdays.map((d) => WEEKDAYS[d]).join(", ")}`}
              {k.max_usos && ` · ${k.max_usos - k.usos} uso(s) restante(s)`}
            </p>
          </Card>
          {k.bloqueio && <Alert tone="amber">{k.bloqueio}</Alert>}
          {k.portoes.map((g) => (
            <GateCard
              key={g.id}
              gate={{ id: g.id, name: g.nome, mode: g.modo, state: g.estado, online: g.online, lastSeen: null, canOperate: !k.bloqueio }}
              send={(a) => send(g.id, a)}
              status={status}
              onDone={() => info.reload(true)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
