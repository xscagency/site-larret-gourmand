// Google Search Console : ce que les internautes cherchent sur Google pour arriver sur le site
// (requêtes, clics, impressions, position moyenne, pages). Lu via l'API Search Console avec un
// « compte de service » Google (une identité technique, en lecture seule sur la propriété).
// Variables à définir sur le projet Pages :
//   GSC_SERVICE_ACCOUNT  le fichier JSON du compte de service, collé tel quel (type Secret)
//   GSC_SITE             la propriété Search Console, ex. sc-domain:larretgourmand.com (ou https://www.larretgourmand.com/)
// Les chiffres de Google ont 2 à 3 jours de retard ; le résultat est gardé 6 h dans la table reglages.

const CACHE_H = 6;
const te = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const googleConfigure = (env) => !!(env.GSC_SERVICE_ACCOUNT && env.GSC_SITE);

function compteDeService(env) {
  let sa;
  try { sa = JSON.parse(env.GSC_SERVICE_ACCOUNT); } catch (e) { throw new Error('GSC_SERVICE_ACCOUNT n\'est pas un JSON valide : collez le contenu complet du fichier téléchargé chez Google.'); }
  if (!sa.client_email || !sa.private_key) throw new Error('Le JSON du compte de service ne contient pas client_email / private_key.');
  return sa;
}

// Jeton d'accès Google (1 h) obtenu en signant une assertion JWT avec la clé privée du compte de service
export async function jetonGoogle(sa, scope = 'https://www.googleapis.com/auth/webmasters.readonly') {
  const pem = sa.private_key.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(te.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = b64u(te.encode(JSON.stringify({ iss: sa.client_email, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })));
  const sig = b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, te.encode(`${head}.${claims}`)));
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${head}.${claims}.${sig}` });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(`Google refuse le compte de service (${j.error_description || j.error || res.status}).`);
  return j.access_token;
}

async function requete(env, token, body) {
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(env.GSC_SITE)}/searchAnalytics/query`;
  const res = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (j.error && j.error.message) || `réponse ${res.status}`;
    if (res.status === 403) throw new Error(`Google refuse l'accès à la propriété ${env.GSC_SITE} : ajoutez l'adresse du compte de service comme utilisateur dans Search Console (${msg}).`);
    if (res.status === 404) throw new Error(`Propriété ${env.GSC_SITE} introuvable : vérifiez GSC_SITE (${msg}).`);
    throw new Error(`Search Console : ${msg}`);
  }
  return j.rows || [];
}

// Mise en forme (fonction pure, testable sans réseau)
export function formatSearchConsole({ total, parJour, requetes, pages }, jours, de, a) {
  const n = (x) => Number(x || 0);
  const ligne = (r) => ({ nom: (r.keys && r.keys[0]) || '', clics: n(r.clicks), impressions: n(r.impressions), ctr: Math.round(n(r.ctr) * 1000) / 10, position: Math.round(n(r.position) * 10) / 10 });
  const t = total && total[0] ? ligne(total[0]) : { clics: 0, impressions: 0, ctr: 0, position: 0 };
  const byDay = {};
  for (const r of parJour || []) byDay[r.keys[0]] = ligne(r);
  const serie = [];
  const d0 = new Date(de + 'T00:00:00Z'), d1 = new Date(a + 'T00:00:00Z');
  for (let d = d0; d <= d1; d = new Date(d.getTime() + 86400000)) { const k = d.toISOString().slice(0, 10); serie.push({ nom: k, clics: byDay[k] ? byDay[k].clics : 0, impressions: byDay[k] ? byDay[k].impressions : 0 }); }
  // les pages du site actuel s'affichent par leur chemin ; une ancienne adresse (sans www, http, autre sous-domaine) garde son hôte pour qu'on la repère
  const chemin = (u) => { try { const x = new URL(u); const p = x.pathname === '/' ? 'Accueil' : x.pathname; return x.hostname === 'www.larretgourmand.com' && x.protocol === 'https:' ? p : `${x.hostname}${x.pathname === '/' ? '' : x.pathname} (ancienne adresse)`; } catch (e) { return u; } };
  return {
    periode: jours, de, a,
    total: { clics: t.clics, impressions: t.impressions, ctr: t.ctr, position: t.position },
    jours: serie,
    requetes: (requetes || []).map(ligne),
    pages: (pages || []).map((r) => ({ ...ligne(r), nom: chemin(r.keys[0]) })),
    maj: new Date().toISOString(),
  };
}

const pageOk = (p) => (/^\/[a-z0-9\-\/]{0,80}$/.test(p || '') ? p : '');

export async function getSearchConsole(env, { jours = 28, force = false, page = '' } = {}) {
  if (!googleConfigure(env)) return { configure: false };
  page = pageOk(page);
  const cle = `gsc_cache_${jours}${page ? '_' + page.replace(/[^a-z0-9]/g, '_') : ''}`;
  if (!force) {
    const row = await env.DB.prepare('SELECT valeur FROM reglages WHERE cle = ?').bind(cle).first();
    if (row && row.valeur) {
      try { const c = JSON.parse(row.valeur); if (c.maj && Date.now() - new Date(c.maj).getTime() < CACHE_H * 3600000) return { configure: true, ...c, cache: true }; } catch (e) { /* on réinterroge */ }
    }
  }
  const sa = compteDeService(env);
  const token = await jetonGoogle(sa);
  // Google livre ses chiffres avec ~2 jours de retard : la période se termine avant-hier
  const a = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  const de = new Date(Date.now() - (jours + 1) * 86400000).toISOString().slice(0, 10);
  const base = { startDate: de, endDate: a, type: 'web' };
  // analyse d'une seule page : on ne garde que les lignes de cette adresse (www, https)
  if (page) base.dimensionFilterGroups = [{ filters: [{ dimension: 'page', operator: 'equals', expression: `https://www.larretgourmand.com${page}` }] }];
  const [total, parJour, requetes, pages] = await Promise.all([
    requete(env, token, { ...base, rowLimit: 1 }),
    requete(env, token, { ...base, dimensions: ['date'], rowLimit: 100 }),
    requete(env, token, { ...base, dimensions: ['query'], rowLimit: page ? 25 : 15 }),
    page ? Promise.resolve([]) : requete(env, token, { ...base, dimensions: ['page'], rowLimit: 8 }),
  ]);
  const data = formatSearchConsole({ total, parJour, requetes, pages }, jours, de, a);
  if (page) data.page = page;
  await env.DB.prepare('INSERT INTO reglages (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur').bind(cle, JSON.stringify(data)).run();
  return { configure: true, ...data };
}
