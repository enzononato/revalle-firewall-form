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

    // ── solides_treinamento_assinaturas ────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS solides_treinamento_assinaturas (
        id             SERIAL PRIMARY KEY,
        cpf            VARCHAR(11) UNIQUE NOT NULL,
        nome_completo  VARCHAR(200) NOT NULL,
        cargo          VARCHAR(150) NOT NULL DEFAULT '',
        setor          VARCHAR(100) NOT NULL DEFAULT '',
        unidade        VARCHAR(100) NOT NULL DEFAULT '',
        assinado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ip             VARCHAR(45) DEFAULT NULL,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_solides_assinaturas_cpf ON solides_treinamento_assinaturas (cpf)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_solides_assinaturas_data ON solides_treinamento_assinaturas (assinado_em DESC)`);

    // ── solides_treinamento_permissoes ─────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS solides_treinamento_permissoes (
        cpf           VARCHAR(11) PRIMARY KEY,
        permitido     BOOLEAN NOT NULL DEFAULT TRUE,
        permitido_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_solides_perm_cpf ON solides_treinamento_permissoes (cpf)`);

    console.log('[db] tabelas solides_treinamento_assinaturas e solides_treinamento_permissoes prontas');
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
 * Treinamento Sólides — Gestão de Ponto (Tabela de colaboradores: "colaboradores-revalle")
 * ────────────────────────────────────────────────────────────────────────── */

let cachedColabTable = null;
let cachedColabSchema = null;

async function getColaboradoresTableName() {
  if (cachedColabTable) return cachedColabTable;
  try {
    const { rows } = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `);
    const matches = rows.map((r) => r.table_name);
    console.log('[db] tabelas publicas encontradas no banco:', matches);

    const exactMatch = matches.find((m) =>
      ['colaboradores-revalle', 'colaboradores_revalle', 'colaboradoresrevalle', 'colaboradores'].includes(m.toLowerCase())
    );

    if (exactMatch) {
      cachedColabTable = `"${exactMatch}"`;
      return cachedColabTable;
    }

    const partialMatch = matches.find((m) =>
      m.toLowerCase().includes('colaborador') || (m.toLowerCase().includes('revalle') && !m.includes('firewall') && !m.includes('tess'))
    );

    if (partialMatch) {
      cachedColabTable = `"${partialMatch}"`;
      return cachedColabTable;
    }
  } catch (err) {
    console.warn('[db] erro ao consultar information_schema para tabela de colaboradores:', err.message);
  }
  cachedColabTable = '"colaboradores-revalle"';
  return cachedColabTable;
}

async function getColaboradorTableSchema() {
  if (cachedColabSchema) return cachedColabSchema;

  const table = await getColaboradoresTableName();
  const rawTableName = table.replace(/"/g, '');

  try {
    const { rows } = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
    `, [rawTableName]);

    const colNames = rows.map((r) => r.column_name);
    console.log(`[db] colunas encontradas na tabela ${rawTableName}:`, colNames);

    const findCol = (candidates) => {
      for (const cand of candidates) {
        const found = colNames.find((c) => c.toLowerCase() === cand.toLowerCase());
        if (found) return found;
      }
      return null;
    };

    const cpfCol = findCol(['cpf', 'nr_cpf', 'cpf_cnpj', 'documento', 'doc', 'nu_cpf']);
    const nomeCol = findCol(['nome_completo', 'nome', 'colaborador', 'nome_funcionario', 'funcionario', 'name', 'nom_funcionario']);
    const cargoCol = findCol(['cargo', 'funcao', 'cargo_funcao', 'role', 'posicao', 'cargo_descricao', 'des_funcao']);
    const setorCol = findCol(['setor', 'departamento', 'area', 'department', 'secao', 'lotacao', 'des_setor']);
    const unidadeCol = findCol(['unidade', 'revenda', 'filial', 'empresa', 'unit', 'loja', 'des_unidade']);

    cachedColabSchema = {
      table,
      rawTableName,
      cpfCol,
      nomeCol,
      cargoCol,
      setorCol,
      unidadeCol,
    };
    return cachedColabSchema;
  } catch (err) {
    console.error('[db] erro ao inspecionar colunas:', err.message);
    cachedColabSchema = {
      table,
      rawTableName,
      cpfCol: 'cpf',
      nomeCol: 'nome_completo',
      cargoCol: 'cargo',
      setorCol: 'setor',
      unidadeCol: 'unidade',
    };
    return cachedColabSchema;
  }
}

