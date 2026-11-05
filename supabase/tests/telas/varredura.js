// Abre TODAS as telas do app como visitante, super admin, síndico, dono de casa e morador,
// no computador e no celular, e aponta erros de JavaScript, telas quebradas e rolagem lateral.
// Uso: (em web/) npx vite build && npx vite preview --port 4173 ; depois: node supabase/tests/telas/varredura.js
const { chromium } = require('playwright');
const SB = 'https://miqjabshccauhvzcqzle.supabase.co', APP = 'http://localhost:4173';
const UID = '11111111-1111-1111-1111-111111111111';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now()/1000)+3600;
const ago = (m) => new Date(Date.now()-m*60e3).toISOString();
const user = { id: UID, email: 'teste@exemplo.com', app_metadata: { provider: 'email' }, user_metadata: { full_name: 'Teste' }, aud: 'authenticated', created_at: ago(9000), last_sign_in_at: ago(5) };
const session = { access_token: `${b64({alg:'HS256'})}.${b64({ sub: UID, exp, role: 'authenticated', aal: 'aal1', session_id: 's1' })}.c2ln`, refresh_token: 'r', expires_in: 3600, expires_at: exp, token_type: 'bearer', user };
const ORG = { id: 'o1', name: 'Residencial Jardins', kind: 'condominio', group_label: 'Bloco', active: true, created_at: ago(9000) };
const HOME = { id: 'h1', name: 'Casa Pereira', kind: 'residencial', group_label: 'Bloco', active: true, created_at: ago(9000) };
const ROLES = {
  super:   { prof: { is_super_admin: true, account_type: null }, admins: [], members: [], orgs: [ORG, HOME] },
  sindico: { prof: { is_super_admin: false, account_type: 'sindico' }, admins: [{ org_id: 'o1', organizations: ORG }], members: [], orgs: [ORG] },
  casa:    { prof: { is_super_admin: false, account_type: 'casa' }, admins: [{ org_id: 'h1', organizations: HOME }], members: [{ id: 'm9', residence_id: 'r9', role: 'titular', status: 'ativo', residences: { name: 'Casa Pereira', org_id: 'h1', organizations: { name: 'Casa Pereira', kind: 'residencial' } } }], orgs: [HOME] },
  morador: { prof: { is_super_admin: false, account_type: 'morador' }, admins: [], members: [{ id: 'm1', residence_id: 'r1', role: 'morador', status: 'ativo', residences: { name: 'Casa 12', org_id: 'o1', organizations: { name: 'Residencial Jardins', kind: 'condominio' } } }], orgs: [] },
};
function data(role, t, q) {
  const R = ROLES[role];
  const res = [{ id: 'r1', org_id: 'o1', name: 'Casa 12', block: 'Bloco A', address: null, complement: null, created_at: ago(9000), organizations: { name: 'Residencial Jardins', kind: 'condominio', group_label: 'Bloco' }, residence_members: [{ count: 2 }], gate_residences: [{ gate_id: 'g1' }] }];
  const gate = { id: 'g1', org_id: 'o1', device_id: 'd1', name: 'Portão social', channel: 1, mode: 'pulso', pulse_ms: 800, state: 'fechado', created_at: ago(9000), devices: { name: 'Central', last_seen_at: ago(1) }, organizations: { name: 'Residencial Jardins' } };
  switch (t) {
    case 'profiles': { const me = { id: UID, full_name: 'Teste Silva', email: user.email, phone: null, created_at: ago(9000), ...R.prof }; return q.includes('id=eq.') ? me : [me]; }
    case 'org_admins': return q.includes('user_id=eq.') ? R.admins : [{ org_id: 'o1', user_id: UID, created_at: ago(9000), profiles: { full_name: 'Teste', email: user.email, phone: null }, organizations: { name: 'Residencial Jardins' } }];
    case 'residence_members': return q.includes('user_id=eq.' + UID) ? R.members : [{ id: 'm2', residence_id: 'r1', user_id: 'u2', role: 'morador', status: 'ativo', allowed_gates: null, created_at: ago(900), approved_at: ago(800), profiles: { full_name: 'João', email: 'j@x.com', phone: null }, residences: { name: 'Casa 12', org_id: 'o1', organizations: { name: 'Residencial Jardins' } }, invites: null }];
    case 'organizations': return R.orgs.map((o) => ({ ...o, residences: [{ count: 1 }], devices: [{ count: 1 }], org_admins: [] }));
    case 'residences': return res;
    case 'gates': return [gate];
    case 'devices': return [{ id: 'd1', org_id: 'o1', name: 'Central', driver_id: 'dc-esp32-https', last_seen_at: ago(1), firmware: '2.0.0', ip: '10.0.0.2', rssi: -55, created_at: ago(9000), gates: [gate], organizations: { name: 'Residencial Jardins' } }];
    case 'device_drivers': return [{ id: 'dc-esp32-https', name: 'ESP32 AuggeControl', protocol: 'https' }];
    case 'my_gates': return [{ gate_id: 'g1', gate_name: 'Portão social', mode: 'pulso', state: 'fechado', device_id: 'd1', device_name: 'Central', online: true, last_seen_at: ago(1), org_id: 'o1', org_name: 'Residencial Jardins', residence_id: 'r1', residence_name: 'Casa 12', can_operate: true }];
    case 'commands': return q.includes('id=eq.') ? { status: 'sucesso', error: null } : [{ id: 'c1', org_id: 'o1', gate_id: 'g1', action: 'pulso', status: 'sucesso', source: 'app', created_at: ago(30), gates: { name: 'Portão social' }, profiles: { full_name: 'João', email: 'j@x.com' }, temp_keys: null, residences: { name: 'Casa 12' } }];
    case 'audit_logs': return [{ id: 1, action: 'portao.criado', severity: 'info', created_at: ago(60), details: {}, entity: 'gates', entity_id: 'g1', org_id: 'o1', profiles: { full_name: 'Teste', email: user.email }, organizations: { name: 'Residencial Jardins' } }];
    case 'temp_keys': return [{ id: 'k1', residence_id: 'r1', label: 'Diarista', token: 'tok', gate_ids: ['g1'], valid_from: ago(60), valid_until: new Date(Date.now()+864e5).toISOString(), uses: 1, max_uses: 5, revoked_at: null, created_at: ago(60), residences: { name: 'Casa 12', org_id: 'o1' } }];
    case 'invites': return [];
    case 'announcements': return [{ id: 'a1', org_id: 'o1', residence_id: null, title: 'Manutenção', body: 'Portão parado amanhã', created_by: UID, created_at: ago(120), organizations: { name: 'Residencial Jardins' }, profiles: { full_name: 'Síndico' }, announcement_reads: [] }];
    case 'org_requests': return [];
    case 'webauthn_credentials': return [];
    case 'my_unlock_methods': return { pin: true, bloqueado_ate: null, biometrias: 0, login_recente: true, recuperacoes_restantes: 1 };
    case 'report_stats': return { acionamentos: { total: 10, sucesso: 9, falha: 1 }, moradores: { ativos: 2, pendentes: 0, bloqueados: 0 }, residencias: 1, dispositivos: { total: 1, online: 1 }, por_dia: [], por_portao: [], por_usuario: [] };
    case 'system_health': return { banco_mb: 13, banco_pct: 3, placas_ativas: 1, chamadas_pct: 26, usuarios_mes: 4, usuarios_pct: 0, maior_pct: 26 };
    case 'my_activity': return [];
    case 'org_pin_status': return [];
    case 'factors': return { all: [], totp: [], phone: [] };
    case 'guest_key_info': return { label: 'Visita', residencia: 'Casa 12', valid_from: ago(60), valid_until: new Date(Date.now()+864e5).toISOString(), daily_start: null, daily_end: null, weekdays: null, usos: 0, max_usos: 3, bloqueio: null, portoes: [{ id: 'g1', nome: 'Portão social', modo: 'pulso', estado: 'fechado', online: true }] };
    case 'invite_preview': return { ok: true, residence_name: 'Casa 12', org_name: 'Residencial Jardins', role: 'morador' };
  }
  return [];
}
const ROUTES = ['/', '/historico', '/convite', '/conta', '/seguranca', '/comunicados', '/configurar-casa', '/solicitar-cadastro', '/aprovacoes', '/moradores', '/relatorios', '/administradores', '/residencias', '/residencias/r1', '/chaves', '/dispositivos', '/instalar', '/auditoria', '/organizacoes'];
const PUBLIC = ['/login', '/cadastro', '/recuperar-senha', '/sobre', '/privacidade', '/termos', '/link-invalido', '/k/token-teste', '/convite/ABCD1234'];
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
