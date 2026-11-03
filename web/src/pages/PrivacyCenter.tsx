import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Activity, CheckCircle2, Circle, Download, EyeOff, Fingerprint, KeyRound, Lock, LogOut, Server, ShieldCheck,
  Smartphone, Trash2, UserX,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { getUnlockMethods, type UnlockMethods } from "../lib/unlock";
import { errMsg, fmtDate, must } from "../lib/util";
import { Alert, Button, Card, Input, Modal, PageHeader, Spinner, cx } from "../components/ui";

interface Act { created_at: string; action: string; severity: string; local: string | null }

const ACTION_LABEL: Record<string, string> = {
  "abertura.senha_criada": "Senha de abertura criada",
  "abertura.senha_trocada": "Senha de abertura trocada",
  "abertura.senha_recuperada": "Senha de abertura recuperada (chance usada)",
  "abertura.senha_liberada_admin": "Administrador liberou uma nova senha de abertura",
  "abertura.senha_bloqueada": "Senha de abertura bloqueada por tentativas erradas",
  "abertura.biometria_cadastrada": "Digital/rosto cadastrado",
  "acionamento.super_admin": "Portão acionado (super admin)",
  "acionamento.biometria_recusada": "Digital/rosto recusado ao abrir o portão",
  "dispositivo.pareado": "Equipamento conectado",
  "conta.excluida": "Conta excluída",
};
const label = (a: string) => ACTION_LABEL[a] ?? a.replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** Anel com a nota de proteção da conta. */
function ScoreRing({ value }: { value: number }) {
  const r = 52, c = 2 * Math.PI * r;
  const tone = value >= 80 ? "text-emerald-500" : value >= 50 ? "text-amber-500" : "text-red-500";
  return (
    <div className="relative grid size-36 place-items-center">
      <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90">
        <circle cx="60" cy="60" r={r} className="fill-none stroke-slate-200 dark:stroke-ink-800" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} className={cx("fill-none stroke-current transition-all duration-700", tone)} strokeWidth="10"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} />
      </svg>
      <div className="text-center">
        <div className={cx("text-4xl font-bold tabular-nums", tone)}>{value}</div>
        <div className="text-xs text-slate-500">de 100</div>
      </div>
    </div>
  );
}

