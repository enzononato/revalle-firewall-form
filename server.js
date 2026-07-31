const crypto = require('crypto');
const path = require('path');
const express = require('express');
const multer = require('multer');
const {
  initDb, insertRequest, findRequestByToken, approveRequest, rejectRequest,
  insertContract, findContractByIdAndToken,
  insertImersaoTessRequest, listImersaoTessRequests, getImersaoTessStats,
  findRequestById, listFirewallRequests, getFirewallStats,
  listContracts, getContractById, listContractFiles, getContractFileById, getContractStats,
} = require('./db');
const {
  sendRequestEmail, sendApprovedEmail, sendRejectedEmail, sendContractEmail,
  sendImersaoTessParticipantEmail, sendImersaoTessAdminEmail,
} = require('./mailer');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const APP_URL = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

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
  'DIRETORIA',
  'FINANCEIRO',
  'CONTROLADORIA',
  'CONTABILIDADE',
  'DP',
  'RH',
  'TST',
  'CULTURA',
  'COMPRAS',
  'VENDAS',
  'MARKETING',
  'LOGISTICA',
  'DISTRIBUICAO',
  'ARMAZEM',
  'PUXADA',
  'PROCESSOS',
  'TI',
];

const MAX_URLS = 20;

const REVENDAS_CONTRATOS_VALIDAS = [
  ...UNIDADES_VALIDAS,
  'Grupo',
];

const SETORES_CONTRATOS_VALIDOS = [
  'DIRETORIA', 'FINANCEIRO', 'CONTROLADORIA', 'CONTABILIDADE', 'DP', 'RH', 'TST',
  'CULTURA', 'COMPRAS', 'VENDAS', 'MARKETING', 'LOGISTICA', 'DISTRIBUICAO',
  'ARMAZEM', 'PUXADA', 'PROCESSOS', 'TI',
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(Object.assign(new Error('Apenas arquivos PDF sao aceitos.'), { code: 'INVALID_TYPE' }));
  },
});

app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/contratos', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'contratos.html'));
});

app.get('/imersao-tess-form', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'imersao-tess.html'));
});

function onlyDigits(s) {
  return String(s || '').replace(/\D+/g, '');
}

function isValidCpf(cpf) {
  const digits = onlyDigits(cpf);
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  const calcCheck = (base, factor) => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) sum += Number(base[i]) * (factor - i);
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  if (calcCheck(digits.slice(0, 9), 10) !== Number(digits[9])) return false;
  if (calcCheck(digits.slice(0, 10), 11) !== Number(digits[10])) return false;
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
  } catch { return false; }
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

function isValidEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
}

