// API du tableau de contrôle. Toutes les routes exigent le jeton ADMIN_TOKEN
// (variable d'environnement) envoyé en en-tête : Authorization: Bearer <jeton>
//
//   GET    /api/admin/state                 état complet (burgers, emplacements, exceptions, réglages)
//   POST   /api/admin/burgers               { nom, accroche, description, photo, supplement }  → crée un burger
//   PUT    /api/admin/burgers/ordre         { ids: ['poulet','americain',…] }  → réordonne
//   PUT    /api/admin/burgers/:id           { nom, accroche, description, photo, supplement, actif, rupture_jusqua }
//   DELETE /api/admin/burgers/:id
//   POST   /api/admin/photo                 corps = image (jpeg/png/webp), en-tête X-Filename → { path: '/photos/…' }
//   PUT    /api/admin/emplacements/:id      { actif, ville, lieu, map_url, heures }
//   PUT    /api/admin/exceptions/:date      { annule, message, ville, lieu, map_url, heures }
//   DELETE /api/admin/exceptions/:date
//   PUT    /api/admin/reglages              { prix_burger, prix_menu_frites, prix_menu_complet, prix_frites, bandeau }
//   GET    /api/admin/demandes              liste des demandes (200 dernières)
//   PUT    /api/admin/demandes/:id          { statut }
//   DELETE /api/admin/demandes/:id
//   GET    /api/admin/devis                 liste des devis
//   POST   /api/admin/devis                 { demande_id } ou {} → crée un brouillon pré-rempli, renvoie le devis
//   PUT    /api/admin/devis/:id             champs du devis (client, intro, lignes, mode, statut, email_objet, email_corps)
//   DELETE /api/admin/devis/:id
//   POST   /api/admin/devis/:id/envoyer     { pdf_base64 } → e-mail au client avec le PDF (Resend)
//   POST   /api/admin/devis/:id/facturer    crée la facture d'un devis validé (type 'facture', numéro F + date + compteur)
//   POST   /api/admin/devis/:id/relancer    { email_objet, email_corps } → e-mail de relance avec le PDF archivé
//   GET    /api/admin/evenements             événements publics (marchés, festivals…) à venir et des 60 derniers jours
//   POST   /api/admin/evenements             { titre, date, heures, lieu, ville, contact, notes, rappel }
//   PUT    /api/admin/evenements/:id         mêmes champs + statut ('prevu' | 'annule')
//   DELETE /api/admin/evenements/:id
//   POST   /api/admin/rappels                { force } → rappels Telegram des privatisations (J-7, J-1, jour J à 9h) ; appelé chaque matin par GitHub Actions
//   GET    /api/admin/distance?q=adresse    km routiers depuis Verneuil-sur-Seine
//   GET    /api/admin/alertes               abonnés (compteurs) + historique des envois
//   POST   /api/admin/alertes               { sujet, titre, corps, url, villes } → prépare un envoi, renvoie { id, cibles }
//   POST   /api/admin/alertes/:id/lot       envoie au prochain paquet d'abonnés → { envoyes, echecs, restant, termine }

import { json, loadState, computeTonight, slugify, todayParis } from '../../_lib.js';
import { computeTotals, nextNumero, MOMENTS, dateFr, fillTemplate, distanceKm, sendDevisEmail, eur } from '../../_devis.js';
import { getVapid, sendPush, SUJETS, cleAbonne, typeAppareil } from '../../_push.js';
import { telegramConfig, detectChat } from '../../_telegram.js';
import { runRappels } from '../../_rappels.js';
import { getVisites } from '../../_visites.js';
import { getSearchConsole } from '../../_google.js';
import { addDays } from '../../_lib.js';

function authorized(request, env) {
  const h = request.headers.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  return !!env.ADMIN_TOKEN && token === env.ADMIN_TOKEN;
}

const num = (v, def = 0) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? def : Number(v));
const bool = (v) => (v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0);
const isoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : null;
const str = (v, max) => String(v ?? '').trim().slice(0, max);
const photoPath = (v) => { const s = str(v, 300); return /^\/(img|photos|f)\/[A-Za-z0-9._-]+$/.test(s) ? s : ''; };

