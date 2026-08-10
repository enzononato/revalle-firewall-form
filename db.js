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

    // ── imersao_tess_requests ──────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS imersao_tess_requests (
        id          SERIAL PRIMARY KEY,
        nome        VARCHAR(200) NOT NULL,
        email       VARCHAR(200) NOT NULL,
        telefone    VARCHAR(20)  NOT NULL,
        setor       VARCHAR(100) NOT NULL,
        revenda     VARCHAR(100) NOT NULL,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_imersao_tess_created_at ON imersao_tess_requests (created_at DESC)`);

    console.log('[db] tabela imersao_tess_requests pronta');

    // ── solides_treinamento_colaboradores ──────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS solides_treinamento_colaboradores (
        id             SERIAL PRIMARY KEY,
        cpf            VARCHAR(11) UNIQUE NOT NULL,
        nome_completo  VARCHAR(200) NOT NULL,
        cargo          VARCHAR(150) NOT NULL DEFAULT '',
        setor          VARCHAR(100) NOT NULL DEFAULT '',
        unidade        VARCHAR(100) NOT NULL DEFAULT '',
        assinado       BOOLEAN NOT NULL DEFAULT FALSE,
        assinado_em    TIMESTAMPTZ DEFAULT NULL,
        ip             VARCHAR(45) DEFAULT NULL,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_solides_colab_cpf ON solides_treinamento_colaboradores (cpf)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_solides_colab_assinado ON solides_treinamento_colaboradores (assinado)`);

    console.log('[db] tabela solides_treinamento_colaboradores pronta');
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

/* ──────────────────────────────────────────────────────────────────────────
 * Dashboard — consultas de leitura/agregacao (nao alteram o schema)
 * ────────────────────────────────────────────────────────────────────────── */

async function findRequestById(id) {
  const { rows } = await pool.query(
    'SELECT * FROM firewall_requests WHERE id = $1 LIMIT 1',
    [id]
  );
  return rows[0] || null;
}

/* Monta WHERE dinamico para as solicitacoes de firewall */
function buildFirewallWhere(filters = {}) {
  const conds = [];
  const params = [];
  const add = (val) => { params.push(val); return `$${params.length}`; };

  if (filters.status && ['pending', 'approved', 'rejected'].includes(filters.status)) {
    conds.push(`status = ${add(filters.status)}`);
  }
  if (filters.unidade) conds.push(`unidade = ${add(filters.unidade)}`);
  if (filters.setor) conds.push(`setor = ${add(filters.setor)}`);
  if (filters.from) conds.push(`created_at >= ${add(filters.from)}`);
  if (filters.to) conds.push(`created_at < (${add(filters.to)}::date + interval '1 day')`);
  if (filters.search) {
    const term = `%${filters.search.toLowerCase()}%`;
    const p = add(term);
    conds.push(`(LOWER(nome_completo) LIKE ${p} OR LOWER(email) LIKE ${p} OR cpf LIKE ${p} OR LOWER(cargo) LIKE ${p} OR LOWER(funcao) LIKE ${p})`);
  }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  return { where, params };
}

async function listFirewallRequests(filters = {}) {
  const { where, params } = buildFirewallWhere(filters);
  const limit = Math.min(Math.max(Number(filters.limit) || 25, 1), 200);
  const offset = Math.max(Number(filters.offset) || 0, 0);

  const dataParams = params.slice();
  dataParams.push(limit); const limIdx = dataParams.length;
  dataParams.push(offset); const offIdx = dataParams.length;

  const dataSql = `
    SELECT id, unidade, nome_completo, cpf, cargo, setor, funcao, email,
           urls, justificativa, status, motivo_reprovacao, resolved_at, created_at
    FROM firewall_requests
    ${where}
    ORDER BY
      CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
      created_at DESC
    LIMIT $${limIdx} OFFSET $${offIdx}
  `;
  const countSql = `SELECT COUNT(*)::int AS total FROM firewall_requests ${where}`;

  const [dataRes, countRes] = await Promise.all([
    pool.query(dataSql, dataParams),
    pool.query(countSql, params),
  ]);
  return { rows: dataRes.rows, total: countRes.rows[0].total };
}

