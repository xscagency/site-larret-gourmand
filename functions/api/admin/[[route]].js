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

import { json, loadState, computeTonight, slugify } from '../../_lib.js';

function authorized(request, env) {
  const h = request.headers.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  return !!env.ADMIN_TOKEN && token === env.ADMIN_TOKEN;
}

const num = (v, def = 0) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? def : Number(v));
const bool = (v) => (v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0);
const isoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : null;
const str = (v, max) => String(v ?? '').trim().slice(0, max);
const photoPath = (v) => { const s = str(v, 300); return /^\/(img|photos)\/[A-Za-z0-9._-]+$/.test(s) ? s : ''; };

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
    return json({ ok: true, state: { ...state, tonight: computeTonight(state) } });
  }

  // ---- Photo : envoi vers R2
  if (route === 'photo' && method === 'POST') {
    if (!env.PHOTOS) return json({ ok: false, error: 'Stockage des photos non configuré (bucket R2 "PHOTOS").' }, 500);
    const type = request.headers.get('content-type') || '';
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[type];
    if (!ext) return json({ ok: false, error: 'Format accepté : JPEG, PNG ou WebP.' }, 400);
    const buf = await request.arrayBuffer();
    if (buf.byteLength > 6 * 1024 * 1024) return json({ ok: false, error: 'Photo trop lourde (6 Mo max).' }, 400);
    const base = slugify((request.headers.get('x-filename') || 'photo').replace(/\.[a-z0-9]+$/i, ''));
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
    const allowed = ['prix_burger', 'prix_menu_frites', 'prix_menu_complet', 'prix_frites', 'bandeau'];
    const stmts = allowed.filter((k) => body[k] !== undefined).map((k) =>
      env.DB.prepare('INSERT INTO reglages (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur')
        .bind(k, k.startsWith('prix_') ? String(num(body[k])) : str(body[k], 300))
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

  return json({ ok: false, error: 'Route inconnue.' }, 404);
}
