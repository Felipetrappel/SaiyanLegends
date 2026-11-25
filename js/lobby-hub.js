/* LOBBY (hub) — cenário da cidade (assets/ui/lobby-city.png) com o seu personagem andando na rua.
 * Controles: setas / A D, ou toque/clique no cenário para andar até o ponto. Botão "Trocar personagem" abre a seleção. */
(() => {
'use strict';
const M = SaiyanMenu, S = M.screens, P = SL.Profile, C = SL.Characters, svc = SaiyanGame.service;
const el = (t, c = '', p = {}) => Object.assign(document.createElement(t), { className: c, ...p });
const bg = new Image(); bg.src = 'assets/ui/lobby-city.png'; const pimg = new Image(); pimg.src = 'assets/ui/portal.png';
const frameOf = (def, anim, t) => { const a = (def.anims && def.anims[anim]) || def.anims.idle; return def.frames[a.f[Math.floor(t * (a.fps || 8)) % a.f.length]]; };
const idleH = d => { try { return Math.max(...d.anims.idle.f.map(i => d.frames[i].h)); } catch (e) { return 60; } };
const PANELS = 3;          // mundo = 3 painéis lado a lado: cenário · cenário espelhado · cenário (as emendas ficam contínuas)
let pos = null;            // posição X do personagem no mundo (px da imagem), mantida ao reabrir

S.register('hub', { title: 'Lobby', sticky: true, noFocus: true, build(p) {
  p.classList.add('shopwrap', 'lobbywrap');
  const cv = el('canvas', 'lb-cv'), back = el('button', 'lb-btn lb-back', { type: 'button', textContent: '✕', title: 'Sair do lobby' });
  const cnt = el('div', 'lb-cnt'), chat = el('div', 'lb-chat'), log = el('div', 'lb-log'), crow = el('div', 'lb-crow');
  const inp = el('input', 'lb-in', { type: 'text', maxLength: 120, placeholder: 'Digite para falar..', autocomplete: 'off', enterKeyHint: 'send' }), go = el('button', 'lb-send', { type: 'button', textContent: '➤' }), err = el('div', 'lb-err');
  crow.append(inp, go); chat.append(log, crow, err);
  const tg = el('button', 'mc-tg lb-tg', { type: 'button', title: 'Mostrar/ocultar chat', 'aria-label': 'Mostrar ou ocultar o chat', textContent: '💬' }); let chHid = false; try { chHid = localStorage.getItem('sl_matchchat_hidden') === '1'; } catch (e) {}
  const applyCh = () => { chat.classList.toggle('off', chHid); tg.classList.toggle('off', chHid); }; applyCh();
  tg.addEventListener('click', e => { e.currentTarget.blur(); chHid = !chHid; try { localStorage.setItem('sl_matchchat_hidden', chHid ? '1' : '0'); } catch (x) {} applyCh(); if (chHid) inp.blur(); });
  p.append(cv, back, cnt, chat, tg); back.addEventListener('click', () => S.close());
  /* HUD novo (joystick + 6 botões em losango) — mesmo layout do jogo; no lobby não há dano: os botões só dão o efeito visual */
  const fs = Object.create(SL.GameScene.prototype); fs.pad = {}; fs.pend = {}; fs.editing = false;
  const hud = el('div', 'ctl'), mv = el('div', 'move jm'), acts = el('div', 'acts'); mv.append(fs.makeJoystick());
  const dmb = c => { const b = el('button', 'cbtn ' + c + ' dm', { type: 'button', tabIndex: -1 }); b.innerHTML = `<img class="dmi" src="assets/ui/hud/${c}.png" alt="" draggable="false"><i class="cd"></i><i class="fx"></i>`; b.addEventListener('pointerdown', e => { e.preventDefault(); b.classList.add('on'); if (c === 'bt') jumpV = 520; }); ['pointerup', 'pointercancel', 'pointerleave'].forEach(n => b.addEventListener(n, () => b.classList.remove('on'))); b.addEventListener('contextmenu', e => e.preventDefault()); return b; };
  acts.append(...['md', 'sp', 'power', 'bt', 'pk', 'atk'].map(dmb)); hud.append(mv, acts); p.append(hud); fs.initCustomize(hud, p); let jumpV = 0, jumpY = 0, inPortal = false; const PORTAL = () => WW() / 2 + 700;
  const WW = () => (bg.width || 1774) * PANELS; if (pos == null) pos = WW() / 2; let tx = pos, face = 1, moving = false, raf = 0, last = performance.now(), t = 0; const keys = new Set();
  /* ── outros jogadores (online) ── */
  const others = new Map(), bubbles = new Map();       // id → {name, character, x, tx, f, mv}  ·  nome → {text, until}
  let joined = false, lastSent = 0, sx = -1, sf = 0, smv = 0, onlineN = 0;
  const myInfo = () => ({ x: Math.round(pos), f: face, name: (SL.Auth && SL.Auth.user && SL.Auth.user.name) || SaiyanGame.rooms.me.name || 'Jogador', character: P.picked ? P.selected : Object.keys(C.all)[0] });
  const label = () => { cnt.innerHTML = '<svg viewBox="0 0 24 24" class="lb-crown"><path d="M3 18h18l1-11-5 4-5-8-5 8-5-4z" fill="#ffd45a" stroke="#7a4a00" stroke-width="1.2" stroke-linejoin="round"/></svg>'; cnt.append('Lobby · ' + (svc.mode === 'online' ? others.size + 1 : 1) + ' online'); };
  const join = () => { if (joined || svc.mode !== 'online') { label(); return; } joined = true; svc.hubJoin(myInfo()).then(list => { if (!list) { joined = false; return; } others.clear(); list.forEach(q => others.set(q.id, { ...q, tx: q.x })); label(); }).catch(() => { joined = false; }); };
  const onHub = e => {
    if (e.t === 'join') others.set(e.p.id, { ...e.p, tx: e.p.x }); else if (e.t === 'leave') others.delete(e.pid);
    else if (e.t === 'move') { const q = others.get(e.pid); if (q) { q.tx = e.x; q.f = e.f; q.mv = e.mv; } }
    label();
  };
  const onStatus = () => { if (svc.mode !== 'online') { joined = false; others.clear(); } join(); label(); };
  const drawLog = () => { log.replaceChildren(...(SL.Social ? SL.Social.log : []).slice(-6).map(m => { const r = el('div', 'lb-msg'); const tc = window.SLTags && SLTags.chip(m.tag); if (tc) r.append(tc); const vch = window.SLTags && SLTags.vipChip(m.vip); if (vch) r.append(vch); r.append(SLTags.vipName(el('b', '', { textContent: (m.name || '?') + ': ' }), m.vip), document.createTextNode(m.text)); return r; })); log.scrollTop = log.scrollHeight; };
  const onChat = m => { drawLog(); if (m && m.name) bubbles.set(m.name, { text: String(m.text).slice(0, 60), until: performance.now() + 5000 }); };
  const send = async () => { const t = inp.value.replace(/\s+/g, ' ').trim(); if (!t) return; err.textContent = ''; try { await SL.Social.send(t); inp.value = ''; } catch (e) { err.textContent = e.message || 'Não foi possível enviar.'; } };
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); send(); } else if (e.key === 'Escape') inp.blur(); }); inp.addEventListener('keyup', e => e.stopPropagation());
  go.addEventListener('click', send);
  svc.on('hub', onHub); svc.on('status', onStatus); svc.on('chat', onChat); drawLog(); label(); join();
  const fit = () => { const r = p.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2); cv.width = Math.max(2, Math.round(r.width * d)); cv.height = Math.max(2, Math.round(r.height * d)); };
  const ro = new ResizeObserver(fit); ro.observe(p); fit();
  const geo = () => { const W = cv.width, H = cv.height, s = Math.max(H / bg.height, W / (bg.width * PANELS)), dh = bg.height * s, vw = W / s, cx = Math.min(Math.max(pos - vw / 2, 0), Math.max(0, WW() - vw)); return { W, H, s, dh, vw, cx, oy: H - dh }; };
  const pt = e => { if (Math.abs(((e.clientX - cv.getBoundingClientRect().left) / cv.getBoundingClientRect().width * geo().vw + geo().cx) - PORTAL()) < 130) { tx = PORTAL(); return; } const r = cv.getBoundingClientRect(), g = geo(); tx = Math.min(WW() - 60, Math.max(60, g.cx + (e.clientX - r.left) / r.width * g.vw)); };
  cv.addEventListener('pointerdown', pt);
  const kd = e => { if (e.target && e.target.tagName === 'INPUT') return; if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) { keys.add(e.code); e.preventDefault(); } else if (e.key === 'Escape') S.close(); }, ku = e => keys.delete(e.code);
  addEventListener('keydown', kd); addEventListener('keyup', ku);
  function frame(now) {
    raf = requestAnimationFrame(frame); const dt = Math.min(.05, (now - last) / 1000); last = now; t += dt;
    const k = (keys.has('ArrowRight') || keys.has('KeyD') || fs.pad.right ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') || fs.pad.left ? 1 : 0);
    if (jumpV || jumpY) { jumpY = Math.max(0, jumpY + jumpV * dt); jumpV -= 1500 * dt; if (jumpY <= 0) { jumpY = 0; jumpV = 0; } }
    const SPD = 520;   // px do mundo por segundo
    if (k) { pos = Math.min(WW() - 60, Math.max(60, pos + k * SPD * dt)); tx = pos; face = k; moving = true; }
    else if (Math.abs(tx - pos) > 6) { const dir = Math.sign(tx - pos); pos += dir * Math.min(Math.abs(tx - pos), SPD * dt); face = dir; moving = true; } else moving = false;
    if (joined && now - lastSent > 110) { const mv = moving ? 1 : 0; if (Math.abs(pos - sx) > 2 || face !== sf || mv !== smv) { svc.hubMove(Math.round(pos), face, mv); sx = pos; sf = face; smv = mv; } lastSent = now; }
    for (const q of others.values()) { const dx = q.tx - q.x; q.x += dx * Math.min(1, dt * 9); q.mv2 = Math.abs(dx) > 4; }
    const g = geo(), ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.fillStyle = '#10204a'; ctx.fillRect(0, 0, g.W, g.H);
    if (bg.complete && bg.width) for (let i = 0; i < PANELS; i++) {          // desenha só os painéis visíveis; o do meio é espelhado
      const px = (i * bg.width - g.cx) * g.s, pw = bg.width * g.s; if (px > g.W || px + pw < 0) continue;
      ctx.save(); ctx.translate(Math.round(px), 0); if (i % 2) { ctx.translate(pw, 0); ctx.scale(-1, 1); } ctx.drawImage(bg, 0, g.oy, Math.ceil(pw) + 1, g.dh); ctx.restore();
    }
    const sign = (x, txt, w) => { const sxp = (x - g.cx) * g.s, fs2 = Math.round(g.dh * .032), bw = w * g.dh / 887, by = g.oy + g.dh * .60; if (sxp < -bw || sxp > g.W + bw) return;
      ctx.save(); ctx.fillStyle = '#5a3a1a'; ctx.fillRect(sxp - 3, by, 6, g.dh * .2); ctx.fillStyle = '#c28a4a'; ctx.strokeStyle = '#3a210a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(sxp - bw / 2, by - fs2 * 2.2, bw, fs2 * 2.4, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2a1405'; ctx.font = `800 ${fs2}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.fillText(txt, sxp, by - fs2 * .55, bw - 10); ctx.restore(); };
    sign(WW() / 2 - 420, 'Aqui você não toma dano', 330); sign(WW() / 2 + 380, 'Lobby', 150);
    { const px = PORTAL(), sxp = (px - g.cx) * g.s, gy = g.oy + g.dh * .84, ph = g.dh * .46, pw = ph * (pimg.width || 816) / (pimg.height || 974);
      if (pimg.complete && pimg.width && sxp > -pw && sxp < g.W + pw) {
        const pu = .5 + .5 * Math.sin(t * 3); ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(sxp, gy - 4, pw * .42, 9, 0, 0, 7); ctx.fill();
        ctx.shadowColor = '#b46cff'; ctx.shadowBlur = 14 + pu * 22; ctx.drawImage(pimg, Math.round(sxp - pw / 2), Math.round(gy - ph), pw, ph); ctx.shadowBlur = 0;
        const fz = Math.round(g.dh * .034); ctx.font = `800 ${fz}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.fillStyle = '#ffe27a'; ctx.strokeText('BATALHA', sxp, gy - ph - fz * .3); ctx.fillText('BATALHA', sxp, gy - ph - fz * .3); ctx.restore();
      }
      const near = Math.abs(pos - px) < 55 && !jumpY; if (near && !inPortal) { inPortal = true; err.textContent = ''; SLQuickBattle.go().catch(e => { err.textContent = e.message || 'Não foi possível entrar na batalha.'; }); } else if (!near && Math.abs(pos - px) > 110) inPortal = false; }
    const sprite = (id, x, face, moving, name, me, tag, vip) => {
      const d = C.get(C.all[id] ? id : Object.keys(C.all)[0]); if (!d || !d.img || !d.img.complete) return;
      const sc = Math.max(1, g.H * .14 / idleH(d)), f = frameOf(d, moving ? 'run' : 'idle', t), fy = g.oy + g.dh * (me ? .8 : .78) - (me ? jumpY * g.s * .6 : 0), sxp = (x - g.cx) * g.s;
      if (!f) return;
      if (sxp < -200 || sxp > g.W + 200) return;
      ctx.save(); ctx.translate(Math.round(sxp), 0); ctx.scale(face < 0 ? -1 : 1, 1);
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(0, fy, f.w * sc * .35, 7 * (g.dh / 887) + 3, 0, 0, 7); ctx.fill();
      ctx.drawImage(d.img, f.x, f.y, f.w, f.h, Math.round(-f.ax * sc), Math.round(fy - f.ay * sc), f.w * sc, f.h * sc); ctx.restore();
      const ny = fy - idleH(d) * sc - g.dh * .03; if (me && SL.Profile) { ctx.font = `800 ${Math.round(g.dh * .03)}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.fillStyle = '#fff'; ctx.strokeText('lvl. ' + SL.Profile.level, sxp, ny - g.dh * .045); ctx.fillText('lvl. ' + SL.Profile.level, sxp, ny - g.dh * .045); }
      SLTags.drawName(ctx, tag, name, sxp, ny, { size: Math.round(g.dh * .04), color: me ? '#ffe27a' : '#fff', stroke: 4, vip: me ? ((window.SLVip && SLVip.mine()) || '') : (vip || '') });
      ctx.font = `bold ${Math.round(g.dh * .04)}px system-ui,sans-serif`; ctx.textAlign = 'center';
      const b = bubbles.get(name); if (b && b.until > now) {            // balão de fala
        const fs = Math.round(g.dh * .036); ctx.font = `600 ${fs}px system-ui,sans-serif`; const w = Math.min(g.W * .5, ctx.measureText(b.text).width + fs * 1.2), by = ny - fs * 2.2;
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2a0a66'; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(sxp - w / 2, by - fs, w, fs * 1.9, fs * .5); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#1a0a3a'; ctx.fillText(b.text, sxp, by + fs * .3, w - fs * .6);
      }
    };
    const me = myInfo();
    for (const q of others.values()) sprite(q.character, q.x, q.f, q.mv2, q.name || 'Jogador', false, q.tag, q.vip);
    sprite(me.character, pos, face, moving, me.name, true, svc.myTag);
  }
  raf = requestAnimationFrame(frame);
  return () => { cancelAnimationFrame(raf); if (joined) svc.hubLeave(); svc.off('hub', onHub); svc.off('status', onStatus); svc.off('chat', onChat); ro.disconnect(); removeEventListener('keydown', kd); removeEventListener('keyup', ku); hud.remove(); };
} });
})();