async function getFirewallStats() {
  const [byStatus, byUnidade, bySetor, monthly, urlRows, kpis] = await Promise.all([
    pool.query(`SELECT status, COUNT(*)::int AS total FROM firewall_requests GROUP BY status`),
    pool.query(`SELECT unidade, COUNT(*)::int AS total FROM firewall_requests GROUP BY unidade ORDER BY total DESC`),
    pool.query(`SELECT setor, COUNT(*)::int AS total FROM firewall_requests WHERE setor <> '' GROUP BY setor ORDER BY total DESC`),
    pool.query(`
      SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, COUNT(*)::int AS total
      FROM firewall_requests
      WHERE created_at >= date_trunc('month', NOW()) - interval '11 months'
      GROUP BY 1 ORDER BY 1
    `),
    pool.query(`SELECT unnest(urls) AS url FROM firewall_requests`),
    pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'pending')::int  AS pending,
        COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
        COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW()))::int AS this_month
      FROM firewall_requests
    `),
  ]);

  // Top dominios (extrai hostname das URLs em JS)
  const domainCount = new Map();
  for (const r of urlRows.rows) {
    let host = '';
    try { host = new URL(r.url).hostname.replace(/^www\./, ''); }
    catch { host = String(r.url || '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]; }
    if (!host) continue;
    domainCount.set(host, (domainCount.get(host) || 0) + 1);
  }
  const topDomains = [...domainCount.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([domain, total]) => ({ domain, total }));

  return {
    kpis: kpis.rows[0],
    byStatus: byStatus.rows,
    byUnidade: byUnidade.rows,
    bySetor: bySetor.rows,
    monthly: monthly.rows,
    topDomains,
  };
}

/* Monta WHERE dinamico para contratos */
function buildContractWhere(filters = {}) {
  const conds = [];
  const params = [];
  const add = (val) => { params.push(val); return `$${params.length}`; };

  if (filters.setor) conds.push(`setor = ${add(filters.setor)}`);
  if (filters.revenda) conds.push(`revenda ILIKE ${add('%' + filters.revenda + '%')}`);
  if (filters.search) {
    const term = `%${filters.search.toLowerCase()}%`;
    const p = add(term);
    conds.push(`(LOWER(razao_social) LIKE ${p} OR cnpj LIKE ${p} OR LOWER(pessoa_contato) LIKE ${p} OR LOWER(dono_servico) LIKE ${p})`);
  }
  if (filters.vigencia === 'vencidos') {
    conds.push(`vigencia_fim IS NOT NULL AND vigencia_fim < CURRENT_DATE`);
  } else if (filters.vigencia === 'vence_30') {
    conds.push(`vigencia_fim IS NOT NULL AND vigencia_fim >= CURRENT_DATE AND vigencia_fim <= CURRENT_DATE + 30`);
  } else if (filters.vigencia === 'vence_90') {
    conds.push(`vigencia_fim IS NOT NULL AND vigencia_fim >= CURRENT_DATE AND vigencia_fim <= CURRENT_DATE + 90`);
  } else if (filters.vigencia === 'vigente') {
    conds.push(`(vigencia_fim IS NULL OR vigencia_fim >= CURRENT_DATE)`);
  } else if (filters.vigencia === 'sem_fim') {
    conds.push(`vigencia_fim IS NULL`);
  }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  return { where, params };
}

async function listContracts(filters = {}) {
  const { where, params } = buildContractWhere(filters);
  const limit = Math.min(Math.max(Number(filters.limit) || 25, 1), 200);
  const offset = Math.max(Number(filters.offset) || 0, 0);

  const dataParams = params.slice();
  dataParams.push(limit); const limIdx = dataParams.length;
  dataParams.push(offset); const offIdx = dataParams.length;

  const dataSql = `
    SELECT r.id, r.revenda, r.razao_social, r.cnpj, r.pessoa_contato, r.telefone,
           to_char(r.vigencia_inicio, 'YYYY-MM-DD') AS vigencia_inicio,
           to_char(r.vigencia_fim, 'YYYY-MM-DD')    AS vigencia_fim,
           (r.vigencia_fim - CURRENT_DATE)          AS dias_restantes,
           r.dono_servico, r.setor, r.created_at,
           (SELECT COUNT(*)::int FROM contract_files f WHERE f.contract_id = r.id) AS arquivos_count
    FROM contract_requests r
    ${where}
    ORDER BY r.created_at DESC
    LIMIT $${limIdx} OFFSET $${offIdx}
  `;
  const countSql = `SELECT COUNT(*)::int AS total FROM contract_requests r ${where}`;

  const [dataRes, countRes] = await Promise.all([
    pool.query(dataSql, dataParams),
    pool.query(countSql, params),
  ]);
  return { rows: dataRes.rows, total: countRes.rows[0].total };
}

async function getContractById(id) {
  const { rows } = await pool.query(
    `SELECT id, revenda, razao_social, cnpj, pessoa_contato, telefone,
            to_char(vigencia_inicio, 'YYYY-MM-DD') AS vigencia_inicio,
            to_char(vigencia_fim, 'YYYY-MM-DD')    AS vigencia_fim,
            (vigencia_fim - CURRENT_DATE)          AS dias_restantes,
            dono_servico, setor, created_at
     FROM contract_requests WHERE id = $1 LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function listContractFiles(contractId) {
  const { rows } = await pool.query(
    `SELECT id, arquivo_nome, created_at FROM contract_files WHERE contract_id = $1 ORDER BY id`,
    [contractId]
  );
  return rows;
}

