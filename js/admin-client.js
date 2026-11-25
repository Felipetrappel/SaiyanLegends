/* Recebe do servidor o que um <DEV>/<ADM> deu pelo chat (/moedas, /diamantes, /nivel) e aplica no perfil. A permissão é checada no SERVIDOR. */
(() => {
'use strict';
const P = window.SL && SL.Profile, svc = window.SaiyanGame && SaiyanGame.service; if (!P || !svc || !svc.on) return;
const CAP = 1e9;
function toast(t) { const d = document.createElement('div'); d.textContent = t; d.style.cssText = 'position:fixed;left:50%;top:14%;transform:translateX(-50%);z-index:100001;background:#1a0a3a;color:#ffe27a;border:2px solid #ffd040;border-radius:12px;padding:10px 18px;font:800 16px Upheaval,system-ui,sans-serif;box-shadow:0 4px 18px #000a;transition:opacity .5s;pointer-events:none'; document.body.append(d); setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 600); }, 3500); }
svc.on('grant', g => {
  const n = [];
  if (g.gold) { P.gold = Math.max(0, Math.min(CAP, Math.floor(P.gold + g.gold))); n.push((g.gold > 0 ? '+' : '') + g.gold + ' moedas'); }
  if (g.gems) { P.gems = Math.max(0, Math.min(CAP, Math.floor(P.gems + g.gems))); n.push((g.gems > 0 ? '+' : '') + g.gems + ' diamantes'); }
  if (g.level >= 0 || g.dlevel) { const L = g.level >= 0 ? g.level : Math.max(0, Math.min(999, P.level + g.dlevel)); P.xp = 100 * L * L; n.push('nível ' + L); }
  if (g.xp) { P.xp = Math.max(0, Math.min(CAP, Math.floor(P.xp + g.xp))); n.push('+' + g.xp + ' XP'); }
  try { P.save(); ['coins', 'xp'].forEach(w => P._emit(w)); } catch (_) {}
  if (n.length) toast((g.src || 'Administração') + ': ' + n.join(', '));
});
})();
