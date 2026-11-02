import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase, type AccountType } from "../lib/supabase";
import { PROFILE_LABEL, ProfileChooser, nextPathFor } from "../components/ProfileChooser";
import { errMsg, safePath } from "../lib/util";
import { Alert, Button, Field, Input } from "../components/ui";
import { Logo } from "../components/Layout";

function Shell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <div className="relative hidden flex-1 overflow-hidden bg-ink-900 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(47,123,255,.35),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(47,123,255,.15),transparent_50%)]" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <Logo />
          <div>
            <h2 className="max-w-md text-4xl font-semibold leading-tight">Controle de acesso inteligente para portões.</h2>
            <p className="mt-4 max-w-md text-slate-300">
              Residências, condomínios e empresas abrindo portões com segurança, histórico completo e acessos temporários.
            </p>
          </div>
          <p className="text-sm text-slate-400">© {new Date().getFullYear()} AuggeControl</p>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <Logo className="mb-10 lg:hidden" />
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          <p className="mt-10 text-center text-xs text-slate-400">
            <Link to="/privacidade" className="hover:underline">Privacidade</Link> · <Link to="/termos" className="hover:underline">Termos de Uso</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        loading={loading}
        onClick={async () => {
          setLoading(true);
          setError(null);
          const { error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo: window.location.origin + safePath(sessionStorage.getItem("dc.voltar")) },
          });
          if (error) { setError(errMsg(error)); setLoading(false); }
        }}
      >
        <svg viewBox="0 0 48 48" className="size-4" aria-hidden>
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
          <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
        </svg>
        Continuar com Google
      </Button>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
    </>
  );
}

function Divider() {
  return (
    <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
      <div className="h-px flex-1 bg-slate-200 dark:bg-ink-800" /> ou <div className="h-px flex-1 bg-slate-200 dark:bg-ink-800" />
    </div>
  );
}

export function LoginPage() {
  const nav = useNavigate();
  const loc = useLocation();
  const from = safePath((loc.state as { from?: string } | null)?.from);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) return setError(errMsg(error));
    nav(from, { replace: true });
  }

  sessionStorage.setItem("dc.voltar", from);

  return (
    <Shell title="Entrar" subtitle="Acesse sua conta AuggeControl.">
      <GoogleButton />
      <Divider />
      <form onSubmit={submit} className="space-y-4">
        <Field label="E-mail">
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Senha">
          <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" className="w-full" loading={loading}>Entrar</Button>
      </form>
      <div className="mt-6 flex justify-between text-sm">
        <Link to="/recuperar-senha" className="text-brand-500 hover:underline">Esqueci a senha</Link>
        <Link to="/cadastro" state={loc.state} className="text-brand-500 hover:underline">Criar conta</Link>
      </div>
    </Shell>
  );
}

export function SignupPage() {
  const loc = useLocation();
  const [type, setType] = useState<AccountType | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  // Quem veio por um link de convite já sabe o caminho.
  const rawFrom = (loc.state as { from?: string } | null)?.from;
  const from = rawFrom ? safePath(rawFrom) : undefined;
  const target = from && from !== "/" ? from : nextPathFor(type);

  function choose(t: AccountType) {
    setType(t);
    try { localStorage.setItem("dc.perfil", t); } catch { /* sem storage */ }
    sessionStorage.setItem("dc.voltar", from && from !== "/" ? from : nextPathFor(t));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("A senha deve ter pelo menos 8 caracteres.");
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: name.trim(), account_type: type }, emailRedirectTo: window.location.origin + target },
    });
    setLoading(false);
    if (error) return setError(errMsg(error));
    if (data.session) nav(target, { replace: true });
    else setDone(true);
  }

  if (done) {
    return (
      <Shell title="Confirme seu e-mail">
        <Alert tone="green">
          Enviamos um link de confirmação para <b>{email}</b>. Abra o e-mail e clique no link para ativar sua conta.
        </Alert>
        <Link to="/login" className="mt-6 inline-block text-sm text-brand-500 hover:underline">Voltar para o login</Link>
      </Shell>
    );
  }

  if (step === 1) {
    return (
      <Shell title="Criar conta" subtitle="Primeiro, conte como você vai usar o AuggeControl.">
        <ProfileChooser value={type} onChange={choose} compact />
        <Button className="mt-6 w-full" disabled={!type} onClick={() => setStep(2)}>Continuar</Button>
        <p className="mt-6 text-sm">
          Já tem conta? <Link to="/login" state={loc.state} className="text-brand-500 hover:underline">Entrar</Link>
        </p>
      </Shell>
    );
  }

  return (
    <Shell title="Criar conta" subtitle={type ? `Perfil: ${PROFILE_LABEL[type]}` : undefined}>
      <button type="button" onClick={() => setStep(1)} className="-mt-6 mb-6 text-sm text-brand-500 hover:underline">← Trocar perfil</button>
      <GoogleButton />
      <Divider />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nome completo">
          <Input required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="E-mail">
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Senha" hint="Mínimo de 8 caracteres.">
          <Input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" className="w-full" loading={loading}>Criar conta</Button>
      </form>
      <p className="mt-6 text-sm">
        Já tem conta? <Link to="/login" state={loc.state} className="text-brand-500 hover:underline">Entrar</Link>
      </p>
    </Shell>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + "/redefinir-senha",
    });
    setLoading(false);
    if (error) return setError(errMsg(error));
    setSent(true);
  }

  return (
    <Shell title="Recuperar senha" subtitle="Enviaremos um link para você criar uma nova senha.">
      {sent ? (
        <Alert tone="green">Se houver uma conta com <b>{email}</b>, você receberá o link em instantes.</Alert>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="E-mail">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" className="w-full" loading={loading}>Enviar link</Button>
        </form>
      )}
      <Link to="/login" className="mt-6 inline-block text-sm text-brand-500 hover:underline">Voltar para o login</Link>
    </Shell>
  );
}

export function ResetPasswordPage() {
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("A senha deve ter pelo menos 8 caracteres.");
    if (password !== confirm) return setError("As senhas não conferem.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return setError(errMsg(error));
    nav("/", { replace: true });
  }

  return (
    <Shell title="Nova senha" subtitle="Escolha uma nova senha para sua conta.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nova senha">
          <Input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirmar senha">
          <Input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" className="w-full" loading={loading}>Salvar nova senha</Button>
      </form>
    </Shell>
  );
}
