/* PROGRESSO NA NUVEM (Cloudflare D1). Salva moedas, diamantes, XP/nível, personagens, personagem escolhido, missões, upgrades e som — sem conta.
 *  - O aparelho tem uma CHAVE secreta (40 hex, localStorage 'sl.cloud.key'). O servidor guarda só o SHA-256 dela e o progresso.
 *  - Cada mudança do perfil (SL.Profile.save) é enviada ~1,5 s depois, e ao esconder/fechar a página. Sem internet: fica marcado ('sl.cloud.dirty') e sobe quando voltar.
 *  - Ao abrir: se a nuvem tem versão mais nova, ela vale (o progresso local anterior é guardado em 'sl.cloud.backup'). Se não há nada na nuvem, sobe o do aparelho.
 *  - "Código de backup" = a chave. Em outro aparelho: Configurações → NUVEM → colar o código → RESTAURAR. */
(() => {
'use strict';
const P = SL.Profile, C = SL.Characters, svc = SaiyanGame.service;
if (!P || !C) return;
const ls = { get: k => { try { return localStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} }, del: k => { try { localStorage.removeItem(k); } catch (_) {} } };
const KEY = 'sl.cloud.key', REV = 'sl.cloud.rev', DIRTY = 'sl.cloud.dirty', BACKUP = 'sl.cloud.backup';
/* CONTA: com login, o progresso é DA CONTA (o servidor usa o token da sessão, nunca o código). Cada aparelho lembra de quem é o progresso local ('sl.cloud.owner'):
 *  - era de outra conta → começa um perfil novo (os dados dela estão no servidor; nada de uma conta aparece na outra);
 *  - era sem conta (jogo antigo) → vira da conta: se a conta já tem progresso no servidor ele vale (o local vai para o backup); se não tem, o local sobe e NÃO se perde. */
const OWNER = 'sl.cloud.owner', AU = window.SLAuth, acct = AU && AU.user, meId = acct ? 'a:' + acct.pid : '';
let claim = false;
if (acct) {
  const prev = ls.get(OWNER);
  if (prev && prev !== meId && prev.startsWith('a:')) { for (const k of ['sl.profile', REV, DIRTY, BACKUP]) ls.del(k); ls.set(OWNER, meId); location.reload(); return; }
  if (prev !== meId) { claim = true; ls.set(REV, '0'); ls.set(OWNER, meId); }
}
const mk = () => { const a = new Uint8Array(20); (window.crypto && crypto.getRandomValues) ? crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = Math.random() * 256; }); return [...a].map(x => x.toString(16).padStart(2, '0')).join(''); };
let key = ls.get(KEY); if (!/^[a-f0-9]{40}$/.test(key || '')) { key = mk(); ls.set(KEY, key); }
for (const k of ['stats', 'upgrades']) if (!P[k]) P[k] = {};
for (const k of ['forms', 'techniques']) if (!P[k]) P[k] = [];
let rev = +ls.get(REV) || 0, timer = 0, busy = false, applying = false, state = 'idle', lastErr = '';
const listeners = new Set(), setState = (s, e) => { state = s; lastErr = e || ''; listeners.forEach(f => f(state, lastErr)); };

