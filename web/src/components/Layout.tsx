import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3, Building2, Cpu, History, Home, KeyRound, LayoutDashboard, LogOut, Megaphone, Moon, ShieldCheck,
  Sun, UserCheck, UserCircle2, UserCog, Users,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { unreadAnnouncements } from "../pages/Announcements";
import { cx } from "./ui";

export function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try { localStorage.setItem("dc.tema", dark ? "escuro" : "claro"); } catch { /* sem storage */ }
  }, [dark]);
  return { dark, toggle: () => setDark((d) => !d) };
}

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cx("flex items-center gap-2.5", className)}>
      <img src="/icon.svg" alt="" className="size-8 rounded-lg" />
      <span className="text-lg font-semibold tracking-tight">
        Augge<span className="text-brand-500">Control</span>
      </span>
    </div>
  );
}

interface Item { to: string; label: string; icon: ReactNode; show: boolean; mobile?: string; section: string; badge?: number }

/** Contadores do menu: aprovações pendentes e comunicados não lidos. */
export function useMenuBadges() {
  const { profile, isAdmin, isTitular } = useAuth();
  const loc = useLocation();
  const [pending, setPending] = useState(0);
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!profile) return;
    const load = async () => {
      if (isAdmin || isTitular) {
        const { count } = await supabase.from("residence_members").select("id", { count: "exact", head: true })
          .eq("status", "pendente").neq("user_id", profile.id);
        setPending(count ?? 0);
      }
      setUnread(await unreadAnnouncements(profile.id));
    };
    load();
    const h = () => load();
    window.addEventListener("dc:comunicados", h);
    const t = setInterval(() => !document.hidden && load(), 60_000);
    return () => { window.removeEventListener("dc:comunicados", h); clearInterval(t); };
  }, [profile, isAdmin, isTitular, loc.pathname]);
  return { pending, unread };
}

