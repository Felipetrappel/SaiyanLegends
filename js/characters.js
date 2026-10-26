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
  xp: 0, gold: 0, silver: 0, gems: 0, _ls: [],            // nível e moedas: começam ZERADOS (ganhos reais: addXp / addCoins; gastos: spend)
  /* nível = floor(√(xp/100)): Lv.1 com 100 XP, Lv.2 com 400, Lv.3 com 900… */
  get level() { return Math.floor(Math.sqrt(this.xp / 100)); },
  get levelProgress() { const L = this.level, a = 100 * L * L, b = 100 * (L + 1) * (L + 1); return Math.max(0, Math.min(1, (this.xp - a) / (b - a))); },
  get power() { return Math.round(this.xp * 3 + this.level * 100); },
  on(fn) { this._ls.push(fn); return () => { this._ls = this._ls.filter(f => f !== fn); }; },
  _emit(why) { this._ls.slice().forEach(f => { try { f(why); } catch (e) {} }); },
  addXp(n) { n = Math.max(0, Math.floor(+n || 0)); if (!n) return; const L = this.level; this.xp += n; this.save(); this._emit('xp'); if (this.level > L) this._emit('levelup'); },
  addCoins(type, n) { n = Math.max(0, Math.floor(+n || 0)); if (!['gold', 'silver', 'gems'].includes(type) || !n) return; this[type] += n; this.save(); this._emit('coins'); },
  spend(type, n) { n = Math.floor(+n || 0); if (!['gold', 'silver', 'gems'].includes(type) || n < 0 || this[type] < n) return false; this[type] -= n; this.save(); this._emit('coins'); return true; },
  isUnlocked(id) { return !!all[id] && (all[id].defaultUnlocked || this.unlocked.includes(id)); },
  select(id) { if (!this.isUnlocked(id)) return false; this.selected = id; this.save(); this._emit('select'); return true; },
  save() { try { localStorage.setItem(KEY, JSON.stringify({ selected: this.selected, unlocked: this.unlocked, xp: this.xp, gold: this.gold, silver: this.silver, gems: this.gems })); } catch (e) {} },
  load() { try { const d = JSON.parse(localStorage.getItem(KEY) || '{}'); if (Array.isArray(d.unlocked)) this.unlocked = d.unlocked.filter(id => all[id]);   // ignora ids de personagens que não existem mais
    if (d.selected && this.isUnlocked(d.selected)) this.selected = d.selected;
    for (const k of ['xp', 'gold', 'silver', 'gems']) if (Number.isFinite(d[k]) && d[k] > 0) this[k] = Math.floor(d[k]); } catch (e) {} }
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
