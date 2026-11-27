/* Tela inicial "Pressione na tela para jogar" */
(function () {
  'use strict';
  if (window.__spShown) return; window.__spShown = true;
  var TXT = { 'pt-BR': 'Pressione na tela para jogar', 'en-US': 'Tap the screen to play' };
  function lang() { try { return (window.SLLogin && window.SLLogin.lang()) || localStorage.getItem('sl.lang') || 'pt-BR'; } catch (e) { return 'pt-BR'; } }
  var root = document.createElement('div'); root.id = 'sp'; root.setAttribute('role', 'button'); root.tabIndex = 0;
  root.innerHTML = '<div class="sp-l"></div><div class="sp-c"></div><div class="sp-r"></div><div class="sp-txt"><span></span></div>' +
    '<button class="sp-flag sp-uk" data-l="en-US" aria-label="English"></button><button class="sp-flag sp-br" data-l="pt-BR" aria-label="Português"></button>';
  document.body.appendChild(root);
  var txt = root.querySelector('.sp-txt span'), q = function (c) { return root.querySelector(c); };
  /* Tela cheia SEM bordas e SEM desfoque: o miolo da arte (x 418–1254) mantém a proporção; só as laterais (cenário/moldura) se esticam para preencher. */
  function layout() {
    var W = root.clientWidth, H = root.clientHeight, s = H / 941, cw = 836 * s, side, off = 0;
    if (W / H < 1672 / 941) { s = W / 1672; cw = 836 * s; off = (H - 941 * s) / 2; }
    side = (W - cw) / 2; var h = 941 * s, K = side / 418, X = function (x) { return x < 418 ? x * K : x < 1254 ? side + (x - 418) * s : side + cw + (x - 1254) * K; };
    var set = function (el, l, w) { el.style.left = l + 'px'; el.style.width = w + 'px'; el.style.top = off + 'px'; el.style.height = h + 'px'; };
    set(q('.sp-l'), 0, Math.ceil(side) + 1); q('.sp-l').style.backgroundSize = side * 4 + 'px ' + h + 'px';
    set(q('.sp-c'), Math.floor(side), Math.ceil(cw) + 1); q('.sp-c').style.backgroundSize = 1672 * s + 'px ' + h + 'px';
    set(q('.sp-r'), Math.floor(side + cw), Math.ceil(side) + 1); q('.sp-r').style.backgroundSize = side * 4 + 'px ' + h + 'px';
    var t = q('.sp-txt'); t.style.left = X(470) + 'px'; t.style.width = (X(1196) - X(470)) + 'px'; t.style.top = off + 838 * s + 'px'; t.style.height = 68 * s + 'px'; txt.style.fontSize = 45 * s + 'px';
    [['.sp-uk', 75, 177], ['.sp-br', 193, 291]].forEach(function (f) { var e = q(f[0]), w = (f[2] - f[1]) * s * 1.02; e.style.width = w + 'px'; e.style.height = 75 * s + 'px'; e.style.left = X((f[1] + f[2]) / 2) - w / 2 + 'px'; e.style.top = off + 828 * s + 'px'; });
  }
  layout(); addEventListener('resize', layout); addEventListener('orientationchange', function () { setTimeout(layout, 200); });
  function paint() {
    var l = lang(); txt.textContent = TXT[l] || TXT['pt-BR'];
    root.querySelectorAll('.sp-flag').forEach(function (b) { b.classList.toggle('on', b.dataset.l === l); });
  }
  paint();
  var done = false;
  function close() {
    if (done) return; done = true;
    try { if (window.SaiyanSFX && SaiyanSFX.click) SaiyanSFX.click(); } catch (e) {}
    intro(function () { root.classList.add('out'); setTimeout(function () { root.remove(); removeEventListener('resize', layout); }, 450); });
  }
  /* INTRODUÇÃO (GIF animado, tela cheia, sem desfoque): toca 2 voltas (4,5 s) logo após o toque; toque/tecla pula. */
  function intro(next) {
    var v = document.createElement('div'); v.id = 'sp-intro'; var im = document.createElement('img'); im.alt = ''; im.draggable = false; im.src = 'assets/ui/intro.gif?' + Date.now(); v.appendChild(im); document.body.appendChild(v);
    var end = false, tm, fin = function () { if (end) return; end = true; clearTimeout(tm); removeEventListener('keydown', fin); v.classList.add('out'); setTimeout(function () { v.remove(); }, 450); next(); };
    requestAnimationFrame(function () { v.classList.add('on'); }); tm = setTimeout(fin, 4500); v.addEventListener('click', fin); addEventListener('keydown', fin);
  }
  root.addEventListener('click', function (e) {
    var f = e.target.closest && e.target.closest('.sp-flag');
    if (f) { e.stopPropagation(); if (window.SLLogin) window.SLLogin.setLang(f.dataset.l); else try { localStorage.setItem('sl.lang', f.dataset.l); } catch (x) {} paint(); return; }
    close();
  });
  root.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); close(); } });
  root.focus();
})();
