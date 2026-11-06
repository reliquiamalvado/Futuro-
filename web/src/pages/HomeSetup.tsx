import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Cpu, DoorOpen, Home, Plus, Trash2 } from "lucide-react";
import { useAuth } from "../lib/auth";
import { supabase, type GateMode } from "../lib/supabase";
import { errMsg, must } from "../lib/util";
import { Alert, Button, Card, Field, Input, Select, cx } from "../components/ui";

type Step = 1 | 2 | 3;
interface NewGate { name: string; channel: number; mode: GateMode }

export default function HomeSetupPage() {
  const nav = useNavigate();
  const { refresh } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Etapa 1
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [home, setHome] = useState<{ org_id: string; residence_id: string } | null>(null);

  // Etapa 2
  const [devName, setDevName] = useState("Central do portão");
  const [device, setDevice] = useState<{ device_id: string; secret: string } | null>(null);

  // Etapa 3
  const [gates, setGates] = useState<NewGate[]>([{ name: "Portão da garagem", channel: 1, mode: "pulso" }]);

  async function run(fn: () => Promise<void>) {
    setLoading(true);
    setError(null);
    try { await fn(); } catch (e) { setError(errMsg(e)); } finally { setLoading(false); }
  }

  const createHome = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const r = must(await supabase.rpc("create_home", { p_name: name.trim(), p_address: address.trim() || null })) as
        { org_id: string; residence_id: string };
      setHome(r);
      await refresh();
      setStep(2);
    });
  };

  const createDevice = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const r = must(await supabase.rpc("create_device", {
        p_org: home!.org_id, p_name: devName.trim(), p_driver: "dc-esp32-https",
      })) as { device_id: string; secret: string };
      setDevice(r);
      setStep(3);
    });
  };

  const createGates = () => run(async () => {
    const valid = gates.filter((g) => g.name.trim());
    if (!valid.length) throw new Error("Informe pelo menos um portão.");
    const used = new Set<number>();
    for (const g of valid) {
      const relays = g.mode === "abrir_fechar" ? [g.channel, g.channel + 1] : [g.channel];
      for (const r of relays) {
        if (used.has(r)) throw new Error(`O relé ${r} está sendo usado por dois portões.`);
        used.add(r);
      }
    }
    // A casa já ganhou um portão automático (sem equipamento): o primeiro portão reaproveita ele.
    const auto = must(await supabase.from("gates").select("id").eq("org_id", home!.org_id).is("device_id", null).limit(1)) as { id: string }[];
    const [first, ...rest] = valid;
    const row = (g: NewGate) => ({ org_id: home!.org_id, device_id: device!.device_id, name: g.name.trim(), channel: g.channel, mode: g.mode });
    if (auto[0]) must(await supabase.from("gates").update(row(first)).eq("id", auto[0].id).select());
    const toInsert = auto[0] ? rest : valid;
    if (toInsert.length) must(await supabase.from("gates").insert(toInsert.map(row)).select());
    nav(`/instalar?dispositivo=${device!.device_id}`, { replace: true });
  });

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Configurar minha casa</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Em 3 passos o portão da sua casa fica pronto para abrir pelo celular.</p>

      <ol className="my-6 grid grid-cols-3 gap-2 text-xs sm:text-sm">
        {[[1, "Casa", Home], [2, "Equipamento", Cpu], [3, "Portões", DoorOpen]].map(([n, label, Icon]) => {
          const I = Icon as typeof Home;
          const done = step > (n as number);
          const cur = step === n;
          return (
            <li key={n as number} className={cx("flex items-center gap-2 rounded-xl px-3 py-2 ring-1",
              cur ? "bg-brand-500/10 text-brand-600 ring-brand-500/40 dark:text-brand-400"
                : done ? "text-emerald-600 ring-emerald-500/30" : "text-slate-400 ring-slate-200 dark:ring-ink-800")}>
              {done ? <Check className="size-4" /> : <I className="size-4" />}
              <span className="font-medium">{n as number}. {label as string}</span>
            </li>
          );
        })}
      </ol>

      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      {step === 1 && (
        <Card>
          <form onSubmit={createHome} className="space-y-4">
            <Field label="Nome da casa" hint="Ex.: Casa da Família Silva, Casa de Praia">
              <Input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
            <Field label="Endereço (opcional)">
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </Field>
            <p className="text-xs text-slate-500">Você será o titular: poderá convidar a família, criar chaves para visitantes e gerenciar os portões.</p>
            <Button type="submit" className="w-full" loading={loading}>Continuar</Button>
          </form>
        </Card>
      )}

      {step === 2 && (
        <Card>
          {!device ? (
            <form onSubmit={createDevice} className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Dê um nome ao equipamento (placa ESP32 AuggeControl). No final, mostramos como gravar e conectar a placa, sem programar nada.
              </p>
              <Field label="Nome do equipamento">
                <Input required value={devName} onChange={(e) => setDevName(e.target.value)} />
              </Field>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => nav("/", { replace: true })}>Fazer depois</Button>
                <Button type="submit" className="flex-1" loading={loading}>Cadastrar equipamento</Button>
              </div>
            </form>
          ) : null}
        </Card>
      )}

      {step === 3 && (
        <Card className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Quais portões esse equipamento controla? Cada portão usa um relé. Se a central tiver entradas separadas para
            abrir e fechar, escolha "Abrir e fechar" (usa o relé escolhido e o seguinte).
          </p>
          {gates.map((g, i) => (
            <div key={i} className="grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end dark:bg-ink-850">
              <Field label="Nome do portão">
                <Input value={g.name} onChange={(e) => setGates((s) => s.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
              </Field>
              <Field label="Relé">
                <Select value={g.channel} onChange={(e) => setGates((s) => s.map((x, j) => j === i ? { ...x, channel: +e.target.value } : x))}>
                  {[1, 2, 3, 4].map((n) => <option key={n} value={n}>Relé {n}</option>)}
                </Select>
              </Field>
              <Field label="Tipo">
                <Select value={g.mode} onChange={(e) => setGates((s) => s.map((x, j) => j === i ? { ...x, mode: e.target.value as GateMode } : x))}>
                  <option value="pulso">Pulso (botoeira)</option>
                  <option value="abrir_fechar">Abrir e fechar</option>
                </Select>
              </Field>
              <Button type="button" variant="ghost" disabled={gates.length === 1} title="Remover"
                onClick={() => setGates((s) => s.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
            </div>
          ))}
          {gates.length < 4 && (
            <Button type="button" variant="secondary" size="sm"
              onClick={() => setGates((s) => [...s, { name: s.length === 1 ? "Portão social" : "", channel: Math.min(4, s.length + 1), mode: "pulso" }])}>
              <Plus className="size-4" /> Outro portão
            </Button>
          )}
          <Button className="w-full" loading={loading} onClick={createGates}>Concluir e instalar o equipamento</Button>
        </Card>
      )}
    </div>
  );
}
