// POST /api/rappels/tick — appelé chaque matin par la tâche planifiée GitHub. Sans secret : il ne peut rien faire
// d'autre que déclencher, au plus une fois par jour et après 9h, les rappels prévus (le test forcé passe par l'admin).
import { json, loadState } from '../../_lib.js';
import { runRappels } from '../../_rappels.js';
export async function onRequest({ request, env }) {
  if (request.method !== 'POST' && request.method !== 'GET') return json({ ok: false }, 405);
  await loadState(env); // base à jour
  const r = await runRappels(env, { force: false, origin: new URL(request.url).origin });
  return json(r, r.ok ? 200 : 400);
}
