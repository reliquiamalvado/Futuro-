import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import * as core from "./core.ts";
const OUT = process.argv[2];
const APP = "http://localhost:4173";
const SB = "https://miqjabshccauhvzcqzle.supabase.co";
const UID = "11111111-1111-1111-1111-111111111111", HOME = "h1", HRES = "44444444-4444-4444-4444-444444444444";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 3600;
const user = { id: UID, email: "joao@exemplo.com", app_metadata: { provider: "email" }, user_metadata: { full_name: "João" }, aud: "authenticated", created_at: new Date().toISOString() };
const session = { access_token: `${b64({ alg: "HS256" })}.${b64({ sub: UID, exp, role: "authenticated", aal: "aal1", session_id: "s1" })}.c2lnbmF0dXJlZmFrZQ`, refresh_token: "r", expires_in: 3600, expires_at: exp, token_type: "bearer", user };
const now = new Date().toISOString();

// "Servidor" simulado + núcleo WebAuthn real
const db = { creds: new Map(), challenges: new Map(), pinOk: "8264", calls: [] };
const store = {
  credentials: async (u) => [...db.creds.values()].filter((c) => c.user === u),
  saveChallenge: async (u, k, c) => db.challenges.set(u + k, c),
  takeChallenge: async (u, k) => { const c = db.challenges.get(u + k) ?? null; db.challenges.delete(u + k); return c; },
  saveCredential: async (u, c, name) => db.creds.set(c.id, { ...c, user: u, device_name: name, created_at: now, last_used_at: null }),
  updateCounter: async (id, n) => { db.creds.get(id).counter = n; db.creds.get(id).last_used_at = new Date().toISOString(); },
};
const rp = core.rpFromOrigin(APP, [APP]);
const results = [];
const check = (ok, msg) => { results.push(ok); console.log(ok ? "ok -" : "FALHOU -", msg); };

async function mock(route) {
  const req = route.request(); const url = new URL(req.url()); const p = url.pathname; const q = url.search;
  const headers = { "access-control-allow-origin": APP, "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "content-range", "content-range": "0-0/0" };
  if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
  const single = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
  const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", headers, body: JSON.stringify(single && Array.isArray(body) ? body[0] ?? null : body) });
  const body = req.postDataJSON?.() ?? null;
  if (p.endsWith("/auth/v1/user")) return json(user);
  if (p.startsWith("/functions/v1/unlock/")) {
    const r = p.split("/").pop(); db.calls.push(r);
    try {
      if (r === "register-options") return json(await core.registrationOptions(store, { id: UID, email: user.email, name: "João" }, rp));
      if (r === "register-verify") return (await core.verifyRegistration(store, UID, body.response, rp, body.device_name)) ? json({ ok: true }) : json({ erro: "falhou" }, 400);
      if (r === "auth-options") return json(await core.authenticationOptions(store, UID, rp));
      if (r === "open") {
        const ok = await core.verifyAuthentication(store, UID, body.response, rp);
        return ok ? json({ ok: true, command_id: "cmd-bio" }) : json({ erro: "Biometria não confirmada." }, 403);
      }
    } catch (e) { return json({ erro: String(e) }, 500); }
  }
  const t = p.split("/").pop();
  switch (t) {
    case "profiles": return json({ id: UID, full_name: "João Pereira", email: user.email, is_super_admin: false, account_type: "casa" });
    case "residence_members": return json(q.includes("user_id=eq.") && !q.includes("neq") ? [{ id: "m1", residence_id: HRES, role: "titular", status: "ativo", residences: { name: "Casa Pereira", org_id: HOME, organizations: { name: "Casa Pereira", kind: "residencial" } } }] : []);
    case "org_admins": return json([{ org_id: HOME, organizations: { id: HOME, name: "Casa Pereira", kind: "residencial", group_label: "Bloco" } }]);
    case "my_gates": return json([{ gate_id: "g1", gate_name: "Portão da garagem", mode: "pulso", state: "fechado", device_id: "d1", device_name: "Central", online: true, last_seen_at: now, org_id: HOME, org_name: "Casa Pereira", residence_id: HRES, residence_name: "Casa Pereira", can_operate: true }]);
    case "my_unlock_methods": return json({ pin: true, bloqueado_ate: null, biometrias: db.creds.size, login_recente: true });
    case "webauthn_credentials": return json([...db.creds.values()].map((c) => ({ id: c.id, device_name: c.device_name, created_at: c.created_at, last_used_at: c.last_used_at })));
    case "request_gate_command": {
      db.calls.push("pin:" + body.p_pin);
      if (body.p_pin === db.pinOk) return json({ ok: true, command_id: "cmd-pin" });
      return json({ ok: false, confirmacao: "necessaria", erro: "Senha de abertura incorreta." });
    }
    case "commands": return json(q.includes("id=eq.") ? { status: "sucesso", error: null } : []);
  }
  return json([]);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 420, height: 860 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errs = []; page.on("pageerror", (e) => errs.push(e.message));
await page.route(SB + "/**", mock);
const cdp = await ctx.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });

