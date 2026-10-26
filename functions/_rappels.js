// Rappels Telegram des privatisations validées : 7 jours avant, la veille et le jour même, à partir de 9h (heure de Paris), une fois par jour.
import { todayParis, nowParis, addDays } from './_lib.js';
import { computeTotals, MOMENTS, dateFr, eur } from './_devis.js';
import { sendTelegram, telegramConfig } from './_telegram.js';

export async function runRappels(env, { force = false, origin = '' } = {}) {
  const today = todayParis(), { minutes } = nowParis();
  const rp = Object.fromEntries((await env.DB.prepare("SELECT cle, valeur FROM reglages WHERE cle LIKE 'rappels_%'").all()).results.map((x) => [x.cle, x.valeur]));
  if (!force) {
    if (minutes < 9 * 60) return { ok: true, ignore: 'avant 9h' };
    if (rp.rappels_jour === today) return { ok: true, ignore: 'déjà fait aujourd\'hui' };
  }
  if (!(await telegramConfig(env, 'rappels'))) return { ok: false, error: 'Aucun bot Telegram configuré pour les rappels.' };
  const horizons = [[0, "AUJOURD'HUI"], [1, 'DEMAIN'], [7, 'DANS 7 JOURS']];
  const dates = horizons.map(([n]) => addDays(today, n));
  const rows = await env.DB.prepare(`SELECT d.*, dm.message AS dem_message, dm.tel AS dem_tel FROM devis d LEFT JOIN demandes dm ON dm.id = d.demande_id
    WHERE d.type = 'devis' AND d.statut IN ('accepte', 'solde') AND d.event_date IN (?, ?, ?) ORDER BY d.event_date`).bind(...dates).all();
  const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  let envoyes = 0;
  for (const d of rows.results) {
    const [, label] = horizons[dates.indexOf(d.event_date)];
    const lignes = JSON.parse(d.lignes || '[]'), intro = JSON.parse(d.intro || '[]');
    const t = computeTotals(lignes, d.mode || 'ttc');
    const conv = lignes[0] && lignes[0].qte;
    const dt = new Date(d.event_date + 'T12:00:00Z');
    const mom = MOMENTS[d.event_moment] || {};
    const fact = await env.DB.prepare("SELECT numero, statut FROM devis WHERE type = 'facture' AND facture_de = ?").bind(d.id).first();
    const texte = [
      `📅 Privatisation ${label} · ${JOURS[dt.getUTCDay()]} ${dateFr(d.event_date)}${mom.mail ? ' ' + mom.mail : ''}`,
      `👤 ${d.client_nom || 'Sans nom'}${d.client_tel || d.dem_tel ? ' · 📞 ' + (d.client_tel || d.dem_tel) : ''}`,
      `${conv ? '👥 ' + conv + ' convives' : ''}${d.lieu ? (conv ? ' · ' : '') + '📍 ' + d.lieu : ''}`,
      [intro[1], intro[2], intro[3]].filter(Boolean).join(' · '),
      `🧾 Devis n°${d.numero} · ${eur(t.total_ttc)} · ${d.statut === 'solde' ? 'acompte reçu, reste ' + eur(t.reste) : 'accepté, arrhes attendues (' + eur(t.arrhes) + ')'}${fact ? ' · facture n°' + fact.numero + (fact.statut === 'payee' ? ' réglée' : ' émise') : ''}`,
      d.dem_message ? `📝 ${String(d.dem_message).slice(0, 300)}` : '',
      origin ? `${origin}/admin` : '',
    ].filter(Boolean).join('\n');
    const r = await sendTelegram(env, texte, 'rappels');
    if (r.ok) envoyes++;
  }
  if (force && !rows.results.length) await sendTelegram(env, `✅ Rappels L'Arrêt Gourmand : rien à rappeler aujourd'hui (${dateFr(today)}). Le système fonctionne.`, 'rappels');
  const up = (k, v) => env.DB.prepare('INSERT INTO reglages (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur').bind(k, v);
  await env.DB.batch([up('rappels_jour', force ? (rp.rappels_jour || '') : today), up('rappels_dernier', new Date().toISOString().slice(0, 19).replace('T', ' ')), up('rappels_envoyes', String(envoyes))]);
  return { ok: true, envoyes, trouves: rows.results.length };
}
