const crypto = require('crypto');
const path = require('path');
const express = require('express');
const { initDb, insertRequest, findRequestByToken, approveRequest, rejectRequest } = require('./db');
const { sendRequestEmail, sendApprovedEmail, sendRejectedEmail } = require('./mailer');

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

app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));
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