function mapColaboradorRow(row, schema) {
  if (!row) return null;
  const cpfVal = schema && schema.cpfCol ? row[schema.cpfCol] : (row.cpf || row.nr_cpf || row.documento || '');
  const nomeVal = schema && schema.nomeCol ? row[schema.nomeCol] : (row.nome_completo || row.nome || row.colaborador || row.nome_funcionario || row.name || '');
  const cargoVal = schema && schema.cargoCol ? row[schema.cargoCol] : (row.cargo || row.funcao || row.cargo_funcao || '');
  const setorVal = schema && schema.setorCol ? row[schema.setorCol] : (row.setor || row.departamento || row.area || '');
  const unidadeVal = schema && schema.unidadeCol ? row[schema.unidadeCol] : (row.unidade || row.revenda || row.filial || row.empresa || '');

  return {
    cpf: String(cpfVal || '').replace(/\D+/g, ''),
    nome_completo: String(nomeVal || '').trim(),
    cargo: String(cargoVal || '').trim(),
    setor: String(setorVal || '').trim(),
    unidade: String(unidadeVal || '').trim(),
  };
}

async function findSolidesColaboradorByCpf(cpf) {
  const digits = String(cpf || '').replace(/\D+/g, '');
  if (!digits || digits.length !== 11) return null;

  const schema = await getColaboradorTableSchema();
  const table = schema.table;
  const cpfCol = schema.cpfCol ? `"${schema.cpfCol}"` : 'cpf';

  let colabRow = null;

  try {
    const { rows } = await pool.query(
      `SELECT * FROM ${table}
       WHERE regexp_replace(${cpfCol}::text, '\\D', '', 'g') = $1
          OR ${cpfCol}::text = $1
       LIMIT 1`,
      [digits]
    );
    colabRow = rows[0] || null;
  } catch (err) {
    console.error(`[db] erro ao consultar colaborador em ${table}:`, err.message);
    try {
      const { rows } = await pool.query(
        `SELECT * FROM ${table} WHERE ${cpfCol}::text LIKE $1 LIMIT 1`,
        [`%${digits}%`]
      );
      colabRow = rows[0] || null;
    } catch (e2) {
      console.error('[db] erro fallback:', e2.message);
    }
  }

  if (!colabRow) return null;

  const mapped = mapColaboradorRow(colabRow, schema);

  // Consulta se tem permissão e se já assinou
  const [sigRes, permRes] = await Promise.all([
    pool.query(`SELECT id, assinado_em, ip FROM solides_treinamento_assinaturas WHERE cpf = $1 LIMIT 1`, [digits]),
    pool.query(`SELECT permitido FROM solides_treinamento_permissoes WHERE cpf = $1 LIMIT 1`, [digits]),
  ]);

  const sig = sigRes.rows[0] || null;
  const perm = permRes.rows[0];
  const permitido = perm ? Boolean(perm.permitido) : false;

  return {
    ...mapped,
    id: sig ? sig.id : null,
    assinado: Boolean(sig),
    assinado_em: sig ? sig.assinado_em : null,
    protocolo: sig ? '#TS-' + String(sig.id).padStart(5, '0') : null,
    permitido,
  };
}

async function toggleSolidesPermissao(cpf, permitido) {
  const digits = String(cpf || '').replace(/\D+/g, '');
  if (!digits) return null;

  const { rows } = await pool.query(
    `INSERT INTO solides_treinamento_permissoes (cpf, permitido, permitido_em)
     VALUES ($1, $2, NOW())
     ON CONFLICT (cpf) DO UPDATE SET
       permitido = EXCLUDED.permitido,
       permitido_em = NOW()
     RETURNING cpf, permitido, permitido_em`,
    [digits, Boolean(permitido)]
  );
  return rows[0] || null;
}

