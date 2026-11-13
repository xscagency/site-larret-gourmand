// Accès à l'admin : comptes personnels (mot de passe + code à 6 chiffres), sessions par appareil, blocage des essais.
//
//  - Un appareil connecté le reste (jeton de session gardé dans le navigateur, seul son condensé est en base).
//  - Tous les N jours (réglage auth_code_jours, 30 par défaut) l'appareil redemande UNIQUEMENT le code à 6 chiffres.
//  - 5 erreurs en 15 min (mot de passe ou code) → blocage 15 min + alerte Telegram.
//  - Tant qu'aucun compte n'existe, l'ancien jeton ADMIN_TOKEN ouvre l'admin (pour créer le premier compte).
//    Ensuite il ne sert plus qu'à la route de secours (réinitialiser un compte), elle aussi limitée et signalée.
import { json } from './_lib.js';
import { sendTelegram } from './_telegram.js';

export const TABLE_ADMIN_USERS = `CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL UNIQUE,
    sel TEXT NOT NULL,
    hash TEXT NOT NULL,
    totp_secret TEXT,
    totp_actif INTEGER NOT NULL DEFAULT 0,
    totp_pas INTEGER NOT NULL DEFAULT 0,
    cree TEXT NOT NULL DEFAULT (datetime('now'))
  )`;
export const TABLE_ADMIN_SESSIONS = `CREATE TABLE IF NOT EXISTS admin_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jeton_hash TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    appareil TEXT,
    ip TEXT,
    cree TEXT NOT NULL DEFAULT (datetime('now')),
    vu TEXT NOT NULL DEFAULT (datetime('now')),
    code_le TEXT
  )`;
export const TABLE_ADMIN_ESSAIS = `CREATE TABLE IF NOT EXISTS admin_essais (
    cle TEXT PRIMARY KEY,
    n INTEGER NOT NULL DEFAULT 0,
    debut INTEGER NOT NULL DEFAULT 0,
    bloque_jusqua INTEGER NOT NULL DEFAULT 0
  )`;

// Les tables d'accès sont créées au premier appel (sans attendre la migration générale de la base).
let pret = false;
export async function preparerAuth(env) {
  if (pret) return;
  await env.DB.batch([TABLE_ADMIN_USERS, TABLE_ADMIN_SESSIONS, TABLE_ADMIN_ESSAIS, "CREATE TABLE IF NOT EXISTS reglages (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL)"].map((q) => env.DB.prepare(q)));
  pret = true;
}

const MAX_ESSAIS = 5, FENETRE = 15 * 60, BLOCAGE = 15 * 60, INACTIF_JOURS = 90, PBKDF2_TOURS = 100000;
const enc = new TextEncoder();
const now = () => Math.floor(Date.now() / 1000);
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const alea = (n) => crypto.getRandomValues(new Uint8Array(n));
const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
// comparaison à durée constante (ne révèle pas à quel caractère deux chaînes diffèrent)
function egal(a, b) {
  a = String(a); b = String(b);
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}
async function hashMdp(mdp, selHex) {
  const sel = new Uint8Array(selHex.match(/../g).map((h) => parseInt(h, 16)));
  const cle = await crypto.subtle.importKey('raw', enc.encode(mdp), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sel, iterations: PBKDF2_TOURS }, cle, 256));
}

// ---- code à 6 chiffres (TOTP, RFC 6238 : SHA-1, 30 s, 6 chiffres — le standard de Google Authenticator)
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32encode(bytes) {
  let bits = '', out = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
}
function b32decode(s) {
  let bits = '';
  for (const c of String(s).toUpperCase().replace(/[^A-Z2-7]/g, '')) bits += B32.indexOf(c).toString(2).padStart(5, '0');
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return new Uint8Array(out);
}
export async function totp(secret, pas) {
  const cle = await crypto.subtle.importKey('raw', b32decode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const msg = new Uint8Array(8);
  let p = pas;
  for (let i = 7; i >= 0; i--) { msg[i] = p & 0xff; p = Math.floor(p / 256); }
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', cle, msg));
  const o = h[19] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1000000).padStart(6, '0');
}
// Accepte le code du moment et ses voisins (± 30 s) ; un code déjà utilisé ne passe pas une seconde fois.
async function verifierCode(env, user, code) {
  code = String(code || '').replace(/\D/g, '');
  if (code.length !== 6 || !user.totp_secret) return false;
  const pas = Math.floor(now() / 30);
  for (const d of [0, -1, 1]) {
    if (pas + d <= (user.totp_pas || 0)) continue;
    if (egal(await totp(user.totp_secret, pas + d), code)) {
      await env.DB.prepare('UPDATE admin_users SET totp_pas = ? WHERE id = ?').bind(pas + d, user.id).run();
      return true;
    }
  }
  return false;
}

