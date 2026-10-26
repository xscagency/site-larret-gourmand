// Envoi d'un message sur le bot Telegram (variables TELEGRAM_BOT_TOKEN et TELEGRAM_CHAT_ID)
export const telegramConfigure = (env) => !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
export async function sendTelegram(env, text) {
  if (!telegramConfigure(env)) return { ok: false, error: 'Telegram non configuré.' };
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
  }).catch((e) => ({ ok: false, text: async () => String(e) }));
  if (!r.ok) return { ok: false, error: 'Telegram : ' + (await r.text()).slice(0, 200) };
  return { ok: true };
}
