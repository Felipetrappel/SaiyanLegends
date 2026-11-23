/* TELA DE LOGIN / CADASTRO — a primeira tela do jogo. O menu só aparece depois de entrar (ou criar a conta).
 *  - Painel azul = ENTRAR, painel roxo = CRIAR CONTA (em celular em pé, uma aba de cada vez).
 *  - Idiomas: objeto LANGS abaixo. Para um novo idioma, acrescente uma entrada (flag, code e textos t) — os botões e os textos se atualizam sozinhos.
 *  - Depois do login a página recarrega: o jogo inteiro sobe já com a conta (id, nome, progresso na nuvem). */
(() => {
'use strict';
const A = window.SLAuth; if (!A) return;
const LS = { get: k => { try { return localStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} } };

/* ───────── idiomas ───────── */
const LANGS = {
  'pt-BR': { code: 'PT-BR', flag: 'assets/ui/flag-br.png', t: {
    login_t: 'ENTRAR', login_s: 'Faça login na sua conta', reg_t: 'CRIAR CONTA', reg_s: 'Faça seu cadastro agora', user: 'Usuário', pass: 'Senha', pass2: 'Confirmar Senha',
    remember: 'Lembrar minha conta', recover: 'Recuperar senha', login_b: 'Entrar', reg_b: 'Criar Conta', accept: 'Eu aceito os', terms: 'termos de uso', and: 'e', privacy: 'privacidade',
    banner: 'Jogue com a gente!', show: 'Mostrar senha', hide: 'Ocultar senha', close: 'Fechar', wait: 'Aguarde…', checking: 'Verificando sua conta…', retry: 'Tentar de novo',
    e_empty: 'Preencha todos os campos.', e_bad_name: 'Usuário: 3 a 16 letras, números ou _.', e_bad_pass: 'A senha deve ter de 6 a 64 caracteres.', e_name_taken: 'Esse usuário já está cadastrado.',
    e_bad_login: 'Usuário ou senha incorretos.', e_too_many: 'Muitas tentativas. Aguarde 10 minutos.', e_bad_recovery: 'Usuário ou código de recuperação incorretos.', e_network: 'Sem conexão com o servidor. Verifique a internet e tente de novo.',
    e_server: 'Erro no servidor. Tente de novo.', e_nodb: 'Banco de dados indisponível. Tente mais tarde.', e_mismatch: 'A senha e a confirmação não são iguais.', e_terms: 'Aceite os termos de uso e a privacidade para continuar.', e_noserver: 'Nenhum servidor configurado.',
    rec_t: 'GUARDE ESTE CÓDIGO', rec_p: 'Se você esquecer a senha, só este código recupera a sua conta. Ele aparece uma única vez.', rec_copy: 'Copiar', rec_copied: 'Copiado!', rec_ok: 'Anotei, continuar',
    rcv_t: 'RECUPERAR SENHA', rcv_p: 'Digite seu usuário, o código de recuperação que você recebeu ao criar a conta e uma nova senha.', rcv_code: 'Código de recuperação', rcv_new: 'Nova senha', rcv_b: 'Redefinir senha', cancel: 'Cancelar',
    terms_t: 'TERMOS DE USO E PRIVACIDADE', terms_x: ['Saiyan Legends Online é um jogo de luta online. Ao criar uma conta você concorda em jogar com respeito, sem trapaças, sem usar nomes ofensivos e sem prejudicar outros jogadores.', 'Guardamos apenas: o seu nome de usuário, a senha (somente em forma de hash seguro, nunca em texto) e o progresso do jogo (moedas, diamantes, nível e personagens).', 'Esses dados servem só para o funcionamento do jogo e não são vendidos nem compartilhados. A equipe pode suspender contas que descumpram as regras.'], ok: 'Entendi',
    exit_web: 'Para sair, feche esta aba ou janela do navegador.', tab_login: 'ENTRAR', tab_reg: 'CRIAR CONTA' } },
  'en-US': { code: 'EN-US', flag: 'assets/ui/flag-us.png', t: {
    login_t: 'LOG IN', login_s: 'Log in to your account', reg_t: 'SIGN UP', reg_s: 'Create your account now', user: 'Username', pass: 'Password', pass2: 'Confirm Password',
    remember: 'Remember my account', recover: 'Recover password', login_b: 'Log In', reg_b: 'Create Account', accept: 'I accept the', terms: 'terms of use', and: 'and', privacy: 'privacy policy',
    banner: 'Play with us!', show: 'Show password', hide: 'Hide password', close: 'Close', wait: 'Please wait…', checking: 'Checking your account…', retry: 'Try again',
    e_empty: 'Please fill in all fields.', e_bad_name: 'Username: 3 to 16 letters, numbers or _.', e_bad_pass: 'Password must be 6 to 64 characters.', e_name_taken: 'That username is already registered.',
    e_bad_login: 'Wrong username or password.', e_too_many: 'Too many attempts. Wait 10 minutes.', e_bad_recovery: 'Wrong username or recovery code.', e_network: 'Cannot reach the server. Check your internet and try again.',
    e_server: 'Server error. Please try again.', e_nodb: 'Database unavailable. Try again later.', e_mismatch: 'Password and confirmation do not match.', e_terms: 'Accept the terms of use and privacy policy to continue.', e_noserver: 'No server configured.',
    rec_t: 'SAVE THIS CODE', rec_p: 'If you forget your password, only this code can recover your account. It is shown only once.', rec_copy: 'Copy', rec_copied: 'Copied!', rec_ok: 'Got it, continue',
    rcv_t: 'RECOVER PASSWORD', rcv_p: 'Enter your username, the recovery code you received when you created the account, and a new password.', rcv_code: 'Recovery code', rcv_new: 'New password', rcv_b: 'Reset password', cancel: 'Cancel',
    terms_t: 'TERMS OF USE & PRIVACY', terms_x: ['Saiyan Legends Online is an online fighting game. By creating an account you agree to play respectfully, without cheating, offensive names or harming other players.', 'We only store: your username, your password (only as a secure hash, never as plain text) and your game progress (coins, diamonds, level and characters).', 'This data is used only to run the game and is never sold or shared. The team may suspend accounts that break the rules.'], ok: 'Got it',
    exit_web: 'To leave, close this browser tab or window.', tab_login: 'LOG IN', tab_reg: 'SIGN UP' } }
};
let lang = LS.get('sl.lang'); if (!LANGS[lang]) lang = /^en/i.test(navigator.language || '') ? 'en-US' : 'pt-BR';
const T = k => (LANGS[lang].t[k] != null ? LANGS[lang].t[k] : LANGS['pt-BR'].t[k]);
const errText = e => { const k = 'e_' + (e && e.code); return LANGS[lang].t[k] || LANGS['pt-BR'].t[k] && T(k) || (e && e.message) || T('e_server'); };

/* ───────── DOM ───────── */
const el = (tag, cls, props) => { const n = document.createElement(tag); if (cls) n.className = cls; if (props) Object.assign(n, props); return n; };
const SVG = {
  user: '<svg viewBox="0 0 48 48"><circle cx="24" cy="15" r="9" fill="currentColor"/><path d="M5 44c0-11 8-17 19-17s19 6 19 17z" fill="currentColor"/></svg>',
  lock: '<svg viewBox="0 0 48 48"><path d="M14 21v-6a10 10 0 0 1 20 0v6" fill="none" stroke="currentColor" stroke-width="5"/><rect x="8" y="21" width="32" height="24" rx="4" fill="currentColor"/><circle cx="24" cy="31" r="3.4" fill="#04103a"/><rect x="22.4" y="31" width="3.2" height="8" fill="#04103a"/></svg>',
  eye: '<svg viewBox="0 0 48 48"><path d="M3 24c5-9 11-13 21-13s16 4 21 13c-5 9-11 13-21 13S8 33 3 24z" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="24" cy="24" r="7" fill="currentColor"/></svg>',
  eyeoff: '<svg viewBox="0 0 48 48"><path d="M3 24c5-9 11-13 21-13s16 4 21 13c-5 9-11 13-21 13S8 33 3 24z" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="24" cy="24" r="7" fill="currentColor"/><path d="M8 42L40 6" stroke="#04103a" stroke-width="9"/><path d="M8 42L40 6" stroke="currentColor" stroke-width="4"/></svg>',
  check: '<svg viewBox="0 0 48 48"><path d="M9 25l10 10L39 12" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="square"/></svg>',
  sync: '<svg viewBox="0 0 48 48"><path d="M40 20A16 16 0 0 0 11 14M8 28a16 16 0 0 0 29 6" fill="none" stroke="currentColor" stroke-width="5"/><path d="M42 8v14H28zM6 40V26h14z" fill="currentColor"/></svg>',
  cloud: '<svg viewBox="0 0 140 100"><g stroke="#050a2c" stroke-width="6" stroke-linejoin="round"><circle cx="42" cy="58" r="30" fill="currentColor"/><circle cx="82" cy="46" r="34" fill="currentColor"/><circle cx="108" cy="68" r="24" fill="currentColor"/><rect x="30" y="60" width="92" height="30" rx="14" fill="currentColor"/></g><g fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="5" stroke-linecap="round"><path d="M34 70c-8-9 2-22 12-17 7 4 3 13-3 12"/><path d="M84 60c-10-11 3-28 15-21 9 5 4 16-4 15"/></g></svg>'
};
const root = el('div', 'au'); root.id = 'au'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
root.innerHTML = `
<div class="au-bg"></div>
<div class="au-top">
  <div class="au-langs" role="group"></div>
  <button type="button" class="au-x" aria-label="Fechar">✕</button>
</div>
<div class="au-tabs"><button type="button" data-tab="login" class="on"></button><button type="button" data-tab="reg"></button></div>
<div class="au-scroll"><div class="au-stage">
  <section class="au-panel au-login" data-p="login">
    <i class="au-cl au-cl-l">${SVG.cloud}</i><i class="au-cl au-cl-r">${SVG.cloud}</i>
    <h1 data-t="login_t"></h1><p class="au-sub"><span data-t="login_s"></span></p>
    <form novalidate autocomplete="on">
      <label class="au-f"><i class="au-ic">${SVG.user}</i><input name="username" type="text" autocomplete="username" maxlength="16" autocapitalize="off" spellcheck="false" data-ph="user"></label>
      <label class="au-f"><i class="au-ic">${SVG.lock}</i><input name="password" type="password" autocomplete="current-password" maxlength="64" data-ph="pass"><button type="button" class="au-eye" tabindex="-1"></button></label>
      <label class="au-ck"><input type="checkbox" name="remember" checked><b class="au-box">${SVG.check}</b><span data-t="remember"></span></label>
      <button type="button" class="au-link" data-act="recover"><i class="au-ic2">${SVG.sync}</i><span data-t="recover"></span></button>
      <p class="au-msg" role="alert" aria-live="assertive"></p>
      <button type="submit" class="au-btn blue"><span data-t="login_b"></span></button>
    </form>
  </section>
  <section class="au-panel au-reg" data-p="reg">
    <i class="au-cl au-cl-l">${SVG.cloud}</i><i class="au-cl au-cl-r">${SVG.cloud}</i>
    <h1 data-t="reg_t"></h1><p class="au-sub"><span data-t="reg_s"></span></p>
    <form novalidate autocomplete="on">
      <label class="au-f"><i class="au-ic">${SVG.user}</i><input name="username" type="text" autocomplete="username" maxlength="16" autocapitalize="off" spellcheck="false" data-ph="user"></label>
      <label class="au-f"><i class="au-ic">${SVG.lock}</i><input name="password" type="password" autocomplete="new-password" maxlength="64" data-ph="pass"><button type="button" class="au-eye" tabindex="-1"></button></label>
      <label class="au-f"><i class="au-ic">${SVG.lock}</i><input name="password2" type="password" autocomplete="new-password" maxlength="64" data-ph="pass2"></label>
      <div class="au-ck"><label class="au-cklab"><input type="checkbox" name="terms"><b class="au-box">${SVG.check}</b></label><span class="au-tx"><span data-t="accept"></span> <button type="button" class="au-a" data-act="terms" data-t="terms"></button> <span data-t="and"></span> <button type="button" class="au-a" data-act="terms" data-t="privacy"></button></span></div>
      <p class="au-msg" role="alert" aria-live="assertive"></p>
      <button type="submit" class="au-btn purple"><span data-t="reg_b"></span></button>
    </form>
  </section>
</div></div>
<div class="au-banner"><span data-t="banner"></span></div>
<div class="au-check"><i class="au-spin"></i><span data-t="checking"></span><button type="button" class="au-btn blue small" data-act="retry" hidden><span data-t="retry"></span></button></div>
<div class="au-modal" hidden><div class="au-card"></div></div>
<div class="au-toast" role="status"></div>`;
document.body.appendChild(root);
const $ = (s, r = root) => r.querySelector(s), $$ = (s, r = root) => [...r.querySelectorAll(s)];

/* ───────── textos / idioma ───────── */
function paint() {
  $$('[data-t]').forEach(n => { n.textContent = T(n.dataset.t); }); $$('[data-ph]').forEach(n => { n.placeholder = T(n.dataset.ph); });
  $('.au-x').setAttribute('aria-label', T('close')); document.documentElement.lang = lang === 'en-US' ? 'en' : 'pt-BR';
  $$('.au-tabs button').forEach(b => { b.textContent = T('tab_' + b.dataset.tab); });
  $$('.au-langs button').forEach(b => b.classList.toggle('on', b.dataset.lang === lang));
  $$('.au-eye').forEach(setEye); $$('.au-msg').forEach(m => { m.textContent = ''; m.dataset.code = ''; });
}
const langs = $('.au-langs');
Object.entries(LANGS).forEach(([id, L], i) => {
  if (i) langs.appendChild(el('span', 'au-sep'));
  const b = el('button', 'au-lang', { type: 'button', title: L.code }); b.dataset.lang = id; b.innerHTML = `<img src="${L.flag}" alt="" draggable="false"><span>${L.code}</span>`;
  b.addEventListener('click', () => { lang = id; LS.set('sl.lang', id); paint(); }); langs.appendChild(b);
});

/* ───────── tamanho: 1 unidade (--u) = 1 pixel da arte de referência (1672 × 941) ───────── */
function size() {
  const w = innerWidth, h = innerHeight, portrait = w / h < 1.15;
  const u = portrait ? Math.max(.34, Math.min(.9, (w * .94) / 703)) : Math.max(.3, Math.min(w / 1672, h / 941));
  root.style.setProperty('--u', u.toFixed(4) + 'px'); root.classList.toggle('pt', portrait);
}
addEventListener('resize', size); addEventListener('orientationchange', size); size();

/* ───────── abas (celular em pé) ───────── */
function tab(w) { root.dataset.tab = w; $$('.au-tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === w)); }
$$('.au-tabs button').forEach(b => b.addEventListener('click', () => tab(b.dataset.tab))); tab('login');

/* ───────── olhinho da senha ───────── */
function setEye(b) { const i = b.parentNode.querySelector('input'), show = i.type === 'text'; b.innerHTML = show ? SVG.eye : SVG.eyeoff; b.setAttribute('aria-label', show ? T('hide') : T('show')); }
$$('.au-eye').forEach(b => b.addEventListener('click', () => {
  const i = b.parentNode.querySelector('input'); i.type = i.type === 'text' ? 'password' : 'text'; setEye(b);
  const reg = b.closest('[data-p="reg"]'); if (reg) { const p2 = reg.querySelector('[name=password2]'); p2.type = i.type; }
}));

/* ───────── mensagens ───────── */
const say = (panel, text) => { const m = $('.au-msg', panel); m.textContent = text || ''; if (text) { m.classList.remove('shake'); void m.offsetWidth; m.classList.add('shake'); } };
let toastT = 0; const toast = t => { const n = $('.au-toast'); n.textContent = t; n.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => n.classList.remove('on'), 3500); };
const busy = (panel, on) => { $$('button,input', panel).forEach(n => { if (!n.matches('.au-eye')) n.disabled = on; }); panel.classList.toggle('busy', on); };

/* ───────── janelas (código de recuperação, recuperar senha, termos) ───────── */
const modal = $('.au-modal'), card = $('.au-card');
function openModal(build) { card.innerHTML = ''; build(card); modal.hidden = false; const f = card.querySelector('input,button'); if (f) f.focus(); }
const closeModal = () => { modal.hidden = true; card.innerHTML = ''; };
modal.addEventListener('mousedown', e => { if (e.target === modal && !modal.dataset.lock) closeModal(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden && !modal.dataset.lock) closeModal(); });

function recoveryCard(code, then) {   // mostrado UMA vez: o jogador precisa confirmar
  modal.dataset.lock = '1';
  openModal(c => {
    c.append(el('h2', '', { textContent: T('rec_t') }), el('p', '', { textContent: T('rec_p') }));
    const code_ = el('div', 'au-code', { textContent: code }); c.append(code_);
    const cp = el('button', 'au-btn purple small', { type: 'button', innerHTML: '<span></span>' }); cp.firstChild.textContent = T('rec_copy');
    cp.addEventListener('click', async () => { try { await navigator.clipboard.writeText(code); cp.firstChild.textContent = T('rec_copied'); } catch (_) { const r = document.createRange(); r.selectNodeContents(code_); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } });
    const ok = el('button', 'au-btn blue small', { type: 'button', innerHTML: '<span></span>' }); ok.firstChild.textContent = T('rec_ok');
    ok.addEventListener('click', () => { delete modal.dataset.lock; closeModal(); then(); });
    const row = el('div', 'au-row'); row.append(cp, ok); c.append(row);
  });
}
function termsCard() {
  openModal(c => {
    c.append(el('h2', '', { textContent: T('terms_t') })); T('terms_x').forEach(x => c.append(el('p', '', { textContent: x })));
    const ok = el('button', 'au-btn blue small', { type: 'button', innerHTML: '<span></span>' }); ok.firstChild.textContent = T('ok'); ok.addEventListener('click', closeModal); c.append(ok);
  });
}
function recoverCard() {
  openModal(c => {
    c.append(el('h2', '', { textContent: T('rcv_t') }), el('p', '', { textContent: T('rcv_p') }));
    const f = el('form', 'au-rform', { noValidate: true }), mkf = (name, ph, type, ic, ac) => { const l = el('label', 'au-f'); l.innerHTML = `<i class="au-ic">${SVG[ic]}</i>`; const i = el('input', '', { name, type, placeholder: ph, autocomplete: ac, maxLength: name === 'recovery' ? 30 : 64 }); l.append(i); return l; };
    const msg = el('p', 'au-msg', { role: 'alert' });
    const ok = el('button', 'au-btn blue small', { type: 'submit', innerHTML: '<span></span>' }); ok.firstChild.textContent = T('rcv_b');
    const no = el('button', 'au-btn purple small', { type: 'button', innerHTML: '<span></span>' }); no.firstChild.textContent = T('cancel'); no.addEventListener('click', closeModal);
    const row = el('div', 'au-row'); row.append(no, ok);
    f.append(mkf('username', T('user'), 'text', 'user', 'username'), mkf('recovery', T('rcv_code'), 'text', 'lock', 'off'), mkf('password', T('rcv_new'), 'password', 'lock', 'new-password'), msg, row); c.append(f);
    const un = $('[name=username]', $('.au-login')); if (un && un.value) $('[name=username]', f).value = un.value;
    f.addEventListener('submit', async e => {
      e.preventDefault(); const v = n => f.elements[n].value.trim(), pw = f.elements.password.value;
      if (!v('username') || !v('recovery') || !pw) { msg.textContent = T('e_empty'); return; }
      if (pw.length < 6 || pw.length > 64) { msg.textContent = T('e_bad_pass'); return; }
      ok.disabled = no.disabled = true; msg.textContent = T('wait');
      try { const d = await A.recover({ name: v('username'), recovery: v('recovery'), password: pw, remember: true }); recoveryCard(d.recovery, enter); }
      catch (err) { msg.textContent = errText(err); ok.disabled = no.disabled = false; }
    });
  });
}

/* ───────── entrar / criar conta ───────── */
function enter() { root.classList.add('out'); setTimeout(() => location.reload(), 120); }   // recarrega: o jogo sobe com a conta
const loginForm = $('.au-login form'), regForm = $('.au-reg form');
loginForm.addEventListener('submit', async e => {
  e.preventDefault(); const p = $('.au-login'), f = loginForm.elements, name = f.username.value.trim(), pw = f.password.value;
  if (!name || !pw) return say(p, T('e_empty'));
  busy(p, true); say(p, T('wait'));
  try { await A.login({ name, password: pw, remember: f.remember.checked }); enter(); }
  catch (err) { busy(p, false); say(p, errText(err)); }
});
regForm.addEventListener('submit', async e => {
  e.preventDefault(); const p = $('.au-reg'), f = regForm.elements, name = f.username.value.trim(), pw = f.password.value;
  if (!name || !pw || !f.password2.value) return say(p, T('e_empty'));
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) return say(p, T('e_bad_name'));
  if (pw.length < 6 || pw.length > 64) return say(p, T('e_bad_pass'));
  if (pw !== f.password2.value) return say(p, T('e_mismatch'));
  if (!f.terms.checked) return say(p, T('e_terms'));
  busy(p, true); say(p, T('wait'));
  try { const d = await A.register({ name, password: pw, remember: true }); busy(p, false); say(p, ''); recoveryCard(d.recovery, enter); }
  catch (err) { busy(p, false); say(p, errText(err)); }
});
root.addEventListener('click', e => {
  const a = e.target.closest('[data-act]'); if (!a) return;
  if (a.dataset.act === 'terms') termsCard(); else if (a.dataset.act === 'recover') recoverCard(); else if (a.dataset.act === 'retry') verify();
});

/* ───────── fechar (X) ───────── */
$('.au-x').addEventListener('click', () => {
  try {
    const w = window;
    if (w.Capacitor && w.Capacitor.Plugins && w.Capacitor.Plugins.App && w.Capacitor.Plugins.App.exitApp) return w.Capacitor.Plugins.App.exitApp();   // app Android
    if (navigator.app && navigator.app.exitApp) return navigator.app.exitApp();
    if (w.electronAPI && w.electronAPI.quit) return w.electronAPI.quit();                                                                                    // app do Windows
    w.close();
  } catch (_) {}
  setTimeout(() => { if (!window.closed) toast(T('exit_web')); }, 250);   // navegador comum não deixa fechar a aba por script
});

/* ───────── porteiro: sem conta válida, o menu não aparece ───────── */
function show() { root.classList.remove('checking', 'hidden'); document.documentElement.classList.add('au-open'); }
function hide() { root.classList.add('hidden'); document.documentElement.classList.remove('au-open'); setTimeout(() => { root.remove(); }, 300); }
async function verify() {
  const chk = $('.au-check'); chk.classList.remove('fail'); $('[data-act=retry]').hidden = true; $('.au-spin').hidden = false;
  if (!A.user) { show(); return; }
  root.classList.add('checking'); show();
  const t = setTimeout(() => { if (root.isConnected && root.classList.contains('checking')) hide(); }, 7000);   // servidor lento: abre com a conta salva
  const u = await A.init(); clearTimeout(t);
  if (u) hide(); else { root.classList.remove('checking'); }
}
paint(); verify();
window.SLLogin = { lang: () => lang, setLang: id => { if (LANGS[id]) { lang = id; LS.set('sl.lang', id); paint(); } }, LANGS };
})();
