import { useState, type FormEvent } from "react";
import { Building2, Home, Pencil, Plus, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { supabase, type GroupLabel, type OrgKind, type Organization, type Profile } from "../lib/supabase";
import { KIND_LABEL, errMsg, fmtDate, must, useLoad } from "../lib/util";
import { Alert, Badge, Button, Card, Empty, Field, Input, Loading, Modal, PageHeader, Select, Table, Td } from "../components/ui";

type OrgRow = Organization & {
  residences: { count: number }[];
  devices: { count: number }[];
  org_admins: { user_id: string; profiles: { full_name: string | null; email: string | null } | null }[];
};

export default function OrganizationsPage() {
  const { refresh, profile } = useAuth();
  const list = useLoad(async () =>
    must(await supabase.from("organizations")
      .select("*, residences(count), devices(count), org_admins(user_id, profiles(full_name, email))")
      .order("name")) as unknown as OrgRow[]);
  const supers = useLoad(async () =>
    must(await supabase.from("profiles").select("*").eq("is_super_admin", true).order("full_name")) as Profile[]);

  const [edit, setEdit] = useState<Organization | "new" | null>(null);
  const [newHome, setNewHome] = useState(false);
  const [admins, setAdmins] = useState<OrgRow | null>(null);
  const [superEmail, setSuperEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function toggleActive(o: Organization) {
    if (!confirm(o.active ? `Suspender "${o.name}"? Nenhum portão do cliente poderá ser acionado.` : `Reativar "${o.name}"?`)) return;
    const { error } = await supabase.from("organizations").update({ active: !o.active }).eq("id", o.id);
    if (error) setError(errMsg(error));
    list.reload(true);
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
    <div className="space-y-8">
      <PageHeader
        title="Clientes"
        subtitle="Empresas, condomínios e residências que contratam a plataforma. Cada cliente só enxerga os próprios dados."
        actions={<>
          <Button variant="secondary" onClick={() => setNewHome(true)}><Home className="size-4" /> Nova casa</Button>
          <Button onClick={() => setEdit("new")}><Plus className="size-4" /> Novo condomínio / empresa</Button>
        </>}
      />
      {error && <Alert>{error}</Alert>}

      {list.loading ? <Loading /> : !list.data?.length ? (
        <Empty icon={<Building2 className="size-8" />} title="Nenhum cliente cadastrado" />
      ) : (
        <Card className="p-2">
          <Table head={["Cliente", "Tipo", "Residências", "Dispositivos", "Administradores", "Status", ""]}>
            {list.data.map((o) => (
              <tr key={o.id}>
                <Td>
                  <div className="font-medium">{o.name}</div>
                  <div className="text-xs text-slate-500">{[o.document, o.email, o.phone].filter(Boolean).join(" · ") || `Desde ${fmtDate(o.created_at)}`}</div>
                </Td>
                <Td>{KIND_LABEL[o.kind]}</Td>
                <Td>{o.residences[0]?.count ?? 0}</Td>
                <Td>{o.devices[0]?.count ?? 0}</Td>
                <Td>
                  <button onClick={() => setAdmins(o)} className="text-left text-brand-500 hover:underline">
                    {o.org_admins.length ? o.org_admins.map((a) => a.profiles?.full_name || a.profiles?.email).join(", ") : "Adicionar"}
                  </button>
                </Td>
                <Td>
                  <button onClick={() => toggleActive(o)}>
                    <Badge tone={o.active ? "green" : "red"} dot>{o.active ? "Ativo" : "Suspenso"}</Badge>
                  </button>
                </Td>
                <Td className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEdit(o)}><Pencil className="size-4" /></Button>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

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

      {edit && <OrgModal org={edit === "new" ? null : edit} onClose={() => setEdit(null)}
        onSaved={() => { setEdit(null); list.reload(true); refresh(); }} />}
      {newHome && <NewHomeModal onClose={() => setNewHome(false)} />}
      {admins && <AdminsModal org={admins} onClose={() => setAdmins(null)} onChanged={() => { list.reload(true).then(() => undefined); }} />}
    </div>
  );
}

function OrgModal({ org, onClose, onSaved }: { org: Organization | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: org?.name ?? "", kind: (org?.kind ?? "condominio") as OrgKind, group_label: (org?.group_label ?? "Bloco") as GroupLabel,
    document: org?.document ?? "",
    email: org?.email ?? "", phone: org?.phone ?? "", address: org?.address ?? "", timezone: org?.timezone ?? "America/Sao_Paulo",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    const row = {
      name: f.name.trim(), kind: f.kind, group_label: f.group_label, document: f.document || null, email: f.email || null,
      phone: f.phone || null, address: f.address || null, timezone: f.timezone,
    };
    const { error } = org
      ? await supabase.from("organizations").update(row).eq("id", org.id)
      : await supabase.from("organizations").insert(row);
    setLoading(false);
    if (error) return setError(errMsg(error));
    onSaved();
  }

  async function remove() {
    if (!org || prompt(`Para excluir definitivamente, digite o nome do cliente: ${org.name}`) !== org.name) return;
    const { error } = await supabase.from("organizations").delete().eq("id", org.id);
    if (error) return setError(errMsg(error));
    onSaved();
  }

  return (
    <Modal open onClose={onClose} title={org ? "Editar cliente" : "Novo cliente"}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nome"><Input required value={f.name} onChange={set("name")} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo">
            <Select value={f.kind} onChange={set("kind")}>
              {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="CNPJ / CPF"><Input value={f.document} onChange={set("document")} /></Field>
        </div>
        {f.kind !== "residencial" && (
          <Field label="As unidades são organizadas por" hint="Usado para agrupar as residências e enviar comunicados por grupo.">
            <Select value={f.group_label} onChange={set("group_label")}>
              {["Bloco", "Rua", "Quadra", "Torre"].map((g) => <option key={g}>{g}</option>)}
            </Select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="E-mail"><Input type="email" value={f.email} onChange={set("email")} /></Field>
          <Field label="Telefone"><Input value={f.phone} onChange={set("phone")} /></Field>
        </div>
        <Field label="Endereço"><Input value={f.address} onChange={set("address")} /></Field>
        <Field label="Fuso horário" hint="Usado nos horários das chaves temporárias.">
          <Select value={f.timezone} onChange={set("timezone")}>
            {["America/Sao_Paulo", "America/Manaus", "America/Cuiaba", "America/Belem", "America/Fortaleza", "America/Recife", "America/Bahia", "America/Rio_Branco", "America/Noronha"].map((t) => <option key={t}>{t}</option>)}
          </Select>
        </Field>
        {error && <Alert>{error}</Alert>}
        <div className="flex gap-2">
          {org && <Button type="button" variant="danger" onClick={remove}><Trash2 className="size-4" /></Button>}
          <Button type="submit" className="flex-1" loading={loading}>Salvar</Button>
        </div>
      </form>
    </Modal>
  );
}

function AdminsModal({ org, onClose, onChanged }: { org: OrgRow; onClose: () => void; onChanged: () => void }) {
  const admins = useLoad(async () =>
    must(await supabase.from("org_admins").select("user_id, profiles(full_name, email)").eq("org_id", org.id)) as unknown as
      { user_id: string; profiles: { full_name: string | null; email: string | null } | null }[]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.rpc("add_org_admin", { p_org: org.id, p_email: email });
    if (error) return setError(errMsg(error));
    setEmail("");
    admins.reload(true);
    onChanged();
  }

  return (
    <Modal open onClose={onClose} title={`Administradores · ${org.name}`}>
      <div className="space-y-4">
        <ul className="space-y-2">
          {(admins.data ?? []).map((a) => (
            <li key={a.user_id} className="flex items-center justify-between text-sm">
              <span>{a.profiles?.full_name || "—"} <span className="text-slate-500">· {a.profiles?.email}</span></span>
              <Button size="sm" variant="ghost" onClick={async () => {
                await supabase.from("org_admins").delete().eq("org_id", org.id).eq("user_id", a.user_id);
                admins.reload(true); onChanged();
              }}><Trash2 className="size-4" /></Button>
            </li>
          ))}
          {admins.data?.length === 0 && <li className="text-sm text-slate-500">Nenhum administrador.</li>}
        </ul>
        <form onSubmit={add} className="space-y-3">
          <Field label="Adicionar administrador" hint="A pessoa precisa ter criado a conta antes.">
            <Input type="email" required placeholder="e-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" className="w-full"><UserPlus className="size-4" /> Adicionar</Button>
        </form>
      </div>
    </Modal>
  );
}

function NewHomeModal({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const { refresh } = useAuth();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [owner, setOwner] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc("create_home", {
      p_name: name.trim(), p_address: address.trim() || null, p_owner_email: owner.trim() || null,
    });
    setLoading(false);
    if (error) return setError(errMsg(error));
    await refresh();
    nav(`/residencias/${(data as { residence_id: string }).residence_id}`);
  }

  return (
    <Modal open onClose={onClose} title="Nova casa (residência comum)">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nome da casa" hint="Ex.: Casa Família Silva">
          <Input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Endereço"><Input value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
        <Field label="E-mail do dono (opcional)" hint="Se a pessoa já tem conta, ela vira titular e administradora da casa. Se não, deixe em branco e gere um convite de titular na próxima tela.">
          <Input type="email" value={owner} onChange={(e) => setOwner(e.target.value)} />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" className="w-full" loading={loading}>Criar casa</Button>
      </form>
    </Modal>
  );
}
