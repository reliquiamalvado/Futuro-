import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Building2, Check, Clock, X } from "lucide-react";
import { useAuth } from "../lib/auth";
import { supabase, type GroupLabel } from "../lib/supabase";
import { errMsg, fmtDate, must, useLoad } from "../lib/util";
import { Alert, Badge, Button, Card, Field, Input, Loading, Modal, PageHeader, Select, Textarea } from "../components/ui";

export interface OrgRequest {
  id: string;
  user_id: string;
  kind: "condominio" | "empresa";
  org_name: string;
  group_label: GroupLabel;
  city: string | null;
  phone: string | null;
  units: number | null;
  notes: string | null;
  status: "pendente" | "aprovada" | "recusada";
  answer: string | null;
  created_at: string;
  reviewed_at: string | null;
  profiles?: { full_name: string | null; email: string | null; phone: string | null } | null;
}

/** Tela do síndico/empresa: envia o pedido e acompanha a análise. */
export default function OrgRequestPage() {
  const { profile, refresh } = useAuth();
  const list = useLoad(async () =>
    must(await supabase.from("org_requests").select("*").eq("user_id", profile!.id)
      .order("created_at", { ascending: false })) as OrgRequest[], [profile?.id]);

  const [kind, setKind] = useState<"condominio" | "empresa">(profile?.account_type === "empresa" ? "empresa" : "condominio");
  const [name, setName] = useState("");
  const [group, setGroup] = useState<GroupLabel>("Bloco");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [units, setUnits] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.from("org_requests").insert({
      user_id: profile!.id, kind, org_name: name.trim(), group_label: group,
      city: city.trim() || null, phone: phone.trim() || null,
      units: units ? Number(units) : null, notes: notes.trim() || null,
    });
    setLoading(false);
    if (error) return setError(errMsg(error).includes("org_requests_one_pending")
      ? "Você já tem um pedido em análise." : errMsg(error));
    list.reload();
    refresh();
  }

  const pending = list.data?.find((r) => r.status === "pendente");
  const approved = list.data?.find((r) => r.status === "aprovada");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Cadastrar condomínio ou empresa"
        subtitle="Envie os dados. Depois da aprovação, você vira administrador e configura tudo pelo app." />

      {list.loading ? <Loading /> : (
        <>
          {approved && (
            <Alert tone="green">
              <b>{approved.org_name}</b> foi aprovado! Você já é administrador. <Link to="/" className="underline" onClick={() => refresh()}>Ir para o painel</Link>
            </Alert>
          )}

          {pending ? (
            <Card className="text-center">
              <Clock className="mx-auto mb-2 size-8 text-amber-500" />
              <h2 className="font-semibold">Pedido em análise</h2>
              <p className="mt-1 text-sm text-slate-500">
                {pending.kind === "condominio" ? "Condomínio" : "Empresa"} <b>{pending.org_name}</b>, enviado em {fmtDate(pending.created_at)}.
                Você será avisado aqui assim que for analisado.
              </p>
            </Card>
          ) : (
            <Card>
              <form onSubmit={submit} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Tipo">
                    <Select value={kind} onChange={(e) => setKind(e.target.value as "condominio" | "empresa")}>
                      <option value="condominio">Condomínio</option>
                      <option value="empresa">Empresa</option>
                    </Select>
                  </Field>
                  <Field label={kind === "condominio" ? "Nome do condomínio" : "Nome da empresa"}>
                    <Input required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
                  </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label={kind === "condominio" ? "Organizado por" : "Organizado por"}>
                    <Select value={group} onChange={(e) => setGroup(e.target.value as GroupLabel)}>
                      {["Bloco", "Rua", "Quadra", "Torre"].map((g) => <option key={g}>{g}</option>)}
                    </Select>
                  </Field>
                  <Field label={kind === "condominio" ? "Nº de unidades" : "Nº de salas/setores"}>
                    <Input type="number" min={1} value={units} onChange={(e) => setUnits(e.target.value)} />
                  </Field>
                  <Field label="Cidade"><Input maxLength={80} value={city} onChange={(e) => setCity(e.target.value)} /></Field>
                </div>
                <Field label="Telefone / WhatsApp para contato">
                  <Input type="tel" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} />
                </Field>
                <Field label="Observações (opcional)" hint="Ex.: quantos portões, se já tem central de portão, melhor horário para contato.">
                  <Textarea rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </Field>
                {error && <Alert>{error}</Alert>}
                <Button type="submit" className="w-full" loading={loading}>Enviar pedido</Button>
              </form>
            </Card>
          )}

          {(list.data ?? []).filter((r) => r.status === "recusada").map((r) => (
            <Alert key={r.id} tone="amber">
              Pedido de <b>{r.org_name}</b> ({fmtDate(r.created_at)}) não aprovado.{r.answer ? ` Motivo: ${r.answer}` : ""}
            </Alert>
          ))}
        </>
      )}
    </div>
  );
}

/** Lista de pedidos pendentes para o super admin (usada na tela Clientes). */
export function PendingRequests({ onChanged }: { onChanged: () => void }) {
  const list = useLoad(async () =>
    must(await supabase.from("org_requests").select("*, profiles:user_id(full_name, email, phone)")
      .eq("status", "pendente").order("created_at")) as unknown as OrgRequest[]);
  const [reject, setReject] = useState<OrgRequest | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function review(r: OrgRequest, approve: boolean, text?: string) {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("review_org_request", { p_id: r.id, p_approve: approve, p_answer: text ?? null });
    setBusy(false);
    if (error) return setError(errMsg(error));
    setReject(null);
    setAnswer("");
    list.reload(true);
    onChanged();
  }

  if (!list.data?.length) return null;
  return (
    <Card className="ring-amber-300 dark:ring-amber-500/40">
      <h2 className="mb-3 flex items-center gap-2 font-semibold">
        <Building2 className="size-5 text-amber-500" /> Pedidos de cadastro <Badge tone="amber">{list.data.length}</Badge>
      </h2>
      {error && <div className="mb-3"><Alert>{error}</Alert></div>}
      <ul className="divide-y divide-slate-100 dark:divide-ink-800">
        {list.data.map((r) => (
          <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
            <div className="min-w-0 text-sm">
              <div className="font-medium">{r.org_name} <Badge>{r.kind === "condominio" ? "Condomínio" : "Empresa"}</Badge></div>
              <div className="text-xs text-slate-500">
                {[r.city, r.units ? `${r.units} unidades` : null, `por ${r.group_label}`].filter(Boolean).join(" · ")}
              </div>
              <div className="text-xs text-slate-500">
                {r.profiles?.full_name} · {r.profiles?.email}{r.phone ? ` · ${r.phone}` : ""} · {fmtDate(r.created_at)}
              </div>
              {r.notes && <div className="mt-1 text-xs italic text-slate-500">“{r.notes}”</div>}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="success" loading={busy} onClick={() => review(r, true)}><Check className="size-4" /> Aprovar</Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => setReject(r)}><X className="size-4" /> Recusar</Button>
            </div>
          </li>
        ))}
      </ul>
      {reject && (
        <Modal open onClose={() => setReject(null)} title={`Recusar ${reject.org_name}`}>
          <div className="space-y-4">
            <Field label="Motivo (a pessoa verá esta mensagem)">
              <Textarea rows={3} maxLength={500} value={answer} onChange={(e) => setAnswer(e.target.value)} />
            </Field>
            <Button variant="danger" className="w-full" loading={busy} onClick={() => review(reject, false, answer)}>Recusar pedido</Button>
          </div>
        </Modal>
      )}
    </Card>
  );
}
