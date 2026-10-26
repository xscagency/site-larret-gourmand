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
    // data-page : le même formulaire posé en pleine page (/contact), utilisé par le menu appli
    var onPage = dlg.hasAttribute('data-page');
    var openDlg = function () { if (onPage) return; try { savedY = window.scrollY || 0; dlg.showModal(); document.body.style.top = (-savedY) + 'px'; document.documentElement.classList.add('dlg-open'); } catch (e) {} };
    dlg.addEventListener('close', function () { document.documentElement.classList.remove('dlg-open'); document.body.style.top = ''; window.scrollTo(0, savedY); });
    document.querySelectorAll('[data-open-contact]').forEach(function (b) { b.addEventListener('click', openDlg); });
    document.querySelectorAll('[data-close-contact]').forEach(function (b) { b.addEventListener('click', function () { dlg.close(); }); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg && !onPage) dlg.close(); });
    if (!onPage && (location.hash === '#open-popup' || location.hash === '#contact')) openDlg();

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

  // Une « vague » de banderole, version travaillée : dégradés, ourlet, surpiqûres, motifs, corde torsadée.
  // kind : pennant | heart | egg | pine. Rend la tuile (defs + dessin) ; sert en fond répété (encarts) et en SVG animé (entrée).
  function mixc(hex, to, f) { var a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16), r = [16, 8, 0].map(function (s) { var x = (a >> s) & 255, y = (b >> s) & 255; return Math.round(x + (y - x) * f); }); return '#' + r.map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join(''); }
  var BW = 320, BH = 175;
  function buntingTile(kind, colors, opts, anim) {
    opts = opts || {}; var motif = opts.motif || '', w = BW, h = 92, flagH = 58, flagW = 46, defs = '', items = '', i, pfx = opts.pfx || 'b';
    var isLight = function (c) { var n = parseInt(c.slice(1), 16); return ((n >> 16) * .3 + ((n >> 8) & 255) * .59 + (n & 255) * .11) > 170; };
    for (i = 0; i < colors.length; i++) defs += '<linearGradient id="' + pfx + 'g' + i + '" x1="0" y1="0" x2=".4" y2="1"><stop offset="0" stop-color="' + mixc(colors[i], '#ffffff', .28) + '"/><stop offset=".55" stop-color="' + colors[i] + '"/><stop offset="1" stop-color="' + mixc(colors[i], '#000000', .22) + '"/></linearGradient>';
    defs += '<radialGradient id="' + pfx + 'hl" cx=".35" cy=".3" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient>';
    var G = function (i2) { return 'url(#' + pfx + 'g' + i2 + ')'; }, HL = 'url(#' + pfx + 'hl)';
    var rope;
    if (kind === 'pine') {
      var d = 'M0 10 Q160 ' + (h + 10) + ' 320 10';
      rope = '<path d="' + d + '" fill="none" stroke="#0E3A1A" stroke-width="17" stroke-linecap="round"/><path d="' + d + '" fill="none" stroke="#2E7D32" stroke-width="13" stroke-dasharray="2 4" stroke-linecap="round"/><path d="' + d + '" fill="none" stroke="#66BB6A" stroke-width="7" stroke-dasharray="1 8" stroke-dashoffset="3" stroke-linecap="round"/><path d="' + d + '" fill="none" stroke="#A5D6A7" stroke-width="3" stroke-dasharray="1 13" stroke-dashoffset="7" stroke-linecap="round"/>';
      var tl = [.05, .2, .4, .6, .8, .95], lc = ['#FFF3C4', '#FFCDD2', '#C8E6C9', '#FFF3C4', '#BBDEFB', '#FFF3C4'];
      for (i = 0; i < tl.length; i++) { var q = pt(tl[i], w, h); rope += '<g>' + (anim ? '<animate attributeName="opacity" values="1;.25;1" dur="' + (1.4 + (i % 3) * .5).toFixed(1) + 's" begin="-' + (i * .37).toFixed(2) + 's" repeatCount="indefinite"/>' : '') + '<circle cx="' + q[0].toFixed(1) + '" cy="' + (q[1] + 2).toFixed(1) + '" r="6" fill="' + lc[i] + '" fill-opacity=".35"/><circle cx="' + q[0].toFixed(1) + '" cy="' + (q[1] + 2).toFixed(1) + '" r="2.6" fill="' + lc[i] + '"/></g>'; }
    } else {
      var dr = 'M0 8 Q160 ' + (h + 8) + ' 320 8';
      rope = '<path d="' + dr + '" fill="none" stroke="#4E342E" stroke-width="4" stroke-linecap="round"/><path d="' + dr + '" fill="none" stroke="#A1887F" stroke-width="2" stroke-dasharray="5 4" stroke-linecap="round"/>';
    }
    var ts = [.1, .3, .5, .7, .9];
    for (i = 0; i < ts.length; i++) {
      var p = pt(ts[i], w, h), a = ang(ts[i], w, h), c = colors[i % colors.length], gi = i % colors.length, x = p[0].toFixed(1), y = p[1].toFixed(1), sway = (i % 2 ? -3 : 3);
      var g = '<g transform="translate(' + x + ' ' + y + ') rotate(' + (a + sway).toFixed(1) + ')">';
      if (anim) g += '<animateTransform attributeName="transform" type="rotate" additive="sum" values="-2.5;2.5;-2.5" dur="' + (3.4 + i * .35).toFixed(2) + 's" begin="-' + (i * .8).toFixed(1) + 's" repeatCount="indefinite"/>';
      if (kind === 'pennant') {
        var hw = flagW / 2, ink = isLight(c) ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.55)';
        g += '<path d="M' + (-hw) + ' 2 L' + hw + ' 2 L0 ' + flagH + ' Z" fill="rgba(0,0,0,.25)" transform="translate(2 3)"/>';
        g += '<path d="M' + (-hw) + ' 2 L' + hw + ' 2 L0 ' + flagH + ' Z" fill="' + G(gi) + '"/><path d="M' + (-hw) + ' 2 L' + hw + ' 2 L0 ' + flagH + ' Z" fill="' + HL + '"/>';
        g += '<path d="M' + (-hw + 6) + ' 9 L' + (hw - 6) + ' 9 L0 ' + (flagH - 10) + ' Z" fill="none" stroke="' + ink + '" stroke-width="1.3" stroke-dasharray="3 3"/>';
        g += '<rect x="' + (-hw - 2) + '" y="-2" width="' + (flagW + 4) + '" height="7" rx="2" fill="' + mixc(c, '#000000', .35) + '"/><rect x="' + (-hw - 2) + '" y="-2" width="' + (flagW + 4) + '" height="3" rx="1.5" fill="rgba(255,255,255,.25)"/>';
        if (motif === 'halloween') {
          if (gi % 3 === 0) g += '<path d="M-7 20 L-2 26 L-9 26Z M7 20 L2 26 L9 26Z" fill="#1A1A1A"/><path d="M-8 31 L-5 35 L-2 31 L0 35 L2 31 L5 35 L8 31" fill="none" stroke="#1A1A1A" stroke-width="2.2" stroke-linejoin="round"/>';
          else if (gi % 3 === 1) g += '<path d="M0 26 C-2 21 -6 20 -12 23 C-9 24 -8 27 -10 30 C-7 29 -4 29 -2 32 L0 30 L2 32 C4 29 7 29 10 30 C8 27 9 24 12 23 C6 20 2 21 0 26Z" fill="#FF7A1A"/>';
          else g += '<path d="M-7 36 V24 A7 7 0 0 1 7 24 V36 L4 33 L2 36 L0 33 L-2 36 L-4 33Z" fill="#fff" fill-opacity=".9"/><circle cx="-2.5" cy="25" r="1.2" fill="#1A1A1A"/><circle cx="2.5" cy="25" r="1.2" fill="#1A1A1A"/>';
        } else if (motif === 'france') {
          if (gi % 3 === 1) g += '<path d="M0 17 L3 24 L10 25 L5 30 L6 37 L0 34 L-6 37 L-5 30 L-10 25 L-3 24Z" fill="#F2C14E" stroke="#B8860B" stroke-width=".8"/>';
          else g += '<path d="M0 20 L2 26 L8 27 L4 31 L5 37 L0 34 L-5 37 L-4 31 L-8 27 L-2 26Z" fill="rgba(255,255,255,.85)"/>';
        } else g += '<circle cy="24" r="5" fill="rgba(255,255,255,.55)"/>';
      } else if (kind === 'heart') {
        var hs = (i % 2 ? .82 : 1);
        g += '<line x1="0" y1="0" x2="0" y2="7" stroke="#A1887F" stroke-width="1.6"/><circle cy="7" r="2" fill="#F2C14E"/>';
        g += '<g transform="translate(0 7) scale(' + hs + ')"><path d="M0 44 C-24 28 -24 6 -10 4 C-4 4 -1 8 0 12 C1 8 4 4 10 4 C24 6 24 28 0 44Z" fill="rgba(0,0,0,.25)" transform="translate(2 3)"/><path d="M0 44 C-24 28 -24 6 -10 4 C-4 4 -1 8 0 12 C1 8 4 4 10 4 C24 6 24 28 0 44Z" fill="' + G(gi) + '"/><path d="M-14 12 C-16 16 -15 22 -12 26" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="3.5" stroke-linecap="round"/><circle cx="-8" cy="10" r="2.2" fill="#fff" fill-opacity=".8"/></g>';
      } else if (kind === 'egg') {
        g += '<line x1="0" y1="0" x2="0" y2="8" stroke="#A1887F" stroke-width="1.6"/><path d="M-5 7 L0 10 L5 7 L3 13 L-3 13Z" fill="' + mixc(colors[(gi + 2) % colors.length], '#000000', .15) + '"/>';
        g += '<path d="M0 10 C-16 10 -20 32 -15 44 C-10 56 10 56 15 44 C20 32 16 10 0 10Z" fill="rgba(0,0,0,.25)" transform="translate(2 3)"/><path d="M0 10 C-16 10 -20 32 -15 44 C-10 56 10 56 15 44 C20 32 16 10 0 10Z" fill="' + G(gi) + '"/>';
        if (gi % 3 === 0) g += '<path d="M-15 28 L-10 23 L-5 28 L0 23 L5 28 L10 23 L15 28" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="2.4" stroke-linejoin="round"/><path d="M-14 38 Q0 44 14 38" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="2.2"/>';
        else if (gi % 3 === 1) g += '<circle cx="-7" cy="24" r="2.6" fill="#fff" fill-opacity=".85"/><circle cx="6" cy="29" r="2.6" fill="#fff" fill-opacity=".85"/><circle cx="-4" cy="38" r="2.6" fill="#fff" fill-opacity=".85"/><circle cx="8" cy="42" r="2" fill="#fff" fill-opacity=".85"/><circle cx="3" cy="18" r="1.8" fill="#fff" fill-opacity=".85"/>';
        else g += '<path d="M-16 26 Q0 20 16 26 M-17 34 Q0 40 17 34 M-15 42 Q0 36 15 42" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="2.2"/>';
        g += '<path d="M-9 17 C-12 21 -13 26 -12 30" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="3" stroke-linecap="round"/>';
      } else if (kind === 'pine') {
        var br = (i % 2 ? 9 : 11);
        g += '<line x1="0" y1="4" x2="0" y2="14" stroke="#C9A24A" stroke-width="1.6"/><rect x="-3.5" y="12" width="7" height="5" rx="1" fill="#C9A24A"/>';
        g += '<circle cy="' + (17 + br) + '" r="' + br + '" fill="rgba(0,0,0,.3)" transform="translate(2 3)"/><circle cx="0" cy="' + (17 + br) + '" r="' + br + '" fill="' + G(gi) + '"/><circle cx="0" cy="' + (17 + br) + '" r="' + br + '" fill="' + HL + '"/>';
        if (i % 2) g += '<path d="M' + (-br + 1) + ' ' + (17 + br) + ' Q0 ' + (17 + br - 5) + ' ' + (br - 1) + ' ' + (17 + br) + '" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.6"/>';
        else g += '<circle cx="' + (-br * .35) + '" cy="' + (17 + br * .65) + '" r="' + (br * .25) + '" fill="#fff" fill-opacity=".85"/>';
      }
      items += g + '</g>';
    }
    return { defs: defs, body: rope + items };
  }
  function bunting(kind, colors, opts) { var t = buntingTile(kind, colors, opts, false); return svgUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + BW + ' ' + BH + '" width="' + BW + '" height="' + BH + '"><defs>' + t.defs + '</defs>' + t.body + '</svg>'); }
  // la grande banderole de l'entrée : SVG en ligne, tuile répétée par <use>, légèrement animée (balancement, lumières)
  function buntingInline(kind, colors, opts, anim) {
    var t = buntingTile(kind, colors, Object.assign({}, opts || {}, { pfx: 'bb' }), anim), n = 16, uses = '';
    for (var i = 0; i < n; i++) uses += '<use href="#bbt" xlink:href="#bbt" x="' + (i * BW) + '"/>';
    return '<svg class="deco-bunting-svg" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ' + (BW * n) + ' ' + BH + '" width="' + (BW * n) + '" height="' + BH + '" preserveAspectRatio="xMinYMin meet" aria-hidden="true"><defs>' + t.defs + '<g id="bbt">' + t.body + '</g></defs>' + uses + '</svg>';
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
  // ---- décors de fond (silhouettes au pied de l'entrée), une tuile de 600 px répétée
  function fir(x, h, c1, c2) { var t = h * .34; return '<g transform="translate(' + x + ' 0)"><path d="M0 ' + (140 - h) + ' L' + (h * .22) + ' ' + (140 - h + t) + ' L' + (h * .1) + ' ' + (140 - h + t) + ' L' + (h * .32) + ' ' + (140 - h + 2 * t) + ' L' + (h * .16) + ' ' + (140 - h + 2 * t) + ' L' + (h * .42) + ' 132 L' + (-h * .42) + ' 132 L' + (-h * .16) + ' ' + (140 - h + 2 * t) + ' L' + (-h * .32) + ' ' + (140 - h + 2 * t) + ' L' + (-h * .1) + ' ' + (140 - h + t) + ' L' + (-h * .22) + ' ' + (140 - h + t) + 'Z" fill="' + c1 + '"/><path d="M0 ' + (140 - h) + ' L' + (h * .22) + ' ' + (140 - h + t) + ' L0 ' + (140 - h + t - 2) + ' L' + (-h * .22) + ' ' + (140 - h + t) + 'Z M' + (h * .1) + ' ' + (140 - h + t) + ' L' + (h * .32) + ' ' + (140 - h + 2 * t) + ' L0 ' + (140 - h + 2 * t - 3) + ' L' + (-h * .32) + ' ' + (140 - h + 2 * t) + ' L' + (-h * .1) + ' ' + (140 - h + t) + 'Z" fill="' + c2 + '"/><rect x="-3" y="130" width="6" height="8" fill="#3E2723"/></g>'; }
  function sceneryUri(theme) {
    var s = '';
    if (theme === 'noel') {
      var tc = '#0F2E1C', sn = '#E8F0F5';
      s += fir(30, 90, tc, sn) + fir(80, 120, '#16402A', sn) + fir(135, 70, tc, sn) + fir(380, 100, tc, sn) + fir(445, 130, '#16402A', sn) + fir(505, 80, tc, sn) + fir(565, 112, '#16402A', sn);
      // chaumière
      s += '<g transform="translate(240 0)"><rect x="12" y="84" width="76" height="52" fill="#4E342E"/><path d="M4 86 L50 48 L96 86Z" fill="#3E2723"/><path d="M0 88 L50 46 L100 88 L96 92 L50 54 L4 92Z" fill="' + sn + '"/><rect x="66" y="56" width="10" height="20" fill="#3E2723"/><rect x="64" y="54" width="14" height="4" fill="' + sn + '"/><circle cx="71" cy="46" r="5" fill="#fff" fill-opacity=".5"/><circle cx="76" cy="38" r="6" fill="#fff" fill-opacity=".35"/><rect x="22" y="96" width="16" height="16" rx="1" fill="#FFD54F"/><rect x="62" y="96" width="16" height="16" rx="1" fill="#FFD54F"/><path d="M30 96 V112 M22 104 H38 M70 96 V112 M62 104 H78" stroke="#4E342E" stroke-width="1.5"/><rect x="43" y="104" width="14" height="32" rx="2" fill="#6D4C41"/><circle cx="54" cy="121" r="1.5" fill="#FFD54F"/><rect x="40" y="100" width="20" height="4" fill="' + sn + '"/><ellipse cx="50" cy="136" rx="60" ry="5" fill="' + sn + '"/></g>';
      s += '<path d="M0 140 V132 Q60 124 120 131 T240 130 T360 132 T480 129 T600 132 V140Z" fill="' + sn + '"/>';
    } else if (theme === 'halloween') {
      var sil = '#0A0612';
      // maison hantée
      s += '<g transform="translate(70 0)"><rect x="20" y="60" width="70" height="78" fill="' + sil + '"/><path d="M10 62 L55 20 L100 62Z" fill="' + sil + '"/><rect x="78" y="30" width="22" height="108" fill="' + sil + '"/><path d="M74 32 L89 6 L104 32Z" fill="' + sil + '"/><rect x="30" y="74" width="12" height="16" fill="#FFB74D"/><rect x="58" y="74" width="12" height="16" fill="#FFB74D"/><rect x="84" y="46" width="10" height="14" fill="#FFB74D"/><rect x="32" y="104" width="10" height="12" fill="#FFB74D"/><path d="M36 74 V90 M30 82 H42 M64 74 V90 M58 82 H70 M89 46 V60 M84 53 H94" stroke="' + sil + '" stroke-width="1.5"/><path d="M48 138 V112 Q55 104 62 112 V138Z" fill="#2A1A3F"/><path d="M0 138 V126 M8 138 V122 M16 138 V128 M110 138 V124 M118 138 V128" stroke="' + sil + '" stroke-width="4"/><path d="M-4 128 H20 M106 126 H124" stroke="' + sil + '" stroke-width="2"/></g>';
      // arbre mort
      s += '<path d="M300 138 L302 100 L292 84 L284 78 M302 100 L312 86 L322 82 M312 86 L314 72 M302 100 L300 70 L294 58 M300 70 L308 60 L306 50 M298 118 L286 110 L280 112" fill="none" stroke="' + sil + '" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M300 70 L300 60 M312 86 L320 76" fill="none" stroke="' + sil + '" stroke-width="4" stroke-linecap="round"/>';
      // tombes
      s += '<path d="M352 138 V112 A10 10 0 0 1 372 112 V138Z" fill="#1C1226"/><path d="M356 120 H368 M362 116 V130" stroke="#3B2A4F" stroke-width="2"/><path d="M386 138 V118 A8 8 0 0 1 402 118 V138Z" fill="#1C1226" transform="rotate(-6 394 128)"/>';
      // citrouilles
      [[430, 1.1, '#FF7A1A'], [470, .8, '#F57C00'], [500, 1.25, '#FF8A3D'], [548, .95, '#F57C00'], [585, .7, '#FF7A1A']].forEach(function (p) {
        s += '<g transform="translate(' + p[0] + ' 124) scale(' + p[1] + ')"><rect x="-3" y="-24" width="6" height="10" rx="2" fill="#4E6B2A"/><ellipse cx="-10" rx="10" ry="13" fill="' + mixc(p[2], '#000000', .25) + '"/><ellipse cx="10" rx="10" ry="13" fill="' + mixc(p[2], '#000000', .25) + '"/><ellipse rx="13" ry="14" fill="' + p[2] + '"/><ellipse cx="-4" cy="-4" rx="3" ry="6" fill="#fff" fill-opacity=".18"/><path d="M-7 -4 L-2 1 L-8 1Z M7 -4 L2 1 L8 1Z" fill="#FFE082"/><path d="M-7 6 L-4 9 L-1 6 L1 9 L4 6 L7 9" fill="none" stroke="#FFE082" stroke-width="1.8" stroke-linejoin="round"/></g>';
      });
      s += '<path d="M0 140 V130 Q80 124 160 131 T320 128 T480 131 T600 128 V140Z" fill="' + sil + '"/>';
      s += '<path d="M210 40 C208 36 204 35 200 37 C202 38 202 40 201 42 C203 41 205 41 207 43 L208 42 L210 43 C212 41 214 41 216 42 C215 40 215 38 217 37 C213 35 211 36 210 40Z M250 24 C248 20 244 19 240 21 C242 22 242 24 241 26 C243 25 245 25 247 27 L248 26 L250 27 C252 25 254 25 256 26 C255 24 255 22 257 21 C253 19 251 20 250 24Z" fill="' + sil + '"/>';
    } else if (theme === 'fete-nationale') {
      var pb = '#0A1A36', wl = '#FFE082';
      // immeubles haussmanniens
      [[0, 70, 70], [72, 60, 84], [134, 74, 66], [400, 66, 78], [480, 72, 70], [554, 50, 88]].forEach(function (b) {
        s += '<rect x="' + b[0] + '" y="' + (140 - b[2]) + '" width="' + b[1] + '" height="' + b[2] + '" fill="' + pb + '"/><path d="M' + (b[0] - 2) + ' ' + (140 - b[2]) + ' L' + (b[0] + 10) + ' ' + (140 - b[2] - 12) + ' H' + (b[0] + b[1] - 10) + ' L' + (b[0] + b[1] + 2) + ' ' + (140 - b[2]) + 'Z" fill="' + pb + '"/>';
        for (var r = 0; r < 3; r++) for (var cx = b[0] + 10; cx < b[0] + b[1] - 6; cx += 14) if ((cx * 7 + r * 13) % 5 !== 0) s += '<rect x="' + cx + '" y="' + (140 - b[2] + 10 + r * 18) + '" width="5" height="8" fill="' + wl + '" fill-opacity=".85"/>';
      });
      // arc de triomphe
      s += '<g transform="translate(228 0)"><rect x="0" y="86" width="56" height="52" fill="' + pb + '"/><path d="M16 138 V110 A12 12 0 0 1 40 110 V138Z" fill="#132a52"/><rect x="-3" y="80" width="62" height="8" fill="' + pb + '"/></g>';
      // tour Eiffel
      s += '<g transform="translate(330 0)"><path d="M30 8 L33 8 L38 50 L52 50 L50 56 L40 56 L48 92 L64 92 L62 98 L50 98 L64 138 L50 138 L46 126 Q31 118 16 126 L12 138 L-2 138 L12 98 L0 98 L-2 92 L14 92 L22 56 L12 56 L10 50 L24 50Z" fill="' + pb + '"/><path d="M31 8 V0" stroke="' + pb + '" stroke-width="2"/><path d="M38 50 H24 M48 92 H14" stroke="#FFE082" stroke-opacity=".5" stroke-width="1.5"/><circle cx="31" cy="30" r="1.5" fill="' + wl + '"/><circle cx="31" cy="74" r="1.5" fill="' + wl + '"/><circle cx="20" cy="112" r="1.5" fill="' + wl + '"/><circle cx="42" cy="112" r="1.5" fill="' + wl + '"/></g>';
      s += '<path d="M0 140 V134 H600 V140Z" fill="' + pb + '"/>';
    } else if (theme === 'saint-valentin') {
      var hb = '#4A1528', hb2 = '#5A1C32';
      s += '<path d="M0 140 V110 Q150 84 300 106 T600 100 V140Z" fill="' + hb2 + '"/><path d="M0 140 V124 Q120 108 240 122 T480 118 T600 124 V140Z" fill="' + hb + '"/>';
      // arbre en cœur
      s += '<g transform="translate(110 0)"><rect x="-5" y="78" width="10" height="46" fill="#3E1F1A"/><path d="M0 84 C-44 56 -40 14 -16 12 C-6 12 -2 20 0 28 C2 20 6 12 16 12 C40 14 44 56 0 84Z" fill="#D81B60"/><path d="M0 84 C-44 56 -40 14 -16 12 C-6 12 -2 20 0 28 C2 20 6 12 16 12 C40 14 44 56 0 84Z" fill="#F06292" fill-opacity=".45"/><g fill="#F8A5C2"><path d="M-22 40 C-26 36 -24 30 -20 31 C-18 31 -17 33 -17 34 C-16 33 -15 31 -13 31 C-9 30 -8 36 -17 42Z"/><path d="M14 30 C10 26 12 20 16 21 C18 21 19 23 19 24 C20 23 21 21 23 21 C27 20 28 26 19 32Z"/><path d="M-6 60 C-10 56 -8 50 -4 51 C-2 51 -1 53 -1 54 C0 53 1 51 3 51 C7 50 8 56 -1 62Z"/></g></g>';
      // banc et lampadaire
      s += '<g transform="translate(300 0)"><rect x="0" y="100" width="64" height="6" rx="2" fill="#6D4C41"/><rect x="2" y="92" width="60" height="5" rx="2" fill="#6D4C41"/><rect x="6" y="106" width="5" height="18" fill="#5D4037"/><rect x="53" y="106" width="5" height="18" fill="#5D4037"/><g transform="translate(96 0)"><rect x="-2" y="40" width="4" height="84" fill="#3E1F1A"/><path d="M-8 40 H8 L5 28 H-5Z" fill="#3E1F1A"/><circle cy="34" r="24" fill="#FFE082" fill-opacity=".16"/><circle cy="34" r="12" fill="#FFE082" fill-opacity=".25"/><circle cy="34" r="5" fill="#FFF3C4"/></g></g>';
      // cœurs flottants
      s += '<g fill="#F48FB1" fill-opacity=".8"><path d="M460 70 C452 62 456 50 464 52 C467 52 469 56 470 58 C471 56 473 52 476 52 C484 50 488 62 470 76Z"/><path d="M500 50 C495 45 497 38 502 39 C504 39 505 41 506 42 C507 41 508 39 510 39 C515 38 517 45 506 54Z"/><path d="M540 84 C536 80 538 74 542 75 C543 75 544 77 545 78 C546 77 547 75 548 75 C552 74 554 80 545 88Z"/></g>';
    } else if (theme === 'paques') {
      s += '<path d="M0 140 V96 Q150 70 300 94 T600 88 V140Z" fill="#2F6A48"/><path d="M0 140 V116 Q120 98 240 114 T480 110 T600 116 V140Z" fill="#3C8A58"/>';
      // arbre rond, barrière, fleurs, carottes
      s += '<g transform="translate(90 0)"><rect x="-4" y="70" width="8" height="40" fill="#5D4037"/><circle cy="54" r="30" fill="#4CAF50"/><circle cx="-14" cy="60" r="18" fill="#43A047"/><circle cx="14" cy="62" r="18" fill="#66BB6A"/><circle cx="-6" cy="42" r="4" fill="#F48FB1"/><circle cx="12" cy="50" r="4" fill="#FFF176"/><circle cx="0" cy="66" r="4" fill="#F48FB1"/></g>';
      s += '<g fill="#FBF4DE"><rect x="200" y="104" width="6" height="30"/><rect x="224" y="100" width="6" height="34"/><rect x="248" y="104" width="6" height="30"/><rect x="194" y="110" width="66" height="4"/><rect x="194" y="122" width="66" height="4"/><path d="M203 104 L203 98 L206 104Z M227 100 L227 94 L230 100Z M251 104 L251 98 L254 104Z"/></g>';
      var fl = [[30, '#F48FB1'], [140, '#FFF176'], [170, '#CE93D8'], [330, '#F48FB1'], [370, '#FFFFFF'], [410, '#FFF176'], [520, '#F48FB1'], [560, '#CE93D8']];
      fl.forEach(function (f, i) { var y = 116 + (i % 3) * 6; s += '<path d="M' + f[0] + ' ' + (y + 14) + ' V' + y + '" stroke="#2E7D32" stroke-width="2.5"/><path d="M' + (f[0] - 6) + ' ' + (y + 2) + ' L' + (f[0] - 6) + ' ' + (y - 8) + ' Q' + f[0] + ' ' + (y - 4) + ' ' + (f[0] + 6) + ' ' + (y - 8) + ' L' + (f[0] + 6) + ' ' + (y + 2) + ' Q' + f[0] + ' ' + (y + 7) + ' ' + (f[0] - 6) + ' ' + (y + 2) + 'Z" fill="' + f[1] + '"/>'; });
      s += '<g transform="translate(450 0)"><path d="M0 118 L6 136 L12 118Z M20 116 L26 134 L32 116Z M40 118 L46 136 L52 118Z" fill="#FB8C00"/><path d="M6 118 L2 106 M6 118 L10 106 M26 116 L22 104 M26 116 L30 104 M46 118 L42 106 M46 118 L50 106" stroke="#43A047" stroke-width="2.5" stroke-linecap="round"/></g>';
      s += '<g><path d="M300 126 C292 126 290 114 294 108 C298 102 308 104 310 110 C312 116 308 126 300 126Z" fill="#90CAF9"/><path d="M294 116 Q302 112 310 116" stroke="#fff" stroke-width="2" fill="none"/><path d="M580 128 C572 128 570 116 574 110 C578 104 588 106 590 112 C592 118 588 128 580 128Z" fill="#F48FB1"/><circle cx="578" cy="116" r="2" fill="#fff"/><circle cx="586" cy="120" r="2" fill="#fff"/></g>';
    }
    return s ? svgUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 140" width="600" height="140">' + s + '</svg>') : '';
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
    'noel': { band: ['pine', ['#E53935', '#F2C14E', '#1E88E5', '#E53935', '#F2C14E']], ribbon: 'Joyeuses fêtes !', hat: HAT, corner: HOLLY, snowcap: true },
    'halloween': { band: ['pennant', ['#FF7A1A', '#2A2A2E', '#9C4DCC', '#FF7A1A', '#2A2A2E'], { motif: 'halloween' }], ribbon: 'Halloween au food-truck !', webs: true, spider: true },
    'fete-nationale': { band: ['pennant', ['#2457C5', '#F7F7F7', '#E53935', '#2457C5', '#F7F7F7'], { motif: 'france' }], ribbon: 'Vive le 14 juillet !', corner: COCARDE },
    'saint-valentin': { band: ['heart', ['#E53935', '#F48FB1', '#D81B60', '#F8A5C2', '#E53935']], ribbon: 'Avec amour ♥', corner: '<svg class="deco-hearts" viewBox="0 0 80 60" aria-hidden="true"><path d="M22 52 C0 36 2 14 14 13 C19 13 21 17 22 21 C23 17 25 13 30 13 C42 14 44 36 22 52Z" fill="#E53935"/><path d="M52 40 C36 28 38 12 46 12 C50 12 51 15 52 17 C53 15 54 12 58 12 C66 12 68 28 52 40Z" fill="#F48FB1"/><path d="M66 56 C56 48 57 38 62 38 C64 38 65 40 66 41 C67 40 68 38 70 38 C75 38 76 48 66 56Z" fill="#D81B60"/></svg>' },
    'paques': { band: ['egg', ['#F48FB1', '#FFF176', '#A5D6A7', '#90CAF9', '#CE93D8']], ribbon: 'Joyeuses Pâques !', hat: EARS, grass: grass() }
  };
  var d = DECO[theme]; if (!d) return;

  // banderole sous la guirlande
  var fxOn = root.getAttribute('data-theme-fx') !== '0' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (d.band) {
    root.style.setProperty('--mini-bunting', bunting(d.band[0], d.band[1], d.band[2])); // petite version sur les encarts
    hero.insertAdjacentHTML('beforeend', buntingInline(d.band[0], d.band[1], d.band[2], fxOn)); // grande, en haut de l'entrée, animée
  }
  var sy = sceneryUri(theme);
  if (sy && hero.classList.contains('hero')) { var sd = document.createElement('div'); sd.className = 'deco-scenery'; sd.setAttribute('aria-hidden', 'true'); sd.style.backgroundImage = sy; hero.appendChild(sd); }
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
    css += 'html[data-theme] .band:not(.band--kraft):not(.band--photo),html[data-theme] .foot,html[data-theme] .page-hero,html[data-theme] body.menu-app{background-image:' + pattern('#FCF3E3', .13) + ';background-size:240px 240px}';
    css += 'html[data-theme] .band--kraft{background-image:' + pattern('#2A1A10', .11) + ',radial-gradient(rgba(255,255,255,.22) 1px,transparent 1.5px),radial-gradient(rgba(60,30,10,.07) 1px,transparent 1.5px);background-size:240px 240px,7px 7px,11px 11px;background-position:0 0,0 0,4px 6px}';
  }

  // --- scènes animées
  var SCENES = {
    'noel': { cls: 'train', html: '<svg viewBox="0 -30 420 150" aria-hidden="true"><defs><linearGradient id="tr-red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F05A4A"/><stop offset=".45" stop-color="#C62828"/><stop offset="1" stop-color="#7F1414"/></linearGradient><linearGradient id="tr-green" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5DB36A"/><stop offset=".5" stop-color="#2E7D32"/><stop offset="1" stop-color="#1B4D1E"/></linearGradient><linearGradient id="tr-blue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4F8DE0"/><stop offset=".5" stop-color="#1E5BB8"/><stop offset="1" stop-color="#143F82"/></linearGradient><linearGradient id="tr-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE59A"/><stop offset=".5" stop-color="#F2C14E"/><stop offset="1" stop-color="#B8860B"/></linearGradient><linearGradient id="tr-dark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#546E7A"/><stop offset="1" stop-color="#1F2A30"/></linearGradient><radialGradient id="tr-lamp" cx=".4" cy=".4" r=".7"><stop offset="0" stop-color="#FFFDE7"/><stop offset=".5" stop-color="#FFD54F"/><stop offset="1" stop-color="#F57F17"/></radialGradient><radialGradient id="tr-glow"><stop offset="0" stop-color="#FFE082" stop-opacity=".55"/><stop offset="1" stop-color="#FFE082" stop-opacity="0"/></radialGradient></defs><ellipse cx="210" cy="116" rx="200" ry="6" fill="rgba(0,0,0,.28)"/><g class="smoke" fill="#fff"><circle cx="52" cy="4" r="7"/><circle cx="64" cy="-8" r="10"/><circle cx="82" cy="-20" r="13"/></g><circle cx="30" cy="62" r="22" fill="url(#tr-glow)"/><path d="M4 110 L26 82 L30 82 L30 110Z" fill="url(#tr-dark)"/><path d="M10 110 L28 88 M16 110 L29 94 M22 110 L30 100" stroke="#90A4AE" stroke-width="1.5"/><rect x="26" y="98" width="166" height="9" rx="3" fill="#263238"/><path d="M40 18 H60 L58 26 H42Z" fill="#263238"/><rect x="43" y="25" width="14" height="30" rx="2" fill="#37474F"/><rect x="41" y="20" width="18" height="4" rx="2" fill="url(#tr-gold)"/><rect x="30" y="50" width="98" height="48" rx="22" fill="url(#tr-red)"/><rect x="30" y="50" width="98" height="48" rx="22" fill="none" stroke="#5A0E0E" stroke-width="1.2"/><path d="M44 58 Q78 50 112 58" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="5" stroke-linecap="round"/><rect x="66" y="48" width="6" height="52" rx="2" fill="url(#tr-gold)"/><rect x="96" y="48" width="6" height="52" rx="2" fill="url(#tr-gold)"/><ellipse cx="81" cy="48" rx="11" ry="7" fill="url(#tr-gold)"/><circle cx="30" cy="66" r="10" fill="url(#tr-gold)"/><circle cx="30" cy="66" r="6.5" fill="url(#tr-lamp)"/><circle cx="30" cy="74" r="16" fill="url(#tr-red)" opacity=".001"/><rect x="126" y="36" width="64" height="66" rx="7" fill="url(#tr-green)"/><rect x="126" y="36" width="64" height="66" rx="7" fill="none" stroke="#143A17" stroke-width="1.2"/><rect x="134" y="46" width="48" height="34" rx="5" fill="#FFF3E0"/><rect x="134" y="46" width="48" height="34" rx="5" fill="none" stroke="url(#tr-gold)" stroke-width="2.5"/><g transform="translate(158 68)"><path d="M-11 6 C-11 -4 11 -4 11 6 Z" fill="#C62828"/><circle cy="-4" r="9" fill="#FFE0B2"/><path d="M-9 -7 C-8 -20 6 -22 12 -14 L10 -10 L4 -12 C0 -14 -4 -10 -9 -7Z" fill="#E53935"/><circle cx="12" cy="-14" r="3.5" fill="#fff"/><path d="M-10 -7 h17 a2 2 0 0 1 0 4 h-17 a2 2 0 0 1 0 -4z" fill="#fff"/><path d="M-8 -2 C-8 10 8 10 8 -2 C5 2 -5 2 -8 -2Z" fill="#fff"/><circle cx="-3" cy="-5" r="1.2" fill="#3E2723"/><circle cx="3" cy="-5" r="1.2" fill="#3E2723"/><circle cy="-1.5" r="1.8" fill="#EF9A9A"/><path d="M14 -4 L17 -14" stroke="#C62828" stroke-width="5" stroke-linecap="round"/><path d="M15 -7 h5" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="18" cy="-17" r="4.2" fill="#C62828"/><path d="M20 -21 L22 -17" stroke="#C62828" stroke-width="3" stroke-linecap="round"/></g><rect x="120" y="28" width="76" height="10" rx="4" fill="#1B4D1E"/><path d="M122 30 Q158 22 194 30" fill="none" stroke="#F7F9FC" stroke-width="7" stroke-linecap="round"/><rect x="134" y="84" width="48" height="4" rx="2" fill="url(#tr-gold)"/><g class="wheel" style="transform-origin:62px 104px"><circle cx="62" cy="104" r="15" fill="#263238"/><circle cx="62" cy="104" r="12" fill="none" stroke="#F2C14E" stroke-width="2"/><path d="M62 92 V116 M50 104 H74 M53.5 95.5 L70.5 112.5 M70.5 95.5 L53.5 112.5" stroke="#F2C14E" stroke-width="2"/><circle cx="62" cy="104" r="3.5" fill="#F2C14E"/></g><g class="wheel" style="transform-origin:104px 104px"><circle cx="104" cy="104" r="15" fill="#263238"/><circle cx="104" cy="104" r="12" fill="none" stroke="#F2C14E" stroke-width="2"/><path d="M104 92 V116 M92 104 H116 M95.5 95.5 L112.5 112.5 M112.5 95.5 L95.5 112.5" stroke="#F2C14E" stroke-width="2"/><circle cx="104" cy="104" r="3.5" fill="#F2C14E"/></g><g class="wheel" style="transform-origin:150px 108px"><circle cx="150" cy="108" r="10" fill="#263238"/><circle cx="150" cy="108" r="7.5" fill="none" stroke="#F2C14E" stroke-width="1.8"/><path d="M150 100 V116 M142 108 H158" stroke="#F2C14E" stroke-width="1.8"/></g><g class="rod"><rect x="56" y="102" width="54" height="4" rx="2" fill="#B0BEC5"/><circle cx="62" cy="104" r="2.5" fill="#37474F"/><circle cx="104" cy="104" r="2.5" fill="#37474F"/></g><rect x="190" y="92" width="16" height="5" rx="2" fill="#546E7A"/><rect x="206" y="62" width="96" height="40" rx="7" fill="url(#tr-blue)"/><rect x="206" y="62" width="96" height="40" rx="7" fill="none" stroke="#0F2F63" stroke-width="1.2"/><rect x="214" y="70" width="80" height="24" rx="4" fill="none" stroke="url(#tr-gold)" stroke-width="2"/><path d="M208 64 Q254 56 300 64" fill="none" stroke="#F7F9FC" stroke-width="6" stroke-linecap="round"/><g transform="translate(236 52)"><rect x="-16" y="-20" width="32" height="26" rx="3" fill="#F9A825"/><rect x="-18" y="-22" width="36" height="8" rx="2" fill="#F57F17"/><path d="M0 -22 V6 M-16 -8 H16" stroke="#C62828" stroke-width="4"/><path d="M0 -22 C-8 -32 -14 -24 -4 -22 C-8 -16 0 -16 0 -22 C8 -32 14 -24 4 -22 C8 -16 0 -16 0 -22Z" fill="#E53935"/></g><g transform="translate(268 56)"><rect x="-12" y="-16" width="24" height="22" rx="3" fill="#E53935"/><rect x="-13" y="-17" width="26" height="7" rx="2" fill="#B71C1C"/><path d="M0 -17 V6 M-12 -6 H12" stroke="#F2C14E" stroke-width="3"/><path d="M0 -17 C-6 -26 -11 -19 -3 -17 C-6 -12 0 -13 0 -17 C6 -26 11 -19 3 -17 C6 -12 0 -13 0 -17Z" fill="#F2C14E"/></g><g transform="translate(290 60)"><rect x="-9" y="-12" width="18" height="16" rx="2" fill="#43A047"/><path d="M0 -12 V4 M-9 -4 H9" stroke="#fff" stroke-width="2.5"/></g><g class="wheel" style="transform-origin:226px 106px"><circle cx="226" cy="106" r="11" fill="#263238"/><circle cx="226" cy="106" r="8" fill="none" stroke="#F2C14E" stroke-width="1.8"/><path d="M226 97 V115 M217 106 H235" stroke="#F2C14E" stroke-width="1.8"/></g><g class="wheel" style="transform-origin:282px 106px"><circle cx="282" cy="106" r="11" fill="#263238"/><circle cx="282" cy="106" r="8" fill="none" stroke="#F2C14E" stroke-width="1.8"/><path d="M282 97 V115 M273 106 H291" stroke="#F2C14E" stroke-width="1.8"/></g><rect x="300" y="92" width="16" height="5" rx="2" fill="#546E7A"/><rect x="316" y="62" width="98" height="40" rx="7" fill="url(#tr-red)"/><rect x="316" y="62" width="98" height="40" rx="7" fill="none" stroke="#5A0E0E" stroke-width="1.2"/><rect x="324" y="70" width="82" height="24" rx="4" fill="none" stroke="url(#tr-gold)" stroke-width="2"/><path d="M318 64 Q365 56 412 64" fill="none" stroke="#F7F9FC" stroke-width="6" stroke-linecap="round"/><g transform="translate(346 44)"><circle cy="12" r="14" fill="#fff"/><circle cy="12" r="14" fill="none" stroke="#CFD8DC" stroke-width="1"/><circle cy="-8" r="10" fill="#fff"/><circle cy="-8" r="10" fill="none" stroke="#CFD8DC" stroke-width="1"/><rect x="-9" y="-28" width="18" height="13" rx="1.5" fill="#263238"/><rect x="-13" y="-17" width="26" height="4" rx="2" fill="#263238"/><rect x="-9" y="-20" width="18" height="3" fill="#E53935"/><circle cx="-3.5" cy="-10" r="1.4" fill="#263238"/><circle cx="3.5" cy="-10" r="1.4" fill="#263238"/><path d="M1 -7 L12 -5 L1 -3Z" fill="#FB8C00"/><path d="M-4 -4 Q0 -1 4 -4" fill="none" stroke="#263238" stroke-width="1.2"/><path d="M-10 1 Q0 6 10 1" fill="none" stroke="#E53935" stroke-width="5" stroke-linecap="round"/><path d="M6 2 L9 14" stroke="#E53935" stroke-width="5" stroke-linecap="round"/><circle cy="8" r="1.6" fill="#263238"/><circle cy="14" r="1.6" fill="#263238"/><circle cy="20" r="1.6" fill="#263238"/><path d="M-13 8 L-24 0 M-24 0 L-28 -4 M-24 0 L-27 4" stroke="#6D4C41" stroke-width="2.2" stroke-linecap="round"/><path d="M13 8 L24 2 M24 2 L28 -1 M24 2 L28 6" stroke="#6D4C41" stroke-width="2.2" stroke-linecap="round"/></g><g transform="translate(390 40)"><path d="M0 -22 L12 -6 L6 -6 L17 10 L9 10 L22 26 L-22 26 L-9 10 L-17 10 L-6 -6 L-12 -6Z" fill="url(#tr-green)"/><path d="M0 -22 L12 -6 L6 -6 L17 10 L9 10 L22 26 L-22 26 L-9 10 L-17 10 L-6 -6 L-12 -6Z" fill="none" stroke="#143A17" stroke-width="1"/><path d="M-6 -6 Q0 -2 6 -6 M-13 10 Q0 15 13 10" fill="none" stroke="#F7F9FC" stroke-width="3" stroke-linecap="round"/><circle cx="-5" cy="4" r="2.4" fill="#F2C14E"/><circle cx="7" cy="16" r="2.4" fill="#E53935"/><circle cx="-10" cy="19" r="2.4" fill="#4F8DE0"/><circle cx="4" cy="-10" r="2" fill="#E53935"/><path d="M0 -30 L2 -24 L8 -24 L3 -20 L5 -14 L0 -18 L-5 -14 L-3 -20 L-8 -24 L-2 -24Z" fill="#F2C14E"/><rect x="-3" y="26" width="6" height="7" fill="#5D4037"/></g><g class="wheel" style="transform-origin:338px 106px"><circle cx="338" cy="106" r="11" fill="#263238"/><circle cx="338" cy="106" r="8" fill="none" stroke="#F2C14E" stroke-width="1.8"/><path d="M338 97 V115 M329 106 H347" stroke="#F2C14E" stroke-width="1.8"/></g><g class="wheel" style="transform-origin:394px 106px"><circle cx="394" cy="106" r="11" fill="#263238"/><circle cx="394" cy="106" r="8" fill="none" stroke="#F2C14E" stroke-width="1.8"/><path d="M394 97 V115 M385 106 H403" stroke="#F2C14E" stroke-width="1.8"/></g></svg>', dur: 32, dir: -1, ground: true },
    'halloween': { cls: 'witch', html:
      '<svg viewBox="0 0 230 150" aria-hidden="true">' +
      '<defs><linearGradient id="wd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5E35B1"/><stop offset="1" stop-color="#1E1230"/></linearGradient><linearGradient id="wh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3A2A55"/><stop offset="1" stop-color="#15101F"/></linearGradient><radialGradient id="wf" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#C5E1A5"/><stop offset="1" stop-color="#7CB342"/></radialGradient></defs>' +
      // balai : manche + paille
      '<path d="M24 106 L176 82" stroke="#6D4C41" stroke-width="7" stroke-linecap="round"/><path d="M24 106 L176 82" stroke="#A1887F" stroke-width="2" stroke-linecap="round" transform="translate(0 -2)"/>' +
      '<path d="M172 70 L222 52 M174 76 L226 66 M176 82 L228 82 M174 88 L226 98 M172 94 L220 110 M178 78 L224 58 M178 86 L226 90" stroke="#C99A2E" stroke-width="5" stroke-linecap="round"/><path d="M174 74 L224 60 M176 84 L226 86 M174 90 L222 104" stroke="#E8B84A" stroke-width="2.5" stroke-linecap="round"/><path d="M168 72 L172 96" stroke="#C62828" stroke-width="7" stroke-linecap="round"/><path d="M168 72 L172 96" stroke="#E53935" stroke-width="3" stroke-linecap="round"/>' +
      // chat noir à l'arrière
      '<g transform="translate(150 60)"><path d="M10 26 C24 10 30 12 32 24" fill="none" stroke="#111" stroke-width="5" stroke-linecap="round"/><ellipse cx="0" cy="18" rx="16" ry="12" fill="#111"/><circle cx="-12" cy="4" r="10" fill="#111"/><path d="M-20 -2 L-19 -14 L-11 -6Z M-4 -2 L-5 -14 L-13 -6Z" fill="#111"/><circle cx="-15" cy="3" r="1.8" fill="#9CCC65"/><circle cx="-9" cy="3" r="1.8" fill="#9CCC65"/><circle cx="-15" cy="3" r=".7" fill="#111"/><circle cx="-9" cy="3" r=".7" fill="#111"/></g>' +
      // cape et robe
      '<path d="M90 60 C110 64 134 72 150 96 C134 92 116 94 104 100 C100 86 96 72 90 60Z" fill="url(#wh)"/>' +
      '<path d="M62 54 C54 70 50 86 48 100 L112 102 C106 84 100 70 92 56Z" fill="url(#wd)"/><path d="M70 60 C66 72 64 84 63 98" stroke="#7E57C2" stroke-opacity=".5" stroke-width="3" stroke-linecap="round"/>' +
      // jambes : bas rayés et bottines
      '<path d="M58 100 L38 116" stroke="#FF8F00" stroke-width="9" stroke-linecap="round"/><path d="M58 100 L38 116" stroke="#1A1A1A" stroke-width="9" stroke-linecap="round" stroke-dasharray="5 5"/><path d="M70 102 L52 120" stroke="#FF8F00" stroke-width="9" stroke-linecap="round"/><path d="M70 102 L52 120" stroke="#1A1A1A" stroke-width="9" stroke-linecap="round" stroke-dasharray="5 5" stroke-dashoffset="3"/>' +
      '<path d="M40 112 L20 118 L18 124 L42 124Z" fill="#111"/><path d="M54 116 L34 122 L32 128 L56 128Z" fill="#111"/><circle cx="22" cy="120" r="2" fill="#F2C14E"/><circle cx="36" cy="124" r="2" fill="#F2C14E"/>' +
      // bras tenant le manche
      '<path d="M78 76 C70 84 62 92 54 98" stroke="url(#wd)" stroke-width="9" stroke-linecap="round"/><path d="M78 76 C70 84 62 92 54 98" stroke="#1E1230" stroke-width="9" stroke-linecap="round" stroke-opacity=".7"/><circle cx="52" cy="100" r="5" fill="#9CCC65"/>' +
      // tête : cheveux, visage, nez, bouche, œil
      '<path d="M92 44 C104 40 120 48 130 64 C120 58 108 58 96 62Z" fill="#FF8F00"/><path d="M94 48 C106 46 118 52 126 62" stroke="#FFB74D" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
      '<circle cx="76" cy="46" r="15" fill="url(#wf)"/><path d="M63 44 L54 48 L64 50Z" fill="#9CCC65"/><circle cx="70" cy="43" r="2.2" fill="#111"/><circle cx="69.5" cy="42.5" r=".7" fill="#fff"/><path d="M66 53 Q72 57 78 52" stroke="#7B1FA2" stroke-width="1.8" fill="none" stroke-linecap="round"/><circle cx="56" cy="48" r="1.3" fill="#33691E"/>' +
      // chapeau pointu
      '<path d="M54 36 L104 30 L102 36 Z" fill="#15101F"/><path d="M58 34 C70 10 82 -2 112 -4 C96 8 100 22 96 34Z" fill="url(#wh)"/><path d="M60 34 C68 16 78 6 98 2" stroke="#7E57C2" stroke-opacity=".5" stroke-width="2" fill="none"/><path d="M62 30 L94 26 L96 34 L58 36Z" fill="#6A1B9A"/><rect x="76" y="26" width="8" height="9" rx="1.5" fill="#F2C14E"/><rect x="78" y="28" width="4" height="5" rx="1" fill="#6A1B9A"/>' +
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
      '<svg viewBox="0 0 230 120" aria-hidden="true">' +
      '<defs><radialGradient id="bf" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#FFF9F0"/><stop offset=".7" stop-color="#F3E3CE"/><stop offset="1" stop-color="#D9C4A6"/></radialGradient><linearGradient id="bk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D9B57A"/><stop offset="1" stop-color="#A67C3D"/></linearGradient></defs>' +
      '<g class="hop">' +
      // papillon
      '<g transform="translate(40 18)"><path d="M0 0 C-8 -12 -18 -6 -12 2 C-18 8 -8 14 0 4Z M0 0 C8 -12 18 -6 12 2 C18 8 8 14 0 4Z" fill="#F48FB1"/><path d="M-9 -2 C-11 0 -11 4 -8 5 M9 -2 C11 0 11 4 8 5" stroke="#fff" stroke-width="1.5" fill="none"/><path d="M0 -2 V6" stroke="#4E342E" stroke-width="1.6"/></g>' +
      // corps, pattes arrière, queue
      '<ellipse cx="86" cy="76" rx="34" ry="24" fill="url(#bf)"/><ellipse cx="66" cy="92" rx="16" ry="9" fill="#F3E3CE"/><ellipse cx="66" cy="92" rx="16" ry="9" fill="none" stroke="#D9C4A6" stroke-width="1"/><circle cx="52" cy="66" r="9" fill="#fff"/><circle cx="49" cy="63" r="4" fill="#fff"/><circle cx="56" cy="70" r="4" fill="#fff"/>' +
      // tête et oreilles
      '<circle cx="122" cy="56" r="20" fill="url(#bf)"/><path d="M110 40 C100 14 104 0 114 2 C122 4 124 26 122 40Z" fill="#F3E3CE"/><path d="M112 36 C106 18 108 8 113 8 C117 9 118 26 118 36Z" fill="#F8BBD0"/><path d="M128 38 C130 12 140 0 148 6 C152 12 142 30 134 42Z" fill="#F3E3CE"/><path d="M130 36 C133 18 140 10 144 12 C146 16 139 30 133 38Z" fill="#F8BBD0"/>' +
      '<circle cx="130" cy="52" r="3" fill="#3E2723"/><circle cx="131" cy="51" r="1" fill="#fff"/><path d="M138 60 C140 58 143 58 144 60 C144 63 140 65 139 64 C137 65 134 63 134 60 C135 58 137 58 138 60Z" fill="#F06292"/><path d="M139 64 V68 M139 68 Q135 71 132 68 M139 68 Q143 71 146 68" stroke="#3E2723" stroke-width="1.2" fill="none" stroke-linecap="round"/><path d="M128 64 L116 62 M128 66 L116 68 M150 64 L162 62 M150 66 L162 68" stroke="#8D6E63" stroke-width="1" stroke-linecap="round"/><circle cx="112" cy="58" r="4" fill="#F8BBD0" fill-opacity=".6"/>' +
      // nœud au cou
      '<path d="M114 74 L104 68 L104 80Z M114 74 L124 68 L124 80Z" fill="#64B5F6"/><circle cx="114" cy="74" r="3" fill="#1E88E5"/>' +
      // pattes avant et panier
      '<path d="M106 84 L124 92" stroke="#F3E3CE" stroke-width="9" stroke-linecap="round"/><path d="M114 80 L132 88" stroke="#F3E3CE" stroke-width="9" stroke-linecap="round"/>' +
      '<path d="M128 88 L172 88 L166 112 L134 112Z" fill="url(#bk)"/><path d="M130 96 H170 M132 104 H168 M138 88 L136 112 M150 88 L150 112 M162 88 L164 112" stroke="#8D6E63" stroke-width="1.4"/><path d="M132 88 Q150 60 168 88" fill="none" stroke="#A67C3D" stroke-width="4"/><path d="M134 88 Q150 64 166 88" fill="none" stroke="#D9B57A" stroke-width="1.5"/>' +
      '<ellipse cx="140" cy="84" rx="7" ry="9" fill="#90CAF9"/><path d="M135 82 Q140 79 145 82 M135 87 Q140 90 145 87" stroke="#fff" stroke-width="1.5" fill="none"/><ellipse cx="151" cy="81" rx="7" ry="9" fill="#F48FB1"/><circle cx="149" cy="78" r="1.5" fill="#fff"/><circle cx="153" cy="84" r="1.5" fill="#fff"/><ellipse cx="162" cy="84" rx="7" ry="9" fill="#FFF176"/><path d="M157 80 L160 84 L163 80 L166 84" stroke="#fff" stroke-width="1.5" fill="none"/>' +
      '</g>' +
      // poussin qui suit
      '<g class="chick" transform="translate(16 92)"><ellipse rx="12" ry="9" fill="#FFEE58"/><ellipse cx="-4" cy="1" rx="6" ry="4" fill="#FDD835"/><circle cx="9" cy="-8" r="8" fill="#FFEE58"/><path d="M16 -8 L24 -5 L16 -2Z" fill="#FB8C00"/><circle cx="11" cy="-10" r="1.4" fill="#4E342E"/><path d="M4 -16 Q6 -20 9 -16" stroke="#FDD835" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M-5 9 L-7 16 M-7 16 L-10 18 M-7 16 L-4 18 M3 9 L3 16 M3 16 L0 18 M3 16 L6 18" stroke="#FB8C00" stroke-width="1.6" stroke-linecap="round"/></g>' +
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
