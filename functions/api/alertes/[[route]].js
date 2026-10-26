// Alertes sur téléphone (Web Push), côté client. Aucun compte : l'abonnement est identifié par
// l'adresse technique que le téléphone fournit (endpoint), connue de lui seul.
//
//   GET  /api/alertes/cle            → { publicKey }  clé publique VAPID pour s'abonner
//   POST /api/alertes/abonner        { subscription, villes, sujets, appareil } → crée/met à jour, envoie une notif de bienvenue
//   POST /api/alertes/etat           { endpoint } → { abonne: { villes, sujets, actif } | null }
//   POST /api/alertes/preferences    { endpoint, villes?, sujets?, actif? }
//   POST /api/alertes/desabonner     { endpoint } → actif = 0 (plus aucun envoi)
//   POST /api/alertes/test           { endpoint } → renvoie une notification d'essai

import { json, loadState } from '../../_lib.js';
import { getVapid, sendPush, SUJETS } from '../../_push.js';

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const cleanVilles = (v) => (Array.isArray(v) ? v.map((x) => str(x, 60)).filter(Boolean).slice(0, 12) : []);
const cleanSujets = (v) => (Array.isArray(v) ? v.map((x) => str(x, 20)).filter((x) => SUJETS[x]) : []);
const validEndpoint = (e) => typeof e === 'string' && e.length < 1500 && /^https:\/\//.test(e);

function welcome(villes, sujets, state) {
  const all = [...new Set(state.emplacements.filter((e) => e.actif).map((e) => e.ville))];
  const v = villes.length ? villes : all;
  const ou = v.length === all.length ? 'toutes nos villes' : v.join(', ');
  return {
    title: 'Alertes activées 🔔',
    body: `C'est noté : on vous prévient pour ${ou}. Pour changer d'avis, un geste dans « Mes alertes ».`,
    url: '/?source=push',
    tag: 'bienvenue',
  };
}

export async function onRequest({ request, env, params }) {
  const route = (params.route || []).join('/');
  const method = request.method;

  if (route === 'cle' && method === 'GET') {
    await loadState(env); // garantit que la base est à jour (tables + migrations)
    const vapid = await getVapid(env);
    return json({ ok: true, publicKey: vapid.publicKey }, 200, { 'cache-control': 'public, max-age=3600' });
  }
  if (method !== 'POST') return json({ ok: false, error: 'Méthode non autorisée.' }, 405);
  const body = await request.json().catch(() => ({}));

  if (route === 'abonner') {
    const sub = body.subscription || {};
    const endpoint = sub.endpoint, p256dh = sub.keys?.p256dh, auth = sub.keys?.auth;
    if (!validEndpoint(endpoint) || !p256dh || !auth) return json({ ok: false, error: 'Abonnement incomplet.' }, 400);
    const villes = cleanVilles(body.villes);
    const sujets = cleanSujets(body.sujets);
    if (!sujets.length) return json({ ok: false, error: 'Choisissez au moins un type d\'alerte.' }, 400);
    const state = await loadState(env);
    await env.DB.prepare(`INSERT INTO abonnes (endpoint, p256dh, auth, villes, sujets, actif, appareil)
      VALUES (?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, villes = excluded.villes, sujets = excluded.sujets, actif = 1, echecs = 0, maj = datetime('now')`)
      .bind(endpoint, str(p256dh, 200), str(auth, 100), JSON.stringify(villes), JSON.stringify(sujets), str(body.appareil, 200)).run();
    const vapid = await getVapid(env);
    const sent = body.silencieux ? { ok: false } : await sendPush({ endpoint, p256dh, auth }, welcome(villes, sujets, state), vapid, { ttl: 600, topic: 'bienvenue' });
    return json({ ok: true, villes, sujets, actif: true, bienvenue: sent.ok });
  }

  const endpoint = body.endpoint;
  if (!validEndpoint(endpoint)) return json({ ok: false, error: 'Abonnement inconnu.' }, 400);
  const row = await env.DB.prepare('SELECT endpoint, p256dh, auth, villes, sujets, actif FROM abonnes WHERE endpoint = ?').bind(endpoint).first();

  if (route === 'etat') {
    return json({ ok: true, abonne: row ? { villes: JSON.parse(row.villes), sujets: JSON.parse(row.sujets), actif: !!row.actif } : null });
  }
  if (!row) return json({ ok: false, error: 'Abonnement inconnu.', inconnu: true }, 404);

  if (route === 'preferences') {
    const villes = body.villes !== undefined ? cleanVilles(body.villes) : JSON.parse(row.villes);
    const sujets = body.sujets !== undefined ? cleanSujets(body.sujets) : JSON.parse(row.sujets);
    const actif = body.actif !== undefined ? (body.actif ? 1 : 0) : row.actif;
    await env.DB.prepare("UPDATE abonnes SET villes = ?, sujets = ?, actif = ?, maj = datetime('now') WHERE endpoint = ?")
      .bind(JSON.stringify(villes), JSON.stringify(sujets), actif, endpoint).run();
    return json({ ok: true, villes, sujets, actif: !!actif });
  }
  if (route === 'desabonner') {
    await env.DB.prepare("UPDATE abonnes SET actif = 0, maj = datetime('now') WHERE endpoint = ?").bind(endpoint).run();
    return json({ ok: true, actif: false });
  }
  if (route === 'test') {
    const vapid = await getVapid(env);
    const r = await sendPush(row, { title: 'Ça marche ✅', body: 'Vos alertes L\'Arrêt Gourmand arrivent bien sur ce téléphone.', url: '/?source=push', tag: 'test' }, vapid, { ttl: 300, topic: 'test' });
    return json({ ok: r.ok, status: r.status, error: r.ok ? undefined : 'Le service de notifications n\'a pas accepté l\'envoi.' });
  }
  return json({ ok: false, error: 'Route inconnue.' }, 404);
}
