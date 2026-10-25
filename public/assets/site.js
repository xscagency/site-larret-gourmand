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

// ---------- Thème saisonnier : motifs de fond et scènes animées (train de Noël, sorcière, Patrouille de France, montgolfière, lapin) ----------
(function () {
  var root = document.documentElement, theme = root.getAttribute('data-theme');
  if (!theme) return;
  var fx = root.getAttribute('data-theme-fx') !== '0' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var svgUrl = function (s) { return 'url("data:image/svg+xml,' + encodeURIComponent(s) + '")'; };

  // --- motifs ton sur ton (tracés fins), répartis sur une tuile de 240 px
  var MOTIFS = {
    'noel': [
      '<path d="M0 -17 L11 -3 L5 -3 L15 11 L-15 11 L-5 -3 L-11 -3 Z"/><path d="M-3 11 V17 H3 V11"/>',
      '<rect x="-12" y="-6" width="24" height="18" rx="2"/><rect x="-14" y="-11" width="28" height="6" rx="1"/><path d="M0 -11 V12 M-6 -11 C-11 -20 -1 -19 0 -11 C1 -19 11 -20 6 -11"/>',
      '<path d="M0 -16 V16 M-14 -8 L14 8 M-14 8 L14 -8 M0 -16 L-4 -11 M0 -16 L4 -11 M0 16 L-4 11 M0 16 L4 11 M-14 -8 L-13 -2 M-14 -8 L-8 -9 M14 8 L13 2 M14 8 L8 9 M-14 8 L-8 9 M-14 8 L-13 2 M14 -8 L8 -9 M14 -8 L13 -2"/>',
      '<path d="M-12 7 C-12 -8 0 -16 12 -12 C6 -8 7 -2 13 3"/><rect x="-14" y="6" width="28" height="6" rx="3"/><circle cx="13" cy="-11" r="3"/>',
      '<path d="M-5 15 V-6 A7 7 0 0 1 9 -6 V-1" stroke-width="4"/>',
      '<path d="M0 -15 L4 -5 L15 -5 L6 2 L9 13 L0 6 L-9 13 L-6 2 L-15 -5 L-4 -5 Z"/>'
    ],
    'halloween': [
      '<ellipse cx="0" cy="3" rx="15" ry="12"/><path d="M-5 -9 C-7 1 -7 7 -5 15 M5 -9 C7 1 7 7 5 15 M0 -9 V-15 Q4 -17 6 -13"/><path d="M-7 1 L-3 4 L-7 5Z M7 1 L3 4 L7 5Z M-6 8 L-3 11 L0 8 L3 11 L6 8" />',
      '<path d="M0 -2 C-3 -8 -8 -9 -16 -4 C-12 -3 -11 1 -13 5 C-9 3 -5 4 -3 8 L0 5 L3 8 C5 4 9 3 13 5 C11 1 12 -3 16 -4 C8 -9 3 -8 0 -2Z"/>',
      '<path d="M-11 14 V-2 A11 11 0 0 1 11 -2 V14 L7 10 L3 14 L0 10 L-3 14 L-7 10 Z"/><circle cx="-4" cy="-3" r="1.6"/><circle cx="4" cy="-3" r="1.6"/>',
      '<circle cx="0" cy="2" r="6"/><circle cx="0" cy="-7" r="3.5"/><path d="M-5 0 L-14 -6 M-6 3 L-15 3 M-5 6 L-13 12 M5 0 L14 -6 M6 3 L15 3 M5 6 L13 12 M0 -11 V-18"/>',
      '<path d="M4 -15 A14 14 0 1 0 12 10 A10 10 0 1 1 4 -15Z"/>'
    ],
    'fete-nationale': [
      '<path d="M0 -15 L4 -5 L15 -5 L6 2 L9 13 L0 6 L-9 13 L-6 2 L-15 -5 L-4 -5 Z"/>',
      '<path d="M0 -16 V-6 M11 -11 L5 -4 M16 0 H7 M11 11 L5 4 M0 16 V6 M-11 11 L-5 4 M-16 0 H-7 M-11 -11 L-5 -4"/><circle cx="0" cy="0" r="2"/>',
      '<circle cx="0" cy="-3" r="13"/><circle cx="0" cy="-3" r="8"/><circle cx="0" cy="-3" r="3"/><path d="M-5 9 L-8 17 L-3 15 L0 18 L3 15 L8 17 L5 9"/>',
      '<path d="M-3 -17 H3 L5 -6 Q6 2 12 10 H-12 Q-6 2 -5 -6 Z M-7 2 H7 M-5 -6 H5 M-12 10 L-16 18 M12 10 L16 18 M-9 18 Q0 10 9 18"/>',
      '<path d="M-10 -16 V16"/><path d="M-10 -14 H12 L8 -6 L12 2 H-10Z"/>'
    ],
    'saint-valentin': [
      '<path d="M0 13 C-18 1 -14 -14 -5 -12 C-2 -11 -1 -8 0 -6 C1 -8 2 -11 5 -12 C14 -14 18 1 0 13Z"/>',
      '<path d="M-15 12 L13 -10 M13 -10 L4 -11 M13 -10 L14 -1 M-15 12 L-10 4 M-15 12 L-7 11"/>',
      '<rect x="-14" y="-9" width="28" height="19" rx="2"/><path d="M-14 -9 L0 3 L14 -9"/>',
      '<circle cx="0" cy="-4" r="7"/><path d="M0 -4 m-3 0 a3 3 0 1 1 3 3 M0 3 V16 M0 9 C-5 7 -7 9 -8 12 M0 11 C5 9 7 11 8 14"/>',
      '<path d="M-12 6 C-12 -4 -4 -6 0 0 C4 -6 12 -4 12 6 M-12 6 Q0 2 12 6 M-12 6 Q0 10 12 6"/>'
    ],
    'paques': [
      '<path d="M0 -16 C-10 -16 -13 -2 -11 6 C-9 14 9 14 11 6 C13 -2 10 -16 0 -16Z"/><path d="M-10 -2 L-6 2 L-2 -2 L2 2 L6 -2 L10 2 M-11 6 Q0 2 11 6"/>',
      '<circle cx="0" cy="5" r="9"/><path d="M-5 -3 C-9 -12 -8 -19 -4 -18 C-1 -17 -1 -8 -2 -3 M5 -3 C9 -12 8 -19 4 -18 C1 -17 1 -8 2 -3"/><circle cx="-3" cy="4" r="1.2"/><circle cx="3" cy="4" r="1.2"/>',
      '<circle cx="2" cy="4" r="9"/><circle cx="-6" cy="-6" r="6"/><path d="M-12 -5 L-16 -4 L-12 -2 M11 4 L16 1 M11 7 L16 9"/><circle cx="-7" cy="-7" r="1"/>',
      '<path d="M-3 -2 L0 16 L3 -2 Z M0 -2 V-12 M0 -6 L-6 -11 M0 -6 L6 -11"/>',
      '<path d="M-8 -4 L-8 -14 L-4 -9 L0 -15 L4 -9 L8 -14 L8 -4 Q0 6 -8 -4Z M0 2 V16 M0 8 C-6 6 -8 8 -9 12 M0 10 C6 8 8 10 9 14"/>'
    ]
  };
  function pattern(color, alpha) {
    var m = MOTIFS[theme]; if (!m) return '';
    var pos = [[40, 44, -12], [150, 30, 10], [96, 120, 6], [206, 110, -8], [48, 196, 14], [168, 200, -5]];
    var s = '';
    for (var i = 0; i < pos.length; i++) s += '<g transform="translate(' + pos[i][0] + ' ' + pos[i][1] + ') rotate(' + pos[i][2] + ')">' + m[i % m.length] + '</g>';
    return svgUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240"><g fill="none" stroke="' + color + '" stroke-opacity="' + alpha + '" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">' + s + '</g></svg>');
  }
  var css = '';
  if (MOTIFS[theme]) {
    css += 'html[data-theme] .band:not(.band--kraft):not(.band--photo),html[data-theme] .foot,html[data-theme] .page-hero{background-image:' + pattern('#FCF3E3', .13) + ';background-size:240px 240px}';
    css += 'html[data-theme] .band--kraft{background-image:' + pattern('#2A1A10', .11) + ',radial-gradient(rgba(255,255,255,.22) 1px,transparent 1.5px),radial-gradient(rgba(60,30,10,.07) 1px,transparent 1.5px);background-size:240px 240px,7px 7px,11px 11px;background-position:0 0,0 0,4px 6px}';
  }

  // --- scènes animées
  var SCENES = {
    'noel': { cls: 'train', html: '<svg viewBox="0 -30 420 150" aria-hidden="true"><defs><linearGradient id="tr-red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F05A4A"/><stop offset=".45" stop-color="#C62828"/><stop offset="1" stop-color="#7F1414"/></linearGradient><linearGradient id="tr-green" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5DB36A"/><stop offset=".5" stop-color="#2E7D32"/><stop offset="1" stop-color="#1B4D1E"/></linearGradient><linearGradient id="tr-blue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4F8DE0"/><stop offset=".5" stop-color="#1E5BB8"/><stop offset="1" stop-color="#143F82"/></linearGradient><linearGradient id="tr-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE59A"/><stop offset=".5" stop-color="#F2C14E"/><stop offset="1" stop-color="#B8860B"/></linearGradient><linearGradient id="tr-dark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#546E7A"/><stop offset="1" stop-color="#1F2A30"/></linearGradient><radialGradient id="tr-lamp" cx=".4" cy=".4" r=".7"><stop offset="0" stop-color="#FFFDE7"/><stop offset=".5" stop-color="#FFD54F"/><stop offset="1" stop-color="#F57F17"/></radialGradient><radialGradient id="tr-glow"><stop offset="0" stop-color="#FFE082" stop-opacity=".55"/><stop offset="1" stop-color="#FFE082" stop-opacity="0"/></radialGradient></defs><ellipse cx="210" cy="116" rx="200" ry="6" fill="rgba(0,0,0,.28)"/><g class="smoke" fill="#fff"><circle cx="52" cy="4" r="7"/><circle cx="64" cy="-8" r="10"/><circle cx="82" cy="-20" r="13"/></g><circle cx="30" cy="62" r="22" fill="url(#tr-glow)"/><path d="M4 110 L26 82 L30 82 L30 110Z" fill="url(#tr-dark)"/><path d="M10 110 L28 88 M16 110 L29 94 M22 110 L30 100" stroke="#90A4AE" stroke-width="1.5"/><rect x="26" y="98" width="166" height="9" rx="3" fill="#263238"/><path d="M40 18 H60 L58 26 H42Z" fill="#263238"/><rect x="43" y="25" width="14" height="30" rx="2" fill="#37474F"/><rect x="41" y="20" width="18" height="4" rx="2" fill="url(#tr-gold)"/><rect x="30" y="50" width="98" height="48" rx="22" fill="url(#tr-red)"/><rect x="30" y="50" width="98" height="48" rx="22" fill="none" stroke="#5A0E0E" stroke-width="1.2"/><path d="M44 58 Q78 50 112 58" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="5" stroke-linecap="round"/><rect x="66" y="48" width="6" height="52" rx="2" fill="url(#tr-gold)"/><rect x="96" y="48" width="6" height="52" rx="2" fill="url(#tr-gold)"/><ellipse cx="81" cy="48" rx="11" ry="7" fill="url(#tr-gold)"/><circle cx="30" cy="66" r="10" fill="url(#tr-gold)"/><circle cx="30" cy="66" r="6.5" fill="url(#tr-lamp)"/><circle cx="30" cy="74" r="16" fill="url(#tr-red)" opacity=".001"/><rect x="126" y="36" width="64" height="66" rx="7" fill="url(#tr-green)"/><rect x="126" y="36" width="64" height="66" rx="7" fill="none" stroke="#143A17" stroke-width="1.2"/><rect x="134" y="46" width="48" height="34" rx="5" fill="#FFF3E0"/><rect x="134" y="46" width="48" height="34" rx="5" fill="none" stroke="url(#tr-gold)" stroke-width="2.5"/><g transform="translate(158 68)"><path d="M-11 6 C-11 -4 11 -4 11 6 Z" fill="#C62828"/><circle cy="-4" r="9" fill="#FFE0B2"/><path d="M-9 -7 C-8 -20 6 -22 12 -14 L10 -10 L4 -12 C0 -14 -4 -10 -9 -7Z" fill="#E53935"/><circle cx="12" cy="-14" r="3.5" fill="#fff"/><path d="M-10 -7 h17 a2 2 0 0 1 0 4 h-17 a2 2 0 0 1 0 -4z" fill="#fff"/><path d="M-8 -2 C-8 10 8 10 8 -2 C5 2 -5 2 -8 -2Z" fill="#fff"/><circle cx="-3" cy="-5" r="1.2" fill="#3E2723"/><circle cx="3" cy="-5" r="1.2" fill="#3E2723"/><circle cy="-1.5" r="1.8" fill="#EF9A9A"/><path d="M14 -4 L17 -14" stroke="#C62828" stroke-width="5" stroke-linecap="round"/><path d="M15 -7 h5" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="18" cy="-17" r="4.2" fill="#C62828"/><path d="M20 -21 L22 -17" stroke="#C62828" stroke-width="3" stroke-linecap="round"/></g><rect x="120" y="28" width="76" height="10" rx="4" fill="#1B4D1E"/><path d="M122 30 Q158 22 194 30" fill="none" stroke="#F7F9FC" stroke-width="7" stroke-linecap="round"/><rect x="134" y="84" width="48" height="4" rx="2" fill="url(#tr-gold)"/><g class="wheel" style="transform-origin:62px 104px"><circle cx="62" cy="104" r="15" fill="#263238"/><circle cx="62" cy="104" r="12" fill="none" stroke="#F2C14E" stroke-width="2"/><path d="M62 92 V116 M50 104 H74 M53.5 95.5 L70.5 112.5 M70.5 95.5 L53.5 112.5" stroke="#F2C14E" stroke-width="2"/><circle cx="62" cy="104" r="3.5" fill="#F2C14E"/></g><g class="wheel" style="transform-origin:104px 104px"><circle cx="104" cy="104" r="15" fill="#263238"/><circle cx="104" cy="104" r="12" fill="none" stroke="#F2C14E" stroke-width="2"/><path d="M104 92 V116 M92 104 H116 M95.5 95.5 L112.5 112.5 M112.5 95.5 L95.5 112.5" stroke="#F2C14E" stroke-width="2"/><circle cx="104" cy="104" r="3.5" fill="#F2C14E"/></g><g class="wheel" style="transform-origin:150px 108px"><circle cx="150" cy="108" r="10" fill="#263238"/><circle cx="150" cy="108" r="7.5" fill="none" stroke="#F2C14E" stroke-width="1.8"/><path d="M150 100 V116 M142 108 H158" stroke="#F2C14E" stroke-width="1.8"/></g><g class="rod"><rect x="56" y="102" width="54" height="4" rx="2" fill="#B0BEC5"/><circle cx="62" cy="104" r="2.5" fill="#37474F"/><circle cx="104" cy="104" r="2.5" fill="#37474F"/></g><rect x="190" y="92" width="16" height="5" rx="2" fill="#546E7A"/><rect x="206" y="62" width="96" height="40" rx="7" fill="url(#tr-blue)"/><rect x="206" y="62" width="96" height="40" rx="7" fill="none" stroke="#0F2F63" stroke-width="1.2"/><rect x="214" y="70" width="80" height="24" rx="4" fill="none" stroke="url(#tr-gold)" stroke-width="2"/><path d="M208 64 Q254 56 300 64" fill="none" stroke="#F7F9FC" stroke-width="6" stroke-linecap="round"/><g transform="translate(236 52)"><rect x="-16" y="-20" width="32" height="26" rx="3" fill="#F9A825"/><rect x="-18" y="-22" width="36" height="8" rx="2" fill="#F57F17"/><path d="M0 -22 V6 M-16 -8 H16" stroke="#C62828" stroke-width="4"/><path d="M0 -22 C-8 -32 -14 -24 -4 -22 C-8 -16 0 -16 0 -22 C8 -32 14 -24 4 -22 C8 -16 0 -16 0 -22Z" fill="#E53935"/></g><g transform="translate(268 56)"><rect x="-12" y="-16" width="24" height="22" rx="3" fill="#E53935"/><rect x="-13" y="-17" width="26" height="7" rx="2" fill="#B71C1C"/><path d="M0 -17 V6 M-12 -6 H12" stroke="#F2C14E" stroke-width="3"/><path d="M0 -17 C-6 -26 -11 -19 -3 -17 C-6 -12 0 -13 0 -17 C6 -26 11 -19 3 -17 C6 -12 0 -13 0 -17Z" fill="#F2C14E"/></g><g transform="translate(290 60)"><rect x="-9" y="-12" width="18" height="16" rx="2" fill="#43A047"/><path d="M0 -12 V4 M-9 -4 H9" stroke="#fff" stroke-width="2.5"/></g><g class="wheel" style="transform-origin:226px 106px"><circle cx="226" cy="106" r="11" fill="#263238"/><circle cx="226" cy="106" r="8" fill="none" stroke="#F2C14E" stroke-width="1.8"/><path d="M226 97 V115 M217 106 H235" stroke="#F2C14E" stroke-width="1.8"/></g><g class="wheel" style="transform-origin:282px 106px"><circle cx="282" cy="106" r="11" fill="#263238"/><circle cx="282" cy="106" r="8" fill="none" stroke="#F2C14E" stroke-width="1.8"/><path d="M282 97 V115 M273 106 H291" stroke="#F2C14E" stroke-width="1.8"/></g><rect x="300" y="92" width="16" height="5" rx="2" fill="#546E7A"/><rect x="316" y="62" width="98" height="40" rx="7" fill="url(#tr-red)"/><rect x="316" y="62" width="98" height="40" rx="7" fill="none" stroke="#5A0E0E" stroke-width="1.2"/><rect x="324" y="70" width="82" height="24" rx="4" fill="none" stroke="url(#tr-gold)" stroke-width="2"/><path d="M318 64 Q365 56 412 64" fill="none" stroke="#F7F9FC" stroke-width="6" stroke-linecap="round"/><g transform="translate(346 44)"><circle cy="12" r="14" fill="#fff"/><circle cy="12" r="14" fill="none" stroke="#CFD8DC" stroke-width="1"/><circle cy="-8" r="10" fill="#fff"/><circle cy="-8" r="10" fill="none" stroke="#CFD8DC" stroke-width="1"/><rect x="-9" y="-28" width="18" height="13" rx="1.5" fill="#263238"/><rect x="-13" y="-17" width="26" height="4" rx="2" fill="#263238"/><rect x="-9" y="-20" width="18" height="3" fill="#E53935"/><circle cx="-3.5" cy="-10" r="1.4" fill="#263238"/><circle cx="3.5" cy="-10" r="1.4" fill="#263238"/><path d="M1 -7 L12 -5 L1 -3Z" fill="#FB8C00"/><path d="M-4 -4 Q0 -1 4 -4" fill="none" stroke="#263238" stroke-width="1.2"/><path d="M-10 1 Q0 6 10 1" fill="none" stroke="#E53935" stroke-width="5" stroke-linecap="round"/><path d="M6 2 L9 14" stroke="#E53935" stroke-width="5" stroke-linecap="round"/><circle cy="8" r="1.6" fill="#263238"/><circle cy="14" r="1.6" fill="#263238"/><circle cy="20" r="1.6" fill="#263238"/><path d="M-13 8 L-24 0 M-24 0 L-28 -4 M-24 0 L-27 4" stroke="#6D4C41" stroke-width="2.2" stroke-linecap="round"/><path d="M13 8 L24 2 M24 2 L28 -1 M24 2 L28 6" stroke="#6D4C41" stroke-width="2.2" stroke-linecap="round"/></g><g transform="translate(390 40)"><path d="M0 -22 L12 -6 L6 -6 L17 10 L9 10 L22 26 L-22 26 L-9 10 L-17 10 L-6 -6 L-12 -6Z" fill="url(#tr-green)"/><path d="M0 -22 L12 -6 L6 -6 L17 10 L9 10 L22 26 L-22 26 L-9 10 L-17 10 L-6 -6 L-12 -6Z" fill="none" stroke="#143A17" stroke-width="1"/><path d="M-6 -6 Q0 -2 6 -6 M-13 10 Q0 15 13 10" fill="none" stroke="#F7F9FC" stroke-width="3" stroke-linecap="round"/><circle cx="-5" cy="4" r="2.4" fill="#F2C14E"/><circle cx="7" cy="16" r="2.4" fill="#E53935"/><circle cx="-10" cy="19" r="2.4" fill="#4F8DE0"/><circle cx="4" cy="-10" r="2" fill="#E53935"/><path d="M0 -30 L2 -24 L8 -24 L3 -20 L5 -14 L0 -18 L-5 -14 L-3 -20 L-8 -24 L-2 -24Z" fill="#F2C14E"/><rect x="-3" y="26" width="6" height="7" fill="#5D4037"/></g><g class="wheel" style="transform-origin:338px 106px"><circle cx="338" cy="106" r="11" fill="#263238"/><circle cx="338" cy="106" r="8" fill="none" stroke="#F2C14E" stroke-width="1.8"/><path d="M338 97 V115 M329 106 H347" stroke="#F2C14E" stroke-width="1.8"/></g><g class="wheel" style="transform-origin:394px 106px"><circle cx="394" cy="106" r="11" fill="#263238"/><circle cx="394" cy="106" r="8" fill="none" stroke="#F2C14E" stroke-width="1.8"/><path d="M394 97 V115 M385 106 H403" stroke="#F2C14E" stroke-width="1.8"/></g></svg>', dur: 32, dir: -1, ground: true },
    'halloween': { cls: 'witch', html:
      '<svg viewBox="0 0 160 110" aria-hidden="true"><g fill="#1A1026" stroke="#EDE7F6" stroke-opacity=".75" stroke-width="1.4" stroke-linejoin="round">' +
      '<path d="M10 78 L92 70 L94 76 L12 86Z"/><path d="M92 68 L126 58 L136 66 L132 76 L100 80Z"/><path d="M126 58 L150 50 L156 58 L150 66 L138 70Z" opacity=".85"/>' +
      '<path d="M44 76 C40 60 48 46 60 44 L72 46 C80 48 84 60 82 74Z"/><path d="M56 46 C50 40 54 28 62 26 C64 14 78 12 82 20 C90 18 96 26 92 34 L66 44Z"/><path d="M58 28 L46 20 L50 32Z"/>' +
      '<path d="M48 48 C34 50 26 60 22 72 C34 66 44 64 50 58Z"/><path d="M78 72 L90 84 L84 86 L74 76Z M70 74 L76 88 L70 88 L64 76Z"/></g>' +
      '<circle cx="40" cy="46" r="6" fill="#1A1026" stroke="#EDE7F6" stroke-opacity=".75" stroke-width="1.2"/><circle cx="36" cy="44" r="1.4" fill="#FF7A1A"/>' +
      '</svg>', dur: 26, dir: -1, moon: true },
    'fete-nationale': { cls: 'jets', html:
      '<svg viewBox="0 0 520 120" aria-hidden="true">' +
      '<defs><linearGradient id="tb" x1="0" x2="1"><stop offset="0" stop-color="#2457C5" stop-opacity="0"/><stop offset="1" stop-color="#2457C5" stop-opacity=".9"/></linearGradient><linearGradient id="tw" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".9"/></linearGradient><linearGradient id="tr" x1="0" x2="1"><stop offset="0" stop-color="#E53935" stop-opacity="0"/><stop offset="1" stop-color="#E53935" stop-opacity=".9"/></linearGradient></defs>' +
      '<rect x="0" y="44" width="400" height="10" rx="5" fill="url(#tb)"/><rect x="40" y="62" width="400" height="10" rx="5" fill="url(#tw)"/><rect x="0" y="80" width="400" height="10" rx="5" fill="url(#tr)"/>' +
      '<g fill="#F5F0E6"><path d="M400 49 L440 44 L452 49 L440 54Z M416 49 L404 38 L412 38 L428 47Z M416 49 L404 60 L412 60 L428 51Z"/><path d="M440 67 L480 62 L492 67 L480 72Z M456 67 L444 56 L452 56 L468 65Z M456 67 L444 78 L452 78 L468 69Z"/><path d="M400 85 L440 80 L452 85 L440 90Z M416 85 L404 74 L412 74 L428 83Z M416 85 L404 96 L412 96 L428 87Z"/></g>' +
      '</svg>', dur: 22, dir: 1 },
    'saint-valentin': { cls: 'balloon', html:
      '<svg viewBox="0 0 120 170" aria-hidden="true">' +
      '<path d="M60 112 C8 76 12 22 38 22 C50 22 56 32 60 42 C64 32 70 22 82 22 C108 22 112 76 60 112Z" fill="#E53935"/><path d="M60 112 C30 90 24 60 32 42 C36 56 44 76 60 112Z" fill="#C62828" opacity=".6"/><path d="M44 34 C38 38 36 46 38 54" stroke="#FFCDD2" stroke-width="4" fill="none" stroke-linecap="round"/>' +
      '<path d="M48 108 L44 140 M72 108 L76 140 M56 112 L54 140 M64 112 L66 140" stroke="#8D6E63" stroke-width="1.5"/>' +
      '<rect x="42" y="138" width="36" height="22" rx="4" fill="#A1887F"/><path d="M42 146 H78 M42 152 H78 M50 138 V160 M60 138 V160 M70 138 V160" stroke="#6D4C41" stroke-width="1.2"/>' +
      '<g transform="translate(60 134)"><circle r="6" fill="#FFE0B2"/><path d="M-6 -1 C-6 -8 6 -8 6 -1Z" fill="#5D4037"/></g><g transform="translate(70 136)"><circle r="5" fill="#FFE0B2"/><path d="M-5 -1 C-5 -7 5 -7 5 -1Z" fill="#8D6E63"/></g>' +
      '</svg>', dur: 34, dir: 1 },
    'paques': { cls: 'bunny', html:
      '<svg viewBox="0 0 170 90" aria-hidden="true">' +
      '<g class="hop"><ellipse cx="60" cy="62" rx="30" ry="20" fill="#F5E6D3"/><circle cx="92" cy="48" r="16" fill="#F5E6D3"/><path d="M84 36 C78 18 82 6 90 8 C96 10 96 26 94 36Z" fill="#F5E6D3"/><path d="M86 34 C82 20 85 10 90 12 C93 14 93 26 92 34Z" fill="#F8BBD0"/><path d="M98 36 C100 16 108 8 112 14 C114 20 106 32 102 38Z" fill="#F5E6D3"/><path d="M100 36 C102 20 108 12 110 16 C111 20 105 30 102 36Z" fill="#F8BBD0"/>' +
      '<circle cx="98" cy="46" r="1.8" fill="#4E342E"/><circle cx="106" cy="52" r="2.2" fill="#F48FB1"/><path d="M103 56 Q106 59 109 56" stroke="#4E342E" stroke-width="1" fill="none"/><circle cx="32" cy="58" r="7" fill="#fff"/>' +
      '<ellipse cx="46" cy="80" rx="10" ry="5" fill="#F5E6D3"/><ellipse cx="78" cy="80" rx="9" ry="5" fill="#F5E6D3"/>' +
      '<path d="M112 60 L144 60 L140 80 L116 80Z" fill="#C8A165"/><path d="M114 60 Q128 36 142 60" fill="none" stroke="#8D6E63" stroke-width="3"/><ellipse cx="122" cy="58" rx="5" ry="7" fill="#90CAF9"/><ellipse cx="130" cy="56" rx="5" ry="7" fill="#F48FB1"/><ellipse cx="138" cy="58" rx="5" ry="7" fill="#FFF176"/></g>' +
      '<g class="chick" transform="translate(14 68)"><ellipse rx="9" ry="7" fill="#FFEE58"/><circle cx="7" cy="-6" r="6" fill="#FFEE58"/><path d="M12 -6 L18 -4 L12 -2Z" fill="#FB8C00"/><circle cx="8" cy="-7" r="1" fill="#4E342E"/><path d="M-4 7 L-6 12 M2 7 L2 12" stroke="#FB8C00" stroke-width="1.5"/></g>' +
      '</svg>', dur: 28, dir: 1 }
  };
  var sc = SCENES[theme], hero = document.querySelector('.hero');
  if (sc && hero) {
    if (sc.moon) hero.insertAdjacentHTML('beforeend', '<div class="deco-moon" aria-hidden="true"></div>');
    if (sc.ground) hero.insertAdjacentHTML('beforeend', '<div class="deco-ground" aria-hidden="true"></div>');
    if (fx) { var r = document.createElement('div'); r.className = 'deco-runner ' + sc.cls + (sc.dir < 0 ? ' rtl' : ''); r.setAttribute('aria-hidden', 'true'); r.style.animationDuration = sc.dur + 's'; r.innerHTML = sc.html; hero.appendChild(r); }
  }
  if (css) { var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }
})();