await page.goto(APP + "/login");
await page.evaluate(([k, v]) => localStorage.setItem(k, v), ["sb-miqjabshccauhvzcqzle-auth-token", JSON.stringify(session)]);
await page.goto(APP + "/");
await page.waitForSelector("text=Portão da garagem");

// 1) Tocar em acionar abre a confirmação (sem biometria ainda: vai direto para a senha)
await page.click("button:has-text('Acionar portão')");
await page.waitForSelector("text=Digite sua senha de abertura");
check(true, "tocar em Acionar pede confirmação");
await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/40-confirmar-senha.png` });

// 2) Senha errada pelo teclado da tela
for (const d of ["1", "1", "1", "1"]) await page.click(`button[aria-label="${d}"]`);
await page.click("button:has-text('Confirmar')");
await page.waitForSelector("text=Senha de abertura incorreta.");
check(db.calls.includes("pin:1111"), "senha errada é recusada e enviada ao servidor para conferir");

// 3) Senha certa pelo teclado físico
await page.keyboard.type("8264"); await page.keyboard.press("Enter");
await page.waitForSelector("text=Comando executado pelo equipamento", { timeout: 10000 });
check(db.calls.includes("pin:8264"), "senha certa aciona o portão");

// 4) Cadastrar digital/rosto em Minha conta
await page.goto(APP + "/conta#abertura");
await page.waitForSelector("text=Segurança para abrir o portão");
await page.click("button:has-text('Cadastrar a digital/rosto deste aparelho')");
await page.waitForSelector("text=Biometria cadastrada neste aparelho", { timeout: 10000 });
check(db.creds.size === 1, "biometria cadastrada e validada pelo servidor");
await page.locator("#abertura").scrollIntoViewIfNeeded();
await page.screenshot({ path: `${OUT}/41-conta-seguranca-abertura.png`, fullPage: true });

// 5) Abrir com a digital/rosto
await page.goto(APP + "/");
await page.waitForSelector("text=Portão da garagem");
await page.click("button:has-text('Acionar portão')");
await page.waitForSelector("text=Confirmar com digital ou rosto");
await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/42-confirmar-biometria.png` });
await page.click("button:has-text('Confirmar com digital ou rosto')");
await page.waitForSelector("text=Comando executado pelo equipamento", { timeout: 10000 });
check(db.calls.includes("open"), "digital/rosto confirmados abrem o portão");
check(db.creds.values().next().value.counter >= 0 && db.creds.values().next().value.last_used_at !== null, "uso da biometria fica registrado");

// 6) Cancelar não aciona nada
const before = db.calls.length;
await page.waitForTimeout(3600);
await page.click("button:has-text('Acionar portão')");
await page.waitForSelector("text=Confirmar com digital ou rosto");
await page.click("button[aria-label='Fechar']");
await page.waitForTimeout(500);
check(db.calls.length === before && !(await page.isVisible("text=Comando executado")), "cancelar não aciona o portão");

check(errs.length === 0, "nenhum erro de JavaScript" + (errs.length ? ": " + errs.join(" | ") : ""));
await browser.close();
const f = results.filter((r) => !r).length;
console.log(f ? `${f} FALHA(S)` : `TODOS OS ${results.length} TESTES DE PONTA A PONTA PASSARAM`);
process.exit(f ? 1 : 0);
