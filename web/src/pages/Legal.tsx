import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Logo } from "../components/Layout";

const SUPORTE = import.meta.env.VITE_SUPPORT_EMAIL as string | undefined;
const ATUALIZADO = "02/11/2026";

function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/"><Logo className="mb-10" /></Link>
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-slate-500">Última atualização: {ATUALIZADO}</p>
      <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-900 dark:[&_h2]:text-slate-100 [&_li]:ml-5 [&_li]:list-disc">
        {children}
        <h2>Contato</h2>
        <p>
          Dúvidas e solicitações sobre seus dados podem ser feitas ao administrador do seu condomínio ou empresa
          {SUPORTE ? <> ou pelo e-mail <a className="text-brand-500" href={`mailto:${SUPORTE}`}>{SUPORTE}</a></> : null}.
        </p>
      </div>
      <div className="mt-12 flex gap-4 text-sm">
        <Link to="/privacidade" className="text-brand-500 hover:underline">Política de Privacidade</Link>
        <Link to="/termos" className="text-brand-500 hover:underline">Termos de Uso</Link>
        <Link to="/login" className="text-brand-500 hover:underline">Entrar</Link>
      </div>
    </div>
  );
}

export function PrivacyPage() {
  return (
    <Page title="Política de Privacidade">
      <p>
        O AuggeControl é uma plataforma de controle de acesso e automação de portões. Esta política explica quais
        dados pessoais tratamos, para quê e quais são os seus direitos, conforme a Lei Geral de Proteção de Dados (LGPD).
      </p>

      <h2>Dados que coletamos</h2>
      <ul>
        <li><b>Cadastro:</b> nome, e-mail e, se você informar, telefone. Ao entrar com o Google, recebemos apenas nome, e-mail e foto de perfil da sua conta Google.</li>
        <li><b>Vínculos:</b> residências, condomínios ou empresas a que você pertence e seu papel (titular, morador ou administrador).</li>
        <li><b>Registros de acesso:</b> data, horário, portão acionado e resultado de cada comando, além de alterações feitas nos cadastros.</li>
        <li><b>Chaves temporárias:</b> nome dado à chave pelo titular, período de validade e registros de uso. Visitantes não precisam criar conta.</li>
        <li><b>Equipamentos:</b> identificação, versão de firmware, endereço IP e intensidade de sinal dos dispositivos instalados.</li>
      </ul>

      <h2>Para que usamos</h2>
      <ul>
        <li>Autenticar você e permitir o acionamento dos portões autorizados.</li>
        <li>Permitir que titulares e administradores gerenciem moradores, permissões e acessos temporários.</li>
        <li>Manter histórico de acionamentos e auditoria para segurança do local.</li>
        <li>Detectar e registrar tentativas de acesso indevido.</li>
      </ul>
      <p>Não vendemos seus dados e não os usamos para publicidade.</p>

      <h2>Quem pode ver seus dados</h2>
      <ul>
        <li>O titular da sua residência e os administradores da sua organização veem seu nome, contato e histórico de acionamentos.</li>
        <li>Cada organização cliente vê apenas os próprios dados; não há acesso entre clientes.</li>
        <li>Os dados ficam armazenados em infraestrutura de nuvem (Supabase), com comunicação criptografada (HTTPS).</li>
      </ul>

      <h2>Por quanto tempo guardamos</h2>
      <p>
        Mantemos os dados enquanto sua conta ou o vínculo com a organização existir. Registros de acesso e auditoria podem
        ser mantidos pelo período necessário à segurança do local e ao cumprimento de obrigações legais.
      </p>

      <h2>Seus direitos</h2>
      <p>
        Você pode acessar e corrigir seus dados em "Minha conta", e pode solicitar a exclusão da conta, informações sobre o
        tratamento ou a revogação de consentimento pelos canais de contato abaixo.
      </p>
    </Page>
  );
}

export function TermsPage() {
  return (
    <Page title="Termos de Uso">
      <p>Ao usar o AuggeControl você concorda com estes termos.</p>

      <h2>O serviço</h2>
      <p>
        O AuggeControl permite acionar portões e gerenciar acessos por meio de equipamentos instalados no local. O
        funcionamento depende de energia, conexão com a internet e do estado dos equipamentos e da central do portão.
      </p>

      <h2>Sua conta</h2>
      <ul>
        <li>Você é responsável por manter sua senha em sigilo e pelas ações feitas com a sua conta.</li>
        <li>O acesso a cada residência depende de autorização do titular ou da administração, que podem bloqueá-lo a qualquer momento.</li>
      </ul>

      <h2>Uso adequado</h2>
      <ul>
        <li>Acione apenas portões aos quais você tem permissão.</li>
        <li>Compartilhe chaves temporárias somente com as pessoas a quem você deseja liberar o acesso. Quem tiver o link poderá usá-lo dentro do período definido.</li>
        <li>É proibido tentar burlar permissões, acessar dados de outros usuários ou interferir no funcionamento da plataforma.</li>
      </ul>

      <h2>Responsabilidades</h2>
      <p>
        Todas as ações ficam registradas. Falhas de conexão ou de equipamento podem impedir o acionamento remoto; mantenha
        sempre um meio alternativo de abertura do portão.
      </p>

      <h2>Alterações</h2>
      <p>Estes termos podem ser atualizados. A data da última atualização aparece no topo desta página.</p>
    </Page>
  );
}
