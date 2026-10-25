/* JavaScript commun à toutes les pages.
   - lit l'état injecté par le serveur (#site-state) : "Ce soir", exceptions, prix
   - carrousel du hero (page d'accueil)
   - fenêtre de contact + envoi du formulaire vers /api/devis */
(function () {
  'use strict';

  // ---------- État du site ----------
  var state = null;
  try { var el = document.getElementById('site-state'); if (el) state = JSON.parse(el.textContent); } catch (e) { state = null; }

  var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  function dateFr(iso) { var p = iso.split('-'); var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); return JOURS[d.getUTCDay()] + ' ' + (+p[2]) + ' ' + MOIS[+p[1] - 1]; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---------- "Ce soir" / prochaine escale ----------
  var title = document.getElementById('tonightTitle'), text = document.getElementById('tonightText'), dot = document.getElementById('tonightDot');
  var pill = document.getElementById('navPill'), pillText = document.getElementById('navPillText');
  var tickets = document.querySelectorAll('.ticket');
  function flagTicket(jour, cls, label) {
    tickets.forEach(function (t) { if (t.dataset.jour == String(jour)) { t.classList.add(cls); var f = t.querySelector('.ticket__flag'); if (f) f.textContent = label; } });
  }

  var tonight = state && state.tonight;
  if (!tonight) {
    // Secours sans serveur (aperçu local) : calcul simple à partir des tickets présents
    var now = new Date(), d = now.getDay(), mins = now.getHours() * 60 + now.getMinutes();
    var byDay = {};
    tickets.forEach(function (t) { byDay[t.dataset.jour] = { ville: t.querySelector('h3') && t.querySelector('h3').textContent, lieu: t.querySelector('.ticket__place a') && t.querySelector('.ticket__place a').textContent, weekday: +t.dataset.jour, heures: 'de 19h à 20h30' }; });
    tonight = { tonight: null, next: null, cancelledToday: null };
    if (byDay[d] && mins < 20 * 60 + 30) tonight.tonight = byDay[d];
    else for (var i = 1; i <= 7; i++) { var nd = (d + i) % 7; if (byDay[nd]) { tonight.next = Object.assign({ inDays: i }, byDay[nd]); break; } }
  }

  if (tonight.tonight) {
    var s = tonight.tonight;
    if (title) title.textContent = 'Ce soir, on est à ' + s.ville;
    if (text) text.innerHTML = esc(s.lieu) + ', ' + esc(s.heures || 'de 19h à 20h30') + '. ' + (s.map_url ? '<a href="' + esc(s.map_url) + '" target="_blank" rel="noopener">Voir le plan</a>' : '<a href="#emplacements">Nos emplacements</a>');
    if (pillText) pillText.textContent = 'Ce soir : ' + s.ville + ', ' + (s.heures || 'de 19h à 20h30');
    flagTicket(s.weekday, 'is-today', 'Ce soir');
  } else {
    var n = tonight.next, c = tonight.cancelledToday;
    if (title) title.textContent = c ? 'Pas de service ce soir' + (c.message ? ' : ' + c.message.toLowerCase() : '') : 'Pas de service ce soir';
    if (n) {
      var quand = n.inDays === 1 ? 'demain' : (n.inDays <= 6 ? JOURS[n.weekday] : dateFr(n.date));
      if (text) text.innerHTML = 'Prochaine escale ' + esc(quand) + ' à ' + esc(n.ville) + ', ' + esc(n.lieu) + ', ' + esc(n.heures || 'de 19h à 20h30') + '. <a href="#emplacements">Nos emplacements</a>';
      if (pillText) pillText.textContent = 'Prochaine escale : ' + quand + ' à ' + n.ville;
      flagTicket(n.weekday, 'is-next', 'Prochaine escale');
    } else {
      if (text) text.innerHTML = 'Retrouvez nos horaires et emplacements ci-dessous. <a href="#emplacements">Nos emplacements</a>';
      if (pillText) pillText.textContent = 'Nos emplacements';
    }
    if (pill) pill.classList.add('is-off');
    if (dot) dot.classList.add('is-off');
  }

  // Dates annulées ou déplacées à venir : signalées sur les tickets de la semaine
  if (state && state.exceptions && tickets.length) {
    state.exceptions.forEach(function (x) {
      if (x.date < state.today) return;
      var p = x.date.split('-'), wd = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay();
      tickets.forEach(function (t) {
        if (t.dataset.jour != String(wd) || t.querySelector('.ticket__exception')) return;
        var line = document.createElement('span'); line.className = 'ticket__exception';
        line.textContent = x.annule ? ('Pas de service le ' + dateFr(x.date) + (x.message ? ' (' + x.message + ')' : '')) : ('Le ' + dateFr(x.date) + ' : ' + (x.ville || t.querySelector('h3').textContent) + (x.lieu ? ', ' + x.lieu : ''));
        if (x.annule) { t.setAttribute('data-annule', '1'); var f = t.querySelector('.ticket__flag'); if (f && !t.classList.contains('is-today') && !t.classList.contains('is-next')) f.textContent = 'Annulé le ' + (+p[2]) + '/' + p[1]; }
        t.appendChild(line);
      });
    });
  }

  // ---------- Apparitions au défilement + barre compacte ----------
  var reveals = document.querySelectorAll('.reveal, .reveal-stagger');
  if ('IntersectionObserver' in window && reveals.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach(function (el) { io.observe(el); });
    // sécurité : tout ce qui n'a pas été vu après 4 s apparaît quand même
    setTimeout(function () { reveals.forEach(function (el) { el.classList.add('in'); }); }, 2500);
  } else { reveals.forEach(function (el) { el.classList.add('in'); }); }
  var navEl = document.getElementById('nav');
  if (navEl) {
    var onScroll = function () { navEl.classList.toggle('is-scrolled', window.scrollY > 24); };
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  }

  // ---------- Menu mobile ----------
  var nav = document.getElementById('nav'), burger = document.getElementById('navBurger');
  if (nav && burger) {
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      burger.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
    });
    nav.querySelectorAll('.nav__panel a, .nav__panel button').forEach(function (a) { a.addEventListener('click', function () { nav.classList.remove('is-open'); burger.setAttribute('aria-expanded', 'false'); }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { nav.classList.remove('is-open'); burger.setAttribute('aria-expanded', 'false'); } });
  }
  // la pastille du menu mobile reprend le texte de celle du haut
  var pillCopy = document.querySelector('[data-pill-copy]');
  if (pillCopy && pillText) { pillCopy.textContent = pillText.textContent; if (pill && pill.classList.contains('is-off')) pillCopy.parentNode.classList.add('is-off'); }

  // ---------- Carrousel du hero ----------
  var show = document.getElementById('show');
  if (show) {
    var figs = show.querySelectorAll('figure'), dots = document.getElementById('showDots');
    var name = document.getElementById('showName'), sub = document.getElementById('showSub'), price = document.getElementById('showPrice');
    var cur = 0, timer = null, reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (figs.length) {
      figs.forEach(function (f, i) {
        var b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-label', f.dataset.name);
        if (i === 0) b.classList.add('is-on');
        b.addEventListener('click', function () { go(i); restart(); });
        dots.appendChild(b);
      });
      var go = function (i) {
        cur = (i + figs.length) % figs.length;
        figs.forEach(function (f, k) { f.classList.toggle('is-on', k === cur); });
        dots.querySelectorAll('button').forEach(function (b, k) { b.classList.toggle('is-on', k === cur); });
        var f = figs[cur];
        name.firstChild.nodeValue = f.dataset.name;
        sub.textContent = f.hasAttribute('data-rupture') ? 'Épuisé ce soir' : f.dataset.sub;
        price.textContent = f.dataset.prix || f.dataset.price || '';
      };
      var restart = function () { clearInterval(timer); if (!reduce) timer = setInterval(function () { go(cur + 1); }, 4500); };
      go(0);
      document.getElementById('showPrev').addEventListener('click', function () { go(cur - 1); restart(); });
      document.getElementById('showNext').addEventListener('click', function () { go(cur + 1); restart(); });
      show.addEventListener('mouseenter', function () { clearInterval(timer); });
      show.addEventListener('mouseleave', restart);
      document.addEventListener('visibilitychange', function () { if (document.hidden) clearInterval(timer); else restart(); });
      restart();
    }
  }

  // ---------- Fenêtre de contact ----------
  var dlg = document.getElementById('contact');
  if (dlg) {
    // la page derrière est figée tant que la fenêtre est ouverte (sinon elle défile sous le doigt sur mobile)
    var savedY = 0;
    var openDlg = function () { try { savedY = window.scrollY || 0; dlg.showModal(); document.body.style.top = (-savedY) + 'px'; document.documentElement.classList.add('dlg-open'); } catch (e) {} };
    dlg.addEventListener('close', function () { document.documentElement.classList.remove('dlg-open'); document.body.style.top = ''; window.scrollTo(0, savedY); });
    document.querySelectorAll('[data-open-contact]').forEach(function (b) { b.addEventListener('click', openDlg); });
    document.querySelectorAll('[data-close-contact]').forEach(function (b) { b.addEventListener('click', function () { dlg.close(); }); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    if (location.hash === '#open-popup' || location.hash === '#contact') openDlg();

    var form = document.getElementById('contactForm'), status = document.getElementById('formStatus'), submit = form.querySelector('[type="submit"]'), sent = document.getElementById('formSent');
    // à chaque ouverture, on retrouve le formulaire (et non l'écran de confirmation précédent)
    document.querySelectorAll('[data-open-contact]').forEach(function (b) { b.addEventListener('click', function () { if (sent) { sent.hidden = true; form.hidden = false; } }); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      status.className = 'status';
      var required = form.querySelectorAll('[required]'), first = null;
      required.forEach(function (f) { var bad = !f.value.trim() || (f.checkValidity && !f.checkValidity()); if (bad && !first) first = f; });
      form.classList.add('was-validated');
      if (first) { first.focus(); status.textContent = 'Merci de remplir tous les champs : ils nous permettent de vous faire une proposition précise.'; status.classList.add('is-on', 'is-error'); return; }
      var data = Object.fromEntries(new FormData(form).entries());
      data.page = location.pathname;
      submit.disabled = true; submit.textContent = 'Envoi…';
      fetch('/api/devis', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { return r.json(); })
        .then(function (r) {
          if (!r.ok) throw new Error(r.error || 'Erreur');
          form.reset(); form.classList.remove('was-validated');
          if (sent) { form.hidden = true; sent.hidden = false; sent.scrollIntoView({ block: 'nearest' }); }
          else { status.textContent = 'Demande envoyée. Nous vous contacterons par mail ou téléphone dans les plus brefs délais.'; status.classList.add('is-on'); }
          if (window.dataLayer) window.dataLayer.push({ event: 'demande_devis', page: data.page, type: data.type });
          if (window.turnstile) { try { window.turnstile.reset(); } catch (e) {} }
        })
        .catch(function (err) {
          status.textContent = err.message === 'Erreur' ? 'L\'envoi a échoué. Appelez-nous au 07 82 54 98 29 ou réessayez dans un instant.' : err.message;
          status.classList.add('is-on', 'is-error');
        })
        .finally(function () { submit.disabled = false; submit.textContent = 'Envoyer ma demande'; });
    });
  }
})();

// ---------- Thème saisonnier : banderoles et décorations (fanions, guirlande de sapin, houx, toiles d'araignée, cocarde, herbe de Pâques…) ----------
(function () {
  var root = document.documentElement, theme = root.getAttribute('data-theme');
  if (!theme) return;
  var hero = document.querySelector('.hero, .page-hero'); if (!hero) return;
  var svgUrl = function (s) { return 'url("data:image/svg+xml,' + encodeURIComponent(s) + '")'; };
  // point sur l'arc de la corde (quadratique) : t de 0 à 1, largeur w, creux h
  var pt = function (t, w, h) { return [2 * (1 - t) * t * (w / 2) + t * t * w, (1 - t) * (1 - t) * 8 + 2 * (1 - t) * t * h + t * t * 8]; };
  var ang = function (t, w, h) { var a = pt(t - .01, w, h), b = pt(t + .01, w, h); return Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI; };

  // Une « vague » de banderole (tuile répétée horizontalement). kind : pennant | heart | egg | pine
  function bunting(kind, colors) {
    var w = 260, h = 60, items = '', rope = '<path d="M0 8 Q130 ' + (h + 8) + ' 260 8" fill="none" stroke="' + (kind === 'pine' ? '#1B5E20' : '#8B6B4E') + '" stroke-width="' + (kind === 'pine' ? 9 : 2) + '" stroke-linecap="round"/>';
    if (kind === 'pine') rope += '<path d="M0 8 Q130 ' + (h + 8) + ' 260 8" fill="none" stroke="#43A047" stroke-width="6" stroke-dasharray="2 5" stroke-linecap="round"/>';
    var ts = [.1, .3, .5, .7, .9];
    for (var i = 0; i < ts.length; i++) {
      var p = pt(ts[i], w, h), a = ang(ts[i], w, h), c = colors[i % colors.length], x = p[0].toFixed(1), y = p[1].toFixed(1);
      var g = '<g transform="translate(' + x + ' ' + y + ') rotate(' + a.toFixed(1) + ')">';
      if (kind === 'pennant') g += '<path d="M-15 0 L15 0 L0 36 Z" fill="' + c + '"/><path d="M-15 0 L15 0 L11 5 L-11 5 Z" fill="rgba(0,0,0,.12)"/>';
      else if (kind === 'heart') g += '<path d="M0 30 C-16 18 -16 4 -7 3 C-3 3 -1 6 0 9 C1 6 3 3 7 3 C16 4 16 18 0 30Z" fill="' + c + '"/><line x1="0" y1="0" x2="0" y2="5" stroke="#8B6B4E" stroke-width="1.5"/>';
      else if (kind === 'egg') g += '<line x1="0" y1="0" x2="0" y2="6" stroke="#8B6B4E" stroke-width="1.5"/><path d="M0 6 C-11 6 -14 22 -11 30 C-8 38 8 38 11 30 C14 22 11 6 0 6Z" fill="' + c + '"/><path d="M-9 18 Q0 14 9 18 M-10 24 Q0 28 10 24" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="2"/>';
      else if (kind === 'pine') g += '<line x1="0" y1="0" x2="0" y2="8" stroke="#C9A24A" stroke-width="1.5"/><circle cx="0" cy="17" r="9" fill="' + c + '"/><circle cx="-3" cy="14" r="3" fill="rgba(255,255,255,.35)"/>';
      items += g + '</g>';
    }
    return svgUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' 100" width="' + w + '" height="100">' + rope + items + '</svg>');
  }
  // Toile d'araignée dans un coin (rayons + anneaux légèrement creusés)
  function cobweb() {
    var s = '', R = [22, 44, 66, 88, 110], A = [];
    for (var a = 0; a <= 90; a += 15) A.push(a * Math.PI / 180);
    for (var i = 0; i < A.length; i++) s += '<line x1="0" y1="0" x2="' + (Math.cos(A[i]) * 120).toFixed(1) + '" y2="' + (Math.sin(A[i]) * 120).toFixed(1) + '"/>';
    for (var r = 0; r < R.length; r++) for (var j = 0; j < A.length - 1; j++) {
      var p1 = [Math.cos(A[j]) * R[r], Math.sin(A[j]) * R[r]], p2 = [Math.cos(A[j + 1]) * R[r], Math.sin(A[j + 1]) * R[r]], m = (A[j] + A[j + 1]) / 2, cr = R[r] * .88;
      s += '<path d="M' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1) + ' Q' + (Math.cos(m) * cr).toFixed(1) + ' ' + (Math.sin(m) * cr).toFixed(1) + ' ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1) + '"/>';
    }
    return '<svg class="deco-web" viewBox="0 0 120 120" aria-hidden="true"><g fill="none" stroke="#EDE7F6" stroke-opacity=".55" stroke-width="1.1">' + s + '</g></svg>';
  }
  var SPIDER = '<div class="deco-spider" aria-hidden="true"><svg viewBox="0 0 40 40"><g stroke="#111" stroke-width="2" stroke-linecap="round" fill="none"><path d="M14 20 L4 12 M14 23 L3 22 M14 26 L5 33 M16 28 L10 38 M26 20 L36 12 M26 23 L37 22 M26 26 L35 33 M24 28 L30 38"/></g><ellipse cx="20" cy="24" rx="8" ry="10" fill="#161616"/><circle cx="20" cy="12" r="5" fill="#161616"/><circle cx="18" cy="11" r="1.2" fill="#F3AD3F"/><circle cx="22" cy="11" r="1.2" fill="#F3AD3F"/></svg></div>';
  var HOLLY = '<svg class="deco-holly" viewBox="0 0 120 80" aria-hidden="true"><path d="M12 42 C22 8 54 8 60 36 C44 44 26 52 12 42Z" fill="#2E7D32"/><path d="M108 42 C98 8 66 8 60 36 C76 44 94 52 108 42Z" fill="#388E3C"/><path d="M60 36 C44 44 26 52 12 42" fill="none" stroke="#1B5E20" stroke-width="1.5"/><path d="M60 36 C76 44 94 52 108 42" fill="none" stroke="#1B5E20" stroke-width="1.5"/><circle cx="52" cy="46" r="7" fill="#D32F2F"/><circle cx="68" cy="47" r="7" fill="#C62828"/><circle cx="60" cy="58" r="7" fill="#E53935"/><circle cx="50" cy="43" r="2" fill="rgba(255,255,255,.5)"/></svg>';
  var HAT = '<svg class="deco-hat" viewBox="0 0 64 52" aria-hidden="true"><path d="M8 40 C4 18 24 4 46 9 C38 14 40 24 54 30 L56 38 Z" fill="#D32F2F"/><path d="M4 36 h52 a6 6 0 0 1 0 12 h-52 a6 6 0 0 1 0 -12z" fill="#fff"/><circle cx="47" cy="9" r="6" fill="#fff"/></svg>';
  var EARS = '<svg class="deco-ears" viewBox="0 0 64 60" aria-hidden="true"><path d="M18 58 C6 40 4 14 14 6 C24 -2 30 30 30 56Z" fill="#F5E6D3"/><path d="M19 52 C12 38 11 18 16 12 C21 8 25 32 25 52Z" fill="#F8BBD0"/><path d="M46 58 C58 40 60 14 50 6 C40 -2 34 30 34 56Z" fill="#F5E6D3"/><path d="M45 52 C52 38 53 18 48 12 C43 8 39 32 39 52Z" fill="#F8BBD0"/></svg>';
  var COCARDE = '<svg class="deco-cocarde" viewBox="0 0 80 100" aria-hidden="true"><path d="M30 60 L18 98 L30 90 L40 98 Z" fill="#2457C5"/><path d="M50 60 L62 98 L50 90 L40 98 Z" fill="#E53935"/><circle cx="40" cy="40" r="36" fill="#2457C5"/><circle cx="40" cy="40" r="25" fill="#fff"/><circle cx="40" cy="40" r="13" fill="#E53935"/></svg>';
  function grass() {
    var s = '', i;
    for (i = 0; i < 26; i++) { var x = 4 + i * 10 + (i % 3) * 2, hh = 18 + (i * 7) % 16; s += '<path d="M' + x + ' 46 Q' + (x + 3) + ' ' + (46 - hh / 2) + ' ' + (x + (i % 2 ? 6 : -4)) + ' ' + (46 - hh) + '" stroke="' + (i % 2 ? '#66BB6A' : '#43A047') + '" stroke-width="3" fill="none" stroke-linecap="round"/>'; }
    [[40, '#F48FB1'], [120, '#FFF176'], [200, '#CE93D8']].forEach(function (f) { s += '<path d="M' + f[0] + ' 46 L' + f[0] + ' 24" stroke="#43A047" stroke-width="2.5"/><path d="M' + (f[0] - 7) + ' 26 L' + (f[0] - 7) + ' 14 Q' + f[0] + ' 20 ' + (f[0] + 7) + ' 14 L' + (f[0] + 7) + ' 26 Q' + f[0] + ' 32 ' + (f[0] - 7) + ' 26Z" fill="' + f[1] + '"/>'; });
    return svgUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 46" width="260" height="46">' + s + '</svg>');
  }

  var DECO = {
    'noel': { bunting: bunting('pine', ['#E53935', '#F2C14E', '#E53935', '#43A047', '#F2C14E']), ribbon: 'Joyeuses fêtes !', hat: HAT, corner: HOLLY, snowcap: true },
    'halloween': { bunting: bunting('pennant', ['#FF7A1A', '#1A1A1A', '#9C4DCC', '#FF7A1A', '#1A1A1A']), ribbon: 'Halloween au food-truck !', webs: true, spider: true },
    'fete-nationale': { bunting: bunting('pennant', ['#2457C5', '#FFFFFF', '#E53935', '#2457C5', '#FFFFFF']), ribbon: 'Vive le 14 juillet !', corner: COCARDE },
    'saint-valentin': { bunting: bunting('heart', ['#E53935', '#F48FB1', '#D81B60', '#F8A5C2', '#E53935']), ribbon: 'Avec amour ♥', corner: '<svg class="deco-hearts" viewBox="0 0 80 60" aria-hidden="true"><path d="M22 52 C0 36 2 14 14 13 C19 13 21 17 22 21 C23 17 25 13 30 13 C42 14 44 36 22 52Z" fill="#E53935"/><path d="M52 40 C36 28 38 12 46 12 C50 12 51 15 52 17 C53 15 54 12 58 12 C66 12 68 28 52 40Z" fill="#F48FB1"/><path d="M66 56 C56 48 57 38 62 38 C64 38 65 40 66 41 C67 40 68 38 70 38 C75 38 76 48 66 56Z" fill="#D81B60"/></svg>' },
    'paques': { bunting: bunting('egg', ['#F48FB1', '#FFF176', '#A5D6A7', '#90CAF9', '#CE93D8']), ribbon: 'Joyeuses Pâques !', hat: EARS, grass: grass() }
  };
  var d = DECO[theme]; if (!d) return;

  // banderole sous la guirlande
  if (d.bunting) { var bt = document.createElement('div'); bt.className = 'deco-bunting'; bt.setAttribute('aria-hidden', 'true'); bt.style.backgroundImage = d.bunting; hero.appendChild(bt); }
  if (d.snowcap) { var sc = document.createElement('div'); sc.className = 'deco-snowcap'; sc.setAttribute('aria-hidden', 'true'); hero.appendChild(sc); }
  if (d.webs) { hero.insertAdjacentHTML('beforeend', '<div class="deco-webs" aria-hidden="true">' + cobweb() + cobweb() + '</div>'); }
  if (d.spider) hero.insertAdjacentHTML('beforeend', SPIDER);
  if (d.grass) { var gr = document.createElement('div'); gr.className = 'deco-grass'; gr.setAttribute('aria-hidden', 'true'); gr.style.backgroundImage = d.grass; hero.appendChild(gr); }
  // ruban avec le mot de circonstance, au-dessus du titre
  var kicker = hero.querySelector('.hero__kicker');
  if (d.ribbon && kicker) { var rb = document.createElement('div'); rb.className = 'deco-ribbon'; rb.innerHTML = '<span>' + d.ribbon + '</span>'; kicker.parentNode.insertBefore(rb, kicker); }
  // petite déco dans le coin de la carte « ce soir »
  var card = document.querySelector('.hero .tonight');
  if (d.corner && card) { card.classList.add('has-deco'); card.insertAdjacentHTML('beforeend', '<span class="deco-corner" aria-hidden="true">' + d.corner + '</span>'); }
  // bonnet ou oreilles sur le logo de la barre de navigation
  var logo = document.querySelector('.nav .brand .brand__logo');
  if (d.hat && logo) { var wr = document.createElement('span'); wr.className = 'deco-logowrap'; logo.parentNode.insertBefore(wr, logo); wr.appendChild(logo); wr.insertAdjacentHTML('beforeend', d.hat); }
})();

