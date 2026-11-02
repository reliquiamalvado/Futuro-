import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import QRCode from "qrcode";
import { ArrowLeft, Ban, Check, DoorOpen, KeyRound, Link2, Pencil, QrCode, Trash2, UserPlus } from "lucide-react";
import { useAuth } from "../lib/auth";
import { supabase, type Gate, type Invite, type MemberRole, type Residence, type ResidenceMember } from "../lib/supabase";
import { ROLE_LABEL, STATUS_LABEL, errMsg, fmtDate, must, useLoad } from "../lib/util";
import { Alert, Badge, Button, Card, CopyButton, Empty, Field, Input, Loading, Modal, PageHeader, Select, Table, Td } from "../components/ui";

type MemberRow = ResidenceMember & { profiles: { full_name: string | null; email: string | null; phone: string | null } | null };

export default function ResidenceDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { profile, adminOrgs, isSuper } = useAuth();

  const res = useLoad(async () =>
    must(await supabase.from("residences").select("*, organizations(name)").eq("id", id).single()) as
      Residence & { organizations: { name: string } | null }, [id]);
  const members = useLoad(async () =>
    must(await supabase.from("residence_members")
      .select("*, profiles:user_id(full_name, email, phone)")
      .eq("residence_id", id).order("created_at")) as unknown as MemberRow[], [id]);
  const gates = useLoad(async () => {
    const r = must(await supabase.from("gate_residences").select("gates(*)").eq("residence_id", id)) as unknown as { gates: Gate | null }[];
    return r.map((x) => x.gates).filter(Boolean) as Gate[];
  }, [id]);

  const [edit, setEdit] = useState(false);
  const [addMember, setAddMember] = useState(false);
  const [permFor, setPermFor] = useState<MemberRow | null>(null);
  const [linkGates, setLinkGates] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (res.loading) return <Loading />;
  if (res.error || !res.data) return <Alert>{res.error ?? "Residência não encontrada."}</Alert>;
  const r = res.data;
  const isAdmin = isSuper || adminOrgs.some((o) => o.id === r.org_id);

  async function act(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setActionError(null);
    const { error } = await fn();
    if (error) setActionError(errMsg(error));
    members.reload(true);
  }

  const pending = (members.data ?? []).filter((m) => m.status === "pendente");

  return (
    <div className="space-y-6">
      <Link to="/residencias" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-500">
        <ArrowLeft className="size-4" /> Residências
      </Link>
      <PageHeader
        title={r.name}
        subtitle={[r.organizations?.name, r.address, r.complement].filter(Boolean).join(" · ")}
        actions={<>
          <Link to={`/chaves?residencia=${r.id}`}><Button variant="secondary"><KeyRound className="size-4" /> Chaves temporárias</Button></Link>
          {isAdmin && <Button variant="secondary" onClick={() => setEdit(true)}><Pencil className="size-4" /> Editar</Button>}
        </>}
      />

      {actionError && <Alert>{actionError}</Alert>}

      {pending.length > 0 && (
        <Card className="ring-amber-300 dark:ring-amber-500/40">
          <h2 className="mb-3 font-semibold">Aguardando aprovação</h2>
          <ul className="space-y-2">
            {pending.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{m.profiles?.full_name || m.profiles?.email}</div>
                  <div className="text-xs text-slate-500">{m.profiles?.email} · {ROLE_LABEL[m.role]} · pediu em {fmtDate(m.created_at)}</div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="success" onClick={() => act(() => supabase.from("residence_members").update({ status: "ativo" }).eq("id", m.id))}>
                    <Check className="size-4" /> Aprovar
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => confirm("Recusar esta solicitação?") && act(() => supabase.from("residence_members").delete().eq("id", m.id))}>
                    Recusar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Moradores</h2>
          <Button size="sm" variant="secondary" onClick={() => setAddMember(true)}><UserPlus className="size-4" /> Adicionar por e-mail</Button>
        </div>
        {members.loading ? <Loading /> : (
          <Table head={["Nome", "Papel", "Status", "Portões", ""]}>
            {(members.data ?? []).filter((m) => m.status !== "pendente").map((m) => {
              const isSelf = m.user_id === profile?.id;
              const canEdit = isAdmin || (m.role === "morador" && !isSelf);
              return (
                <tr key={m.id}>
                  <Td>
                    <div className="font-medium">{m.profiles?.full_name || "—"}{isSelf && " (você)"}</div>
                    <div className="text-xs text-slate-500">{m.profiles?.email}{m.profiles?.phone ? ` · ${m.profiles.phone}` : ""}</div>
                  </Td>
                  <Td>
                    {isAdmin && !isSelf ? (
                      <Select value={m.role} className="w-32 py-1.5"
                        onChange={(e) => act(() => supabase.from("residence_members").update({ role: e.target.value as MemberRole }).eq("id", m.id))}>
                        <option value="titular">Titular</option>
                        <option value="morador">Morador</option>
                      </Select>
                    ) : <Badge tone={m.role === "titular" ? "blue" : "gray"}>{ROLE_LABEL[m.role]}</Badge>}
                  </Td>
                  <Td><Badge tone={m.status === "ativo" ? "green" : "red"} dot>{STATUS_LABEL[m.status]}</Badge></Td>
                  <Td>
                    {m.allowed_gates === null ? <span className="text-slate-500">Todos</span> : `${m.allowed_gates.length} portão(ões)`}
                  </Td>
                  <Td className="text-right">
                    {canEdit && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setPermFor(m)} title="Permissões"><DoorOpen className="size-4" /></Button>
                        {m.status === "ativo" ? (
                          <Button size="sm" variant="ghost" title="Bloquear"
                            onClick={() => confirm("Bloquear o acesso desta pessoa?") && act(() => supabase.from("residence_members").update({ status: "bloqueado" }).eq("id", m.id))}>
                            <Ban className="size-4" />
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" title="Desbloquear"
                            onClick={() => act(() => supabase.from("residence_members").update({ status: "ativo" }).eq("id", m.id))}>
                            <Check className="size-4" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" title="Remover"
                          onClick={() => confirm("Remover esta pessoa da residência?") && act(() => supabase.from("residence_members").delete().eq("id", m.id))}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    )}
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <Invites residenceId={r.id} isAdmin={isAdmin} />

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Portões liberados</h2>
          {isAdmin && <Button size="sm" variant="secondary" onClick={() => setLinkGates(true)}><Link2 className="size-4" /> Vincular portões</Button>}
        </div>
        {(gates.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum portão vinculado a esta residência.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {gates.data!.map((g) => <Badge key={g.id} tone="blue">{g.name}</Badge>)}
          </div>
        )}
      </Card>

      {edit && <EditResidence r={r} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); res.reload(); }}
        onDeleted={() => nav("/residencias")} />}
      <AddMemberModal open={addMember} residenceId={r.id} isAdmin={isAdmin} onClose={() => setAddMember(false)}
        onSaved={() => { setAddMember(false); members.reload(); }} />
      {permFor && <PermissionsModal member={permFor} gates={gates.data ?? []} onClose={() => setPermFor(null)}
        onSaved={() => { setPermFor(null); members.reload(); }} />}
      {linkGates && <LinkGatesModal residence={r} linked={gates.data ?? []} onClose={() => setLinkGates(false)}
        onSaved={() => { setLinkGates(false); gates.reload(); }} />}
    </div>
  );
}

function EditResidence({ r, onClose, onSaved, onDeleted }: {
  r: Residence; onClose: () => void; onSaved: () => void; onDeleted: () => void;
}) {
  const [name, setName] = useState(r.name);
  const [address, setAddress] = useState(r.address ?? "");
  const [complement, setComplement] = useState(r.complement ?? "");
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("residences")
      .update({ name: name.trim(), address: address.trim() || null, complement: complement.trim() || null }).eq("id", r.id);
    if (error) return setError(errMsg(error));
    onSaved();
  }
  async function remove() {
    if (!confirm(`Excluir "${r.name}"? Moradores, convites e chaves desta residência serão removidos.`)) return;
    const { error } = await supabase.from("residences").delete().eq("id", r.id);
    if (error) return setError(errMsg(error));
    onDeleted();
  }

  return (
    <Modal open onClose={onClose} title="Editar residência">
      <form onSubmit={save} className="space-y-4">
        <Field label="Identificação"><Input required value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Endereço"><Input value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
        <Field label="Complemento"><Input value={complement} onChange={(e) => setComplement(e.target.value)} /></Field>
        {error && <Alert>{error}</Alert>}
        <div className="flex gap-2">
          <Button type="button" variant="danger" onClick={remove}><Trash2 className="size-4" /> Excluir</Button>
          <Button type="submit" className="flex-1">Salvar</Button>
        </div>
      </form>
    </Modal>
  );
}

function AddMemberModal({ open, residenceId, isAdmin, onClose, onSaved }: {
  open: boolean; residenceId: string; isAdmin: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("morador");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.rpc("add_residence_member", { p_res: residenceId, p_email: email, p_role: role });
    setLoading(false);
    if (error) return setError(errMsg(error));
    setEmail("");
    onSaved();
  }

  return (
    <Modal open={open} onClose={onClose} title="Adicionar morador">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-500">A pessoa precisa já ter conta no DigitalControl. Para quem ainda não tem, gere um convite.</p>
        <Field label="E-mail"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        {isAdmin && (
          <Field label="Papel">
            <Select value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
              <option value="morador">Morador</option>
              <option value="titular">Titular</option>
            </Select>
          </Field>
        )}
        {error && <Alert>{error}</Alert>}
        <Button type="submit" className="w-full" loading={loading}>Adicionar</Button>
      </form>
    </Modal>
  );
}

function PermissionsModal({ member, gates, onClose, onSaved }: {
  member: MemberRow; gates: Gate[]; onClose: () => void; onSaved: () => void;
}) {
  const [all, setAll] = useState(member.allowed_gates === null);
  const [sel, setSel] = useState<string[]>(member.allowed_gates ?? []);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const { error } = await supabase.from("residence_members")
      .update({ allowed_gates: all ? null : sel }).eq("id", member.id);
    if (error) return setError(errMsg(error));
    onSaved();
  }

  return (
    <Modal open onClose={onClose} title={`Permissões de ${member.profiles?.full_name || member.profiles?.email}`}>
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="size-4 accent-brand-500" />
          Todos os portões da residência (inclusive os que forem adicionados depois)
        </label>
        {!all && (
          <div className="space-y-2 rounded-xl bg-slate-50 p-3 dark:bg-ink-850">
            {gates.length === 0 && <p className="text-sm text-slate-500">Nenhum portão vinculado.</p>}
            {gates.map((g) => (
              <label key={g.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-brand-500" checked={sel.includes(g.id)}
                  onChange={(e) => setSel((s) => e.target.checked ? [...s, g.id] : s.filter((x) => x !== g.id))} />
                {g.name}
              </label>
            ))}
          </div>
        )}
        {error && <Alert>{error}</Alert>}
        <Button className="w-full" onClick={save}>Salvar permissões</Button>
      </div>
    </Modal>
  );
}

function LinkGatesModal({ residence, linked, onClose, onSaved }: {
  residence: Residence; linked: Gate[]; onClose: () => void; onSaved: () => void;
}) {
  const orgGates = useLoad(async () =>
    must(await supabase.from("gates").select("*").eq("org_id", residence.org_id).order("name")) as Gate[]);
  const [sel, setSel] = useState<string[]>(linked.map((g) => g.id));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function save() {
    setLoading(true);
    setError(null);
    const before = new Set(linked.map((g) => g.id));
    const after = new Set(sel);
    const add = sel.filter((g) => !before.has(g)).map((g) => ({ gate_id: g, residence_id: residence.id }));
    const del = [...before].filter((g) => !after.has(g));
    try {
      if (add.length) must(await supabase.from("gate_residences").insert(add).select());
      if (del.length) must(await supabase.from("gate_residences").delete().eq("residence_id", residence.id).in("gate_id", del).select());
      onSaved();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Portões desta residência">
      {orgGates.loading ? <Loading /> : (orgGates.data ?? []).length === 0 ? (
        <Empty title="Nenhum portão cadastrado">Cadastre em <Link className="text-brand-500" to="/dispositivos">Portões e dispositivos</Link>.</Empty>
      ) : (
        <div className="space-y-3">
          {orgGates.data!.map((g) => (
            <label key={g.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-brand-500" checked={sel.includes(g.id)}
                onChange={(e) => setSel((s) => e.target.checked ? [...s, g.id] : s.filter((x) => x !== g.id))} />
              {g.name}
            </label>
          ))}
          {error && <Alert>{error}</Alert>}
          <Button className="w-full" loading={loading} onClick={save}>Salvar</Button>
        </div>
      )}
    </Modal>
  );
}

function Invites({ residenceId, isAdmin }: { residenceId: string; isAdmin: boolean }) {
  const list = useLoad(async () =>
    must(await supabase.from("invites").select("*").eq("residence_id", residenceId)
      .eq("revoked", false).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false })) as Invite[],
  [residenceId]);
  const [creating, setCreating] = useState(false);
  const [show, setShow] = useState<Invite | null>(null);

  const usable = (list.data ?? []).filter((i) => i.uses < i.max_uses);

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">Convites</h2>
        <Button size="sm" onClick={() => setCreating(true)}><QrCode className="size-4" /> Novo convite</Button>
      </div>
      {usable.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum convite ativo.</p>
      ) : (
        <Table head={["Código", "Papel", "Usos", "Expira", ""]}>
          {usable.map((i) => (
            <tr key={i.id}>
              <Td className="font-mono font-semibold tracking-widest">{i.code}</Td>
              <Td>{ROLE_LABEL[i.role]}{i.requires_approval && <span className="text-xs text-slate-500"> · com aprovação</span>}</Td>
              <Td>{i.uses}/{i.max_uses}</Td>
              <Td className="whitespace-nowrap">{fmtDate(i.expires_at)}</Td>
              <Td className="text-right">
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setShow(i)} title="QR Code"><QrCode className="size-4" /></Button>
                  <Button size="sm" variant="ghost" title="Revogar"
                    onClick={async () => { await supabase.from("invites").update({ revoked: true }).eq("id", i.id); list.reload(true); }}>
                    <Ban className="size-4" />
                  </Button>
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}
      {creating && <NewInvite residenceId={residenceId} isAdmin={isAdmin} onClose={() => setCreating(false)}
        onCreated={(inv) => { setCreating(false); list.reload(true); setShow(inv); }} />}
      {show && <InviteQr invite={show} onClose={() => setShow(null)} />}
    </Card>
  );
}

function NewInvite({ residenceId, isAdmin, onClose, onCreated }: {
  residenceId: string; isAdmin: boolean; onClose: () => void; onCreated: (i: Invite) => void;
}) {
  const [role, setRole] = useState<MemberRole>("morador");
  const [uses, setUses] = useState(1);
  const [hours, setHours] = useState(72);
  const [approval, setApproval] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const code = must(await supabase.rpc("create_invite", {
        p_res: residenceId, p_role: role, p_max_uses: uses, p_hours: hours, p_requires_approval: approval,
      })) as string;
      const inv = must(await supabase.from("invites").select("*").eq("code", code).single()) as Invite;
      onCreated(inv);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Novo convite">
      <form onSubmit={submit} className="space-y-4">
        {isAdmin && (
          <Field label="Papel de quem entrar">
            <Select value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
              <option value="morador">Morador</option>
              <option value="titular">Titular</option>
            </Select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantidade de usos"><Input type="number" min={1} max={500} value={uses} onChange={(e) => setUses(+e.target.value)} /></Field>
          <Field label="Validade">
            <Select value={hours} onChange={(e) => setHours(+e.target.value)}>
              <option value={24}>1 dia</option>
              <option value={72}>3 dias</option>
              <option value={168}>7 dias</option>
              <option value={720}>30 dias</option>
            </Select>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={approval} onChange={(e) => setApproval(e.target.checked)} className="size-4 accent-brand-500" />
          Exigir minha aprovação antes de liberar o acesso
        </label>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" className="w-full" loading={loading}>Gerar convite</Button>
      </form>
    </Modal>
  );
}

function InviteQr({ invite, onClose }: { invite: Invite; onClose: () => void }) {
  const link = `${window.location.origin}/convite/${invite.code}`;
  const [qr, setQr] = useState("");
  useEffect(() => { QRCode.toDataURL(link, { width: 480, margin: 1 }).then(setQr); }, [link]);
  const share = async () => {
    try { await navigator.share({ title: "Convite DigitalControl", text: `Use o código ${invite.code}`, url: link }); } catch { /* cancelado */ }
  };
  return (
    <Modal open onClose={onClose} title="Convite">
      <div className="space-y-4 text-center">
        {qr && <img src={qr} alt="QR Code do convite" className="mx-auto w-56 rounded-xl bg-white p-2" />}
        <div className="font-mono text-3xl font-bold tracking-[.3em]">{invite.code}</div>
        <p className="text-sm text-slate-500">Válido até {fmtDate(invite.expires_at)} · {invite.max_uses - invite.uses} uso(s) restante(s)</p>
        <div className="flex justify-center gap-2">
          <CopyButton text={link} label="Copiar link" />
          {"share" in navigator && <Button size="sm" variant="secondary" onClick={share}>Compartilhar</Button>}
        </div>
      </div>
    </Modal>
  );
}
