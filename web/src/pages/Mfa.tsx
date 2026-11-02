import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import type { Factor } from "@supabase/supabase-js";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { errMsg, fmtDate, safePath } from "../lib/util";
import { Alert, Badge, Button, Card, CopyButton, Field, Input } from "../components/ui";
import { Logo } from "../components/Layout";

const onlyDigits = (v: string) => v.replace(/\D/g, "").slice(0, 6);

/** Tela pedida após o login quando a conta tem 2FA ativa. */
export function MfaVerifyPage() {
  const nav = useNavigate();
  const { refresh, signOut } = useAuth();
  const [factor, setFactor] = useState<Factor | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data }) => setFactor(data?.totp?.[0] ?? null));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!factor) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (error) {
      setLoading(false);
      setCode("");
      return setError("Código incorreto ou expirado. Confira o horário do celular e tente de novo.");
    }
    await refresh();
    setLoading(false);
    nav(safePath(sessionStorage.getItem("dc.voltar")), { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Logo className="mb-10 justify-center" />
        <Card>
          <ShieldCheck className="mx-auto mb-3 size-9 text-brand-500" />
          <h1 className="text-center text-lg font-semibold">Verificação em duas etapas</h1>
          <p className="mt-1 text-center text-sm text-slate-500">Digite o código de 6 dígitos do seu aplicativo autenticador.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <Input
              inputMode="numeric" autoComplete="one-time-code" autoFocus required
              value={code} onChange={(e) => setCode(onlyDigits(e.target.value))}
              className="text-center font-mono text-2xl tracking-[.5em]" placeholder="000000"
            />
            {error && <Alert>{error}</Alert>}
            <Button type="submit" className="w-full" loading={loading} disabled={code.length !== 6 || !factor}>Verificar</Button>
          </form>
          <button onClick={async () => { await signOut(); nav("/login"); }}
            className="mt-4 block w-full text-center text-sm text-slate-500 hover:text-brand-500">
            Entrar com outra conta
          </button>
        </Card>
        <p className="mt-4 text-center text-xs text-slate-500">
          Perdeu o acesso ao autenticador? Peça ao administrador da plataforma para redefinir sua verificação.
        </p>
      </div>
    </div>
  );
}

/** Cartão em "Minha conta" para ativar/desativar a 2FA. */
export function TwoFactorCard() {
  const { profile, refresh } = useAuth();
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors((data?.all ?? []).filter((f) => f.factor_type === "totp"));
  }
  useEffect(() => { load(); }, []);

  const verified = factors.filter((f) => f.status === "verified");

  async function start() {
    setError(null);
    setOk(null);
    setLoading(true);
    // Remove tentativas antigas não concluídas.
    for (const f of factors.filter((f) => f.status !== "verified")) await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp", friendlyName: `AuggeControl ${new Date().toLocaleDateString("pt-BR")}`, issuer: "AuggeControl",
    });
    setLoading(false);
    if (error) return setError(errMsg(error));
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function confirm(e: FormEvent) {
    e.preventDefault();
    if (!enroll) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.id, code });
    setLoading(false);
    if (error) { setCode(""); return setError("Código incorreto. Confira se digitou o código atual do aplicativo."); }
    setEnroll(null);
    setCode("");
    setOk("Verificação em duas etapas ativada. A partir de agora o código será pedido ao entrar.");
    await load();
    await refresh();
  }

  async function remove(f: Factor) {
    if (!window.confirm("Desativar a verificação em duas etapas? Sua conta ficará protegida só pela senha.")) return;
    setError(null);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
    if (error) return setError(errMsg(error));
    await supabase.auth.refreshSession();
    await load();
    await refresh();
  }

  return (
    <Card>
      <h2 id="2fa" className="mb-1 flex items-center gap-2 font-semibold">
        <ShieldCheck className="size-5 text-brand-500" /> Verificação em duas etapas
        {verified.length > 0 ? <Badge tone="green" dot>Ativa</Badge> : <Badge tone="amber" dot>Desativada</Badge>}
      </h2>
      <p className="mb-4 text-sm text-slate-500">
        Além da senha, pede um código do seu celular ao entrar. Mesmo que alguém descubra sua senha, não consegue abrir seus portões.
        {profile?.is_super_admin && <b className="text-amber-600"> Obrigatória para Super Admin.</b>}
      </p>

      {ok && <div className="mb-4"><Alert tone="green">{ok}</Alert></div>}
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      {verified.map((f) => (
        <div key={f.id} className="mb-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-ink-850">
          <span className="flex items-center gap-2"><Smartphone className="size-4" /> {f.friendly_name || "Autenticador"} · desde {fmtDate(f.created_at)}</span>
          <Button size="sm" variant="ghost" title="Desativar" onClick={() => remove(f)}><Trash2 className="size-4" /></Button>
        </div>
      ))}

      {!verified.length && !enroll && (
        <Button onClick={start} loading={loading}>Ativar verificação em duas etapas</Button>
      )}

      {enroll && (
        <form onSubmit={confirm} className="space-y-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
            <li>Instale um aplicativo autenticador (Google Authenticator, Microsoft Authenticator ou Authy).</li>
            <li>No aplicativo, toque em <b>adicionar</b> e leia o QR Code abaixo.</li>
            <li>Digite o código de 6 dígitos que aparecer.</li>
          </ol>
          <img src={enroll.qr} alt="QR Code para o aplicativo autenticador" className="mx-auto w-48 rounded-xl bg-white p-2" />
          <div className="text-center text-xs text-slate-500">
            Não consegue ler? Digite a chave: <span className="break-all font-mono">{enroll.secret}</span>
            <div className="mt-2 flex justify-center"><CopyButton text={enroll.secret} label="Copiar chave" /></div>
          </div>
          <Field label="Código do aplicativo">
            <Input inputMode="numeric" autoComplete="one-time-code" required value={code}
              onChange={(e) => setCode(onlyDigits(e.target.value))} className="text-center font-mono text-xl tracking-[.4em]" />
          </Field>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => { setEnroll(null); setCode(""); }}>Cancelar</Button>
            <Button type="submit" className="flex-1" loading={loading} disabled={code.length !== 6}>Confirmar e ativar</Button>
          </div>
        </form>
      )}
    </Card>
  );
}