export default function Layout() {
  const { profile, isSuper, isAdmin, isTitular, roleLabel, signOut, homeOnly, homeResidenceId } = useAuth();
  const { dark, toggle } = useTheme();
  const nav = useNavigate();

  const { pending, unread } = useMenuBadges();
  const manager = isAdmin || isTitular;

  const homeItems: Item[] = [
    { section: "Casa", to: "/", label: "Início", icon: <Home className="size-5" />, show: true, mobile: "Início" },
    { section: "Casa", to: homeResidenceId ? `/residencias/${homeResidenceId}` : "/residencias", label: "Minha casa", icon: <Users className="size-5" />, show: manager, mobile: "Casa", badge: pending },
    { section: "Casa", to: "/chaves", label: "Chaves temporárias", icon: <KeyRound className="size-5" />, show: manager, mobile: "Chaves" },
    { section: "Casa", to: "/dispositivos", label: "Portões e equipamentos", icon: <Cpu className="size-5" />, show: isAdmin, mobile: "Portões" },
    { section: "Casa", to: "/historico", label: "Acionamentos", icon: <History className="size-5" />, show: true, mobile: manager ? undefined : "Acionamentos" },
    { section: "Conta", to: "/conta", label: "Minha conta", icon: <UserCircle2 className="size-5" />, show: true, mobile: "Conta" },
  ];

  const fullItems: Item[] = [
    { section: "Geral", to: "/", label: isAdmin ? "Dashboard" : "Início", icon: isAdmin ? <LayoutDashboard className="size-5" /> : <Home className="size-5" />, show: true, mobile: "Início" },
    { section: "Geral", to: "/comunicados", label: "Comunicados", icon: <Megaphone className="size-5" />, show: true, mobile: "Avisos", badge: unread },
    { section: "Geral", to: "/historico", label: "Acionamentos", icon: <History className="size-5" />, show: true, mobile: manager ? undefined : "Acionamentos" },
    { section: "Gestão", to: "/aprovacoes", label: "Aprovações", icon: <UserCheck className="size-5" />, show: manager, mobile: "Aprovações", badge: pending },
    { section: "Gestão", to: "/moradores", label: "Moradores", icon: <Users className="size-5" />, show: manager },
    { section: "Gestão", to: "/residencias", label: "Residências", icon: <Home className="size-5" />, show: manager, mobile: manager && !isAdmin ? "Residências" : undefined },
    { section: "Gestão", to: "/chaves", label: "Chaves temporárias", icon: <KeyRound className="size-5" />, show: manager },
    { section: "Gestão", to: "/dispositivos", label: "Portões e dispositivos", icon: <Cpu className="size-5" />, show: isAdmin, mobile: "Portões" },
    { section: "Administração", to: "/relatorios", label: "Relatórios", icon: <BarChart3 className="size-5" />, show: isAdmin },
    { section: "Administração", to: "/auditoria", label: "Auditoria", icon: <ShieldCheck className="size-5" />, show: isAdmin },
    { section: "Administração", to: "/administradores", label: "Administradores", icon: <UserCog className="size-5" />, show: isAdmin },
    { section: "Administração", to: "/organizacoes", label: "Clientes", icon: <Building2 className="size-5" />, show: isSuper },
    { section: "Conta", to: "/conta", label: "Minha conta", icon: <UserCircle2 className="size-5" />, show: true, mobile: "Conta" },
  ];
  const visible = (homeOnly ? homeItems : fullItems).filter((i) => i.show);
  const sections = [...new Set(visible.map((i) => i.section))];

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    cx(
      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
      isActive
        ? "bg-brand-500/10 text-brand-600 dark:text-brand-400"
        : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-ink-800 dark:hover:text-slate-100",
    );

  return (
    <div className="min-h-screen lg:flex">
      {/* Menu lateral (computador/tablet) */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-5 lg:flex dark:border-ink-800 dark:bg-ink-900">
        <Logo className="mb-8 px-2" />
        <nav className="-mx-1 flex flex-1 flex-col gap-1 overflow-y-auto px-1">
          {sections.map((sec) => (
            <div key={sec} className="mb-2">
              {sections.length > 2 && sec !== "Conta" && (
                <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{sec}</div>
              )}
              {visible.filter((i) => i.section === sec).map((i) => (
                <NavLink key={i.to} to={i.to} end={i.to === "/"} className={linkCls}>
                  {i.icon}
                  <span className="flex-1">{i.label}</span>
                  {!!i.badge && (
                    <span className="min-w-5 rounded-full bg-brand-500 px-1.5 text-center text-[11px] font-semibold leading-5 text-white">{i.badge}</span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="mt-4 border-t border-slate-200 pt-4 dark:border-ink-800">
          <div className="px-2">
            <div className="truncate text-sm font-medium">{profile?.full_name || profile?.email}</div>
            <div className="text-xs text-brand-500">{roleLabel}</div>
          </div>
          <div className="mt-3 flex gap-1">
            <button onClick={toggle} className="flex-1 rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-ink-800" aria-label="Alternar tema">
              {dark ? <Sun className="mx-auto size-5" /> : <Moon className="mx-auto size-5" />}
            </button>
            <button
              onClick={async () => { await signOut(); nav("/login"); }}
              className="flex-1 rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-ink-800"
              aria-label="Sair"
            >
              <LogOut className="mx-auto size-5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Topo (celular) */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden dark:border-ink-800 dark:bg-ink-900/90">
        <Logo />
        <button onClick={toggle} className="rounded-lg p-2 text-slate-500" aria-label="Alternar tema">
          {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </button>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-10 lg:pt-8">
        <Outlet />
      </main>

      {/* Navegação inferior (celular) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden dark:border-ink-800 dark:bg-ink-900/95">
        {visible.filter((i) => i.mobile).map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            end={i.to === "/"}
            className={({ isActive }) =>
              cx("flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
                isActive ? "text-brand-500" : "text-slate-500 dark:text-slate-400")}
          >
            <span className="relative">
              {i.icon}
              {!!i.badge && <span className="absolute -right-1.5 -top-1 size-2.5 rounded-full bg-brand-500 ring-2 ring-white dark:ring-ink-900" />}
            </span>
            {i.mobile}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
