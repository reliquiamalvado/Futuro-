import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BarChart3, Building2, ChevronRight, History, Home, KeyRound, LogOut, Moon, ShieldCheck, Sun, UserCog, Users } from "lucide-react";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { ROLE_LABEL, STATUS_LABEL, errMsg } from "../lib/util";
import { Alert, Badge, Button, Card, Field, Input, PageHeader } from "../components/ui";
import { useTheme } from "../components/Layout";
import { PROFILE_LABEL } from "../components/ProfileChooser";
import { TwoFactorCard } from "./Mfa";

export default function AccountPage() {
  const { profile, session, memberships, adminOrgs, roleLabel, isAdmin, isSuper, isTitular, refresh, signOut } = useAuth();
  const { dark, toggle } = useTheme();
  const nav = useNavigate();

  const [name, setName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [msg, setMsg] = useState<{ tone: "green" | "red"; text: string } | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwMsg, setPwMsg] = useState<{ tone: "green" | "red"; text: string } | null>(null);
  const [sessMsg, setSessMsg] = useState<string | null>(null);

  const provider = session?.user.app_metadata?.provider;

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("profiles").update({ full_name: name.trim(), phone: phone.trim() || null }).eq("id", profile!.id);
    setMsg(error ? { tone: "red", text: errMsg(error) } : { tone: "green", text: "Dados atualizados." });
    if (!error) refresh();
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return setPwMsg({ tone: "red", text: "A senha deve ter pelo menos 8 caracteres." });
    if (pw !== pw2) return setPwMsg({ tone: "red", text: "As senhas não conferem." });
    const { error } = await supabase.auth.updateUser({ password: pw });
    setPwMsg(error ? { tone: "red", text: errMsg(error) } : { tone: "green", text: "Senha alterada." });
    if (!error) { setPw(""); setPw2(""); }
  }

  const manager = isAdmin || isTitular;
  const shortcuts = [
    { to: "/historico", label: "Acionamentos", icon: <History className="size-5" />, show: manager },
    { to: "/moradores", label: "Moradores", icon: <Users className="size-5" />, show: manager },
    { to: "/residencias", label: "Residências", icon: <Home className="size-5" />, show: isAdmin },
    { to: "/chaves", label: "Chaves temporárias", icon: <KeyRound className="size-5" />, show: manager },
    { to: "/relatorios", label: "Relatórios", icon: <BarChart3 className="size-5" />, show: isAdmin },
    { to: "/auditoria", label: "Auditoria", icon: <ShieldCheck className="size-5" />, show: isAdmin },
    { to: "/administradores", label: "Administradores", icon: <UserCog className="size-5" />, show: isAdmin },
    { to: "/organizacoes", label: "Clientes", icon: <Building2 className="size-5" />, show: isSuper },
  ].filter((s) => s.show);

  return (
    <div className="space-y-6">
      <PageHeader title="Minha conta" subtitle={<>{profile?.email} · <span className="text-brand-500">{roleLabel}</span>
        {profile?.account_type && <> · Perfil: {PROFILE_LABEL[profile.account_type]}</>}</>} />

      {shortcuts.length > 0 && (
        <Card className="p-2 lg:hidden">
          {shortcuts.map((s) => (
            <Link key={s.to} to={s.to} className="flex items-center justify-between rounded-xl px-3 py-3 hover:bg-slate-50 dark:hover:bg-ink-800">
              <span className="flex items-center gap-3 text-sm font-medium">{s.icon}{s.label}</span>
              <ChevronRight className="size-4 text-slate-400" />
            </Link>
          ))}
        </Card>
      )}

      <TwoFactorCard />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">Dados pessoais</h2>
          <form onSubmit={saveProfile} className="space-y-4">
            <Field label="Nome"><Input required value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Telefone"><Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
            {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
            <Button type="submit">Salvar</Button>
          </form>
        </Card>

        <Card>
          <h2 className="mb-4 font-semibold">Alterar senha</h2>
          {provider === "google" && <p className="mb-3 text-sm text-slate-500">Você entra com o Google. Definir uma senha permite entrar também com e-mail.</p>}
          <form onSubmit={changePassword} className="space-y-4">
            <Field label="Nova senha"><Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
            <Field label="Confirmar nova senha"><Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
            {pwMsg && <Alert tone={pwMsg.tone}>{pwMsg.text}</Alert>}
            <Button type="submit">Alterar senha</Button>
          </form>
        </Card>

        <Card>
          <h2 className="mb-4 font-semibold">Meus acessos</h2>
          <ul className="space-y-2 text-sm">
            {adminOrgs.map((o) => (
              <li key={o.id} className="flex justify-between"><span>{o.name}</span><Badge tone="blue">{isSuper ? "Super Admin" : "Admin"}</Badge></li>
            ))}
            {memberships.map((m) => (
              <li key={m.id} className="flex justify-between gap-2">
                <span>{m.residence_name} <span className="text-slate-500">· {m.org_name}</span></span>
                <span className="flex gap-1">
                  <Badge>{ROLE_LABEL[m.role]}</Badge>
                  <Badge tone={m.status === "ativo" ? "green" : m.status === "pendente" ? "amber" : "red"}>{STATUS_LABEL[m.status]}</Badge>
                </span>
              </li>
            ))}
            {!adminOrgs.length && !memberships.length && <li className="text-slate-500">Nenhum acesso ainda. <Link to="/convite" className="text-brand-500">Usar convite</Link></li>}
          </ul>
          {!isSuper && (
            <Link to="/configurar-casa" className="mt-4 inline-block text-sm text-brand-500 hover:underline">+ Configurar uma casa</Link>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 font-semibold">Preferências e sessões</h2>
          <div className="space-y-3">
            <Button variant="secondary" className="w-full justify-start" onClick={toggle}>
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />} Tema {dark ? "claro" : "escuro"}
            </Button>
            <Button variant="secondary" className="w-full justify-start" onClick={async () => {
              await signOut("others");
              setSessMsg("Você foi desconectado de todos os outros aparelhos.");
            }}>
              <ShieldCheck className="size-4" /> Encerrar sessões em outros aparelhos
            </Button>
            <Button variant="secondary" className="w-full justify-start" onClick={async () => { await signOut("global"); nav("/login"); }}>
              <LogOut className="size-4" /> Sair de todos os aparelhos
            </Button>
            <Button variant="danger" className="w-full justify-start" onClick={async () => { await signOut(); nav("/login"); }}>
              <LogOut className="size-4" /> Sair
            </Button>
            {sessMsg && <Alert tone="green">{sessMsg}</Alert>}
          </div>
        </Card>
      </div>
    </div>
  );
}
