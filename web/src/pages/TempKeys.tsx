import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import QRCode from "qrcode";
import { Ban, KeyRound, Plus, QrCode } from "lucide-react";
import { supabase, type Command, type Gate, type TempKey } from "../lib/supabase";
import { CMD_LABEL, WEEKDAYS, errMsg, fmtDate, must, toLocalInput, useLoad } from "../lib/util";
import { Alert, Badge, Button, Card, CopyButton, Empty, Field, Input, Loading, Modal, PageHeader, Select } from "../components/ui";

export const keyLink = (token: string) => `${window.location.origin}/k/${token}`;

function keyStatus(k: TempKey): { label: string; tone: "green" | "red" | "amber" | "gray" } {
  if (k.revoked_at) return { label: "Revogada", tone: "red" };
  if (new Date(k.valid_until) <= new Date()) return { label: "Expirada", tone: "gray" };
  if (k.max_uses !== null && k.uses >= k.max_uses) return { label: "Esgotada", tone: "gray" };
  if (new Date(k.valid_from) > new Date()) return { label: "Agendada", tone: "amber" };
  return { label: "Ativa", tone: "green" };
}

export default function TempKeysPage() {
  const [params, setParams] = useSearchParams();
  const residences = useLoad(async () => {
    // Residências que o usuário pode gerenciar (admin da organização ou titular).
    const rows = must(await supabase.from("residences").select("id, name, org_id").order("name")) as { id: string; name: string; org_id: string }[];
    const checks = await Promise.all(rows.map((r) => supabase.rpc("can_manage_residence", { p_res: r.id })));
    return rows.filter((_, i) => checks[i].data === true);
  });
  const resId = params.get("residencia") ?? residences.data?.[0]?.id ?? "";

  const keys = useLoad(async () => {
    if (!resId) return [];
    return must(await supabase.from("temp_keys").select("*").eq("residence_id", resId).order("created_at", { ascending: false })) as TempKey[];
  }, [resId]);
  const gates = useLoad(async () => {
    if (!resId) return [];
    const r = must(await supabase.from("gate_residences").select("gates(*)").eq("residence_id", resId)) as unknown as { gates: Gate | null }[];
    return r.map((x) => x.gates).filter(Boolean) as Gate[];
  }, [resId]);

  const [creating, setCreating] = useState(false);
  const [show, setShow] = useState<TempKey | null>(null);
  const [usage, setUsage] = useState<TempKey | null>(null);

  if (residences.loading) return <Loading />;
  if (!residences.data?.length) {
    return <Empty icon={<KeyRound className="size-8" />} title="Nenhuma residência para gerenciar" />;
  }

  return (
    <div>
      <PageHeader
        title="Chaves temporárias"
        subtitle="Libere o portão para visitantes, prestadores e entregadores por um período definido, sem precisar de conta."
        actions={<Button onClick={() => setCreating(true)} disabled={!gates.data?.length}><Plus className="size-4" /> Nova chave</Button>}
      />
      {residences.data.length > 1 && (
        <Select className="mb-4 max-w-xs" value={resId} onChange={(e) => setParams({ residencia: e.target.value })}>
          {residences.data.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
      )}
      {gates.data && gates.data.length === 0 && (
        <div className="mb-4"><Alert tone="amber">Esta residência ainda não tem portões vinculados.</Alert></div>
      )}

      {keys.loading ? <Loading /> : !keys.data?.length ? (
        <Empty icon={<KeyRound className="size-8" />} title="Nenhuma chave criada" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {keys.data.map((k) => {
            const st = keyStatus(k);
            return (
              <Card key={k.id} className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{k.label}</div>
                    <div className="text-xs text-slate-500">{fmtDate(k.valid_from)} → {fmtDate(k.valid_until)}</div>
                  </div>
                  <Badge tone={st.tone} dot>{st.label}</Badge>
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {k.daily_start && <Badge>{k.daily_start.slice(0, 5)}–{k.daily_end?.slice(0, 5)}</Badge>}
                  {k.weekdays && <Badge>{k.weekdays.map((d) => WEEKDAYS[d]).join(", ")}</Badge>}
                  <Badge>{k.uses}{k.max_uses ? `/${k.max_uses}` : ""} uso(s)</Badge>
                  <Badge>{k.gate_ids.map((id) => gates.data?.find((g) => g.id === id)?.name ?? "portão").join(", ")}</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(st.label === "Ativa" || st.label === "Agendada") && <Button size="sm" variant="secondary" onClick={() => setShow(k)}><QrCode className="size-4" /> Compartilhar</Button>}
                  <Button size="sm" variant="ghost" onClick={() => setUsage(k)}>Utilização</Button>
                  {(st.label === "Ativa" || st.label === "Agendada") && (
                    <Button size="sm" variant="ghost" className="text-red-600"
                      onClick={async () => {
                        if (!confirm("Revogar esta chave? Ela deixa de funcionar imediatamente.")) return;
                        await supabase.from("temp_keys").update({ revoked_at: new Date().toISOString() }).eq("id", k.id);
                        keys.reload(true);
                      }}>
                      <Ban className="size-4" /> Revogar
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {creating && <NewKeyModal residenceId={resId} gates={gates.data ?? []} onClose={() => setCreating(false)}
        onCreated={(k) => { setCreating(false); keys.reload(true); setShow(k); }} />}
      {show && <ShareKey k={show} onClose={() => setShow(null)} />}
      {usage && <UsageModal k={usage} onClose={() => setUsage(null)} />}
    </div>
  );
}

function NewKeyModal({ residenceId, gates, onClose, onCreated }: {
  residenceId: string; gates: Gate[]; onClose: () => void; onCreated: (k: TempKey) => void;
}) {
  const now = new Date();
  const [label, setLabel] = useState("");
  const [sel, setSel] = useState<string[]>(gates.map((g) => g.id));
  const [from, setFrom] = useState(toLocalInput(now));
  const [until, setUntil] = useState(toLocalInput(new Date(now.getTime() + 24 * 3600_000)));
  const [useHours, setUseHours] = useState(false);
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("18:00");
  const [days, setDays] = useState<number[] | null>(null);
  const [maxUses, setMaxUses] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = must(await supabase.rpc("create_temp_key", {
        p_res: residenceId, p_label: label.trim(), p_gates: sel,
        p_valid_from: new Date(from).toISOString(), p_valid_until: new Date(until).toISOString(),
        p_daily_start: useHours ? start : null, p_daily_end: useHours ? end : null,
        p_weekdays: days && days.length ? days : null,
        p_max_uses: maxUses ? Number(maxUses) : null,
      })) as { id: string };
      onCreated(must(await supabase.from("temp_keys").select("*").eq("id", r.id).single()) as TempKey);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Nova chave temporária" wide>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Para quem é" hint="Ex.: Diarista, Entregador, Visita da Ana">
          <Input required maxLength={80} value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field label="Portões liberados">
          <div className="flex flex-wrap gap-3">
            {gates.map((g) => (
              <label key={g.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-brand-500" checked={sel.includes(g.id)}
                  onChange={(e) => setSel((s) => e.target.checked ? [...s, g.id] : s.filter((x) => x !== g.id))} />
                {g.name}
              </label>
            ))}
          </div>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Válida a partir de"><Input type="datetime-local" required value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Válida até"><Input type="datetime-local" required value={until} onChange={(e) => setUntil(e.target.value)} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-brand-500" checked={useHours} onChange={(e) => setUseHours(e.target.checked)} />
          Limitar horário do dia
        </label>
        {useHours && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Das"><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label="Até"><Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
          </div>
        )}
        <Field label="Dias da semana" hint="Nenhum marcado = todos os dias.">
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((d, i) => {
              const on = days?.includes(i);
              return (
                <button type="button" key={d}
                  onClick={() => setDays((s) => on ? (s ?? []).filter((x) => x !== i) : [...(s ?? []), i].sort())}
                  className={`rounded-lg px-3 py-1.5 text-sm ring-1 ${on ? "bg-brand-500 text-white ring-brand-500" : "ring-slate-200 dark:ring-ink-700"}`}>
                  {d}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Limite de usos" hint="Vazio = sem limite dentro do período.">
          <Input type="number" min={1} max={1000} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" className="w-full" loading={loading} disabled={!sel.length}>Criar chave</Button>
      </form>
    </Modal>
  );
}

function ShareKey({ k, onClose }: { k: TempKey; onClose: () => void }) {
  const link = keyLink(k.token);
  const [qr, setQr] = useState("");
  useEffect(() => { QRCode.toDataURL(link, { width: 480, margin: 1 }).then(setQr); }, [link]);
  return (
    <Modal open onClose={onClose} title={`Chave: ${k.label}`}>
      <div className="space-y-4 text-center">
        {qr && <img src={qr} alt="QR Code da chave" className="mx-auto w-56 rounded-xl bg-white p-2" />}
        <p className="text-sm text-slate-500">Quem tiver este link poderá acionar os portões liberados dentro do período. Envie apenas para a pessoa certa.</p>
        <div className="break-all rounded-xl bg-slate-50 p-3 text-xs dark:bg-ink-850">{link}</div>
        <div className="flex justify-center gap-2">
          <CopyButton text={link} label="Copiar link" />
          <a href={`https://wa.me/?text=${encodeURIComponent(`Seu acesso ao portão: ${link}`)}`} target="_blank" rel="noreferrer">
            <Button size="sm" variant="secondary">WhatsApp</Button>
          </a>
        </div>
      </div>
    </Modal>
  );
}

function UsageModal({ k, onClose }: { k: TempKey; onClose: () => void }) {
  const list = useLoad(async () =>
    must(await supabase.from("commands").select("*, gates(name)").eq("temp_key_id", k.id)
      .order("created_at", { ascending: false }).limit(100)) as unknown as (Command & { gates: { name: string } | null })[]);
  return (
    <Modal open onClose={onClose} title={`Utilização: ${k.label}`}>
      {list.loading ? <Loading /> : !list.data?.length ? <p className="text-sm text-slate-500">A chave ainda não foi usada.</p> : (
        <ul className="divide-y divide-slate-100 text-sm dark:divide-ink-800">
          {list.data.map((c) => (
            <li key={c.id} className="flex justify-between py-2">
              <span>{fmtDate(c.created_at)} · {c.gates?.name}</span>
              <Badge tone={c.status === "sucesso" ? "green" : c.status === "falha" || c.status === "expirado" ? "red" : "amber"}>{CMD_LABEL[c.status]}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
