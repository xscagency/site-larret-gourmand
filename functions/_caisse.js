// Services de la caisse : réception des chiffres envoyés par l'application de caisse (ou saisis dans l'admin).
// Un service = une date + un moment (soir par défaut). Renvoyer deux fois le même service remplace les chiffres.

import { loadState } from './_lib.js';

export const BURGERS_CAISSE = ["L'Original", 'Le BBQ', 'Le Dragon', 'Le Montagnard', 'Le Myko', "L'Américain", 'Le Poulet', 'Le Cheese', 'Le Steak Haché', 'Le Bleu', 'Le Winter', 'Le Summer', 'Le Roq', 'Le Normand', 'Le Noël'];
const TVA = 0.10;
const num = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? 0 : Number(v));
const r2 = (v) => Math.round(v * 100) / 100;

// Clé que la caisse doit présenter (créée au premier besoin, visible dans Réglages)
export async function cleCaisse(env) {
  if (env.CAISSE_KEY) return env.CAISSE_KEY;
  const row = await env.DB.prepare("SELECT valeur FROM reglages WHERE cle = 'caisse_cle'").first();
  if (row && row.valeur) return row.valeur;
  const cle = 'lag_' + Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, '0')).join('');
  await env.DB.prepare("INSERT OR IGNORE INTO reglages (cle, valeur) VALUES ('caisse_cle', ?)").bind(cle).run();
  return cleCaisse(env);
}

// Met en forme ce que la caisse (ou l'admin) envoie : objet nommé, ou tableau dans l'ordre de l'ancien classeur
export function normaliserService(body) {
  let b = body || {};
  if (Array.isArray(b.values) || Array.isArray(b)) {
    const v = Array.isArray(b) ? b : b.values; // [Date, Total, 15 burgers…, Total Frites, CA TTC, CA HT, TVA, Doubles, Ratés]
    const burgers = {};
    BURGERS_CAISSE.forEach((nom, i) => { const q = num(v[2 + i]); if (q) burgers[nom] = q; });
    b = { date: v[0], burgers, frites: v[17], ca_ttc: v[18], ca_ht: v[19], tva: v[20], doubles: v[21], rates: v[22] };
  }
  let date = String(b.date || '').trim();
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(date);
  if (m) date = `${m[3]}-${m[2]}-${m[1]}`;
  date = date.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Date du service manquante ou invalide (attendu AAAA-MM-JJ).');
  const burgers = {};
  const src = b.burgers && typeof b.burgers === 'object' ? b.burgers : {};
  for (const [k, q] of Object.entries(src)) { const n = Math.round(num(q)); const nom = String(k).trim().slice(0, 40); if (nom && n > 0) burgers[nom] = n; }
  const total = b.total_burgers !== undefined && b.total_burgers !== '' ? Math.round(num(b.total_burgers)) : Object.values(burgers).reduce((t, x) => t + x, 0);
  const ca_ttc = r2(num(b.ca_ttc));
  const ca_ht = b.ca_ht !== undefined && b.ca_ht !== '' ? r2(num(b.ca_ht)) : r2(ca_ttc / (1 + TVA));
  const tva = b.tva !== undefined && b.tva !== '' ? r2(num(b.tva)) : r2(ca_ttc - ca_ht);
  const moment = ['midi', 'soir', 'journee'].includes(b.moment) ? b.moment : 'soir';
  const extra = b.extra && typeof b.extra === 'object' ? b.extra : {};
  return {
    date, moment,
    emplacement: String(b.emplacement || '').trim().slice(0, 80) || null,
    burgers, total_burgers: total,
    frites: Math.round(num(b.frites)),
    ca_ttc, ca_ht, tva,
    doubles: Math.round(num(b.doubles)), rates: Math.round(num(b.rates)),
    extra, notes: String(b.notes || '').trim().slice(0, 1000) || null,
  };
}

export async function enregistrerService(env, s, source = 'caisse') {
  await loadState(env); // schéma à jour
  const res = await env.DB.prepare(`INSERT INTO services (date, moment, emplacement, burgers, total_burgers, frites, ca_ttc, ca_ht, tva, doubles, rates, extra, notes, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(date, moment) DO UPDATE SET emplacement = COALESCE(excluded.emplacement, services.emplacement), burgers = excluded.burgers, total_burgers = excluded.total_burgers, frites = excluded.frites,
      ca_ttc = excluded.ca_ttc, ca_ht = excluded.ca_ht, tva = excluded.tva, doubles = excluded.doubles, rates = excluded.rates, extra = excluded.extra,
      notes = COALESCE(excluded.notes, services.notes), source = excluded.source, maj = datetime('now')
    RETURNING id`)
    .bind(s.date, s.moment, s.emplacement, JSON.stringify(s.burgers), s.total_burgers, s.frites, s.ca_ttc, s.ca_ht, s.tva, s.doubles, s.rates, JSON.stringify(s.extra), s.notes, source).first();
  return res.id;
}

export function ligneService(row) {
  let burgers = {}, extra = {};
  try { burgers = JSON.parse(row.burgers || '{}'); } catch (e) { /* ignore */ }
  try { extra = JSON.parse(row.extra || '{}'); } catch (e) { /* ignore */ }
  return { ...row, burgers, extra };
}

// Tickets d'un service (envoyés par la caisse avec la synthèse) : remplacés à chaque envoi pour cette date
export async function enregistrerCommandes(env, date, commandes) {
  if (!Array.isArray(commandes)) return 0;
  const rows = commandes.slice(0, 500).map((c) => ({
    numero: Math.round(num(c.numero)), heure: String(c.heure || '').slice(0, 8), creneau: String(c.creneau || '').slice(0, 20),
    statut: c.statut === 'annulee' ? 'annulee' : 'reglee', articles: String(c.articles || '').slice(0, 2000), total_ttc: r2(num(c.total_ttc)), fidelite: c.fidelite ? 1 : 0,
  })).filter((c) => c.numero > 0);
  const stmts = [env.DB.prepare('DELETE FROM commandes WHERE date = ?').bind(date)];
  for (const c of rows) stmts.push(env.DB.prepare('INSERT OR REPLACE INTO commandes (date, numero, heure, creneau, statut, articles, total_ttc, fidelite) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(date, c.numero, c.heure, c.creneau, c.statut, c.articles, c.total_ttc, c.fidelite));
  await env.DB.batch(stmts);
  return rows.length;
}
