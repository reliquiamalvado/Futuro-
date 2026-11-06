// Esconde os atalhos de "ver código" e "ferramentas do desenvolvedor".
// Isso é só uma barreira visual: a segurança de verdade fica no servidor (permissões no banco).

/** Campos de texto continuam com o menu normal (colar, corrigir, etc.). */
function isEditable(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

/** true se o atalho deve ser bloqueado. */
export function atalhoBloqueado(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">) {
  const k = e.key.toLowerCase();
  const mod = e.ctrlKey || e.metaKey;
  if (k === "f12") return true;
  if (mod && (k === "u" || k === "s")) return true;                                // ver código / salvar página
  if (mod && e.shiftKey && ["i", "j", "c", "k", "e", "m"].includes(k)) return true; // ferramentas (Chrome, Edge, Firefox)
  if (e.metaKey && e.altKey && ["i", "j", "c", "u"].includes(k)) return true;       // ferramentas e código (Mac)
  return false;
}

export function ativarProtecao(doc: Document = document) {
  const opts = { capture: true } as const;
  doc.addEventListener("contextmenu", (e) => { if (!isEditable(e.target)) e.preventDefault(); }, opts);
  doc.addEventListener("keydown", (e) => {
    if (atalhoBloqueado(e)) { e.preventDefault(); e.stopPropagation(); }
  }, opts);
  // Arrastar imagens e o logo para fora da página.
  doc.addEventListener("dragstart", (e) => {
    if ((e.target as HTMLElement | null)?.tagName === "IMG") e.preventDefault();
  }, opts);
}
