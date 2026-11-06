import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Sem mapas do código-fonte e sem comentários no site publicado.
  build: { sourcemap: false },
  esbuild: { legalComments: "none", drop: process.env.NODE_ENV === "production" ? ["debugger"] : [] },
});
