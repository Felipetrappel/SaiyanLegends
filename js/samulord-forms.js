/* Transformações do SamuLord (compradas com moedas). Cada forma troca o cabelo (folha própria assets/characters/samulord/formN.png) e dá bônus.
   Só vale para o SamuLord: Z (PC) / botão TF (celular) assume a forma escolhida; Z de novo volta ao normal. Dura 25 s, custa 30 Ki. */
(() => {
'use strict';
const SM = SL.SAMULORD; if (!SM) return;
const DEF = [   // id, nome, preço, dano×, velocidade×, cor da aura, tamanho do sprite parado (da folha)
  ['ssj',   'Super Saiyajin',          500,   1.25, 1.05, '#ffe45a', 24, 54],
  ['ssj2',  'Super Saiyajin 2',        900,   1.35, 1.08, '#ffd23a', 26, 55],
  ['ssj3',  'Super Saiyajin 3',        1500,  1.50, 1.10, '#ffc21a', 35, 55],
  ['ssj4',  'Super Saiyajin 4',        2500,  1.65, 1.12, '#ff3b4a', 32, 55],
  ['ui',    'Instinto Superior',       4000,  1.85, 1.18, '#dfe8ff', 39, 55],
  ['ssg',   'Super Saiyajin God',      6000,  2.00, 1.20, '#ff4f7e', 24, 54],
  ['ssb',   'Super Saiyajin Blue',     8500,  2.20, 1.22, '#35e6ff', 24, 54],
  ['ssbe',  'Blue Evoluído',           12000, 2.45, 1.25, '#2aa8ff', 26, 55],
  ['orange','Super Saiyajin Laranja',  16000, 2.70, 1.28, '#ff8a3a', 28, 56]
];
const base = SM.frames.length;
const FORMS = DEF.map(([id, name, price, dmg, speed, aura, w, h], i) => {
  SM.frames.push({ x: i * 40, y: 520, w, h, ax: Math.floor(w / 2), ay: h });   // quadro "parado" da forma (cada folha tem só o próprio no seu lugar)
  return { id, name, price, dmg, speed, aura, n: i + 1, idle: base + i, img: Object.assign(new Image(), { src: `assets/characters/samulord/form${i + 1}.png` }) };
});
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
