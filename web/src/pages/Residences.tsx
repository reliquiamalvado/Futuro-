import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Home, Plus } from "lucide-react";
import { useAuth } from "../lib/auth";
import { supabase, type Residence } from "../lib/supabase";
import { errMsg, must, useLoad } from "../lib/util";
import { Alert, Button, Card, Empty, Field, Input, Loading, Modal, PageHeader, Select } from "../components/ui";

type Row = Residence & {
  organizations: { name: string } | null;
  residence_members: { status: string }[];
};

export default function ResidencesPage() {
  const { isAdmin, adminOrgs } = useAuth();
  const [orgFilter, setOrgFilter] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const list = useLoad(async () => {
    let q = supabase.from("residences")
      .select("*, organizations(name), residence_members(status)")
      .order("name");
    if (orgFilter) q = q.eq("org_id", orgFilter);
    return must(await q) as unknown as Row[];
  }, [orgFilter]);

  const rows = (list.data ?? []).filter((r) =>
    !search || `${r.name} ${r.address ?? ""} ${r.complement ?? ""}`.toLowerCase().includes(search.toLowerCase()));

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
      </div>

      {list.loading ? <Loading /> : list.error ? <Alert>{list.error}</Alert> : rows.length === 0 ? (
        <Empty icon={<Home className="size-8" />} title="Nenhuma residência">
          {isAdmin ? "Cadastre a primeira residência para começar a convidar moradores." : null}
        </Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => {
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
      )}

      <NewResidenceModal open={open} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); list.reload(); }} />
    </div>
  );
}

function NewResidenceModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { adminOrgs } = useAuth();
  const [org, setOrg] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [complement, setComplement] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      must(await supabase.from("residences").insert({
        org_id: org || adminOrgs[0]?.id, name: name.trim(),
        address: address.trim() || null, complement: complement.trim() || null,
      }).select().single());
      setName(""); setAddress(""); setComplement("");
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
        <Field label="Identificação" hint="Ex.: Casa 12, Apto 304 - Bloco B, Sala 5">
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