// ---- blocage des essais
async function bloque(env, cle) {
  const r = await env.DB.prepare('SELECT bloque_jusqua FROM admin_essais WHERE cle = ?').bind(cle).first();
  return r && r.bloque_jusqua > now() ? r.bloque_jusqua - now() : 0;
}
async function echec(env, cle) {
  const t = now();
  const r = await env.DB.prepare('SELECT n, debut FROM admin_essais WHERE cle = ?').bind(cle).first();
  const n = r && t - r.debut < FENETRE ? r.n + 1 : 1, debut = r && t - r.debut < FENETRE ? r.debut : t;
  const blo = n >= MAX_ESSAIS ? t + BLOCAGE : 0;
  await env.DB.prepare('INSERT INTO admin_essais (cle, n, debut, bloque_jusqua) VALUES (?, ?, ?, ?) ON CONFLICT(cle) DO UPDATE SET n = excluded.n, debut = excluded.debut, bloque_jusqua = excluded.bloque_jusqua')
    .bind(cle, blo ? 0 : n, debut, blo).run();
  return blo ? { bloque: true, reste: 0 } : { bloque: false, reste: MAX_ESSAIS - n };
}
const reussite = (env, cle) => env.DB.prepare('DELETE FROM admin_essais WHERE cle = ?').bind(cle).run();
const attendre = (s) => json({ ok: false, error: `Trop d'essais. Réessayez dans ${Math.ceil(s / 60)} min.` }, 429);

const ipDe = (request) => request.headers.get('cf-connecting-ip') || 'inconnue';
function appareilDe(request) {
  const ua = request.headers.get('user-agent') || '';
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Appareil';
  const nav = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return (os + (nav ? ' · ' + nav : '')).slice(0, 60);
}
const lieuDe = (request) => { const cf = request.cf || {}; return [cf.city, cf.country].filter(Boolean).join(', '); };
const alerte = (env, texte) => sendTelegram(env, '🔐 Admin L\'Arrêt Gourmand\n' + texte).catch(() => null);

