import { useState } from "react";
import { History as HistoryIcon } from "lucide-react";
import { supabase, type Command } from "../lib/supabase";
import { ACTION_LABEL, CMD_LABEL, fmtDate, must, useLoad } from "../lib/util";
import { Alert, Badge, Button, Card, Empty, Field, Input, Loading, PageHeader, Select, Table, Td } from "../components/ui";

type Row = Command & {
  gates: { name: string } | null;
  residences: { name: string } | null;
  profiles: { full_name: string | null; email: string | null } | null;
  temp_keys: { label: string } | null;
};

const PAGE = 50;

export default function HistoryPage() {
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState(PAGE);

  const list = useLoad(async () => {
    let q = supabase
      .from("commands")
      .select("*, gates(name), residences(name), profiles:requested_by(full_name, email), temp_keys(label)")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (status) q = q.eq("status", status);
    if (from) q = q.gte("created_at", new Date(from + "T00:00:00").toISOString());
    if (to) q = q.lte("created_at", new Date(to + "T23:59:59").toISOString());
    return must(await q) as unknown as Row[];
  }, [status, from, to, limit]);

  function exportCsv() {
    const rows = list.data ?? [];
    const head = ["data", "portao", "residencia", "acao", "origem", "usuario", "resultado", "erro"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [head.join(";"), ...rows.map((r) => [
      fmtDate(r.created_at), r.gates?.name, r.residences?.name, ACTION_LABEL[r.action],
      r.source === "chave_temporaria" ? `Chave: ${r.temp_keys?.label ?? ""}` : "App",
      r.profiles?.full_name || r.profiles?.email, CMD_LABEL[r.status], r.error,
    ].map(esc).join(";"))].join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `acionamentos-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader
        title="Histórico de acionamentos"
        subtitle="Quem acionou, quando, qual portão e o resultado informado pelo equipamento."
        actions={<Button variant="secondary" onClick={exportCsv} disabled={!list.data?.length}>Exportar CSV</Button>}
      />
      <Card className="mb-4 grid gap-3 sm:grid-cols-3">
        <Field label="Resultado">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(CMD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="De"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Até"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </Card>

      {list.loading ? <Loading /> : list.error ? <Alert>{list.error}</Alert> : !list.data!.length ? (
        <Empty icon={<HistoryIcon className="size-8" />} title="Nenhum acionamento encontrado" />
      ) : (
        <Card className="p-2">
          <Table head={["Data", "Portão", "Ação", "Origem", "Resultado"]}>
            {list.data!.map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap">{fmtDate(r.created_at)}</Td>
                <Td>
                  <div className="font-medium">{r.gates?.name}</div>
                  <div className="text-xs text-slate-500">{r.residences?.name}</div>
                </Td>
                <Td>{ACTION_LABEL[r.action]}</Td>
                <Td>
                  {r.source === "chave_temporaria"
                    ? <Badge tone="blue">Chave: {r.temp_keys?.label ?? "—"}</Badge>
                    : r.profiles?.full_name || r.profiles?.email || "Usuário"}
                </Td>
                <Td>
                  <Badge tone={r.status === "sucesso" ? "green" : r.status === "falha" || r.status === "expirado" ? "red" : "amber"}>
                    {CMD_LABEL[r.status]}
                  </Badge>
                  {r.error && <div className="mt-1 text-xs text-red-500">{r.error}</div>}
                </Td>
              </tr>
            ))}
          </Table>
          {list.data!.length >= limit && (
            <div className="p-3 text-center">
              <Button variant="ghost" onClick={() => setLimit((l) => l + PAGE)}>Carregar mais</Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
