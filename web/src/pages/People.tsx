import { useState } from "react";
import { Link } from "react-router-dom";
import { Ban, Check, ExternalLink, Search, Trash2, UserCheck, Users, X } from "lucide-react";
import { useAuth } from "../lib/auth";
import { supabase, type MemberRole, type MemberStatus } from "../lib/supabase";
import { ROLE_LABEL, STATUS_LABEL, errMsg, fmtAgo, fmtDate, must, useLoad } from "../lib/util";
import { Alert, Badge, Button, Card, Empty, Input, Loading, Modal, PageHeader, Select, Table, Td } from "../components/ui";

export interface MemberFull {
  id: string;
  residence_id: string;
  user_id: string;
  role: MemberRole;
  status: MemberStatus;
  allowed_gates: string[] | null;
  created_at: string;
  approved_at: string | null;
  profiles: { full_name: string | null; email: string | null; phone: string | null } | null;
  residences: { name: string; org_id: string; organizations: { name: string } | null } | null;
  invites: { code: string; role: MemberRole; created_by: string | null } | null;
}

const SELECT = "*, profiles:user_id(full_name, email, phone), residences(name, org_id, organizations(name)), invites(code, role, created_by)";

async function setStatus(id: string, status: MemberStatus) {
  must(await supabase.from("residence_members").update({ status }).eq("id", id).select());
}
async function removeMember(id: string) {
  must(await supabase.from("residence_members").delete().eq("id", id).select());
}

// ------------------------------------------------------------------ Aprovações

