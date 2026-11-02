import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Activity, Cpu, DoorClosed, Home, KeyRound, Megaphone, ShieldAlert, Ticket, UserCheck, Wifi } from "lucide-react";
import { useAuth } from "../lib/auth";
import { supabase, type Command, type GateAction, type MyGate } from "../lib/supabase";
import { ACTION_LABEL, CMD_LABEL, fmtAgo, must, useLoad } from "../lib/util";
import { Alert, Badge, Button, Card, Empty, Loading, PageHeader, Stat } from "../components/ui";
import { GateCard } from "../components/GateCard";
import { DailyBars } from "../components/Charts";
import { loadReport } from "./Reports";
import { unreadAnnouncements } from "./Announcements";
import { describeAudit } from "./Audit";

export async function sendGateCommand(gateId: string, action: GateAction): Promise<string> {
  const r = must(await supabase.rpc("request_gate_command", { p_gate: gateId, p_action: action })) as
    { ok: boolean; erro?: string; command_id?: string };
  if (!r.ok || !r.command_id) throw new Error(r.erro ?? "Falha ao enviar comando.");
  return r.command_id;
}

export async function commandStatus(id: string) {
  const { data } = await supabase.from("commands").select("status, error").eq("id", id).maybeSingle();
  return data as { status: Command["status"]; error: string | null } | null;
}

type RecentCmd = Command & { gates: { name: string } | null; profiles: { full_name: string | null; email: string | null } | null };

