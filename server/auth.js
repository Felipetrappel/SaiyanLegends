/* Contas do Saiyan Legends: cadastro com código enviado ao Gmail, login com senha, sessão por token.
 * Sem dependências (só Node >= 18). Configuração por variáveis de ambiente (veja LEIA-ME-CONTAS.md):
 *   REQUIRE_LOGIN=1          exige conta para jogar online (sem isso, o jogo continua aberto como antes)
 *   MAIL=smtp | brevo | console     como enviar o código (console = só mostra no log do servidor; use só para testar)
 *     smtp : SMTP_USER (seu Gmail) + SMTP_PASS (senha de app de 16 letras) [+ SMTP_HOST=smtp.gmail.com SMTP_PORT=465]
 *     brevo: BREVO_API_KEY + MAIL_FROM (remetente verificado no Brevo) [+ MAIL_FROM_NAME]
 *   STORE=file | supabase    onde guardar as contas (file = arquivo; no Render grátis o arquivo some quando reinicia!)
 *     supabase: SUPABASE_URL + SUPABASE_KEY (service_role) — tabela sl_users (id text primary key, data jsonb)
 *   DATA_DIR=./data          pasta do arquivo de contas (STORE=file)
 * Segurança: senhas com scrypt + sal; códigos de 6 dígitos que valem 10 min com 5 tentativas; tokens guardados só como hash;
 * limites de tentativas por e-mail e por IP; só e-mails @gmail.com / @googlemail.com. */
'use strict';
const crypto = require('crypto'), fs = require('fs'), path = require('path'), tls = require('tls');

const ENV = process.env, REQUIRED = ENV.REQUIRE_LOGIN === '1';
const CODE_TTL = 10 * 60e3, SESSION_TTL = 30 * 864e5, MAX_SESSIONS = 8, GMAIL = new Set(['gmail.com', 'googlemail.com']);
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const E = (m, status = 400) => { const e = new Error(m); e.user = true; e.status = status; return e; };

/* ───────── e-mail do Gmail → identidade única (ignora pontos e +apelido, que o Gmail trata como a mesma caixa) ───────── */
function normEmail(raw) {
  const s = String(raw || '').trim().toLowerCase(); if (s.length > 80) return null;
  const m = /^([a-z0-9._+-]+)@([a-z0-9.-]+)$/.exec(s); if (!m || !GMAIL.has(m[2])) return null;
  const local = m[1].split('+')[0].replace(/\./g, ''); if (local.length < 6 || local.length > 30) return null;
  return { typed: s, canon: local + '@gmail.com', id: 'a' + sha(local + '@gmail.com').slice(0, 15) };
}

