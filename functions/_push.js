// Envoi de notifications Web Push depuis Cloudflare (sans bibliothèque) :
//  - chiffrement du message pour le téléphone du client (RFC 8291, aes128gcm)
//  - signature VAPID qui prouve que c'est bien notre site qui envoie (RFC 8292)
// Les clés VAPID sont générées une fois pour toutes et conservées dans la table reglages.

const te = new TextEncoder();
const SUBJECT = 'mailto:contact@larretgourmand.com';

export const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64u = (s) => {
  s = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  return Uint8Array.from(atob(s + pad), (c) => c.charCodeAt(0));
};
function concat(...arrs) {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}
async function hkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8));
}

// ---- Clés VAPID : créées à la première utilisation, puis relues depuis la base
export async function getVapid(env) {
  const rows = await env.DB.prepare("SELECT cle, valeur FROM reglages WHERE cle IN ('vapid_public', 'vapid_private')").all();
  const r = Object.fromEntries(rows.results.map((x) => [x.cle, x.valeur]));
  if (r.vapid_public && r.vapid_private) return { publicKey: r.vapid_public, jwk: JSON.parse(r.vapid_private) };
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = b64u(await crypto.subtle.exportKey('raw', pair.publicKey));
  const j = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const jwk = { kty: 'EC', crv: 'P-256', x: j.x, y: j.y, d: j.d };
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO reglages (cle, valeur) VALUES (?, ?)').bind('vapid_public', pub),
    env.DB.prepare('INSERT OR IGNORE INTO reglages (cle, valeur) VALUES (?, ?)').bind('vapid_private', JSON.stringify(jwk)),
  ]);
  // si deux requêtes ont généré en même temps, c'est la première écrite qui compte
  return getVapid(env);
}

// ---- Chiffrement du message (RFC 8291). `testing` permet de rejouer le vecteur de test de la RFC.
export async function encrypt(plaintext, p256dh, auth, testing) {
  const uaPub = unb64u(p256dh);
  const authSecret = unb64u(auth);
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const asKeys = testing?.asKeys || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey));
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256));
  const ikm = await hkdf(authSecret, ecdh, concat(te.encode('WebPush: info\0'), uaPub, asPub), 32);
  const salt = testing?.salt || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const record = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, concat(plaintext, new Uint8Array([2]))));
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPub.length]), asPub, record);
}

// ---- En-tête d'autorisation VAPID pour un service de push donné (Apple, Google, Mozilla…)
async function vapidAuth(endpoint, vapid) {
  const aud = new URL(endpoint).origin;
  const head = b64u(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(te.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SUBJECT })));
  const key = await crypto.subtle.importKey('jwk', vapid.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(`${head}.${claims}`));
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${vapid.publicKey}`;
}

// ---- Envoi à un abonné. Renvoie { ok, status, gone } ; gone = l'abonnement n'existe plus (à désactiver).
export async function sendPush(sub, data, vapid, opts = {}) {
  try {
    const body = await encrypt(te.encode(JSON.stringify(data)), sub.p256dh, sub.auth);
    const headers = {
      Authorization: await vapidAuth(sub.endpoint, vapid),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(opts.ttl ?? 6 * 3600),
      Urgency: opts.urgency || 'normal',
    };
    if (opts.topic) headers.Topic = opts.topic;
    const res = await fetch(sub.endpoint, { method: 'POST', headers, body });
    return { ok: res.status >= 200 && res.status < 300, status: res.status, gone: res.status === 404 || res.status === 410 };
  } catch (e) {
    return { ok: false, status: 0, gone: false, error: String(e?.message || e) };
  }
}

// Sujets d'alertes proposés aux clients (clé → libellé)
export const SUJETS = {
  service: 'Où est le camion ce soir',
  annulation: 'Annulations et changements',
  burger: 'Nouveaux burgers et burger du moment',
  offres: 'Offres et concours',
};

// Clé courte (empreinte) d'un abonnement, pour le suivi sans stocker l'adresse en clair une seconde fois
export async function cleAbonne(endpoint) {
  const h = await crypto.subtle.digest('SHA-256', te.encode(endpoint));
  return Array.from(new Uint8Array(h).slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
}
export const typeAppareil = (ua) => (/iphone|ipad|ipod/i.test(ua || '') ? 'iphone' : /android/i.test(ua || '') ? 'android' : 'autre');
