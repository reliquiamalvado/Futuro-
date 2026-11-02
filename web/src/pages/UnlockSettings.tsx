import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Fingerprint, KeyRound, Lock, ScanFace, Trash2 } from "lucide-react";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { errMsg, fmtAgo, fmtDate, must } from "../lib/util";
import {
  CancelledError, biometricAvailable, deviceLabel, getUnlockMethods, registerBiometric, type UnlockMethods,
} from "../lib/unlock";
import { Alert, Badge, Button, Card, Field, Input } from "../components/ui";

interface Cred { id: string; device_name: string | null; created_at: string; last_used_at: string | null }
const digits = (v: string) => v.replace(/\D/g, "").slice(0, 8);

/** Cartão "Segurança para abrir o portão" em Minha conta. */
export function UnlockSettings() {
  const nav = useNavigate();
  const { signOut } = useAuth();
  const [m, setM] = useState<UnlockMethods | null>(null);
  const [creds, setCreds] = useState<Cred[]>([]);
  const [bioAvail, setBioAvail] = useState(false);
  const [current, setCurrent] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [bioPin, setBioPin] = useState("");
  const [askBioPin, setAskBioPin] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);
  const [msg, setMsg] = useState<{ tone: "green" | "red"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [mm, c, b] = await Promise.all([
      getUnlockMethods(),
      supabase.from("webauthn_credentials").select("id, device_name, created_at, last_used_at").order("created_at"),
      biometricAvailable(),
    ]);
    setM(mm);
    setCreds((c.data ?? []) as Cred[]);
    setBioAvail(b);
  }
  useEffect(() => {
    load();
    if (window.location.hash === "#abertura") {
      setTimeout(() => document.getElementById("abertura")?.scrollIntoView({ behavior: "smooth" }), 300);
    }
  }, []);

  async function savePin(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (pin !== pin2) return setMsg({ tone: "red", text: "As senhas não conferem." });
    setBusy(true);
    try {
      const r = must(await supabase.rpc("set_gate_pin", { p_new: pin, p_current: current || null })) as
        { ok: boolean; erro?: string; reautenticar?: boolean };
      if (r.reautenticar) setNeedLogin(true);
      if (!r.ok) return setMsg({ tone: "red", text: r.erro ?? "Não foi possível salvar." });
      setMsg({ tone: "green", text: m?.pin ? "Senha de abertura alterada." : "Senha de abertura criada. A partir de agora ela será pedida para acionar portões." });
      setCurrent(""); setPin(""); setPin2("");
      await load();
    } catch (err) { setMsg({ tone: "red", text: errMsg(err) }); }
    finally { setBusy(false); }
  }

  async function addBiometric() {
    setMsg(null);
    setBusy(true);
    try {
      await registerBiometric(deviceLabel(), bioPin || undefined);
      setBioPin(""); setAskBioPin(false);
      setMsg({ tone: "green", text: "Biometria cadastrada neste aparelho. Use a digital ou o rosto para acionar portões." });
      await load();
    } catch (err) {
      if (err instanceof CancelledError) return;
      const e = err as Error & { precisa?: string };
      if (e.precisa === "pin") setAskBioPin(true);
      if (e.precisa === "reautenticar") setNeedLogin(true);
      setMsg({ tone: "red", text: e.message });
    } finally { setBusy(false); }
  }

  async function removeCred(c: Cred) {
    if (!confirm(`Remover a biometria de "${c.device_name ?? "aparelho"}"?`)) return;
    const { error } = await supabase.from("webauthn_credentials").delete().eq("id", c.id);
    if (error) return setMsg({ tone: "red", text: errMsg(error) });
    await load();
  }

  async function relogin() {
    await signOut();
    nav("/login", { state: { from: "/conta#abertura" } });
  }

  const configured = m && (m.pin || m.biometrias > 0);

  return (
    <Card>
      <h2 id="abertura" className="mb-1 flex items-center gap-2 font-semibold">
        <Lock className="size-5 text-brand-500" /> Segurança para abrir o portão
        {configured ? <Badge tone="green" dot>Ativa</Badge> : <Badge tone="amber" dot>Configure</Badge>}
      </h2>
      <p className="mb-4 text-sm text-slate-500">
        Todo acionamento de portão pede a sua <b>digital, rosto ou senha de abertura</b>. Se o celular for roubado,
        o ladrão não consegue abrir o portão. Errar a senha 5 vezes bloqueia por 15 minutos.
      </p>

      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      {needLogin && (
        <div className="mb-4">
          <Alert tone="amber">
            Por segurança, essa alteração só pode ser feita até 10 minutos depois de entrar com a senha da conta.
            <Button size="sm" className="mt-2" onClick={relogin}>Entrar novamente</Button>
          </Alert>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={savePin} className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="size-4" />
            Senha de abertura {m?.pin && <Badge tone="green">definida</Badge>}
          </h3>
          {m?.bloqueado_ate && <Alert tone="amber">Bloqueada até {fmtDate(m.bloqueado_ate)} por tentativas erradas.</Alert>}
          {m?.pin && !m.login_recente && (
            <Field label="Senha de abertura atual">
              <Input type="password" inputMode="numeric" autoComplete="off" value={current} onChange={(e) => setCurrent(digits(e.target.value))} />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label={m?.pin ? "Nova senha" : "Senha (4 a 8 números)"}>
              <Input type="password" inputMode="numeric" autoComplete="new-password" required minLength={4}
                value={pin} onChange={(e) => setPin(digits(e.target.value))} />
            </Field>
            <Field label="Repita">
              <Input type="password" inputMode="numeric" autoComplete="new-password" required minLength={4}
                value={pin2} onChange={(e) => setPin2(digits(e.target.value))} />
            </Field>
          </div>
          <p className="text-xs text-slate-500">Não use datas de aniversário nem sequências (1234, 1111). Não use a mesma senha do celular.</p>
          <Button type="submit" loading={busy} disabled={pin.length < 4}>{m?.pin ? "Trocar senha" : "Criar senha de abertura"}</Button>
        </form>

        <div className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Fingerprint className="size-4" /> Digital ou rosto</h3>
          {creds.length === 0 ? <p className="text-sm text-slate-500">Nenhum aparelho cadastrado.</p> : (
            <ul className="space-y-2">
              {creds.map((c) => (
                <li key={c.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-ink-850">
                  <span>
                    <span className="flex items-center gap-2 font-medium"><ScanFace className="size-4" /> {c.device_name ?? "Aparelho"}</span>
                    <span className="text-xs text-slate-500">desde {fmtDate(c.created_at)} · último uso {fmtAgo(c.last_used_at)}</span>
                  </span>
                  <Button size="sm" variant="ghost" title="Remover" onClick={() => removeCred(c)}><Trash2 className="size-4" /></Button>
                </li>
              ))}
            </ul>
          )}
          {bioAvail ? (
            <div className="space-y-2">
              {askBioPin && (
                <Field label="Confirme com a senha de abertura">
                  <Input type="password" inputMode="numeric" value={bioPin} onChange={(e) => setBioPin(digits(e.target.value))} />
                </Field>
              )}
              <Button variant="secondary" loading={busy} onClick={addBiometric}>
                <Fingerprint className="size-4" /> Cadastrar a digital/rosto deste aparelho
              </Button>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Este navegador/aparelho não oferece digital ou rosto. No celular, abra o app pelo Safari (iPhone) ou Chrome (Android).</p>
          )}
        </div>
      </div>
    </Card>
  );
}
