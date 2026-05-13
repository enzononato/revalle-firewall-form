const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('[db] DATABASE_URL nao definida. Configure a variavel de ambiente.');
  process.exit(1);
}

const useSsl = String(process.env.PGSSL || '').toLowerCase() === 'true';

const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('[db] erro inesperado no pool do Postgres:', err);
});

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS firewall_requests (
    id                SERIAL PRIMARY KEY,
    unidade           VARCHAR(50)  NOT NULL,
    nome_completo     VARCHAR(200) NOT NULL,
    cpf               VARCHAR(11)  NOT NULL,
    cargo             VARCHAR(150) NOT NULL,
    setor             VARCHAR(50)  NOT NULL DEFAULT '',
    funcao            VARCHAR(150) NOT NULL,
    email             VARCHAR(200) NOT NULL DEFAULT '',
    urls              TEXT[]       NOT NULL,
    justificativa     TEXT         NOT NULL DEFAULT '',
    status            VARCHAR(20)  NOT NULL DEFAULT 'pending',
    token             VARCHAR(64)  NOT NULL DEFAULT '',
    motivo_reprovacao TEXT         DEFAULT NULL,
    resolved_at       TIMESTAMPTZ  DEFAULT NULL,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_firewall_requests_created_at
    ON firewall_requests (created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_firewall_requests_token
    ON firewall_requests (token) WHERE token <> '';
  ALTER TABLE firewall_requests ADD COLUMN IF NOT EXISTS setor             VARCHAR(50)  NOT NULL DEFAULT '';
  ALTER TABLE firewall_requests ADD COLUMN IF NOT EXISTS email             VARCHAR(200) NOT NULL DEFAULT '';
  ALTER TABLE firewall_requests ADD COLUMN IF NOT EXISTS status            VARCHAR(20)  NOT NULL DEFAULT 'pending';
  ALTER TABLE firewall_requests ADD COLUMN IF NOT EXISTS token             VARCHAR(64)  NOT NULL DEFAULT '';
  ALTER TABLE firewall_requests ADD COLUMN IF NOT EXISTS motivo_reprovacao TEXT         DEFAULT NULL;
  ALTER TABLE firewall_requests ADD COLUMN IF NOT EXISTS resolved_at       TIMESTAMPTZ  DEFAULT NULL;
  ALTER TABLE firewall_requests ALTER COLUMN justificativa SET DEFAULT '';
`;

async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(CREATE_TABLE_SQL);
    console.log('[db] tabela firewall_requests pronta');
  } finally {
    client.release();
  }
}

async function insertRequest(data) {
  const sql = `
    INSERT INTO firewall_requests
      (unidade, nome_completo, cpf, cargo, setor, funcao, email, urls, justificativa, status, token)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10)
    RETURNING id, created_at
  `;
  const params = [
    data.unidade,
    data.nome_completo,
    data.cpf,
    data.cargo,
    data.setor,
    data.funcao,
    data.email,
    data.urls,
    data.justificativa,
    data.token,
  ];
  const { rows } = await pool.query(sql, params);
  return rows[0];
}

async function findRequestByToken(token) {
  const { rows } = await pool.query(
    'SELECT * FROM firewall_requests WHERE token = $1 LIMIT 1',
    [token]
  );
  return rows[0] || null;
}

async function approveRequest(id) {
  await pool.query(
    `UPDATE firewall_requests
     SET status = 'approved', resolved_at = NOW()
     WHERE id = $1`,
    [id]
  );
}

async function rejectRequest(id, motivo) {
  await pool.query(
    `UPDATE firewall_requests
     SET status = 'rejected', motivo_reprovacao = $2, resolved_at = NOW()
     WHERE id = $1`,
    [id, motivo || null]
  );
}

module.exports = { pool, initDb, insertRequest, findRequestByToken, approveRequest, rejectRequest };
