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
      <div className="dark relative hidden flex-1 overflow-hidden bg-ink-950 lg:block">
        <div className="absolute inset-0 lp-grid" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(47,123,255,.35),transparent_55%),radial-gradient(circle_at_80%_85%,rgba(34,211,238,.18),transparent_50%)]" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <Link to="/sobre"><Logo /></Link>
          <div>
            <h2 className="max-w-md text-4xl font-bold leading-tight tracking-tight">
              Seu portão abre <span className="bg-gradient-to-r from-brand-400 to-cyan-300 bg-clip-text text-transparent">só para você.</span>
            </h2>
            <p className="mt-4 max-w-md text-slate-300">
              Abra de qualquer lugar com a sua digital, libere visitas por tempo limitado e veja quem entrou e quando.
            </p>
            <ul className="mt-8 grid max-w-md gap-2 text-sm text-slate-300">
              {["Digital, rosto ou senha em toda abertura", "Verificação em duas etapas", "Seus dados nunca são vendidos"].map((t) => (
                <li key={t} className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-cyan-300" />{t}</li>
              ))}
            </ul>
          </div>
          <p className="text-sm text-slate-400">© {new Date().getFullYear()} AuggeControl · <Link to="/sobre" className="hover:text-white">Quem somos</Link></p>
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
      <div className="mt-4 text-center text-sm">
        <Link to="/recuperar-senha" className="text-brand-500 hover:underline">Esqueci a senha</Link>
      </div>
      <div className="mt-6 rounded-2xl border border-slate-200 p-4 text-center dark:border-ink-800">
        <p className="text-sm text-slate-500">Ainda não tem conta?</p>
        <Link to="/cadastro" state={loc.state}
          className="mt-2 inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-ink-950 dark:hover:bg-slate-200">
          Criar conta grátis
        </Link>
      </div>
      <Link to="/sobre" className="mt-4 flex items-center justify-center gap-1.5 text-sm font-medium text-slate-500 hover:text-brand-500">
        Quem somos: conheça o AuggeControl →
      </Link>
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
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("A senha deve ter pelo menos 8 caracteres.");
    if (password !== confirm) return setError("As senhas não conferem.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return setError(errMsg(error));
    setDone(true);
  }

  if (done) {
    return (
      <Shell title="Senha alterada" subtitle="Pronto! Sua nova senha já está valendo.">
        <div className="space-y-4">
          <Alert tone="green">Da próxima vez, entre com o seu e-mail e a <b>nova senha</b>.</Alert>
          <p className="text-sm text-slate-500">
            A senha de <b>abrir o portão</b> é outra e não mudou. Se esqueceu também essa, recupere em Minha conta.
          </p>
          <Button className="w-full" onClick={() => nav("/", { replace: true })}>Ir para o AuggeControl</Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title="Crie sua nova senha" subtitle="Você chegou pelo link do e-mail. Escolha uma senha nova para entrar no app.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nova senha" hint="Pelo menos 8 caracteres. Misture letras e números.">
          <Input type={show ? "text" : "password"} autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Repita a nova senha">
          <Input type={show ? "text" : "password"} autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-500">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="size-4" /> Mostrar senha
        </label>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" className="w-full" loading={loading}>Salvar nova senha</Button>
      </form>
    </Shell>
  );
}

const LINK_ERROS: Record<string, { titulo: string; texto: string }> = {
  otp_expired: { titulo: "Este link expirou", texto: "Por segurança, os links do e-mail valem por pouco tempo e só uma vez. Peça um novo, é rapidinho." },
  default: { titulo: "Este link não funciona mais", texto: "Ele pode já ter sido usado, ter vencido ou ter sido copiado pela metade. Peça um novo link." },
};

/** Quando o link do e-mail vence ou já foi usado, explica e oferece um novo. */
export function LinkErrorPage() {
  const params = new URLSearchParams(window.location.search);
  const info = LINK_ERROS[params.get("codigo") ?? ""] ?? LINK_ERROS.default;
  return (
    <Shell title={info.titulo} subtitle={info.texto}>
      <div className="space-y-3">
        <Link to="/recuperar-senha" className="inline-flex w-full items-center justify-center rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">
          Enviar um novo link de senha
        </Link>
        <Link to="/login" className="inline-flex w-full items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold dark:border-ink-800">
          Ir para o login
        </Link>
        <p className="pt-2 text-xs text-slate-500">Dica: abra o link no mesmo celular ou computador em que você pediu, e use sempre o e-mail mais recente.</p>
      </div>
    </Shell>
  );
}