async function getContractFileById(fileId) {
  const { rows } = await pool.query(
    `SELECT id, contract_id, arquivo_nome, arquivo_dados FROM contract_files WHERE id = $1 LIMIT 1`,
    [fileId]
  );
  return rows[0] || null;
}

async function getContractStats() {
  const [kpis, byRevenda, bySetor, monthly, upcoming] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE vigencia_fim IS NOT NULL AND vigencia_fim < CURRENT_DATE)::int AS vencidos,
        COUNT(*) FILTER (WHERE vigencia_fim IS NOT NULL AND vigencia_fim >= CURRENT_DATE AND vigencia_fim <= CURRENT_DATE + 30)::int AS vence_30,
        COUNT(*) FILTER (WHERE vigencia_fim IS NOT NULL AND vigencia_fim > CURRENT_DATE + 30 AND vigencia_fim <= CURRENT_DATE + 60)::int AS vence_60,
        COUNT(*) FILTER (WHERE vigencia_fim IS NOT NULL AND vigencia_fim > CURRENT_DATE + 60 AND vigencia_fim <= CURRENT_DATE + 90)::int AS vence_90,
        COUNT(*) FILTER (WHERE vigencia_fim IS NULL OR vigencia_fim > CURRENT_DATE + 90)::int AS vigente_long,
        COUNT(*) FILTER (WHERE vigencia_fim IS NULL)::int AS sem_fim
      FROM contract_requests
    `),
    pool.query(`
      SELECT TRIM(rev) AS revenda, COUNT(*)::int AS total
      FROM contract_requests, unnest(string_to_array(revenda, ',')) AS rev
      WHERE TRIM(rev) <> ''
      GROUP BY 1 ORDER BY total DESC
    `),
    pool.query(`SELECT setor, COUNT(*)::int AS total FROM contract_requests WHERE setor <> '' GROUP BY setor ORDER BY total DESC`),
    pool.query(`
      SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, COUNT(*)::int AS total
      FROM contract_requests
      WHERE created_at >= date_trunc('month', NOW()) - interval '11 months'
      GROUP BY 1 ORDER BY 1
    `),
    pool.query(`
      SELECT id, revenda, razao_social,
             to_char(vigencia_fim, 'YYYY-MM-DD') AS vigencia_fim,
             (vigencia_fim - CURRENT_DATE)       AS dias_restantes
      FROM contract_requests
      WHERE vigencia_fim IS NOT NULL AND vigencia_fim <= CURRENT_DATE + 90
      ORDER BY vigencia_fim ASC
      LIMIT 15
    `),
  ]);

  return {
    kpis: kpis.rows[0],
    byRevenda: byRevenda.rows,
    bySetor: bySetor.rows,
    monthly: monthly.rows,
    upcoming: upcoming.rows,
  };
}

async function insertImersaoTessRequest(data) {
  const sql = `
    INSERT INTO imersao_tess_requests (nome, email, telefone, setor, revenda)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, created_at
  `;
  const params = [
    data.nome,
    data.email,
    data.telefone,
    data.setor,
    data.revenda,
  ];
  const { rows } = await pool.query(sql, params);
  return rows[0];
}

async function listImersaoTessRequests(filters = {}) {
  const conds = [];
  const params = [];
  const add = (val) => { params.push(val); return `$${params.length}`; };

  if (filters.setor) conds.push(`setor = ${add(filters.setor)}`);
  if (filters.revenda) conds.push(`revenda ILIKE ${add('%' + filters.revenda + '%')}`);
  if (filters.search) {
    const term = `%${filters.search.toLowerCase()}%`;
    const p = add(term);
    conds.push(`(LOWER(nome) LIKE ${p} OR LOWER(email) LIKE ${p} OR telefone LIKE ${p})`);
  }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const limit = Math.min(Math.max(Number(filters.limit) || 25, 1), 500);
  const offset = Math.max(Number(filters.offset) || 0, 0);

  const dataParams = params.slice();
  dataParams.push(limit); const limIdx = dataParams.length;
  dataParams.push(offset); const offIdx = dataParams.length;

  const dataSql = `
    SELECT id, nome, email, telefone, setor, revenda, created_at
    FROM imersao_tess_requests
    ${where}
    ORDER BY created_at DESC
    LIMIT $${limIdx} OFFSET $${offIdx}
  `;
  const countSql = `SELECT COUNT(*)::int AS total FROM imersao_tess_requests ${where}`;

  const [dataRes, countRes] = await Promise.all([
    pool.query(dataSql, dataParams),
    pool.query(countSql, params),
  ]);
  return { rows: dataRes.rows, total: countRes.rows[0].total };
}

async function getImersaoTessStats() {
  const [kpis, byRevenda, bySetor, monthly] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW()))::int AS this_month
      FROM imersao_tess_requests
    `),
    pool.query(`SELECT revenda, COUNT(*)::int AS total FROM imersao_tess_requests WHERE revenda <> '' GROUP BY revenda ORDER BY total DESC`),
    pool.query(`SELECT setor, COUNT(*)::int AS total FROM imersao_tess_requests WHERE setor <> '' GROUP BY setor ORDER BY total DESC`),
    pool.query(`
      SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, COUNT(*)::int AS total
      FROM imersao_tess_requests
      WHERE created_at >= date_trunc('month', NOW()) - interval '11 months'
      GROUP BY 1 ORDER BY 1
    `),
  ]);

  return {
    kpis: kpis.rows[0],
    byRevenda: byRevenda.rows,
    bySetor: bySetor.rows,
    monthly: monthly.rows,
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Treinamento Sólides — Gestão de Ponto
 * ────────────────────────────────────────────────────────────────────────── */

async function findSolidesColaboradorByCpf(cpf) {
  const { rows } = await pool.query(
    `SELECT id, cpf, nome_completo, cargo, setor, unidade, assinado, assinado_em, created_at
     FROM solides_treinamento_colaboradores
     WHERE cpf = $1 LIMIT 1`,
    [cpf]
  );
  return rows[0] || null;
}

async function assinarTermoSolides(cpf, ip = '') {
  const { rows } = await pool.query(
    `UPDATE solides_treinamento_colaboradores
     SET assinado = TRUE, assinado_em = NOW(), ip = $2
     WHERE cpf = $1 AND assinado = FALSE
     RETURNING id, cpf, nome_completo, cargo, setor, unidade, assinado, assinado_em`,
    [cpf, ip]
  );
  return rows[0] || null;
}

async function listSolidesColaboradores(filters = {}) {
  const conds = [];
  const params = [];
  const add = (val) => { params.push(val); return `$${params.length}`; };

  if (filters.status === 'assinado') conds.push(`assinado = TRUE`);
  else if (filters.status === 'pendente') conds.push(`assinado = FALSE`);

  if (filters.setor) conds.push(`setor = ${add(filters.setor)}`);
  if (filters.unidade) conds.push(`unidade = ${add(filters.unidade)}`);

  if (filters.search) {
    const term = `%${filters.search.toLowerCase()}%`;
    const p = add(term);
    conds.push(`(LOWER(nome_completo) LIKE ${p} OR cpf LIKE ${p} OR LOWER(cargo) LIKE ${p} OR LOWER(setor) LIKE ${p})`);
  }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const limit = Math.min(Math.max(Number(filters.limit) || 25, 1), 500);
  const offset = Math.max(Number(filters.offset) || 0, 0);

  const dataParams = params.slice();
  dataParams.push(limit); const limIdx = dataParams.length;
  dataParams.push(offset); const offIdx = dataParams.length;

  const dataSql = `
    SELECT id, cpf, nome_completo, cargo, setor, unidade, assinado, assinado_em, ip, created_at
    FROM solides_treinamento_colaboradores
    ${where}
    ORDER BY
      CASE WHEN assinado = FALSE THEN 0 ELSE 1 END,
      nome_completo ASC
    LIMIT $${limIdx} OFFSET $${offIdx}
  `;
  const countSql = `SELECT COUNT(*)::int AS total FROM solides_treinamento_colaboradores ${where}`;

  const [dataRes, countRes] = await Promise.all([
    pool.query(dataSql, dataParams),
    pool.query(countSql, params),
  ]);
  return { rows: dataRes.rows, total: countRes.rows[0].total };
}

async function getSolidesStats() {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE assinado = TRUE)::int AS assinados,
      COUNT(*) FILTER (WHERE assinado = FALSE)::int AS pendentes,
      CASE
        WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE assinado = TRUE)::numeric / COUNT(*)::numeric) * 100, 1)
        ELSE 0
      END::float AS taxa_adesao
    FROM solides_treinamento_colaboradores
  `);
  return rows[0] || { total: 0, assinados: 0, pendentes: 0, taxa_adesao: 0 };
}

async function upsertSolidesColaborador(data) {
  const sql = `
    INSERT INTO solides_treinamento_colaboradores (cpf, nome_completo, cargo, setor, unidade)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (cpf) DO UPDATE SET
      nome_completo = EXCLUDED.nome_completo,
      cargo = CASE WHEN EXCLUDED.cargo <> '' THEN EXCLUDED.cargo ELSE solides_treinamento_colaboradores.cargo END,
      setor = CASE WHEN EXCLUDED.setor <> '' THEN EXCLUDED.setor ELSE solides_treinamento_colaboradores.setor END,
      unidade = CASE WHEN EXCLUDED.unidade <> '' THEN EXCLUDED.unidade ELSE solides_treinamento_colaboradores.unidade END
    RETURNING id, cpf, nome_completo, cargo, setor, unidade, assinado, assinado_em
  `;
  const { rows } = await pool.query(sql, [
    data.cpf,
    data.nome_completo,
    data.cargo || '',
    data.setor || '',
    data.unidade || '',
  ]);
  return rows[0];
}

async function bulkUpsertSolidesColaboradores(colaboradores) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let inserted = 0;
    for (const c of colaboradores) {
      if (!c.cpf || !c.nome_completo) continue;
      const digits = String(c.cpf).replace(/\D+/g, '');
      if (digits.length !== 11) continue;
      await client.query(`
        INSERT INTO solides_treinamento_colaboradores (cpf, nome_completo, cargo, setor, unidade)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (cpf) DO UPDATE SET
          nome_completo = EXCLUDED.nome_completo,
          cargo = CASE WHEN EXCLUDED.cargo <> '' THEN EXCLUDED.cargo ELSE solides_treinamento_colaboradores.cargo END,
          setor = CASE WHEN EXCLUDED.setor <> '' THEN EXCLUDED.setor ELSE solides_treinamento_colaboradores.setor END,
          unidade = CASE WHEN EXCLUDED.unidade <> '' THEN EXCLUDED.unidade ELSE solides_treinamento_colaboradores.unidade END
      `, [digits, c.nome_completo.trim(), (c.cargo || '').trim(), (c.setor || '').trim(), (c.unidade || '').trim()]);
      inserted++;
    }
    await client.query('COMMIT');
    return { count: inserted };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  pool, initDb, insertRequest, findRequestByToken, approveRequest, rejectRequest,
  insertContract, findContractByIdAndToken,
  // imersao tess
  insertImersaoTessRequest, listImersaoTessRequests, getImersaoTessStats,
  // treinamento solides
  findSolidesColaboradorByCpf, assinarTermoSolides, listSolidesColaboradores,
  getSolidesStats, upsertSolidesColaborador, bulkUpsertSolidesColaboradores,
  // dashboard
  findRequestById, listFirewallRequests, getFirewallStats,
  listContracts, getContractById, listContractFiles, getContractFileById, getContractStats,
};