// ---------- Thème saisonnier : particules (flocons, confettis, citrouilles, cœurs, poussins) ----------
(function () {
  var root = document.documentElement, theme = root.getAttribute('data-theme');
  if (!theme || root.getAttribute('data-theme-fx') === '0') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var CFG = {
    'noel': { kind: 'snow', n: 110 },
    'halloween': { kind: 'glyph', glyphs: ['🎃', '🦇', '👻', '🦇'], n: 12, size: [18, 30], vy: [.25, .6], sway: 1.2 },
    'fete-nationale': { kind: 'confetti', colors: ['#2457C5', '#FFFFFF', '#E53935'], n: 80 },
    'saint-valentin': { kind: 'glyph', glyphs: ['❤️', '💕', '💗'], n: 16, size: [14, 26], vy: [-.35, -.15], sway: .8 },
    'paques': { kind: 'glyph', glyphs: ['🐣', '🥚', '🌷', '🐰'], n: 12, size: [18, 28], vy: [.2, .45], sway: .9 }
  };
  var cfg = CFG[theme]; if (!cfg) return;
  var canvas = document.createElement('canvas'); canvas.className = 'fx-canvas'; canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  var ctx = canvas.getContext('2d'), W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2), parts = [], raf = null, last = 0;
  var small = window.innerWidth < 700, N = Math.round(cfg.n * (small ? .55 : 1));
  var rnd = function (a, b) { return a + Math.random() * (b - a); };
  function resize() { W = window.innerWidth; H = window.innerHeight; canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  function spawn(p, top) {
    p.x = rnd(0, W); p.phase = rnd(0, Math.PI * 2);
    if (cfg.kind === 'snow') { p.r = rnd(1, 3.4); p.vy = rnd(.35, 1.1) * (p.r / 2); p.a = rnd(.45, .95); p.sw = rnd(.3, 1.1); p.y = top ? -10 : rnd(0, H); }
    else if (cfg.kind === 'confetti') { p.w = rnd(5, 9); p.h = rnd(8, 14); p.vy = rnd(.7, 1.8); p.rot = rnd(0, Math.PI); p.vr = rnd(-.06, .06); p.c = cfg.colors[Math.floor(Math.random() * cfg.colors.length)]; p.sw = rnd(.4, 1.3); p.y = top ? -20 : rnd(0, H); }
    else { p.g = cfg.glyphs[Math.floor(Math.random() * cfg.glyphs.length)]; p.s = rnd(cfg.size[0], cfg.size[1]); p.vy = rnd(cfg.vy[0], cfg.vy[1]); p.sw = rnd(.4, 1) * cfg.sway; p.a = rnd(.6, .95); p.y = top ? (p.vy < 0 ? H + 30 : -30) : rnd(0, H); }
    return p;
  }
  function step(t) {
    var dt = Math.min(40, t - last || 16) / 16; last = t;
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i]; p.phase += .015 * dt; p.y += p.vy * dt; p.x += Math.sin(p.phase) * p.sw * .4 * dt;
      if (cfg.kind === 'snow') { ctx.globalAlpha = p.a; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
      else if (cfg.kind === 'confetti') { p.rot += p.vr * dt; ctx.globalAlpha = .9; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * (0.4 + Math.abs(Math.cos(p.phase * 2)) * 0.6)); ctx.restore(); }
      else { ctx.globalAlpha = p.a; ctx.font = p.s + 'px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.fillText(p.g, p.x, p.y); }
      if (p.y > H + 40 || p.y < -40 || p.x < -40 || p.x > W + 40) spawn(p, true);
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(step);
  }
  function start() { if (!raf) { last = 0; raf = requestAnimationFrame(step); } }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }
  resize(); for (var i = 0; i < N; i++) parts.push(spawn({}, false));
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
  start();
})();