export async function onRequest({ request, env, params }) {
  if (!authorized(request, env)) return json({ ok: false, error: 'Accès refusé.' }, 401);

  const route = (params.route || []).join('/');
  const method = request.method;
  const isJson = (request.headers.get('content-type') || '').includes('application/json');
  const body = (method === 'PUT' || method === 'POST') && isJson ? await request.json().catch(() => ({})) : {};

  // ---- État complet
  if (route === 'state' && method === 'GET') {
    const state = await loadState(env);
    const raw = await env.DB.prepare('SELECT id, rupture_jusqua FROM burgers').all();
    const rupt = Object.fromEntries(raw.results.map((r) => [r.id, r.rupture_jusqua]));
    state.burgers = state.burgers.map((b) => ({ ...b, rupture_jusqua: rupt[b.id] || '' }));
    const rg = await env.DB.prepare("SELECT cle, valeur FROM reglages WHERE cle LIKE 'devis_%'").all();
    const d = Object.fromEntries(rg.results.map((x) => [x.cle, x.valeur]));
    state.devis_reglages = { email_objet: d.devis_email_objet || '', email_corps: d.devis_email_corps || '', contact_email: d.devis_contact_email || '', km_tarif: Number(d.devis_km_tarif || 1),
      facture_objet: d.devis_facture_objet || '', facture_corps: d.devis_facture_corps || '', relance_objet: d.devis_relance_objet || '', relance_corps: d.devis_relance_corps || '' };
    state.mail_configure = !!(env.RESEND_API_KEY && env.MAIL_FROM);
    const tcfg = await telegramConfig(env, 'rappels');
    state.telegram_configure = !!tcfg;
    state.rappels_bot = tcfg ? tcfg.source : 'aucun';
    state.rappels_chat_id = tcfg && tcfg.source === 'dedie' ? tcfg.chat : '';
    const rp = Object.fromEntries((await env.DB.prepare("SELECT cle, valeur FROM reglages WHERE cle LIKE 'rappels_%'").all()).results.map((x) => [x.cle, x.valeur]));
    state.rappels_dernier = rp.rappels_dernier || '';
    state.rappels_envoyes = Number(rp.rappels_envoyes || 0);
    return json({ ok: true, state: { ...state, tonight: computeTonight(state) } });
  }

  // ---- Visites du site (Cloudflare Web Analytics) pour le tableau de bord
  if (route === 'visites' && method === 'GET') {
    const u = new URL(request.url);
    const jours = u.searchParams.get('jours') === '90' ? 90 : 30;
    try { return json({ ok: true, ...(await getVisites(env, { jours, force: u.searchParams.get('force') === '1' })) }); }
    catch (e) { return json({ ok: true, configure: true, erreur: String(e.message || e) }); }
  }

  // ---- Google Search Console (requêtes, clics, impressions) pour le tableau de bord
  if (route === 'google' && method === 'GET') {
    const u = new URL(request.url);
    const jours = u.searchParams.get('jours') === '90' ? 90 : 28;
    try { return json({ ok: true, ...(await getSearchConsole(env, { jours, force: u.searchParams.get('force') === '1' })) }); }
    catch (e) { return json({ ok: true, configure: true, erreur: String(e.message || e) }); }
  }

  // ---- Photo : envoi vers R2
  if (route === 'photo' && method === 'POST') {
    const type = request.headers.get('content-type') || '';
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[type];
    if (!ext) return json({ ok: false, error: 'Format accepté : JPEG, PNG ou WebP.' }, 400);
    const buf = await request.arrayBuffer();
    if (buf.byteLength > 6 * 1024 * 1024) return json({ ok: false, error: 'Photo trop lourde (6 Mo max).' }, 400);
    const base = slugify((request.headers.get('x-filename') || 'photo').replace(/\.[a-z0-9]+$/i, ''));
    if (!env.PHOTOS) {
      // pas de stockage R2 : la photo (déjà réduite par le navigateur) est gardée dans la base, servie par /f/…
      if (buf.byteLength > 1.5 * 1024 * 1024) return json({ ok: false, error: 'Photo trop lourde pour le stockage actuel (1,5 Mo max).' }, 400);
      await loadState(env);
      const token = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
      const ins = await env.DB.prepare('INSERT INTO fichiers (token, type, nom, taille, data) VALUES (?, ?, ?, ?, ?) RETURNING id').bind(token, type, base, buf.byteLength, buf).first();
      return json({ ok: true, path: `/f/${ins.id}-${token}.${ext}` });
    }
    const key = `${Date.now().toString(36)}-${base}.${ext}`;
    await env.PHOTOS.put(key, buf, { httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000, immutable' } });
    return json({ ok: true, path: `/photos/${key}` });
  }

  // ---- Burgers : création
  if (route === 'burgers' && method === 'POST') {
    const nom = str(body.nom, 80);
    if (!nom) return json({ ok: false, error: 'Le nom est obligatoire.' }, 400);
    let id = slugify(nom), i = 2;
    while (await env.DB.prepare('SELECT 1 FROM burgers WHERE id = ?').bind(id).first()) id = `${slugify(nom)}-${i++}`;
    const max = await env.DB.prepare('SELECT COALESCE(MAX(ordre), 0) AS m FROM burgers').first();
    await env.DB.prepare('INSERT INTO burgers (id, nom, accroche, description, photo, supplement, actif, ordre) VALUES (?,?,?,?,?,?,1,?)')
      .bind(id, nom, str(body.accroche, 160), str(body.description, 600), photoPath(body.photo), num(body.supplement), (max?.m || 0) + 1).run();
    return json({ ok: true, id });
  }

  // ---- Burgers : ordre
  if (route === 'burgers/ordre' && method === 'PUT') {
    const ids = Array.isArray(body.ids) ? body.ids.map((x) => str(x, 60)) : [];
    if (!ids.length) return json({ ok: false, error: 'Liste vide.' }, 400);
    await env.DB.batch(ids.map((id, i) => env.DB.prepare('UPDATE burgers SET ordre = ? WHERE id = ?').bind(i + 1, id)));
    return json({ ok: true });
  }

  // ---- Burgers : modification / suppression
  let m = route.match(/^burgers\/([a-z0-9-]+)$/);
  if (m && method === 'PUT') {
    const cur = await env.DB.prepare('SELECT * FROM burgers WHERE id = ?').bind(m[1]).first();
    if (!cur) return json({ ok: false, error: 'Burger inconnu.' }, 404);
    const photo = body.photo !== undefined ? photoPath(body.photo) : cur.photo;
    await env.DB.prepare('UPDATE burgers SET nom = ?, accroche = ?, description = ?, photo = ?, supplement = ?, actif = ?, rupture_jusqua = ? WHERE id = ?').bind(
      body.nom !== undefined ? (str(body.nom, 80) || cur.nom) : cur.nom,
      body.accroche !== undefined ? str(body.accroche, 160) : cur.accroche,
      body.description !== undefined ? str(body.description, 600) : cur.description,
      photo,
      body.supplement !== undefined ? num(body.supplement) : cur.supplement,
      body.actif !== undefined ? bool(body.actif) : cur.actif,
      body.rupture_jusqua !== undefined ? isoDate(body.rupture_jusqua) : cur.rupture_jusqua,
      m[1],
    ).run();
    // ancienne photo envoyée depuis l'admin devenue inutile : on la supprime du stockage
    if (env.PHOTOS && cur.photo && cur.photo !== photo && cur.photo.startsWith('/photos/')) await env.PHOTOS.delete(cur.photo.slice(8)).catch(() => {});
    return json({ ok: true });
  }
  if (m && method === 'DELETE') {
    const cur = await env.DB.prepare('SELECT photo FROM burgers WHERE id = ?').bind(m[1]).first();
    if (!cur) return json({ ok: false, error: 'Burger inconnu.' }, 404);
    await env.DB.prepare('DELETE FROM burgers WHERE id = ?').bind(m[1]).run();
    if (env.PHOTOS && cur.photo && cur.photo.startsWith('/photos/')) await env.PHOTOS.delete(cur.photo.slice(8)).catch(() => {});
    return json({ ok: true });
  }

  // ---- Emplacements
  m = route.match(/^emplacements\/([a-z0-9-]+)$/);
  if (m && method === 'PUT') {
    const cur = await env.DB.prepare('SELECT * FROM emplacements WHERE id = ?').bind(m[1]).first();
    if (!cur) return json({ ok: false, error: 'Emplacement inconnu.' }, 404);
    await env.DB.prepare('UPDATE emplacements SET ville = ?, lieu = ?, map_url = ?, heures = ?, actif = ? WHERE id = ?').bind(
      body.ville !== undefined ? str(body.ville, 120) : cur.ville,
      body.lieu !== undefined ? str(body.lieu, 200) : cur.lieu,
      body.map_url !== undefined ? str(body.map_url, 300) : cur.map_url,
      body.heures !== undefined ? str(body.heures, 60) : cur.heures,
      body.actif !== undefined ? bool(body.actif) : cur.actif,
      m[1],
    ).run();
    return json({ ok: true });
  }

  // ---- Exceptions (dates annulées ou déplacées)
  m = route.match(/^exceptions\/(\d{4}-\d{2}-\d{2})$/);
  if (m && method === 'PUT') {
    await env.DB.prepare(
      `INSERT INTO exceptions (date, annule, ville, lieu, map_url, heures, message) VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(date) DO UPDATE SET annule = excluded.annule, ville = excluded.ville, lieu = excluded.lieu, map_url = excluded.map_url, heures = excluded.heures, message = excluded.message`
    ).bind(m[1], body.annule === undefined ? 1 : bool(body.annule), body.ville || null, body.lieu || null, body.map_url || null, body.heures || null, body.message ? str(body.message, 200) : null).run();
    return json({ ok: true });
  }
  if (m && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM exceptions WHERE date = ?').bind(m[1]).run();
    return json({ ok: true });
  }

  // ---- Réglages (prix, bandeau)
  if (route === 'reglages' && method === 'PUT') {
    const allowed = ['prix_burger', 'prix_menu_frites', 'prix_menu_complet', 'prix_frites', 'sup_double', 'sup_garniture', 'frites_cheddar', 'frites_cheddar_bacon', 'frites_cheddar_oignons', 'frites_complet', 'frites_truffe', 'bandeau', 'devis_email_objet', 'devis_email_corps', 'devis_facture_objet', 'devis_facture_corps', 'devis_relance_objet', 'devis_relance_corps', 'devis_contact_email', 'devis_km_tarif', 'theme', 'theme_fx'];
    const textKeys = ['bandeau', 'devis_email_objet', 'devis_email_corps', 'devis_facture_objet', 'devis_facture_corps', 'devis_relance_objet', 'devis_relance_corps', 'devis_contact_email', 'theme', 'theme_fx'];
    if (body.theme !== undefined && !['', 'noel', 'halloween', 'fete-nationale', 'saint-valentin', 'paques'].includes(body.theme)) return json({ ok: false, error: 'Thème inconnu.' }, 400);
    if (body.theme_fx !== undefined) body.theme_fx = body.theme_fx && body.theme_fx !== '0' ? '1' : '0';
    const stmts = allowed.filter((k) => body[k] !== undefined).map((k) =>
      env.DB.prepare('INSERT INTO reglages (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur')
        .bind(k, textKeys.includes(k) ? str(body[k], /_corps$/.test(k) ? 4000 : 300) : String(num(body[k])))
    );
    if (stmts.length) await env.DB.batch(stmts);
    return json({ ok: true });
  }

  // ---- Demandes de devis
  if (route === 'demandes' && method === 'GET') {
    const r = await env.DB.prepare('SELECT * FROM demandes ORDER BY id DESC LIMIT 200').all();
    return json({ ok: true, demandes: r.results });
  }
  m = route.match(/^demandes\/(\d+)$/);
  if (m && method === 'PUT') {
    const statut = ['nouveau', 'repondu', 'signe', 'perdu'].includes(body.statut) ? body.statut : 'nouveau';
    await env.DB.prepare('UPDATE demandes SET statut = ? WHERE id = ?').bind(statut, Number(m[1])).run();
    return json({ ok: true });
  }
  if (m && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM demandes WHERE id = ?').bind(Number(m[1])).run();
    return json({ ok: true });
  }

  // ---- Devis
  const parseDevis = (row) => { if (!row) return row; const { pdf, ...rest } = row; return { ...rest, intro: JSON.parse(row.intro || '[]'), lignes: JSON.parse(row.lignes || '[]'), pdf_url: row.pdf_token ? `/devis/${row.numero}-${row.pdf_token}.pdf` : null }; };
  if (route === 'devis' && method === 'GET') {
    const r = await env.DB.prepare('SELECT id, numero, demande_id, cree_le, date_devis, client_nom, client_email, client_tel, event_date, event_moment, lieu, intro, lignes, mode, total_ht, tva, total_ttc, arrhes, statut, email_objet, email_corps, envoye_le, type, facture_de, acompte, payee_le, relance_le, relances, pdf_token, pdf_maj FROM devis ORDER BY id DESC LIMIT 300').all();
    return json({ ok: true, devis: r.results.map(parseDevis) });
  }
  if (route === 'devis' && method === 'POST') {
    const dem = body.demande_id ? await env.DB.prepare('SELECT * FROM demandes WHERE id = ?').bind(Number(body.demande_id)).first() : null;
    const rg = Object.fromEntries((await env.DB.prepare("SELECT cle, valeur FROM reglages WHERE cle LIKE 'devis_%'").all()).results.map((x) => [x.cle, x.valeur]));
    const numero = await nextNumero(env);
    const moment = dem?.moment || '';
    const mom = MOMENTS[moment] || { mail: '', devis: '' };
    const dateTxt = dateFr(dem?.date_event);
    const intro = [
      dateTxt ? `Le ${dateTxt}${mom.devis ? ' ' + mom.devis : ''}` : '',
      'Horaires de service à définir',
      'Formule Burger + Frites maison',
      '',
      [dem?.adresse, [dem?.code_postal, dem?.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ') || dem?.lieu || '',
    ];
    const lignes = [
      { desc: 'Formule Burger + Frites maison', qte: Number(dem?.convives) || 0, unite: 'Menu', prix: 0 },
      { desc: 'Frais de déplacements', qte: 0, unite: 'Km', prix: Number(rg.devis_km_tarif || 1) },
    ];
    const vars = { date: dateTxt, moment: mom.mail, nom: dem?.nom || '', convives: dem?.convives || '', lieu: dem?.ville || '', numero };
    const email_objet = fillTemplate(rg.devis_email_objet || "Votre devis L'Arrêt Gourmand", vars);
    const email_corps = fillTemplate(rg.devis_email_corps || '', vars);
    const t = computeTotals(lignes, 'ttc');
    const ins = await env.DB.prepare(`INSERT INTO devis (numero, demande_id, date_devis, client_nom, client_email, client_tel, event_date, event_moment, lieu, intro, lignes, mode, total_ht, tva, total_ttc, arrhes, email_objet, email_corps)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(numero, dem?.id || null, todayParis(), dem?.nom || '', dem?.email || '', dem?.tel || '', dem?.date_event || '', moment, intro[4], JSON.stringify(intro), JSON.stringify(lignes), 'ttc', t.total_ht, t.tva, t.total_ttc, t.arrhes, email_objet, email_corps).run();
    const row = await env.DB.prepare('SELECT * FROM devis WHERE id = ?').bind(ins.meta.last_row_id).first();
    return json({ ok: true, devis: parseDevis(row) });
  }
  m = route.match(/^devis\/(\d+)$/);
  if (m && method === 'PUT') {
    const cur = await env.DB.prepare('SELECT * FROM devis WHERE id = ?').bind(Number(m[1])).first();
    if (!cur) return json({ ok: false, error: 'Devis inconnu.' }, 404);
    const lignes = Array.isArray(body.lignes) ? body.lignes.slice(0, 20).map((l) => ({ desc: str(l.desc, 160), qte: num(l.qte), unite: str(l.unite, 20), prix: num(l.prix) })) : JSON.parse(cur.lignes || '[]');
    const mode = body.mode === 'ht' ? 'ht' : (body.mode === 'ttc' ? 'ttc' : cur.mode);
    const t = computeTotals(lignes, mode);
    const intro = Array.isArray(body.intro) ? body.intro.slice(0, 6).map((x) => str(x, 160)) : JSON.parse(cur.intro || '[]');
    // date et moment de l'événement déduits de « Le 12/06/2027 soir » quand les champs dédiés sont vides (devis saisis à la main)
    let eventDate = body.event_date !== undefined ? str(body.event_date, 20) : cur.event_date, eventMoment = body.event_moment !== undefined ? str(body.event_moment, 60) : cur.event_moment;
    const mi = /^Le (\d{2})\/(\d{2})\/(\d{4})\s*(.*)$/.exec(intro[0] || '');
    if (mi) {
      if (!isoDate(eventDate)) eventDate = `${mi[3]}-${mi[2]}-${mi[1]}`;
      const mm = { midi: 'Déjeuner / Brunch', soir: 'Dîner', 'deuxième partie de soirée (21h+)': 'Deuxième partie de soirée (21h+)' }[mi[4].trim().toLowerCase()];
      if (!eventMoment && mm) eventMoment = mm;
    }
    const isFacture = cur.type === 'facture';
    const statut = (isFacture ? ['emise', 'payee'] : ['brouillon', 'envoye', 'accepte', 'solde', 'refuse']).includes(body.statut) ? body.statut : cur.statut;
    const acompte = isFacture ? Math.max(0, Math.min(t.total_ttc, body.acompte !== undefined ? num(body.acompte) : num(cur.acompte))) : 0;
    await env.DB.prepare(`UPDATE devis SET date_devis = ?, client_nom = ?, client_email = ?, client_tel = ?, event_date = ?, event_moment = ?, lieu = ?, intro = ?, lignes = ?, mode = ?, total_ht = ?, tva = ?, total_ttc = ?, arrhes = ?, statut = ?, email_objet = ?, email_corps = ? WHERE id = ?`).bind(
      isoDate(body.date_devis) || cur.date_devis,
      body.client_nom !== undefined ? str(body.client_nom, 120) : cur.client_nom,
      body.client_email !== undefined ? str(body.client_email, 160) : cur.client_email,
      body.client_tel !== undefined ? str(body.client_tel, 40) : cur.client_tel,
      eventDate,
      eventMoment,
      body.lieu !== undefined ? str(body.lieu, 200) : (intro[4] ?? cur.lieu),
      JSON.stringify(intro), JSON.stringify(lignes), mode, t.total_ht, t.tva, t.total_ttc, t.arrhes, statut,
      body.email_objet !== undefined ? str(body.email_objet, 200) : cur.email_objet,
      body.email_corps !== undefined ? str(body.email_corps, 4000) : cur.email_corps,
      Number(m[1]),
    ).run();
    if ((statut === 'accepte' || statut === 'solde') && cur.demande_id) await env.DB.prepare("UPDATE demandes SET statut = 'signe' WHERE id = ?").bind(cur.demande_id).run();
    if (isFacture) await env.DB.prepare("UPDATE devis SET acompte = ?, payee_le = CASE WHEN ? = 'payee' THEN COALESCE(payee_le, datetime('now')) ELSE NULL END WHERE id = ?").bind(acompte, statut, Number(m[1])).run();
    const row = await env.DB.prepare('SELECT * FROM devis WHERE id = ?').bind(Number(m[1])).first();
    return json({ ok: true, devis: parseDevis(row), totals: t });
  }
  if (m && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM devis WHERE id = ?').bind(Number(m[1])).run();
    return json({ ok: true });
  }
  // archive du PDF (généré dans l'admin) : rend le devis téléchargeable par lien, utilisé dans l'agenda
  const archivePdf = async (cur, b64) => {
    if (!b64 || b64.length > 8_000_000) throw new Error('PDF manquant ou trop lourd.');
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const token = cur.pdf_token || Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
    await env.DB.prepare("UPDATE devis SET pdf = ?, pdf_token = ?, pdf_maj = datetime('now') WHERE id = ?").bind(bin, token, cur.id).run();
    return `/devis/${cur.numero}-${token}.pdf`;
  };
  m = route.match(/^devis\/(\d+)\/pdf$/);
  if (m && method === 'POST') {
    const cur = await env.DB.prepare('SELECT id, numero, pdf_token FROM devis WHERE id = ?').bind(Number(m[1])).first();
    if (!cur) return json({ ok: false, error: 'Devis inconnu.' }, 404);
    try { return json({ ok: true, pdf_url: await archivePdf(cur, body.pdf_base64) }); }
    catch (e) { return json({ ok: false, error: e.message }, 400); }
  }
  m = route.match(/^devis\/(\d+)\/envoyer$/);
  if (m && method === 'POST') {
    const cur = await env.DB.prepare('SELECT id, numero, demande_id, client_email, email_objet, email_corps, pdf_token, type FROM devis WHERE id = ?').bind(Number(m[1])).first();
    if (!cur) return json({ ok: false, error: 'Devis inconnu.' }, 404);
    if (!body.pdf_base64) return json({ ok: false, error: 'PDF manquant.' }, 400);
    const r = await sendDevisEmail(env, cur, body.pdf_base64);
    if (!r.ok) return json(r, 400);
    let pdf_url = null;
    try { pdf_url = await archivePdf(cur, body.pdf_base64); } catch { /* l'envoi a réussi, l'archive est un bonus */ }
    await env.DB.prepare("UPDATE devis SET statut = CASE WHEN statut = 'brouillon' THEN 'envoye' ELSE statut END, envoye_le = datetime('now') WHERE id = ?").bind(Number(m[1])).run();
    if (cur.demande_id) await env.DB.prepare("UPDATE demandes SET statut = CASE WHEN statut = 'nouveau' THEN 'repondu' ELSE statut END WHERE id = ?").bind(cur.demande_id).run();
    return json({ ok: true, pdf_url });
  }
  // ---- Facture d'un devis validé : même document, type 'facture', numéro F + date + compteur du jour
  m = route.match(/^devis\/(\d+)\/facturer$/);
  if (m && method === 'POST') {
    const cur = await env.DB.prepare('SELECT * FROM devis WHERE id = ?').bind(Number(m[1])).first();
    if (!cur) return json({ ok: false, error: 'Devis inconnu.' }, 404);
    if (cur.type === 'facture') return json({ ok: false, error: 'Ceci est déjà une facture.' }, 400);
    if (!['accepte', 'solde'].includes(cur.statut)) return json({ ok: false, error: 'Seul un devis validé (accepté ou acompte reçu) peut être facturé.' }, 400);
    const existing = await env.DB.prepare("SELECT * FROM devis WHERE type = 'facture' AND facture_de = ?").bind(cur.id).first();
    if (existing) return json({ ok: true, devis: parseDevis(existing), existante: true });
    const rg = Object.fromEntries((await env.DB.prepare("SELECT cle, valeur FROM reglages WHERE cle LIKE 'devis_%'").all()).results.map((x) => [x.cle, x.valeur]));
    const numero = await nextNumero(env, 'F');
    const lignes = JSON.parse(cur.lignes || '[]');
    const t = computeTotals(lignes, cur.mode || 'ttc');
    const acompte = cur.statut === 'solde' ? t.arrhes : 0; // acompte reçu si la privatisation a été validée
    const mom = MOMENTS[cur.event_moment] || { mail: '', devis: '' };
    const vars = { date: dateFr(cur.event_date), moment: mom.mail, nom: cur.client_nom || '', convives: (lignes[0] && lignes[0].qte) || '', lieu: cur.lieu || '', numero, numero_devis: cur.numero, total: eur(t.total_ttc), acompte: eur(acompte), reste: eur(t.total_ttc - acompte) };
    const email_objet = fillTemplate(rg.devis_facture_objet || "Votre facture L'Arrêt Gourmand", vars);
    const email_corps = fillTemplate(rg.devis_facture_corps || '', vars);
    const ins = await env.DB.prepare(`INSERT INTO devis (numero, demande_id, date_devis, client_nom, client_email, client_tel, event_date, event_moment, lieu, intro, lignes, mode, total_ht, tva, total_ttc, arrhes, statut, email_objet, email_corps, type, facture_de, acompte)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'emise',?,?,'facture',?,?)`).bind(numero, cur.demande_id, todayParis(), cur.client_nom, cur.client_email, cur.client_tel, cur.event_date, cur.event_moment, cur.lieu, cur.intro, cur.lignes, cur.mode, t.total_ht, t.tva, t.total_ttc, t.arrhes, email_objet, email_corps, cur.id, acompte).run();
    const row = await env.DB.prepare('SELECT * FROM devis WHERE id = ?').bind(ins.meta.last_row_id).first();
    return json({ ok: true, devis: parseDevis(row) });
  }
  // ---- Relance d'un devis sans réponse : e-mail (texte fourni) avec le PDF archivé ou celui transmis
  m = route.match(/^devis\/(\d+)\/relancer$/);
  if (m && method === 'POST') {
    const cur = await env.DB.prepare('SELECT id, numero, client_email, pdf, type FROM devis WHERE id = ?').bind(Number(m[1])).first();
    if (!cur) return json({ ok: false, error: 'Devis inconnu.' }, 404);
    if (body.sans_envoi) { // relance faite par téléphone ou depuis la messagerie : on la note seulement
      await env.DB.prepare("UPDATE devis SET relances = relances + 1, relance_le = datetime('now') WHERE id = ?").bind(cur.id).run();
      return json({ ok: true, notee: true });
    }
    const objet = str(body.email_objet, 200), corps = str(body.email_corps, 4000);
    if (!objet || !corps) return json({ ok: false, error: 'Objet et message obligatoires.' }, 400);
    let b64 = body.pdf_base64 && body.pdf_base64.length < 8_000_000 ? body.pdf_base64 : null;
    if (!b64 && cur.pdf) { const bytes = Array.isArray(cur.pdf) ? new Uint8Array(cur.pdf) : new Uint8Array(cur.pdf); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); b64 = btoa(bin); }
    const r = await sendDevisEmail(env, { ...cur, email_objet: objet, email_corps: corps }, b64);
    if (!r.ok) return json(r, 400);
    await env.DB.prepare("UPDATE devis SET relances = relances + 1, relance_le = datetime('now') WHERE id = ?").bind(cur.id).run();
    return json({ ok: true });
  }
  // ---- Événements publics sans devis (marchés, festivals, fêtes de village…)
  if (route === 'evenements' && method === 'GET') {
    const r = await env.DB.prepare('SELECT * FROM evenements WHERE date >= ? ORDER BY date, id').bind(addDays(todayParis(), -60)).all();
    return json({ ok: true, evenements: r.results.map((e) => ({ ...e, rappel: !!e.rappel })) });
  }
  const evBody = (cur) => ({
    titre: body.titre !== undefined ? str(body.titre, 120) : cur.titre,
    date: isoDate(body.date) || cur.date,
    heures: body.heures !== undefined ? str(body.heures, 60) : cur.heures,
    lieu: body.lieu !== undefined ? str(body.lieu, 200) : cur.lieu,
    ville: body.ville !== undefined ? str(body.ville, 80) : cur.ville,
    contact: body.contact !== undefined ? str(body.contact, 160) : cur.contact,
    notes: body.notes !== undefined ? str(body.notes, 2000) : cur.notes,
    rappel: body.rappel !== undefined ? bool(body.rappel) : cur.rappel,
    statut: ['prevu', 'annule'].includes(body.statut) ? body.statut : cur.statut,
  });
  if (route === 'evenements' && method === 'POST') {
    const e = evBody({ titre: '', date: null, heures: '', lieu: '', ville: '', contact: '', notes: '', rappel: 1, statut: 'prevu' });
    if (!e.titre || !e.date) return json({ ok: false, error: 'Titre et date obligatoires.' }, 400);
    const ins = await env.DB.prepare('INSERT INTO evenements (titre, date, heures, lieu, ville, contact, notes, rappel, statut) VALUES (?,?,?,?,?,?,?,?,?) RETURNING *')
      .bind(e.titre, e.date, e.heures, e.lieu, e.ville, e.contact, e.notes, e.rappel, e.statut).first();
    return json({ ok: true, evenement: { ...ins, rappel: !!ins.rappel } });
  }
  m = route.match(/^evenements\/(\d+)$/);
  if (m && method === 'PUT') {
    const cur = await env.DB.prepare('SELECT * FROM evenements WHERE id = ?').bind(Number(m[1])).first();
    if (!cur) return json({ ok: false, error: 'Événement inconnu.' }, 404);
    const e = evBody(cur);
    if (!e.titre || !e.date) return json({ ok: false, error: 'Titre et date obligatoires.' }, 400);
    await env.DB.prepare('UPDATE evenements SET titre = ?, date = ?, heures = ?, lieu = ?, ville = ?, contact = ?, notes = ?, rappel = ?, statut = ? WHERE id = ?')
      .bind(e.titre, e.date, e.heures, e.lieu, e.ville, e.contact, e.notes, e.rappel, e.statut, cur.id).run();
    return json({ ok: true });
  }
  if (m && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM evenements WHERE id = ?').bind(Number(m[1])).run();
    return json({ ok: true });
  }
  // ---- Rappels Telegram : test forcé depuis l'admin (la tâche quotidienne passe par /api/rappels/tick)
  if (route === 'rappels' && method === 'POST') {
    const r = await runRappels(env, { force: !!body.force, origin: new URL(request.url).origin });
    return json(r, r.ok ? 200 : 400);
  }
  // bot dédié aux rappels : retrouver la conversation après un /start
  if (route === 'rappels/detecter' && method === 'POST') {
    const token = str(body.token, 120) || (await env.DB.prepare("SELECT valeur FROM reglages WHERE cle = 'rappels_bot_token'").first())?.valeur || '';
    if (!token) return json({ ok: false, error: 'Collez d\'abord le jeton du bot.' }, 400);
    const r = await detectChat(token);
    if (!r.ok) return json(r, 400);
    await env.DB.batch([
      env.DB.prepare('INSERT INTO reglages (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur').bind('rappels_bot_token', token),
      env.DB.prepare('INSERT INTO reglages (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur').bind('rappels_chat_id', r.chat_id),
    ]);
    return json({ ok: true, chat_id: r.chat_id, nom: r.nom });
  }
  if (route === 'rappels/bot' && method === 'DELETE') {
    await env.DB.prepare("DELETE FROM reglages WHERE cle IN ('rappels_bot_token', 'rappels_chat_id')").run();
    return json({ ok: true });
  }
  if (route === 'distance' && method === 'GET') {
    const q = str(new URL(request.url).searchParams.get('q'), 200);
    if (!q) return json({ ok: false, error: 'Adresse manquante.' }, 400);
    const d = await distanceKm(q);
    if (!d) return json({ ok: false, error: 'Adresse introuvable.' });
    return json({ ok: true, km: d.km, lieu: d.lieu });
  }

  // ---- Alertes sur téléphone
  const LOT = 40; // abonnés traités par appel (limite d'appels sortants par requête chez Cloudflare)
  function cibleSql(sujet, villes) {
    // abonné actif, qui a coché ce sujet, et (toutes les villes, ou l'une des villes visées)
    const parts = ['actif = 1', "instr(sujets, ?) > 0"], binds = [`"${sujet}"`];
    if (villes.length) {
      parts.push(`(villes = '[]' OR ${villes.map(() => 'instr(villes, ?) > 0').join(' OR ')})`);
      villes.forEach((v) => binds.push(`"${v}"`));
    }
    return { where: parts.join(' AND '), binds };
  }
  if (route === 'alertes' && method === 'GET') {
    const [tot, rows, hist, suivi] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) AS n FROM abonnes WHERE actif = 1').first(),
      env.DB.prepare('SELECT villes, sujets, appareil FROM abonnes WHERE actif = 1').all(),
      env.DB.prepare('SELECT * FROM alertes ORDER BY id DESC LIMIT 300').all(),
      env.DB.prepare('SELECT alerte_id, appareil, SUM(envoye) AS envoyes, SUM(recu) AS recus, SUM(ouvert) AS ouverts FROM alertes_suivi WHERE alerte_id IN (SELECT id FROM alertes ORDER BY id DESC LIMIT 300) GROUP BY alerte_id, appareil').all(),
    ]);
    const parAlerte = {};
    for (const r of suivi.results) { (parAlerte[r.alerte_id] ||= {})[r.appareil] = { envoyes: r.envoyes, recus: r.recus, ouverts: r.ouverts }; }
    const parVille = {}, parSujet = {}, parAppareil = { iphone: 0, android: 0, autre: 0 };
    let toutesVilles = 0;
    for (const r of rows.results) {
      const v = JSON.parse(r.villes || '[]'), sj = JSON.parse(r.sujets || '[]');
      if (!v.length) toutesVilles++; else v.forEach((x) => { parVille[x] = (parVille[x] || 0) + 1; });
      sj.forEach((x) => { parSujet[x] = (parSujet[x] || 0) + 1; });
      const ua = r.appareil || '';
      parAppareil[/iphone|ipad/i.test(ua) ? 'iphone' : /android/i.test(ua) ? 'android' : 'autre']++;
    }
    return json({ ok: true, actifs: tot.n, toutes_villes: toutesVilles, par_ville: parVille, par_sujet: parSujet, par_appareil: parAppareil, sujets: SUJETS,
      historique: hist.results.map((a) => ({ ...a, villes: JSON.parse(a.villes || '[]'), appareils: parAlerte[a.id] || {} })) });
  }
  if (route === 'alertes' && method === 'POST') {
    const sujet = str(body.sujet, 20);
    if (!SUJETS[sujet]) return json({ ok: false, error: 'Sujet inconnu.' }, 400);
    const titre = str(body.titre, 80), corps = str(body.corps, 240);
    if (!titre || !corps) return json({ ok: false, error: 'Titre et message obligatoires.' }, 400);
    const url = '/'; // un appui sur la notification ouvre simplement le site
    const image = photoPath(body.image); // photo affichée sous le texte (Android ; ignorée par l'iPhone)
    const villes = Array.isArray(body.villes) ? body.villes.map((v) => str(v, 60)).filter(Boolean).slice(0, 12) : [];
    const { where, binds } = cibleSql(sujet, villes);
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM abonnes WHERE ${where}`).bind(...binds).first();
    const ins = await env.DB.prepare('INSERT INTO alertes (sujet, titre, corps, url, villes, cibles, source, image, termine) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id')
      .bind(sujet, titre, corps, url, JSON.stringify(villes), n.n, str(body.source, 20) || 'manuel', image || null, n.n ? 0 : 1).first();
    return json({ ok: true, id: ins.id, cibles: n.n });
  }
  const mLot = /^alertes\/(\d+)\/lot$/.exec(route);
  if (mLot && method === 'POST') {
    const a = await env.DB.prepare('SELECT * FROM alertes WHERE id = ?').bind(Number(mLot[1])).first();
    if (!a) return json({ ok: false, error: 'Alerte introuvable.' }, 404);
    if (a.termine) return json({ ok: true, envoyes: a.envoyes, echecs: a.echecs, restant: 0, termine: true });
    const villes = JSON.parse(a.villes || '[]');
    const { where, binds } = cibleSql(a.sujet, villes);
    const lot = await env.DB.prepare(`SELECT id, endpoint, p256dh, auth, echecs, appareil FROM abonnes WHERE ${where} AND id > ? ORDER BY id LIMIT ${LOT}`).bind(...binds, a.curseur).all();
    const vapid = await getVapid(env);
    const payload = { id: a.id, title: a.titre, body: a.corps, url: a.url + (a.url.includes('?') ? '&' : '?') + 'source=push&al=' + a.id, tag: `${a.sujet}-${a.id}`, image: a.image || undefined };
    const results = await Promise.all(lot.results.map((s) => sendPush(s, payload, vapid, { ttl: a.sujet === 'service' || a.sujet === 'annulation' ? 4 * 3600 : 24 * 3600, urgency: a.sujet === 'annulation' ? 'high' : 'normal', topic: a.sujet })));
    const cles = await Promise.all(lot.results.map((s) => cleAbonne(s.endpoint)));
    let ok = 0, ko = 0;
    const updates = [];
    results.forEach((r, i) => {
      const s = lot.results[i];
      if (r.ok) { ok++; updates.push(env.DB.prepare("UPDATE abonnes SET dernier_envoi = datetime('now'), echecs = 0 WHERE id = ?").bind(s.id)); updates.push(env.DB.prepare('INSERT INTO alertes_suivi (alerte_id, cle, appareil, envoye) VALUES (?, ?, ?, 1) ON CONFLICT(alerte_id, cle) DO UPDATE SET envoye = 1').bind(a.id, cles[i], typeAppareil(s.appareil))); }
      else { ko++; const dead = r.gone || s.echecs + 1 >= 5; updates.push(env.DB.prepare("UPDATE abonnes SET echecs = echecs + 1, actif = CASE WHEN ? THEN 0 ELSE actif END, maj = datetime('now') WHERE id = ?").bind(dead ? 1 : 0, s.id)); }
    });
    const last = lot.results.length ? lot.results[lot.results.length - 1].id : a.curseur;
    const termine = lot.results.length < LOT ? 1 : 0;
    updates.push(env.DB.prepare('UPDATE alertes SET envoyes = envoyes + ?, echecs = echecs + ?, curseur = ?, termine = ? WHERE id = ?').bind(ok, ko, last, termine, a.id));
    await env.DB.batch(updates);
    const restant = termine ? 0 : (await env.DB.prepare(`SELECT COUNT(*) AS n FROM abonnes WHERE ${where} AND id > ?`).bind(...binds, last).first()).n;
    return json({ ok: true, envoyes: a.envoyes + ok, echecs: a.echecs + ko, restant, termine: !!termine });
  }

  return json({ ok: false, error: 'Route inconnue.' }, 404);
}