const audio = () => { let a = {}; try { a = JSON.parse(ls.get('sl.audio') || '{}'); } catch (_) {} return { volume: +a.volume >= 0 ? +a.volume : .6, muted: !!a.muted }; };
const snapshot = () => ({ gold: P.gold, silver: P.silver, gems: P.gems, xp: P.xp, level: P.level, selected: P.selected, picked: P.picked, unlocked: P.unlocked.slice(), mp: P.mp, md: P.md, stats: P.stats, upgrades: P.upgrades, forms: P.forms, techniques: P.techniques, audio: audio() });
function apply(d) {
  applying = true;
  try {
    P.unlocked = (Array.isArray(d.unlocked) ? d.unlocked : []).filter(id => C.all[id]);
    P.selected = d.selected && P.isUnlocked(d.selected) ? d.selected : C.DEFAULT; P.picked = !!d.picked && P.isUnlocked(P.selected);
    for (const k of ['xp', 'gold', 'silver', 'gems']) P[k] = Math.max(0, Math.floor(+d[k] || 0));
    P.welcomed = true; P.mp = d.mp || {}; P.md = d.md || {}; P.stats = d.stats || {}; P.upgrades = d.upgrades || {}; P.forms = d.forms || []; P.techniques = d.techniques || [];
    const a = d.audio; if (a) { ls.set('sl.audio', JSON.stringify({ volume: a.volume, muted: a.muted })); try { window.SaiyanAudio && SaiyanAudio.setVolume(a.volume); window.SaiyanAudio && SaiyanAudio.setMuted(!!a.muted); } catch (_) {} }
    P.save();
  } finally { applying = false; }
  ['coins', 'xp', 'select', 'mission', 'sync'].forEach(w => { try { P._emit(w); } catch (_) {} });
}
const setRev = r => { rev = r; ls.set(REV, String(r)); };
const online = () => svc.mode === 'online';
const myName = () => (svc.ident && svc.ident.name) || (SaiyanGame.rooms && SaiyanGame.rooms.me && SaiyanGame.rooms.me.name) || '';

async function push() {
  if (busy || !online()) return; busy = true; setState('saving');
  try { const r = await svc.saveProfile(key, snapshot(), myName()); setRev(r.rev); ls.del(DIRTY); claim = false; setState('saved'); }
  catch (e) { ls.set(DIRTY, '1'); setState('error', e.message || 'Falha ao salvar.'); }
  finally { busy = false; }
}
function schedule(ms = 1500) { if (applying) return; ls.set(DIRTY, '1'); clearTimeout(timer); timer = setTimeout(push, ms); }

async function sync(force) {   // ao abrir / ao voltar a ficar online
  if (!online() || busy) return; busy = true; setState('saving');
  try {
    const r = await svc.loadProfile(key);
    if (r.exists && (force || claim || r.rev > rev)) {
      if (ls.get(DIRTY) === '1' || force || claim) ls.set(BACKUP, JSON.stringify({ at: Date.now(), local: snapshot() }));
      apply(r.progress); setRev(r.rev); ls.del(DIRTY); claim = false; setState('saved');
    } else if (!r.exists || ls.get(DIRTY) === '1') { busy = false; await push(); return; }
    else { claim = false; setState('saved'); }
  } catch (e) { setState('error', e.message || 'Sem conexão.'); }
  finally { busy = false; }
}

const save0 = P.save; P.save = function () { const r = save0.apply(this, arguments); if (!applying) schedule(); return r; };
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && ls.get(DIRTY) === '1') { clearTimeout(timer); push(); } });
addEventListener('pagehide', () => { if (ls.get(DIRTY) === '1') push(); });
svc.on('status', () => { if (online()) sync(false); });
setInterval(() => { if (online() && ls.get(DIRTY) === '1' && !busy) push(); }, 30000);
if (online()) sync(false);

/* troca de aparelho: usa o código de backup de outro aparelho */
async function restore(code) {
  code = String(code || '').trim().toLowerCase(); if (!/^[a-f0-9]{40}$/.test(code)) throw new Error('Código inválido. São 40 letras/números.');
  if (!online()) throw new Error('Sem conexão com o servidor.');
  const r = await svc.loadProfile(code); if (!r.exists) throw new Error('Nenhum progresso encontrado com esse código.');
  key = code; ls.set(KEY, key); ls.set(BACKUP, JSON.stringify({ at: Date.now(), local: snapshot() })); apply(r.progress); setRev(r.rev); ls.del(DIRTY); setState('saved');
}
SL.CloudSave = window.SLCloud = { account: acct ? acct.name : '', get key() { return key; }, get state() { return state; }, get error() { return lastErr; }, push: () => push(), sync, restore, onChange(f) { listeners.add(f); return () => listeners.delete(f); } };
})();
