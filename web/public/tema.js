// Aplica o tema salvo antes de desenhar a página (evita piscar).
try {
        const t = localStorage.getItem("dc.tema");
        const dark = t ? t === "escuro" : matchMedia("(prefers-color-scheme: dark)").matches;
        document.documentElement.classList.toggle("dark", dark);
      } catch {}