export default function PrivacyCenterPage() {
  const { profile, session, signOut } = useAuth();
  const nav = useNavigate();
  const [methods, setMethods] = useState<UnlockMethods | null>(null);
  const [mfa, setMfa] = useState<boolean | null>(null);
  const [acts, setActs] = useState<Act[] | null>(null);
  const [msg, setMsg] = useState<{ tone: "green" | "red" | "amber"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [delOpen, setDelOpen] = useState(false);
  const [delText, setDelText] = useState("");
  const [delErr, setDelErr] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);

  useEffect(() => {
    getUnlockMethods().then(setMethods).catch(() => setMethods(null));
    supabase.auth.mfa.listFactors().then(({ data }) => setMfa(!!data?.totp?.some((f) => f.status === "verified"))).catch(() => setMfa(false));
    supabase.rpc("my_activity", { p_limit: 30 }).then(({ data }) => setActs((data ?? []) as Act[]));
  }, []);

  const checks = [
    { ok: !!(methods?.pin || (methods?.biometrias ?? 0) > 0), pts: 35, icon: <Lock className="size-5" />,
      title: "Confirmação para abrir o portão", desc: "Digital, rosto ou senha de abertura em todo acionamento.", to: "/conta#abertura" },
    { ok: (methods?.biometrias ?? 0) > 0, pts: 20, icon: <Fingerprint className="size-5" />,
      title: "Digital ou rosto cadastrado", desc: "Mais rápido e mais seguro que digitar a senha.", to: "/conta#abertura" },
    { ok: !!mfa, pts: 30, icon: <Smartphone className="size-5" />,
      title: "Verificação em duas etapas (2FA)", desc: "Mesmo com a sua senha, ninguém entra sem o código do seu celular.", to: "/conta#2fa" },
    { ok: !!profile?.phone, pts: 15, icon: <ShieldCheck className="size-5" />,
      title: "Telefone para contato", desc: "Ajuda o administrador a confirmar que é você.", to: "/conta" },
  ];
  const loaded = methods !== null && mfa !== null;
  const score = checks.reduce((s, c) => s + (c.ok ? c.pts : 0), 0);

  async function exportData() {
    setBusy("export"); setMsg(null);
    try {
      const data = must(await supabase.rpc("export_my_data"));
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `meus-dados-auggecontrol-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      setMsg({ tone: "green", text: "Arquivo com os seus dados baixado." });
    } catch (e) { setMsg({ tone: "red", text: errMsg(e) }); }
    finally { setBusy(null); }
  }

  async function signOutEverywhere() {
    if (!confirm("Sair da sua conta em TODOS os aparelhos (inclusive este)?")) return;
    setBusy("global");
    await supabase.auth.signOut({ scope: "global" });
    nav("/login", { replace: true });
  }

  async function deleteAccount() {
    setBusy("delete"); setDelErr(null);
    try {
      const { data, error } = await supabase.functions.invoke("delete-account", { body: { confirmacao: delText.trim().toUpperCase() } });
      if (error) {
        let body: { erro?: string; reautenticar?: boolean } = {};
        try { body = await (error as { context?: Response }).context?.json(); } catch { /* sem corpo */ }
        if (body.reautenticar) setNeedLogin(true);
        throw new Error(body.erro ?? "Não foi possível excluir a conta.");
      }
      if (!data?.ok) throw new Error(data?.erro ?? "Não foi possível excluir a conta.");
      await signOut();
      nav("/login", { replace: true });
    } catch (e) { setDelErr(errMsg(e)); }
    finally { setBusy(null); }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Privacidade e segurança" subtitle="Tudo o que protege a sua conta, o que guardamos sobre você e o controle total dos seus dados." />
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card className="flex flex-col items-center gap-4 text-center">
          <h2 className="font-semibold">Nível de proteção da sua conta</h2>
          {loaded ? <ScoreRing value={score} /> : <div className="grid size-36 place-items-center"><Spinner /></div>}
          <p className="text-sm text-slate-500">
            {score >= 80 ? "Excelente. Sua conta está muito bem protegida." : score >= 50 ? "Bom, mas dá para ficar ainda mais seguro." : "Ative as proteções ao lado: leva 2 minutos."}
          </p>
          <p className="text-xs text-slate-400">Último acesso: {fmtDate(session?.user.last_sign_in_at ?? null)}</p>
        </Card>
        <Card className="space-y-2">
          {checks.map((c) => (
            <Link key={c.title} to={c.to} className="flex items-start gap-3 rounded-xl p-3 transition hover:bg-slate-50 dark:hover:bg-ink-850">
              <span className={cx("mt-0.5", c.ok ? "text-emerald-500" : "text-slate-300 dark:text-ink-700")}>
                {c.ok ? <CheckCircle2 className="size-5" /> : <Circle className="size-5" />}
              </span>
              <span className="flex-1">
                <span className="flex items-center gap-2 font-medium">{c.icon}{c.title}</span>
                <span className="block text-sm text-slate-500">{c.desc}</span>
              </span>
              <span className={cx("text-sm font-semibold tabular-nums", c.ok ? "text-emerald-600" : "text-brand-500")}>{c.ok ? `+${c.pts}` : "Ativar"}</span>
            </Link>
          ))}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-1 flex items-center gap-2 font-semibold"><EyeOff className="size-5 text-brand-500" /> O que guardamos sobre você</h2>
          <p className="mb-4 text-sm text-slate-500">Somente o necessário para o portão abrir com segurança. Nada é vendido nem compartilhado.</p>
          <ul className="space-y-2 text-sm">
            {[
              ["Guardamos", "Nome, e-mail e telefone que você informou."],
              ["Guardamos", "Quais portões você pode abrir e o histórico de quando abriu."],
              ["Embaralhado", "Senha de abertura: só uma versão embaralhada (hash). Nem nós conseguimos ler."],
              ["No seu aparelho", "Sua digital e seu rosto nunca saem do celular. Guardamos só uma chave pública."],
              ["Não guardamos", "Localização, contatos, fotos ou câmera do celular."],
              ["Não guardamos", "Senha do Wi-Fi da sua casa: ela fica apenas dentro do equipamento do portão."],
            ].map(([k, v], i) => (
              <li key={i} className="flex gap-3">
                <span className={cx("w-28 shrink-0 font-semibold", k === "Não guardamos" ? "text-emerald-600" : k === "Guardamos" ? "text-slate-700 dark:text-slate-300" : "text-brand-500")}>{k}</span>
                <span className="text-slate-600 dark:text-slate-300">{v}</span>
              </li>
            ))}
          </ul>
          <Link to="/privacidade" className="mt-4 inline-block text-sm text-brand-500 underline">Ler a política de privacidade completa</Link>
        </Card>

        <Card>
          <h2 className="mb-1 flex items-center gap-2 font-semibold"><Server className="size-5 text-brand-500" /> Seus dados, suas regras</h2>
          <p className="mb-4 text-sm text-slate-500">Direitos garantidos pela LGPD, a um toque de distância.</p>
          <div className="space-y-3">
            <Button variant="secondary" className="w-full justify-start" loading={busy === "export"} onClick={exportData}>
              <Download className="size-4" /> Baixar todos os meus dados
            </Button>
            <Button variant="secondary" className="w-full justify-start" loading={busy === "global"} onClick={signOutEverywhere}>
              <LogOut className="size-4" /> Sair de todos os aparelhos
            </Button>
            <Button variant="secondary" className="w-full justify-start !text-red-600" onClick={() => { setDelOpen(true); setDelText(""); setDelErr(null); }}>
              <UserX className="size-4" /> Excluir minha conta
            </Button>
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="mb-1 flex items-center gap-2 font-semibold"><Activity className="size-5 text-brand-500" /> Atividade da sua conta</h2>
        <p className="mb-4 text-sm text-slate-500">Mudanças de segurança feitas na sua conta. Não reconhece algo? Troque a senha e saia de todos os aparelhos.</p>
        {acts === null ? <Spinner /> : acts.length === 0 ? <p className="text-sm text-slate-500">Nenhuma atividade de segurança ainda.</p> : (
          <ul className="divide-y divide-slate-100 dark:divide-ink-800">
            {acts.map((a, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <KeyRound className={cx("size-4 shrink-0", a.severity === "critico" ? "text-red-500" : a.severity === "alerta" ? "text-amber-500" : "text-slate-400")} />
                  <span className="truncate">{label(a.action)}{a.local ? <span className="text-slate-400"> · {a.local}</span> : null}</span>
                </span>
                <span className="shrink-0 text-xs text-slate-500">{fmtDate(a.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={delOpen} onClose={() => setDelOpen(false)} title="Excluir minha conta">
        <div className="space-y-4 text-sm">
          <Alert tone="amber">
            Isso é permanente. Apagamos seu perfil, seus acessos aos portões, sua senha de abertura e suas biometrias.
            O histórico de acionamentos do condomínio continua existindo, mas <b>sem o seu nome</b>.
          </Alert>
          {needLogin && (
            <Alert tone="blue">
              Por segurança, entre novamente na conta e volte aqui em até 10 minutos.
              <Button size="sm" className="mt-2" onClick={async () => { await signOut(); nav("/login", { state: { from: "/seguranca" } }); }}>Entrar novamente</Button>
            </Alert>
          )}
          <p>Para confirmar, digite <b>EXCLUIR</b>:</p>
          <Input value={delText} onChange={(e) => setDelText(e.target.value)} autoComplete="off" />
          {delErr && <Alert>{delErr}</Alert>}
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setDelOpen(false)}>Cancelar</Button>
            <Button className="flex-1 bg-red-600 hover:bg-red-700" loading={busy === "delete"} disabled={delText.trim().toUpperCase() !== "EXCLUIR"} onClick={deleteAccount}>
              <Trash2 className="size-4" /> Excluir para sempre
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
