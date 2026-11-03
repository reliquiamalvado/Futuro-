import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Ban, Clock3, Cookie, Cpu, Database, EyeOff, FileText, Fingerprint, Gavel, Globe2, HeartHandshake, KeyRound,
  Lock, Mail, RefreshCw, Scale, Server, ShieldAlert, ShieldCheck, Trash2, UserCheck, Users, Wrench,
} from "lucide-react";
import { Logo } from "../components/Layout";

const SUPORTE = import.meta.env.VITE_SUPPORT_EMAIL as string | undefined;
const ATUALIZADO = "03/11/2026";
const VERSAO = "2.0";

interface Sec { id: string; title: string; icon: ReactNode; body: ReactNode }

function Contato() {
  return (
    <>
      <p>
        Você pode exercer qualquer direito <b>diretamente no app</b>, em <Link to="/seguranca" className="text-cyan-300 underline">Privacidade e segurança</Link>
        {" "}(baixar seus dados, ver a atividade da conta, sair de todos os aparelhos e excluir a conta).
      </p>
      <p>
        Para outras solicitações, fale com o encarregado pelo tratamento de dados (DPO) do AuggeControl
        {SUPORTE ? <> pelo e-mail <span className="select-all font-semibold text-white">{SUPORTE}</span></> : <> pelo canal de suporte informado no app</>}.
        Respondemos em até <b>15 dias</b>. Se morar em um condomínio ou usar em uma empresa, o administrador do local também pode ajudar.
      </p>
      <p>Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD), em <span className="select-all">www.gov.br/anpd</span>.</p>
    </>
  );
}

