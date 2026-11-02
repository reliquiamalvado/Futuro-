import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Ticket } from "lucide-react";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { ROLE_LABEL, errMsg, must } from "../lib/util";
import { Alert, Button, Card, Field, Input, PageHeader } from "../components/ui";

interface Preview { residencia: string; organizacao: string; papel: "titular" | "morador"; valido: boolean }

export default function InvitePage() {
  const params = useParams();
  const nav = useNavigate();
  const { refresh } = useAuth();
  const [code, setCode] = useState((params.code ?? "").toUpperCase());
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const c = code.trim();
    setPreview(null);
    if (c.length !== 8) return;
    supabase.rpc("invite_preview", { p_code: c }).then(({ data }) => setPreview((data as Preview) ?? null));
  }, [code]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = must(await supabase.rpc("redeem_invite", { p_code: code.trim() })) as
        { ok: boolean; erro?: string; status?: string };
      if (!r.ok) throw new Error(r.erro);
      await refresh();
      setResult(r.status === "ativo"
        ? "Pronto! Seu acesso já está liberado."
        : "Solicitação enviada! Você será liberado assim que o titular ou a administração aprovar.");
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Usar convite" subtitle="Digite o código de 8 caracteres ou abra o link do QR Code." />
      <Card>
        {result ? (
          <div className="space-y-4">
            <Alert tone="green">{result}</Alert>
            <Button className="w-full" onClick={() => nav("/")}>Ir para o início</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Field label="Código do convite">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
                placeholder="EX: K7M2Q9XA"
                className="text-center font-mono text-lg tracking-[.3em]"
                required
              />
            </Field>
            {preview && (
              <Alert tone={preview.valido ? "blue" : "red"}>
                {preview.valido ? (
                  <>Convite para <b>{preview.residencia}</b> ({preview.organizacao}) como <b>{ROLE_LABEL[preview.papel]}</b>.</>
                ) : "Este convite expirou, foi revogado ou atingiu o limite de usos."}
              </Alert>
            )}
            {error && <Alert>{error}</Alert>}
            <Button type="submit" className="w-full" loading={loading} disabled={code.length !== 8}>
              <Ticket className="size-4" /> Entrar na residência
            </Button>
          </form>
        )}
      </Card>
      <p className="mt-4 text-center text-sm"><Link to="/" className="text-brand-500 hover:underline">Voltar</Link></p>
    </div>
  );
}
