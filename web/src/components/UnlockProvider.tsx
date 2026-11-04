import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Delete, Fingerprint, KeyRound, Lock, ScanFace } from "lucide-react";
import type { GateAction } from "../lib/supabase";
import { ACTION_LABEL, errMsg } from "../lib/util";
import {
  CancelledError, biometricAvailable, getUnlockMethods, openWithBiometric, openWithPin, prepareAuthentication, biometricName, OPTIONS_TTL_MS, type UnlockMethods,
} from "../lib/unlock";
import { Alert, Button, Modal, Spinner, cx } from "./ui";

type Run = (gateId: string, gateName: string, action: GateAction) => Promise<string>;
const Ctx = createContext<Run | null>(null);

/** Pede digital/rosto ou senha de abertura antes de acionar qualquer portão. */
export function useConfirmedGateCommand() {
  const v = useContext(Ctx);
  if (!v) throw new Error("UnlockProvider ausente");
  return v;
}

interface Pending {
  gateId: string; gateName: string; action: GateAction;
  resolve: (id: string) => void; reject: (e: Error) => void;
}

export function UnlockProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const run = useCallback<Run>((gateId, gateName, action) =>
    new Promise<string>((resolve, reject) => setPending({ gateId, gateName, action, resolve, reject })), []);
  return (
    <Ctx.Provider value={run}>
      {children}
      {pending && <UnlockDialog p={pending} onClose={() => setPending(null)} />}
    </Ctx.Provider>
  );
}

