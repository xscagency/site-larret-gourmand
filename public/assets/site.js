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
    var openDlg = function () { try { dlg.showModal(); document.documentElement.classList.add('dlg-open'); } catch (e) {} };
    dlg.addEventListener('close', function () { document.documentElement.classList.remove('dlg-open'); });
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
