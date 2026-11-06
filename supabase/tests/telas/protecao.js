// Confere, em TODAS as telas e com todos os tipos de conta, se os atalhos de
// "ver código" / "ferramentas do desenvolvedor" e o botão direito estão escondidos,
// e procura no site publicado coisas que não deveriam estar lá (mapas de código, segredos, comentários).
// Uso: (em web/) npx vite build && npx vite preview --port 4173 ; depois: node supabase/tests/telas/protecao.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { SB, APP, user, session, ROLES, data, ROUTES, PUBLIC } = require('./mocks');

const ATALHOS = [
  ['F12', { key: 'F12' }],
  ['Ctrl+U (ver código)', { key: 'u', ctrlKey: true }],
  ['Ctrl+S (salvar página)', { key: 's', ctrlKey: true }],
  ['Ctrl+Shift+I (ferramentas)', { key: 'I', ctrlKey: true, shiftKey: true }],
  ['Ctrl+Shift+J (console)', { key: 'J', ctrlKey: true, shiftKey: true }],
  ['Ctrl+Shift+C (inspecionar)', { key: 'C', ctrlKey: true, shiftKey: true }],
  ['Ctrl+Shift+K (console Firefox)', { key: 'K', ctrlKey: true, shiftKey: true }],
  ['Cmd+Option+I (Mac)', { key: 'i', metaKey: true, altKey: true }],
  ['Cmd+Option+U (Mac)', { key: 'u', metaKey: true, altKey: true }],
  ['Cmd+U (Mac)', { key: 'u', metaKey: true }],
];
// Atalhos do dia a dia que precisam continuar funcionando.
const LIVRES = [
  ['Ctrl+C (copiar)', { key: 'c', ctrlKey: true }],
  ['Ctrl+V (colar)', { key: 'v', ctrlKey: true }],
  ['Ctrl+F (buscar)', { key: 'f', ctrlKey: true }],
  ['Tab', { key: 'Tab' }],
];

async function checarPagina(p) {
  return p.evaluate(([atalhos, livres]) => {
    const falhas = [];
    const alvo = document.querySelector('h1, h2, main, #root') || document.body;
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    alvo.dispatchEvent(menu);
    if (!menu.defaultPrevented) falhas.push('botão direito liberado');
    for (const [nome, k] of atalhos) {
      const ev = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...k });
      alvo.dispatchEvent(ev);
      if (!ev.defaultPrevented) falhas.push(`atalho liberado: ${nome}`);
    }
    for (const [nome, k] of livres) {
      const ev = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...k });
      alvo.dispatchEvent(ev);
      if (ev.defaultPrevented) falhas.push(`atalho normal bloqueado por engano: ${nome}`);
    }
    const campo = document.querySelector('input:not([type=hidden]), textarea');
    if (campo) {
      const m = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      campo.dispatchEvent(m);
      if (m.defaultPrevented) falhas.push('menu de colar bloqueado dentro de campo de texto');
    }
    const comentarios = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT).nextNode();
    if (comentarios) falhas.push('comentário HTML na página: ' + comentarios.nodeValue.slice(0, 60));
    return falhas;
  }, [ATALHOS, LIVRES]);
}

(async () => {
  const b = await chromium.launch();
  const report = [];

  // 1) Arquivos publicados: mapas de código, segredos e comentários.
  const dist = path.join(__dirname, '../../../web/dist');
  const arquivos = [];
  (function walk(d) { for (const f of fs.readdirSync(d)) { const x = path.join(d, f); fs.statSync(x).isDirectory() ? walk(x) : arquivos.push(x); } })(dist);
  const SEGREDOS = [/service_role/i, /GOCSPX-/, /sk_live_/, /sb_secret_/, /SUPABASE_SERVICE/i, /-----BEGIN [A-Z ]*PRIVATE KEY/, /password\s*[:=]\s*["'][^"']{4,}/i];
  const achados = [];
  for (const f of arquivos) {
    const rel = path.relative(dist, f);
    if (f.endsWith('.map')) achados.push(`mapa de código publicado: ${rel}`);
    if (!/\.(js|html|css|json|webmanifest)$/.test(f)) continue;
    const txt = fs.readFileSync(f, 'utf8');
    if (/sourceMappingURL/.test(txt)) achados.push(`aponta para mapa de código: ${rel}`);
    for (const r of SEGREDOS) if (r.test(txt)) achados.push(`possível segredo (${r}) em ${rel}`);
    if (f.endsWith('.html') && /<!--/.test(txt)) achados.push(`comentário HTML em ${rel}`);
  }
  const ctx0 = await b.newContext();
  const p0 = await ctx0.newPage();
  for (const f of arquivos.filter((x) => x.endsWith('.js')).slice(0, 3)) {
    const url = `${APP}/${path.relative(dist, f).replace(/\\/g, '/')}.map`;
    const r = await p0.request.get(url);
    const body = await r.text();
    if (r.ok() && body.trim().startsWith('{') && body.includes('"mappings"')) achados.push(`mapa de código acessível: ${url}`);
  }
  await ctx0.close();

  // 2) Todas as telas, como visitante e com cada tipo de conta.
  async function visit(role, rota, logged) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage();
    await p.route(SB + '/**', (r) => {
      const req = r.request(); const u = new URL(req.url());
      const h = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'content-range', 'content-range': '0-0/1' };
      if (req.method() === 'OPTIONS') return r.fulfill({ status: 200, headers: h });
      if (u.pathname.endsWith('/auth/v1/user')) return r.fulfill({ status: 200, contentType: 'application/json', headers: h, body: JSON.stringify(user) });
      let body = data(role, u.pathname.split('/').pop(), u.search);
      if ((req.headers()['accept'] || '').includes('vnd.pgrst.object') && Array.isArray(body)) body = body[0] ?? null;
      return r.fulfill({ status: 200, contentType: 'application/json', headers: h, body: JSON.stringify(body) });
    });
    if (logged) { await p.goto(APP + '/login'); await p.evaluate(([k, v]) => localStorage.setItem(k, v), ['sb-miqjabshccauhvzcqzle-auth-token', JSON.stringify(session)]); }
    await p.goto(APP + rota);
    await p.waitForTimeout(1200);
    const falhas = await checarPagina(p);
    report.push({ role, rota, final: new URL(p.url()).pathname, falhas });
    await ctx.close();
  }
  for (const rota of PUBLIC) await visit('visitante', rota, false);
  for (const role of Object.keys(ROLES)) for (const rota of ROUTES) await visit(role, rota, true);
  await b.close();

  const ruins = report.filter((r) => r.falhas.length);
  console.log(`Arquivos do site conferidos: ${arquivos.length} | problemas: ${achados.length}`);
  for (const a of achados) console.log('  ✗ ' + a);
  console.log(`Telas conferidas: ${report.length} | com atalho liberado: ${ruins.length}`);
  for (const r of ruins) console.log('  ✗ ' + JSON.stringify(r));
  console.log(achados.length || ruins.length ? 'RESULTADO: HÁ PROBLEMAS' : 'RESULTADO: TUDO PROTEGIDO');
  process.exit(achados.length || ruins.length ? 1 : 0);
})();
