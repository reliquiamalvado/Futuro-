import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Cpu, Laptop, Smartphone, Usb, Wifi, Wrench } from "lucide-react";
import { useAuth } from "../lib/auth";
import { isOnline, supabase, type Device, type Gate } from "../lib/supabase";
import { errMsg, must, useLoad } from "../lib/util";
import { Alert, Badge, Button, Card, Field, Input, Loading, PageHeader, Select, Spinner, cx } from "../components/ui";

// Botão oficial de gravação pelo navegador (Web Serial).
import "esp-web-tools/dist/install-button.js";

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "esp-web-install-button": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { manifest: string };
    }
  }
}

function Step({ n, title, icon, done, children }: { n: number; title: string; icon: React.ReactNode; done?: boolean; children: React.ReactNode }) {
  return (
    <Card className={cx(done && "ring-emerald-400/50")}>
      <div className="mb-3 flex items-center gap-3">
        <span className={cx("grid size-9 place-items-center rounded-full text-sm font-bold",
          done ? "bg-emerald-500 text-white" : "bg-brand-500/10 text-brand-600 dark:text-brand-400")}>
          {done ? <CheckCircle2 className="size-5" /> : n}
        </span>
        <h2 className="flex items-center gap-2 font-semibold">{icon}{title}</h2>
      </div>
      <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">{children}</div>
    </Card>
  );
}