function LegalShell({ kind, title, intro, summary, sections }: {
  kind: "privacidade" | "termos"; title: string; intro: ReactNode;
  summary: { icon: ReactNode; t: string; d: string }[]; sections: Sec[];
}) {
  const [active, setActive] = useState(sections[0].id);
  useEffect(() => {
    document.title = `${title} · AuggeControl`;
    window.scrollTo(0, 0);
    const io = new IntersectionObserver((es) => {
      const vis = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setActive(vis.target.id);
    }, { rootMargin: "-20% 0px -70% 0px" });
    sections.forEach((s) => { const el = document.getElementById(s.id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [sections, title]);

  return (
    <div className="dark min-h-screen overflow-x-hidden bg-ink-950 text-slate-100">
      <div className="pointer-events-none fixed inset-0 lp-grid" aria-hidden />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_at_top,rgba(47,123,255,.22),transparent_60%)]" aria-hidden />

      <header className="relative z-10 mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5">
        <Link to="/sobre"><Logo /></Link>
        <nav className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-2xl border border-white/10 bg-white/[.03] p-1 text-sm">
          <Link to="/privacidade" className={kind === "privacidade" ? "rounded-xl bg-white px-3 py-1.5 font-semibold text-ink-950" : "rounded-xl px-3 py-1.5 text-slate-300 hover:text-white"}>Privacidade</Link>
          <Link to="/termos" className={kind === "termos" ? "rounded-xl bg-white px-3 py-1.5 font-semibold text-ink-950" : "rounded-xl px-3 py-1.5 text-slate-300 hover:text-white"}><span className="sm:hidden">Termos</span><span className="hidden sm:inline">Termos de uso</span></Link>
        </nav>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-20">
        <section className="pb-10 pt-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/5 px-3 py-1 text-xs font-medium text-cyan-200">
            {kind === "privacidade" ? <ShieldCheck className="size-3.5" /> : <FileText className="size-3.5" />}
            Versão {VERSAO} · atualizada em {ATUALIZADO}
          </span>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-balance sm:text-5xl">{title}</h1>
          <div className="mt-4 max-w-3xl text-lg text-slate-300">{intro}</div>
        </section>

        <section aria-label="Resumo" className="mb-12">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-cyan-300">Resumo em 30 segundos</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {summary.map((s) => (
              <div key={s.t} className="rounded-3xl border border-white/10 bg-white/[.03] p-5">
                <div className="mb-3 grid size-10 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300">{s.icon}</div>
                <h3 className="font-semibold text-white">{s.t}</h3>
                <p className="mt-1 text-sm text-slate-400">{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-10 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <nav className="sticky top-6 space-y-0.5 text-sm" aria-label="Índice">
              <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Nesta página</div>
              {sections.map((s, i) => (
                <a key={s.id} href={`#${s.id}`}
                  className={"flex gap-2 rounded-xl px-3 py-1.5 transition " + (active === s.id ? "bg-brand-500/15 text-white" : "text-slate-400 hover:text-white")}>
                  <span className="tabular-nums text-slate-500">{String(i + 1).padStart(2, "0")}</span>{s.title}
                </a>
              ))}
            </nav>
          </aside>

          <article className="min-w-0 space-y-4">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className="scroll-mt-6 rounded-3xl border border-white/10 bg-white/[.025] p-6 sm:p-8">
                <h2 className="mb-4 flex items-center gap-3 text-xl font-semibold text-white">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-brand-300">{s.icon}</span>
                  <span><span className="mr-2 text-sm tabular-nums text-slate-500">{String(i + 1).padStart(2, "0")}</span>{s.title}</span>
                </h2>
                <div className="space-y-3 text-[15px] leading-relaxed text-slate-300 [&_b]:text-white [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-1.5">
                  {s.body}
                </div>
              </section>
            ))}
          </article>
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-slate-400">
          <Logo />
          <div className="flex gap-4">
            <Link to="/sobre" className="hover:text-white">Quem somos</Link>
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

function DataTable({ rows }: { rows: [string, string, string][] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="bg-white/[.04] text-xs uppercase tracking-wider text-slate-400">
          <tr><th className="px-4 py-3">Dado</th><th className="px-4 py-3">Para quê</th><th className="px-4 py-3">Base legal (LGPD)</th></tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map(([a, b, c]) => (
            <tr key={a}><td className="px-4 py-3 font-medium text-white">{a}</td><td className="px-4 py-3">{b}</td><td className="px-4 py-3 text-slate-400">{c}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PrivacyPage() {
  const sections: Sec[] = [
    { id: "quem-somos", title: "Quem somos", icon: <HeartHandshake className="size-5" />, body: <>
      <p>
        O <b>AuggeControl</b> é uma plataforma para abrir e controlar portões eletrônicos pelo celular, com histórico de acessos e
        chaves temporárias para visitantes. Atendemos casas, condomínios e empresas.
      </p>
      <p>
        Quando você usa o app por conta própria (por exemplo, na sua casa), o AuggeControl é o <b>controlador</b> dos seus dados.
        Quando você usa o app dentro de um condomínio ou empresa, esse local também decide sobre os dados dos moradores
        (por exemplo, quem pode abrir cada portão), e o AuggeControl trata os dados seguindo as instruções dele e esta política.
      </p>
    </> },
    { id: "dados", title: "Quais dados coletamos e por quê", icon: <Database className="size-5" />, body: <>
      <p>Coletamos <b>somente o necessário</b> para o portão abrir com segurança:</p>
      <DataTable rows={[
        ["Nome, e-mail e telefone (opcional)", "Criar sua conta, identificar você para o administrador do local e permitir recuperar o acesso.", "Execução do contrato (art. 7º, V)"],
        ["Login com Google", "Entrar sem criar senha. Recebemos só nome, e-mail e foto de perfil da sua conta Google.", "Execução do contrato (art. 7º, V)"],
        ["Casas, condomínios e papel", "Saber quais portões você pode abrir (titular, morador ou administrador).", "Execução do contrato (art. 7º, V)"],
        ["Histórico de acionamentos", "Registrar quem abriu, qual portão, quando e o resultado, para a segurança do local.", "Legítimo interesse e segurança (art. 7º, IX)"],
        ["Atividade de segurança da conta", "Registrar criação e troca de senha de abertura, biometria cadastrada e tentativas bloqueadas.", "Legítimo interesse e prevenção a fraudes (art. 7º, IX)"],
        ["Chaves temporárias", "Nome que o titular deu à chave, período de validade e cada uso. Visitantes não precisam criar conta.", "Execução do contrato (art. 7º, V)"],
        ["Dados técnicos de acesso", "Data, hora e endereço IP de login, para segurança e para cumprir o Marco Civil da Internet.", "Obrigação legal (art. 7º, II)"],
        ["Dados do equipamento", "Identificação, versão do programa, IP e força do sinal Wi-Fi da placa do portão, para saber se está online.", "Execução do contrato (art. 7º, V)"],
      ]} />
    </> },
    { id: "nao-coletamos", title: "O que nunca coletamos", icon: <EyeOff className="size-5" />, body: <>
      <ul>
        <li><b>Sua digital e seu rosto.</b> A confirmação por biometria usa o padrão WebAuthn (o mesmo das chaves de acesso dos bancos): a leitura acontece só no seu celular. Recebemos apenas uma <b>chave pública</b>, que não permite reconstruir a sua digital.</li>
        <li><b>Senhas legíveis.</b> A senha da conta e a senha de abertura ficam guardadas só em forma embaralhada (hash bcrypt). Nem a nossa equipe consegue lê-las.</li>
        <li><b>Senha do Wi-Fi da sua casa.</b> Ela é digitada direto na placa do portão e fica só lá dentro.</li>
        <li><b>Localização, contatos, fotos, câmera ou microfone</b> do seu celular.</li>
        <li><b>Rastreadores de publicidade.</b> Não usamos cookies de anúncio nem ferramentas de rastreamento de terceiros.</li>
      </ul>
      <p>E nunca <b>vendemos, alugamos ou usamos</b> seus dados para publicidade.</p>
    </> },
    { id: "quem-ve", title: "Quem pode ver seus dados", icon: <Users className="size-5" />, body: <>
      <ul>
        <li><b>Você</b> vê todos os seus dados e a atividade da sua conta.</li>
        <li><b>O titular da sua casa</b> vê os moradores dela e o histórico de acionamentos da casa.</li>
        <li><b>O administrador do condomínio ou empresa</b> vê os moradores, os portões e o histórico do local que ele administra.</li>
        <li><b>Outros locais nunca veem seus dados.</b> Essa separação é garantida por regras dentro do próprio banco de dados, não só na tela do app.</li>
        <li><b>A equipe do AuggeControl</b> só acessa dados quando necessário para suporte, segurança ou ordem legal, e esses acessos ficam registrados.</li>
      </ul>
    </> },
    { id: "compartilhamento", title: "Com quem compartilhamos", icon: <Server className="size-5" />, body: <>
      <p>Usamos poucos fornecedores (operadores), cada um só para o necessário:</p>
      <ul>
        <li><b>Supabase:</b> banco de dados, login e servidores do app.</li>
        <li><b>Vercel:</b> hospedagem do site do aplicativo.</li>
        <li><b>Google:</b> somente se você escolher "Continuar com Google".</li>
        <li><b>Autoridades:</b> somente quando houver obrigação legal ou ordem judicial.</li>
      </ul>
      <p>
        Esses fornecedores podem manter servidores fora do Brasil. Nesses casos, a transferência segue o art. 33 da LGPD,
        com fornecedores que adotam padrões reconhecidos de proteção de dados e criptografia.
      </p>
    </> },
    { id: "seguranca", title: "Como protegemos seus dados", icon: <Lock className="size-5" />, body: <>
      <ul>
        <li><b>Confirmação a cada abertura:</b> digital, rosto ou senha de abertura, para que um celular roubado não abra o portão.</li>
        <li><b>Verificação em duas etapas (2FA)</b> disponível para todas as contas.</li>
        <li><b>Criptografia em trânsito:</b> app, servidor e placa do portão conversam só por HTTPS.</li>
        <li><b>Chave única por equipamento,</b> guardada só como hash, e código de pareamento de uso único.</li>
        <li><b>Bloqueio de tentativas:</b> 5 senhas erradas travam por 15 minutos.</li>
        <li><b>Permissões no banco de dados:</b> cada consulta é filtrada pelo que você pode ver.</li>
        <li><b>Histórico imutável:</b> nenhum usuário, nem administrador, consegue alterar ou apagar registros de acesso.</li>
        <li><b>Testes automáticos</b> de permissão e segurança a cada mudança no sistema.</li>
      </ul>
    </> },
    { id: "retencao", title: "Por quanto tempo guardamos", icon: <Clock3 className="size-5" />, body: <>
      <ul>
        <li><b>Dados da conta:</b> enquanto a conta existir.</li>
        <li><b>Ao excluir a conta:</b> apagamos na hora seu perfil, seus vínculos, sua senha de abertura e suas biometrias.</li>
        <li><b>Histórico de acionamentos:</b> continua existindo para a segurança do local, mas <b>sem o seu nome</b> (fica anônimo).</li>
        <li><b>Registros técnicos de acesso (IP, data e hora):</b> no mínimo 6 meses, como exige o Marco Civil da Internet (art. 15).</li>
        <li><b>Chaves temporárias:</b> deixam de funcionar no fim da validade; o registro de uso fica no histórico do local.</li>
      </ul>
    </> },
    { id: "direitos", title: "Seus direitos (LGPD, art. 18)", icon: <UserCheck className="size-5" />, body: <>
      <div className="grid gap-2 sm:grid-cols-2">
        {[
          ["Confirmar e acessar", "Baixe um arquivo com todos os seus dados em Privacidade e segurança."],
          ["Corrigir", "Altere nome e telefone em Minha conta."],
          ["Excluir", "Exclua sua conta em Privacidade e segurança, a qualquer momento."],
          ["Portabilidade", "O arquivo de dados vem em formato aberto (JSON)."],
          ["Saber com quem compartilhamos", "Veja a seção \"Com quem compartilhamos\"."],
          ["Revogar consentimento", "Desative recursos opcionais, como o login com Google, quando quiser."],
          ["Opor-se e revisar", "Fale com o encarregado se discordar de algum tratamento."],
          ["Reclamar à ANPD", "Você pode reclamar à Autoridade Nacional de Proteção de Dados."],
        ].map(([t, d]) => (
          <div key={t} className="rounded-2xl bg-white/[.03] p-4"><div className="font-semibold text-white">{t}</div><div className="text-sm text-slate-400">{d}</div></div>
        ))}
      </div>
    </> },
    { id: "armazenamento", title: "Cookies e armazenamento no aparelho", icon: <Cookie className="size-5" />, body: <>
      <p>Guardamos no seu navegador apenas o essencial para o app funcionar:</p>
      <ul>
        <li><b>Sessão de login,</b> para você não precisar entrar a cada vez.</li>
        <li><b>Preferência de tema</b> (claro ou escuro).</li>
      </ul>
      <p>Não usamos cookies de publicidade, de rastreamento ou de terceiros. Ao sair da conta, a sessão é apagada.</p>
    </> },
    { id: "menores", title: "Crianças e adolescentes", icon: <ShieldAlert className="size-5" />, body: <>
      <p>
        O cadastro é destinado a maiores de 18 anos. Menores de idade só podem usar o app com autorização e supervisão do
        responsável legal, que responde pelo acesso concedido (art. 14 da LGPD).
      </p>
    </> },
    { id: "incidentes", title: "Se algo der errado", icon: <ShieldCheck className="size-5" />, body: <>
      <p>
        Se acontecer um incidente de segurança que possa trazer risco a você, vamos avisar você e a ANPD em prazo razoável,
        explicando o que aconteceu, quais dados foram afetados e o que estamos fazendo (art. 48 da LGPD).
      </p>
    </> },
    { id: "mudancas", title: "Mudanças nesta política", icon: <RefreshCw className="size-5" />, body: <>
      <p>
        Quando houver mudanças importantes, avisaremos no app antes de entrarem em vigor. A versão e a data de atualização
        ficam sempre no topo desta página.
      </p>
    </> },
    { id: "contato", title: "Fale com a gente", icon: <Mail className="size-5" />, body: <Contato /> },
  ];
  return (
    <LegalShell kind="privacidade" title="Política de Privacidade"
      intro={<>Escrita para ser entendida. Aqui está exatamente quais dados usamos, por quê, quem vê e como você controla tudo, conforme a Lei Geral de Proteção de Dados (LGPD).</>}
      summary={[
        { icon: <Database className="size-5" />, t: "Só o necessário", d: "Nome, e-mail, seus portões e o histórico de aberturas. Mais nada." },
        { icon: <Fingerprint className="size-5" />, t: "Biometria no seu celular", d: "Sua digital e seu rosto nunca chegam aos nossos servidores." },
        { icon: <Ban className="size-5" />, t: "Nada é vendido", d: "Sem anúncios, sem rastreadores, sem venda de dados." },
        { icon: <Trash2 className="size-5" />, t: "Você no controle", d: "Baixe ou apague seus dados a qualquer momento, pelo app." },
      ]}
      sections={sections} />
  );
}

export function TermsPage() {
  const sections: Sec[] = [
    { id: "aceite", title: "Aceite", icon: <FileText className="size-5" />, body: <>
      <p>
        Estes Termos regulam o uso do AuggeControl (site, aplicativo e equipamentos). Ao criar uma conta ou usar o app,
        você concorda com eles e com a <Link to="/privacidade" className="text-cyan-300 underline">Política de Privacidade</Link>.
        Se não concordar, não use o serviço.
      </p>
    </> },
    { id: "definicoes", title: "Quem é quem", icon: <Users className="size-5" />, body: <>
      <ul>
        <li><b>Administrador:</b> responsável por uma casa, condomínio ou empresa no app. Cadastra portões, equipamentos e moradores.</li>
        <li><b>Titular:</b> responsável por uma residência. Convida e gerencia os moradores dela.</li>
        <li><b>Morador:</b> pessoa autorizada a abrir os portões liberados para ela.</li>
        <li><b>Visitante:</b> quem recebe uma chave temporária. Não precisa criar conta.</li>
        <li><b>Equipamento:</b> a placa instalada junto à central do portão, que recebe os comandos do app.</li>
      </ul>
    </> },
    { id: "servico", title: "O serviço", icon: <Globe2 className="size-5" />, body: <>
      <p>
        O AuggeControl permite abrir e fechar portões pelo celular, gerenciar quem tem acesso, criar chaves temporárias e
        consultar o histórico de acionamentos. O app funciona junto com o portão e o controle que você já tem: <b>não os substitui</b>.
      </p>
      <p>
        Planos e preços, quando aplicáveis, serão informados de forma clara antes de qualquer cobrança.
      </p>
    </> },
    { id: "conta", title: "Sua conta e sua segurança", icon: <KeyRound className="size-5" />, body: <>
      <ul>
        <li>Você precisa ter <b>18 anos ou mais</b> e informar dados verdadeiros.</li>
        <li>Mantenha em sigilo sua senha e sua <b>senha de abertura</b>. Recomendamos ativar a verificação em duas etapas e cadastrar a digital ou o rosto.</li>
        <li>Se esquecer a senha de abertura, você pode recuperá-la sozinho <b>uma vez</b>. Depois disso, só o administrador do local pode liberar uma nova.</li>
        <li>Suspeitou de uso indevido? Troque a senha e use "Sair de todos os aparelhos" em Privacidade e segurança.</li>
        <li>Você responde pelas ações feitas com a sua conta, salvo quando comprovar uso indevido por terceiros que não pôde evitar.</li>
      </ul>
    </> },
    { id: "permissoes", title: "Acessos, convites e chaves temporárias", icon: <UserCheck className="size-5" />, body: <>
      <ul>
        <li>Seu acesso a cada portão depende de autorização do titular ou do administrador, que podem <b>alterar ou bloquear</b> esse acesso a qualquer momento.</li>
        <li>Quem cria uma chave temporária é responsável por ela. Qualquer pessoa com o link pode usá-la dentro do período e dos horários definidos. Compartilhe só com quem você quer liberar e revogue quando não precisar mais.</li>
        <li>Todas as aberturas ficam registradas com quem, quando e como, e podem ser consultadas pelos responsáveis do local.</li>
      </ul>
    </> },
    { id: "equipamentos", title: "Equipamentos e instalação", icon: <Cpu className="size-5" />, body: <>
      <ul>
        <li>A instalação deve ser feita com a <b>energia desligada</b> e somente nos bornes de baixa tensão (botoeira e alimentação auxiliar). <b>Nunca</b> conecte o equipamento à rede de 127/220 V do motor.</li>
        <li>Se não se sentir seguro, chame um <b>técnico de portão eletrônico</b>. O AuggeControl não se responsabiliza por danos causados por instalação incorreta.</li>
        <li>Cada equipamento fica vinculado a uma única casa ou local. Para levá-lo a outro lugar, é preciso reconfigurá-lo e pareá-lo de novo.</li>
      </ul>
    </> },
    { id: "uso", title: "O que não é permitido", icon: <Ban className="size-5" />, body: <>
      <ul>
        <li>Abrir portões sem autorização ou tentar acessar locais, contas ou dados de outras pessoas.</li>
        <li>Tentar burlar permissões, a confirmação de abertura ou os limites de tentativas.</li>
        <li>Copiar, modificar ou fazer engenharia reversa do app, do servidor ou do programa dos equipamentos para fins indevidos.</li>
        <li>Usar o serviço para atividades ilegais ou que coloquem pessoas em risco.</li>
      </ul>
      <p>O descumprimento pode levar à suspensão ou exclusão da conta, sem prejuízo das medidas legais cabíveis.</p>
    </> },
    { id: "disponibilidade", title: "Disponibilidade e limitações", icon: <Wrench className="size-5" />, body: <>
      <ul>
        <li>A abertura pelo app depende de <b>energia elétrica, internet</b> (no celular e no local) e do bom estado do equipamento, da central e do portão.</li>
        <li>Trabalhamos para o serviço funcionar o tempo todo, mas podem ocorrer interrupções por manutenção ou falhas de terceiros.</li>
        <li>Por isso, <b>mantenha sempre outro meio de abertura</b>, como o controle remoto ou a chave do portão.</li>
      </ul>
    </> },
    { id: "responsabilidade", title: "Responsabilidades", icon: <Scale className="size-5" />, body: <>
      <p>
        O AuggeControl responde pelos danos que causar, nos termos da lei. Não respondemos por falhas causadas por falta de
        energia ou de internet, defeitos no portão ou na central, instalação incorreta, uso indevido da conta ou de chaves
        temporárias compartilhadas pelo próprio usuário. Nada nestes Termos limita direitos garantidos pelo Código de Defesa do Consumidor.
      </p>
    </> },
    { id: "encerramento", title: "Encerramento da conta", icon: <Trash2 className="size-5" />, body: <>
      <p>
        Você pode excluir sua conta quando quiser, em Privacidade e segurança. Se for o único administrador de um local com
        outros moradores, primeiro adicione outro administrador. O que acontece com seus dados está explicado na Política de Privacidade.
      </p>
    </> },
    { id: "propriedade", title: "Propriedade intelectual", icon: <ShieldCheck className="size-5" />, body: <>
      <p>
        A marca AuggeControl, o app, o site e o programa dos equipamentos pertencem ao AuggeControl. Você recebe uma licença
        pessoal, não exclusiva e intransferível para usá-los conforme estes Termos.
      </p>
    </> },
    { id: "mudancas", title: "Mudanças nestes termos", icon: <RefreshCw className="size-5" />, body: <>
      <p>
        Podemos atualizar estes Termos. Mudanças importantes serão avisadas no app antes de entrarem em vigor. Se continuar
        usando o serviço depois disso, você concorda com a nova versão.
      </p>
    </> },
    { id: "lei", title: "Lei e foro", icon: <Gavel className="size-5" />, body: <>
      <p>
        Estes Termos seguem as leis do Brasil. Eventuais disputas serão resolvidas no foro do domicílio do consumidor,
        conforme o Código de Defesa do Consumidor.
      </p>
    </> },
    { id: "contato", title: "Fale com a gente", icon: <Mail className="size-5" />, body: <Contato /> },
  ];
  return (
    <LegalShell kind="termos" title="Termos de Uso"
      intro={<>As regras do jogo, sem letras miúdas: o que o AuggeControl faz, o que você pode esperar dele e os cuidados para usar com segurança.</>}
      summary={[
        { icon: <KeyRound className="size-5" />, t: "Sua conta, sua chave", d: "Guarde suas senhas e ative a digital e a verificação em 2 etapas." },
        { icon: <UserCheck className="size-5" />, t: "Acesso autorizado", d: "Cada portão só abre para quem o responsável liberou." },
        { icon: <Wrench className="size-5" />, t: "Instalação segura", d: "Energia desligada e nunca na rede de 220 V. Na dúvida, chame um técnico." },
        { icon: <Globe2 className="size-5" />, t: "Tenha um plano B", d: "Sem internet ou energia o app não abre: mantenha o controle remoto." },
      ]}
      sections={sections} />
  );
}
