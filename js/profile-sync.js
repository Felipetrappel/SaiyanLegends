/* Progresso na CONTA (servidor + PostgreSQL). O que fica salvo na conta: moedas, diamantes, XP/nível, personagens desbloqueados, personagem escolhido,
 * missões, atributos/upgrades/formas/técnicas (quando existirem no jogo) e configurações de som.
 *  - Logado: ao abrir o jogo baixa o progresso da conta; a cada mudança envia ao servidor (após ~1,2 s) e ao fechar/esconder a página.
 *  - Sem servidor/sem conta: continua funcionando como antes, só no aparelho (localStorage). Mudanças feitas offline ficam marcadas
 *    ('sl.sync.dirty') e sobem na próxima vez que houver conexão.
 *  - Conflito (mesma conta em dois aparelhos): vale o que está no servidor; o progresso local é guardado em 'sl.profile.backup' (nada é perdido).
 *  - Dados de outra conta no mesmo aparelho NUNCA sobem para a conta nova ('sl.profile.owner' diz de quem é o progresso local).
 * Não altera combate nem lojas: só observa SL.Profile.save() e aplica os dados vindos do servidor. */
(() => {
'use strict';
const P = SL.Profile, A = SL.Auth, C = SL.Characters, PKEY = 'sl.profile', OWNER = 'sl.profile.owner', DIRTY = 'sl.sync.dirty', BACKUP = 'sl.profile.backup', REV = 'sl.profile.rev';
if (!P || !A) return;
const ls = { get: k => { try { return localStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} }, del: k => { try { localStorage.removeItem(k); } catch (_) {} } };
for (const k of ['stats', 'upgrades']) if (!P[k]) P[k] = {};
for (const k of ['forms', 'techniques']) if (!P[k]) P[k] = [];

let rev = +ls.get(REV) || 0, timer = 0, inflight = false, again = false, applying = false, ready = false;

function settings() { let a = {}; try { a = JSON.parse(ls.get('sl.audio') || '{}'); } catch (_) {} return { audio: { volume: +a.volume >= 0 ? +a.volume : .6, muted: !!a.muted } }; }
function snapshot() {
  return { gold: P.gold, silver: P.silver, gems: P.gems, xp: P.xp, level: P.level, selected: P.selected, picked: P.picked, welcomed: P.welcomed, unlocked: P.unlocked.slice(),
    stats: P.stats, upgrades: P.upgrades, forms: P.forms, techniques: P.techniques, settings: settings(), mp: P.mp, md: P.md };
}
function defaults() {   // perfil novo (igual a uma instalação nova)
  Object.assign(P, { selected: C.DEFAULT, picked: false, unlocked: [C.DEFAULT], xp: 0, gold: SL.WELCOME_GOLD, silver: 0, gems: 0, welcomed: true, mp: {}, md: {}, stats: {}, upgrades: {}, forms: [], techniques: [] });
}
function apply(d) {   // aplica o progresso do servidor no jogo
  applying = true;
  try {
    P.unlocked = (Array.isArray(d.unlocked) ? d.unlocked : []).filter(id => C.all[id]); if (!P.unlocked.includes(C.DEFAULT)) P.unlocked.unshift(C.DEFAULT);
    P.selected = d.selected && P.isUnlocked(d.selected) ? d.selected : C.DEFAULT; P.picked = !!d.picked && P.isUnlocked(P.selected);
    for (const k of ['xp', 'gold', 'silver', 'gems']) P[k] = Math.max(0, Math.floor(+d[k] || 0));
    P.welcomed = true; const m = d.missions || {}; P.mp = m.mp || {}; P.md = m.md || {};
    P.stats = d.stats || {}; P.upgrades = d.upgrades || {}; P.forms = d.forms || []; P.techniques = d.techniques || [];
    const a = d.settings && d.settings.audio; if (a) { ls.set('sl.audio', JSON.stringify({ volume: a.volume, muted: a.muted })); try { window.SaiyanAudio && SaiyanAudio.setVolume(a.volume); window.SaiyanAudio && SaiyanAudio.setMuted(a.muted); } catch (_) {} }
    P.save();
  } finally { applying = false; }
  ['coins', 'xp', 'select', 'mission', 'sync'].forEach(w => P._emit(w));
}
const setRev = r => { rev = r; ls.set(REV, String(r)); };

async function push() {
  if (!A.user || !ready) return; if (inflight) { again = true; return; } inflight = true;
  try {
    const r = await A.api('save', { token: A.token(), rev, progress: snapshot() }); setRev(r.rev); ls.del(DIRTY); ls.set(OWNER, A.user.pid);
  } catch (e) {
    if (e.status === 409 && e.data && e.data.progress) {   // outro aparelho salvou antes: o servidor manda; guardo o local como backup
      ls.set(BACKUP, JSON.stringify({ at: Date.now(), local: snapshot() })); setRev(e.data.rev); apply(e.data.progress); ls.del(DIRTY);
    } else if (e.status === 401) { /* sessão expirada: o auth.js trata no próximo init */ } else ls.set(DIRTY, '1');
  } finally { inflight = false; if (again) { again = false; schedule(0); } }
}
function schedule(ms = 1200) { if (!A.user || !ready || applying) return; ls.set(DIRTY, '1'); clearTimeout(timer); timer = setTimeout(push, ms); }

async function pull() {
  if (!A.user) return; const pid = A.user.pid;
  let r; try { r = await A.api('profile', { token: A.token() }); } catch (e) { return; }   // sem servidor: segue só local
  const owner = ls.get(OWNER), mine = !owner || owner === pid;
  if (!mine) { ls.set(BACKUP + '.' + owner, JSON.stringify({ at: Date.now(), local: snapshot() })); defaults(); P.save(); setRev(0); }   // progresso de OUTRA conta: não sobe
  if (r.exists) {
    if (mine && ls.get(DIRTY) === '1' && rev === r.rev) { ready = true; ls.set(OWNER, pid); return push(); }   // mudanças locais pendentes e a conta não mudou: o local vence
    if ((mine && ls.get(DIRTY) === '1') || !owner) ls.set(BACKUP, JSON.stringify({ at: Date.now(), local: snapshot() }));   // guarda o progresso local antes de trocar pelo da conta
    setRev(r.rev); apply(r.progress);
  } else { setRev(0); if (!mine) { defaults(); P.save(); } ready = true; ls.set(OWNER, pid); await push(); }   // 1º login com esta conta: sobe o progresso deste aparelho (se for dela)
  ready = true; ls.set(OWNER, pid); ls.del(DIRTY);
}

/* observa os salvamentos do perfil */
const save0 = P.save; P.save = function () { const r = save0.apply(this, arguments); if (!applying) schedule(); return r; };
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && A.user && ready && ls.get(DIRTY) === '1') { clearTimeout(timer); push(); } });
addEventListener('pagehide', () => { if (A.user && ready && ls.get(DIRTY) === '1') push(); });
addEventListener('online', () => { if (A.user && ls.get(DIRTY) === '1') pull(); });
setInterval(() => { if (A.user && ready && ls.get(DIRTY) === '1' && !inflight) push(); }, 30000);

/* sair da conta: envia o que falta e LIMPA o progresso deste aparelho (ele continua na conta); outra pessoa entra com perfil limpo */
const logout0 = A.logout.bind(A);
A.logout = async function () { try { clearTimeout(timer); if (ready && ls.get(DIRTY) === '1') await push(); } catch (_) {} if (ls.get(DIRTY) === '1') ls.set(BACKUP, JSON.stringify({ at: Date.now(), local: snapshot() })); ls.del(PKEY); ls.del(OWNER); ls.del(DIRTY); ls.del(REV); return logout0(); };

SL.ProfileSync = { pull, push, get rev() { return rev; } };
(A.ready || Promise.resolve()).then(pull);
})();
