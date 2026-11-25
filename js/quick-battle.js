/* Portal do Lobby → sala de batalha direta: entra numa sala aberta (se houver) ou cria uma nova e abre a sala de espera. */
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
    const open = list.filter(r => !r.full && !r.locked && (r.state === 'WAITING' || r.state === 'READY')).sort((a, b) => b.players - a.players)[0];
    if (open) { try { await rooms.joinRoom(open.id); S.open('lobby'); return; } catch (e) { /* sala encheu/sumiu: cria outra */ } }
    const map = SL.MAPS[0] && SL.MAPS[0].id;
    await rooms.createRoom({ mode: 'pvp', maxPlayers: 2, map, name: '' });
    S.open('lobby');
  } finally { busy = false; }
} };
})();
