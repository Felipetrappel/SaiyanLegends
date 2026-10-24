/* Map Loading, Player System e Game Session — só entram em ação depois do START GAME do host. */
(() => {
'use strict';
const { Emitter, RoomState } = SL;

/* Dados dos mapas. Arte e máscara têm a MESMA resolução e coordenadas 1:1; a máscara nunca é exibida. */
const MAP_DATA = {
  forest: { art: 'assets/maps/forest.png', mask: 'assets/maps/forest_collision.png', w: 2872, h: 624, spawn: { x: 60, y: 300 } }
};
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Falha ao carregar a imagem do mapa.')); i.src = src; });

class MapLoader { // mapas sem entrada em MAP_DATA ainda não têm arte: só simulam o carregamento
  constructor() { this.cache = {}; }
  load(mapId) {
    const def = MAP_DATA[mapId];
    if (!def) return new Promise(res => setTimeout(() => res({ mapId }), 700));
    if (this.cache[mapId]) return Promise.resolve(this.cache[mapId]);
    return Promise.all([loadImg(def.art), loadImg(def.mask)]).then(async ([art, mk]) => {
      if (art.naturalWidth !== mk.naturalWidth || art.naturalHeight !== mk.naturalHeight) throw new Error('Mapa e máscara têm resoluções diferentes.');
      if (mk.naturalWidth !== def.w || mk.naturalHeight !== def.h) throw new Error('Resolução inesperada do mapa (' + mk.naturalWidth + '×' + mk.naturalHeight + ').');
      const c = document.createElement('canvas'); c.width = mk.naturalWidth; c.height = mk.naturalHeight;
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(mk, 0, 0);   // 1:1, sem redimensionar
      let data; try { data = x.getImageData(0, 0, c.width, c.height).data; }
      catch (e) { // file:// bloqueia getImageData: usa a cópia idêntica embutida (SL.MASK_DATA)
        const uri = SL.MASK_DATA && SL.MASK_DATA[mapId];
        if (!uri) throw new Error('O navegador bloqueou a leitura da máscara. Abra por um servidor local: python -m http.server');
        const c2 = document.createElement('canvas'); c2.width = c.width; c2.height = c.height; // o canvas anterior ficou 'tainted'
        const x2 = c2.getContext('2d', { willReadFrequently: true }); x2.drawImage(await loadImg(uri), 0, 0); data = x2.getImageData(0, 0, c.width, c.height).data;
      }
      return (this.cache[mapId] = { mapId, def, art, mask: SL.Collision.CollisionMask.fromRGBA(data, c.width, c.height) });
    });
  }
}

class PlayerSystem { // posições em % do mapa
  static spawn(players) {
    const n = players.length;
    return players.map((player, i) => ({ player, hp: 100, x: Math.round(50 + 36 * Math.cos(2 * Math.PI * i / n)), y: Math.round(50 + 36 * Math.sin(2 * Math.PI * i / n)) }));
  }
}

class GameSession extends Emitter {
  constructor(rooms) {
    super(); this.active = false; this.map = null; this.entities = [];
    rooms.on('room:update', r => {
      if (r.state === RoomState.IN_GAME && !this.active) { this.active = true; this.map = r.map; this.entities = PlayerSystem.spawn(r.players); this.emit('session:start', this); }
      else if (r.state !== RoomState.IN_GAME) this._end();
    });
    rooms.on('room:left', () => this._end()); rooms.on('room:closed', () => this._end());
  }
  _end() { if (this.active) { this.active = false; this.entities = []; this.emit('session:end', this); } }
}

Object.assign(SL, { MAP_DATA, MapLoader, PlayerSystem, GameSession });
})();
