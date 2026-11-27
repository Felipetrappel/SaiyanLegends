/* GERADOR DE CÓDIGOS — somente DEV/ADM. A interface só existe para quem tem a tag (o botão nem é criado para os demais) e o SERVIDOR revalida a tag em cada operação (worker.js → codeGen/codeList/codeDel). */
(() => {
'use strict';
const M = SaiyanMenu, S = M.screens, svc = SaiyanGame.service;
const el = (t, c = '', p = {}) => Object.assign(document.createElement(t), { className: c, ...p });
const can = () => !!svc.canGenCodes;
window.SLCodeGen = { can, open: () => { if (can()) S.open('codegen'); } };
S.register('codegen', { title: 'Gerador de Códigos', sticky: true, noFocus: true, build(p) {
  p.classList.add('shopwrap', 'cgwrap');
  if (!can()) { setTimeout(() => S.close(), 0); return () => {}; }
  const W = 1672, H = 941, pos = (n, r) => { n.style.left = r[0] / W * 100 + '%'; n.style.top = r[1] / H * 100 + '%'; n.style.width = r[2] / W * 100 + '%'; n.style.height = r[3] / H * 100 + '%'; };
  const box = el('div', 'cg-box'), img = el('img', 'cg-art', { src: 'assets/ui/codegen.png', alt: '', draggable: false });
  const x = el('button', 'cg-hs', { type: 'button', ariaLabel: 'Fechar' }), gen = el('button', 'cg-hs', { type: 'button', ariaLabel: 'Gerar código' });
  const inp = (num, ph, r) => { const i = el('input', 'cg-i', { type: num ? 'number' : 'text', placeholder: ph, min: 0, inputMode: num ? 'numeric' : 'text', autocomplete: 'off' }); if (!num) i.maxLength = 32; ['keydown', 'keyup'].forEach(n => i.addEventListener(n, e => e.stopPropagation())); pos(i, r); return i; };
  const code = inp(0, 'EX: NATAL2026', [92, 222, 780, 78]), gems = inp(1, '0', [196, 429, 440, 64]), gold = inp(1, '0', [812, 429, 440, 64]), xp = inp(1, '0', [196, 616, 440, 64]), max = inp(1, '0', [840, 616, 436, 64]);
  const list = el('div', 'cg-list'), out = el('div', 'cg-out');
  pos(x, [1550, 30, 100, 100]); pos(gen, [262, 740, 1150, 140]); pos(list, [1082, 236, 515, 76]); pos(out, [150, 890, 1370, 46]);
  box.append(img, list, code, gems, gold, xp, max, gen, x, out); p.append(box);
  const say = (t, ok) => { out.textContent = t; out.className = 'cg-out ' + (ok ? 'ok' : 'bad'); };
  const fmt = c => [c.gems && c.gems + '💎', c.gold && c.gold + '🪙', c.xp && c.xp + '⭐'].filter(Boolean).join(' ') + ' · ' + c.used + '/' + (c.maxUses || '∞');
  const load = async () => { try { const r = await svc.codeList(); list.textContent = ''; if (!r.codes.length) list.append(el('div', 'cg-empty', { textContent: 'NENHUM CÓDIGO AINDA.' }));
    r.codes.forEach(c => { const row = el('div', 'cg-row'), d = el('button', 'cg-d', { type: 'button', textContent: '🗑', title: 'Apagar' });
      row.append(el('b', '', { textContent: c.code }), el('small', '', { textContent: fmt(c) }), d);
      d.addEventListener('click', async () => { try { await svc.codeDel(c.code); load(); } catch (e) { say(e.message, false); } }); list.append(row); }); }
    catch (e) { list.textContent = e.message || 'Erro ao listar.'; } };
  let busy = false;
  gen.addEventListener('click', async () => { if (busy) return; busy = true; gen.disabled = true;
    try { const r = await svc.codeGen({ code: code.value, gems: +gems.value || 0, gold: +gold.value || 0, xp: +xp.value || 0, maxUses: +max.value || 0 });
      say('Criado: ' + r.code, true); try { await navigator.clipboard.writeText(r.code); out.textContent += ' (copiado)'; } catch (_) {} code.value = ''; load(); }
    catch (e) { say(e.message || 'Erro ao gerar.', false); } busy = false; gen.disabled = false; });
  x.addEventListener('click', () => S.close());
  const off = svc.on && svc.on('status', () => { if (!can()) S.close(); });
  load();
  return () => { try { off && off(); } catch (_) {} };
} });
})();
