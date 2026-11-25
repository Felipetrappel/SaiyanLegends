/* Portal do Lobby → sala de batalha direta: cria uma sala com bot e inicia a luta na hora, sem tela de sala. */
(() => {
'use strict';
const S = SaiyanMenu.screens; let busy = false;
window.SLQuickBattle = { async go() {
  if (busy) return; busy = true;
  try {
    const G = SaiyanGame, rooms = G.rooms, svc = G.service;
    if (rooms.room) { S.open('lobby'); return; }
    if (svc.mode === 'offline' && svc.url && svc.reconnect) { try { await svc.reconnect(); } catch (e) {} }
    const map = SL.MAPS[0] && SL.MAPS[0].id;
    await rooms.createRoom({ mode: 'bots', maxPlayers: 2, map, name: '' });   // sala própria com bot: a luta começa na hora
    await rooms.startGame();
    await new Promise((ok, no) => { const done = () => { clearTimeout(tm); rooms.off('room:update', on); }, tm = setTimeout(() => { done(); no(new Error('A batalha demorou para carregar.')); }, 20000),
      on = r => { if (r && r.state === 'IN_GAME') { done(); ok(); } }; rooms.on('room:update', on); on(rooms.room); });
    S.open('game'); return;
  } finally { busy = false; }
} };
})();
