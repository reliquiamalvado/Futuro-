import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Building2, Cpu, History, Home, KeyRound, LogOut, Moon, ShieldCheck, Sun, UserCircle2, Users,
} from "lucide-react";
import { useAuth } from "../lib/auth";
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

interface Item { to: string; label: string; icon: ReactNode; show: boolean; mobile?: string }

export default function Layout() {
  const { profile, isSuper, isAdmin, isTitular, roleLabel, signOut } = useAuth();
  const { dark, toggle } = useTheme();
  const nav = useNavigate();

  const items: Item[] = [
    { to: "/", label: "Início", icon: <Home className="size-5" />, show: true, mobile: "Início" },
    { to: "/historico", label: "Histórico", icon: <History className="size-5" />, show: true, mobile: "Histórico" },
    { to: "/residencias", label: "Residências", icon: <Users className="size-5" />, show: isAdmin || isTitular, mobile: "Residências" },
    { to: "/chaves", label: "Chaves temporárias", icon: <KeyRound className="size-5" />, show: isAdmin || isTitular },
    { to: "/dispositivos", label: "Portões e dispositivos", icon: <Cpu className="size-5" />, show: isAdmin, mobile: "Portões" },
    { to: "/organizacoes", label: "Clientes", icon: <Building2 className="size-5" />, show: isSuper },
    { to: "/auditoria", label: "Auditoria e segurança", icon: <ShieldCheck className="size-5" />, show: isAdmin },
    { to: "/conta", label: "Minha conta", icon: <UserCircle2 className="size-5" />, show: true, mobile: "Conta" },
  ];
  const visible = items.filter((i) => i.show);

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
        <nav className="flex flex-1 flex-col gap-1">
          {visible.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.to === "/"} className={linkCls}>
              {i.icon}
              {i.label}
            </NavLink>
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
            {i.icon}
            {i.mobile}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