function UnlockDialog({ p, onClose }: { p: Pending; onClose: () => void }) {
  const nav = useNavigate();
  const [methods, setMethods] = useState<UnlockMethods | null>(null);
  const [bioOk, setBioOk] = useState(false);
  const [mode, setMode] = useState<"escolha" | "pin">("escolha");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);
  // Desafio da biometria buscado antes do toque (o iPhone exige o Face ID logo após o toque).
  const prepared = useRef<{ at: number; opts: Awaited<ReturnType<typeof prepareAuthentication>> } | null>(null);
  const bioName = biometricName();

  const finish = (id: string) => { done.current = true; p.resolve(id); onClose(); };
  const cancel = () => { if (!done.current) p.reject(new CancelledError()); onClose(); };

  useEffect(() => {
    (async () => {
      const [m, b] = await Promise.all([getUnlockMethods().catch(() => null), biometricAvailable()]);
      setMethods(m);
      const canBio = b && !!m && m.biometrias > 0;
      setBioOk(canBio);
      if (m && !canBio && m.pin) setMode("pin");
      if (canBio) prepareAuthentication().then((opts) => { prepared.current = { at: Date.now(), opts }; }).catch(() => {});
    })();
  }, []);

  function handleResult(r: { ok: boolean; erro?: string; command_id?: string }) {
    if (r.ok && r.command_id) return finish(r.command_id);
    // Comando recusado depois da confirmação (offline, limite...): repassa o erro ao cartão.
    if (r.ok === false && r.erro && !("confirmacao" in r)) { done.current = true; p.reject(new Error(r.erro)); onClose(); return; }
    setError(r.erro ?? "Não foi possível confirmar.");
  }

  async function useBiometric() {
    setBusy(true); setError(null);
    const fresh = prepared.current && Date.now() - prepared.current.at < OPTIONS_TTL_MS ? prepared.current.opts : undefined;
    prepared.current = null;
    try { handleResult(await openWithBiometric(p.gateId, p.action, fresh)); }
    catch (e) {
      if (e instanceof CancelledError) setError(`${bioName} cancelado ou não reconhecido. Toque de novo ou use a senha de abertura.`);
      else setError(errMsg(e));
      prepareAuthentication().then((opts) => { prepared.current = { at: Date.now(), opts }; }).catch(() => {});
    }
    finally { setBusy(false); }
  }

  async function submitPin(value: string) {
    setBusy(true); setError(null);
    try {
      const r = await openWithPin(p.gateId, p.action, value);
      setPin("");
      handleResult(r);
    } catch (e) { setError(errMsg(e)); setPin(""); }
    finally { setBusy(false); }
  }

  function press(d: string) {
    if (busy) return;
    if (d === "<") return setPin((x) => x.slice(0, -1));
    const next = (pin + d).slice(0, 8);
    setPin(next);
  }

  // Teclado físico (computador): números, apagar e Enter.
  useEffect(() => {
    if (mode !== "pin") return;
    const h = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("<");
      else if (e.key === "Enter" && pin.length >= 4) submitPin(pin);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const configured = methods && (methods.pin || methods.biometrias > 0);

  return (
    <Modal open onClose={cancel} title={`${ACTION_LABEL[p.action]} · ${p.gateName}`}>
      {!methods ? (
        <div className="flex justify-center py-8"><Spinner className="size-7" /></div>
      ) : !configured ? (
        <div className="space-y-4 text-center">
          <Lock className="mx-auto size-10 text-brand-500" />
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Para sua segurança, todo acionamento precisa ser confirmado com <b>digital, rosto ou senha de abertura</b>.
            Assim, se o seu celular for roubado, ninguém abre o seu portão.
          </p>
          <Button className="w-full" onClick={() => { cancel(); nav("/conta#abertura"); }}>Configurar agora</Button>
        </div>
      ) : (
        <div className="space-y-5">
          {methods.bloqueado_ate && (
            <Alert tone="amber">Senha de abertura bloqueada por tentativas erradas. {bioOk ? "Use a biometria ou aguarde." : "Aguarde alguns minutos."}</Alert>
          )}
          {mode === "escolha" && (
            <div className="space-y-3">
              {bioOk && (
                <button onClick={useBiometric} disabled={busy}
                  className="flex w-full flex-col items-center gap-2 rounded-2xl bg-brand-500 py-6 font-semibold text-white transition hover:bg-brand-600 active:scale-[.98] disabled:opacity-60">
                  {busy ? <Spinner className="size-9 text-white" /> : (
                    <span className="flex gap-3"><Fingerprint className="size-9" /><ScanFace className="size-9" /></span>
                  )}
                  Confirmar com {bioName}
                </button>
              )}
              {methods.pin && (
                <Button variant="secondary" className="w-full" onClick={() => setMode("pin")}>
                  <KeyRound className="size-4" /> Usar senha de abertura
                </Button>
              )}
            </div>
          )}
          {mode === "pin" && (
            <div className="space-y-4">
              <p className="text-center text-sm text-slate-500">Digite sua senha de abertura</p>
              <div className="flex justify-center gap-2" aria-label="Senha digitada">
                {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
                  <span key={i} className={cx("size-3.5 rounded-full", i < pin.length ? "bg-brand-500" : "bg-slate-200 dark:bg-ink-700")} />
                ))}
              </div>
              <div className="mx-auto grid max-w-64 grid-cols-3 gap-2">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "<"].map((d, i) => d === "" ? <span key={i} /> : (
                  <button key={i} type="button" onClick={() => press(d)} disabled={busy}
                    aria-label={d === "<" ? "Apagar" : d}
                    className="grid h-14 place-items-center rounded-2xl bg-slate-100 text-xl font-semibold transition active:scale-95 hover:bg-slate-200 disabled:opacity-50 dark:bg-ink-800 dark:hover:bg-ink-700">
                    {d === "<" ? <Delete className="size-5" /> : d}
                  </button>
                ))}
              </div>
              <Button className="w-full" loading={busy} disabled={pin.length < 4} onClick={() => submitPin(pin)}>Confirmar</Button>
              {bioOk && <button onClick={() => setMode("escolha")} className="block w-full text-center text-sm text-brand-500">Usar digital ou rosto</button>}
              <button onClick={() => { cancel(); nav("/conta?esqueci=1#abertura"); }} className="block w-full text-center text-sm text-slate-500 underline">Esqueci minha senha de abertura</button>
            </div>
          )}
          {error && <Alert>{error}</Alert>}
        </div>
      )}
    </Modal>
  );
}
