// Ce middleware tourne sur chaque page HTML publique.
// Il lit l'état dans D1 et adapte le HTML avant de l'envoyer :
//  - construit la carte des burgers et le carrousel à partir de la base (photos, textes, prix, ruptures)
//  - met les prix des formules à jour
//  - retire les emplacements suspendus
//  - affiche le bandeau si défini
//  - injecte l'état en JSON pour le JavaScript de la page ("Ce soir", formulaire)
// Résultat : Google voit le HTML final, sans JavaScript à exécuter.
// Si la base est injoignable, la page est servie telle quelle (contenu de secours écrit dans index.html).

import { loadState, computeTonight, altPhoto, typo } from './_lib.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ',')) + ' €';
const fmtSup = (n) => '+' + fmt(n);
// Pour les photos livrées avec le site (/img/xxx.jpg), on propose les versions WebP (pleine et 640 px)
const srcset = (photo) => /^\/img\/[A-Za-z0-9_-]+\.jpg$/.test(photo) ? ` srcset="${photo.replace('.jpg', '-640.webp')} 640w, ${photo.replace('.jpg', '.webp')} 1100w"` : '';

// ---- HTML de la carte (section Menu)
function renderMenu(state) {
  const list = state.burgers.filter((b) => b.actif);
  const n = list.length;
  const rem = n > 1 ? (n - 2) % 3 : 0; // disposition : 1 grande carte + 1, puis rangées de 3
  return list.map((b, i) => {
    let cls = 'dish';
    if (i === 0) cls += ' dish--featured';
    else if (i === n - 1 && n > 2 && rem === 2) cls += ' dish--wide';
    else if (i === n - 1 && n > 2 && rem === 1) cls += ' dish--full';
    const prix = fmt(state.prix.burger + b.supplement); // prix du burger seul, supplément compris
    const sizes = i === 0 ? '(max-width: 980px) 100vw, 66vw' : '(max-width: 600px) 100vw, (max-width: 980px) 50vw, 33vw';
    return `<li class="${cls}" data-burger="${esc(b.id)}"${b.rupture ? ' data-rupture="1"' : ''}>
  <div class="dish__img"><img src="${esc(b.photo || '/img/og.jpg')}"${srcset(b.photo)} sizes="${sizes}" alt="${esc(altPhoto(b.nom))}" width="1100" height="1100" loading="lazy" decoding="async"><span class="dish__price${b.supplement ? ' sup' : ''}">${prix}</span></div>
  <div class="dish__body"><h3>${esc(typo(b.nom))}</h3>${b.supplement ? `<span class="dish__sup">Supplément ${fmtSup(b.supplement)}</span>` : ''}${b.accroche ? `<span class="tag">${esc(typo(b.accroche))}</span>` : ''}<p class="ing">${esc(typo(b.description))}</p></div>
</li>`;
  }).join('\n');
}

// ---- HTML des photos du carrousel (hero)
function renderShow(state) {
  const list = state.burgers.filter((b) => b.actif && b.photo);
  return list.map((b, i) => {
    const prix = fmt(state.prix.burger + b.supplement);
    return `<figure${i === 0 ? ' class="is-on"' : ''} data-burger="${esc(b.id)}"${b.rupture ? ' data-rupture="1"' : ''} data-name="${esc(typo(b.nom))}" data-sub="${esc(typo(b.accroche || b.description.slice(0, 70)))}" data-prix="${prix}"><img src="${esc(b.photo)}"${srcset(b.photo)} sizes="(max-width: 900px) 92vw, 45vw" alt="${esc(altPhoto(b.nom))}" width="1100" height="1100"${i === 0 ? ' fetchpriority="high"' : ' loading="lazy" decoding="async"'}></figure>`;
  }).join('\n');
}

