import { useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useAuth } from "../lib/auth";
import { supabase, type AuditLog } from "../lib/supabase";
import { fmtDate, must, useLoad } from "../lib/util";
import { Alert, Badge, Button, Card, Empty, Loading, PageHeader, Select } from "../components/ui";

type Row = AuditLog & { profiles: { full_name: string | null; email: string | null } | null };

const ACTIONS: Record<string, string> = {
  "acionamento.negado": "Tentativa de acionamento sem permissão",
  "acionamento.falha": "Equipamento informou falha",
  "dispositivo.autenticacao_falhou": "Equipamento com credencial inválida",
  "devices.segredo_renovado": "Segredo do dispositivo renovado",
  "chave_temporaria.negada": "Chave temporária usada fora das regras",
  "chave_temporaria.invalida": "Chave temporária inexistente",
  "convite.invalido": "Convite inválido utilizado",
  "profiles.super_admin": "Permissão de super admin alterada",
};
const ENTITY: Record<string, string> = {
  organizations: "Cliente", org_admins: "Administrador", residences: "Residência", residence_members: "Morador",
  devices: "Dispositivo", gates: "Portão", gate_residences: "Vínculo portão/residência", invites: "Convite", temp_keys: "Chave temporária",
};
const OP: Record<string, string> = { insert: "criado", update: "alterado", delete: "removido" };

function describe(a: string) {
  if (ACTIONS[a]) return ACTIONS[a];
  const [entity, op] = a.split(".");
  return ENTITY[entity] && OP[op] ? `${ENTITY[entity]} ${OP[op]}` : a;
}

export default function AuditPage() {
  const { adminOrgs } = useAuth();
  const [severity, setSeverity] = useState("");
  const [org, setOrg] = useState("");
  const [limit, setLimit] = useState(100);
  const [open, setOpen] = useState<number | null>(null);

  const list = useLoad(async () => {
    let q = supabase.from("audit_logs").select("*, profiles:actor_id(full_name, email)")
      .order("created_at", { ascending: false }).limit(limit);
    if (severity === "suspeitas") q = q.in("severity", ["alerta", "critico"]);
    else if (severity) q = q.eq("severity", severity);
    if (org) q = q.eq("org_id", org);
    return must(await q) as unknown as Row[];
  }, [severity, org, limit]);

  return (
    <div>
      <PageHeader title="Auditoria e segurança" subtitle="Histórico de alterações, falhas e atividades suspeitas." />
      <div className="mb-4 flex flex-wrap gap-3">
        <Select className="max-w-xs" value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="">Todos os eventos</option>
          <option value="suspeitas">Somente suspeitos (alerta e crítico)</option>
          <option value="critico">Críticos</option>
          <option value="info">Informativos</option>
        </Select>
        {adminOrgs.length > 1 && (
          <Select className="max-w-xs" value={org} onChange={(e) => setOrg(e.target.value)}>
            <option value="">Todas as organizações</option>
            {adminOrgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        )}
      </div>

      {list.loading ? <Loading /> : list.error ? <Alert>{list.error}</Alert> : !list.data?.length ? (
        <Empty icon={<ShieldCheck className="size-8" />} title="Nenhum evento registrado" />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-slate-100 dark:divide-ink-800">
            {list.data.map((l) => (
              <li key={l.id} className="px-5 py-3 text-sm">
                <button className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setOpen(open === l.id ? null : l.id)}>
                  <div className="flex min-w-0 gap-3">
                    {l.severity !== "info" && <ShieldAlert className={`mt-0.5 size-4 shrink-0 ${l.severity === "critico" ? "text-red-500" : "text-amber-500"}`} />}
                    <div className="min-w-0">
                      <div className="font-medium">{describe(l.action)}</div>
                      <div className="truncate text-xs text-slate-500">
                        {fmtDate(l.created_at)} · {l.profiles?.full_name || l.profiles?.email || (l.actor_id ? "Usuário" : "Sistema / visitante")}
                      </div>
                    </div>
                  </div>
                  <Badge tone={l.severity === "critico" ? "red" : l.severity === "alerta" ? "amber" : "gray"}>{l.severity}</Badge>
                </button>
                {open === l.id && (
                  <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-50 p-3 text-xs dark:bg-ink-850">{JSON.stringify(l.details, null, 2)}</pre>
                )}
              </li>
            ))}
          </ul>
          {list.data.length >= limit && (
            <div className="p-3 text-center"><Button variant="ghost" onClick={() => setLimit((x) => x + 100)}>Carregar mais</Button></div>
          )}
        </Card>
      )}
    </div>
  );
}
