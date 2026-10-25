/* Telas de conta (ENTRAR / CRIAR CONTA / conta conectada) + bloqueio das telas online quando o servidor exige login. Só nome e senha. */
(() => {
'use strict';
const A = SL.Auth, S = SaiyanMenu.screens;
const el = (t, c = '', p = {}) => Object.assign(document.createElement(t), { className: c, ...p });
const field = (ph, o = {}) => { const i = el('input', '', { placeholder: ph, autocomplete: 'off', ...o }); i.setAttribute('aria-label', ph); return i; };
const done = (d, next) => A.finish(d).then(() => { try { if (next) sessionStorage.setItem('sl_next', next); } catch (_) {} location.reload(); });

S.register('account', { title: 'Conta', build(p) {
  const msg = el('div', 'msg'), next = S.pendingNext, wrap = el('div');
  const say = (t, ok) => { msg.textContent = t; msg.style.color = ok ? '#7dffb0' : ''; };
  const back = () => S.btn('Voltar', () => S.close(), true), row = (...b) => { const r = el('div', 'row'); r.append(...b); return r; };
  const show = {
    in() {   // já conectado
      wrap.replaceChildren(el('h2', '', { textContent: 'Conta' }), el('p', '', { textContent: 'Conectado como ' + A.user.name }), row(S.btn('SAIR DA CONTA', () => A.logout()), back()));
    },
    login() {
      const n = field('Nome de usuário', { maxLength: 16, autocapitalize: 'none' }), pw = field('Senha', { type: 'password', autocomplete: 'current-password' });
      const go = S.btn('ENTRAR', () => { go.disabled = true; say(''); A.login({ name: n.value, password: pw.value }).then(d => { say('Conectado! Entrando…', true); return done(d, next); }).catch(x => say(x.message)).finally(() => { go.disabled = false; }); });
      pw.addEventListener('keydown', k => { if (k.key === 'Enter') go.click(); });
      wrap.replaceChildren(el('h2', '', { textContent: 'Entrar' }), el('p', 'hint', { textContent: 'Entre com o seu nome e a senha.' }), n, pw, msg, row(go, S.btn('CRIAR CONTA', show.register, true)), row(back())); n.focus();
    },
    register() {
      const n = field('Nome de usuário (3 a 16)', { maxLength: 16, autocapitalize: 'none' }), pw = field('Senha (mín. 8)', { type: 'password', autocomplete: 'new-password' }), pw2 = field('Repita a senha', { type: 'password', autocomplete: 'new-password' });
      const ok = S.btn('CRIAR CONTA', () => {
        if (pw.value !== pw2.value) return say('As senhas não são iguais.'); ok.disabled = true; say('');
        A.register({ name: n.value, password: pw.value }).then(d => { say('Conta criada! Entrando…', true); return done(d, next); }).catch(x => say(x.message)).finally(() => { ok.disabled = false; });
      });
      pw2.addEventListener('keydown', k => { if (k.key === 'Enter') ok.click(); });
      wrap.replaceChildren(el('h2', '', { textContent: 'Criar conta' }), el('p', 'hint', { textContent: 'Escolha um nome e uma senha. Anote a senha: não dá para recuperar.' }), n, pw, pw2, msg, row(ok, S.btn('Já tenho conta', show.login, true))); n.focus();
    }
  };
  (A.user ? show.in : show.login)(); p.append(wrap);
} });

/* bloqueio: telas online pedem a conta quando o servidor exige */
const GATED = new Set(['connect', 'createRoom', 'code', 'roomList']), open = S.open.bind(S);
S.open = (id, from) => { if (GATED.has(id) && A.needsLogin()) { S.pendingNext = id; return open('account', from); } return open(id, from); };
/* volta para a tela que a pessoa queria depois de entrar */
A.ready.then(() => { let nx = null; try { nx = sessionStorage.getItem('sl_next'); sessionStorage.removeItem('sl_next'); } catch (_) {} if (nx) setTimeout(() => S.open(nx), 300); });
})();
