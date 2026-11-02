import { Link } from "react-router-dom";
import {
  ArrowRight, BellRing, Building2, CheckCircle2, Clock3, Cpu, EyeOff, Fingerprint, History, Home, KeyRound, Lock,
  ScanFace, Server, ShieldCheck, Smartphone, Wifi, XCircle,
} from "lucide-react";
import { Logo } from "../components/Layout";

const LAYERS = [
  { icon: <Fingerprint className="size-5" />, t: "Digital, rosto ou senha a cada abertura", d: "Celular roubado com o app aberto não abre o portão. Sem você, nada acontece." },
  { icon: <Smartphone className="size-5" />, t: "Verificação em duas etapas", d: "Mesmo que descubram sua senha, precisam do código que só o seu celular gera." },
  { icon: <Lock className="size-5" />, t: "Conexão sempre criptografada", d: "App, servidor e equipamento conversam só por HTTPS, o mesmo padrão dos bancos." },
  { icon: <Cpu className="size-5" />, t: "Equipamento com chave própria", d: "Cada placa tem uma chave secreta única, guardada só como hash. Copiar uma não abre outra." },
  { icon: <ShieldCheck className="size-5" />, t: "Cada pessoa vê só o que é dela", d: "Regras dentro do próprio banco de dados: um morador nunca enxerga outra casa." },
  { icon: <Clock3 className="size-5" />, t: "Bloqueio contra tentativas", d: "5 senhas erradas travam por 15 minutos. Ataques automáticos são barrados." },
  { icon: <History className="size-5" />, t: "Histórico que não pode ser apagado", d: "Quem abriu, quando e por onde. Nem o administrador consegue alterar os registros." },
];

const STEPS = [
  { n: "01", icon: <Cpu className="size-6" />, t: "Instale a placa", d: "Uma pequena placa ao lado do motor, ligada com 4 fios finos. Funciona com portão de correr, pivotante, basculante e levadiço." },
  { n: "02", icon: <Wifi className="size-6" />, t: "Conecte pelo celular", d: "Escolha o Wi-Fi da casa e digite o código que aparece no app. Sem programar nada." },
  { n: "03", icon: <Fingerprint className="size-6" />, t: "Abra de qualquer lugar", d: "Um toque e a sua digital. Em casa ou em outra cidade, em 2 segundos." },
];

const KEEP = [
  { ok: true, t: "Nome, e-mail e telefone que você informar" },
  { ok: true, t: "Quais portões você pode abrir e quando abriu" },
  { ok: true, t: "Senha de abertura, só embaralhada (hash)" },
  { ok: false, t: "Sua digital ou seu rosto: nunca saem do celular" },
  { ok: false, t: "Localização, contatos, fotos ou câmera" },
  { ok: false, t: "Senha do Wi-Fi: fica só dentro da placa" },
  { ok: false, t: "Venda ou compartilhamento de dados: jamais" },
];

