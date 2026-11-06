import { useState, type FormEvent } from "react";
import { ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { useAuth } from "../lib/auth";
import { supabase, type Profile } from "../lib/supabase";
import { errMsg, fmtDate, must, useLoad } from "../lib/util";
import { Alert, Badge, Button, Card, Empty, Field, Input, Loading, PageHeader, Select, Table, Td } from "../components/ui";
import { MfaResetButton, PinResetButton, usePinStatus } from "../components/PinReset";

interface AdminRow {
  org_id: string;
  user_id: string;
  created_at: string;
  profiles: { full_name: string | null; email: string | null; phone: string | null } | null;
  organizations: { name: string } | null;
}

export default function AdminsPage() {
  const { adminOrgs, isSuper, profile } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [org, setOrg] = useState(adminOrgs[0]?.id ?? "");
  const [superEmail, setSuperEmail] = useState("");

  const admins = useLoad(async () =>
    must(await supabase.from("org_admins").select("*, profiles(full_name, email, phone), organizations(name)")
      .order("created_at")) as unknown as AdminRow[]);
  const supers = useLoad(async () =>
    isSuper ? must(await supabase.from("profiles").select("*").eq("is_super_admin", true).order("full_name")) as Profile[] : [],
  [isSuper]);

  const canManage = (org: string) => isSuper || adminOrgs.some((o) => o.id === org);
  const pins = usePinStatus((admins.data ?? []).map((a) => a.org_id).filter(canManage));
  const [ok, setOk] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.rpc("add_org_admin", { p_org: org, p_email: email });
    if (error) return setError(errMsg(error));
    setEmail("");
    admins.reload(true);
  }

  async function addSuper(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const p = must(await supabase.from("profiles").select("id").ilike("email", superEmail.trim()).maybeSingle()) as { id: string } | null;
      if (!p) throw new Error("Nenhum usuário com este e-mail.");
      must(await supabase.rpc("set_super_admin", { p_user: p.id, p_value: true }));
      setSuperEmail("");
      supers.reload(true);
    } catch (err) { setError(errMsg(err)); }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Administradores" subtitle="Quem administra cada organização. Administradores gerenciam residências, moradores, portões e comunicados." />
      {error && <Alert>{error}</Alert>}
      {ok && <Alert tone="green">{ok}</Alert>}

      {isSuper && (
        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><UserPlus className="size-5 text-brand-500" /> Adicionar administrador</h2>
          <form onSubmit={add} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label="Organização">
              <Select required value={org} onChange={(e) => setOrg(e.target.value)}>
                {adminOrgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
            </Field>
            <Field label="E-mail (a pessoa precisa ter conta)">
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Button type="submit" disabled={!org}>Adicionar</Button>
          </form>
        </Card>
      )}

      {admins.loading ? <Loading /> : !admins.data?.length ? (
        <Empty title="Nenhum administrador cadastrado" />
      ) : (
        <Card className="p-2">
          <Table head={["Nome", "Organização", "Cargo", "Desde", ""]}>
            {admins.data.map((a) => (
              <tr key={`${a.org_id}-${a.user_id}`}>
                <Td>
                  <div className="font-medium">{a.profiles?.full_name || "—"}{a.user_id === profile?.id && " (você)"}</div>
                  <div className="text-xs text-slate-500">{a.profiles?.email}{a.profiles?.phone ? ` · ${a.profiles.phone}` : ""}</div>
                </Td>
                <Td>{a.organizations?.name}</Td>
                <Td><Badge tone="blue">Admin</Badge></Td>
                <Td className="whitespace-nowrap text-slate-500">{fmtDate(a.created_at)}</Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-1">
                  {canManage(a.org_id) && a.user_id !== profile?.id && (<>
                    <PinResetButton orgId={a.org_id} userId={a.user_id} name={a.profiles?.full_name || a.profiles?.email || "esta pessoa"}
                      status={pins.get(a.org_id, a.user_id)}
                      onError={(t) => { setOk(null); setError(t); }}
                      onDone={() => { setError(null); setOk(`Senha de abertura de ${a.profiles?.full_name || a.profiles?.email} liberada.`); pins.reload(); }} />
                      <MfaResetButton orgId={a.org_id} userId={a.user_id} name={a.profiles?.full_name || a.profiles?.email || "esta pessoa"}
                        status={pins.get(a.org_id, a.user_id)}
                        onError={(t) => { setOk(null); setError(t); }}
                        onDone={() => { setError(null); setOk(`Verificação em duas etapas de ${a.profiles?.full_name || a.profiles?.email} liberada.`); pins.reload(); }} />
                  </>)}
                  {isSuper && (
                    <Button size="sm" variant="ghost" title="Remover" onClick={async () => {
                      if (!confirm(`Remover ${a.profiles?.email} da administração de ${a.organizations?.name}?`)) return;
                      const { error } = await supabase.from("org_admins").delete().eq("org_id", a.org_id).eq("user_id", a.user_id);
                      if (error) setError(errMsg(error));
                      admins.reload(true);
                    }}><Trash2 className="size-4" /></Button>
                  )}
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {isSuper && (
        <Card>
          <h2 className="mb-1 flex items-center gap-2 font-semibold"><ShieldCheck className="size-5 text-brand-500" /> Super admins da plataforma</h2>
          <p className="mb-4 text-sm text-slate-500">Acesso total a todos os clientes. Conceda com cuidado.</p>
          <ul className="mb-4 space-y-2">
            {(supers.data ?? []).map((p) => (
              <li key={p.id} className="flex items-center justify-between text-sm">
                <span>{p.full_name || "—"} <span className="text-slate-500">· {p.email}</span></span>
                {p.id !== profile?.id && (
                  <Button size="sm" variant="ghost" onClick={async () => {
                    if (!confirm(`Remover acesso de super admin de ${p.email}?`)) return;
                    const { error } = await supabase.rpc("set_super_admin", { p_user: p.id, p_value: false });
                    if (error) setError(errMsg(error));
                    supers.reload(true);
                  }}><Trash2 className="size-4" /></Button>
                )}
              </li>
            ))}
          </ul>
          <form onSubmit={addSuper} className="flex gap-2">
            <Input type="email" placeholder="e-mail de um usuário cadastrado" required value={superEmail} onChange={(e) => setSuperEmail(e.target.value)} />
            <Button type="submit" variant="secondary">Conceder</Button>
          </form>
        </Card>
      )}
    </div>
  );
}
