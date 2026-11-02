import { useState, type FormEvent } from "react";
import { AlertTriangle, Megaphone, Plus, Trash2 } from "lucide-react";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { errMsg, fmtDate, must, useLoad } from "../lib/util";
import { Alert, Badge, Button, Card, Empty, Field, Input, Loading, Modal, PageHeader, Select, Textarea, cx } from "../components/ui";

interface Ann {
  id: string;
  org_id: string;
  residence_id: string | null;
  block: string | null;
  title: string;
  body: string;
  important: boolean;
  created_at: string;
  organizations: { name: string } | null;
  residences: { name: string } | null;
  profiles: { full_name: string | null } | null;
  announcement_reads: { user_id: string }[];
}

/** Quantos comunicados o usuário ainda não leu (usado no menu). */
export async function unreadAnnouncements(userId: string): Promise<number> {
  const { data } = await supabase.from("announcements").select("id, announcement_reads(user_id)")
    .order("created_at", { ascending: false }).limit(100);
  return ((data ?? []) as { announcement_reads: { user_id: string }[] }[])
    .filter((a) => !a.announcement_reads.some((r) => r.user_id === userId)).length;
}

export default function AnnouncementsPage() {
  const { profile, adminOrgs, isAdmin, isSuper } = useAuth();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = useLoad(async () =>
    must(await supabase.from("announcements")
      .select("*, organizations(name), residences(name), profiles:created_by(full_name), announcement_reads(user_id)")
      .order("created_at", { ascending: false }).limit(200)) as unknown as Ann[]);

  const canManage = (a: Ann) => isSuper || adminOrgs.some((o) => o.id === a.org_id);
  const isRead = (a: Ann) => a.announcement_reads.some((r) => r.user_id === profile?.id);

  async function markRead(a: Ann) {
    if (isRead(a) || !profile) return;
    await supabase.from("announcement_reads").insert({ announcement_id: a.id, user_id: profile.id });
    list.reload(true);
    window.dispatchEvent(new Event("dc:comunicados"));
  }

  return (
    <div>
      <PageHeader
        title="Comunicados"
        subtitle={isAdmin ? "Avisos para os moradores, exibidos no app de cada um." : "Avisos da administração."}
        actions={isAdmin && adminOrgs.length > 0 && <Button onClick={() => setCreating(true)}><Plus className="size-4" /> Novo comunicado</Button>}
      />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      {list.loading ? <Loading /> : list.error ? <Alert>{list.error}</Alert> : !list.data?.length ? (
        <Empty icon={<Megaphone className="size-8" />} title="Nenhum comunicado" />
      ) : (
        <div className="space-y-3">
          {list.data.map((a) => {
            const read = isRead(a);
            return (
              <Card key={a.id} className={cx(!read && "ring-2 ring-brand-500/40", a.important && "ring-amber-400/60")}>
                <div onClick={() => markRead(a)} className="cursor-default">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {a.important && <AlertTriangle className="size-5 text-amber-500" aria-label="Importante" />}
                      <h2 className="font-semibold">{a.title}</h2>
                      {!read && <Badge tone="blue">Novo</Badge>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge>{a.residences?.name ?? a.block ?? `Todos · ${a.organizations?.name ?? ""}`}</Badge>
                      {canManage(a) && (
                        <Button size="sm" variant="ghost" title="Excluir" onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm("Excluir este comunicado?")) return;
                          const { error } = await supabase.from("announcements").delete().eq("id", a.id);
                          if (error) setError(errMsg(error));
                          list.reload(true);
                        }}><Trash2 className="size-4" /></Button>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{a.body}</p>
                  <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-slate-500">
                    <span>{a.profiles?.full_name ?? "Administração"} · {fmtDate(a.created_at)}</span>
                    {canManage(a) && <span>Lido por {a.announcement_reads.length} pessoa(s)</span>}
                    {!read && !canManage(a) && (
                      <button className="text-brand-500 hover:underline" onClick={() => markRead(a)}>Marcar como lido</button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {creating && <NewAnnouncement onClose={() => setCreating(false)} onSaved={() => { setCreating(false); list.reload(true); }} />}
    </div>
  );
}

function NewAnnouncement({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { adminOrgs, profile } = useAuth();
  const [org, setOrg] = useState(adminOrgs[0]?.id ?? "");
  const [res, setRes] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [important, setImportant] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const residences = useLoad(async () =>
    org ? must(await supabase.from("residences").select("id, name, block").eq("org_id", org).order("name")) as { id: string; name: string; block: string | null }[] : [],
  [org]);
  const blocks = [...new Set((residences.data ?? []).map((r) => r.block).filter(Boolean))] as string[];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.from("announcements").insert({
      org_id: org,
      residence_id: res.startsWith("b:") ? null : res || null,
      block: res.startsWith("b:") ? res.slice(2) : null,
      title: title.trim(), body: body.trim(), important, created_by: profile!.id,
    });
    setLoading(false);
    if (error) return setError(errMsg(error));
    onSaved();
  }

  return (
    <Modal open onClose={onClose} title="Novo comunicado" wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {adminOrgs.length > 1 && (
            <Field label="Organização">
              <Select value={org} onChange={(e) => { setOrg(e.target.value); setRes(""); }}>
                {adminOrgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Enviar para">
            <Select value={res} onChange={(e) => setRes(e.target.value)}>
              <option value="">Todos os moradores</option>
              {blocks.length > 0 && (
                <optgroup label={adminOrgs.find((o) => o.id === org)?.group_label ?? "Bloco"}>
                  {blocks.map((b) => <option key={b} value={`b:${b}`}>Todo o {b}</option>)}
                </optgroup>
              )}
              <optgroup label="Uma unidade">
                {(residences.data ?? []).map((r) => <option key={r.id} value={r.id}>Somente {r.block ? `${r.block} · ` : ""}{r.name}</option>)}
              </optgroup>
            </Select>
          </Field>
        </div>
        <Field label="Título"><Input required minLength={3} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Mensagem"><Textarea required rows={6} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-brand-500" checked={important} onChange={(e) => setImportant(e.target.checked)} />
          Marcar como importante
        </label>
        <p className="text-xs text-slate-500">O comunicado aparece em destaque no app de cada morador até ser lido.</p>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" className="w-full" loading={loading}>Publicar comunicado</Button>
      </form>
    </Modal>
  );
}