// ---- Données structurées (menu) pour Google
function renderMenuLd(state) {
  const items = state.burgers.filter((b) => b.actif).map((b) => ({
    '@type': 'MenuItem', name: b.nom, description: b.description, image: b.photo ? 'https://www.larretgourmand.com' + b.photo : undefined,
    offers: { '@type': 'Offer', price: (state.prix.burger + b.supplement).toFixed(2), priceCurrency: 'EUR' },
  }));
  return JSON.stringify({ '@context': 'https://schema.org', '@type': 'Menu', name: 'Menu', inLanguage: 'fr', hasMenuSection: [{ '@type': 'MenuSection', name: 'Burgers', hasMenuItem: items }] }).replace(/</g, '\\u003c');
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // Les API, les photos et les fichiers (images, admin…) passent sans modification
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin') || url.pathname.startsWith('/photos/') || /\.[a-z0-9]+$/i.test(url.pathname)) {
    return next();
  }

  const response = await next();
  const ct = response.headers.get('content-type') || '';
  if (!ct.includes('text/html') || !env.DB) return response;

  let state;
  try {
    state = await loadState(env);
  } catch (e) {
    console.error('loadState failed', e);
    return response;
  }
  const tonight = computeTonight(state);
  const empById = Object.fromEntries(state.emplacements.map((e) => [e.id, e]));
  const payload = JSON.stringify({ ...state, tonight });
  const menuHtml = renderMenu(state);
  const showHtml = renderShow(state);
  const first = state.burgers.find((b) => b.actif && b.photo);

  const rewriter = new HTMLRewriter()
    // ---- Carte et carrousel entièrement reconstruits depuis la base
    .on('[data-menu]', { element(el) { el.setInnerContent(menuHtml, { html: true }); } })
    .on('[data-show-figures]', { element(el) { el.setInnerContent(showHtml, { html: true }); } })
    .on('#showName', { element(el) { if (first) el.setInnerContent(`${esc(first.nom)}<small id="showSub">${esc(first.rupture ? 'Épuisé ce soir' : (first.accroche || first.description.slice(0, 70)))}</small>`, { html: true }); } })
    .on('#showPrice', { element(el) { if (first) el.setInnerContent(fmt(state.prix.burger + first.supplement)); } })
    .on('script[data-ld-menu]', { element(el) { el.setInnerContent(renderMenuLd(state), { html: true }); } })
    // ---- Prix des suppléments (ardoise)
    .on('[data-prix-sup]', {
      element(el) {
        const v = state.supplements[el.getAttribute('data-prix-sup')];
        if (v !== undefined) el.setInnerContent(fmtSup(v));
      },
    })
    // ---- Prix des formules (ardoise)
    .on('[data-prix-formule]', {
      element(el) {
        const k = el.getAttribute('data-prix-formule');
        const v = { burger: state.prix.burger, menu_frites: state.prix.menu_frites, menu_complet: state.prix.menu_complet, frites: state.prix.frites }[k];
        if (v !== undefined) el.setInnerContent(fmt(v));
      },
    })
    // ---- Emplacements
    .on('[data-emplacement]', {
      element(el) {
        const e = empById[el.getAttribute('data-emplacement')];
        if (!e) return;
        if (!e.actif) { el.remove(); return; }
        el.setAttribute('data-jour', String(e.jour));
      },
    })
    .on('[data-emplacement] h3', { element(el) { const e = empById[el.getAttribute('data-id')]; if (e) el.setInnerContent(e.ville); } })
    .on('[data-emplacement] .ticket__hours', { element(el) { const e = empById[el.getAttribute('data-id')]; if (e) el.setInnerContent(e.heures); } })
    .on('[data-emplacement] .ticket__place', {
      element(el) {
        const e = empById[el.getAttribute('data-id')];
        if (e) el.setInnerContent(`Map : ${e.map_url ? `<a href="${esc(e.map_url)}" target="_blank" rel="noopener">${esc(e.lieu)}</a>` : esc(e.lieu)}`, { html: true });
      },
    })
    // ---- Thème saisonnier (couleurs, guirlande, animation) choisi dans l'admin
    .on('html', {
      element(el) {
        if (state.theme) { el.setAttribute('data-theme', state.theme); el.setAttribute('data-theme-fx', state.theme_fx ? '1' : '0'); }
      },
    })
    // ---- Bandeau et état injecté
    .on('head', {
      element(el) {
        el.append(`<script id="site-state" type="application/json">${payload.replace(/</g, '\\u003c')}</script>`, { html: true });
      },
    })
    .on('[data-bandeau]', {
      element(el) {
        if (state.bandeau) { el.setInnerContent(state.bandeau); el.removeAttribute('hidden'); }
        else el.remove();
      },
    });

  const out = rewriter.transform(response);
  const headers = new Headers(out.headers);
  headers.set('cache-control', 'public, max-age=60, s-maxage=60');
  return new Response(out.body, { status: out.status, headers });
}
