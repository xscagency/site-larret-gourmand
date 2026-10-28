// Visites du site : lues chez Cloudflare (Web Analytics, sans cookie) via leur API GraphQL.
// Variables à définir sur le projet Pages :
//   CF_API_TOKEN   jeton d'API avec l'autorisation « Compte · Analyses du compte · Lecture »
//   CF_ACCOUNT_ID  identifiant du compte Cloudflare
//   CF_SITE_TAG    (facultatif) identifiant du site dans Web Analytics, si plusieurs sites sont mesurés
// Le résultat est gardé 15 minutes dans la table reglages pour que l'ouverture de l'admin reste instantanée.

const GQL = 'https://api.cloudflare.com/client/v4/graphql';
const CACHE_MIN = 15;
const hex = (v) => String(v || '').replace(/[^a-f0-9]/gi, '').slice(0, 64);
const iso = (d) => d.toISOString().slice(0, 19) + 'Z';

export const visitesConfigurees = (env) => !!(env.CF_API_TOKEN && env.CF_ACCOUNT_ID);

async function interroger(env, jours) {
  const to = new Date();
  const from = new Date(to.getTime() - (jours - 1) * 86400000);
  from.setUTCHours(0, 0, 0, 0);
  const filtre = `datetime_geq: "${iso(from)}", datetime_leq: "${iso(to)}"${env.CF_SITE_TAG ? `, siteTag: "${hex(env.CF_SITE_TAG)}"` : ''}`;
  const grp = (dims, limit, order) => `rumPageloadEventsAdaptiveGroups(limit: ${limit}, filter: {${filtre}}${order ? `, orderBy: [${order}]` : ''}) { count sum { visits } ${dims ? `dimensions { ${dims} }` : ''} }`;
  const query = `{ viewer { accounts(filter: {accountTag: "${hex(env.CF_ACCOUNT_ID)}"}) {
    total: ${grp('', 1)}
    jours: ${grp('date', 400, 'date_ASC')}
    pages: ${grp('requestPath', 8, 'count_DESC')}
    sources: ${grp('refererHost', 8, 'count_DESC')}
    appareils: ${grp('deviceType', 5, 'count_DESC')}
    pays: ${grp('countryName', 6, 'count_DESC')}
  } } }`;
  const res = await fetch(GQL, { method: 'POST', headers: { authorization: `Bearer ${env.CF_API_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ query }) });
  const data = await res.json().catch(() => ({}));
  if (data.errors && data.errors.length) throw new Error(data.errors[0].message || 'Réponse inattendue de Cloudflare');
  if (!res.ok) throw new Error(`Cloudflare a répondu ${res.status}`);
  const acc = data.data && data.data.viewer && data.data.viewer.accounts && data.data.viewer.accounts[0];
  if (!acc) throw new Error('Compte introuvable : vérifiez CF_ACCOUNT_ID et les droits du jeton.');
  return acc;
}

// Met en forme la réponse brute de Cloudflare pour l'admin (fonction pure, testable sans réseau)
export function formatVisites(acc, jours, maintenant = new Date()) {
  const n = (x) => Number(x || 0);
  const ligne = (r, nom) => ({ nom, vues: n(r.count), visites: n(r.sum && r.sum.visits) });
  const parJour = {};
  for (const r of acc.jours || []) parJour[r.dimensions.date] = ligne(r, r.dimensions.date);
  const serie = [];
  for (let i = jours - 1; i >= 0; i--) {
    const d = new Date(maintenant.getTime() - i * 86400000).toISOString().slice(0, 10);
    serie.push(parJour[d] || { nom: d, vues: 0, visites: 0 });
  }
  const somme = (arr, k) => arr.reduce((t, x) => t + x[k], 0);
  const sem = serie.slice(-7);
  const total = acc.total && acc.total[0] ? ligne(acc.total[0], 'total') : { vues: somme(serie, 'vues'), visites: somme(serie, 'visites') };
  const liste = (rows, dim, libelle) => (rows || []).map((r) => ligne(r, libelle(r.dimensions[dim])));
  return {
    jours: serie,
    total: { vues: total.vues, visites: total.visites },
    semaine: { vues: somme(sem, 'vues'), visites: somme(sem, 'visites') },
    pages: liste(acc.pages, 'requestPath', (p) => (!p || p === '/' ? 'Accueil' : p)),
    sources: liste(acc.sources, 'refererHost', (h) => (!h ? 'Accès direct' : h.replace(/^www\./, ''))),
    appareils: liste(acc.appareils, 'deviceType', (t) => ({ desktop: 'Ordinateur', mobile: 'Téléphone', tablet: 'Tablette' }[t] || t || 'Autre')),
    pays: liste(acc.pays, 'countryName', (c) => c || 'Inconnu'),
    periode: jours,
    maj: maintenant.toISOString(),
  };
}

// En cas de refus de Cloudflare, on précise d'où vient le problème (jeton ou identifiant de compte)
async function diagnostiquer(env, erreur) {
  const h = { authorization: `Bearer ${env.CF_API_TOKEN}` };
  let msg = erreur;
  try {
    const v = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', { headers: h }).then((r) => r.json());
    if (!v.success) return `${erreur} — le jeton CF_API_TOKEN est refusé par Cloudflare (${(v.errors && v.errors[0] && v.errors[0].message) || 'invalide'}) : vérifiez qu'il a été collé en entier.`;
    if (v.result && v.result.status !== 'active') return `${erreur} — le jeton existe mais n'est pas actif (${v.result.status}).`;
    const a = await fetch('https://api.cloudflare.com/client/v4/accounts?per_page=20', { headers: h }).then((r) => r.json());
    const comptes = (a.result || []).map((x) => `${x.name} (${x.id})`);
    const vise = hex(env.CF_ACCOUNT_ID);
    if (a.success && comptes.length && !(a.result || []).some((x) => x.id === vise)) return `${erreur} — le jeton est valide mais ne donne pas accès au compte ${vise}. Comptes qu'il voit : ${comptes.join(', ')}.`;
    msg = `${erreur} — le jeton est valide${comptes.length ? ` et voit le compte ${vise}` : ''}, mais il lui manque l'autorisation « Account Analytics : Read » (dans Mon profil → API Tokens → modifier le jeton « Stats site »).`;
  } catch (e) { /* diagnostic impossible : on garde l'erreur d'origine */ }
  return msg;
}

export async function getVisites(env, { jours = 30, force = false } = {}) {
  if (!visitesConfigurees(env)) return { configure: false };
  const cle = `visites_cache_${jours}`;
  if (!force) {
    const row = await env.DB.prepare('SELECT valeur FROM reglages WHERE cle = ?').bind(cle).first();
    if (row && row.valeur) {
      try {
        const c = JSON.parse(row.valeur);
        if (c.maj && Date.now() - new Date(c.maj).getTime() < CACHE_MIN * 60000) return { configure: true, ...c, cache: true };
      } catch (e) { /* cache illisible : on réinterroge */ }
    }
  }
  let acc;
  try { acc = await interroger(env, jours); }
  catch (e) { throw new Error(await diagnostiquer(env, String(e.message || e))); }
  const data = formatVisites(acc, jours);
  await env.DB.prepare('INSERT INTO reglages (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur').bind(cle, JSON.stringify(data)).run();
  return { configure: true, ...data };
}
