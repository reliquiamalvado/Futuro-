import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2, Clock3, Copy, Download, HelpCircle, KeyRound, Lock, QrCode, Share2, ShieldCheck, Smartphone,
  UserCheck, WifiOff,
} from "lucide-react";
import { Logo } from "../components/Layout";

/** Página pública com o passo a passo da verificação em duas etapas (pode ser enviada para qualquer pessoa). */
export default function Help2faPage() {
  const [copied, setCopied] = useState(false);
  useEffect(() => { document.title = "Verificação em duas etapas · AuggeControl"; window.scrollTo(0, 0); }, []);

  async function share() {
    const url = `${window.location.origin}/ajuda/2fa`;
    const data = { title: "AuggeControl · Verificação em duas etapas", text: "Passo a passo para proteger sua conta do AuggeControl:", url };
    try {
      if (navigator.share) { await navigator.share(data); return; }
    } catch { /* cancelado */ }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* sem permissão */ }
  }

  return (
    <div className="dark min-h-screen overflow-x-hidden bg-ink-950 text-slate-100">
      <div className="pointer-events-none fixed inset-0 lp-grid" aria-hidden />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_at_top,rgba(47,123,255,.22),transparent_60%)]" aria-hidden />

      <header className="relative z-10 mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-5">
        <Link to="/"><Logo /></Link>
        <button onClick={share}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3 py-2 text-sm font-medium text-slate-200 hover:bg-white/10">
          {copied ? <><CheckCircle2 className="size-4 text-emerald-400" /> Link copiado</> : <><Share2 className="size-4" /> Enviar este guia</>}
        </button>
      </header>

      <main className="relative z-10 mx-auto max-w-4xl px-4 pb-20">
        <section className="pb-8 pt-4">
          <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/5 px-3 py-1 text-xs font-medium text-cyan-200">
            <ShieldCheck className="size-3.5" /> Guia rápido · 3 minutos
          </span>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-balance sm:text-5xl">Verificação em duas etapas</h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-300">
            É como ter <b className="text-white">duas fechaduras</b> na sua conta: a sua senha e um código que só aparece no seu celular.
            Mesmo que alguém descubra a sua senha, <b className="text-white">não consegue entrar</b> nem abrir os seus portões.
          </p>
        </section>

        <div className="mb-10 grid gap-3 sm:grid-cols-3">
          <Info icon={<UserCheck className="size-5" />} t="É opcional" d="Você escolhe se quer usar. Dá para ativar e desativar quando quiser." />
          <Info icon={<WifiOff className="size-5" />} t="Funciona sem internet" d="O código é gerado no próprio celular, mesmo no modo avião." />
          <Info icon={<Clock3 className="size-5" />} t="Muda a cada 30 s" d="Cada código vale por pouco tempo, então não adianta alguém copiar." />
        </div>

        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-cyan-300">Passo a passo</h2>
        <ol className="space-y-4">
          <Step n={1} icon={<Download className="size-5" />} t="Instale um app autenticador (grátis)">
            <p>Na loja do seu celular (App Store ou Play Store), procure e instale <b>um</b> destes:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><b>Google Authenticator</b></li>
              <li><b>Microsoft Authenticator</b></li>
            </ul>
          </Step>
          <Step n={2} icon={<Smartphone className="size-5" />} t="Abra o AuggeControl em Minha conta">
            <p>Entre no app, toque no seu nome e depois em <b>Minha conta</b>. Na parte <b>Verificação em duas etapas</b>, toque em
              {" "}<b>“Ativar verificação em duas etapas”</b>.</p>
            <Link to="/conta#2fa" className="mt-3 inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
              Ir para Minha conta
            </Link>
          </Step>
          <Step n={3} icon={<QrCode className="size-5" />} t="Leia o QR code com o autenticador">
            <p>Vai aparecer um quadrado (QR code). No app autenticador, toque em <b>+</b> e escolha <b>“Ler código QR”</b>. Aponte a câmera para o quadrado.</p>
            <p className="mt-2 rounded-xl bg-white/5 p-3 text-sm">
              <b>Está usando o AuggeControl no mesmo celular?</b> Não tem como ler o QR code com a câmera. Toque em <b>“Copiar chave”</b>,
              abra o autenticador, toque em <b>+</b> → <b>“Inserir chave de configuração”</b> e cole a chave.
            </p>
          </Step>
          <Step n={4} icon={<KeyRound className="size-5" />} t="Digite o código de 6 números">
            <p>O autenticador vai mostrar <b>AuggeControl</b> com um número de 6 dígitos. Digite esse número no AuggeControl e toque em
              {" "}<b>“Confirmar e ativar”</b>. Pronto, está ativado ✅</p>
          </Step>
          <Step n={5} icon={<Lock className="size-5" />} t="Recomendado: cadastre um celular reserva">
            <p>Depois de ativar, toque em <b>“Adicionar celular reserva”</b> e repita o passo 3 em um segundo aparelho (por exemplo, o tablet ou o celular
              de alguém de confiança da casa). Se perder um, o outro continua funcionando.</p>
          </Step>
        </ol>

        <h2 className="mb-4 mt-12 text-sm font-semibold uppercase tracking-wider text-cyan-300">Como fica no dia a dia</h2>
        <div className="rounded-3xl border border-white/10 bg-white/[.03] p-5 text-slate-300">
          <p>Quando você <b className="text-white">entrar na conta</b> num aparelho novo, o app pede a senha e depois o código de 6 números.
            Abra o autenticador, veja o código e digite. Enquanto você continuar logado, ele <b className="text-white">não pede de novo</b>,
            e abrir o portão continua igual: com a digital, o rosto ou a senha de abertura.</p>
        </div>

        <h2 className="mb-4 mt-12 text-sm font-semibold uppercase tracking-wider text-cyan-300">Dúvidas comuns</h2>
        <div className="space-y-3">
          <Faq q="Perdi ou troquei de celular. E agora?">
            Se você cadastrou um celular reserva, é só usar ele. Se não, fale com o <b>administrador do seu condomínio ou empresa</b>:
            depois de confirmar que é você mesmo, ele libera a sua conta para entrar só com a senha, e você ativa de novo.
            Por segurança, ninguém consegue fazer isso pelo próprio app sozinho.
          </Faq>
          <Faq q="O código não funciona.">
            Confira se digitou o código <b>atual</b> (ele muda a cada 30 segundos). Se continuar errado, vá nos ajustes do celular e deixe a
            {" "}<b>data e hora automáticas</b>: o código depende do relógio do aparelho.
          </Faq>
          <Faq q="Posso usar SMS em vez do aplicativo?">
            Não. O SMS pode ser desviado por golpistas (clonagem de chip). O app autenticador é bem mais seguro e não depende da operadora.
          </Faq>
          <Faq q="O AuggeControl consegue ver meus códigos?">
            Não. Os códigos são gerados só no seu celular. Ninguém da equipe do AuggeControl ou do seu condomínio tem acesso a eles.
          </Faq>
          <Faq q="Quero desativar.">
            Em <b>Minha conta</b>, na parte Verificação em duas etapas, toque na lixeira ao lado do aparelho. A conta volta a pedir só a senha.
          </Faq>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-cyan-300/20 bg-cyan-300/5 p-5">
          <p className="text-sm text-cyan-100">Conhece alguém que usa o AuggeControl? Mande este guia para ajudar a proteger a conta dela.</p>
          <button onClick={share}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-ink-950 hover:bg-slate-200">
            {copied ? <><CheckCircle2 className="size-4" /> Link copiado</> : <><Copy className="size-4" /> Enviar guia</>}
          </button>
        </div>
      </main>
    </div>
  );
}

function Info({ icon, t, d }: { icon: ReactNode; t: string; d: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[.03] p-5">
      <div className="mb-3 grid size-10 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300">{icon}</div>
      <h3 className="font-semibold text-white">{t}</h3>
      <p className="mt-1 text-sm text-slate-400">{d}</p>
    </div>
  );
}

function Step({ n, icon, t, children }: { n: number; icon: ReactNode; t: string; children: ReactNode }) {
  return (
    <li className="flex gap-4 rounded-3xl border border-white/10 bg-white/[.03] p-5">
      <div className="flex flex-col items-center">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-500/20 text-brand-400">{icon}</div>
        <span className="mt-2 text-xs font-bold text-slate-500">{n}/5</span>
      </div>
      <div className="min-w-0 text-slate-300">
        <h3 className="mb-1 text-lg font-semibold text-white">{t}</h3>
        {children}
      </div>
    </li>
  );
}

function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="group rounded-2xl border border-white/10 bg-white/[.03] p-4 open:bg-white/[.05]">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-white">
        <HelpCircle className="size-4 shrink-0 text-cyan-300" /> {q}
      </summary>
      <p className="mt-2 pl-6 text-sm text-slate-300">{children}</p>
    </details>
  );
}
