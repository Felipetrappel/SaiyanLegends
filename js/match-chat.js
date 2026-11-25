/* Chat durante a partida: fundo transparente, botão 💬 para ocultar/mostrar (a escolha fica salva). */
(() => {
'use strict';
const el = (t, c = '', p = {}) => Object.assign(document.createElement(t), { className: c, ...p });
const KEY = 'sl_matchchat_hidden';
const rd = () => { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } };
const wr = v => { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) {} };
window.SLMatchChat = { mount(p) {
  const svc = SaiyanGame.service, box = el('div', 'mc-box'), log = el('div', 'mc-log'), row = el('div', 'mc-row'), err = el('div', 'mc-err'),
    inp = el('input', 'mc-in', { type: 'text', maxLength: 120, placeholder: 'Digite para falar..', autocomplete: 'off', enterKeyHint: 'send' }), go = el('button', 'mc-send', { type: 'button', textContent: '➤' }),
    tg = el('button', 'mc-tg', { type: 'button', title: 'Mostrar/ocultar chat', 'aria-label': 'Mostrar ou ocultar o chat', textContent: '💬' });
  row.append(inp, go); box.append(log, row, err); p.append(box, tg);
  const apply = h => { box.classList.toggle('off', h); tg.classList.toggle('off', h); };
  let hidden = rd(); apply(hidden); tg.addEventListener('click', e => { e.currentTarget.blur(); hidden = !hidden; wr(hidden); apply(hidden); if (hidden) inp.blur(); });
  const draw = () => { log.replaceChildren(...(SL.Social ? SL.Social.log : []).slice(-6).map(m => { const r = el('div', 'mc-msg'); const tc = window.SLTags && SLTags.chip(m.tag); if (tc) r.append(tc); const v = window.SLTags && SLTags.vipChip(m.vip); if (v) r.append(v); r.append(SLTags.vipName(el('b', '', { textContent: (m.name || '?') + ': ' }), m.vip), document.createTextNode(m.text)); return r; })); log.scrollTop = log.scrollHeight; };
  const send = async () => { const t = inp.value.replace(/\s+/g, ' ').trim(); if (!t) return; err.textContent = ''; try { await SL.Social.send(t); inp.value = ''; } catch (e) { err.textContent = e.message || 'Não foi possível enviar.'; } };
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); send(); } else if (e.key === 'Escape') inp.blur(); });
  inp.addEventListener('keyup', e => e.stopPropagation()); inp.addEventListener('pointerdown', e => e.stopPropagation()); go.addEventListener('click', send);
  box.addEventListener('pointerdown', e => e.stopPropagation());
  svc.on('chat', draw); draw();
  return () => { svc.off('chat', draw); box.remove(); tg.remove(); };
} };
})();
