// POST /api/devis — reçoit le formulaire de contact / privatisation
// 1. vérifie les champs (et Turnstile si configuré)
// 2. enregistre la demande dans D1 (aucun lead perdu)
// 3. envoie un mail à l'équipe + un accusé de réception au client, via Resend
//
// Variables d'environnement (Cloudflare Pages > Settings > Variables) :
//   RESEND_API_KEY   clé API Resend
//   MAIL_TO          adresse qui reçoit les demandes (plusieurs possibles, séparées par des virgules)
//   MAIL_FROM        expéditeur vérifié chez Resend, ex. "L'Arrêt Gourmand <contact@larretgourmand.com>"
//   TURNSTILE_SECRET (optionnel) clé secrète Turnstile anti-spam
//   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (optionnels) notification Telegram à chaque demande
// Sans RESEND_API_KEY, aucun mail ne part : la demande est quand même enregistrée et visible dans /admin.

import { json } from '../_lib.js';
import { applyMigrations } from '../_schema.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function onRequestPost({ request, env }) {
  let data;
  const ct = request.headers.get('content-type') || '';
  try {
    data = ct.includes('application/json') ? await request.json() : Object.fromEntries((await request.formData()).entries());
  } catch {
    return json({ ok: false, error: 'Formulaire illisible.' }, 400);
  }

  // Piège à robots : un champ caché que les humains ne remplissent pas
  if (data.website) return json({ ok: true });

  const d = {
    nom: String(data.nom || '').trim().slice(0, 120),
    tel: String(data.tel || '').trim().slice(0, 40),
    email: String(data.email || '').trim().slice(0, 160),
    type: String(data.type || '').trim().slice(0, 60),
    date_event: String(data.date || data.date_event || '').trim().slice(0, 20),
    convives: String(data.convives || '').trim().slice(0, 20),
    adresse: String(data.adresse || '').trim().slice(0, 200),
    code_postal: String(data.code_postal || data.cp || '').trim().slice(0, 12),
    ville: String(data.ville || '').trim().slice(0, 120),
    moment: String(data.moment || '').trim().slice(0, 60),
    message: String(data.message || '').trim().slice(0, 4000),
    page: String(data.page || request.headers.get('referer') || '').slice(0, 200),
  };
  d.lieu = [d.adresse, [d.code_postal, d.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ') || String(data.lieu || '').trim().slice(0, 160);
  if (!d.nom || !d.tel || !d.email) return json({ ok: false, error: 'Nom, téléphone et email sont nécessaires pour vous répondre.' }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) return json({ ok: false, error: 'Adresse email invalide.' }, 400);

  // Anti-spam Turnstile (uniquement si la clé est configurée)
  if (env.TURNSTILE_SECRET) {
    const token = data['cf-turnstile-response'];
    const v = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: token, remoteip: request.headers.get('cf-connecting-ip') }),
    }).then((r) => r.json()).catch(() => ({ success: false }));
    if (!v.success) return json({ ok: false, error: 'Vérification anti-spam échouée, réessayez.' }, 400);
  }

  // 1. Enregistrement (si la colonne "moment" manque sur une base plus ancienne, on l'ajoute et on réessaie)
  const insert = () => env.DB.prepare(
    `INSERT INTO demandes (nom, tel, email, type, date_event, convives, lieu, moment, adresse, code_postal, ville, message, page) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(d.nom, d.tel, d.email, d.type, d.date_event, d.convives, d.lieu, d.moment, d.adresse, d.code_postal, d.ville, d.message, d.page).run();
  let ins;
  try { ins = await insert(); }
  catch (e) {
    if (!/has no column named|no column named/i.test(String(e?.message || e))) throw e;
    await applyMigrations(env);
    ins = await insert();
  }
  const id = ins.meta.last_row_id;

  // 2. Mails
  let mailOk = false;
  if (env.RESEND_API_KEY && env.MAIL_TO && env.MAIL_FROM) {
    const lignes = [
      ['Nom', d.nom], ['Téléphone', d.tel], ['Email', d.email], ['Type d\'événement', d.type],
      ['Date souhaitée', d.date_event], ['Moment', d.moment], ['Nombre de convives', d.convives], ['Adresse', d.lieu], ['Page', d.page],
    ].filter(([, v]) => v);
    const htmlEquipe = `
      <h2 style="font-family:sans-serif">Nouvelle demande n°${id}</h2>
      <table style="font-family:sans-serif;border-collapse:collapse">${lignes.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666">${esc(k)}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>`).join('')}</table>
      ${d.message ? `<p style="font-family:sans-serif;white-space:pre-wrap;border-left:3px solid #D6402F;padding-left:12px">${esc(d.message)}</p>` : ''}
      <p style="font-family:sans-serif;color:#666">Répondre : <a href="mailto:${esc(d.email)}">${esc(d.email)}</a> · <a href="tel:${esc(d.tel)}">${esc(d.tel)}</a></p>`;
    const htmlClient = `
      <p style="font-family:sans-serif">Bonjour ${esc(d.nom)},</p>
      <p style="font-family:sans-serif">Nous avons bien reçu votre demande${d.type ? ` pour votre ${esc(d.type.toLowerCase())}` : ''}${d.date_event ? ` (${esc(d.date_event)})` : ''}. Nous vous contacterons par mail ou téléphone dans les plus brefs délais.</p>
      <p style="font-family:sans-serif">À bientôt,<br>L'Arrêt Gourmand<br>Food-Truck Burger (78) • Since 2014<br>07 82 54 98 29</p>`;

    const send = (payload) => fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const [r1, r2] = await Promise.all([
      send({ from: env.MAIL_FROM, to: env.MAIL_TO.split(',').map((s) => s.trim()), reply_to: d.email, subject: `Demande de devis n°${id} – ${d.nom}${d.type ? ' – ' + d.type : ''}`, html: htmlEquipe }),
      send({ from: env.MAIL_FROM, to: [d.email], subject: 'Votre demande – L\'Arrêt Gourmand', html: htmlClient }),
    ]);
    mailOk = r1.ok;
    if (!r1.ok) console.error('Resend error', await r1.text());
    if (!r2.ok) console.error('Resend error (client)', await r2.text());
    await env.DB.prepare('UPDATE demandes SET mail_envoye = ? WHERE id = ?').bind(mailOk ? 1 : 0, id).run();
  }

  // 3. Notification Telegram (optionnelle) : TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    const lignes = [
      `🍔 Nouvelle demande n°${id}`,
      `👤 ${d.nom}`, `📞 ${d.tel}`, `✉️ ${d.email}`,
      d.type ? `🎉 ${d.type}${d.date_event ? ' · ' + d.date_event : ''}${d.moment ? ' · ' + d.moment : ''}` : (d.date_event ? `📅 ${d.date_event}${d.moment ? ' · ' + d.moment : ''}` : ''),
      d.convives ? `👥 ${d.convives} convives` : '', d.lieu ? `📍 ${d.lieu}` : '',
      d.message ? `\n${d.message.slice(0, 500)}` : '',
      `\nVoir dans l'admin : ${new URL(request.url).origin}/admin`,
    ].filter(Boolean).join('\n');
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: lignes, disable_web_page_preview: true }),
    }).catch((e) => console.error('Telegram error', e));
  }

  return json({ ok: true, id, mail: mailOk });
}
