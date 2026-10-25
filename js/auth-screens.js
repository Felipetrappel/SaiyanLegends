/* Telas de conta (ENTRAR / CRIAR CONTA / ESQUECI A SENHA / conta conectada) + bloqueio das telas online quando o servidor exige login. */
(() => {
'use strict';
const A = SL.Auth, S = SaiyanMenu.screens;
const el = (t, c = '', p = {}) => Object.assign(document.createElement(t), { className: c, ...p });
const field = (ph, o = {}) => { const i = el('input', '', { placeholder: ph, autocomplete: 'off', ...o }); i.setAttribute('aria-label', ph); return i; };
const done = (d, next) => A.finish(d).then(() => { try { if (next) sessionStorage.setItem('sl_next', next); } catch (_) {} location.reload(); });

S.register('account', { title: 'Conta', build(p) {
  const msg = el('div', 'msg'), next = S.pendingNext, wrap = el('div');
  const say = (t, ok) => { msg.textContent = t; msg.style.color = ok ? '#7dffb0' : ''; };
  const back = () => S.btn('Voltar', () => S.close(), true);
  const show = {
    in() {   // já conectado
      wrap.replaceChildren(el('h2', '', { textContent: 'Conta' }), el('p', '', { textContent: 'Conectado como ' + A.user.name }), el('p', 'hint', { textContent: A.user.email }),
        Object.assign(el('div', 'row'), {}));
      wrap.lastChild.append(S.btn('SAIR DA CONTA', () => A.logout()), back());
    },
    login() {
      const e = field('Seu Gmail', { type: 'email', inputMode: 'email', autocapitalize: 'none' }), pw = field('Senha', { type: 'password', autocomplete: 'current-password' });
      const go = S.btn('ENTRAR', () => { go.disabled = true; say(''); A.login({ email: e.value, password: pw.value }).then(d => { say('Conectado! Entrando…', true); return done(d, next); }).catch(x => say(x.message)).finally(() => { go.disabled = false; }); });
      pw.addEventListener('keydown', k => { if (k.key === 'Enter') go.click(); });
      const row = el('div', 'row'); row.append(go, S.btn('CRIAR CONTA', show.register, true));
      const row2 = el('div', 'row'); row2.append(S.btn('Esqueci a senha', () => show.reset(), true), back());
      wrap.replaceChildren(el('h2', '', { textContent: 'Entrar' }), el('p', 'hint', { textContent: 'Entre com o seu Gmail e a senha.' }), e, pw, msg, row, row2);
    },
    register() { code('register'); },
    reset() { code('reset'); }
  };
  function code(purpose) {   // passo 1: Gmail → código; passo 2: código + apelido + senha
    const reset = purpose === 'reset', e = field('Seu Gmail', { type: 'email', inputMode: 'email', autocapitalize: 'none' });
    const step1 = () => {
      const b = S.btn('ENVIAR CÓDIGO', () => { b.disabled = true; say(''); A.sendCode(e.value, purpose).then(() => { say('Enviamos um código de 6 dígitos para o seu Gmail. Veja também o Spam.', true); step2(); }).catch(x => say(x.message)).finally(() => { b.disabled = false; }); });
      const row = el('div', 'row'); row.append(b, S.btn('Já tenho conta', show.login, true));
      wrap.replaceChildren(el('h2', '', { textContent: reset ? 'Recuperar senha' : 'Criar conta' }), el('p', 'hint', { textContent: 'Só Gmail (@gmail.com). Vamos enviar um código para confirmar que o e-mail é seu.' }), e, msg, row);
    };
    const step2 = () => {
      const c = field('Código de 6 dígitos', { inputMode: 'numeric', maxLength: 6 }), n = field('Apelido no jogo (3 a 16)', { maxLength: 16 }), pw = field(reset ? 'Nova senha (mín. 8)' : 'Senha (mín. 8)', { type: 'password', autocomplete: 'new-password' }), pw2 = field('Repita a senha', { type: 'password', autocomplete: 'new-password' });
      c.addEventListener('input', () => { c.value = c.value.replace(/\D/g, ''); });
      const ok = S.btn(reset ? 'REDEFINIR SENHA' : 'CRIAR CONTA', () => {
        if (pw.value !== pw2.value) return say('As senhas não são iguais.'); ok.disabled = true; say('');
        const body = { email: e.value, code: c.value, password: pw.value, name: n.value };
        (reset ? A.reset(body) : A.register(body)).then(d => { say('Pronto! Entrando…', true); return done(d, next); }).catch(x => say(x.message)).finally(() => { ok.disabled = false; });
      });
      const again = S.btn('Reenviar código', () => { again.disabled = true; A.sendCode(e.value, purpose).then(() => say('Novo código enviado.', true)).catch(x => say(x.message)); setTimeout(() => { again.disabled = false; }, 60000); }, true);
      const row = el('div', 'row'); row.append(ok, again); const row2 = el('div', 'row'); row2.append(S.btn('Voltar', show.login, true));
      wrap.replaceChildren(el('h2', '', { textContent: reset ? 'Recuperar senha' : 'Criar conta' }), el('p', 'hint', { textContent: 'Código enviado para ' + e.value }), c, ...(reset ? [] : [n]), pw, pw2, msg, row, row2); c.focus();
    };
    step1();
  }
  (A.user ? show.in : show.login)(); p.append(wrap);
} });

/* bloqueio: telas online pedem a conta quando o servidor exige */
const GATED = new Set(['connect', 'createRoom', 'code', 'roomList']), open = S.open.bind(S);
S.open = (id, from) => { if (GATED.has(id) && A.needsLogin()) { S.pendingNext = id; return open('account', from); } return open(id, from); };
/* volta para a tela que a pessoa queria depois de entrar */
A.ready.then(() => { let nx = null; try { nx = sessionStorage.getItem('sl_next'); sessionStorage.removeItem('sl_next'); } catch (_) {} if (nx) setTimeout(() => S.open(nx), 300); });
})();
