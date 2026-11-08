import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

// Avisa quando sai uma versão nova do app (depois de uma atualização no site),
// para ninguém ficar preso numa versão antiga guardada pelo navegador.
const CHECK_MS = 5 * 60_000;

/** Nome do arquivo principal do app que está rodando agora. */
function currentBundle() {
  const s = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]');
  return s ? new URL(s.src, location.href).pathname : null;
}

async function latestBundle() {
  const r = await fetch(`/?v=${Date.now()}`, { cache: "no-store" });
  if (!r.ok) return null;
  return (await r.text()).match(/\/assets\/index-[\w-]+\.js/)?.[0] ?? null;
}

export function UpdateBanner() {
  const [novo, setNovo] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const atual = currentBundle();
    if (!atual) return;
    let parado = false;
    const conferir = async () => {
      if (parado || document.hidden) return;
      try {
        const ultimo = await latestBundle();
        if (ultimo && ultimo !== atual) setNovo(true);
      } catch { /* sem internet: tenta depois */ }
    };
    const t = setInterval(conferir, CHECK_MS);
    const aoVoltar = () => { if (!document.hidden) conferir(); };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => { parado = true; clearInterval(t); document.removeEventListener("visibilitychange", aoVoltar); };
  }, []);

  // Uma tela que ainda não tinha sido aberta pode não existir mais depois da atualização:
  // recarrega uma vez para pegar a versão nova em vez de mostrar erro.
  useEffect(() => {
    const aoFalhar = (e: Event) => {
      const ja = sessionStorage.getItem("dc.recarregou");
      if (ja && Date.now() - Number(ja) < 60_000) { setNovo(true); return; }
      e.preventDefault();
      sessionStorage.setItem("dc.recarregou", String(Date.now()));
      location.reload();
    };
    window.addEventListener("vite:preloadError", aoFalhar);
    return () => window.removeEventListener("vite:preloadError", aoFalhar);
  }, []);

  if (!novo) return null;
  return (
    <div role="status" className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-ink-950 px-4 py-3 text-sm text-white shadow-2xl ring-1 ring-white/10 sm:bottom-5">
      <RefreshCw className="size-4 shrink-0 text-cyan-300" />
      <span className="flex-1">Tem uma versão nova do AuggeControl.</span>
      <button onClick={() => location.reload()}
        className="rounded-xl bg-white px-3 py-1.5 font-semibold text-ink-950 hover:bg-slate-200">Atualizar</button>
    </div>
  );
}
