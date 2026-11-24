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
  const box = el('div', 'cg-box'), h = el('div', 'cg-h', { textContent: 'GERADOR DE CÓDIGOS' }), x = el('button', 'cg-x', { type: 'button', textContent: '✕', ariaLabel: 'Fechar' });
  const fld = (lbl, ph, num) => { const w = el('label', 'cg-f'), i = el('input', 'cg-i', { type: num ? 'number' : 'text', placeholder: ph, min: 0, inputMode: num ? 'numeric' : 'text', autocomplete: 'off' }); if (!num) i.maxLength = 32; w.append(el('span', '', { textContent: lbl }), i); ['keydown', 'keyup'].forEach(n => i.addEventListener(n, e => e.stopPropagation())); return [w, i]; };
  const [w0, code] = fld('Código (vazio = aleatório)', 'EX: NATAL2026'), [w1, gems] = fld('💎 Diamantes', '0', 1), [w2, gold] = fld('🪙 Moedas', '0', 1), [w3, xp] = fld('⭐ XP', '0', 1), [w4, max] = fld('Usos máximos (0 = ilimitado)', '0', 1);
  const gen = el('button', 'cg-go', { type: 'button', textContent: 'GERAR CÓDIGO' }), out = el('div', 'cg-out'), list = el('div', 'cg-list');
  const form = el('div', 'cg-form'); const g2 = el('div', 'cg-g2'); g2.append(w1, w2, w3, w4); form.append(w0, g2, gen, out);
  const side = el('div', 'cg-side'); side.append(el('div', 'cg-sh', { textContent: 'Códigos criados' }), list);
  box.append(h, x, form, side); p.append(box);
  const say = (t, ok) => { out.textContent = t; out.className = 'cg-out ' + (ok ? 'ok' : 'bad'); };
  const fmt = c => [c.gems && c.gems + '💎', c.gold && c.gold + '🪙', c.xp && c.xp + '⭐'].filter(Boolean).join(' ') + ' · ' + c.used + '/' + (c.maxUses || '∞') + ' usos';
  const load = async () => { try { const r = await svc.codeList(); list.textContent = ''; if (!r.codes.length) list.append(el('div', 'cg-empty', { textContent: 'Nenhum código ainda.' }));
    r.codes.forEach(c => { const row = el('div', 'cg-row'), t = el('div', 'cg-t'), d = el('button', 'cg-d', { type: 'button', textContent: '🗑', title: 'Apagar' });
      t.append(el('b', '', { textContent: c.code }), el('small', '', { textContent: fmt(c) + (c.by ? ' · ' + c.by : '') }));
      d.addEventListener('click', async () => { try { await svc.codeDel(c.code); load(); } catch (e) { say(e.message, false); } }); row.append(t, d); list.append(row); }); }
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
