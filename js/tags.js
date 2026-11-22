/* Tags da equipe: <DEV> preto · <ADM> laranja · <GM> amarelo · <CM> verde. Quem tem tag é decidido pelo SERVIDOR (código secreto da equipe). */
(() => {
'use strict';
const T = {
  DEV: { label: '<DEV>', bg: '#000000', fg: '#ffffff', bd: '#8a8a8a', name: 'Desenvolvedor' },
  ADM: { label: '<ADM>', bg: '#ff8a00', fg: '#1a0a00', bd: '#ffc27a', name: 'Administrador' },
  GM:  { label: '<GM>',  bg: '#ffd60a', fg: '#2a2000', bd: '#fff2a0', name: 'Game Master' },
  CM:  { label: '<CM>',  bg: '#22c55e', fg: '#04210f', bd: '#9af0b8', name: 'Community Manager' }
};
const get = t => T[String(t || '').toUpperCase()] || null;
/* <span class="sl-tag"> para colocar ao lado do nome (null se não houver tag) */
const chip = t => { const d = get(t); if (!d) return null; const s = document.createElement('span'); s.className = 'sl-tag'; s.textContent = d.label; s.title = d.name; s.style.cssText = `background:${d.bg};color:${d.fg};border-color:${d.bd}`; return s; };
/* desenha "<TAG> Nome" centralizado num canvas; devolve a largura total */
function drawName(ctx, tag, name, x, y, o = {}) {
  const d = get(tag), fs = o.size || 12, pad = Math.round(fs * .35); ctx.save(); ctx.textBaseline = 'alphabetic'; ctx.font = `bold ${fs}px system-ui,sans-serif`;
  const nw = ctx.measureText(name).width; let tw = 0; if (d) { ctx.font = `800 ${Math.round(fs * .8)}px system-ui,sans-serif`; tw = ctx.measureText(d.label).width + pad * 2 + 4; }
  let sx = x - (nw + tw) / 2; ctx.textAlign = 'left';
  if (d) { const h = Math.round(fs * 1.05); ctx.fillStyle = d.bg; ctx.strokeStyle = d.bd; ctx.lineWidth = Math.max(1, fs / 10); ctx.beginPath(); (ctx.roundRect || ctx.rect).call(ctx, sx, y - h + 2, tw - 4, h, 3); ctx.fill(); ctx.stroke(); ctx.fillStyle = d.fg; ctx.font = `800 ${Math.round(fs * .8)}px system-ui,sans-serif`; ctx.fillText(d.label, sx + pad, y - 1); sx += tw; }
  ctx.font = `bold ${fs}px system-ui,sans-serif`; ctx.lineWidth = o.stroke || 0; if (o.stroke) { ctx.strokeStyle = '#000b'; ctx.strokeText(name, sx, y); } ctx.fillStyle = o.color || '#fff'; ctx.fillText(name, sx, y); ctx.restore(); return nw + tw;
}
window.SLTags = { TAGS: T, get, chip, drawName };
})();
