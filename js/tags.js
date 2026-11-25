/* Tags da equipe: <DEV> preto · <ADM> laranja · <GM> amarelo · <CM> verde. Quem tem tag é decidido pelo SERVIDOR (código secreto da equipe). */
(() => {
'use strict';
const T = {
  DEV: { label: '<DEV>', bg: '#000000', fg: '#ffffff', bd: '#8a8a8a', name: 'Desenvolvedor' },
  ADM: { label: '<ADM>', bg: '#ff8a00', fg: '#1a0a00', bd: '#ffc27a', name: 'Administrador' },
  GM:  { label: '<GM>',  bg: '#ffd60a', fg: '#2a2000', bd: '#fff2a0', name: 'Game Master' },
  YT:  { label: '<YT>',  bg: '#e11d1d', fg: '#ffffff', bd: '#ff9a9a', name: 'YouTuber' },
  CM:  { label: '<CM>',  bg: '#22c55e', fg: '#04210f', bd: '#9af0b8', name: 'Community Manager' }
};
const IMG = {}; for (const k in T) { const i = new Image(); i.src = 'assets/tags/' + k.toLowerCase() + '.png'; IMG[k] = i; }
const get = t => T[String(t || '').toUpperCase()] || null;
/* <span class="sl-tag"> para colocar ao lado do nome (null se não houver tag) */
const chip = t => { const d = get(t); if (!d) return null; const k = String(t).toUpperCase(), s = document.createElement('img'); s.className = 'sl-tag'; s.src = 'assets/tags/' + k.toLowerCase() + '.png'; s.alt = d.label; s.title = d.name; s.draggable = false; return s; };
/* desenha "<TAG> Nome" centralizado num canvas; devolve a largura total */
function drawName(ctx, tag, name, x, y, o = {}) {
  const d = get(tag), fs = o.size || 12, pad = Math.round(fs * .35); ctx.save(); ctx.textBaseline = 'alphabetic'; ctx.font = `bold ${fs}px system-ui,sans-serif`;
  const nw = ctx.measureText(name).width, im = d && IMG[String(tag).toUpperCase()], ok = im && im.complete && im.naturalWidth; let tw = 0, bh = 0, bw = 0;
  if (d) { if (ok) { bh = Math.round(fs * 1.7); bw = Math.round(bh * im.naturalWidth / im.naturalHeight); tw = bw + pad; } else { ctx.font = `800 ${Math.round(fs * .8)}px system-ui,sans-serif`; tw = ctx.measureText(d.label).width + pad * 2 + 4; } }
  const vw = o.vip ? (ctx.font = `800 ${Math.round(fs * .85)}px system-ui,sans-serif`, ctx.measureText('<VIP>').width + pad * 1.5) : 0; ctx.font = `bold ${fs}px system-ui,sans-serif`;
  let sx = x - (nw + tw + vw) / 2; ctx.textAlign = 'left';
  if (d && ok) { ctx.imageSmoothingEnabled = true; ctx.drawImage(im, sx, y - bh * .78, bw, bh); sx += tw; }
  else if (d) { const h = Math.round(fs * 1.05); ctx.fillStyle = d.bg; ctx.strokeStyle = d.bd; ctx.lineWidth = Math.max(1, fs / 10); ctx.beginPath(); (ctx.roundRect || ctx.rect).call(ctx, sx, y - h + 2, tw - 4, h, 3); ctx.fill(); ctx.stroke(); ctx.fillStyle = d.fg; ctx.font = `800 ${Math.round(fs * .8)}px system-ui,sans-serif`; ctx.fillText(d.label, sx + pad, y - 1); sx += tw; }
  if (o.vip) { ctx.font = `800 ${Math.round(fs * .85)}px system-ui,sans-serif`; ctx.lineWidth = Math.max(2, o.stroke || 0, fs / 5); ctx.strokeStyle = '#000b'; ctx.strokeText('<VIP>', sx, y); ctx.fillStyle = '#ffd23a'; ctx.fillText('<VIP>', sx, y); sx += vw; }
  ctx.font = `bold ${fs}px system-ui,sans-serif`; ctx.lineWidth = o.stroke || 0; if (o.stroke) { ctx.strokeStyle = '#000b'; ctx.strokeText(name, sx, y); } ctx.fillStyle = o.vip || o.color || '#fff'; ctx.fillText(name, sx, y); ctx.restore(); return nw + tw + vw;
}
/* <VIP> dourado ao lado do nome (null se não for VIP) + aplica a cor do nome no elemento dado */
const vipChip = v => { if (!v) return null; const s = document.createElement('span'); s.className = 'sl-vip'; s.textContent = '<VIP>'; return s; };
const vipName = (el, v) => { if (v) el.style.color = v; return el; };
window.SLTags = { TAGS: T, get, chip, drawName, vipChip, vipName };
})();
