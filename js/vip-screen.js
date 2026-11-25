/* PACOTE VIP — aberto pelo ícone da coroa (menu principal). A arte (assets/ui/vip.png) traz o painel; por cima ficam os botões VIVOS e o tempo restante real.
 * Compra: 2 diamantes → +7 dias de VIP (soma se já for VIP). "Editar cor do nome" só abre para VIPs. */
(() => {
'use strict';
const M = SaiyanMenu, S = M.screens, svc = SaiyanGame.service, W = 1536, H = 1024, PRICE = 2;
const el = (t, c = '', p = {}) => Object.assign(document.createElement(t), { className: c, ...p });
const pos = (n, r) => { n.style.left = r[0] / W * 100 + '%'; n.style.top = r[1] / H * 100 + '%'; n.style.width = r[2] / W * 100 + '%'; n.style.height = r[3] / H * 100 + '%'; };
const COLORS = ['#ffd23a', '#ff5a5a', '#ff9f43', '#7dff6a', '#35e0c8', '#4db8ff', '#b07dff', '#ff7ad9', '#ffffff'];
S.register('vip', { title: 'Pacote VIP', sticky: true, noFocus: true, build(p) {
  p.classList.add('shopwrap', 'vipwrap');
  const box = el('div', 'vp-box'), img = el('img', 'vp-art', { src: 'assets/ui/vip.png', alt: '', draggable: false });
  const x = el('button', 'vp-hs', { type: 'button', ariaLabel: 'Fechar' }), buy = el('button', 'vp-hs', { type: 'button', ariaLabel: 'Comprar' }), ed = el('button', 'vp-hs', { type: 'button', ariaLabel: 'Editar cor do nome' });
  const dur = el('div', 'vp-dur'), l1 = el('b', '', { textContent: 'Duração de VIP' }), l2 = el('span', ''); dur.append(l1, l2);
  const msg = el('div', 'vp-msg');
  pos(x, [1340, 120, 125, 125]); pos(buy, [1095, 828, 320, 108]); pos(ed, [130, 835, 530, 98]); pos(dur, [925, 244, 370, 86]); pos(msg, [130, 940, 1290, 64]);
  box.append(img, dur, x, buy, ed, msg);
  /* seletor de cor */
  const pick = el('div', 'vp-pick'); pick.hidden = true;
  const sw = el('div', 'vp-sw'), custom = el('input', 'vp-custom', { type: 'color', value: '#ffd23a', ariaLabel: 'Cor personalizada' }), prev = el('div', 'vp-prev'), ok = el('button', 'vp-ok', { type: 'button', textContent: 'SALVAR COR' });
  pick.append(el('div', 'vp-pt', { textContent: 'Cor do seu nome' }), prev, sw, custom, ok);
  COLORS.forEach(c => { const b = el('button', 'vp-c', { type: 'button', ariaLabel: c }); b.style.background = c; b.addEventListener('click', () => { custom.value = c; draw(); }); sw.append(b); });
  p.append(box, pick);
  const say = (t, ok2) => { msg.textContent = t; msg.className = 'vp-msg ' + (ok2 ? 'ok' : 'bad'); };
  const draw = () => { prev.textContent = '<VIP> ' + (svc.myName || 'Seu nome'); prev.style.color = custom.value; };
  const refresh = () => { const v = SLVip.active(); l2.textContent = v ? SLVip.fmt() : 'Você não é VIP'; l2.className = v ? 'on' : ''; };
  refresh(); const iv = setInterval(refresh, 15000); const onv = () => refresh(); window.addEventListener('sl-vip', onv); SLVip.refresh();
  let busy = false;
  buy.addEventListener('click', async () => {
    if (busy) return; busy = true;
    try {
      if (svc.mode !== 'online') throw new Error('Entre online para comprar o VIP.');
      const P = SL.Profile; if (!P || !P.spend('gems', PRICE)) throw new Error('Diamantes insuficientes (precisa de ' + PRICE + ').');
      try { SLVip.set(await svc.vipBuy()); say('VIP ativado! Aproveite.', true); refresh(); } catch (e) { P.addCoins('gems', PRICE); throw e; }
    } catch (e) { say(e.message || 'Não foi possível comprar.', false); }
    busy = false;
  });
  ed.addEventListener('click', () => { if (!SLVip.active()) { say('Só VIPs podem editar a cor do nome.', false); return; } custom.value = SLVip.color; draw(); pick.hidden = false; });
  custom.addEventListener('input', draw);
  ok.addEventListener('click', async () => { try { SLVip.set(await svc.vipColor(custom.value)); pick.hidden = true; say('Cor do nome atualizada!', true); } catch (e) { say(e.message || 'Erro ao salvar a cor.', false); } });
  pick.addEventListener('pointerdown', e => { if (e.target === pick) pick.hidden = true; });
  x.addEventListener('click', () => S.close());
  p.addEventListener('pointerdown', e => { if (e.target === p) S.close(); });
  return () => { clearInterval(iv); window.removeEventListener('sl-vip', onv); };
} });
})();