// ---------- Thème saisonnier : particules (flocons, confettis, citrouilles, cœurs, poussins) ----------
(function () {
  var root = document.documentElement, theme = root.getAttribute('data-theme');
  if (!theme || root.getAttribute('data-theme-fx') === '0') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var CFG = {
    'noel': { kind: 'snow', n: 110 },
    'halloween': { kind: 'glyph', glyphs: ['🎃', '🦇', '👻', '🦇'], n: 12, size: [18, 30], vy: [.25, .6], sway: 1.2 },
    'fete-nationale': { kind: 'confetti', colors: ['#2457C5', '#FFFFFF', '#E53935'], n: 60, fireworks: ['#2457C5', '#FFFFFF', '#E53935', '#FFD54F'] },
    'saint-valentin': { kind: 'glyph', glyphs: ['❤️', '💕', '💗'], n: 16, size: [14, 26], vy: [-.35, -.15], sway: .8 },
    'paques': { kind: 'glyph', glyphs: ['🐣', '🥚', '🌷', '🐰'], n: 12, size: [18, 28], vy: [.2, .45], sway: .9 }
  };
  var cfg = CFG[theme]; if (!cfg) return;
  var canvas = document.createElement('canvas'); canvas.className = 'fx-canvas'; canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  var ctx = canvas.getContext('2d'), W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2), parts = [], raf = null, last = 0, bursts = [], fwT = 40;
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
    if (cfg.fireworks) { // bouquets : une gerbe toutes les 1 à 2,5 s dans le haut de l'écran
      fwT -= dt;
      if (fwT <= 0) { fwT = 60 + Math.random() * 90; var bx = rnd(W * .15, W * .85), by = rnd(H * .12, H * .42), col = cfg.fireworks[Math.floor(Math.random() * cfg.fireworks.length)], n = small ? 26 : 42; for (var k = 0; k < n; k++) { var an = (k / n) * Math.PI * 2 + rnd(-.1, .1), sp = rnd(1.4, 3.6); bursts.push({ x: bx, y: by, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, life: rnd(55, 85), max: 85, c: col, r: rnd(1.4, 2.6) }); } }
      for (var q = bursts.length - 1; q >= 0; q--) { var f = bursts[q]; f.x += f.vx * dt; f.y += f.vy * dt; f.vy += .045 * dt; f.vx *= .985; f.vy *= .985; f.life -= dt; if (f.life <= 0) { bursts.splice(q, 1); continue; } ctx.globalAlpha = Math.max(0, f.life / f.max); ctx.fillStyle = f.c; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill(); }
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