/* ───────── envio de e-mail ───────── */
function b64(s) { return Buffer.from(s, 'utf8').toString('base64'); }
function smtpSend({ host, port, user, pass, from, to, subject, text, insecure }) {
  return new Promise((resolve, reject) => {
    let buf = '', step = 0, done = false; const fail = e => { if (!done) { done = true; try { s.destroy(); } catch (_) {} reject(e instanceof Error ? e : new Error(String(e))); } };
    const s = tls.connect({ host, port, servername: host, rejectUnauthorized: !insecure }); s.setEncoding('utf8'); s.setTimeout(20000, () => fail(new Error('SMTP: tempo esgotado')));
    const msg = ['From: Saiyan Legends <' + from + '>', 'To: <' + to + '>', 'Subject: =?UTF-8?B?' + b64(subject) + '?=', 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', 'Date: ' + new Date().toUTCString(), '',
      b64(text).replace(/(.{76})/g, '$1\r\n')].join('\r\n');
    const plan = [['', 220], ['EHLO saiyan-legends', 250], ['AUTH LOGIN', 334], [b64(user), 334], [b64(pass), 235], ['MAIL FROM:<' + from + '>', 250], ['RCPT TO:<' + to + '>', 250], ['DATA', 354], [msg + '\r\n.', 250], ['QUIT', 221]];
    const next = () => { const [cmd] = plan[step]; if (cmd) s.write(cmd + '\r\n'); };
    s.on('data', d => {
      buf += d; let i; while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2); if (/^\d{3}-/.test(line)) continue;   // linha de continuação (EHLO)
        const code = +line.slice(0, 3), want = plan[step][1];
        if (code !== want) return fail(new Error('SMTP ' + line.slice(0, 120)));
        step++; if (step >= plan.length) { done = true; s.end(); return resolve(); } next();
      }
    });
    s.on('error', fail); s.on('close', () => { if (!done) fail(new Error('SMTP: conexão fechada')); });
  });
}
async function sendMail(to, subject, text) {
  const mode = ENV.MAIL || 'console';
  if (mode === 'smtp') {
    if (!ENV.SMTP_USER || !ENV.SMTP_PASS) throw new Error('SMTP_USER/SMTP_PASS não configurados');
    return smtpSend({ host: ENV.SMTP_HOST || 'smtp.gmail.com', port: +ENV.SMTP_PORT || 465, user: ENV.SMTP_USER, pass: ENV.SMTP_PASS.replace(/\s/g, ''), from: ENV.MAIL_FROM || ENV.SMTP_USER, to, subject, text, insecure: ENV.SMTP_INSECURE === '1' });
  }
  if (mode === 'brevo') {
    if (!ENV.BREVO_API_KEY || !ENV.MAIL_FROM) throw new Error('BREVO_API_KEY/MAIL_FROM não configurados');
    const r = await fetch(ENV.BREVO_URL || 'https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': ENV.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: { name: ENV.MAIL_FROM_NAME || 'Saiyan Legends', email: ENV.MAIL_FROM }, to: [{ email: to }], subject, textContent: text }) });
    if (!r.ok) throw new Error('Brevo ' + r.status + ' ' + (await r.text()).slice(0, 120));
    return;
  }
  console.log('[MAIL=console] para', to, '|', subject, '|', text.replace(/\n/g, ' '));   // só para testes locais
}

/* ───────── armazenamento ───────── */
function makeStore() {
  if (ENV.STORE === 'supabase') {
    const base = (ENV.SUPABASE_URL || '').replace(/\/$/, '') + '/rest/v1/sl_users', H = { apikey: ENV.SUPABASE_KEY || '', authorization: 'Bearer ' + (ENV.SUPABASE_KEY || ''), 'content-type': 'application/json' };
    return {
      name: 'supabase',
      async get(id) { const r = await fetch(base + '?id=eq.' + encodeURIComponent(id) + '&select=data', { headers: H }); if (!r.ok) throw new Error('Supabase ' + r.status); const a = await r.json(); return a[0] ? a[0].data : null; },
      async put(id, data) { const r = await fetch(base + '?on_conflict=id', { method: 'POST', headers: { ...H, prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id, data }) }); if (!r.ok) throw new Error('Supabase ' + r.status + ' ' + (await r.text()).slice(0, 100)); }
    };
  }
  const dir = path.resolve(ENV.DATA_DIR || path.join(__dirname, '..', 'data')), file = path.join(dir, 'users.json'); let db = {}, q = Promise.resolve();
  try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) {}
  return {
    name: 'file', async get(id) { return db[id] || null; },
    async put(id, data) { db[id] = data; q = q.then(() => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(db)); fs.renameSync(file + '.tmp', file); }).catch(() => {}); return q; }
  };
}

/* ───────── senhas ───────── */
const hashPw = pw => new Promise((res, rej) => { const salt = crypto.randomBytes(16); crypto.scrypt(pw, salt, 32, (e, k) => e ? rej(e) : res('s1:' + salt.toString('hex') + ':' + k.toString('hex'))); });
const checkPw = (pw, h) => new Promise(res => { const [v, s, k] = String(h || '').split(':'); if (v !== 's1') return res(false);
  crypto.scrypt(pw, Buffer.from(s, 'hex'), 32, (e, d) => res(!e && crypto.timingSafeEqual(d, Buffer.from(k, 'hex')))); });

