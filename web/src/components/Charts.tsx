import { useState } from "react";
import { cx } from "./ui";

export interface DayPoint { dia: string; sucesso: number; falha: number }

const fmtDia = (d: string) => {
  const [, m, dd] = d.split("-");
  return `${dd}/${m}`;
};

/** Barras empilhadas por dia: executados (azul) e falhas (vermelho). */
export function DailyBars({ data, height = 180 }: { data: DayPoint[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...data.map((d) => d.sucesso + d.falha));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const total = data.reduce((a, d) => a + d.sucesso + d.falha, 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
        <div className="flex gap-4">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: "var(--chart-ok)" }} /> Executados</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: "var(--chart-fail)" }} /> Falhas / expirados</span>
        </div>
        <button onClick={() => setTable((t) => !t)} className="text-brand-500 hover:underline">
          {table ? "Ver gráfico" : "Ver tabela"}
        </button>
      </div>

      {table ? (
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th className="py-1">Dia</th><th>Executados</th><th>Falhas</th></tr></thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.dia} className="border-t border-slate-100 dark:border-ink-800">
                  <td className="py-1">{fmtDia(d.dia)}</td><td>{d.sucesso}</td><td>{d.falha}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : total === 0 ? (
        <div className="grid place-items-center text-sm text-slate-500" style={{ height }}>Nenhum acionamento no período.</div>
      ) : (
        <div className="relative flex gap-2" style={{ height }}>
          {/* eixo */}
          <div className="flex w-6 flex-col-reverse justify-between pb-5 text-right text-[10px] text-slate-400">
            {ticks.map((t) => <span key={t}>{t}</span>)}
          </div>
          <div className="relative flex-1">
            <div className="absolute inset-x-0 top-0 bottom-5 flex flex-col-reverse justify-between">
              {ticks.map((t) => <div key={t} className="border-t" style={{ borderColor: "var(--chart-grid)" }} />)}
            </div>
            <div className="absolute inset-x-0 top-0 bottom-5 flex items-end gap-[2px]">
              {data.map((d, i) => {
                const hOk = (d.sucesso / top) * 100;
                const hFail = (d.falha / top) * 100;
                return (
                  <div key={d.dia} className="relative flex h-full flex-1 flex-col justify-end"
                    onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                    onTouchStart={() => setHover(i)}>
                    <div className={cx("mx-auto flex w-full max-w-7 flex-col justify-end gap-[2px]", hover !== null && hover !== i && "opacity-50")}
                      style={{ height: "100%" }}>
                      {d.falha > 0 && <div className="rounded-t" style={{ height: `${hFail}%`, background: "var(--chart-fail)" }} />}
                      {d.sucesso > 0 && <div className={cx(d.falha === 0 && "rounded-t")} style={{ height: `${hOk}%`, background: "var(--chart-ok)" }} />}
                    </div>
                    {hover === i && (
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink-900 px-2.5 py-1.5 text-xs text-white shadow-lg dark:bg-white dark:text-ink-900">
                        <div className="font-semibold">{fmtDia(d.dia)}</div>
                        <div>Executados: {d.sucesso}</div>
                        <div>Falhas: {d.falha}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="absolute inset-x-0 bottom-0 flex gap-[2px] text-[10px] text-slate-400">
              {data.map((d, i) => (
                <span key={d.dia} className="flex-1 text-center">
                  {data.length <= 14 || i % Math.ceil(data.length / 10) === 0 ? fmtDia(d.dia) : ""}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Ranking horizontal de uma série (ex.: portões mais acionados). */
export function RankBars({ items, empty = "Sem dados no período." }: {
  items: { nome: string; total: number; falha?: number }[]; empty?: string;
}) {
  if (!items.length) return <p className="text-sm text-slate-500">{empty}</p>;
  const max = Math.max(...items.map((i) => i.total));
  return (
    <ul className="space-y-2.5">
      {items.map((i) => (
        <li key={i.nome} title={`${i.nome}: ${i.total}${i.falha ? ` (${i.falha} falhas)` : ""}`}>
          <div className="mb-1 flex justify-between text-sm">
            <span className="truncate">{i.nome}</span>
            <span className="tabular-nums text-slate-600 dark:text-slate-300">
              {i.total}{i.falha ? <span className="text-xs text-slate-500"> · {i.falha} falha(s)</span> : null}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-ink-800">
            <div className="h-2 rounded-full" style={{ width: `${(i.total / max) * 100}%`, background: "var(--chart-ok)" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function niceTicks(max: number): number[] {
  const step = max <= 4 ? 1 : max <= 10 ? 2 : Math.ceil(max / 4 / 5) * 5;
  const out: number[] = [];
  for (let v = 0; v <= max + step - 1; v += step) { out.push(v); if (v >= max) break; }
  return out;
}
