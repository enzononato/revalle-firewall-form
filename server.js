const path = require('path');
const express = require('express');
const { initDb, insertRequest } = require('./db');
const { sendRequestEmail } = require('./mailer');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const UNIDADES_VALIDAS = [
  'Revalle Juazeiro',
  'Revalle Petrolina',
  'Revalle Paulo Afonso',
  'Revalle Serrinha',
  'Revalle Alagoinhas',
  'Revalle Ribeira do Pombal',
  'Revalle Bonfim',
];

const SETORES_VALIDOS = [
  '101 - Puxada',
  '201 - Armazem',
  '301 - ADM',
  '401 - Vendas',
  '501 - Entrega',
  '701 - Jovem Aprendiz',
  '801 - ADM - CSC',
  '802 - Vendas - CSC',
  '803 - Entrega - CSC',
];

const MAX_URLS = 20;

app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public')));

function onlyDigits(s) {
  return String(s || '').replace(/\D+/g, '');
}

function isValidCpf(cpf) {
  const digits = onlyDigits(cpf);
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const calcCheck = (base, factor) => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) {
      sum += Number(base[i]) * (factor - i);
    }
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };

  const d1 = calcCheck(digits.slice(0, 9), 10);
  if (d1 !== Number(digits[9])) return false;
  const d2 = calcCheck(digits.slice(0, 10), 11);
  if (d2 !== Number(digits[10])) return false;
  return true;
}

function isValidUrl(s) {
  if (typeof s !== 'string') return false;
  let value = s.trim();
  if (!value) return false;
  if (!/^https?:\/\//i.test(value)) value = 'http://' + value;
  try {
    const u = new URL(value);
    return Boolean(u.hostname) && u.hostname.includes('.');
  } catch {
    return false;
  }
}

function normalizeUrl(s) {
  const value = s.trim();
  if (/^https?:\/\//i.test(value)) return value;
  return 'http://' + value;
}

function trimStr(v, max) {
  if (typeof v !== 'string') return '';
  const t = v.trim();
  return t.length > max ? t.slice(0, max) : t;
}

function validatePayload(body) {
  const errors = [];

  const unidade = trimStr(body.unidade, 50);
  if (!unidade) errors.push('Unidade e obrigatoria.');
  else if (!UNIDADES_VALIDAS.includes(unidade)) errors.push('Unidade invalida.');

  const nome_completo = trimStr(body.nome_completo, 200);
  if (!nome_completo) errors.push('Nome completo e obrigatorio.');
  else if (nome_completo.length < 3) errors.push('Nome completo muito curto.');
  else if (!nome_completo.includes(' ')) errors.push('Informe o nome completo (nome e sobrenome).');

  const cpfDigits = onlyDigits(body.cpf);
  if (!cpfDigits) errors.push('CPF e obrigatorio.');
  else if (!isValidCpf(cpfDigits)) errors.push('CPF invalido.');

  const cargo = trimStr(body.cargo, 150);
  if (!cargo) errors.push('Cargo e obrigatorio.');

  const setor = trimStr(body.setor, 50);
  if (!setor) errors.push('Setor e obrigatorio.');
  else if (!SETORES_VALIDOS.includes(setor)) errors.push('Setor invalido.');

  const funcao = trimStr(body.funcao, 150);
  if (!funcao) errors.push('Funcao e obrigatoria.');

  let urls = Array.isArray(body.urls) ? body.urls : [];
  urls = urls.map((u) => (typeof u === 'string' ? u.trim() : '')).filter(Boolean);
  if (urls.length === 0) errors.push('Informe ao menos uma URL.');
  else if (urls.length > MAX_URLS) errors.push(`Limite de ${MAX_URLS} URLs por solicitacao.`);
  else {
    const invalid = urls.filter((u) => !isValidUrl(u));
    if (invalid.length) errors.push('Existem URLs em formato invalido.');
  }
  const normalizedUrls = urls.map(normalizeUrl);

  const justificativa = trimStr(body.justificativa || '', 2000);

  return {
    errors,
    data: {
      unidade,
      nome_completo,
      cpf: cpfDigits,
      cargo,
      setor,
      funcao,
      urls: normalizedUrls,
      justificativa,
    },
  };
}

app.get('/api/unidades', (_req, res) => {
  res.json({ unidades: UNIDADES_VALIDAS });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/submit', async (req, res) => {
  const { errors, data } = validatePayload(req.body || {});
  if (errors.length) {
    return res.status(400).json({ ok: false, errors });
  }
  try {
    const saved = await insertRequest(data);

    sendRequestEmail({ id: saved.id, created_at: saved.created_at, data })
      .catch((err) => console.error('[mailer] falha ao enviar e-mail:', err));

    return res.status(201).json({ ok: true, id: saved.id, created_at: saved.created_at });
  } catch (err) {
    console.error('[submit] erro ao salvar solicitacao:', err);
    return res.status(500).json({
      ok: false,
      errors: ['Erro interno ao salvar a solicitacao. Tente novamente em instantes.'],
    });
  }
});

app.use((_req, res) => res.status(404).json({ ok: false, errors: ['Rota nao encontrada.'] }));

(async () => {
  try {
    await initDb();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[server] rodando em 0.0.0.0:${PORT}`);
    });
  } catch (err) {
    console.error('[server] falha ao iniciar:', err);
    process.exit(1);
  }
})();
