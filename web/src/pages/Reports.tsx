import { useState } from "react";
import { Activity, AlertTriangle, Cpu, Home, KeyRound, UserPlus, Users } from "lucide-react";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { must, useLoad } from "../lib/util";
import { Alert, Button, Card, Field, Input, Loading, PageHeader, Select, Stat } from "../components/ui";
import { DailyBars, RankBars, type DayPoint } from "../components/Charts";

export interface ReportData {
  moradores: { ativos: number; pendentes: number; bloqueados: number; novos: number };
  residencias: number;
  dispositivos: { total: number; online: number };
  acionamentos: { total: number; sucesso: number; falha: number; chave: number };
  por_dia: DayPoint[];
  por_portao: { nome: string; total: number; falha: number }[];
  por_usuario: { nome: string; total: number }[];
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export async function loadReport(org: string | null, from: Date, to: Date) {
  return must(await supabase.rpc("report_stats", {
    p_org: org, p_from: from.toISOString(), p_to: to.toISOString(),
  })) as ReportData;
}

export default function ReportsPage() {
  const { adminOrgs } = useAuth();
  const today = new Date();
  const [org, setOrg] = useState("");
  const [from, setFrom] = useState(isoDay(new Date(today.getTime() - 29 * 86400_000)));
  const [to, setTo] = useState(isoDay(today));

  const rep = useLoad(async () => {
    const f = new Date(`${from}T00:00:00`);
    const t = new Date(`${to}T00:00:00`);
    t.setDate(t.getDate() + 1);
    return loadReport(org || null, f, t);
  }, [org, from, to]);

  function preset(days: number) {
    setFrom(isoDay(new Date(Date.now() - (days - 1) * 86400_000)));
    setTo(isoDay(new Date()));
  }

  function exportCsv() {
    const r = rep.data;
    if (!r) return;
    const lines = [
      `Relatório AuggeControl;${from} a ${to}`,
      "",
      "Indicador;Valor",
      `Moradores ativos;${r.moradores.ativos}`,
      `Aguardando aprovação;${r.moradores.pendentes}`,
      `Bloqueados;${r.moradores.bloqueados}`,
      `Novos no período;${r.moradores.novos}`,
      `Residências;${r.residencias}`,
      `Dispositivos;${r.dispositivos.total}`,
      `Dispositivos online agora;${r.dispositivos.online}`,
      `Acionamentos;${r.acionamentos.total}`,
      `Executados;${r.acionamentos.sucesso}`,
      `Falhas/expirados;${r.acionamentos.falha}`,
      `Por chave temporária;${r.acionamentos.chave}`,
      "",
      "Dia;Executados;Falhas",
      ...r.por_dia.map((d) => `${d.dia};${d.sucesso};${d.falha}`),
      "",
      "Portão;Acionamentos;Falhas",
      ...r.por_portao.map((p) => `"${p.nome}";${p.total};${p.falha}`),
      "",
      "Usuário;Acionamentos",
      ...r.por_usuario.map((u) => `"${u.nome}";${u.total}`),
    ];
    const url = URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `relatorio-${from}-a-${to}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  const r = rep.data;
  const taxa = r && r.acionamentos.total ? Math.round((r.acionamentos.sucesso / r.acionamentos.total) * 100) : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Relatórios" subtitle="Estatísticas do período, com exportação em CSV."
        actions={<Button variant="secondary" onClick={exportCsv} disabled={!r}>Exportar CSV</Button>} />

      <Card className="flex flex-wrap items-end gap-3">
        {adminOrgs.length > 1 && (
          <Field label="Organização">
            <Select value={org} onChange={(e) => setOrg(e.target.value)}>
              <option value="">Todas</option>
              {adminOrgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label="De"><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Até"><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
        <div className="flex gap-1">
          {[[7, "7 dias"], [30, "30 dias"], [90, "90 dias"]].map(([d, l]) => (
            <Button key={d} size="sm" variant="ghost" onClick={() => preset(d as number)}>{l}</Button>
          ))}
        </div>
      </Card>

      {rep.loading ? <Loading /> : rep.error ? <Alert>{rep.error}</Alert> : r && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Moradores ativos" value={r.moradores.ativos} icon={<Users className="size-5" />} />
            <Stat label="Novos no período" value={r.moradores.novos} icon={<UserPlus className="size-5" />} />
            <Stat label="Residências" value={r.residencias} icon={<Home className="size-5" />} />
            <Stat label={`Dispositivos online de ${r.dispositivos.total}`} value={r.dispositivos.online} icon={<Cpu className="size-5" />} tone="green" />
            <Stat label="Acionamentos" value={r.acionamentos.total} icon={<Activity className="size-5" />} />
            <Stat label="Taxa de sucesso" value={taxa === null ? "—" : `${taxa}%`} icon={<Activity className="size-5" />} tone="green" />
            <Stat label="Falhas / expirados" value={r.acionamentos.falha} icon={<AlertTriangle className="size-5" />} tone={r.acionamentos.falha ? "red" : "gray"} />
            <Stat label="Por chave temporária" value={r.acionamentos.chave} icon={<KeyRound className="size-5" />} />
          </div>

          <Card>
            <h2 className="mb-4 font-semibold">Acionamentos por dia</h2>
            <DailyBars data={r.por_dia} />
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="mb-4 font-semibold">Portões mais acionados</h2>
              <RankBars items={r.por_portao} />
            </Card>
            <Card>
              <h2 className="mb-4 font-semibold">Usuários que mais acionaram</h2>
              <RankBars items={r.por_usuario} />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
