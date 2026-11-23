/* Tela inicial "Pressione na tela para jogar" */
(function () {
  'use strict';
  if (window.__spShown) return; window.__spShown = true;
  var TXT = { 'pt-BR': 'Pressione na tela para jogar', 'en-US': 'Tap the screen to play' };
  function lang() { try { return (window.SLLogin && window.SLLogin.lang()) || localStorage.getItem('sl.lang') || 'pt-BR'; } catch (e) { return 'pt-BR'; } }
  var root = document.createElement('div'); root.id = 'sp'; root.setAttribute('role', 'button'); root.tabIndex = 0;
  root.innerHTML = '<div class="sp-bg"></div><div class="sp-stage"><div class="sp-art"></div>' +
    '<div class="sp-txt"><span></span></div>' +
    '<button class="sp-flag sp-uk" data-l="en-US" aria-label="English"></button>' +
    '<button class="sp-flag sp-br" data-l="pt-BR" aria-label="Português"></button></div>';
  document.body.appendChild(root);
  var txt = root.querySelector('.sp-txt span');
  function paint() {
    var l = lang(); txt.textContent = TXT[l] || TXT['pt-BR'];
    root.querySelectorAll('.sp-flag').forEach(function (b) { b.classList.toggle('on', b.dataset.l === l); });
  }
  paint();
  var done = false;
  function close() {
    if (done) return; done = true;
    try { if (window.SaiyanSFX && SaiyanSFX.click) SaiyanSFX.click(); } catch (e) {}
    root.classList.add('out'); setTimeout(function () { root.remove(); }, 450);
  }
  root.addEventListener('click', function (e) {
    var f = e.target.closest && e.target.closest('.sp-flag');
    if (f) { e.stopPropagation(); if (window.SLLogin) window.SLLogin.setLang(f.dataset.l); else try { localStorage.setItem('sl.lang', f.dataset.l); } catch (x) {} paint(); return; }
    close();
  });
  root.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); close(); } });
  root.focus();
})();