async function codeJours(env) {
  const r = await env.DB.prepare("SELECT valeur FROM reglages WHERE cle = 'auth_code_jours'").first();
  const n = Number(r && r.valeur);
  return [1, 7, 14, 30, 60, 90].includes(n) ? n : 30;
}
const nbComptes = async (env) => (await env.DB.prepare('SELECT COUNT(*) AS n FROM admin_users').first()).n;
const jetonDe = (request) => { const h = request.headers.get('authorization') || ''; return h.startsWith('Bearer ') ? h.slice(7).trim() : ''; };
const nomPropre = (v) => String(v ?? '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 30);
const mdpValide = (m) => typeof m === 'string' && m.length >= 10 && m.length <= 200;

async function ouvrirSession(env, request, user, codeFait) {
  const jeton = hex(alea(32));
  await env.DB.prepare("INSERT INTO admin_sessions (jeton_hash, user_id, appareil, ip, code_le) VALUES (?, ?, ?, ?, " + (codeFait ? "datetime('now')" : 'NULL') + ')')
    .bind(await sha256(jeton), user.id, appareilDe(request), ipDe(request)).run();
  return jeton;
}

// Qui appelle ? → { ok:true, user, session } | { ok:true, ancien:true } (jeton d'origine, tant qu'aucun compte n'existe)
//               | { ok:false, besoin:'code' | 'enrolement' | '' }
export async function identifier(request, env) {
  const jeton = jetonDe(request);
  if (!jeton) return { ok: false, besoin: '' };
  const n = await nbComptes(env);
  if (!n) return env.ADMIN_TOKEN && egal(jeton, env.ADMIN_TOKEN) ? { ok: true, ancien: true } : { ok: false, besoin: '' };
  const s = await env.DB.prepare(`SELECT s.id, s.user_id, s.code_le, s.vu, u.nom, u.totp_actif,
      (julianday('now') - julianday(s.vu)) AS inactif, (julianday('now') - julianday(s.code_le)) AS age_code
    FROM admin_sessions s JOIN admin_users u ON u.id = s.user_id WHERE s.jeton_hash = ?`).bind(await sha256(jeton)).first();
  if (!s) return { ok: false, besoin: '' };
  if (s.inactif > INACTIF_JOURS) { await env.DB.prepare('DELETE FROM admin_sessions WHERE id = ?').bind(s.id).run(); return { ok: false, besoin: '' }; }
  if (s.inactif > 1 / 24) await env.DB.prepare("UPDATE admin_sessions SET vu = datetime('now'), ip = ? WHERE id = ?").bind(ipDe(request), s.id).run();
  const user = { id: s.user_id, nom: s.nom }, session = { id: s.id };
  if (!s.totp_actif || !s.code_le) return { ok: false, besoin: 'enrolement', user, session };
  if (s.age_code > await codeJours(env)) return { ok: false, besoin: 'code', user, session };
  return { ok: true, user, session };
}

// Routes /api/admin/auth/… — renvoie une réponse, ou null si la route n'est pas une route d'accès.
export async function routesAuth({ request, env, route, method, body }) {
  if (!route.startsWith('auth/') && route !== 'auth') return null;
  const ip = ipDe(request), r = route.slice(5);
  for (const k of ['mdp', 'ancien', 'nouveau']) if (typeof body[k] === 'string') body[k] = body[k].trim(); // pas d'espace parasite autour d'un mot de passe collé

  // l'écran de connexion a besoin de savoir s'il y a déjà des comptes
  if (r === 'etat' && method === 'GET') return json({ ok: true, comptes: (await nbComptes(env)) > 0 });

  // ---- connexion d'un nouvel appareil : identifiant + mot de passe, puis code à 6 chiffres
  if (r === 'login' && method === 'POST') {
    const nom = nomPropre(body.nom), kIp = 'ip:' + ip, kNom = 'nom:' + nom;
    const b = Math.max(await bloque(env, kIp), await bloque(env, kNom));
    if (b) return attendre(b);
    const u = nom ? await env.DB.prepare('SELECT * FROM admin_users WHERE nom = ?').bind(nom).first() : null;
    // même travail de calcul que le compte existe ou non (ne révèle pas quels identifiants existent)
    const ok = egal(await hashMdp(String(body.mdp || ''), u ? u.sel : '00'.repeat(16)), u ? u.hash : 'x') && !!u;
    const rate = async (quoi) => {
      const e1 = await echec(env, kIp), e2 = await echec(env, kNom), b1 = e1.bloque, b2 = e2.bloque, reste = Math.min(e1.reste, e2.reste);
      if (b1 || b2) await alerte(env, `⛔ ${MAX_ESSAIS} essais ratés (${quoi}) sur le compte « ${nom || '?'} » — bloqué 15 min.\nDepuis ${ip}${lieuDe(request) ? ' (' + lieuDe(request) + ')' : ''} · ${appareilDe(request)}`);
      if (b1 || b2) return json({ ok: false, error: `Trop d'essais : accès bloqué 15 min. L'autre compte peut vous débloquer depuis Réglages → Accès et sécurité.` }, 429);
      return json({ ok: false, error: (quoi === 'code' ? 'Code incorrect.' : 'Identifiant ou mot de passe incorrect.') + ` Encore ${reste} essai${reste > 1 ? 's' : ''} avant blocage.` }, 401);
    };
    if (!ok) return rate('mot de passe');
    if (!u.totp_actif) { // premier passage : la session sert uniquement à installer le code à 6 chiffres
      await reussite(env, kIp); await reussite(env, kNom);
      return json({ ok: true, jeton: await ouvrirSession(env, request, u, false), besoin: 'enrolement' });
    }
    if (!body.code) return json({ ok: false, besoin: 'code', error: 'Code à 6 chiffres demandé.' }, 401);
    if (!(await verifierCode(env, u, body.code))) return rate('code');
    await reussite(env, kIp); await reussite(env, kNom);
    const jeton = await ouvrirSession(env, request, u, true);
    await alerte(env, `✅ Nouvel appareil connecté : ${u.nom}\n${appareilDe(request)} · ${ip}${lieuDe(request) ? ' (' + lieuDe(request) + ')' : ''}\nSi ce n'est pas vous : Réglages → Accès → Déconnecter, puis changez le mot de passe.`);
    return json({ ok: true, jeton });
  }

  // ---- secours : le jeton d'origine (variable ADMIN_TOKEN de Cloudflare) remet un compte à zéro
  if (r === 'secours' && method === 'POST') {
    const kIp = 'ip:' + ip, b = await bloque(env, kIp);
    if (b) return attendre(b);
    if (!env.ADMIN_TOKEN || !egal(String(body.jeton || ''), env.ADMIN_TOKEN)) { await echec(env, kIp); return json({ ok: false, error: 'Jeton de secours refusé.' }, 401); }
    const nom = nomPropre(body.nom);
    if (!nom || !mdpValide(body.mdp)) return json({ ok: false, error: 'Identifiant et nouveau mot de passe (10 caractères minimum) requis.' }, 400);
    const sel = hex(alea(16)), hash = await hashMdp(body.mdp, sel);
    await env.DB.prepare('INSERT INTO admin_users (nom, sel, hash) VALUES (?, ?, ?) ON CONFLICT(nom) DO UPDATE SET sel = excluded.sel, hash = excluded.hash, totp_secret = NULL, totp_actif = 0, totp_pas = 0').bind(nom, sel, hash).run();
    const u = await env.DB.prepare('SELECT * FROM admin_users WHERE nom = ?').bind(nom).first();
    await env.DB.prepare('DELETE FROM admin_sessions WHERE user_id = ?').bind(u.id).run();
    await alerte(env, `🆘 Accès de secours utilisé : compte « ${nom} » réinitialisé.\nDepuis ${ip}${lieuDe(request) ? ' (' + lieuDe(request) + ')' : ''} · ${appareilDe(request)}`);
    return json({ ok: true, jeton: await ouvrirSession(env, request, u, false), besoin: 'enrolement' });
  }

  const qui = await identifier(request, env);

  // ---- création du premier compte (avec l'ancien jeton) ou d'un compte supplémentaire (par un compte connecté)
  if (r === 'comptes' && method === 'POST') {
    if (!qui.ok) return json({ ok: false, error: 'Accès refusé.', besoin: qui.besoin }, 401);
    const nom = nomPropre(body.nom);
    if (nom.length < 2) return json({ ok: false, error: 'Identifiant : 2 caractères minimum (lettres, chiffres).' }, 400);
    if (!mdpValide(body.mdp)) return json({ ok: false, error: 'Mot de passe : 10 caractères minimum.' }, 400);
    if (await env.DB.prepare('SELECT id FROM admin_users WHERE nom = ?').bind(nom).first()) return json({ ok: false, error: 'Cet identifiant existe déjà.' }, 400);
    const sel = hex(alea(16));
    await env.DB.prepare('INSERT INTO admin_users (nom, sel, hash) VALUES (?, ?, ?)').bind(nom, sel, await hashMdp(body.mdp, sel)).run();
    if (qui.ancien) { // premier compte : on passe tout de suite sur une vraie session, l'ancien jeton cesse d'ouvrir l'admin
      const u = await env.DB.prepare('SELECT * FROM admin_users WHERE nom = ?').bind(nom).first();
      return json({ ok: true, jeton: await ouvrirSession(env, request, u, false), besoin: 'enrolement' });
    }
    await reussite(env, 'nom:' + nom);
    await alerte(env, `👤 Compte « ${nom} » créé par ${qui.user.nom}.`);
    return json({ ok: true });
  }

  // ---- installation du code à 6 chiffres (session ouverte par mot de passe, pas encore validée)
  if (r === 'totp' && method === 'POST') {
    if (!qui.user || (qui.ok === false && qui.besoin !== 'enrolement')) return json({ ok: false, error: 'Accès refusé.' }, 401);
    const u = await env.DB.prepare('SELECT * FROM admin_users WHERE id = ?').bind(qui.user.id).first();
    if (u.totp_actif) return json({ ok: false, error: 'Le code est déjà installé sur ce compte.' }, 400);
    let secret = u.totp_secret;
    if (!secret) { secret = b32encode(alea(20)); await env.DB.prepare('UPDATE admin_users SET totp_secret = ? WHERE id = ?').bind(secret, u.id).run(); }
    if (!body.code) return json({ ok: true, secret, uri: `otpauth://totp/${encodeURIComponent("L'Arrêt Gourmand admin")}:${encodeURIComponent(u.nom)}?secret=${secret}&issuer=${encodeURIComponent("L'Arrêt Gourmand")}` });
    const k = 'ses:' + qui.session.id, b = await bloque(env, k);
    if (b) return attendre(b);
    if (!(await verifierCode(env, { ...u, totp_secret: secret }, body.code))) { await echec(env, k); return json({ ok: false, error: 'Code incorrect. Vérifiez que le téléphone est à l\'heure.' }, 400); }
    await env.DB.batch([
      env.DB.prepare('UPDATE admin_users SET totp_actif = 1 WHERE id = ?').bind(u.id),
      env.DB.prepare("UPDATE admin_sessions SET code_le = datetime('now') WHERE id = ?").bind(qui.session.id),
    ]);
    await alerte(env, `✅ Compte « ${u.nom} » protégé par code à 6 chiffres.\nAppareil : ${appareilDe(request)} · ${ip}`);
    return json({ ok: true });
  }

  // ---- l'appareil est connu, il redemande seulement le code (tous les N jours)
  if (r === 'code' && method === 'POST') {
    if (!qui.user || !qui.session || qui.besoin === 'enrolement') return json({ ok: false, error: 'Accès refusé.' }, 401);
    const k = 'ses:' + qui.session.id, b = await bloque(env, k);
    if (b) return attendre(b);
    const u = await env.DB.prepare('SELECT * FROM admin_users WHERE id = ?').bind(qui.user.id).first();
    if (!(await verifierCode(env, u, body.code))) {
      if ((await echec(env, k)).bloque) { // trop d'erreurs : l'appareil est déconnecté, il faudra le mot de passe
        await env.DB.prepare('DELETE FROM admin_sessions WHERE id = ?').bind(qui.session.id).run();
        await alerte(env, `⛔ ${MAX_ESSAIS} codes faux sur un appareil de « ${u.nom} » : appareil déconnecté.\n${appareilDe(request)} · ${ip}`);
        return json({ ok: false, error: 'Trop de codes faux : appareil déconnecté.' }, 401);
      }
      return json({ ok: false, besoin: 'code', error: 'Code incorrect.' }, 400);
    }
    await reussite(env, k);
    await env.DB.prepare("UPDATE admin_sessions SET code_le = datetime('now') WHERE id = ?").bind(qui.session.id).run();
    return json({ ok: true });
  }

  if (r === 'deconnexion' && method === 'POST') {
    if (qui.session) await env.DB.prepare('DELETE FROM admin_sessions WHERE id = ?').bind(qui.session.id).run();
    return json({ ok: true });
  }

  // ---- tout le reste demande une session complète
  if (!qui.ok) return json({ ok: false, error: 'Accès refusé.', besoin: qui.besoin }, 401);

  if (r === 'moi' && method === 'GET') {
    if (qui.ancien) return json({ ok: true, ancien: true });
    const ses = await env.DB.prepare('SELECT s.id, s.appareil, s.ip, s.cree, s.vu, s.code_le, u.nom FROM admin_sessions s JOIN admin_users u ON u.id = s.user_id ORDER BY s.vu DESC').all();
    const us = await env.DB.prepare('SELECT id, nom, totp_actif, cree FROM admin_users ORDER BY id').all();
    const blo = await env.DB.prepare('SELECT cle, bloque_jusqua FROM admin_essais WHERE bloque_jusqua > ?').bind(now()).all();
    return json({ ok: true, moi: qui.user, session_id: qui.session.id, code_jours: await codeJours(env), sessions: ses.results, comptes: us.results,
      blocages: blo.results.map((x) => ({ quoi: x.cle.replace(/^nom:/, 'compte ').replace(/^ip:/, 'adresse ').replace(/^ses:.*/, 'un appareil'), minutes: Math.ceil((x.bloque_jusqua - now()) / 60) })) });
  }
  if (qui.ancien) return json({ ok: false, error: 'Créez d\'abord votre compte.' }, 400);

  if (r === 'reglage' && method === 'PUT') {
    const n = Number(body.code_jours);
    if (![1, 7, 14, 30, 60, 90].includes(n)) return json({ ok: false, error: 'Durée invalide.' }, 400);
    await env.DB.prepare("INSERT INTO reglages (cle, valeur) VALUES ('auth_code_jours', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur").bind(String(n)).run();
    return json({ ok: true });
  }
  if (r === 'mdp' && method === 'PUT') {
    const u = await env.DB.prepare('SELECT * FROM admin_users WHERE id = ?').bind(qui.user.id).first();
    const k = 'ses:' + qui.session.id, b = await bloque(env, k);
    if (b) return attendre(b);
    if (!egal(await hashMdp(String(body.ancien || ''), u.sel), u.hash)) { await echec(env, k); return json({ ok: false, error: 'Mot de passe actuel incorrect.' }, 400); }
    if (!mdpValide(body.nouveau)) return json({ ok: false, error: 'Nouveau mot de passe : 10 caractères minimum.' }, 400);
    const sel = hex(alea(16));
    await env.DB.batch([
      env.DB.prepare('UPDATE admin_users SET sel = ?, hash = ? WHERE id = ?').bind(sel, await hashMdp(body.nouveau, sel), u.id),
      env.DB.prepare('DELETE FROM admin_sessions WHERE user_id = ? AND id != ?').bind(u.id, qui.session.id), // les autres appareils devront se reconnecter
    ]);
    await alerte(env, `🔑 Mot de passe de « ${u.nom} » changé.`);
    return json({ ok: true });
  }
  if (r === 'blocages' && method === 'DELETE') { await env.DB.prepare('DELETE FROM admin_essais').run(); return json({ ok: true }); }
  let m;
  if ((m = r.match(/^sessions\/(\d+)$/)) && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM admin_sessions WHERE id = ?').bind(Number(m[1])).run();
    return json({ ok: true });
  }
  if ((m = r.match(/^comptes\/(\d+)$/)) && method === 'DELETE') {
    const id = Number(m[1]);
    if (id === qui.user.id) return json({ ok: false, error: 'Impossible de supprimer son propre compte.' }, 400);
    const u = await env.DB.prepare('SELECT nom FROM admin_users WHERE id = ?').bind(id).first();
    await env.DB.batch([env.DB.prepare('DELETE FROM admin_sessions WHERE user_id = ?').bind(id), env.DB.prepare('DELETE FROM admin_users WHERE id = ?').bind(id)]);
    if (u) await alerte(env, `🗑 Compte « ${u.nom} » supprimé par ${qui.user.nom}.`);
    return json({ ok: true });
  }
  // remise à zéro d'un compte par l'autre (téléphone perdu, mot de passe oublié) : nouveau mot de passe provisoire, code à réinstaller
  if ((m = r.match(/^comptes\/(\d+)\/reinit$/)) && method === 'POST') {
    const id = Number(m[1]);
    if (id === qui.user.id) return json({ ok: false, error: 'Pour son propre compte : « Changer mon mot de passe ».' }, 400);
    if (!mdpValide(body.mdp)) return json({ ok: false, error: 'Mot de passe provisoire : 10 caractères minimum.' }, 400);
    const u = await env.DB.prepare('SELECT nom FROM admin_users WHERE id = ?').bind(id).first();
    if (!u) return json({ ok: false, error: 'Compte introuvable.' }, 404);
    const sel = hex(alea(16));
    await env.DB.batch([
      env.DB.prepare('UPDATE admin_users SET sel = ?, hash = ?, totp_secret = NULL, totp_actif = 0, totp_pas = 0 WHERE id = ?').bind(sel, await hashMdp(body.mdp, sel), id),
      env.DB.prepare('DELETE FROM admin_sessions WHERE user_id = ?').bind(id),
    ]);
    await reussite(env, 'nom:' + u.nom);
    await env.DB.prepare("DELETE FROM admin_essais WHERE cle LIKE 'ip:%'").run();
    await alerte(env, `♻️ Compte « ${u.nom} » remis à zéro par ${qui.user.nom}.`);
    return json({ ok: true });
  }
  return json({ ok: false, error: 'Route inconnue.' }, 404);
}
