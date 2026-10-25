/* Conta do jogador: cadastro com código enviado ao Gmail, login com senha, sair. Fala com /api/auth/* do servidor (server/auth.js).
 * Quando o servidor exige login (REQUIRE_LOGIN=1), as telas online (CONNECT, CREATE ROOM, CODE, ROOM LIST) pedem a conta antes.
 * A conta fica salva neste aparelho (localStorage 'sl.account'); o id do jogador passa a ser o da conta (o mesmo em qualquer aparelho). */
(() => {
'use strict';
const KEY = 'sl.account';
const read = () => { try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); return d && d.token && d.pid ? d : null; } catch (_) { return null; } };
let acct = read(), cfg = { required: false };

function base() {   // mesmo servidor do WebSocket (?server=, SL_CONFIG.serverUrl ou a própria origem)
  const q = /[?&]server=([^&#]+)/.exec(location.search); let u = q ? decodeURIComponent(q[1]) : (window.SL_CONFIG && SL_CONFIG.serverUrl) || '';
  if (!u) return /^https?:$/.test(location.protocol) ? location.origin : '';
  u = u.replace(/^ws/, 'http').replace(/\/ws\/?$/, '').replace(/\/$/, ''); return u;
}
async function api(name, body) {
  const b = base(); if (!b) throw new Error('Nenhum servidor configurado.');
  let r; try { r = await fetch(b + '/api/auth/' + name, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
  catch (_) { throw new Error('Sem conexão com o servidor. Se ele estava dormindo, espere 1 minuto e tente de novo.'); }
  let d = {}; try { d = await r.json(); } catch (_) {}
  if (!r.ok || d.ok === false) { const e = new Error(d.error || 'Erro ' + r.status); e.status = r.status; throw e; }
  return d;
}
const Auth = {
  get user() { return acct; }, get required() { return !!cfg.required; }, token: () => (acct ? acct.token : ''),
  needsLogin() { return cfg.required && !acct; },
  async init() {
    try { cfg = await api('config'); } catch (_) { /* servidor fora do ar: o modo offline já avisa */ }
    if (acct) { try { const m = await api('me', { token: acct.token }); acct.name = m.name; localStorage.setItem(KEY, JSON.stringify(acct)); } catch (e) { if (e.status === 401) { localStorage.removeItem(KEY); acct = null; if (!sessionStorage.getItem('sl_authfix')) { sessionStorage.setItem('sl_authfix', '1'); location.reload(); } } } }
  },
  sendCode: (email, purpose) => api('code', { email, purpose }),
  async finish(d) { try { localStorage.setItem(KEY, JSON.stringify({ token: d.token, pid: d.pid, name: d.name, email: d.email })); sessionStorage.removeItem('sl_authfix'); } catch (_) {} },
  register: b => api('register', b), login: b => api('login', b), reset: b => api('reset', b),
  async logout() { const t = Auth.token(); try { await api('logout', { token: t }); } catch (_) {} try { localStorage.removeItem(KEY); sessionStorage.removeItem('sl_pid'); } catch (_) {} location.reload(); }
};
SL.Auth = Auth; Auth.ready = Auth.init();
})();
