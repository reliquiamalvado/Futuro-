import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, CheckCircle2, Power, Wifi, WifiOff, XCircle } from "lucide-react";
import type { CommandStatus, GateAction, GateMode, GateState } from "../lib/supabase";
import { STATE_LABEL, errMsg, fmtAgo } from "../lib/util";
import { CancelledError } from "../lib/unlock";
import { Badge, Card, Spinner, cx } from "./ui";

export interface GateView {
  id: string;
  name: string;
  mode: GateMode;
  state: GateState;
  online: boolean;
  lastSeen: string | null;
  subtitle?: string | null;
  deviceName?: string;
  canOperate: boolean;
  /** Portão cadastrado sem equipamento vinculado. */
  noDevice?: boolean;
}

type Phase = { kind: "idle" } | { kind: "busy"; action: GateAction } | { kind: "ok" } | { kind: "err"; msg: string };

const FINAL: CommandStatus[] = ["sucesso", "falha", "expirado"];

/**
 * send: envia o comando e devolve o id (ou lança erro com a mensagem do servidor).
 * status: consulta o status atual do comando.
 */
export function GateCard({ gate, send, status, onDone }: {
  gate: GateView;
  send: (action: GateAction) => Promise<string>;
  status: (commandId: string) => Promise<{ status: CommandStatus; error: string | null } | null>;
  onDone?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  async function run(action: GateAction) {
    setPhase({ kind: "busy", action });
    try {
      const id = await send(action);
      const until = Date.now() + 14_000;
      while (Date.now() < until) {
        await new Promise((r) => setTimeout(r, 600));
        const s = await status(id);
        if (s && FINAL.includes(s.status)) {
          if (s.status === "sucesso") {
            navigator.vibrate?.(60);
            setPhase({ kind: "ok" });
          } else {
            setPhase({ kind: "err", msg: s.error ?? "O equipamento não confirmou o comando." });
          }
          onDone?.();
          setTimeout(() => setPhase({ kind: "idle" }), 3500);
          return;
        }
      }
      setPhase({ kind: "err", msg: "Sem confirmação do equipamento." });
    } catch (e) {
      if (e instanceof CancelledError) { setPhase({ kind: "idle" }); return; }
      setPhase({ kind: "err", msg: errMsg(e) });
    }
    onDone?.();
    setTimeout(() => setPhase({ kind: "idle" }), 4000);
  }

  const disabled = !gate.canOperate || !gate.online || phase.kind === "busy";
  const stateTone = gate.state === "aberto" ? "green" : gate.state === "fechado" ? "red" : gate.state === "movendo" ? "amber" : "gray";

  const ActionBtn = ({ action, label, icon, cls }: { action: GateAction; label: string; icon: React.ReactNode; cls: string }) => (
    <button
      onClick={() => run(action)}
      disabled={disabled}
      className={cx(
        "flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl py-5 text-sm font-semibold text-white transition active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-40",
        cls,
        phase.kind === "busy" && phase.action === action && "dc-pulse",
      )}
    >
      {phase.kind === "busy" && phase.action === action ? <Spinner className="size-6 text-white" /> : icon}
      {label}
    </button>
  );

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{gate.name}</h3>
          {gate.subtitle && <p className="truncate text-sm text-slate-500 dark:text-slate-400">{gate.subtitle}</p>}
        </div>
        {gate.noDevice ? (
          <Badge tone="amber">Sem equipamento</Badge>
        ) : gate.online ? (
          <Badge tone="green"><Wifi className="size-3" /> Online</Badge>
        ) : (
          <Badge tone="red"><WifiOff className="size-3" /> Offline</Badge>
        )}
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-500 dark:text-slate-400">Estado:</span>
        <Badge tone={stateTone} dot>{STATE_LABEL[gate.state]}</Badge>
      </div>

      {gate.mode === "abrir_fechar" ? (
        <div className="flex gap-3">
          <ActionBtn action="abrir" label="Abrir" icon={<ArrowUpFromLine className="size-6" />} cls="bg-emerald-600 hover:bg-emerald-700" />
          <ActionBtn action="fechar" label="Fechar" icon={<ArrowDownToLine className="size-6" />} cls="bg-red-600 hover:bg-red-700" />
        </div>
      ) : (
        <div className="flex">
          <ActionBtn action="pulso" label="Acionar portão" icon={<Power className="size-7" />} cls="bg-brand-500 hover:bg-brand-600" />
        </div>
      )}

      <div className="min-h-5 text-sm">
        {phase.kind === "busy" && <span className="text-slate-500">Enviando ao equipamento…</span>}
        {phase.kind === "ok" && (
          <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-4" /> Comando executado pelo equipamento.
          </span>
        )}
        {phase.kind === "err" && (
          <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
            <XCircle className="size-4" /> {phase.msg}
          </span>
        )}
        {phase.kind === "idle" && (gate.deviceName || gate.lastSeen || gate.noDevice) && (
          <span className="text-xs text-slate-400">
            {gate.noDevice ? "Aguardando o equipamento ser vinculado · " : gate.deviceName ? `${gate.deviceName} · ` : ""}
            {gate.online ? `visto ${fmtAgo(gate.lastSeen)}` : `última conexão: ${fmtAgo(gate.lastSeen)}`}
            {!gate.canOperate && " · sem permissão de acionamento"}
          </span>
        )}
      </div>
    </Card>
  );
}
