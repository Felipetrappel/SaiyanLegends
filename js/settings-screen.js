/* CONFIGURAÇÕES (tela cheia, HTML/CSS) — abas GERAL · CONTROLES · ÁUDIO · VÍDEO · SOBRE. Substitui a tela 'options' simples do audio.js.
 * Só mostra o que existe de verdade: volume/silenciar da música (SaiyanAudio), tipo de controle (SL.ControlType), tela cheia (window.SLFullscreen).
 * O que o jogo ainda não tem (efeitos sonoros, outros idiomas, notificações) aparece apagado e marcado como indisponível — nada de ajuste falso. */
(() => {
'use strict';
const M = SaiyanMenu, S = M.screens, A = window.SaiyanAudio;
const el = (t, c = '', p = {}) => Object.assign(document.createElement(t), { className: c, ...p });
const TABS = [['geral', 'GERAL', '⚙'], ['ctrl', 'CONTROLES', '🎮'], ['audio', 'ÁUDIO', '🔊'], ['video', 'VÍDEO', '🖥'], ['sobre', 'SOBRE', 'ℹ']];
const STAGE = { w: 1280, h: 720 };

S.register('options', { title: 'Configurações', sticky: true, noFocus: true, build(p) {
  p.classList.add('shopwrap', 'nshop', 'cfgwrap');
  const fill = el('div', 'ns-fill'), stage = el('div', 'ns-stage'); p.append(fill, stage);
  const title = el('div', 'cf-title'); title.append(el('span', '', { textContent: 'CONFIGURAÇÕES' }));
  const close = el('button', 'ns-close cf-x', { type: 'button', textContent: '✕' }); close.setAttribute('aria-label', 'Fechar');
  const panel = el('div', 'cf-panel'), nav = el('div', 'cf-nav'), body = el('div', 'cf-body'), foot = el('div', 'cf-foot'), toast = el('div', 'ns-toast');
  const main = el('div', 'cf-main'); main.append(body, foot); panel.append(nav, main); stage.append(panel, title, close, toast);
  let tab = 'geral', tt = 0;
  const say = m => { toast.textContent = m; toast.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => toast.classList.remove('on'), 2200); };

  /* peças de interface */
  const row = (ico, label, ...kids) => { const r = el('div', 'cf-row'); r.append(el('i', 'cf-ico', { textContent: ico }), el('div', 'cf-rc')); r.lastChild.append(el('b', '', { textContent: label }), ...kids); return r; };
  const slider = (get, set, disabled) => {
    const w = el('div', 'cf-sl' + (disabled ? ' off' : '')), r = el('input', '', { type: 'range', min: 0, max: 100, step: 1, disabled: !!disabled }), v = el('em');
    const paint = () => { r.value = Math.round(get() * 100); v.textContent = disabled ? '—' : r.value + '%'; r.style.setProperty('--p', r.value + '%'); };
    r.addEventListener('input', () => { set(r.value / 100); paint(); }); w.append(r, v); paint(); w.repaint = paint; return w;
  };
  const check = (label, get, set, disabled, hint) => {
    const b = el('button', 'cf-ck' + (disabled ? ' off' : ''), { type: 'button', disabled: !!disabled }), box = el('i'), t = el('span', '', { textContent: label + (hint ? ' (' + hint + ')' : '') });
    const paint = () => b.classList.toggle('on', !!get()); b.append(box, t); b.addEventListener('click', () => { set(!get()); paint(); }); paint(); b.repaint = paint; return b;
  };
  const note = t => el('p', 'cf-note', { textContent: t });
  const fsGet = () => !!(window.SLFullscreen && window.SLFullscreen.on), fsSet = on => { try { on ? window.SLFullscreen.enter() : window.SLFullscreen.exit(); } catch (_) {} };
  const musicOn = () => A && !A.state.muted, musicSet = on => { if (A) A.setMuted(!on); };
  const live = [];   // coisas a repintar quando o áudio muda por outro lugar (ex.: tecla M)

  const pages = {
    geral() {
      const lang = el('div', 'cf-sel'); lang.append(el('span', 'fl', { textContent: '🇧🇷' }), el('span', '', { textContent: 'Português (BR)' }));
      const vol = slider(() => (A ? A.state.volume : 0), v => { if (!A) return; A.setVolume(v); if (A.state.muted && v > 0) A.setMuted(false); });
      const ck1 = check('Música de fundo', musicOn, musicSet, !A), ck2 = check('Tela cheia', fsGet, fsSet, !(window.SLFullscreen));
      live.push(() => { vol.repaint(); ck1.repaint(); });
      body.append(row('🌐', 'IDIOMA', lang, note('Por enquanto o jogo só existe em português.')), row('🎵', 'VOLUME DA MÚSICA', vol), el('div', 'cf-checks'));
      body.lastChild.append(ck1, ck2);
    },
    ctrl() {
      const cur = () => SL.ControlType.get(), card = (id, name, desc, ico) => { const b = el('button', 'cf-card', { type: 'button' }); b.dataset.id = id; b.append(el('i', '', { textContent: ico }), el('b', '', { textContent: name }), el('span', '', { textContent: desc })); b.addEventListener('click', () => { SL.ControlType.set(id); paint(); say('Controle: ' + name + ' (vale na próxima partida)'); }); return b; };
      const cards = el('div', 'cf-cards'), a = card('arrows', 'SETAS', 'Botões ← → na tela (padrão).', '◀▶'), j = card('joystick', 'JOYSTICK', 'Arraste a esfera: anda, voa e defende.', '🕹');
      const paint = () => [a, j].forEach(c => c.classList.toggle('on', c.dataset.id === cur())); cards.append(a, j); paint();
      body.append(row('🎮', 'TIPO DE CONTROLE', cards), note('Dentro da partida, o botão CONTROLES muda o tamanho, a posição e a transparência de cada botão. Teclado: setas/WASD mexem, ↑ ou espaço sobe (segure), J/Z soca, M carrega Ki.'));
    },
    audio() {
      const vol = slider(() => (A ? A.state.volume : 0), v => { if (!A) return; A.setVolume(v); if (A.state.muted && v > 0) A.setMuted(false); });
      const X = window.SaiyanSFX, fx = slider(() => (X ? X.state.volume : 0), v => { if (!X) return; X.setVolume(v); if (v > 0 && !X.state.enabled) X.setEnabled(true); X.play('punch'); }, !X), ck = check('Música de fundo', musicOn, musicSet, !A), ck2 = check('Efeitos sonoros', () => X && X.state.enabled, on => X && X.setEnabled(on), !X);
      live.push(() => { vol.repaint(); ck.repaint(); });
      body.append(row('🎵', 'VOLUME DA MÚSICA', vol), row('💥', 'VOLUME DOS EFEITOS', fx, note('Soco, poder pequeno, grande e único.')), el('div', 'cf-checks')); body.lastChild.append(ck, ck2);
    },
    video() {
      const ck = check('Tela cheia', fsGet, fsSet, !(window.SLFullscreen));
      body.append(row('🖥', 'EXIBIÇÃO', el('div', 'cf-checks one')), note('A imagem sempre se ajusta à tela do aparelho, sem cortar nem desfocar. Não há opções de qualidade gráfica.')); body.querySelector('.cf-checks').append(ck);
    },
    sobre() {
      { const w = el('div', 'cf-staff'), i = el('input', 'cf-sin', { type: 'password', placeholder: 'Código da equipe', autocomplete: 'off', maxLength: 80 }), b = el('button', 'cf-sbtn', { type: 'button', textContent: 'ATIVAR' }), c = el('button', 'cf-sbtn alt', { type: 'button', textContent: 'REMOVER' });
        try { i.value = localStorage.getItem('sl.staff') || ''; } catch (_) {}
        const done = (m, ok) => { say(m); if (ok) { try { localStorage.setItem('sl.staff', i.value.trim()); } catch (_) {} } };
        b.addEventListener('click', async () => { try { const t = await SaiyanGame.service.setStaff(i.value.trim()); if (t) { done('Tag ativada: <' + t + '>', true); } else say('Digite o código.'); } catch (e) { say(e.message || 'Código inválido.'); } });
        c.addEventListener('click', async () => { try { await SaiyanGame.service.setStaff(''); } catch (_) {} i.value = ''; try { localStorage.removeItem('sl.staff'); } catch (_) {} say('Tag removida.'); });
        w.append(i, b, c); setTimeout(() => body.append(row('🏷', 'EQUIPE', w, note('Só para a equipe do jogo. Mostra a sua tag ao lado do nome.'))), 0); }
      if (typeof M.exit === 'function') { const ex = el('button', 'cf-ck', { type: 'button' }); ex.append(el('span', '', { textContent: '⏻ Sair do jogo' })); ex.addEventListener('click', () => M.exit()); setTimeout(() => { const w = el('div', 'cf-checks one'); w.append(ex); body.append(row('⏻', 'SAIR', w)); }, 0); }
      body.append(row('ℹ', 'SAIYAN LEGENDS ONLINE', note('Jogo de luta 2D em pixel art. Salas online, modo contra bots e treino.')), row('🎮', 'COMUNIDADE', (() => { const r = el('div', 'cf-checks one'); r.append(Object.assign(el('button', 'cf-ck', { type: 'button' }), { onclick: () => S.open('social') })); r.firstChild.append(el('i'), el('span', '', { textContent: 'Discord, YouTube e redes' })); r.firstChild.querySelector('i').style.display = 'none'; return r; })()));
    }
  };

  function render() {
    body.replaceChildren(); live.length = 0; pages[tab]();
    nav.querySelectorAll('.cf-tab').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
  }
  TABS.forEach(([id, label, ico]) => { const b = el('button', 'cf-tab', { type: 'button' }); b.dataset.t = id; b.append(el('i', '', { textContent: ico }), el('span', '', { textContent: label })); b.addEventListener('click', () => { tab = id; render(); }); nav.append(b); });
  const reset = el('button', 'cf-btn alt', { type: 'button', textContent: '↻ RESTAURAR' }), ok = el('button', 'cf-btn', { type: 'button', textContent: '✓ APLICAR' });
  reset.addEventListener('click', () => { if (A) { A.setVolume(.6); A.setMuted(false); } if (window.SaiyanSFX) { SaiyanSFX.setVolume(.8); SaiyanSFX.setEnabled(true); } SL.ControlType.set('arrows'); render(); say('Padrões restaurados.'); });
  ok.addEventListener('click', () => S.close()); foot.append(reset, ok); close.addEventListener('click', () => S.close());

  const onAudio = () => live.forEach(f => f()); if (A) A.on('change', onAudio);
  const fit = () => { const W = p.clientWidth, H = p.clientHeight; if (!W || !H) return; const k = Math.min(W / STAGE.w, H / STAGE.h); stage.style.transform = `translate(${(W - STAGE.w * k) / 2}px,${(H - STAGE.h * k) / 2}px) scale(${k})`; };
  const ro = new ResizeObserver(fit); ro.observe(p); fit(); render();
  const key = e => { if (e.key === 'Escape') S.close(); }; addEventListener('keydown', key);
  return () => { ro.disconnect(); if (A) A.off('change', onAudio); removeEventListener('keydown', key); clearTimeout(tt); };
} });
})();
