import { useState, type FormEvent } from "react";
import { Activity, Cpu, KeyRound, Pencil, Plus, Power, RefreshCw, Trash2, Wifi, WifiOff } from "lucide-react";
import { useAuth } from "../lib/auth";
import {
  DEVICE_API_URL, isOnline, supabase, type Command, type Device, type DeviceDriver, type Gate, type GateMode,
} from "../lib/supabase";
import { ACTION_LABEL, CMD_LABEL, errMsg, fmtAgo, fmtDate, must, useLoad } from "../lib/util";
import { Alert, Badge, Button, Card, CopyButton, Empty, Field, Input, Loading, Modal, PageHeader, Select } from "../components/ui";

export default function DevicesPage() {
  const { adminOrgs } = useAuth();
  const [orgId, setOrgId] = useState(adminOrgs[0]?.id ?? "");
  const org = orgId || adminOrgs[0]?.id || "";

  const drivers = useLoad(async () => must(await supabase.from("device_drivers").select("*").eq("active", true)) as DeviceDriver[]);
  const devices = useLoad(async () => {
    if (!org) return [];
    return must(await supabase.from("devices").select("*").eq("org_id", org).order("name")) as Device[];
  }, [org]);
  const gates = useLoad(async () => {
    if (!org) return [];
    return must(await supabase.from("gates").select("*").eq("org_id", org).order("channel")) as Gate[];
  }, [org]);

  const [creating, setCreating] = useState(false);
  const [credentials, setCredentials] = useState<{ device_id: string; secret: string; name: string } | null>(null);
  const [gateEdit, setGateEdit] = useState<{ device: Device; gate?: Gate } | null>(null);
  const [devEdit, setDevEdit] = useState<Device | null>(null);
  const [diag, setDiag] = useState<Device | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!adminOrgs.length) return <Empty title="Nenhuma organização">Peça ao super admin para vincular você a uma organização.</Empty>;

  async function rotate(d: Device) {
    if (!confirm(`Gerar novo segredo para "${d.name}"? O equipamento só volta a funcionar depois de receber o novo segredo.`)) return;
    try {
      const secret = must(await supabase.rpc("rotate_device_secret", { p_device: d.id })) as string;
      setCredentials({ device_id: d.id, secret, name: d.name });
    } catch (e) { setError(errMsg(e)); }
  }

  return (
    <div>
      <PageHeader
        title="Portões e dispositivos"
        subtitle="Equipamentos instalados, portões controlados por eles e monitoramento online/offline."
        actions={<Button onClick={() => setCreating(true)}><Plus className="size-4" /> Novo dispositivo</Button>}
      />
      {adminOrgs.length > 1 && (
        <Select className="mb-4 max-w-xs" value={org} onChange={(e) => setOrgId(e.target.value)}>
          {adminOrgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
      )}
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      {devices.loading ? <Loading /> : !devices.data?.length ? (
        <Empty icon={<Cpu className="size-8" />} title="Nenhum dispositivo cadastrado">
          Cadastre o equipamento instalado no portão. Você receberá as credenciais para configurar o firmware.
        </Empty>
      ) : (
        <div className="space-y-4">
          {devices.data.map((d) => {
            const online = isOnline(d.last_seen_at);
            const dg = (gates.data ?? []).filter((g) => g.device_id === d.id);
            const driver = drivers.data?.find((x) => x.id === d.driver_id);
            return (
              <Card key={d.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className={`grid size-11 place-items-center rounded-xl ${online ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-500"}`}>
                      {online ? <Wifi className="size-5" /> : <WifiOff className="size-5" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 font-semibold">
                        {d.name} {!d.active && <Badge tone="red">Desativado</Badge>}
                      </div>
                      <div className="text-sm text-slate-500">
                        {[d.manufacturer || driver?.manufacturer, d.model, driver?.name].filter(Boolean).join(" · ")}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
                        <span>{online ? "Online" : "Offline"} · visto {fmtAgo(d.last_seen_at)}</span>
                        {d.firmware && <span>Firmware {d.firmware}</span>}
                        {d.ip && <span>IP {d.ip}</span>}
                        {d.rssi !== null && <span>Sinal {d.rssi} dBm</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="ghost" title="Diagnóstico" onClick={() => setDiag(d)}><Activity className="size-4" /></Button>
                    <Button size="sm" variant="ghost" title="Editar" onClick={() => setDevEdit(d)}><Pencil className="size-4" /></Button>
                    <Button size="sm" variant="ghost" title="Novo segredo" onClick={() => rotate(d)}><KeyRound className="size-4" /></Button>
                  </div>
                </div>

                <div className="mt-4 border-t border-slate-100 pt-4 dark:border-ink-800">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium">Portões</span>
                    <Button size="sm" variant="secondary" onClick={() => setGateEdit({ device: d })}><Plus className="size-4" /> Portão</Button>
                  </div>
                  {dg.length === 0 ? <p className="text-sm text-slate-500">Nenhum portão neste dispositivo.</p> : (
                    <ul className="divide-y divide-slate-100 dark:divide-ink-800">
                      {dg.map((g) => (
                        <li key={g.id} className="flex items-center justify-between py-2 text-sm">
                          <div>
                            <span className="font-medium">{g.name}</span>
                            <span className="ml-2 text-xs text-slate-500">
                              Relé {g.channel} · {g.mode === "pulso" ? `pulso ${g.pulse_ms} ms` : "abrir/fechar"}
                            </span>
                            {!g.active && <Badge tone="red">Desativado</Badge>}
                          </div>
                          <Button size="sm" variant="ghost" onClick={() => setGateEdit({ device: d, gate: g })}><Pencil className="size-4" /></Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {creating && (
        <NewDeviceModal orgId={org} drivers={drivers.data ?? []} onClose={() => setCreating(false)}
          onCreated={(c) => { setCreating(false); devices.reload(true); setCredentials(c); }} />
      )}
      {credentials && <CredentialsModal c={credentials} onClose={() => setCredentials(null)} />}
      {gateEdit && (
        <GateModal orgId={org} device={gateEdit.device} gate={gateEdit.gate}
          driver={drivers.data?.find((x) => x.id === gateEdit.device.driver_id)}
          onClose={() => setGateEdit(null)} onSaved={() => { setGateEdit(null); gates.reload(true); }} />
      )}
      {devEdit && <EditDeviceModal d={devEdit} onClose={() => setDevEdit(null)} onSaved={() => { setDevEdit(null); devices.reload(true); gates.reload(true); }} />}
      {diag && <DiagnosticsModal d={diag} onClose={() => setDiag(null)} />}
    </div>
  );
}

function NewDeviceModal({ orgId, drivers, onClose, onCreated }: {
  orgId: string; drivers: DeviceDriver[]; onClose: () => void;
  onCreated: (c: { device_id: string; secret: string; name: string }) => void;
}) {
  const [name, setName] = useState("");
  const [driver, setDriver] = useState(drivers[0]?.id ?? "");
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const d = drivers.find((x) => x.id === driver);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = must(await supabase.rpc("create_device", {
        p_org: orgId, p_name: name.trim(), p_driver: driver,
        p_manufacturer: manufacturer.trim() || null, p_model: model.trim() || null, p_serial: serial.trim() || null,
      })) as { device_id: string; secret: string };
      onCreated({ ...r, name });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Novo dispositivo">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nome" hint="Ex.: Central portaria, ESP32 garagem">
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Tipo de equipamento (driver)" hint={d?.description}>
          <Select value={driver} onChange={(e) => setDriver(e.target.value)}>
            {drivers.map((x) => <option key={x.id} value={x.id}>{x.name} — {x.transport.toUpperCase()}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fabricante"><Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} /></Field>
          <Field label="Modelo"><Input value={model} onChange={(e) => setModel(e.target.value)} /></Field>
        </div>
        <Field label="Número de série"><Input value={serial} onChange={(e) => setSerial(e.target.value)} /></Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" className="w-full" loading={loading}>Cadastrar e gerar credenciais</Button>
      </form>
    </Modal>
  );
}

function CredentialsModal({ c, onClose }: { c: { device_id: string; secret: string; name: string }; onClose: () => void }) {
  const snippet = `#define DC_API_URL    "${DEVICE_API_URL}"\n#define DC_DEVICE_ID  "${c.device_id}"\n#define DC_SECRET     "${c.secret}"`;
  return (
    <Modal open onClose={onClose} title={`Credenciais: ${c.name}`} wide>
      <div className="space-y-4">
        <Alert tone="amber">
          Copie agora. Por segurança o segredo <b>não será exibido novamente</b>. Se perder, gere um novo segredo.
        </Alert>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Cole estas linhas no arquivo <code className="rounded bg-slate-100 px-1 dark:bg-ink-800">config.h</code> do firmware AuggeControl:
        </p>
        <pre className="overflow-x-auto rounded-xl bg-ink-900 p-4 text-xs text-slate-100">{snippet}</pre>
        <div className="flex gap-2">
          <CopyButton text={snippet} label="Copiar configuração" />
          <CopyButton text={c.secret} label="Copiar só o segredo" />
        </div>
      </div>
    </Modal>
  );
}

function GateModal({ orgId, device, gate, driver, onClose, onSaved }: {
  orgId: string; device: Device; gate?: Gate; driver?: DeviceDriver; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(gate?.name ?? "");
  const [channel, setChannel] = useState(gate?.channel ?? 1);
  const [mode, setMode] = useState<GateMode>(gate?.mode ?? "pulso");
  const [pulse, setPulse] = useState(gate?.pulse_ms ?? 500);
  const [active, setActive] = useState(gate?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const channels = driver?.capabilities.channels ?? 4;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const row = { name: name.trim(), channel, mode, pulse_ms: pulse, active };
    const { error } = gate
      ? await supabase.from("gates").update(row).eq("id", gate.id)
      : await supabase.from("gates").insert({ ...row, org_id: orgId, device_id: device.id });
    setLoading(false);
    if (error) return setError(errMsg(error).includes("duplicate") || errMsg(error).includes("Já existe")
      ? `O relé ${channel} já está em uso neste dispositivo.` : errMsg(error));
    onSaved();
  }

  async function remove() {
    if (!gate || !confirm(`Excluir o portão "${gate.name}"? O histórico de acionamentos dele também será removido.`)) return;
    const { error } = await supabase.from("gates").delete().eq("id", gate.id);
    if (error) return setError(errMsg(error));
    onSaved();
  }

  return (
    <Modal open onClose={onClose} title={gate ? "Editar portão" : `Novo portão em ${device.name}`}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nome do portão" hint="Ex.: Portão social, Garagem, Pedestres">
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Relé / canal">
            <Select value={channel} onChange={(e) => setChannel(+e.target.value)}>
              {Array.from({ length: channels }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Relé {n}</option>)}
            </Select>
          </Field>
          <Field label="Tipo de acionamento">
            <Select value={mode} onChange={(e) => setMode(e.target.value as GateMode)}>
              <option value="pulso">Pulso (botoeira)</option>
              {driver?.capabilities.open_close !== false && <option value="abrir_fechar">Abrir e fechar separados</option>}
            </Select>
          </Field>
        </div>
        {mode === "pulso" ? (
          <Field label="Duração do pulso (ms)" hint="Tempo que o relé fica acionado. Padrão: 500 ms.">
            <Input type="number" min={100} max={10000} step={50} value={pulse} onChange={(e) => setPulse(+e.target.value)} />
          </Field>
        ) : (
          <Alert tone="blue">
            Abrir usa o relé {channel} e fechar usa o relé {channel + 1}. Ligue cada um na entrada correspondente da central.
          </Alert>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-brand-500" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Portão ativo
        </label>
        {error && <Alert>{error}</Alert>}
        <div className="flex gap-2">
          {gate && <Button type="button" variant="danger" onClick={remove}><Trash2 className="size-4" /></Button>}
          <Button type="submit" className="flex-1" loading={loading}>Salvar</Button>
        </div>
      </form>
    </Modal>
  );
}

function EditDeviceModal({ d, onClose, onSaved }: { d: Device; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(d.name);
  const [manufacturer, setManufacturer] = useState(d.manufacturer ?? "");
  const [model, setModel] = useState(d.model ?? "");
  const [serial, setSerial] = useState(d.serial ?? "");
  const [error, setError] = useState<string | null>(null);

  async function save(patch: Partial<Device>) {
    const { error } = await supabase.from("devices").update(patch).eq("id", d.id);
    if (error) return setError(errMsg(error));
    onSaved();
  }

  return (
    <Modal open onClose={onClose} title="Editar dispositivo">
      <form onSubmit={(e) => { e.preventDefault(); save({ name: name.trim(), manufacturer: manufacturer || null, model: model || null, serial: serial || null }); }} className="space-y-4">
        <Field label="Nome"><Input required value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fabricante"><Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} /></Field>
          <Field label="Modelo"><Input value={model} onChange={(e) => setModel(e.target.value)} /></Field>
        </div>
        <Field label="Número de série"><Input value={serial} onChange={(e) => setSerial(e.target.value)} /></Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" className="w-full">Salvar</Button>
        <div className="flex gap-2 border-t border-slate-100 pt-4 dark:border-ink-800">
          <Button type="button" variant="secondary" className="flex-1" onClick={() => save({ active: !d.active })}>
            <Power className="size-4" /> {d.active ? "Desativar" : "Ativar"}
          </Button>
          <Button type="button" variant="danger" onClick={async () => {
            if (!confirm(`Excluir "${d.name}" e todos os portões dele?`)) return;
            const { error } = await supabase.from("devices").delete().eq("id", d.id);
            if (error) return setError(errMsg(error));
            onSaved();
          }}><Trash2 className="size-4" /> Excluir</Button>
        </div>
      </form>
    </Modal>
  );
}

function DiagnosticsModal({ d, onClose }: { d: Device; onClose: () => void }) {
  const cmds = useLoad(async () =>
    must(await supabase.from("commands").select("*, gates(name)").eq("device_id", d.id)
      .order("created_at", { ascending: false }).limit(50)) as unknown as (Command & { gates: { name: string } | null })[]);
  const list = cmds.data ?? [];
  const done = list.filter((c) => ["sucesso", "falha", "expirado"].includes(c.status));
  const ok = done.filter((c) => c.status === "sucesso").length;
  const latency = list.filter((c) => c.status === "sucesso" && c.completed_at)
    .map((c) => new Date(c.completed_at!).getTime() - new Date(c.created_at).getTime());
  const avg = latency.length ? Math.round(latency.reduce((a, b) => a + b, 0) / latency.length) : null;
  const online = isOnline(d.last_seen_at);

  return (
    <Modal open onClose={onClose} title={`Diagnóstico: ${d.name}`} wide>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat label="Conexão" value={online ? "Online" : "Offline"} tone={online ? "text-emerald-600" : "text-red-500"} />
          <MiniStat label="Última conexão" value={fmtAgo(d.last_seen_at)} />
          <MiniStat label="Taxa de sucesso" value={done.length ? `${Math.round((ok / done.length) * 100)}%` : "—"} />
          <MiniStat label="Tempo médio" value={avg !== null ? `${(avg / 1000).toFixed(1)} s` : "—"} />
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 sm:grid-cols-4">
          <span>Firmware: {d.firmware ?? "—"}</span>
          <span>IP: {d.ip ?? "—"}</span>
          <span>Sinal: {d.rssi !== null ? `${d.rssi} dBm` : "—"}</span>
          <span>ID: <span className="font-mono">{d.id.slice(0, 8)}…</span></span>
        </div>
        {!online && (
          <Alert tone="amber">
            O equipamento não se conecta há mais de 45 s. Verifique energia, Wi-Fi e se o segredo configurado é o atual
            (falhas de autenticação aparecem em Auditoria).
          </Alert>
        )}
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Últimos comandos</h3>
          <Button size="sm" variant="ghost" onClick={() => cmds.reload()}><RefreshCw className="size-4" /></Button>
        </div>
        {cmds.loading ? <Loading /> : !list.length ? <p className="text-sm text-slate-500">Nenhum comando enviado.</p> : (
          <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto text-sm dark:divide-ink-800">
            {list.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                <span>{fmtDate(c.created_at)} · {ACTION_LABEL[c.action]} · {c.gates?.name}</span>
                <span className="text-right">
                  <Badge tone={c.status === "sucesso" ? "green" : c.status === "falha" || c.status === "expirado" ? "red" : "amber"}>{CMD_LABEL[c.status]}</Badge>
                  {c.error && <div className="text-xs text-red-500">{c.error}</div>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-ink-850">
      <div className={`text-lg font-semibold ${tone ?? ""}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