async function bulkSetSolidesPermissoes(cpfs, permitido) {
  if (!Array.isArray(cpfs) || !cpfs.length) return { count: 0 };
  const cleanCpfs = cpfs.map((c) => String(c || '').replace(/\D+/g, '')).filter((c) => c.length === 11);
  if (!cleanCpfs.length) return { count: 0 };

  const { rowCount } = await pool.query(
    `INSERT INTO solides_treinamento_permissoes (cpf, permitido, permitido_em)
     SELECT unnest($1::text[]), $2, NOW()
     ON CONFLICT (cpf) DO UPDATE SET
       permitido = EXCLUDED.permitido,
       permitido_em = NOW()`,
    [cleanCpfs, Boolean(permitido)]
  );
  return { count: rowCount };
}

async function assinarTermoSolides(cpf, ip = '') {
  const digits = String(cpf || '').replace(/\D+/g, '');
  if (!digits) return null;

  const colab = await findSolidesColaboradorByCpf(digits);
  if (!colab) return null;
  if (!colab.permitido) {
    throw new Error('Colaborador não está habilitado para responder ao treinamento.');
  }

  const { rows } = await pool.query(
    `INSERT INTO solides_treinamento_assinaturas
       (cpf, nome_completo, cargo, setor, unidade, assinado_em, ip)
     VALUES ($1, $2, $3, $4, $5, NOW(), $6)
     ON CONFLICT (cpf) DO UPDATE SET
       assinado_em = EXCLUDED.assinado_em,
       ip = EXCLUDED.ip
     RETURNING id, cpf, nome_completo, cargo, setor, unidade, assinado_em`,
    [digits, colab.nome_completo, colab.cargo, colab.setor, colab.unidade, ip]
  );

  return rows[0] ? { ...rows[0], assinado: true } : null;
}

