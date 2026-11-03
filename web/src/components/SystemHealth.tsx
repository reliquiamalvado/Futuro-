import { useEffect, useState } from "react";
import { Gauge } from "lucide-react";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { cx } from "./ui";

interface Health {
  banco_mb: number; banco_pct: number; placas_ativas: number; chamadas_pct: number;
  usuarios_mes: number; usuarios_pct: number; maior_pct: number;
}

/** Aviso, só para o super admin, de quanto dos limites do plano grátis está em uso. */
export function SystemHealthBanner() {
  const { isSuper } = useAuth();
  const [h, setH] = useState<Health | null>(null);
  useEffect(() => {
    if (!isSuper) return;
    supabase.rpc("system_health").then(({ data }) => data && setH(data as Health));
  }, [isSuper]);
  if (!isSuper || !h) return null;

  const level = h.maior_pct >= 90 ? "red" : h.maior_pct >= 70 ? "amber" : "ok";
  const items = [
    { t: "Placas nos portões", v: `${h.placas_ativas} ativa(s)`, p: h.chamadas_pct },
    { t: "Banco de dados", v: `${h.banco_mb} MB`, p: h.banco_pct },
    { t: "Usuários no mês", v: `${h.usuarios_mes}`, p: h.usuarios_pct },
  ];
  return (
    <div className={cx("rounded-2xl border p-4",
      level === "red" ? "border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10"
        : level === "amber" ? "border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10"
        : "border-slate-200 bg-white dark:border-ink-800 dark:bg-ink-900")}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold"><Gauge className="size-4 text-brand-500" /> Plano grátis: uso dos limites</span>
        <span className="text-xs text-slate-500">
          {level === "red" ? "URGENTE: perto de parar. Fale comigo para aumentar o limite." : level === "amber" ? "Atenção: chegando perto do limite." : "Tudo dentro do plano grátis."}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {items.map((i) => (
          <div key={i.t}>
            <div className="flex justify-between text-xs"><span className="text-slate-500">{i.t}</span><span className="tabular-nums">{i.v} · {i.p}%</span></div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-ink-800">
              <div className={cx("h-full rounded-full", i.p >= 90 ? "bg-red-500" : i.p >= 70 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${Math.min(100, i.p)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
