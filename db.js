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

async function initDb() {
  const client = await pool.connect();
  try {
    // 1. Cria a tabela se nao existir (instalacao nova)
    await client.query(`
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
      )
    `);

    // 2. Adiciona colunas que podem nao existir em tabelas antigas
    await client.query(`ALTER TABLE firewall_requests ADD COLUMN IF NOT EXISTS setor             VARCHAR(50)  NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE firewall_requests ADD COLUMN IF NOT EXISTS email             VARCHAR(200) NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE firewall_requests ADD COLUMN IF NOT EXISTS status            VARCHAR(20)  NOT NULL DEFAULT 'pending'`);
    await client.query(`ALTER TABLE firewall_requests ADD COLUMN IF NOT EXISTS token             VARCHAR(64)  NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE firewall_requests ADD COLUMN IF NOT EXISTS motivo_reprovacao TEXT         DEFAULT NULL`);
    await client.query(`ALTER TABLE firewall_requests ADD COLUMN IF NOT EXISTS resolved_at       TIMESTAMPTZ  DEFAULT NULL`);
    await client.query(`ALTER TABLE firewall_requests ALTER COLUMN justificativa SET DEFAULT ''`);

    // 3. Cria indices apos garantir que as colunas existem
    await client.query(`CREATE INDEX IF NOT EXISTS idx_firewall_requests_created_at ON firewall_requests (created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_firewall_requests_token ON firewall_requests (token) WHERE token <> ''`);

    console.log('[db] tabela firewall_requests pronta');

    // ── contract_requests ──────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS contract_requests (
        id              SERIAL PRIMARY KEY,
        revenda         VARCHAR(50)  NOT NULL,
        razao_social    VARCHAR(200) NOT NULL,
        cnpj            VARCHAR(14)  NOT NULL,
        pessoa_contato  VARCHAR(200) NOT NULL,
        telefone        VARCHAR(11)  NOT NULL,
        vigencia_inicio DATE         NOT NULL,
        vigencia_fim    DATE         DEFAULT NULL,
        dono_servico    VARCHAR(200) NOT NULL,
        setor           VARCHAR(50)  NOT NULL,
        arquivo_nome    VARCHAR(255) NOT NULL,
        arquivo_dados   BYTEA        NOT NULL,
        arquivo_token   VARCHAR(64)  NOT NULL DEFAULT '',
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_contract_requests_created_at ON contract_requests (created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_contract_requests_arquivo_token ON contract_requests (arquivo_token) WHERE arquivo_token <> ''`);

    // Migrações e tabelas para suportar múltiplos arquivos e revendas
    await client.query(`ALTER TABLE contract_requests ALTER COLUMN revenda TYPE VARCHAR(500)`);
    await client.query(`ALTER TABLE contract_requests ALTER COLUMN arquivo_nome DROP NOT NULL`);
    await client.query(`ALTER TABLE contract_requests ALTER COLUMN arquivo_dados DROP NOT NULL`);
    await client.query(`ALTER TABLE contract_requests ALTER COLUMN arquivo_token DROP NOT NULL`);

    // Criação da tabela contract_files
    await client.query(`
      CREATE TABLE IF NOT EXISTS contract_files (
        id              SERIAL PRIMARY KEY,
        contract_id     INTEGER REFERENCES contract_requests(id) ON DELETE CASCADE,
        arquivo_nome    VARCHAR(255) NOT NULL,
        arquivo_dados   BYTEA        NOT NULL,
        arquivo_token   VARCHAR(64)  NOT NULL DEFAULT '',
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_contract_files_contract_id ON contract_files (contract_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_contract_files_arquivo_token ON contract_files (arquivo_token) WHERE arquivo_token <> ''`);

    // Migração de arquivos antigos para a tabela contract_files
    await client.query(`
      INSERT INTO contract_files (contract_id, arquivo_nome, arquivo_dados, arquivo_token, created_at)
      SELECT id, arquivo_nome, arquivo_dados, arquivo_token, created_at
      FROM contract_requests r
      WHERE arquivo_nome IS NOT NULL AND arquivo_nome <> '' AND NOT EXISTS (
        SELECT 1 FROM contract_files f WHERE f.contract_id = r.id
      )
    `);

    console.log('[db] tabela contract_requests e contract_files prontas');
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

async function insertContract(data) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // We insert the contract request, using the first file's details for retrocompatibility
    const firstFile = data.arquivos[0];
    const sql = `
      INSERT INTO contract_requests
        (revenda, razao_social, cnpj, pessoa_contato, telefone,
         vigencia_inicio, vigencia_fim, dono_servico, setor,
         arquivo_nome, arquivo_dados, arquivo_token)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING id, created_at
    `;
    const params = [
      data.revenda, data.razao_social, data.cnpj, data.pessoa_contato, data.telefone,
      data.vigencia_inicio, data.vigencia_fim || null, data.dono_servico, data.setor,
      firstFile.nome, firstFile.dados, data.arquivos_tokens[0]
    ];
    const { rows } = await client.query(sql, params);
    const saved = rows[0];
    
    // Now we insert all files into contract_files
    const sqlFile = `
      INSERT INTO contract_files (contract_id, arquivo_nome, arquivo_dados, arquivo_token)
      VALUES ($1, $2, $3, $4)
    `;
    for (let i = 0; i < data.arquivos.length; i++) {
      const file = data.arquivos[i];
      const token = data.arquivos_tokens[i];
      await client.query(sqlFile, [saved.id, file.nome, file.dados, token]);
    }
    
    await client.query('COMMIT');
    return saved;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function findContractByIdAndToken(id, token) {
  const { rows } = await pool.query(
    'SELECT * FROM contract_files WHERE contract_id = $1 AND arquivo_token = $2 LIMIT 1',
    [id, token]
  );
  return rows[0] || null;
}

module.exports = { pool, initDb, insertRequest, findRequestByToken, approveRequest, rejectRequest, insertContract, findContractByIdAndToken };
