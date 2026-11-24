/* SISTEMA DE CÓDIGOS — aberto pelo ícone do ingresso (menu principal). A arte (assets/ui/codes.jpg) traz o painel; por cima ficam o campo de texto e os botões VIVOS.
 * O servidor valida o código, entrega a recompensa e impede o resgate repetido na mesma conta (cloudflare/worker.js → redeem). */
(() => {
'use strict';
const M = SaiyanMenu, S = M.screens, svc = SaiyanGame.service, W = 1870, H = 841;
const el = (t, c = '', p = {}) => Object.assign(document.createElement(t), { className: c, ...p });
const pos = (n, r) => { n.style.left = r[0] / W * 100 + '%'; n.style.top = r[1] / H * 100 + '%'; n.style.width = r[2] / W * 100 + '%'; n.style.height = r[3] / H * 100 + '%'; };
S.register('codes', { title: 'Códigos', sticky: true, noFocus: true, build(p) {
  p.classList.add('shopwrap', 'codeswrap');
  const box = el('div', 'cd-box'), img = el('img', 'cd-art', { src: 'assets/ui/codes.jpg', alt: '', draggable: false });
  const x = el('button', 'cd-hs', { type: 'button', ariaLabel: 'Fechar' }), dc = el('button', 'cd-hs', { type: 'button', ariaLabel: 'Discord' }), send = el('button', 'cd-hs', { type: 'button', ariaLabel: 'Enviar' });
  const inp = el('input', 'cd-in', { type: 'text', maxLength: 32, autocomplete: 'off', autocapitalize: 'characters', spellcheck: false, enterKeyHint: 'send', ariaLabel: 'Código', placeholder: 'Digite o código aqui...' }), msg = el('div', 'cd-msg');
  pos(x, [1696, 60, 125, 125]); pos(dc, [950, 272, 190, 52]); pos(send, [630, 612, 645, 150]); pos(inp, [545, 456, 1000, 118]); pos(msg, [310, 770, 1255, 60]);
  box.append(img, x, dc, inp, send, msg); p.append(box);
  /* botão do gerador: só é criado para DEV/ADM (os demais jogadores nem têm o elemento) */
  let gb = null; const sync = () => { const ok = window.SLCodeGen && SLCodeGen.can(); if (ok && !gb) { gb = el('button', 'cd-gen', { type: 'button', textContent: '⚙ GERADOR DE CÓDIGOS' }); gb.addEventListener('click', () => SLCodeGen.open()); p.append(gb); } else if (!ok && gb) { gb.remove(); gb = null; } };
  sync(); const offS = svc.on && svc.on('status', sync);
  const say = (t, ok) => { msg.textContent = t; msg.className = 'cd-msg ' + (ok ? 'ok' : 'bad'); };
  let busy = false;
  const go = async () => {
    if (busy) return; const c = inp.value.trim(); if (!c) { say('Digite um código.', false); return; }
    busy = true; send.classList.add('busy'); say('Verificando…', true);
    try { const r = await svc.redeem(c); const g = r.reward || {}, a = []; if (g.gold) a.push(g.gold + ' moedas'); if (g.gems) a.push(g.gems + ' diamantes'); if (g.xp) a.push(g.xp + ' XP'); say('Código resgatado! ' + a.join(' · '), true); inp.value = ''; }
    catch (e) { say(e.message || 'Não foi possível resgatar.', false); }
    busy = false; send.classList.remove('busy');
  };
  x.addEventListener('click', () => S.close()); send.addEventListener('click', go);
  dc.addEventListener('click', () => window.open('https://discord.gg/zpKjkbSCJ2', '_blank', 'noopener'));
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); go(); } else if (e.key === 'Escape') S.close(); }); inp.addEventListener('keyup', e => e.stopPropagation());
  p.addEventListener('pointerdown', e => { if (e.target === p) S.close(); });
  setTimeout(() => { try { inp.focus(); } catch (_) {} }, 80);
  return () => { try { offS && offS(); } catch (_) {} };
} });
})();