/** Portão com feixe de varredura e a digital no centro. */
function HeroVisual() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-md">
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(47,123,255,.35),transparent_65%)] blur-2xl" />
      <div className="lp-orbit absolute inset-6 rounded-full border border-brand-400/20" />
      <div className="lp-orbit-rev absolute inset-16 rounded-full border border-dashed border-cyan-300/25" />
      <div className="absolute inset-0 grid place-items-center">
        <div className="relative w-64 overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-brand-500/20 backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between text-xs text-slate-300">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-emerald-400 lp-blink" /> Portão da garagem</span>
            <span className="text-slate-400">online</span>
          </div>
          <div className="relative mx-auto mb-4 grid h-28 place-items-center overflow-hidden rounded-2xl bg-ink-900/80">
            <div className="flex h-16 gap-1.5">
              {Array.from({ length: 9 }).map((_, i) => <span key={i} className="lp-gate w-1.5 rounded-full bg-slate-400/70" style={{ animationDelay: `${i * 0.05}s` }} />)}
            </div>
            <span className="lp-scan absolute inset-x-0 h-10 bg-gradient-to-b from-transparent via-cyan-300/30 to-transparent" />
          </div>
          <div className="mx-auto grid size-16 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-cyan-400 text-white shadow-lg shadow-cyan-500/30 lp-pulse">
            <Fingerprint className="size-8" />
          </div>
          <p className="mt-3 text-center text-xs text-slate-300">Toque e confirme com a digital</p>
          <div className="lp-toast mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500/15 py-2 text-xs font-semibold text-emerald-300">
            <CheckCircle2 className="size-4" /> Portão aberto · 1,8 s
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="dark min-h-screen overflow-x-hidden bg-ink-950 text-slate-100">
      <div className="pointer-events-none fixed inset-0 lp-grid" aria-hidden />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[600px] bg-[radial-gradient(ellipse_at_top,rgba(47,123,255,.25),transparent_60%)]" aria-hidden />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link to="/login" className="rounded-xl px-4 py-2 text-sm font-medium text-slate-300 hover:text-white">Entrar</Link>
          <Link to="/cadastro" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-ink-950 hover:bg-slate-200">Criar conta</Link>
        </nav>
      </header>

      <main className="relative z-10">
        {/* HERO */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-8 lg:grid-cols-2 lg:pt-16">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/5 px-3 py-1 text-xs font-medium text-cyan-200">
              <ShieldCheck className="size-3.5" /> 7 camadas de segurança · privacidade por padrão
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-[1.05] tracking-tight text-balance sm:text-6xl">
              Seu portão abre <span className="bg-gradient-to-r from-brand-400 to-cyan-300 bg-clip-text text-transparent">só para você.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-300">
              O AuggeControl transforma qualquer portão eletrônico em um portão inteligente. Abra pelo celular de onde estiver,
              com a sua digital, libere visitas por tempo limitado e saiba exatamente quem entrou e quando.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/cadastro" className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-brand-500 to-cyan-500 px-6 py-3.5 font-semibold text-white shadow-lg shadow-brand-500/30 hover:brightness-110">
                Quero o meu <ArrowRight className="size-4" />
              </Link>
              <a href="#seguranca" className="inline-flex items-center gap-2 rounded-2xl border border-white/15 px-6 py-3.5 font-semibold text-slate-200 hover:bg-white/5">
                Ver como protegemos você
              </a>
            </div>
            <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 text-center">
              {[["~2 s", "para abrir"], ["0", "dados vendidos"], ["100%", "do histórico guardado"]].map(([v, l]) => (
                <div key={l} className="rounded-2xl border border-white/10 bg-white/[.03] p-3">
                  <dt className="text-2xl font-bold tabular-nums text-white">{v}</dt>
                  <dd className="text-xs text-slate-400">{l}</dd>
                </div>
              ))}
            </dl>
          </div>
          <HeroVisual />
        </section>

        {/* O QUE FAZ */}
        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-3xl font-bold tracking-tight">Tudo o que o seu portão sempre deveria fazer</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { i: <Smartphone className="size-6" />, t: "Abra de qualquer lugar", d: "Em casa, no trabalho ou em outra cidade. Basta internet no celular." },
              { i: <KeyRound className="size-6" />, t: "Chaves para visitas", d: "Um link que funciona só no dia e no horário que você escolher, e expira sozinho." },
              { i: <BellRing className="size-6" />, t: "Histórico em tempo real", d: "Cada abertura registrada com quem, quando e como. Exporte quando quiser." },
              { i: <Building2 className="size-6" />, t: "Casa ou condomínio", d: "Da casa da família ao condomínio com blocos, moradores e síndico." },
            ].map((f) => (
              <div key={f.t} className="rounded-3xl border border-white/10 bg-white/[.03] p-6 transition hover:border-brand-400/40 hover:bg-white/[.05]">
                <div className="mb-4 grid size-11 place-items-center rounded-2xl bg-brand-500/15 text-brand-300">{f.i}</div>
                <h3 className="font-semibold text-white">{f.t}</h3>
                <p className="mt-1 text-sm text-slate-400">{f.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* SEGURANÇA */}
        <section id="seguranca" className="mx-auto max-w-6xl scroll-mt-8 px-4 py-16">
          <div className="max-w-2xl">
            <span className="text-sm font-semibold uppercase tracking-wider text-cyan-300">Transparência total</span>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">7 camadas entre o seu portão e quem não deveria abri-lo</h2>
            <p className="mt-3 text-slate-400">Nada de "confie em nós". Aqui está exatamente o que acontece a cada vez que alguém toca em "abrir".</p>
          </div>
          <ol className="mt-10 grid gap-3 md:grid-cols-2">
            {LAYERS.map((l, i) => (
              <li key={l.t} className="flex gap-4 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[.04] to-transparent p-5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300">{l.icon}</span>
                <span>
                  <span className="text-xs font-semibold tabular-nums text-slate-500">CAMADA {i + 1}</span>
                  <span className="block font-semibold text-white">{l.t}</span>
                  <span className="mt-0.5 block text-sm text-slate-400">{l.d}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* PRIVACIDADE */}
        <section className="mx-auto max-w-6xl px-4 py-16">
          <div className="grid gap-10 rounded-[2rem] border border-white/10 bg-gradient-to-br from-brand-500/10 via-transparent to-cyan-400/5 p-8 lg:grid-cols-2 lg:p-12">
            <div>
              <EyeOff className="size-9 text-cyan-300" />
              <h2 className="mt-4 text-3xl font-bold tracking-tight">Privado por padrão.<br />Seu, de verdade.</h2>
              <p className="mt-3 text-slate-300">
                Guardamos o mínimo para o portão funcionar. Você pode ver, baixar ou apagar tudo a qualquer momento,
                direto no app, como garante a LGPD.
              </p>
              <div className="mt-6 flex flex-wrap gap-2 text-xs">
                {["Baixar meus dados", "Excluir minha conta", "Sair de todos os aparelhos", "Ver atividade da conta"].map((t) => (
                  <span key={t} className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-slate-200">{t}</span>
                ))}
              </div>
            </div>
            <ul className="space-y-3">
              {KEEP.map((k) => (
                <li key={k.t} className="flex items-start gap-3 rounded-2xl bg-ink-900/60 p-4">
                  {k.ok ? <Server className="mt-0.5 size-5 shrink-0 text-slate-400" /> : <XCircle className="mt-0.5 size-5 shrink-0 text-emerald-400" />}
                  <span className="text-sm">
                    <span className={k.ok ? "font-semibold text-slate-300" : "font-semibold text-emerald-300"}>{k.ok ? "Guardamos: " : "Não guardamos: "}</span>
                    <span className="text-slate-300">{k.t}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* COMO FUNCIONA */}
        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-3xl font-bold tracking-tight">Do pacote ao primeiro "clique" em 3 passos</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[.03] p-6">
                <span className="absolute -right-2 -top-4 text-7xl font-black text-white/[.04]">{s.n}</span>
                <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-cyan-500 text-white">{s.icon}</div>
                <h3 className="font-semibold text-white">{s.t}</h3>
                <p className="mt-1 text-sm text-slate-400">{s.d}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 flex items-center gap-2 text-sm text-slate-400">
            <ScanFace className="size-4 text-cyan-300" /> O controle remoto e o botão que você já tem continuam funcionando normalmente.
          </p>
        </section>

        {/* PARA QUEM */}
        <section className="mx-auto max-w-6xl px-4 py-16">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { i: <Home className="size-6" />, t: "Para a sua casa", d: "Família inteira com acesso, cada um com a própria digital. Visitas com chave que expira." },
              { i: <Building2 className="size-6" />, t: "Para condomínios", d: "Blocos, moradores, aprovações, comunicados e relatórios para o síndico." },
              { i: <ShieldCheck className="size-6" />, t: "Para empresas", d: "Controle de quem entra, em qual horário, com auditoria completa." },
            ].map((c) => (
              <div key={c.t} className="rounded-3xl border border-white/10 bg-white/[.03] p-6">
                <div className="mb-3 text-cyan-300">{c.i}</div>
                <h3 className="font-semibold text-white">{c.t}</h3>
                <p className="mt-1 text-sm text-slate-400">{c.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-4 pb-20 pt-8">
          <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-r from-brand-600 to-cyan-600 p-10 text-center lg:p-14">
            <div className="absolute inset-0 lp-grid opacity-30" aria-hidden />
            <h2 className="relative text-3xl font-bold tracking-tight text-white sm:text-4xl">O futuro do seu portão começa hoje.</h2>
            <p className="relative mx-auto mt-3 max-w-xl text-white/85">Crie sua conta grátis, configure sua casa em 3 passos e abra o portão com a sua digital.</p>
            <Link to="/cadastro" className="relative mt-8 inline-flex items-center gap-2 rounded-2xl bg-white px-7 py-3.5 font-semibold text-ink-950 hover:bg-slate-100">
              Criar minha conta <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-slate-400">
          <Logo />
          <div className="flex gap-4">
            <Link to="/privacidade" className="hover:text-white">Privacidade</Link>
            <Link to="/termos" className="hover:text-white">Termos de uso</Link>
            <Link to="/login" className="hover:text-white">Entrar</Link>
          </div>
          <span>© {new Date().getFullYear()} AuggeControl</span>
        </div>
      </footer>
    </div>
  );
}
