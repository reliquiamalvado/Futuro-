import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Home, Plus } from "lucide-react";
import { useAuth } from "../lib/auth";
import { supabase, type Residence } from "../lib/supabase";
import { errMsg, must, useLoad } from "../lib/util";
import { Alert, Button, Card, Empty, Field, Input, Loading, Modal, PageHeader, Select } from "../components/ui";

type Row = Residence & {
  organizations: { name: string; group_label: string; kind: string } | null;
  residence_members: { status: string }[];
};

export default function ResidencesPage() {
  const { isAdmin, adminOrgs } = useAuth();
  const [orgFilter, setOrgFilter] = useState("");
  const [search, setSearch] = useState("");
  const [block, setBlock] = useState("");
  const [open, setOpen] = useState(false);

  const list = useLoad(async () => {
    let q = supabase.from("residences")
      .select("*, organizations(name, group_label, kind), residence_members(status)")
      .order("block", { nullsFirst: false }).order("name");
    if (orgFilter) q = q.eq("org_id", orgFilter);
    return must(await q) as unknown as Row[];
  }, [orgFilter]);

  const blocks = [...new Set((list.data ?? []).map((r) => r.block).filter(Boolean))] as string[];
  const groupLabel = (list.data ?? []).find((r) => r.block)?.organizations?.group_label ?? "Bloco";
  const rows = (list.data ?? []).filter((r) =>
    (!block || (block === "__sem" ? !r.block : r.block === block)) &&
    (!search || `${r.name} ${r.block ?? ""} ${r.address ?? ""} ${r.complement ?? ""}`.toLowerCase().includes(search.toLowerCase())));
  const groups = [...new Set(rows.map((r) => r.block ?? ""))];

  return (
    <div>
      <PageHeader
        title="Residências"
        subtitle="Moradores, aprovações, convites e portões de cada residência."
        actions={isAdmin && adminOrgs.length > 0 && <Button onClick={() => setOpen(true)}><Plus className="size-4" /> Nova residência</Button>}
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Input placeholder="Buscar residência…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        {adminOrgs.length > 1 && (
          <Select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)} className="max-w-xs">
            <option value="">Todas as organizações</option>
            {adminOrgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        )}
        {blocks.length > 0 && (
          <Select value={block} onChange={(e) => setBlock(e.target.value)} className="max-w-xs">
            <option value="">Todos os agrupamentos</option>
            {blocks.map((b) => <option key={b} value={b}>{b}</option>)}
            <option value="__sem">Sem agrupamento</option>
          </Select>
        )}
      </div>

      {list.loading ? <Loading /> : list.error ? <Alert>{list.error}</Alert> : rows.length === 0 ? (
        <Empty icon={<Home className="size-8" />} title="Nenhuma residência">
          {isAdmin ? "Cadastre a primeira residência para começar a convidar moradores." : null}
        </Empty>
      ) : (
        <div className="space-y-6">
        {groups.map((gname) => (
        <section key={gname || "__sem"}>
          {groups.length > 1 || gname ? (
            <h2 className="mb-2 text-sm font-semibold text-slate-500">
              {gname || `Sem ${groupLabel.toLowerCase()}`} · {rows.filter((r) => (r.block ?? "") === gname).length}
            </h2>
          ) : null}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.filter((r) => (r.block ?? "") === gname).map((r) => {
            const active = r.residence_members.filter((m) => m.status === "ativo").length;
            const pending = r.residence_members.filter((m) => m.status === "pendente").length;
            return (
              <Link key={r.id} to={`/residencias/${r.id}`}>
                <Card className="flex items-center justify-between gap-3 transition hover:ring-brand-500/50">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{r.name}</div>
                    <div className="truncate text-sm text-slate-500 dark:text-slate-400">
                      {[r.address, r.complement].filter(Boolean).join(", ") || r.organizations?.name}
                    </div>
                    <div className="mt-2 flex gap-3 text-xs text-slate-500">
                      <span>{active} morador(es)</span>
                      {pending > 0 && <span className="font-medium text-amber-600">{pending} pendente(s)</span>}
                    </div>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-slate-400" />
                </Card>
              </Link>
            );
          })}
        </div>
        </section>
        ))}
        </div>
      )}

      <NewResidenceModal open={open} knownBlocks={blocks} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); list.reload(); }} />
    </div>
  );
}

function NewResidenceModal({ open, onClose, onSaved, knownBlocks }: {
  open: boolean; onClose: () => void; onSaved: () => void; knownBlocks: string[];
}) {
  const { adminOrgs } = useAuth();
  const [org, setOrg] = useState("");
  const [name, setName] = useState("");
  const [blockName, setBlockName] = useState("");
  const [address, setAddress] = useState("");
  const [complement, setComplement] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const selOrg = adminOrgs.find((o) => o.id === (org || adminOrgs[0]?.id));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      must(await supabase.from("residences").insert({
        org_id: org || adminOrgs[0]?.id, name: name.trim(), block: blockName.trim() || null,
        address: address.trim() || null, complement: complement.trim() || null,
      }).select().single());
      setName(""); setBlockName(""); setAddress(""); setComplement("");
      onSaved();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nova residência">
      <form onSubmit={submit} className="space-y-4">
        {adminOrgs.length > 1 && (
          <Field label="Organização">
            <Select required value={org} onChange={(e) => setOrg(e.target.value)}>
              <option value="">Selecione…</option>
              {adminOrgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select>
          </Field>
        )}
        {selOrg?.kind !== "residencial" && (
          <Field label={`${selOrg?.group_label ?? "Bloco"} (opcional)`} hint={`Ex.: ${selOrg?.group_label === "Rua" ? "Rua das Acácias" : selOrg?.group_label === "Quadra" ? "Quadra 3" : selOrg?.group_label === "Torre" ? "Torre 2" : "Bloco B"}`}>
            <Input value={blockName} list="dc-blocos" onChange={(e) => setBlockName(e.target.value)} />
            <datalist id="dc-blocos">{knownBlocks.map((b) => <option key={b} value={b} />)}</datalist>
          </Field>
        )}
        <Field label="Identificação" hint="Ex.: Casa 12, Apto 304, Sala 5">
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Endereço"><Input value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
        <Field label="Complemento"><Input value={complement} onChange={(e) => setComplement(e.target.value)} /></Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" className="w-full" loading={loading}>Cadastrar</Button>
      </form>
    </Modal>
  );
}
