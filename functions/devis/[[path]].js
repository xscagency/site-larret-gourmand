// GET /devis/<numero>-<jeton>.pdf — le PDF archivé d'un devis (lien non devinable, partagé dans l'agenda)
export async function onRequestGet({ params, env }) {
  const m = ((params.path || []).join('/')).match(/^(F?\d{9,12})-([a-f0-9]{24})\.pdf$/);
  if (!m) return new Response('Not found', { status: 404 });
  const row = await env.DB.prepare('SELECT pdf FROM devis WHERE numero = ? AND pdf_token = ?').bind(m[1], m[2]).first();
  if (!row || !row.pdf) return new Response('Not found', { status: 404 });
  // D1 renvoie un BLOB sous forme de tableau de nombres : on le remet en octets
  const bytes = row.pdf instanceof ArrayBuffer ? new Uint8Array(row.pdf) : Array.isArray(row.pdf) ? new Uint8Array(row.pdf) : row.pdf;
  return new Response(bytes, { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${m[1].startsWith('F') ? 'Facture' : 'Devis'}-${m[1]}-L-Arret-Gourmand.pdf"`, 'cache-control': 'private, max-age=0', 'x-robots-tag': 'noindex' } });
}
