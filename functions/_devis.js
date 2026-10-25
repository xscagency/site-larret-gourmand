// Logique des devis : numérotation, totaux, e-mail type, distance, envoi.
import { todayParis } from './_lib.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Totaux à partir des lignes. mode 'ttc' : les prix saisis incluent la TVA 10 % (comme le modèle Excel).
// mode 'ht' : les prix sont hors taxes, la TVA 10 % s'ajoute.
export function computeTotals(lignes, mode = 'ttc') {
  const somme = r2(lignes.reduce((t, l) => t + (Number(l.qte) || 0) * (Number(l.prix) || 0), 0));
  let total_ht, tva, total_ttc;
  if (mode === 'ht') { total_ht = somme; tva = r2(somme * 0.10); total_ttc = r2(somme + tva); }
  else { total_ttc = somme; tva = r2(somme / 11); total_ht = r2(somme - tva); }
  const arrhes = r2(total_ttc * 0.30);
  return { total_ht, tva, total_ttc, arrhes, reste: r2(total_ttc - arrhes) };
}

// Numéro du type 202609221 : date du jour + compteur du jour (comme le modèle)
export async function nextNumero(env) {
  const base = todayParis().replace(/-/g, '');
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM devis WHERE numero LIKE ?').bind(base + '%').first();
  return base + String((row?.n || 0) + 1);
}

export const MOMENTS = {
  'Déjeuner / Brunch': { mail: 'à midi', devis: 'midi' },
  'Dîner': { mail: 'le soir', devis: 'soir' },
  'Deuxième partie de soirée (21h+)': { mail: 'en deuxième partie de soirée (21h+)', devis: 'deuxième partie de soirée (21h+)' },
};

export function dateFr(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return iso || '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// Remplit le modèle d'e-mail : {date} {moment} {nom} {convives} {lieu} {numero} {total}
export function fillTemplate(tpl, v) {
  return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (v[k] !== undefined && v[k] !== null ? String(v[k]) : '')).replace(/[ \t]+\n/g, '\n').replace(/  +/g, ' ');
}

// Distance routière (aller simple) depuis Verneuil-sur-Seine 78480 jusqu'à une adresse.
// Géocodage Nominatim (OpenStreetMap) puis itinéraire OSRM. Renvoie des km arrondis, ou null si indisponible.
const ORIGINE = { lat: 48.9765, lon: 1.9745 }; // Verneuil-sur-Seine
export async function distanceKm(adresse) {
  const ua = { 'User-Agent': 'larretgourmand.com admin (contact@larretgourmand.com)', 'Accept-Language': 'fr' };
  const geo = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=fr&q=${encodeURIComponent(adresse)}`, { headers: ua }).then((r) => r.json()).catch(() => null);
  if (!geo || !geo[0]) return null;
  const { lat, lon, display_name } = geo[0];
  const route = await fetch(`https://router.project-osrm.org/route/v1/driving/${ORIGINE.lon},${ORIGINE.lat};${lon},${lat}?overview=false`, { headers: ua }).then((r) => r.json()).catch(() => null);
  if (!route || !route.routes || !route.routes[0]) return { km: null, lieu: display_name };
  return { km: Math.round(route.routes[0].distance / 1000), lieu: display_name };
}

// Envoi du devis par e-mail (Resend) avec le PDF en pièce jointe (base64 fourni par l'admin)
export async function sendDevisEmail(env, devis, pdfBase64, fromName) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) return { ok: false, error: 'Envoi d\'e-mails non configuré (RESEND_API_KEY / MAIL_FROM).' };
  if (!devis.client_email) return { ok: false, error: 'Pas d\'adresse e-mail client.' };
  const html = `<div style="font-family:sans-serif;font-size:15px;line-height:1.55;color:#222">${String(devis.email_corps || '').split('\n').map((l) => l.trim() ? `<p style="margin:0 0 1em">${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>` : '').join('')}</div>`;
  const payload = {
    from: env.MAIL_FROM, to: [devis.client_email], reply_to: env.MAIL_TO ? env.MAIL_TO.split(',')[0].trim() : undefined,
    subject: devis.email_objet || `Votre devis L'Arrêt Gourmand`,
    text: devis.email_corps || '', html,
    attachments: [{ filename: `Devis-${devis.numero}-L-Arret-Gourmand.pdf`, content: pdfBase64 }],
  };
  if (env.MAIL_TO) payload.bcc = env.MAIL_TO.split(',').map((s) => s.trim()); // copie pour toi
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  if (!r.ok) return { ok: false, error: 'Resend : ' + (await r.text()).slice(0, 200) };
  return { ok: true };
}