async function listSolidesColaboradores(filters = {}) {
  const schema = await getColaboradorTableSchema();
  const table = schema.table;
  const cpfExpr = schema.cpfCol ? `regexp_replace(c."${schema.cpfCol}"::text, '\\D', '', 'g')` : `c.cpf::text`;

  const conds = [];
  const params = [];
  const add = (val) => { params.push(val); return `$${params.length}`; };

  if (filters.status === 'permitido') {
    conds.push(`COALESCE(p.permitido, FALSE) = TRUE`);
  } else if (filters.status === 'nao_permitido') {
    conds.push(`COALESCE(p.permitido, FALSE) = FALSE`);
  } else if (filters.status === 'assinado') {
    conds.push(`s.id IS NOT NULL`);
  } else if (filters.status === 'pendente') {
    conds.push(`s.id IS NULL AND COALESCE(p.permitido, FALSE) = TRUE`);
  }

  if (filters.setor && schema.setorCol) {
    conds.push(`c."${schema.setorCol}" = ${add(filters.setor)}`);
  }
  if (filters.unidade && schema.unidadeCol) {
    conds.push(`c."${schema.unidadeCol}" = ${add(filters.unidade)}`);
  }

  if (filters.search) {
    const term = `%${filters.search.toLowerCase()}%`;
    const p = add(term);
    const searchParts = [];
    if (schema.nomeCol) searchParts.push(`LOWER(c."${schema.nomeCol}"::text) LIKE ${p}`);
    if (schema.cpfCol) searchParts.push(`regexp_replace(c."${schema.cpfCol}"::text, '\\D', '', 'g') LIKE ${p}`);
    if (schema.cargoCol) searchParts.push(`LOWER(c."${schema.cargoCol}"::text) LIKE ${p}`);
    if (schema.setorCol) searchParts.push(`LOWER(c."${schema.setorCol}"::text) LIKE ${p}`);

    if (searchParts.length > 0) {
      conds.push(`(${searchParts.join(' OR ')})`);
    }
  }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const limit = Math.min(Math.max(Number(filters.limit) || 25, 1), 500);
  const offset = Math.max(Number(filters.offset) || 0, 0);

  const dataParams = params.slice();
  dataParams.push(limit); const limIdx = dataParams.length;
  dataParams.push(offset); const offIdx = dataParams.length;

  const orderExpr = schema.nomeCol ? `c."${schema.nomeCol}" ASC` : `c.ctid ASC`;

  const dataSql = `
    SELECT
      c.*,
      s.id AS assinatura_id,
      s.assinado_em,
      s.ip,
      (s.id IS NOT NULL) AS assinado,
      COALESCE(p.permitido, FALSE) AS permitido
    FROM ${table} c
    LEFT JOIN solides_treinamento_permissoes p
      ON ${cpfExpr} = p.cpf
    LEFT JOIN solides_treinamento_assinaturas s
      ON ${cpfExpr} = s.cpf
    ${where}
    ORDER BY
      CASE WHEN COALESCE(p.permitido, FALSE) = TRUE AND s.id IS NULL THEN 0
           WHEN COALESCE(p.permitido, FALSE) = TRUE AND s.id IS NOT NULL THEN 1
           ELSE 2 END,
      ${orderExpr}
    LIMIT $${limIdx} OFFSET $${offIdx}
  `;

  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM ${table} c
    LEFT JOIN solides_treinamento_permissoes p
      ON ${cpfExpr} = p.cpf
    LEFT JOIN solides_treinamento_assinaturas s
      ON ${cpfExpr} = s.cpf
    ${where}
  `;

  try {
    const [dataRes, countRes] = await Promise.all([
      pool.query(dataSql, dataParams),
      pool.query(countSql, params),
    ]);

    const formattedRows = dataRes.rows.map((row) => {
      const mapped = mapColaboradorRow(row, schema);
      return {
        id: row.assinatura_id || row.id || null,
        cpf: mapped.cpf,
        nome_completo: mapped.nome_completo,
        cargo: mapped.cargo,
        setor: mapped.setor,
        unidade: mapped.unidade,
        permitido: Boolean(row.permitido),
        assinado: Boolean(row.assinado),
        assinado_em: row.assinado_em,
        ip: row.ip,
      };
    });

    return { rows: formattedRows, total: countRes.rows[0].total };
  } catch (err) {
    console.error(`[db] erro ao listar colaboradores de ${table}:`, err);
    return { rows: [], total: 0 };
  }
}

async function getSolidesStats() {
  const schema = await getColaboradorTableSchema();
  const table = schema.table;
  const cpfExpr = schema.cpfCol ? `regexp_replace(c."${schema.cpfCol}"::text, '\\D', '', 'g')` : `c.cpf::text`;

  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(c.*)::int AS total_base,
        COUNT(c.*) FILTER (WHERE COALESCE(p.permitido, FALSE) = TRUE)::int AS total_permitidos,
        COUNT(s.id)::int AS assinados,
        COUNT(c.*) FILTER (WHERE COALESCE(p.permitido, FALSE) = TRUE AND s.id IS NULL)::int AS pendentes,
        CASE
          WHEN COUNT(c.*) FILTER (WHERE COALESCE(p.permitido, FALSE) = TRUE) > 0
          THEN ROUND((COUNT(s.id)::numeric / COUNT(c.*) FILTER (WHERE COALESCE(p.permitido, FALSE) = TRUE)::numeric) * 100, 1)
          ELSE 0
        END::float AS taxa_adesao
      FROM ${table} c
      LEFT JOIN solides_treinamento_permissoes p
        ON ${cpfExpr} = p.cpf
      LEFT JOIN solides_treinamento_assinaturas s
        ON ${cpfExpr} = s.cpf
    `);
    return rows[0] || { total_base: 0, total_permitidos: 0, assinados: 0, pendentes: 0, taxa_adesao: 0 };
  } catch (err) {
    console.error(`[db] erro ao calcular estatisticas de ${table}:`, err);
    const fallbackRes = await pool.query(`SELECT COUNT(*)::int AS assinados FROM solides_treinamento_assinaturas`).catch(() => ({ rows: [{ assinados: 0 }] }));
    const assinados = fallbackRes.rows[0] ? fallbackRes.rows[0].assinados : 0;
    return { total_base: assinados, total_permitidos: assinados, assinados, pendentes: 0, taxa_adesao: 100 };
  }
}

module.exports = {
  pool, initDb, insertRequest, findRequestByToken, approveRequest, rejectRequest,
  insertContract, findContractByIdAndToken,
  // imersao tess
  insertImersaoTessRequest, listImersaoTessRequests, getImersaoTessStats,
  // treinamento solides
  findSolidesColaboradorByCpf, assinarTermoSolides, listSolidesColaboradores, getSolidesStats,
  toggleSolidesPermissao, bulkSetSolidesPermissoes,
  // dashboard
  findRequestById, listFirewallRequests, getFirewallStats,
  listContracts, getContractById, listContractFiles, getContractFileById, getContractStats,
};