function isValidCnpj(cnpj) {
  const d = String(cnpj || '').replace(/\D/g, '');
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;
  const calc = (str, weights) => {
    let sum = 0;
    for (let i = 0; i < weights.length; i++) sum += Number(str[i]) * weights[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  if (calc(d, [5,4,3,2,9,8,7,6,5,4,3,2]) !== Number(d[12])) return false;
  if (calc(d, [6,5,4,3,2,9,8,7,6,5,4,3,2]) !== Number(d[13])) return false;
  return true;
}

function validateContractPayload(body, files) {
  const errors = [];

  const revendaRaw = typeof body.revenda === 'string' ? body.revenda : '';
  const revendaList = revendaRaw.split(',').map((r) => r.trim()).filter(Boolean);
  
  if (revendaList.length === 0) {
    errors.push('Revenda e obrigatoria.');
  } else {
    const invalidRevendas = revendaList.filter(r => !REVENDAS_CONTRATOS_VALIDAS.includes(r));
    if (invalidRevendas.length > 0) {
      errors.push('Uma ou mais revendas selecionadas sao invalidas.');
    }
  }
  
  const revenda = trimStr(revendaList.join(', '), 500);

  const razao_social = trimStr(body.razao_social, 200);
  if (!razao_social) errors.push('Razao social e obrigatoria.');

  const cnpjDigits = onlyDigits(body.cnpj);
  if (!cnpjDigits) errors.push('CNPJ e obrigatorio.');
  else if (!isValidCnpj(cnpjDigits)) errors.push('CNPJ invalido.');

  const pessoa_contato = trimStr(body.pessoa_contato, 200);
  if (!pessoa_contato) errors.push('Pessoa de contato e obrigatoria.');

  const telefoneDigits = onlyDigits(body.telefone);
  if (!telefoneDigits) errors.push('Telefone e obrigatorio.');
  else if (telefoneDigits.length !== 11) errors.push('Telefone invalido (informe DDD + 9 digitos).');

  const vigencia_inicio = trimStr(body.vigencia_inicio, 10);
  if (!vigencia_inicio) errors.push('Data inicial da vigencia e obrigatoria.');
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(vigencia_inicio)) errors.push('Data inicial invalida.');

  const vigencia_fim = trimStr(body.vigencia_fim || '', 10);
  if (!vigencia_fim) errors.push('Data final da vigencia e obrigatoria.');
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(vigencia_fim)) errors.push('Data final invalida.');
  else if (vigencia_fim < vigencia_inicio) errors.push('Data final deve ser igual ou posterior a data inicial.');

  const dono_servico = trimStr(body.dono_servico, 200);
  if (!dono_servico) errors.push('Dono do servico e obrigatorio.');
  else if (!dono_servico.includes(' ')) errors.push('Informe nome e sobrenome do dono do servico.');

  const setor = trimStr(body.setor, 50);
  if (!setor) errors.push('Setor e obrigatorio.');
  else if (!SETORES_CONTRATOS_VALIDOS.includes(setor)) errors.push('Setor invalido.');

  if (!files || !Array.isArray(files) || files.length === 0) {
    errors.push('Envie pelo menos um contrato em PDF.');
  }

  return {
    errors,
    data: {
      revenda, razao_social, cnpj: cnpjDigits, pessoa_contato,
      telefone: telefoneDigits, vigencia_inicio, vigencia_fim,
      dono_servico, setor,
      arquivos: (files || []).map((file) => ({
        nome: file.originalname,
        dados: file.buffer,
      })),
    },
  };
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

  const email = trimStr(body.email, 200);
  if (!email) errors.push('E-mail e obrigatorio.');
  else if (!isValidEmail(email)) errors.push('E-mail invalido.');

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
    data: { unidade, nome_completo, cpf: cpfDigits, cargo, setor, funcao, email, urls: normalizedUrls, justificativa },
  };
}

function validateImersaoTessPayload(body) {
  const errors = [];

  const nome = trimStr(body.nome, 200);
  if (!nome) errors.push('Nome completo e obrigatorio.');
  else if (nome.length < 3) errors.push('Nome muito curto.');
  else if (!nome.includes(' ')) errors.push('Informe o nome completo (nome e sobrenome).');

  const email = trimStr(body.email, 200);
  if (!email) errors.push('E-mail e obrigatorio.');
  else if (!isValidEmail(email)) errors.push('E-mail invalido.');
  else if (!email.toLowerCase().endsWith('@revalle.com.br')) errors.push('Use obrigatoriamente um e-mail corporativo (@revalle.com.br).');

  const telefoneDigits = onlyDigits(body.telefone);
  if (!telefoneDigits) errors.push('Telefone e obrigatorio.');
  else if (telefoneDigits.length < 10 || telefoneDigits.length > 11) errors.push('Telefone invalido (informe DDD + 8 ou 9 digitos).');

  const setor = trimStr(body.setor, 100);
  if (!setor) errors.push('Setor e obrigatorio.');

  const revenda = trimStr(body.revenda, 100);
  if (!revenda) errors.push('Revenda e obrigatoria.');

  return {
    errors,
    data: { nome, email, telefone: telefoneDigits, setor, revenda },
  };
}

/* ── Paginas inline helpers ── */

