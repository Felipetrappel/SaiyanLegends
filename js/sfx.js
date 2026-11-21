/* Efeitos sonoros (sintetizados com Web Audio — sem arquivos): SOCO, PODER PEQUENO, PODER GRANDE, PODER ÚNICO e impacto de dano.
 * Volume/ligado ficam em localStorage 'sl.sfx'; respeitam o "silenciar" geral do SaiyanAudio.
 * API: SaiyanSFX.play(nome) · state(estadoDoLutador) · setVolume(0..1) · setEnabled(bool) · state */
(() => {
'use strict';
const KEY = 'sl.sfx', st = { volume: .8, enabled: true };
try { const d = JSON.parse(localStorage.getItem(KEY) || '{}'); if ('volume' in d) st.volume = Math.min(1, Math.max(0, +d.volume || 0)); if ('enabled' in d) st.enabled = !!d.enabled; } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
let ctx = null, master = null, noiseBuf = null, last = {};
const AC = window.AudioContext || window.webkitAudioContext;
function init() {
  if (ctx || !AC) return ctx;
  try { ctx = new AC(); master = ctx.createGain(); master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } catch (e) { ctx = null; }
  return ctx;
}
const wake = () => { init(); if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); };
['pointerdown', 'keydown', 'touchend'].forEach(t => addEventListener(t, wake, true));

/* peças básicas */
const env = (g, t, a, peak, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
function tone(t, type, f0, f1, a, d, peak) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + a + d); env(g, t, a, peak, d); o.connect(g).connect(master); o.start(t); o.stop(t + a + d + .05); }
function noise(t, ftype, f0, f1, a, d, peak, q) { const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noiseBuf; s.loop = true; f.type = ftype; f.Q.value = q || 1; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + a + d); env(g, t, a, peak, d); s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + a + d + .05); }

const SOUNDS = {
  punch(t) { noise(t, 'bandpass', 900, 3200, .02, .11, .5, 1.2); tone(t + .05, 'triangle', 190, 60, .004, .12, .7); noise(t + .05, 'lowpass', 1500, 200, .002, .07, .5); },
  hit(t) { tone(t, 'square', 150, 45, .002, .13, .6); noise(t, 'lowpass', 2500, 300, .002, .1, .7); },
  small(t) { tone(t, 'sine', 420, 1100, .01, .22, .45); tone(t, 'triangle', 840, 1800, .01, .16, .18); noise(t, 'bandpass', 1500, 4000, .01, .18, .22, 2); },
  big(t) { tone(t, 'sawtooth', 90, 420, .25, .35, .35); tone(t, 'sine', 180, 840, .25, .35, .35); noise(t, 'bandpass', 300, 2500, .3, .3, .3, 1.5);
    tone(t + .5, 'sawtooth', 220, 55, .02, .9, .55); tone(t + .5, 'sine', 110, 40, .02, 1.0, .75); noise(t + .5, 'lowpass', 3500, 150, .02, .8, .65); },
  unique(t) { tone(t, 'sine', 300, 2400, .02, .5, .4); tone(t + .03, 'triangle', 450, 3600, .02, .45, .25); noise(t, 'highpass', 800, 7000, .02, .45, .28, .8);
    tone(t + .38, 'square', 140, 35, .01, .55, .45); noise(t + .38, 'lowpass', 4000, 200, .01, .5, .55); tone(t + .38, 'sine', 1600, 500, .01, .6, .22); }
};
const MIN = { punch: .09, hit: .05, small: .1, big: .4, unique: .4 };
function play(name, vol) {
  if (!st.enabled || st.volume <= 0 || !SOUNDS[name]) return;
  if (window.SaiyanAudio && SaiyanAudio.state.muted) return;
  if (!init()) return; if (ctx.state === 'suspended') { ctx.resume().catch(() => {}); if (ctx.state !== 'running') return; }
  const now = ctx.currentTime; if (last[name] && now - last[name] < MIN[name]) return; last[name] = now;
  master.gain.setValueAtTime(st.volume * (vol == null ? 1 : vol), now); SOUNDS[name](now + .005);
}
/* estado do lutador → som */
const MAP = { attack: 'punch', cast: 'small', charge: 'small', barrage: 'small', big: 'big', sun: 'big', burst: 'unique', dash: 'unique', ice: 'unique', transform: 'unique' };
const api = window.SaiyanSFX = {
  play, get state() { return { ...st }; },
  fighterState(s) { const n = MAP[s]; if (n) play(n); },
  setVolume(v) { st.volume = Math.min(1, Math.max(0, +v || 0)); save(); },
  setEnabled(b) { st.enabled = !!b; save(); }
};
})();