export function ApprovalsPage() {
  const { profile, refresh } = useAuth();
  const list = useLoad(async () =>
    (must(await supabase.from("residence_members").select(SELECT).eq("status", "pendente")
      .order("created_at")) as unknown as MemberFull[]).filter((m) => m.user_id !== profile?.id));
  const [sel, setSel] = useState<string[]>([]);
  const [view, setView] = useState<MemberFull | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function bulk(fn: (id: string) => Promise<void>, ids: string[]) {
    setBusy(true);
    setError(null);
    try {
      for (const id of ids) await fn(id);
      setSel([]);
      setView(null);
      await list.reload(true);
      refresh();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const rows = list.data ?? [];
  const allSel = rows.length > 0 && sel.length === rows.length;

  return (
    <div>
      <PageHeader
        title="Aprovações"
        subtitle="Pessoas que entraram por convite e aguardam liberação de acesso."
        actions={sel.length > 0 && <>
          <Button variant="success" loading={busy} onClick={() => bulk((id) => setStatus(id, "ativo"), sel)}>
            <Check className="size-4" /> Aprovar {sel.length}
          </Button>
          <Button variant="secondary" disabled={busy}
            onClick={() => confirm(`Recusar ${sel.length} solicitação(ões)?`) && bulk(removeMember, sel)}>
            <X className="size-4" /> Recusar
          </Button>
        </>}
      />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      {list.loading ? <Loading /> : list.error ? <Alert>{list.error}</Alert> : rows.length === 0 ? (
        <Empty icon={<UserCheck className="size-8" />} title="Nenhuma aprovação pendente">
          Quando alguém usar um convite que exige aprovação, a solicitação aparece aqui.
        </Empty>
      ) : (
        <Card className="p-2">
          <Table head={[
            <input key="all" type="checkbox" className="size-4 accent-brand-500" checked={allSel}
              onChange={(e) => setSel(e.target.checked ? rows.map((r) => r.id) : [])} aria-label="Selecionar todos" />,
            "Pessoa", "Residência", "Papel", "Pediu", "",
          ]}>
            {rows.map((m) => (
              <tr key={m.id}>
                <Td>
                  <input type="checkbox" className="size-4 accent-brand-500" checked={sel.includes(m.id)}
                    onChange={(e) => setSel((s) => e.target.checked ? [...s, m.id] : s.filter((x) => x !== m.id))} />
                </Td>
                <Td>
                  <button className="text-left hover:text-brand-500" onClick={() => setView(m)}>
                    <div className="font-medium">{m.profiles?.full_name || "—"}</div>
                    <div className="text-xs text-slate-500">{m.profiles?.email}</div>
                  </button>
                </Td>
                <Td>
                  <div>{m.residences?.name}</div>
                  <div className="text-xs text-slate-500">{m.residences?.organizations?.name}</div>
                </Td>
                <Td><Badge tone={m.role === "titular" ? "blue" : "gray"}>{ROLE_LABEL[m.role]}</Badge></Td>
                <Td className="whitespace-nowrap text-slate-500">{fmtAgo(m.created_at)}</Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="success" disabled={busy} onClick={() => bulk((id) => setStatus(id, "ativo"), [m.id])}>
                      <Check className="size-4" /> Aprovar
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} title="Recusar"
                      onClick={() => confirm("Recusar esta solicitação?") && bulk(removeMember, [m.id])}>
                      <X className="size-4" />
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {view && (
        <Modal open onClose={() => setView(null)} title="Analisar solicitação">
          <dl className="space-y-3 text-sm">
            <Row k="Nome" v={view.profiles?.full_name || "—"} />
            <Row k="E-mail" v={view.profiles?.email || "—"} />
            <Row k="Telefone" v={view.profiles?.phone || "não informado"} />
            <Row k="Residência" v={`${view.residences?.name} · ${view.residences?.organizations?.name}`} />
            <Row k="Papel solicitado" v={ROLE_LABEL[view.role]} />
            <Row k="Convite usado" v={view.invites ? <span className="font-mono">{view.invites.code}</span> : "adicionado manualmente"} />
            <Row k="Data do pedido" v={fmtDate(view.created_at)} />
          </dl>
          <div className="mt-6 flex gap-2">
            <Button variant="success" className="flex-1" loading={busy} onClick={() => bulk((id) => setStatus(id, "ativo"), [view.id])}>
              <Check className="size-4" /> Aprovar
            </Button>
            <Button variant="secondary" className="flex-1" disabled={busy}
              onClick={() => confirm("Recusar esta solicitação?") && bulk(removeMember, [view.id])}>
              Recusar
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 pb-2 dark:border-ink-800">
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-right font-medium">{v}</dd>
    </div>
  );
}

// ------------------------------------------------------------------ Moradores

export function ResidentsPage() {
  const { profile, adminOrgs, isSuper } = useAuth();
  const [q, setQ] = useState("");
  const [status, setStatusF] = useState<"" | MemberStatus>("");
  const [role, setRole] = useState<"" | MemberRole>("");
  const [error, setError] = useState<string | null>(null);

  const list = useLoad(async () =>
    must(await supabase.from("residence_members").select(SELECT).neq("status", "pendente")
      .order("created_at", { ascending: false })) as unknown as MemberFull[]);

  const rows = (list.data ?? []).filter((m) =>
    (!status || m.status === status) && (!role || m.role === role) &&
    (!q || `${m.profiles?.full_name} ${m.profiles?.email} ${m.residences?.name}`.toLowerCase().includes(q.toLowerCase())));

  const isOrgAdmin = (m: MemberFull) => isSuper || adminOrgs.some((o) => o.id === m.residences?.org_id);

  async function act(fn: () => Promise<void>) {
    setError(null);
    try { await fn(); await list.reload(true); } catch (e) { setError(errMsg(e)); }
  }

  function exportCsv() {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [["nome", "email", "telefone", "residencia", "organizacao", "papel", "status", "desde"].join(";"),
      ...rows.map((m) => [m.profiles?.full_name, m.profiles?.email, m.profiles?.phone, m.residences?.name,
        m.residences?.organizations?.name, ROLE_LABEL[m.role], STATUS_LABEL[m.status], fmtDate(m.approved_at ?? m.created_at)]
        .map(esc).join(";"))].join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = "moradores.csv"; a.click(); URL.revokeObjectURL(url);
  }

  const counts = {
    ativos: (list.data ?? []).filter((m) => m.status === "ativo").length,
    bloqueados: (list.data ?? []).filter((m) => m.status === "bloqueado").length,
  };

  return (
    <div>
      <PageHeader
        title="Moradores"
        subtitle={`${counts.ativos} ativo(s) · ${counts.bloqueados} bloqueado(s). Para cadastrar, gere um convite na residência ou adicione pelo e-mail.`}
        actions={<>
          <Button variant="secondary" onClick={exportCsv} disabled={!rows.length}>Exportar CSV</Button>
          <Link to="/residencias"><Button>Cadastrar morador</Button></Link>
        </>}
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Nome, e-mail ou residência" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="max-w-[10rem]" value={status} onChange={(e) => setStatusF(e.target.value as MemberStatus | "")}>
          <option value="">Todos os status</option>
          <option value="ativo">Ativos</option>
          <option value="bloqueado">Bloqueados</option>
        </Select>
        <Select className="max-w-[10rem]" value={role} onChange={(e) => setRole(e.target.value as MemberRole | "")}>
          <option value="">Todos os papéis</option>
          <option value="titular">Titulares</option>
          <option value="morador">Moradores</option>
        </Select>
      </div>
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      {list.loading ? <Loading /> : list.error ? <Alert>{list.error}</Alert> : rows.length === 0 ? (
        <Empty icon={<Users className="size-8" />} title="Nenhum morador encontrado" />
      ) : (
        <Card className="p-2">
          <Table head={["Nome", "Residência", "Papel", "Status", "Desde", ""]}>
            {rows.map((m) => {
              const self = m.user_id === profile?.id;
              const admin = isOrgAdmin(m);
              const canEdit = !self && (admin || m.role === "morador");
              return (
                <tr key={m.id}>
                  <Td>
                    <div className="font-medium">{m.profiles?.full_name || "—"}{self && " (você)"}</div>
                    <div className="text-xs text-slate-500">{m.profiles?.email}{m.profiles?.phone ? ` · ${m.profiles.phone}` : ""}</div>
                  </Td>
                  <Td>
                    <Link to={`/residencias/${m.residence_id}`} className="hover:text-brand-500">{m.residences?.name}</Link>
                    <div className="text-xs text-slate-500">{m.residences?.organizations?.name}</div>
                  </Td>
                  <Td>
                    {admin && !self ? (
                      <Select className="w-32 py-1.5" value={m.role}
                        onChange={(e) => act(async () => { must(await supabase.from("residence_members").update({ role: e.target.value as MemberRole }).eq("id", m.id).select()); })}>
                        <option value="titular">Titular</option>
                        <option value="morador">Morador</option>
                      </Select>
                    ) : <Badge tone={m.role === "titular" ? "blue" : "gray"}>{ROLE_LABEL[m.role]}</Badge>}
                  </Td>
                  <Td><Badge tone={m.status === "ativo" ? "green" : "red"} dot>{STATUS_LABEL[m.status]}</Badge></Td>
                  <Td className="whitespace-nowrap text-slate-500">{fmtDate(m.approved_at ?? m.created_at)}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Link to={`/residencias/${m.residence_id}`} title="Abrir residência (permissões)">
                        <Button size="sm" variant="ghost"><ExternalLink className="size-4" /></Button>
                      </Link>
                      {canEdit && (m.status === "ativo" ? (
                        <Button size="sm" variant="ghost" title="Bloquear"
                          onClick={() => confirm("Bloquear o acesso desta pessoa?") && act(() => setStatus(m.id, "bloqueado"))}>
                          <Ban className="size-4" />
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" title="Desbloquear" onClick={() => act(() => setStatus(m.id, "ativo"))}>
                          <Check className="size-4" />
                        </Button>
                      ))}
                      {canEdit && (
                        <Button size="sm" variant="ghost" title="Remover"
                          onClick={() => confirm("Remover esta pessoa da residência?") && act(() => removeMember(m.id))}>
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </Table>
        </Card>
      )}
    </div>
  );
}
