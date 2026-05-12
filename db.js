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
    id           SERIAL PRIMARY KEY,
    unidade      VARCHAR(50)  NOT NULL,
    nome_completo VARCHAR(200) NOT NULL,
    cpf          VARCHAR(11)  NOT NULL,
    cargo        VARCHAR(150) NOT NULL,
    funcao       VARCHAR(150) NOT NULL,
    urls         TEXT[]       NOT NULL,
    justificativa TEXT        NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_firewall_requests_created_at
    ON firewall_requests (created_at DESC);
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
      (unidade, nome_completo, cpf, cargo, funcao, urls, justificativa)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, created_at
  `;
  const params = [
    data.unidade,
    data.nome_completo,
    data.cpf,
    data.cargo,
    data.funcao,
    data.urls,
    data.justificativa,
  ];
  const { rows } = await pool.query(sql, params);
  return rows[0];
}

module.exports = { pool, initDb, insertRequest };
