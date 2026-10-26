// Le menu « appli » : onglets qui suivent le défilement, installation sur l'écran d'accueil, mise en cache.
(function () {
  'use strict';
  // ---- onglets
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.mtabs a')), secs = tabs.map(function (a) { return document.querySelector(a.getAttribute('href')); });
  function setTab(id) { tabs.forEach(function (a) { a.classList.toggle('is-on', a.getAttribute('href') === '#' + id); }); var on = document.querySelector('.mtabs a.is-on'); if (on && on.scrollIntoView) on.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); }
  if ('IntersectionObserver' in window && secs.length) {
    var io = new IntersectionObserver(function (entries) { entries.forEach(function (e) { if (e.isIntersecting) setTab(e.target.id); }); }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
    secs.forEach(function (s) { if (s) io.observe(s); });
  }
  tabs.forEach(function (a) { a.addEventListener('click', function () { setTab(a.getAttribute('href').slice(1)); }); });

  // ---- installation
  var card = document.getElementById('installer'), btn = document.getElementById('installBtn'), guide = document.getElementById('iosGuide');
  var standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  var isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  var deferred = null;
  if (!standalone && card) {
    if (isIos) { card.hidden = false; btn.addEventListener('click', function () { guide.hidden = !guide.hidden; btn.textContent = guide.hidden ? 'Installer le menu' : 'Masquer le mode d\'emploi'; }); }
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault(); deferred = e; card.hidden = false; guide.hidden = true;
      btn.onclick = function () { if (!deferred) return; deferred.prompt(); deferred.userChoice.then(function () { deferred = null; }); };
    });
    window.addEventListener('appinstalled', function () { card.hidden = true; });
  }
  // ---- mise en cache pour l'écran d'accueil (et consultation sans réseau)
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(function () {});
})();
