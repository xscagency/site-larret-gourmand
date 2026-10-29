// Entrée pour l'application de caisse : POST /api/caisse avec l'en-tête « Authorization: Bearer <clé> »
// (la clé est affichée dans l'admin, onglet Réglages → Caisse). Le corps est un service en JSON :
//   { "date": "2026-10-29", "burgers": { "L'Américain": 17, "Le BBQ": 14 }, "frites": 56, "ca_ttc": 787, "doubles": 2, "rates": 0 }
// ou, pour l'ancien format de la caisse, { "values": [date, total, …15 burgers…, frites, ca_ttc, ca_ht, tva, doubles, rates] }.
// Le même service renvoyé une seconde fois remplace les chiffres (corrections possibles depuis la caisse).

import { json } from '../_lib.js';
import { cleCaisse, normaliserService, enregistrerService, enregistrerCommandes } from '../_caisse.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (request.method !== 'POST') return json({ ok: false, error: 'Méthode non autorisée.' }, 405, cors());
  const auth = request.headers.get('authorization') || '';
  const cle = auth.replace(/^Bearer\s+/i, '').trim();
  if (!cle || cle !== await cleCaisse(env)) return json({ ok: false, error: 'Clé de caisse refusée.' }, 401, cors());
  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, error: 'Corps JSON attendu.' }, 400, cors());
  if (body.ping) return json({ ok: true, ping: true }, 200, cors()); // test de connexion depuis la caisse
  // un service, ou une liste de services (rattrapage)
  const liste = Array.isArray(body.services) ? body.services : [body];
  const ids = [];
  let tickets = 0;
  try {
    for (const b of liste.slice(0, 100)) {
      const s = normaliserService(b);
      ids.push(await enregistrerService(env, s, 'caisse'));
      if (Array.isArray(b.commandes)) tickets += await enregistrerCommandes(env, s.date, b.commandes);
    }
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 400, cors());
  }
  return json({ ok: true, enregistres: ids.length, ids, tickets }, 200, cors());
}

// la caisse peut tourner depuis un fichier local ou un autre domaine
function cors() {
  return { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'authorization, content-type', 'access-control-max-age': '86400' };
}
