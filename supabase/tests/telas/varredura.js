// Abre TODAS as telas do app como visitante, super admin, síndico, dono de casa e morador,
// no computador e no celular, e aponta erros de JavaScript, telas quebradas e rolagem lateral.
// Uso: (em web/) npx vite build && npx vite preview --port 4173 ; depois: node supabase/tests/telas/varredura.js
const { chromium } = require('playwright');
const { SB, APP, user, session, ROLES, data, ROUTES, PUBLIC } = require('./mocks');
(async () => {
  const b = await chromium.launch();
  const report = [];
  async function visit(role, path, w, h, logged) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push('JS: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|fonts\.g/.test(m.text())) errs.push('console: ' + m.text().slice(0, 140)); });
    await p.route(SB + '/**', (r) => {
      const req = r.request(); const u = new URL(req.url());
      if (req.method() === 'OPTIONS') return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      if (u.pathname.endsWith('/auth/v1/user')) return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(user) });
      const t = u.pathname.split('/').pop();
      let body = data(role, t, u.search);
      const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
      if (single && Array.isArray(body)) body = body[0] ?? null;
      return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', 'content-range': '0-0/1' }, body: JSON.stringify(body) });
    });
    if (logged) { await p.goto(APP + '/login'); await p.evaluate(([k, v]) => localStorage.setItem(k, v), ['sb-miqjabshccauhvzcqzle-auth-token', JSON.stringify(session)]); }
    await p.goto(APP + path);
    await p.waitForTimeout(1600);
    const boom = await p.isVisible('text=Algo deu errado nesta tela');
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const finalPath = new URL(p.url()).pathname;
    report.push({ role, path, w, finalPath, boom, overflow, errs: [...new Set(errs)] });
    await ctx.close();
  }
  for (const path of PUBLIC) { await visit('anon', path, 1280, 800, false); await visit('anon', path, 390, 844, false); }
  for (const role of Object.keys(ROLES)) for (const path of ROUTES) { await visit(role, path, 1280, 800, true); await visit(role, path, 390, 844, true); }
  const bad = report.filter((r) => r.boom || r.errs.length || r.overflow > 2);
  console.log('Telas abertas:', report.length, '| com problema:', bad.length);
  for (const r of bad) console.log(JSON.stringify(r));
  const redir = report.filter((r) => r.finalPath !== r.path && r.w === 1280).map((r) => `${r.role} ${r.path} -> ${r.finalPath}`);
  console.log('Redirecionamentos (sem permissão / fluxo):\n' + redir.join('\n'));
  await b.close();
})();
