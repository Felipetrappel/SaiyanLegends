/* Transformações do SamuLord (compradas com moedas). A forma troca o cabelo (folha assets/characters/samulord/form1.png) e dá bônus.
   Só vale para o SamuLord: Z (PC) / botão TF (celular) assume a forma escolhida; Z de novo volta ao normal. Dura 25 s, custa 30 Ki. */
(() => {
'use strict';
const SM = SL.SAMULORD; if (!SM) return;
const DEF = [   // criada pelo jogo: cabelo violeta elétrico (a folha form1.png recolore o cabelo do SamuLord em todas as animações)
  ['violeta', 'Espectro Violeta', 2500, 1.7, 1.15, '#b36bff']
];
const FORMS = DEF.map(([id, name, price, dmg, speed, aura], i) => ({ id, name, price, dmg, speed, aura, n: i + 1, idle: SM.anims.idle.f[0], img: Object.assign(new Image(), { src: `assets/characters/samulord/form${i + 1}.png` }) }));
const P = SL.Profile, byId = id => FORMS.find(f => f.id === id) || null;
const own = () => (P.forms ||= []);
SL.Forms = {
  list: FORMS, byId, charId: 'samulord',
  owned: id => own().includes('f:' + id),
  buy(id) { const f = byId(id); if (!f) return 'none'; if (this.owned(id)) return 'owned'; if (P.gold < f.price) return 'poor'; P.gold -= f.price; own().push('f:' + id); if (!this.sel()) this.select(id); else { P.save(); } P._emit && (P._emit('coins'), P._emit('buy')); return 'ok'; },
  sel() { const e = own().find(x => x.startsWith('sel:')); const id = e && e.slice(4); return id && this.owned(id) ? byId(id) : null; },
  select(id) { if (!this.owned(id)) return false; P.forms = own().filter(x => !x.startsWith('sel:')); P.forms.push('sel:' + id); P.save(); P._emit && P._emit('select'); return true; },
  current() { return this.sel(); },
  hint(msg) { const d = document.createElement('div'); d.textContent = msg; d.style.cssText = 'position:fixed;left:50%;top:22%;transform:translateX(-50%);z-index:100001;background:#12052aee;border:2px solid #f3c744;color:#fff;padding:8px 14px;border-radius:10px;font-size:14px;pointer-events:none;text-align:center;max-width:80vw'; document.body.append(d); setTimeout(() => d.remove(), 2200); }
};
})();
