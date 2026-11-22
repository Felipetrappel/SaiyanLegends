/* Progresso do jogador no D1 — fase 2 (ainda desligado). */
export async function saveApi() { return new Response(JSON.stringify({ ok: false, error: 'Salvamento na nuvem ainda não ativado.' }), { status: 501, headers: { 'content-type': 'application/json' } }); }