function pageShell(title, body) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${title} - Revalle</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box}
    [hidden]{display:none!important}
    body{margin:0;font-family:'Inter',sans-serif;background:#f4f6fb;color:#1a1f36;-webkit-font-smoothing:antialiased}
    .topbar{background:linear-gradient(135deg,#0033A0,#002677);padding:18px 24px;display:flex;align-items:center;gap:12px}
    .brand-mark{width:40px;height:40px;background:#fff;border-radius:8px;display:grid;place-items:center;font-weight:700;font-size:20px;font-style:italic;color:#0033A0}
    .brand-name{font-weight:700;font-size:18px;color:#fff}
    .brand-tag{font-size:11px;color:rgba(255,255,255,.8);text-transform:uppercase;letter-spacing:.4px}
    .container{max-width:640px;margin:32px auto;padding:0 20px 60px}
    .card{background:#fff;border-radius:12px;padding:28px;box-shadow:0 8px 24px rgba(16,24,40,.08);border:1px solid #dfe3ec}
    h2{margin:0 0 8px;font-size:20px}
    p{color:#5b6478;margin:6px 0 0}
    .icon{width:60px;height:60px;border-radius:50%;display:grid;place-items:center;margin:0 auto 16px}
    .icon-ok{background:#e6f4ec;color:#1f8a4c}
    .icon-err{background:#fdecef;color:#c0344b}
    .icon-warn{background:#fff8e6;color:#b07c00}
    .card.center{text-align:center}
    textarea{width:100%;padding:11px 13px;border:1.5px solid #dfe3ec;border-radius:8px;font:inherit;resize:vertical;min-height:100px;outline:none;transition:border-color .16s}
    textarea:focus{border-color:#0033A0;box-shadow:0 0 0 3px rgba(0,51,160,.12)}
    label{font-size:13.5px;font-weight:600;display:block;margin-bottom:6px}
    .summary{background:#f8f9fc;border:1px solid #eaecf3;border-radius:8px;padding:14px;margin:16px 0;font-size:14px}
    .summary b{color:#1a1f36}
    .summary ul{margin:8px 0 0;padding-left:20px;color:#5b6478}
    .btn{display:inline-flex;align-items:center;justify-content:center;padding:12px 24px;border-radius:8px;border:none;font:inherit;font-weight:600;font-size:15px;cursor:pointer;transition:all .16s;text-decoration:none}
    .btn-danger{background:#c0344b;color:#fff;width:100%;margin-top:16px}
    .btn-danger:hover{background:#a8293f}
    .footer{text-align:center;padding:20px 0 0;font-size:12px;color:#8c93a8}
  </style>
</head>
<body>
  <div class="topbar">
    <div class="brand-mark">R</div>
    <div><div class="brand-name">revalle</div><div class="brand-tag">Revenda e Distribuicao Ambev</div></div>
  </div>
  <div class="container">${body}</div>
</body>
</html>`;
}

function escHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function protocol(id) {
  return '#' + String(id).padStart(5, '0');
}

/* ── Rotas ── */

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/unidades', (_req, res) => res.json({ unidades: UNIDADES_VALIDAS }));

app.post('/api/submit', async (req, res) => {
  const { errors, data } = validatePayload(req.body || {});
  if (errors.length) return res.status(400).json({ ok: false, errors });

  try {
    const token = crypto.randomBytes(32).toString('hex');
    const saved = await insertRequest({ ...data, token });

    sendRequestEmail({ id: saved.id, created_at: saved.created_at, data, token, appUrl: APP_URL })
      .catch((err) => console.error('[mailer] falha ao enviar e-mail para TI:', err));

    return res.status(201).json({ ok: true, id: saved.id, created_at: saved.created_at });
  } catch (err) {
    console.error('[submit] erro ao salvar solicitacao:', err);
    return res.status(500).json({ ok: false, errors: ['Erro interno ao salvar a solicitacao. Tente novamente em instantes.'] });
  }
});

app.post('/api/imersao-tess/submit', async (req, res) => {
  const { errors, data } = validateImersaoTessPayload(req.body || {});
  if (errors.length) return res.status(400).json({ ok: false, errors });

  try {
    const saved = await insertImersaoTessRequest(data);

    sendImersaoTessParticipantEmail({ id: saved.id, created_at: saved.created_at, data })
      .catch((err) => console.error('[mailer] falha email participante imersao tess:', err));

    sendImersaoTessAdminEmail({ id: saved.id, created_at: saved.created_at, data })
      .catch((err) => console.error('[mailer] falha email admin imersao tess:', err));

    return res.status(201).json({ ok: true, id: saved.id, created_at: saved.created_at });
  } catch (err) {
    console.error('[submit imersao tess] erro ao salvar:', err);
    return res.status(500).json({ ok: false, errors: ['Erro interno ao salvar a inscricao. Tente novamente em instantes.'] });
  }
});

app.get('/api/approve/:token', async (req, res) => {
  const request = await findRequestByToken(req.params.token).catch(() => null);

  if (!request) {
    return res.status(404).send(pageShell('Link invalido', `
      <div class="card center">
        <div class="icon icon-err"><svg viewBox="0 0 24 24" width="28" height="28"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg></div>
        <h2>Link invalido</h2>
        <p>Este link de aprovacao nao foi encontrado.</p>
      </div>`));
  }

  if (request.status !== 'pending') {
    const label = request.status === 'approved' ? 'aprovada' : 'reprovada';
    return res.send(pageShell('Ja processado', `
      <div class="card center">
        <div class="icon icon-warn"><svg viewBox="0 0 24 24" width="28" height="28"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg></div>
        <h2>Solicitacao ja processada</h2>
        <p>A solicitacao ${escHtml(protocol(request.id))} ja foi <strong>${label}</strong> anteriormente.</p>
      </div>`));
  }

  try {
    await approveRequest(request.id);
    sendApprovedEmail({ id: request.id, data: request })
      .catch((err) => console.error('[mailer] falha ao enviar e-mail de aprovacao:', err));

    return res.send(pageShell('Solicitacao aprovada', `
      <div class="card center">
        <div class="icon icon-ok"><svg viewBox="0 0 24 24" width="28" height="28"><path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg></div>
        <h2>Solicitacao ${escHtml(protocol(request.id))} aprovada!</h2>
        <p>E-mail de confirmacao enviado para <strong>${escHtml(request.email)}</strong>.</p>
        <p class="footer" style="padding-top:12px">${escHtml(request.nome_completo)} &middot; ${escHtml(request.unidade)}</p>
      </div>`));
  } catch (err) {
    console.error('[approve] erro:', err);
    return res.status(500).send(pageShell('Erro', `<div class="card center"><h2>Erro interno</h2><p>Tente novamente em instantes.</p></div>`));
  }
});

app.get('/api/reject/:token', async (req, res) => {
  const request = await findRequestByToken(req.params.token).catch(() => null);

  if (!request) {
    return res.status(404).send(pageShell('Link invalido', `
      <div class="card center">
        <div class="icon icon-err"><svg viewBox="0 0 24 24" width="28" height="28"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg></div>
        <h2>Link invalido</h2>
        <p>Este link de reprovacao nao foi encontrado.</p>
      </div>`));
  }

  if (request.status !== 'pending') {
    const label = request.status === 'approved' ? 'aprovada' : 'reprovada';
    return res.send(pageShell('Ja processado', `
      <div class="card center">
        <div class="icon icon-warn"><svg viewBox="0 0 24 24" width="28" height="28"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg></div>
        <h2>Solicitacao ja processada</h2>
        <p>A solicitacao ${escHtml(protocol(request.id))} ja foi <strong>${label}</strong> anteriormente.</p>
      </div>`));
  }

  const urlList = request.urls.map((u) => `<li>${escHtml(u)}</li>`).join('');

  return res.send(pageShell(`Reprovar ${protocol(request.id)}`, `
    <div class="card">
      <h2>Reprovar solicitacao ${escHtml(protocol(request.id))}</h2>
      <div class="summary">
        <b>${escHtml(request.nome_completo)}</b> &middot; ${escHtml(request.unidade)}<br/>
        <b>Setor:</b> ${escHtml(request.setor)} &middot; <b>Cargo:</b> ${escHtml(request.cargo)}<br/>
        <b>Sites solicitados:</b>
        <ul>${urlList}</ul>
      </div>
      <form method="POST" action="/api/reject/${escHtml(req.params.token)}">
        <label for="motivo">Motivo da reprovacao <span style="color:#c0344b">*</span></label>
        <textarea id="motivo" name="motivo" placeholder="Descreva o motivo da reprovacao..." required maxlength="1000"></textarea>
        <button type="submit" class="btn btn-danger">Confirmar Reprovacao</button>
      </form>
    </div>`));
});

app.post('/api/reject/:token', async (req, res) => {
  const request = await findRequestByToken(req.params.token).catch(() => null);

  if (!request) return res.status(404).send(pageShell('Link invalido', `<div class="card center"><h2>Link invalido</h2></div>`));

  if (request.status !== 'pending') {
    const label = request.status === 'approved' ? 'aprovada' : 'reprovada';
    return res.send(pageShell('Ja processado', `
      <div class="card center">
        <div class="icon icon-warn"><svg viewBox="0 0 24 24" width="28" height="28"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg></div>
        <h2>Solicitacao ja processada</h2>
        <p>A solicitacao ${escHtml(protocol(request.id))} ja foi <strong>${label}</strong> anteriormente.</p>
      </div>`));
  }

  const motivo = String(req.body.motivo || '').trim().slice(0, 1000);
  if (!motivo) {
    return res.status(400).send(pageShell('Motivo obrigatorio', `
      <div class="card center">
        <div class="icon icon-err"><svg viewBox="0 0 24 24" width="28" height="28"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg></div>
        <h2>Motivo obrigatorio</h2>
        <p>Informe o motivo da reprovacao antes de confirmar.</p>
        <p><a href="/api/reject/${escHtml(req.params.token)}" style="color:#0033A0">Voltar</a></p>
      </div>`));
  }

  try {
    await rejectRequest(request.id, motivo);
    sendRejectedEmail({ id: request.id, data: request, motivo })
      .catch((err) => console.error('[mailer] falha ao enviar e-mail de reprovacao:', err));

    return res.send(pageShell('Solicitacao reprovada', `
      <div class="card center">
        <div class="icon icon-err"><svg viewBox="0 0 24 24" width="28" height="28"><path fill="currentColor" d="M6 18L18 6M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg></div>
        <h2>Solicitacao ${escHtml(protocol(request.id))} reprovada.</h2>
        <p>E-mail de notificacao enviado para <strong>${escHtml(request.email)}</strong>.</p>
        <p class="footer" style="padding-top:12px">${escHtml(request.nome_completo)} &middot; ${escHtml(request.unidade)}</p>
      </div>`));
  } catch (err) {
    console.error('[reject] erro:', err);
    return res.status(500).send(pageShell('Erro', `<div class="card center"><h2>Erro interno</h2><p>Tente novamente em instantes.</p></div>`));
  }
});

/* ── Contratos ── */

app.post('/api/contratos/submit', (req, res, next) => {
  upload.array('arquivo', 10)(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'Um ou mais arquivos sao muito grandes. Limite de 10MB por arquivo.'
        : err.code === 'LIMIT_UNEXPECTED_FILE'
          ? 'Voce pode enviar no maximo 10 arquivos.'
          : err.code === 'INVALID_TYPE'
            ? 'Apenas arquivos PDF sao aceitos.'
            : 'Erro no upload do arquivo.';
      return res.status(400).json({ ok: false, errors: [msg] });
    }
    next();
  });
}, async (req, res) => {
  const { errors, data } = validateContractPayload(req.body || {}, req.files || []);
  if (errors.length) return res.status(400).json({ ok: false, errors });

  try {
    const arquivos_tokens = data.arquivos.map(() => crypto.randomBytes(32).toString('hex'));
    const saved = await insertContract({ ...data, arquivos_tokens });

    sendContractEmail({ id: saved.id, created_at: saved.created_at, data, arquivos_tokens, appUrl: APP_URL })
      .catch((err) => console.error('[mailer] falha ao enviar e-mail de contrato:', err));

    return res.status(201).json({ ok: true, id: saved.id });
  } catch (err) {
    console.error('[contratos/submit] erro:', err);
    return res.status(500).json({ ok: false, errors: ['Erro interno ao salvar o contrato. Tente novamente.'] });
  }
});

app.get('/api/contratos/:id/pdf', async (req, res) => {
  const id = Number(req.params.id);
  const token = String(req.query.token || '');

  if (!id || !token) return res.status(400).send('Parametros invalidos.');

  const contract = await findContractByIdAndToken(id, token).catch(() => null);
  if (!contract) return res.status(403).send(pageShell('Acesso negado', `
    <div class="card center">
      <div class="icon icon-err"><svg viewBox="0 0 24 24" width="28" height="28"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg></div>
      <h2>Acesso negado</h2><p>Link invalido ou expirado.</p>
    </div>`));

  const filename = encodeURIComponent(contract.arquivo_nome || `contrato-${id}.pdf`);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.send(contract.arquivo_dados);
});

/* ════════════════════════════════════════════════════════════════════════════
 * Dashboard de controle (/dashboard) — protegido por senha do .env
 * ════════════════════════════════════════════════════════════════════════════ */

const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || '';
const SESSION_SECRET = process.env.DASHBOARD_SESSION_SECRET
  || crypto.createHash('sha256').update('revalle-dash::' + DASHBOARD_PASSWORD).digest('hex');
const SESSION_COOKIE = 'revalle_dash';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 horas

if (!DASHBOARD_PASSWORD) {
  console.warn('[dashboard] DASHBOARD_PASSWORD nao definida — o painel /dashboard ficara inacessivel ate configurar.');
}

/* ── Sessao stateless assinada (HMAC) ── */
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  return Buffer.from(String(str).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
function signSession(expMs) {
  const payload = b64url(JSON.stringify({ exp: expMs }));
  const sig = b64url(crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest());
  return `${payload}.${sig}`;
}
function verifySession(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false;
  const [payload, sig] = token.split('.');
  const expected = b64url(crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const data = JSON.parse(b64urlDecode(payload).toString('utf8'));
    return typeof data.exp === 'number' && data.exp > Date.now();
  } catch { return false; }
}

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const k = pair.slice(0, idx).trim();
    if (k) out[k] = decodeURIComponent(pair.slice(idx + 1).trim());
  }
  return out;
}
function isSecureReq(req) {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}
function setSessionCookie(req, res) {
  const token = signSession(Date.now() + SESSION_TTL_MS);
  const attrs = [`${SESSION_COOKIE}=${token}`, 'HttpOnly', 'SameSite=Strict', 'Path=/', `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`];
  if (isSecureReq(req)) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}
function clearSessionCookie(req, res) {
  const attrs = [`${SESSION_COOKIE}=`, 'HttpOnly', 'SameSite=Strict', 'Path=/', 'Max-Age=0'];
  if (isSecureReq(req)) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}
function isAuthed(req) {
  return verifySession(parseCookies(req)[SESSION_COOKIE]);
}
function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  return res.status(401).json({ ok: false, error: 'Sessao expirada ou nao autenticada.' });
}

/* ── Senha + rate limit de login ── */
function passwordMatches(input) {
  if (!DASHBOARD_PASSWORD) return false;
  const a = crypto.createHash('sha256').update(String(input || '')).digest();
  const b = crypto.createHash('sha256').update(DASHBOARD_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}
const loginAttempts = new Map(); // ip -> { count, first }
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX = 10;
function loginRateLimited(ip) {
  const rec = loginAttempts.get(ip);
  if (!rec || Date.now() - rec.first > LOGIN_WINDOW_MS) return false;
  return rec.count >= LOGIN_MAX;
}
function registerFailedLogin(ip) {
  const rec = loginAttempts.get(ip);
  if (!rec || Date.now() - rec.first > LOGIN_WINDOW_MS) loginAttempts.set(ip, { count: 1, first: Date.now() });
  else rec.count += 1;
}

/* ── Helpers de data / CSV ── */
function formatDateTimeBr(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value));
}
function formatIsoDateBr(value) {
  if (!value) return '';
  const [y, m, d] = String(value).split('-');
  return `${d}/${m}/${y}`;
}
function sendCsv(res, baseName, cols, rows) {
  const escCell = (v) => '"' + (v === null || v === undefined ? '' : String(v)).replace(/"/g, '""') + '"';
  const lines = [cols.map((c) => escCell(c.label)).join(';')];
  for (const row of rows) lines.push(cols.map((c) => escCell(c.get(row))).join(';'));
  const csv = '﻿' + lines.join('\r\n'); // BOM para acentos no Excel
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${baseName}-${stamp}.csv"`);
  res.send(csv);
}

/* ── Paginas ── */
app.get('/dashboard', (req, res) => {
  if (!isAuthed(req)) return res.redirect('/dashboard/login');
  res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});
app.get('/dashboard/login', (req, res) => {
  if (isAuthed(req)) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

/* ── Autenticacao ── */
app.post('/api/dashboard/login', (req, res) => {
  const ip = req.ip || 'unknown';
  if (loginRateLimited(ip)) {
    return res.status(429).json({ ok: false, error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
  }
  if (!passwordMatches((req.body || {}).senha)) {
    registerFailedLogin(ip);
    return res.status(401).json({ ok: false, error: 'Senha incorreta.' });
  }
  loginAttempts.delete(ip);
  setSessionCookie(req, res);
  return res.json({ ok: true });
});
app.post('/api/dashboard/logout', (req, res) => {
  clearSessionCookie(req, res);
  return res.json({ ok: true });
});
app.get('/api/dashboard/me', (req, res) => res.json({ ok: true, authed: isAuthed(req) }));

/* ── Indicadores (graficos + KPIs) ── */
app.get('/api/dashboard/summary', requireAuth, async (_req, res) => {
  try {
    const [firewall, contratos] = await Promise.all([getFirewallStats(), getContractStats()]);
    res.json({ ok: true, firewall, contratos, generated_at: new Date().toISOString() });
  } catch (err) {
    console.error('[dashboard/summary] erro:', err);
    res.status(500).json({ ok: false, error: 'Erro ao carregar indicadores.' });
  }
});

/* ── Solicitacoes de firewall ── */
app.get('/api/dashboard/firewall', requireAuth, async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 25, 1), 200);
    const { rows, total } = await listFirewallRequests({
      status: req.query.status, unidade: req.query.unidade, setor: req.query.setor,
      search: req.query.search, from: req.query.from, to: req.query.to,
      limit: pageSize, offset: (page - 1) * pageSize,
    });
    res.json({ ok: true, rows, total, page, pageSize });
  } catch (err) {
    console.error('[dashboard/firewall] erro:', err);
    res.status(500).json({ ok: false, error: 'Erro ao listar solicitacoes.' });
  }
});
app.get('/api/dashboard/firewall/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID invalido.' });
  const row = await findRequestById(id).catch(() => null);
  if (!row) return res.status(404).json({ ok: false, error: 'Solicitacao nao encontrada.' });
  res.json({ ok: true, row });
});
app.post('/api/dashboard/firewall/:id/approve', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID invalido.' });
  try {
    const request = await findRequestById(id);
    if (!request) return res.status(404).json({ ok: false, error: 'Solicitacao nao encontrada.' });
    if (request.status !== 'pending') return res.status(409).json({ ok: false, error: 'Solicitacao ja foi processada.' });
    await approveRequest(id);
    sendApprovedEmail({ id, data: request }).catch((err) => console.error('[dashboard approve] falha email:', err));
    res.json({ ok: true, status: 'approved' });
  } catch (err) {
    console.error('[dashboard approve] erro:', err);
    res.status(500).json({ ok: false, error: 'Erro ao aprovar a solicitacao.' });
  }
});
app.post('/api/dashboard/firewall/:id/reject', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID invalido.' });
  const motivo = String((req.body || {}).motivo || '').trim().slice(0, 1000);
  if (!motivo) return res.status(400).json({ ok: false, error: 'Informe o motivo da reprovacao.' });
  try {
    const request = await findRequestById(id);
    if (!request) return res.status(404).json({ ok: false, error: 'Solicitacao nao encontrada.' });
    if (request.status !== 'pending') return res.status(409).json({ ok: false, error: 'Solicitacao ja foi processada.' });
    await rejectRequest(id, motivo);
    sendRejectedEmail({ id, data: request, motivo }).catch((err) => console.error('[dashboard reject] falha email:', err));
    res.json({ ok: true, status: 'rejected' });
  } catch (err) {
    console.error('[dashboard reject] erro:', err);
    res.status(500).json({ ok: false, error: 'Erro ao reprovar a solicitacao.' });
  }
});

/* ── Contratos ── */
app.get('/api/dashboard/contratos', requireAuth, async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 25, 1), 200);
    const { rows, total } = await listContracts({
      setor: req.query.setor, revenda: req.query.revenda, vigencia: req.query.vigencia,
      search: req.query.search, limit: pageSize, offset: (page - 1) * pageSize,
    });
    res.json({ ok: true, rows, total, page, pageSize });
  } catch (err) {
    console.error('[dashboard/contratos] erro:', err);
    res.status(500).json({ ok: false, error: 'Erro ao listar contratos.' });
  }
});
app.get('/api/dashboard/contratos/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID invalido.' });
  try {
    const row = await getContractById(id);
    if (!row) return res.status(404).json({ ok: false, error: 'Contrato nao encontrado.' });
    const arquivos = await listContractFiles(id);
    res.json({ ok: true, row, arquivos });
  } catch (err) {
    console.error('[dashboard/contrato] erro:', err);
    res.status(500).json({ ok: false, error: 'Erro ao carregar o contrato.' });
  }
});
app.get('/api/dashboard/contratos/file/:fileId', requireAuth, async (req, res) => {
  const fileId = Number(req.params.fileId);
  if (!fileId) return res.status(400).send('Parametro invalido.');
  const file = await getContractFileById(fileId).catch(() => null);
  if (!file) return res.status(404).send('Arquivo nao encontrado.');
  const filename = encodeURIComponent(file.arquivo_nome || `contrato-${fileId}.pdf`);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${filename}"`);
  res.send(file.arquivo_dados);
});

/* ── Exportacao CSV ── */
app.get('/api/dashboard/export/firewall.csv', requireAuth, async (req, res) => {
  try {
    const { rows } = await listFirewallRequests({
      status: req.query.status, unidade: req.query.unidade, setor: req.query.setor,
      search: req.query.search, from: req.query.from, to: req.query.to, limit: 5000, offset: 0,
    });
    const statusLabel = { pending: 'Pendente', approved: 'Aprovada', rejected: 'Reprovada' };
    sendCsv(res, 'solicitacoes-firewall', [
      { label: 'Protocolo', get: (r) => '#' + String(r.id).padStart(5, '0') },
      { label: 'Data', get: (r) => formatDateTimeBr(r.created_at) },
      { label: 'Status', get: (r) => statusLabel[r.status] || r.status },
      { label: 'Nome', get: (r) => r.nome_completo },
      { label: 'CPF', get: (r) => r.cpf },
      { label: 'E-mail', get: (r) => r.email },
      { label: 'Unidade', get: (r) => r.unidade },
      { label: 'Setor', get: (r) => r.setor },
      { label: 'Cargo', get: (r) => r.cargo },
      { label: 'Funcao', get: (r) => r.funcao },
      { label: 'URLs', get: (r) => (r.urls || []).join(' | ') },
      { label: 'Justificativa', get: (r) => r.justificativa },
      { label: 'Motivo reprovacao', get: (r) => r.motivo_reprovacao || '' },
      { label: 'Resolvido em', get: (r) => formatDateTimeBr(r.resolved_at) },
    ], rows);
  } catch (err) {
    console.error('[export/firewall] erro:', err);
    res.status(500).send('Erro ao exportar.');
  }
});
app.get('/api/dashboard/export/contratos.csv', requireAuth, async (req, res) => {
  try {
    const { rows } = await listContracts({
      setor: req.query.setor, revenda: req.query.revenda, vigencia: req.query.vigencia,
      search: req.query.search, limit: 5000, offset: 0,
    });
    sendCsv(res, 'contratos', [
      { label: 'Protocolo', get: (r) => '#' + String(r.id).padStart(5, '0') },
      { label: 'Cadastrado em', get: (r) => formatDateTimeBr(r.created_at) },
      { label: 'Revenda', get: (r) => r.revenda },
      { label: 'Razao Social', get: (r) => r.razao_social },
      { label: 'CNPJ', get: (r) => r.cnpj },
      { label: 'Contato', get: (r) => r.pessoa_contato },
      { label: 'Telefone', get: (r) => r.telefone },
      { label: 'Setor', get: (r) => r.setor },
      { label: 'Dono do Servico', get: (r) => r.dono_servico },
      { label: 'Vigencia Inicio', get: (r) => formatIsoDateBr(r.vigencia_inicio) },
      { label: 'Vigencia Fim', get: (r) => formatIsoDateBr(r.vigencia_fim) },
      { label: 'Dias Restantes', get: (r) => (r.dias_restantes === null || r.dias_restantes === undefined ? '' : r.dias_restantes) },
      { label: 'Arquivos', get: (r) => r.arquivos_count },
    ], rows);
  } catch (err) {
    console.error('[export/contratos] erro:', err);
    res.status(500).send('Erro ao exportar.');
  }
});

/* ── Dashboard Imersão Tess ── */
app.get('/api/dashboard/imersao-tess', requireAuth, async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 25, 1), 200);
    const { rows, total } = await listImersaoTessRequests({
      setor: req.query.setor, revenda: req.query.revenda,
      search: req.query.search, limit: pageSize, offset: (page - 1) * pageSize,
    });
    res.json({ ok: true, rows, total, page, pageSize });
  } catch (err) {
    console.error('[dashboard/imersao-tess] erro:', err);
    res.status(500).json({ ok: false, error: 'Erro ao listar inscricoes da Imersao Tess.' });
  }
});

