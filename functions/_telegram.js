// Envoi de messages Telegram.
//  - canal 'principal' : bot des demandes (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)
//  - canal 'rappels'   : bot dédié aux rappels s'il est réglé dans l'admin (table reglages), sinon RAPPELS_BOT_TOKEN / RAPPELS_CHAT_ID, sinon le bot principal
export async function telegramConfig(env, canal = 'principal') {
  if (canal === 'rappels') {
    const rows = await env.DB.prepare("SELECT cle, valeur FROM reglages WHERE cle IN ('rappels_bot_token', 'rappels_chat_id')").all().catch(() => ({ results: [] }));
    const r = Object.fromEntries(rows.results.map((x) => [x.cle, x.valeur]));
    if (r.rappels_bot_token && r.rappels_chat_id) return { token: r.rappels_bot_token, chat: r.rappels_chat_id, source: 'dedie' };
    if (env.RAPPELS_BOT_TOKEN && env.RAPPELS_CHAT_ID) return { token: env.RAPPELS_BOT_TOKEN, chat: env.RAPPELS_CHAT_ID, source: 'dedie' };
  }
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) return { token: env.TELEGRAM_BOT_TOKEN, chat: env.TELEGRAM_CHAT_ID, source: 'principal' };
  return null;
}
export async function sendTelegram(env, text, canal = 'principal') {
  const cfg = await telegramConfig(env, canal);
  if (!cfg) return { ok: false, error: 'Telegram non configuré.' };
  const r = await fetch(`https://api.telegram.org/bot${cfg.token}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: cfg.chat, text, disable_web_page_preview: true }),
  }).catch((e) => ({ ok: false, text: async () => String(e) }));
  if (!r.ok) return { ok: false, error: 'Telegram : ' + (await r.text()).slice(0, 200) };
  return { ok: true };
}
// Retrouve la conversation d'un bot : la dernière personne qui lui a écrit (après un /start)
export async function detectChat(token) {
  const r = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=50`).then((x) => x.json()).catch(() => null);
  if (!r || !r.ok) return { ok: false, error: 'Jeton de bot invalide ou Telegram injoignable.' };
  const msgs = (r.result || []).map((u) => (u.message || u.edited_message || u.channel_post || {}).chat).filter(Boolean);
  if (!msgs.length) return { ok: false, error: 'Aucun message reçu par ce bot : ouvrez-le dans Telegram, appuyez sur Démarrer (/start), puis réessayez.' };
  const c = msgs[msgs.length - 1];
  return { ok: true, chat_id: String(c.id), nom: [c.first_name, c.last_name, c.title, c.username ? '@' + c.username : ''].filter(Boolean).join(' ') };
}
