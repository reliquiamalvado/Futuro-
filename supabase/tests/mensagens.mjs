// Confere se as mensagens de erro do servidor (em inglês) viram português simples.
// Uso: node supabase/tests/mensagens.mjs
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(mkdtempSync(join(tmpdir(), "msg-")), "util.cjs");
execFileSync("npx", ["esbuild", "src/lib/util.ts", "--bundle", "--platform=node", "--format=cjs", `--outfile=${out}`, "--log-level=error"],
  { cwd: new URL("../../web/", import.meta.url).pathname, stdio: "inherit" });
const { errMsg } = createRequire(import.meta.url)(out);

const casos = [
  ["Invalid login credentials", "E-mail ou senha"],
  ["captcha verification process failed", "verificação de segurança"],
  ["captcha protection: request disallowed (no captcha response)", "verificação de segurança"],
  ["For security purposes, you can only request this after 42 seconds.", "aguarde alguns segundos"],
  ["Email rate limit exceeded", "Muitas tentativas"],
  ["Password is known to be weak and easy to guess, please choose a different one.", "já vazou"],
  ["New password should be different from the old password.", "diferente da atual"],
  ["Password should be at least 8 characters.", "pelo menos 8"],
  ["Unable to validate email address: invalid format", "não parece válido"],
  ["Invalid TOTP code entered", "Código incorreto"],
  ["Token has expired or is invalid", "expirou"],
  ["Auth session missing!", "sessão expirou"],
  ["TypeError: Failed to fetch", "Sem conexão"],
  ["Load failed", "Sem conexão"],
  ['new row violates row-level security policy for table "gates"', "não tem permissão"],
  // Mensagens que já vêm em português do banco passam sem mudança.
  ["Limite de 3 casas por conta. Fale com o suporte para cadastrar mais.", "Limite de 3 casas"],
  ["Sem permissão.", "Sem permissão."],
];
let falhas = 0;
for (const [m, esperado] of casos) {
  const r = errMsg({ message: m });
  if (!r.includes(esperado)) { falhas++; console.log(`✗ "${m}" → "${r}"`); }
}
console.log(falhas ? `FALHOU: ${falhas} de ${casos.length}` : `ok - ${casos.length} mensagens em português`);
process.exit(falhas ? 1 : 0);
