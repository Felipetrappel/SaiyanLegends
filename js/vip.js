/* SISTEMA VIP — estado do VIP do jogador (o servidor guarda a validade na conta e a cor do nome). Benefícios:
 *  tag <VIP> + cor do nome · +50% XP · dobro de moedas ganhas · sem tempo de espera para voltar à partida (renascimento instantâneo). */
(() => {
'use strict';
const svc = () => window.SaiyanGame && SaiyanGame.service;
const DEF_COLOR = '#ffd23a';
let st = { until: 0, color: DEF_COLOR, off: 0 };   // off = diferença entre o relógio do servidor e o do aparelho
const set = v => { if (!v) return; st = { until: +v.until || 0, color: v.color || DEF_COLOR, off: (+v.now || Date.now()) - Date.now() }; try { window.dispatchEvent(new CustomEvent('sl-vip', { detail: st })); } catch (_) {} };
const now = () => Date.now() + st.off;
const V = {
  DEF_COLOR,
  get until() { return st.until; },
  get color() { return st.color || DEF_COLOR; },
  active() { return st.until > now(); },
  /* cor do nome se for VIP, senão '' (usada para desenhar o próprio jogador) */
  mine() { return V.active() ? V.color : ''; },
  xpMul() { return V.active() ? 1.5 : 1; },
  goldMul() { return V.active() ? 2 : 1; },
  remaining() { return Math.max(0, st.until - now()); },
  /* "4 dias, 3 horas e 4 minutos" */
  fmt(ms = V.remaining()) {
    const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60), mi = m % 60, p = (n, a, b) => n + ' ' + (n === 1 ? a : b), out = [];
    if (d) out.push(p(d, 'dia', 'dias')); if (d || h) out.push(p(h, 'hora', 'horas')); out.push(p(mi, 'minuto', 'minutos'));
    return out.length > 1 ? out.slice(0, -1).join(', ') + ' e ' + out[out.length - 1] : out[0];
  },
  set,
  async refresh() { try { const s = svc(); if (!s) return; await s.ready; if (s.mode === 'online') set(await s.vipInfo()); } catch (_) {} }
};
window.SLVip = V;
const boot = () => { const s = svc(); if (!s) return setTimeout(boot, 300); s.ready.then(() => { if (s.mode === 'online') { if (s.myVipInfo) set(s.myVipInfo); V.refresh(); } }); s.on && s.on('vip', set); s.on && s.on('status', () => { if (s.myVipInfo) set(s.myVipInfo); }); };
boot(); setInterval(V.refresh, 5 * 60000);
})();
