/* CONTA do jogador (Cloudflare D1): cadastro, login, sessão, recuperação de senha e sair. Fala com /api/auth/* do Worker (cloudflare/auth.js).
 *  - A sessão é um token aleatório. "Lembrar minha conta" = guardado no aparelho (localStorage, 30 dias); senão só nesta aba (sessionStorage, some ao fechar).
 *  - A senha só viaja no momento de entrar/criar (HTTPS) e NUNCA fica guardada no aparelho.
 *  - O id do jogador passa a ser o da conta ('a' + id), o mesmo em qualquer aparelho; o apelido é o nome da conta.
 *  Expõe SL.Auth e window.SLAuth (SL é recriado por outros arquivos, então o global próprio é o seguro). */
(() => {
'use strict';
const KEY = 'sl.account';
const st = { l: () => localStorage, s: () => sessionStorage };
const rd = w => { try { const d = JSON.parse(st[w]().getItem(KEY) || 'null'); return d && d.token && d.pid && d.name ? d : null; } catch (_) { return null; } };
let acct = rd('l') || rd('s'), remembered = !!rd('l');

function base() {   // mesmo servidor do WebSocket (?server=, SL_CONFIG.serverUrl ou a própria origem)
  const q = /[?&]server=([^&#]+)/.exec(location.search); let u = q ? decodeURIComponent(q[1]) : (window.SL_CONFIG && SL_CONFIG.serverUrl) || '';
  if (!u) return /^https?:$/.test(location.protocol) ? location.origin : '';
  return u.replace(/^ws/, 'http').replace(/\/ws\/?$/, '').replace(/\/$/, '');
}
async function api(name, body) {
  const b = base(); if (!b) { const e = new Error('Nenhum servidor configurado.'); e.code = 'noserver'; throw e; }
  let r; try { r = await fetch(b + '/api/auth/' + name, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
  catch (_) { const e = new Error('Sem conexão com o servidor.'); e.code = 'network'; throw e; }
  let d = {}; try { d = await r.json(); } catch (_) {}
  if (!r.ok || d.ok === false) { const e = new Error(d.error || 'Erro ' + r.status); e.status = r.status; e.code = d.code || 'http' + r.status; throw e; }
  return d;
}
const clearStore = () => { for (const w of ['l', 's']) { try { st[w]().removeItem(KEY); } catch (_) {} } };
const Auth = {
  get user() { return acct; }, get remembered() { return remembered; }, token: () => (acct ? acct.token : ''),
  api,
  /* confere a sessão guardada. Sem internet: mantém a conta salva (o jogo abre); sessão vencida/inválida: apaga e pede login. */
  async init() {
    if (!acct) return null;
    try { const m = await api('me', { token: acct.token }); acct.name = m.name; return acct; }
    catch (e) { if (e.status === 401) { clearStore(); try { sessionStorage.removeItem('sl_pid'); } catch (_) {} acct = null; return null; } return acct; }
  },
  async register(b) { return Auth._done(await api('register', b), b.remember !== false); },
  async login(b) { return Auth._done(await api('login', b), !!b.remember); },
  async recover(b) { return Auth._done(await api('recover', b), !!b.remember); },
  /* guarda a sessão; o recarregamento da página (feito pela tela) faz o jogo inteiro subir já com a conta */
  _done(d, remember) {
    clearStore(); const rec = { token: d.token, pid: d.pid, name: d.name };
    try { (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(rec)); } catch (_) {}
    try { sessionStorage.removeItem('sl_pid'); sessionStorage.removeItem('sl_token'); sessionStorage.removeItem('sl_name'); } catch (_) {}
    acct = rec; remembered = !!remember; return d;
  },
  async logout() {
    const t = Auth.token(); try { await api('logout', { token: t }); } catch (_) {}
    clearStore(); try { sessionStorage.removeItem('sl_pid'); sessionStorage.removeItem('sl_token'); sessionStorage.removeItem('sl_name'); } catch (_) {}
    acct = null; location.reload();
  }
};
SL.Auth = window.SLAuth = Auth; Auth.ready = Auth.init();
})();