export default function InstallDevicePage() {
  const { adminOrgs } = useAuth();
  const [params, setParams] = useSearchParams();
  const [org, setOrg] = useState(adminOrgs[0]?.id ?? "");
  const [newName, setNewName] = useState("Central do portão");
  const [code, setCode] = useState<{ codigo: string; expira_em: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [firmwareOk, setFirmwareOk] = useState<boolean | null>(null);
  const serialOk = typeof navigator !== "undefined" && "serial" in navigator;

  const devId = params.get("dispositivo") ?? "";
  // Veio de "Adicionar ESP32" num portão: o equipamento novo já fica ligado a ele.
  const gateId = params.get("portao") ?? "";
  const gate = useLoad(async () =>
    gateId ? (must(await supabase.from("gates").select("*").eq("id", gateId).maybeSingle()) as Gate | null) : null,
  [gateId]);
  useEffect(() => {
    const g = gate.data;
    if (!g) return;
    if (g.org_id !== org && adminOrgs.some((o) => o.id === g.org_id)) setOrg(g.org_id);
    setNewName(`Central · ${g.name.replace(/^Portão · /, "")}`.slice(0, 80));
  }, [gate.data]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Liga o portão escolhido ao equipamento, no primeiro relé livre. */
  async function linkGate(deviceId: string) {
    const g = gate.data;
    if (!g || g.device_id) return;
    const used = must(await supabase.from("gates").select("channel").eq("device_id", deviceId)) as { channel: number }[];
    let ch = 1;
    while (used.some((u) => u.channel === ch)) ch++;
    must(await supabase.from("gates").update({ device_id: deviceId, channel: ch }).eq("id", g.id).select());
    await gate.reload(true);
  }
  const keepGate = (extra: Record<string, string>) => (gateId ? { ...extra, portao: gateId } : extra);
  const devices = useLoad(async () =>
    org ? must(await supabase.from("devices").select("*").eq("org_id", org).order("created_at", { ascending: false })) as Device[] : [],
  [org]);
  const device = devices.data?.find((d) => d.id === devId);
  const online = device ? isOnline(device.last_seen_at) : false;

  useEffect(() => {
    fetch("/firmware/manifest.json", { cache: "no-store" }).then((r) => setFirmwareOk(r.ok)).catch(() => setFirmwareOk(false));
  }, []);

  // Enquanto espera o equipamento se conectar, confere a cada 3 s.
  useEffect(() => {
    if (!code || online) return;
    const t = setInterval(() => devices.reload(true), 3000);
    return () => clearInterval(t);
  }, [code, online, devices.reload]);

  async function createDevice() {
    setBusy(true); setError(null);
    try {
      const r = must(await supabase.rpc("create_device", { p_org: org, p_name: newName.trim(), p_driver: "dc-esp32-https" })) as { device_id: string };
      await linkGate(r.device_id);
      await devices.reload(true);
      setParams(keepGate({ dispositivo: r.device_id }));
      await generateCode(r.device_id);
    } catch (e) { setError(errMsg(e)); }
    finally { setBusy(false); }
  }

  async function generateCode(id = devId) {
    setBusy(true); setError(null);
    try {
      setCode(must(await supabase.rpc("create_pairing_code", { p_device: id })) as { codigo: string; expira_em: string });
    } catch (e) { setError(errMsg(e)); }
    finally { setBusy(false); }
  }

  if (!adminOrgs.length) return <Alert>Você precisa administrar uma casa ou condomínio para instalar equipamentos.</Alert>;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Instalar equipamento"
        subtitle="Passo a passo, sem programar nada. Leva uns 15 minutos (sem contar a ligação no portão)." />
      {error && <Alert>{error}</Alert>}
      {gate.data && (
        <Alert tone={gate.data.device_id ? "green" : "amber"}>
          {gate.data.device_id
            ? <>Equipamento ligado ao <b>{gate.data.name}</b>. Siga os passos para gravar e conectar a placa.</>
            : <>Você está adicionando o ESP32 do <b>{gate.data.name}</b>. Ao cadastrar o equipamento no passo 3, ele já fica ligado a este portão.</>}
        </Alert>
      )}

      <Step n={1} title="O que comprar" icon={<Cpu className="size-4" />}>
        <p>Kit recomendado: funciona direto, sem solda e sem ajustar nada (as peças só se encaixam com 3 fios).</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><b>ESP32 DevKit V1</b> (30 ou 38 pinos, com entrada USB).</li>
          <li><b>Módulo relé 5 V, 1 canal</b> (2 canais se forem 2 portões).</li>
          <li><b>3 jumpers fêmea-fêmea</b>: VIN → VCC, GND → GND, D26 → IN.</li>
          <li><b>Cabo USB de dados</b> (alguns cabos só carregam) e um <b>carregador de celular</b> comum.</li>
          <li><b>Caixinha plástica</b> para proteger da chuva.</li>
        </ul>
        <video src="/videos/montagem-auggecontrol.mp4" controls playsInline preload="metadata"
          className="w-full rounded-xl ring-1 ring-slate-200 dark:ring-ink-800" />
        <a href="/videos/montagem-auggecontrol.mp4" download="montagem-auggecontrol.mp4"
          className="inline-block text-brand-500 underline">Baixar o vídeo da montagem (1,5 MB)</a>
        <p className="text-xs text-slate-500">Placas “ESP32 com relé integrado” também funcionam, mas muitas não têm USB e usam outros pinos — só para técnicos.</p>
      </Step>

      <Step n={2} title="Gravar o AuggeControl na placa" icon={<Usb className="size-4" />}>
        <p className="flex items-center gap-2"><Laptop className="size-4" /> Use um <b>computador</b> com o navegador <b>Chrome</b> ou <b>Edge</b>.</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Ligue a placa no computador pelo cabo USB.</li>
          <li>Clique no botão abaixo e escolha a porta que aparecer (ex.: “USB Serial”, “CP210x” ou “CH340”).</li>
          <li>Aguarde a barra chegar a 100% (uns 2 minutos). Pronto.</li>
        </ol>
        {!serialOk ? (
          <Alert tone="amber">Este navegador não consegue gravar. Abra esta página no <b>Chrome ou Edge de um computador</b>.</Alert>
        ) : firmwareOk === false ? (
          <Alert tone="amber">O arquivo do firmware ainda está sendo preparado. Tente de novo em alguns minutos.</Alert>
        ) : firmwareOk === null ? <Spinner /> : (
          <esp-web-install-button manifest="/firmware/manifest.json">
            <button slot="activate" className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-3 font-semibold text-white hover:bg-brand-600">
              <Usb className="size-5" /> Instalar AuggeControl na placa
            </button>
          </esp-web-install-button>
        )}
        <p className="text-xs text-slate-500">Se a placa não aparecer: troque o cabo USB, ou instale o driver “CP210x” / “CH340” (depende da placa).</p>
      </Step>

      <Step n={3} title="Conectar o equipamento à sua conta" icon={<Smartphone className="size-4" />} done={online}>
        {adminOrgs.length > 1 && (
          <Field label="Casa / condomínio">
            <Select value={org} onChange={(e) => { setOrg(e.target.value); setParams({}); setCode(null); }}>
              {adminOrgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select>
          </Field>
        )}
        {devices.loading ? <Loading /> : !device ? (
          <div className="space-y-3">
            {(devices.data ?? []).length > 0 && (
              <Field label="Conectar um equipamento já cadastrado">
                <Select value="" onChange={async (e) => {
                  const id = e.target.value;
                  setCode(null);
                  try { await linkGate(id); } catch (err) { setError(errMsg(err)); return; }
                  setParams(keepGate({ dispositivo: id }));
                }}>
                  <option value="">Escolha…</option>
                  {devices.data!.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>
              </Field>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Ou cadastrar um novo equipamento com o nome">
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} className="min-w-64" />
              </Field>
              <Button loading={busy} disabled={!newName.trim() || !org} onClick={createDevice}>Cadastrar e gerar código</Button>
            </div>
          </div>
        ) : online ? (
          <Alert tone="green">
            <b>{device.name}</b> está conectado e online!{" "}
            {gate.data?.device_id === device.id
              ? <>O <b>{gate.data.name}</b> já está pronto para abrir pelo app. <Link to="/dispositivos" className="underline">Ver portões</Link>.</>
              : <Link to="/dispositivos" className="underline">Agora cadastre os portões dele</Link>}
          </Alert>
        ) : !code ? (
          <div className="space-y-2">
            <p>Equipamento: <b>{device.name}</b> <Badge tone="red">offline</Badge></p>
            <Button loading={busy} onClick={() => generateCode()}>Gerar código de pareamento</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl bg-slate-50 p-5 text-center dark:bg-ink-850">
              <div className="text-xs uppercase tracking-wider text-slate-500">Código de pareamento</div>
              <div className="mt-1 font-mono text-4xl font-bold tracking-[.3em] text-slate-900 dark:text-white">{code.codigo}</div>
              <div className="mt-1 text-xs text-slate-500">Vale por 30 minutos, uma única vez</div>
            </div>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Ligue a placa na energia (pode ser no próprio cabo USB, num carregador de celular).</li>
              <li>No <b>celular</b>, abra as configurações de <b>Wi-Fi</b> e conecte na rede <b className="inline-flex items-center gap-1"><Wifi className="size-3.5" />AuggeControl-XXXX</b>.</li>
              <li>Vai abrir uma página (se não abrir, acesse <b>192.168.4.1</b> no navegador do celular).</li>
              <li>Escolha o <b>Wi-Fi da casa</b>, digite a <b>senha</b> e o <b>código acima</b>. Toque em <b>Conectar</b>.</li>
              <li>O celular pode desconectar da rede AuggeControl sozinho — é normal. Volte para esta tela.</li>
            </ol>
            <p className="flex items-center gap-2 text-slate-500"><Spinner className="size-4" /> Aguardando o equipamento se conectar…</p>
            <Button variant="ghost" size="sm" onClick={() => generateCode()}>Gerar outro código</Button>
          </div>
        )}
      </Step>

      <Step n={4} title="Ligar no portão" icon={<Wrench className="size-4" />}>
        <video src="/videos/instalacao-portao.mp4" controls playsInline preload="metadata"
          className="w-full rounded-xl ring-1 ring-slate-200 dark:ring-ink-800" />
        <a href="/videos/instalacao-portao.mp4" download="instalacao-portao.mp4"
          className="inline-block text-brand-500 underline">Baixar o vídeo da instalação no portão (1,4 MB)</a>
        <p className="font-medium">Vai instalar você mesmo, com a placa de relé embutido? Veja o passo a passo:</p>
        <video src="/videos/instalar-voce-mesmo.mp4" controls playsInline preload="metadata"
          className="w-full rounded-xl ring-1 ring-slate-200 dark:ring-ink-800" />
        <a href="/videos/instalar-voce-mesmo.mp4" download="instalar-voce-mesmo.mp4"
          className="inline-block text-brand-500 underline">Baixar o vídeo "Eu mesmo instalo" (1,9 MB)</a>
        <p><b>Recomendação:</b> chame um <b>técnico de portão eletrônico</b> — é um serviço rápido. Mostre esta mensagem a ele:</p>
        <div className="rounded-xl bg-slate-50 p-4 font-mono text-xs leading-relaxed dark:bg-ink-850">
          Ligar os contatos COM e NA do relé nos bornes de BOTOEIRA da central (BOT / PUL / START),
          em paralelo com o botão/receptor. Contato seco, sem tensão. Alimentação: saída auxiliar
          +12/24 V e GND da central (a mesma da fotocélula) → conversor DC-DC 12/24 V para 5 V USB
          (mín. 1 A), dentro da caixa; cabo USB na placa. Não ligar 12/24 V direto no VIN.
          Não ligar na rede 127/220 V do motor.
        </div>
        <p>Depois, cadastre o portão em <Link to="/dispositivos" className="text-brand-500 underline">Portões e dispositivos</Link> e
          teste pelo app.</p>
        <p className="text-xs text-slate-500">Para refazer a configuração da placa (trocar Wi-Fi, por exemplo): segure o botão <b>BOOT</b> por 5 segundos.</p>
      </Step>
    </div>
  );
}
