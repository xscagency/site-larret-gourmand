// GET /f/<id>-<token>.<ext> — photos envoyées depuis le tableau de contrôle et conservées dans la base (sans R2)
export async function onRequestGet({ params, env }) {
  const m = /^(\d+)-([0-9a-f]{16})\.(jpg|png|webp)$/.exec((params.path || []).join('/'));
  if (!m || !env.DB) return new Response('Not found', { status: 404 });
  let row = null;
  try { row = await env.DB.prepare('SELECT type, data FROM fichiers WHERE id = ? AND token = ?').bind(Number(m[1]), m[2]).first(); } catch (e) { row = null; }
  if (!row) return new Response('Not found', { status: 404 });
  const body = Array.isArray(row.data) ? new Uint8Array(row.data) : row.data;
  return new Response(body, { headers: { 'content-type': row.type, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
}
