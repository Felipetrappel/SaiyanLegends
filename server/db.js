/* PostgreSQL (Render): contas, sessões e progresso dos jogadores. Usa a variável de ambiente DATABASE_URL.
 * - Cria as tabelas sozinho na primeira inicialização (CREATE TABLE IF NOT EXISTS) — não precisa rodar SQL na mão.
 * - Todas as consultas são parametrizadas ($1, $2…); nada de texto do jogador entra no SQL.
 * - Importa, sem apagar nada, contas que já existiam em data/users.json ou no Supabase (ver migrateLegacy).
 * Dependência: pacote npm "pg" (está no package.json da raiz; o Render instala no build com `npm install`). */
'use strict';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS players (
     id             text PRIMARY KEY,
     username       text NOT NULL,
     username_lower text NOT NULL UNIQUE,
     pw_hash        text NOT NULL,
     created_at     timestamptz NOT NULL DEFAULT now(),
     updated_at     timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS sessions (
     token_hash text PRIMARY KEY,
     player_id  text NOT NULL REFERENCES players(id) ON DELETE CASCADE,
     expires_at timestamptz NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS sessions_player_idx ON sessions(player_id)`,
  `CREATE TABLE IF NOT EXISTS player_progress (
     player_id  text PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
     rev        integer NOT NULL DEFAULT 1,
     gold       bigint  NOT NULL DEFAULT 0,
     silver     bigint  NOT NULL DEFAULT 0,
     gems       bigint  NOT NULL DEFAULT 0,
     xp         bigint  NOT NULL DEFAULT 0,
     level      integer NOT NULL DEFAULT 0,
     selected   text    NOT NULL DEFAULT '',
     picked     boolean NOT NULL DEFAULT false,
     welcomed   boolean NOT NULL DEFAULT false,
     unlocked   jsonb   NOT NULL DEFAULT '[]',
     stats      jsonb   NOT NULL DEFAULT '{}',
     upgrades   jsonb   NOT NULL DEFAULT '{}',
     forms      jsonb   NOT NULL DEFAULT '[]',
     techniques jsonb   NOT NULL DEFAULT '[]',
     settings   jsonb   NOT NULL DEFAULT '{}',
     missions   jsonb   NOT NULL DEFAULT '{}',
     updated_at timestamptz NOT NULL DEFAULT now()
   )`
];

const SQL = {
  getPlayer: `SELECT id, username, pw_hash, extract(epoch from created_at)*1000 AS created FROM players WHERE id = $1`,
  createPlayer: `INSERT INTO players (id, username, username_lower, pw_hash, created_at) VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0)) ON CONFLICT DO NOTHING RETURNING id`,
  updatePlayer: `UPDATE players SET username = $2, pw_hash = $3, updated_at = now() WHERE id = $1`,
  getSessions: `SELECT token_hash, extract(epoch from expires_at)*1000 AS exp FROM sessions WHERE player_id = $1 AND expires_at > now()`,
  delSessions: `DELETE FROM sessions WHERE player_id = $1 AND NOT (token_hash = ANY($2::text[]))`,
  addSession: `INSERT INTO sessions (token_hash, player_id, expires_at) VALUES ($1, $2, to_timestamp($3 / 1000.0)) ON CONFLICT (token_hash) DO UPDATE SET expires_at = EXCLUDED.expires_at WHERE sessions.player_id = EXCLUDED.player_id`,
  purgeSessions: `DELETE FROM sessions WHERE expires_at < now()`,
  getProgress: `SELECT rev, gold, silver, gems, xp, level, selected, picked, welcomed, unlocked, stats, upgrades, forms, techniques, settings, missions FROM player_progress WHERE player_id = $1`,
  insertProgress: `INSERT INTO player_progress (player_id, gold, silver, gems, xp, level, selected, picked, welcomed, unlocked, stats, upgrades, forms, techniques, settings, missions)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,$14::jsonb,$15::jsonb,$16::jsonb) ON CONFLICT (player_id) DO NOTHING RETURNING rev`,
  /* só grava se a revisão enviada for a atual (evita que um aparelho com dados velhos apague o progresso de outro) */
  updateProgress: `UPDATE player_progress SET rev = rev + 1, gold=$3, silver=$4, gems=$5, xp=$6, level=$7, selected=$8, picked=$9, welcomed=$10, unlocked=$11::jsonb, stats=$12::jsonb,
     upgrades=$13::jsonb, forms=$14::jsonb, techniques=$15::jsonb, settings=$16::jsonb, missions=$17::jsonb, updated_at=now() WHERE player_id=$1 AND rev=$2 RETURNING rev`,
  count: `SELECT count(*)::int AS n FROM players`
};

/* progresso (formato do jogo) <-> linha da tabela */
const toRow = p => [p.gold, p.silver, p.gems, p.xp, p.level, p.selected, p.picked, p.welcomed, JSON.stringify(p.unlocked), JSON.stringify(p.stats), JSON.stringify(p.upgrades), JSON.stringify(p.forms), JSON.stringify(p.techniques), JSON.stringify(p.settings), JSON.stringify(p.missions)];
const fromRow = r => ({ gold: Number(r.gold), silver: Number(r.silver), gems: Number(r.gems), xp: Number(r.xp), level: r.level, selected: r.selected, picked: r.picked, welcomed: r.welcomed,
  unlocked: r.unlocked, stats: r.stats, upgrades: r.upgrades, forms: r.forms, techniques: r.techniques, settings: r.settings, missions: r.missions });

function connect(ENV, log) {
  let pg; try { pg = require('pg'); } catch (e) { const err = new Error('pacote "pg" não instalado: rode `npm install` (no Render, Build Command = npm install)'); err.fatal = true; throw err; }
  const url = ENV.DATABASE_URL, local = /@(localhost|127\.0\.0\.1|\[::1\])(:|\/)/.test(url) || ENV.PGSSL === '0';
  /* Render: a URL externa exige SSL; a interna aceita. rejectUnauthorized:false porque o certificado do Render é autoassinado. */
  const pool = new pg.Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false }, max: 8, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 });
  pool.on('error', e => log('postgres (conexão ociosa):', e.message));
  const q = (text, params) => pool.query(text, params);

  let migrating = false;
  const gate = (async () => {
    for (let i = 0; ; i++) {   // o banco do Render pode demorar a acordar: tenta por ~1 minuto
      try { await q('SELECT 1'); break; } catch (e) { if (i >= 12) throw e; log('postgres indisponível, tentando de novo…', e.message); await new Promise(r => setTimeout(r, 5000)); }
    }
    for (const s of SCHEMA) await q(s);
    await q(SQL.purgeSessions);
    log('postgres: conectado, tabelas prontas (' + (await q(SQL.count)).rows[0].n + ' contas)');
  })();
  const ready = gate.then(async () => { migrating = true; try { await migrateLegacy(ENV, log, store); } finally { migrating = false; } });   // as rotas esperam a migração; a própria migração só espera as tabelas
  ready.catch(e => log('postgres: FALHA ao iniciar —', e.message));

  const store = {
    name: 'postgres', ready,
    async get(id) {
      await (migrating ? gate : ready); const p = (await q(SQL.getPlayer, [id])).rows[0]; if (!p) return null;
      const s = (await q(SQL.getSessions, [id])).rows;
      return { id: p.id, name: p.username, pw: p.pw_hash, created: Number(p.created), sessions: s.map(x => ({ h: x.token_hash, exp: Number(x.exp) })) };
    },
    /* cria a conta; false se o nome já existe (a UNIQUE do banco decide, mesmo com dois cadastros ao mesmo tempo) */
    async create(id, u) { await (migrating ? gate : ready); return (await q(SQL.createPlayer, [id, u.name, u.name.toLowerCase(), u.pw, u.created || Date.now()])).rowCount === 1; },
    async put(id, u) {
      await (migrating ? gate : ready); const c = await pool.connect();
      try {
        await c.query('BEGIN'); await c.query(SQL.updatePlayer, [id, u.name, u.pw]);
        const keep = (u.sessions || []).filter(s => s.exp > Date.now());
        await c.query(SQL.delSessions, [id, keep.map(s => s.h)]);
        for (const s of keep) await c.query(SQL.addSession, [s.h, id, s.exp]);
        await c.query('COMMIT');
      } catch (e) { try { await c.query('ROLLBACK'); } catch (_) {} throw e; } finally { c.release(); }
    },
    async getProgress(id) { await (migrating ? gate : ready); const r = (await q(SQL.getProgress, [id])).rows[0]; return r ? { rev: r.rev, progress: fromRow(r) } : null; },
    /* baseRev 0 = primeira gravação. Devolve { ok:true, rev } ou { ok:false, conflict:true, current } */
    async putProgress(id, prog, baseRev) {
      await (migrating ? gate : ready);
      if (!baseRev) { const r = await q(SQL.insertProgress, [id, ...toRow(prog)]); if (r.rowCount === 1) return { ok: true, rev: r.rows[0].rev }; }
      else { const r = await q(SQL.updateProgress, [id, baseRev, ...toRow(prog)]); if (r.rowCount === 1) return { ok: true, rev: r.rows[0].rev }; }
      return { ok: false, conflict: true, current: await store.getProgress(id) };
    }
  };
  return store;
}

/* Importa contas antigas (arquivo data/users.json e/ou tabela sl_users do Supabase) para o Postgres. Idempotente: nunca sobrescreve nem apaga. */
async function migrateLegacy(ENV, log, store) {
  const fs = require('fs'), path = require('path'); let moved = 0;
  const add = async u => { if (u && u.id && u.name && u.pw && (await store.create(u.id, u))) { moved++; await store.put(u.id, u).catch(() => {}); if (u.prog && u.prog.progress) await store.putProgress(u.id, u.prog.progress, 0).catch(() => {}); } };
  try { const f = path.resolve(ENV.DATA_DIR || path.join(__dirname, '..', 'data'), 'users.json'); if (fs.existsSync(f)) for (const u of Object.values(JSON.parse(fs.readFileSync(f, 'utf8')))) await add(u); } catch (e) { log('migração (arquivo):', e.message); }
  if (ENV.SUPABASE_URL && ENV.SUPABASE_KEY) {
    try {
      const H = { apikey: ENV.SUPABASE_KEY, authorization: 'Bearer ' + ENV.SUPABASE_KEY };
      const r = await fetch(ENV.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/sl_users?select=id,data', { headers: H });
      if (r.ok) for (const row of await r.json()) await add(row.data); else log('migração (Supabase): HTTP ' + r.status);
    } catch (e) { log('migração (Supabase):', e.message); }
  }
  if (moved) log('migração: ' + moved + ' conta(s) antiga(s) copiada(s) para o Postgres');
}

module.exports = { connect, SQL, SCHEMA };
