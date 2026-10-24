/* Personagens jogáveis + perfil do jogador (selecionado / desbloqueados). Hoje só existe o STREET, que já vem
   desbloqueado e selecionado. Para um novo personagem: registre-o em Characters.all (com defaultUnlocked e price). */
(() => {
'use strict';
const S = SL.STREET, pending = {};
const all = {};
if (S) all.street = { ...S, price: 0, defaultUnlocked: true, img: Object.assign(new Image(), { src: S.sheet }) };   // pré-carrega o sheet (para trocar o preço/bloqueio, edite price e defaultUnlocked)
const DEFAULT = Object.keys(all)[0];   // personagem padrão = o primeiro disponível
const KEY = 'sl.profile';
const Profile = {
  selected: DEFAULT, unlocked: [DEFAULT],
  isUnlocked(id) { return !!all[id] && (all[id].defaultUnlocked || this.unlocked.includes(id)); },
  select(id) { if (!this.isUnlocked(id)) return false; this.selected = id; this.save(); return true; },
  save() { try { localStorage.setItem(KEY, JSON.stringify({ selected: this.selected, unlocked: this.unlocked })); } catch (e) {} },
  load() { try { const d = JSON.parse(localStorage.getItem(KEY) || '{}'); if (Array.isArray(d.unlocked)) this.unlocked = d.unlocked.filter(id => all[id]);   // ignora ids de personagens que não existem mais
    if (d.selected && this.isUnlocked(d.selected)) this.selected = d.selected; } catch (e) {} }
};
Profile.load();
const get = id => all[id] || pending[id] || all[DEFAULT];
const playable = id => !!(all[id] || pending[id]);
/* Retrato (frame 0 do sheet) como elemento DOM, pixel art sem suavização. */
function portrait(id = DEFAULT, scale = 2) {
  const c = get(id), r = c.portrait, d = document.createElement('div'); d.className = 'portrait';
  Object.assign(d.style, { width: r.w * scale + 'px', height: r.h * scale + 'px', backgroundImage: `url("${c.sheet}")`,
    backgroundSize: `${c.sheetW * scale}px ${c.sheetH * scale}px`, backgroundPosition: `${-r.x * scale}px ${-r.y * scale}px` });
  return d;
}
SL.Characters = { all, pending, get, portrait, playable, DEFAULT };
SL.Profile = Profile;
})();