/* ───────── limites ───────── */
const hits = new Map();   // chave → [timestamps]
function limit(key, max, ms) { const now = Date.now(), a = (hits.get(key) || []).filter(t => now - t < ms); if (a.length >= max) { hits.set(key, a); return false; } a.push(now); hits.set(key, a); return true; }
setInterval(() => { const now = Date.now(); for (const [k, a] of hits) if (!a.some(t => now - t < 36e5)) hits.delete(k); for (const [k, c] of codes) if (c.exp < now) codes.delete(k); }, 6e4).unref();
const codes = new Map();   // `${purpose}:${id}` → { hash, exp, tries }

function create(log = console.log) {
  const store = makeStore();
  if (REQUIRED) log('contas: login obrigatório · e-mail=' + (ENV.MAIL || 'console') + ' · armazenamento=' + store.name + (store.name === 'file' ? ' (ATENÇÃO: no Render grátis o arquivo some ao reiniciar; use STORE=supabase)' : ''));
  const validName = n => /^[A-Za-z0-9_ .-]{3,16}$/.test(String(n || '').trim()) ? String(n).trim() : null;
  const validPw = p => typeof p === 'string' && p.length >= 8 && p.length <= 64;
  async function newSession(u) {
    const secret = crypto.randomBytes(24).toString('hex'); u.sessions = (u.sessions || []).filter(s => s.exp > Date.now()).slice(-(MAX_SESSIONS - 1)); u.sessions.push({ h: sha(secret), exp: Date.now() + SESSION_TTL });
    await store.put(u.id, u); return u.id + '.' + secret;
  }
  async function verify(token) {
    const [id, secret] = String(token || '').split('.'); if (!/^a[0-9a-f]{15}$/.test(id || '') || !secret) return null;
    const u = await store.get(id); if (!u) return null; const h = sha(secret);
    return (u.sessions || []).some(s => s.h === h && s.exp > Date.now()) ? { pid: u.id, name: u.name, email: u.email } : null;
  }
  const pub = (u, token) => ({ ok: true, token, pid: u.id, name: u.name, email: u.email });

  const routes = {
    async code(b, ip) {   // pede o código (cadastro ou recuperação de senha)
      const purpose = b.purpose === 'reset' ? 'reset' : 'register', em = normEmail(b.email); if (!em) throw E('Use um e-mail @gmail.com válido.');
      if (!limit('ip:' + ip, 20, 36e5)) throw E('Muitos pedidos. Tente mais tarde.', 429);
      const u = await store.get(em.id);
      if (purpose === 'register' && u) throw E('Esse Gmail já tem conta. Use ENTRAR (ou "Esqueci a senha").');
      if (!limit('mail1:' + em.id, 1, 60e3) || !limit('mail5:' + em.id, 5, 36e5)) throw E('Muitos pedidos. Espere um minuto e tente de novo.', 429);
      if (purpose === 'reset' && !u) return { ok: true };   // não revela se existe
      const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0'); codes.set(purpose + ':' + em.id, { hash: sha(code + em.id), exp: Date.now() + CODE_TTL, tries: 0 });
      try { await sendMail(em.typed, 'Seu código do Saiyan Legends: ' + code, 'Seu código de ' + (purpose === 'reset' ? 'recuperação de senha' : 'cadastro') + ' no Saiyan Legends Online é:\n\n' + code + '\n\nEle vale por 10 minutos. Se não foi você, ignore este e-mail.'); }
      catch (e) { codes.delete(purpose + ':' + em.id); log('falha ao enviar e-mail:', e.message); throw E('Não foi possível enviar o e-mail agora. Tente mais tarde.', 502); }
      return { ok: true };
    },
    async register(b, ip) {
      const em = normEmail(b.email); if (!em) throw E('Use um e-mail @gmail.com válido.'); const name = validName(b.name); if (!name) throw E('Apelido: 3 a 16 letras, números, espaço, _ . -');
      if (!validPw(b.password)) throw E('A senha precisa ter de 8 a 64 caracteres.'); if (!limit('ip:' + ip, 40, 36e5)) throw E('Muitas tentativas. Tente mais tarde.', 429);
      checkCode('register', em, b.code);
      if (await store.get(em.id)) throw E('Esse Gmail já tem conta.');
      const u = { id: em.id, email: em.canon, name, pw: await hashPw(b.password), created: Date.now(), sessions: [] }; codes.delete('register:' + em.id);
      return pub(u, await newSession(u));
    },
    async login(b, ip) {
      const em = normEmail(b.email), bad = () => E('E-mail ou senha incorretos.', 401);
      if (!em || typeof b.password !== 'string') throw bad(); if (!limit('lf:' + em.id, 8, 15 * 60e3) || !limit('lfip:' + ip, 30, 15 * 60e3)) throw E('Muitas tentativas. Espere alguns minutos.', 429);
      const u = await store.get(em.id), ok = await checkPw(b.password, u ? u.pw : 's1:' + '00'.repeat(16) + ':' + '00'.repeat(32)); if (!u || !ok) throw bad();
      return pub(u, await newSession(u));
    },
    async reset(b, ip) {
      const em = normEmail(b.email); if (!em) throw E('Use um e-mail @gmail.com válido.'); if (!validPw(b.password)) throw E('A senha precisa ter de 8 a 64 caracteres.');
      if (!limit('ip:' + ip, 40, 36e5)) throw E('Muitas tentativas. Tente mais tarde.', 429); checkCode('reset', em, b.code);
      const u = await store.get(em.id); if (!u) throw E('Código inválido ou vencido.'); u.pw = await hashPw(b.password); u.sessions = []; codes.delete('reset:' + em.id);
      return pub(u, await newSession(u));
    },
    async me(b) { const u = await verify(b.token); if (!u) throw E('Sessão expirada. Entre de novo.', 401); return { ok: true, ...u }; },
    async logout(b) {
      const [id, secret] = String(b.token || '').split('.'); if (!/^a[0-9a-f]{15}$/.test(id || '') || !secret) return { ok: true };
      const u = await store.get(id); if (u) { const h = sha(secret); u.sessions = (u.sessions || []).filter(s => s.h !== h); await store.put(id, u); } return { ok: true };
    },
    async name(b) {
      const v = await verify(b.token); if (!v) throw E('Sessão expirada. Entre de novo.', 401); const name = validName(b.name); if (!name) throw E('Apelido: 3 a 16 letras, números, espaço, _ . -');
      const u = await store.get(v.pid); u.name = name; await store.put(u.id, u); return { ok: true, name };
    }
  };
  function checkCode(purpose, em, code) {
    const c = codes.get(purpose + ':' + em.id), bad = E('Código inválido ou vencido.'); if (!c || c.exp < Date.now()) throw bad;
    if (++c.tries > 5) { codes.delete(purpose + ':' + em.id); throw E('Muitas tentativas erradas. Peça um novo código.'); }
    const ok = String(code || '').length === 6 && crypto.timingSafeEqual(Buffer.from(sha(String(code) + em.id)), Buffer.from(c.hash)); if (!ok) throw bad;
  }

  /* HTTP: devolve true se tratou a requisição (/api/auth/*) */
  function http(req, res, pathname) {
    if (!pathname.startsWith('/api/auth/')) return false;
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST, GET, OPTIONS', 'cache-control': 'no-store' };
    const send = (st, o) => { res.writeHead(st, { 'content-type': 'application/json; charset=utf-8', ...cors }); res.end(JSON.stringify(o)); };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return true; }
    const name = pathname.slice(10);
    if (name === 'config' && req.method === 'GET') { send(200, { required: REQUIRED, domain: 'gmail.com' }); return true; }
    const f = routes[name]; if (!f || req.method !== 'POST') { send(404, { ok: false, error: 'Não encontrado.' }); return true; }
    const ip = String((req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?'); let raw = '';
    req.on('data', d => { raw += d; if (raw.length > 4096) req.destroy(); });
    req.on('end', async () => {
      let b; try { b = JSON.parse(raw || '{}'); } catch (_) { return send(400, { ok: false, error: 'Pedido inválido.' }); }
      try { send(200, await f(b && typeof b === 'object' ? b : {}, ip)); }
      catch (e) { if (!e.user) log('erro auth:', e.message); send(e.user ? e.status : 500, { ok: false, error: e.user ? e.message : 'Erro interno. Tente de novo.' }); }
    });
    return true;
  }
  return { required: REQUIRED, http, verify };
}
module.exports = { create, normEmail, smtpSend };
