// Fonctions partagées par les routes.
import { ensureSchema, applyMigrations, SCHEMA_VERSION } from './_schema.js';

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });

// Date du jour en heure de Paris, au format YYYY-MM-DD
export function todayParis() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
}

// Heure courante à Paris en minutes depuis minuit, et jour de la semaine (0 = dimanche)
export function nowParis() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const days = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { minutes: Number(get('hour')) * 60 + Number(get('minute')), day: days[get('weekday')] };
}

// Ajoute n jours à une date YYYY-MM-DD (calcul en UTC, sans dérive de fuseau)
export function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function readAll(env) {
  return Promise.all([
    env.DB.prepare('SELECT * FROM burgers ORDER BY ordre').all(),
    env.DB.prepare('SELECT * FROM emplacements ORDER BY ordre').all(),
    env.DB.prepare('SELECT * FROM exceptions WHERE date >= ? ORDER BY date').bind(addDays(todayParis(), -1)).all(),
    env.DB.prepare('SELECT cle, valeur FROM reglages').all(),
  ]);
}

// Lit tout l'état public du site depuis D1.
// Si les tables n'existent pas encore (toute première visite), elles sont créées à la volée.
export async function loadState(env) {
  let rows;
  try {
    rows = await readAll(env);
  } catch (e) {
    if (!/no such table/i.test(String(e?.message || e))) throw e;
    await ensureSchema(env);
    rows = await readAll(env);
  }
  let [burgers, emplacements, exceptions, reglages] = rows;
  let r = Object.fromEntries(reglages.results.map((x) => [x.cle, x.valeur]));
  // base plus ancienne que le code : on applique les mises à jour manquantes puis on relit
  if (Number(r.schema_version || 0) < SCHEMA_VERSION) {
    await applyMigrations(env, Number(r.schema_version || 0));
    [burgers, emplacements, exceptions, reglages] = await readAll(env);
    r = Object.fromEntries(reglages.results.map((x) => [x.cle, x.valeur]));
  }
  const today = todayParis();
  return {
    today,
    prix: {
      burger: Number(r.prix_burger || 11),
      menu_frites: Number(r.prix_menu_frites || 13.5),
      menu_complet: Number(r.prix_menu_complet || 15.5),
      frites: Number(r.prix_frites || 3.5),
    },
    supplements: {
      sup_double: Number(r.sup_double ?? 5),
      sup_garniture: Number(r.sup_garniture ?? 2),
      frites_cheddar: Number(r.frites_cheddar ?? 2),
      frites_cheddar_bacon: Number(r.frites_cheddar_bacon ?? 3),
      frites_cheddar_oignons: Number(r.frites_cheddar_oignons ?? 2.5),
      frites_complet: Number(r.frites_complet ?? 3.5),
      frites_truffe: Number(r.frites_truffe ?? 2),
    },
    bandeau: r.bandeau || '',
    theme: ['noel', 'halloween', 'fete-nationale', 'saint-valentin', 'paques'].includes(r.theme) ? r.theme : '',
    theme_fx: r.theme_fx !== '0',
    burgers: burgers.results.map((b) => ({
      id: b.id, nom: b.nom, accroche: b.accroche || '', description: b.description || '', photo: b.photo || '',
      supplement: Number(b.supplement), actif: !!b.actif, ordre: b.ordre,
      rupture: !!(b.rupture_jusqua && b.rupture_jusqua >= today),
    })),
    emplacements: emplacements.results.map((e) => ({
      id: e.id, jour: e.jour, ville: e.ville, lieu: e.lieu, map_url: e.map_url, heures: e.heures, actif: !!e.actif,
    })),
    exceptions: exceptions.results.map((x) => ({
      date: x.date, annule: !!x.annule, ville: x.ville, lieu: x.lieu, map_url: x.map_url, heures: x.heures, message: x.message,
    })),
  };
}

// Ponctuation française : espace fine insécable avant ! ? : ; et à l'intérieur des guillemets
export const typo = (s) => String(s ?? '').replace(/ ([!?;:»])/g, '\u202F$1').replace(/« /g, '«\u202F');

// Texte alternatif des photos, sur le modèle SEO du site
export const altPhoto = (nom) => `${nom} – Meilleur Restaurant Burger Carrières Poissy Verneuil Triel sur Seine – L'Arrêt Gourmand`;

// Transforme "Le Végé Gourmand" en "le-vege-gourmand"
export function slugify(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'burger';
}

// Calcule "ce soir" / "prochaine escale" côté serveur (même logique que le JS public)
export function computeTonight(state) {
  const { day, minutes } = nowParis();
  const byDay = Object.fromEntries(state.emplacements.filter((e) => e.actif).map((e) => [e.jour, e]));
  const exc = Object.fromEntries(state.exceptions.map((x) => [x.date, x]));
  const closeAt = 20 * 60 + 30;

  function stopFor(dateIso, weekday) {
    const x = exc[dateIso];
    if (x) {
      if (x.annule) return { cancelled: true, message: x.message || '' };
      return { ...byDay[weekday], ville: x.ville || byDay[weekday]?.ville, lieu: x.lieu || byDay[weekday]?.lieu, map_url: x.map_url || byDay[weekday]?.map_url, heures: x.heures || byDay[weekday]?.heures || 'de 19h à 20h30', date: dateIso, weekday };
    }
    const e = byDay[weekday];
    return e ? { ...e, date: dateIso, weekday } : null;
  }

  const todayStop = stopFor(state.today, day);
  if (todayStop && !todayStop.cancelled && minutes < closeAt) return { tonight: todayStop, next: null, cancelledToday: null };

  const cancelledToday = todayStop && todayStop.cancelled && byDay[day] ? todayStop : null;
  for (let i = 1; i <= 14; i++) {
    const dateIso = addDays(state.today, i);
    const wd = (day + i) % 7;
    const s = stopFor(dateIso, wd);
    if (s && !s.cancelled) return { tonight: null, next: { ...s, inDays: i }, cancelledToday };
  }
  return { tonight: null, next: null, cancelledToday };
}
