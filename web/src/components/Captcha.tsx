import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

// Proteção contra robôs (Cloudflare Turnstile, grátis). Normalmente é invisível:
// só pede um clique quando a Cloudflare desconfia que é um robô.
// Fica desligada até existir a chave pública VITE_TURNSTILE_SITE_KEY.
export const CAPTCHA_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim() || "";
const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface Turnstile {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
}
declare global { interface Window { turnstile?: Turnstile } }

let loading: Promise<void> | null = null;
function loadScript() {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { loading = null; reject(new Error("captcha")); };
    document.head.appendChild(s);
  });
  return loading;
}

export interface CaptchaHandle { reset(): void }

/** Mostra a verificação "não sou um robô". Cada código vale para uma tentativa. */
export const Captcha = forwardRef<CaptchaHandle, { onToken: (t: string | null) => void }>(function Captcha({ onToken }, ref) {
  const box = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const cb = useRef(onToken);
  cb.current = onToken;

  useImperativeHandle(ref, () => ({
    reset() { cb.current(null); if (id.current && window.turnstile) window.turnstile.reset(id.current); },
  }), []);

  useEffect(() => {
    if (!CAPTCHA_SITE_KEY) return;
    let alive = true;
    loadScript().then(() => {
      if (!alive || !box.current || !window.turnstile) return;
      id.current = window.turnstile.render(box.current, {
        sitekey: CAPTCHA_SITE_KEY,
        language: "pt-br",
        theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
        callback: (t: string) => cb.current(t),
        "expired-callback": () => cb.current(null),
        "error-callback": () => cb.current(null),
      });
    }).catch(() => cb.current(null));
    return () => {
      alive = false;
      if (id.current && window.turnstile) window.turnstile.remove(id.current);
      id.current = null;
    };
  }, []);

  if (!CAPTCHA_SITE_KEY) return null;
  return <div ref={box} className="flex min-h-[65px] justify-center" />;
});

/** Opções extras para as chamadas de login/cadastro/recuperação. */
export const captchaOpt = (token: string | null) => (CAPTCHA_SITE_KEY && token ? { captchaToken: token } : {});
/** true se ainda falta passar pela verificação. */
export const captchaPending = (token: string | null) => !!CAPTCHA_SITE_KEY && !token;