export default function Dashboard() {
  const { profile, memberships, isAdmin, isTitular, adminOrgs, homeOnly } = useAuth();

  const gates = useLoad(async () => must(await supabase.rpc("my_gates")) as MyGate[]);
  const recent = useLoad(async () =>
    must(await supabase.from("commands")
      .select("*, gates(name), profiles:requested_by(full_name, email)")
      .order("created_at", { ascending: false }).limit(8)) as unknown as RecentCmd[]);
  const summary = useLoad(async () => {
    if ((!isAdmin && !isTitular) || homeOnly) return null;
    const since = new Date(); since.setHours(0, 0, 0, 0);
    const [res, dev, pend, today] = await Promise.all([
      supabase.from("residences").select("id", { count: "exact", head: true }),
      isAdmin ? supabase.from("devices").select("last_seen_at") : Promise.resolve({ data: [] as { last_seen_at: string | null }[] }),
      supabase.from("residence_members").select("id", { count: "exact", head: true })
        .eq("status", "pendente").neq("user_id", profile?.id ?? ""),
      supabase.from("commands").select("id", { count: "exact", head: true }).gte("created_at", since.toISOString()),
    ]);
    const devices = (dev.data ?? []) as { last_seen_at: string | null }[];
    return {
      residences: res.count ?? 0,
      devices: devices.length,
      online: devices.filter((d) => d.last_seen_at && Date.now() - new Date(d.last_seen_at).getTime() < 45_000).length,
      pending: pend.count ?? 0,
      today: today.count ?? 0,
    };
  }, [isAdmin, isTitular, homeOnly, profile?.id]);

  const chart = useLoad(async () => {
    if (!isAdmin || homeOnly) return null;
    const to = new Date(); to.setHours(0, 0, 0, 0); to.setDate(to.getDate() + 1);
    const from = new Date(to.getTime() - 14 * 86400_000);
    return loadReport(null, from, to);
  }, [isAdmin, homeOnly]);
  const activity = useLoad(async () => {
    if (!isAdmin || homeOnly) return [];
    return must(await supabase.from("audit_logs").select("id, action, severity, created_at, profiles:actor_id(full_name, email)")
      .order("created_at", { ascending: false }).limit(7)) as unknown as
      { id: number; action: string; severity: string; created_at: string; profiles: { full_name: string | null; email: string | null } | null }[];
  }, [isAdmin, homeOnly]);
  const unread = useLoad(async () => (profile ? unreadAnnouncements(profile.id) : 0), [profile?.id]);

  // Atualiza status dos portões periodicamente.
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) { gates.reload(true); } }, 5000);
    return () => clearInterval(t);
  }, [gates.reload]);

  const pendingMine = memberships.filter((m) => m.status === "pendente");
  const blockedMine = memberships.filter((m) => m.status === "bloqueado");
  const noAccess = !isAdmin && !memberships.some((m) => m.status === "ativo");
  const firstName = (profile?.full_name ?? "").split(" ")[0];

  return (
    <div className="space-y-8">
      <PageHeader
        title={firstName ? `Olá, ${firstName}` : "Início"}
        subtitle={memberships.filter((m) => m.status === "ativo")
          .map((m) => m.residence_name === m.org_name ? m.residence_name : `${m.residence_name} · ${m.org_name}`).join("  •  ") || undefined}
        actions={<Link to="/convite"><Button variant="secondary"><Ticket className="size-4" /> Usar convite</Button></Link>}
      />

      {pendingMine.length > 0 && (
        <Alert tone="amber">
          Seu acesso a <b>{pendingMine.map((m) => m.residence_name).join(", ")}</b> está aguardando aprovação do titular ou da administração.
        </Alert>
      )}
      {blockedMine.length > 0 && (
        <Alert>Seu acesso a <b>{blockedMine.map((m) => m.residence_name).join(", ")}</b> está bloqueado.</Alert>
      )}
      {noAccess && pendingMine.length === 0 && (
        <Card className="text-center">
          <Home className="mx-auto mb-3 size-8 text-brand-500" />
          <h2 className="font-semibold">Como você vai usar o AuggeControl?</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
            Mora em condomínio ou foi convidado pela família? Use o código de convite (ou QR Code).
            É dono de uma casa? Configure o seu portão em 3 passos.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link to="/convite"><Button variant="secondary">Tenho um convite</Button></Link>
            <Link to="/configurar-casa"><Button>Configurar minha casa</Button></Link>
          </div>
        </Card>
      )}

      {(unread.data ?? 0) > 0 && (
        <Link to="/comunicados" className="block">
          <Alert tone="blue">
            <span className="flex items-center gap-2"><Megaphone className="size-4 shrink-0" />
              <span>Você tem <b>{unread.data}</b> comunicado(s) não lido(s). Toque para ver.</span></span>
          </Alert>
        </Link>
      )}

      {summary.data && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Residências" value={summary.data.residences} icon={<Home className="size-5" />} />
          {isAdmin && <Stat label={`Dispositivos online de ${summary.data.devices}`} value={summary.data.online} icon={<Wifi className="size-5" />} tone="green" />}
          <Stat label="Acionamentos hoje" value={summary.data.today} icon={<Activity className="size-5" />} tone="blue" />
          <Link to={isAdmin ? "/aprovacoes" : "/residencias"}>
            <Stat label="Aprovações pendentes" value={summary.data.pending} icon={<UserCheck className="size-5" />} tone={summary.data.pending ? "amber" : "gray"} />
          </Link>
        </div>
      )}

      {isAdmin && !homeOnly && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">Acionamentos nos últimos 14 dias</h2>
              <Link to="/relatorios" className="text-sm text-brand-500 hover:underline">Relatórios</Link>
            </div>
            {chart.loading ? <Loading /> : chart.data ? <DailyBars data={chart.data.por_dia} /> : null}
          </Card>
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Atividades recentes</h2>
              <Link to="/auditoria" className="text-sm text-brand-500 hover:underline">Ver tudo</Link>
            </div>
            {!activity.data?.length ? <p className="text-sm text-slate-500">Nenhuma atividade ainda.</p> : (
              <ul className="space-y-3">
                {activity.data.map((a) => (
                  <li key={a.id} className="flex gap-2 text-sm">
                    {a.severity !== "info"
                      ? <ShieldAlert className={`mt-0.5 size-4 shrink-0 ${a.severity === "critico" ? "text-red-500" : "text-amber-500"}`} />
                      : <span className="mt-1.5 size-2 shrink-0 rounded-full bg-slate-300 dark:bg-ink-700" />}
                    <div className="min-w-0">
                      <div className="truncate">{describeAudit(a.action)}</div>
                      <div className="truncate text-xs text-slate-500">
                        {a.profiles?.full_name || a.profiles?.email || "Sistema"} · {fmtAgo(a.created_at)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Portões</h2>
          {(isAdmin || isTitular) && (
            <Link to="/chaves" className="flex items-center gap-1 text-sm text-brand-500 hover:underline">
              <KeyRound className="size-4" /> Chave temporária
            </Link>
          )}
        </div>
        {gates.loading ? <Loading /> : gates.error ? <Alert>{gates.error}</Alert> : gates.data!.length === 0 ? (
          <Empty icon={<DoorClosed className="size-8" />} title="Nenhum portão disponível">
            {isAdmin
              ? <>Cadastre um dispositivo e um portão em <Link className="text-brand-500" to="/dispositivos">Portões e dispositivos</Link> e vincule-o a uma residência.{adminOrgs.length > 0 && " Administradores acionam portões da própria organização."}</>
              : "Quando sua residência tiver portões liberados, eles aparecerão aqui."}
          </Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {gates.data!.map((g) => (
              <GateCard
                key={g.gate_id}
                gate={{
                  id: g.gate_id, name: g.gate_name, mode: g.mode, state: g.state, online: g.online,
                  lastSeen: g.last_seen_at, deviceName: g.device_name, canOperate: g.can_operate,
                  subtitle: [...new Set([g.residence_name, g.org_name].filter(Boolean))].join(" · "),
                }}
                send={(a) => sendGateCommand(g.gate_id, a)}
                status={commandStatus}
                onDone={() => { gates.reload(true); recent.reload(true); summary.reload(true); }}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Últimos acionamentos</h2>
          <Link to="/historico" className="text-sm text-brand-500 hover:underline">Ver histórico</Link>
        </div>
        <Card className="p-0">
          {recent.loading ? <Loading /> : (recent.data ?? []).length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">Nenhum acionamento ainda.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-ink-800">
              {recent.data!.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div className="flex min-w-0 items-center gap-3">
                    <Cpu className="size-4 shrink-0 text-slate-400" />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{ACTION_LABEL[c.action]} · {c.gates?.name ?? "Portão"}</div>
                      <div className="truncate text-xs text-slate-500">
                        {c.source === "chave_temporaria" ? "Chave temporária" : c.profiles?.full_name || c.profiles?.email || "Usuário"} · {fmtAgo(c.created_at)}
                      </div>
                    </div>
                  </div>
                  <Badge tone={c.status === "sucesso" ? "green" : c.status === "falha" || c.status === "expirado" ? "red" : "amber"}>
                    {CMD_LABEL[c.status]}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