app.get('/api/dashboard/export/imersao-tess.csv', requireAuth, async (req, res) => {
  try {
    const { rows } = await listImersaoTessRequests({
      setor: req.query.setor, revenda: req.query.revenda,
      search: req.query.search, limit: 5000, offset: 0,
    });
    sendCsv(res, 'inscritos-imersao-tess', [
      { label: 'Inscricao', get: (r) => '#IM-' + String(r.id).padStart(5, '0') },
      { label: 'Data', get: (r) => formatDateTimeBr(r.created_at) },
      { label: 'Nome', get: (r) => r.nome },
      { label: 'E-mail', get: (r) => r.email },
      { label: 'Telefone', get: (r) => r.telefone },
      { label: 'Setor', get: (r) => r.setor },
      { label: 'Revenda', get: (r) => r.revenda },
    ], rows);
  } catch (err) {
    console.error('[export/imersao-tess] erro:', err);
    res.status(500).send('Erro ao exportar inscritos.');
  }
});

app.use((_req, res) => res.status(404).json({ ok: false, errors: ['Rota nao encontrada.'] }));

(async () => {
  try {
    await initDb();
    app.listen(PORT, '0.0.0.0', () => console.log(`[server] rodando em 0.0.0.0:${PORT}`));
  } catch (err) {
    console.error('[server] falha ao iniciar:', err);
    process.exit(1);
  }
})();
