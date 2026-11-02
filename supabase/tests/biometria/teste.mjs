import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import * as core from "./core.ts";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

// Servidor local: página em branco + biblioteca do navegador.
const BROWSER = path.resolve("node_modules/@simplewebauthn/browser/esm");
const srv = http.createServer((req, res) => {
  if (req.url === "/") { res.setHeader("content-type", "text/html"); return res.end(fs.readFileSync("pagina.html")); }
  const f = path.join(BROWSER, req.url.replace("/lib/", ""));
  if (f.startsWith(BROWSER) && fs.existsSync(f)) { res.setHeader("content-type", "text/javascript"); return res.end(fs.readFileSync(f)); }
  res.statusCode = 404; res.end();
}).listen(8765);

// "Banco" em memória.
const db = { creds: new Map(), challenges: new Map() };
const store = {
  credentials: async (u) => [...db.creds.values()].filter((c) => c.user === u),
  saveChallenge: async (u, k, c) => db.challenges.set(u + k, c),
  takeChallenge: async (u, k) => { const c = db.challenges.get(u + k) ?? null; db.challenges.delete(u + k); return c; },
  saveCredential: async (u, c) => db.creds.set(c.id, { ...c, user: u }),
  updateCounter: async (id, n) => { db.creds.get(id).counter = n; },
};
const rp = core.rpFromOrigin("http://localhost:8765", ["http://localhost:8765"]);
const user = { id: "11111111-1111-1111-1111-111111111111", email: "dono@exemplo.com", name: "Dono" };
const results = [];
const check = (ok, msg) => { results.push(ok); console.log(ok ? "ok -" : "FALHOU -", msg); };

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("http://localhost:8765/");
const cdp = await page.context().newCDPSession(page);
await cdp.send("WebAuthn.enable");
const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", { options: {
  protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true,
  automaticPresenceSimulation: true } });

const run = (fn, arg) => page.evaluate(async ([fn, arg]) => {
  const m = await import("/lib/index.js");
  try { return await m[fn]({ optionsJSON: arg }); } catch (e) { return { erro: String(e.message || e) }; }
}, [fn, arg]);

check(core.rpFromOrigin("https://site-falso.com", ["http://localhost:8765"]) === null, "origem desconhecida é recusada");

// Cadastro da digital/rosto
const regOpts = await core.registrationOptions(store, user, rp);
check(regOpts.authenticatorSelection.userVerification === "required", "cadastro exige verificação biométrica");
const reg = await run("startRegistration", regOpts);
check(!reg.erro, "navegador cadastrou a credencial" + (reg.erro ? " (" + reg.erro + ")" : ""));
check(await core.verifyRegistration(store, user.id, reg, rp, "Teste"), "servidor validou o cadastro");
check(!(await core.verifyRegistration(store, user.id, reg, rp, "Teste")), "mesmo cadastro não é aceito duas vezes");

// Abertura com biometria
const authOpts = await core.authenticationOptions(store, user.id, rp);
const auth = await run("startAuthentication", authOpts);
check(!auth.erro, "navegador assinou com a biometria");
check(await core.verifyAuthentication(store, user.id, auth, rp), "servidor confirmou a biometria");
check(!(await core.verifyAuthentication(store, user.id, auth, rp)), "resposta reaproveitada (replay) é recusada");

// Outro usuário não pode usar a credencial de alguém
const o2 = await core.authenticationOptions(store, user.id, rp);
const a2 = await run("startAuthentication", o2);
check(!(await core.verifyAuthentication(store, "22222222-2222-2222-2222-222222222222", a2, rp)), "credencial de outra pessoa não serve");

// Resposta de outro site (origem diferente) é recusada
const o3 = await core.authenticationOptions(store, user.id, rp);
const a3 = await run("startAuthentication", o3);
check(!(await core.verifyAuthentication(store, user.id, a3, { rpID: "localhost", origin: "https://site-falso.com" }).catch(() => false)),
      "assinatura feita para outro site é recusada");

// Sem verificação biométrica (só toque) é recusado
await cdp.send("WebAuthn.setUserVerified", { authenticatorId, isUserVerified: false });
const o4 = await core.authenticationOptions(store, user.id, rp);
const a4 = await run("startAuthentication", o4);
const ok4 = a4.erro ? false : await core.verifyAuthentication(store, user.id, a4, rp).catch(() => false);
check(!ok4, "sem a digital/rosto confirmados não abre");

// Resposta adulterada
await cdp.send("WebAuthn.setUserVerified", { authenticatorId, isUserVerified: true });
const o5 = await core.authenticationOptions(store, user.id, rp);
const a5 = await run("startAuthentication", o5);
a5.response.signature = a5.response.signature.slice(0, -4) + "AAAA";
check(!(await core.verifyAuthentication(store, user.id, a5, rp).catch(() => false)), "assinatura adulterada é recusada");

await browser.close(); srv.close();
const falhas = results.filter((r) => !r).length;
console.log(falhas ? `${falhas} FALHA(S)` : `TODOS OS ${results.length} TESTES DE BIOMETRIA PASSARAM`);
process.exit(falhas ? 1 : 0);
