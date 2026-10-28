/* Personagens jogáveis + perfil do jogador (selecionado / desbloqueados). Hoje só existe o STREET, que já vem
   desbloqueado e selecionado. Para um novo personagem: registre-o em Characters.all (com defaultUnlocked e price). */
(() => {
'use strict';
const S = SL.STREET, pending = {};
const all = {};
if (S) all.street = { ...S, price: 0, defaultUnlocked: true, stats: { power: 100, defense: 100, energy: 100, speed: 100, k: 100 }, img: Object.assign(new Image(), { src: S.sheet }) };   // pré-carrega o sheet (para trocar o preço/bloqueio, edite price e defaultUnlocked)
const DEFAULT = Object.keys(all)[0];   // personagem padrão = o primeiro disponível
const KEY = 'sl.profile';
const WELCOME_GOLD = 1500;   // moedas amarelas de um perfil NOVO (dadas uma única vez: o perfil guarda 'welcomed')
const Profile = {
  selected: DEFAULT, unlocked: [DEFAULT],
  xp: 0, gold: 0, silver: 0, gems: 0, welcomed: false, _ls: [],            // nível e moedas: começam ZERADOS (ganhos reais: addXp / addCoins; gastos: spend)
  /* nível = floor(√(xp/100)): Lv.1 com 100 XP, Lv.2 com 400, Lv.3 com 900… */
  get level() { return Math.floor(Math.sqrt(this.xp / 100)); },
  get levelProgress() { const L = this.level, a = 100 * L * L, b = 100 * (L + 1) * (L + 1); return Math.max(0, Math.min(1, (this.xp - a) / (b - a))); },
  get power() { return Math.round(this.xp * 3 + this.level * 100); },
  on(fn) { this._ls.push(fn); return () => { this._ls = this._ls.filter(f => f !== fn); }; },
  _emit(why) { this._ls.slice().forEach(f => { try { f(why); } catch (e) {} }); },
  addXp(n) { n = Math.max(0, Math.floor(+n || 0)); if (!n) return; const L = this.level; this.xp += n; this.save(); this._emit('xp'); if (this.level > L) this._emit('levelup'); },
  addCoins(type, n) { n = Math.max(0, Math.floor(+n || 0)); if (!['gold', 'silver', 'gems'].includes(type) || !n) return; this[type] += n; this.save(); this._emit('coins'); },
  spend(type, n) { n = Math.floor(+n || 0); if (!['gold', 'silver', 'gems'].includes(type) || n < 0 || this[type] < n) return false; this[type] -= n; this.save(); this._emit('coins'); return true; },
  /* compra com moedas amarelas (ouro): confere o saldo, gasta, libera o personagem e salva. Retorna 'ok' | 'owned' | 'poor' | 'none' */
  buy(id) { const c = all[id]; if (!c) return 'none'; if (this.isUnlocked(id)) return 'owned'; if (this.gold < c.price) return 'poor'; this.gold -= c.price; this.unlocked.push(id); this.save(); this._emit('coins'); this._emit('buy'); return 'ok'; },
  isUnlocked(id) { return !!all[id] && (all[id].defaultUnlocked || this.unlocked.includes(id)); },
  select(id) { if (!this.isUnlocked(id)) return false; this.selected = id; this.save(); this._emit('select'); return true; },
  save() { try { localStorage.setItem(KEY, JSON.stringify({ selected: this.selected, unlocked: this.unlocked, welcomed: this.welcomed, xp: this.xp, gold: this.gold, silver: this.silver, gems: this.gems })); } catch (e) {} },
  load() {
    let raw = null; try { raw = localStorage.getItem(KEY); } catch (e) {}
    try { const d = JSON.parse(raw || '{}'); if (Array.isArray(d.unlocked)) this.unlocked = d.unlocked.filter(id => all[id]);   // ignora ids de personagens que não existem mais
      if (d.selected && this.isUnlocked(d.selected)) this.selected = d.selected;
      for (const k of ['xp', 'gold', 'silver', 'gems']) if (Number.isFinite(d[k]) && d[k] > 0) this[k] = Math.floor(d[k]);
      this.welcomed = !!d.welcomed;
      /* Saldo inicial: só quando o perfil é criado (nada salvo). Perfil antigo, salvo antes desta regra e que nunca ganhou nada (0 ouro, 0 XP), recebe uma vez; quem já tem saldo/XP mantém o que tem. */
      if (!this.welcomed) { if (!raw || (this.gold === 0 && this.xp === 0)) this.gold = WELCOME_GOLD; this.welcomed = true; this.save(); }
    } catch (e) { if (!this.welcomed) { this.gold = WELCOME_GOLD; this.welcomed = true; this.save(); } }
  }
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
SL.Profile = Profile; SL.WELCOME_GOLD = WELCOME_GOLD;
})();
