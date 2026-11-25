/* Portal do Lobby → sala de batalha direta: entra na arena pública (sem bots) ou cria e inicia uma, sem tela de sala. */
(() => {
'use strict';
const S = SaiyanMenu.screens; let busy = false;
window.SLQuickBattle = { async go() {
  if (busy) return; busy = true;
  try {
    const G = SaiyanGame, rooms = G.rooms, svc = G.service;
    if (rooms.room) { S.open('lobby'); return; }
    if (svc.mode === 'offline' && svc.url && svc.reconnect) { try { await svc.reconnect(); } catch (e) {} }
    let list = []; try { list = await rooms.listRooms(); } catch (e) {}
    const arena = list.find(r => r.name === 'Arena' && !r.locked && !r.full && r.state !== 'FINISHED' && r.state !== 'MAP_SELECTION');
    let joined = false;
    if (arena) { try { await rooms.joinRoom(arena.id); joined = true; } catch (e) { /* encheu/sumiu: cria outra */ } }
    if (!joined) {
      const map = SL.MAPS[0] && SL.MAPS[0].id;
      await rooms.createRoom({ mode: 'custom', maxPlayers: 8, map, name: 'Arena' });   // arena pública, sem bots: quem entra pelo portal cai na mesma sala
      await rooms.startGame();
    }
    await new Promise((ok, no) => { const done = () => { clearTimeout(tm); rooms.off('room:update', on); }, tm = setTimeout(() => { done(); no(new Error('A batalha demorou para carregar.')); }, 20000),
      on = r => { if (r && r.state === 'IN_GAME') { done(); ok(); } }; rooms.on('room:update', on); on(rooms.room); });
    S.open('game'); return;
  } finally { busy = false; }
} };
})();
