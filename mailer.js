const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || 'mail.revalle.com.br';
const SMTP_PORT = Number(process.env.SMTP_PORT) || 465;
const SMTP_USER = process.env.SMTP_USER || 'projetos.ti@revalle.com.br';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_TO           = process.env.SMTP_TO            || SMTP_USER;
const SMTP_TO_CONTRATOS = process.env.SMTP_TO_CONTRATOS  || SMTP_USER;

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
    });
  }
  return transporter;
}

function formatCpf(digits) {
  return String(digits || '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function formatDate(date) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function emailShell(preheader, body) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${preheader}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${esc(preheader)}</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
        ${body}
        <tr><td style="padding:20px 0 0;text-align:center;">
          <p style="margin:0;font-size:12px;color:#8c93a8;">
            E-mail gerado automaticamente &bull; <strong style="color:#5b6478;">Revalle</strong>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function headerBlock(subtitle) {
  return `
    <tr>
      <td style="background:linear-gradient(135deg,#0033A0 0%,#002677 100%);border-radius:12px 12px 0 0;padding:24px 28px;">
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:middle;">
            <div style="width:44px;height:44px;background:#fff;border-radius:10px;display:inline-block;
                        text-align:center;line-height:44px;font-size:22px;font-weight:700;
                        color:#0033A0;font-style:italic;letter-spacing:-1px;">R</div>
          </td>
          <td style="padding-left:12px;vertical-align:middle;">
            <div style="font-size:20px;font-weight:700;color:#fff;letter-spacing:-0.5px;line-height:1.1;">revalle</div>
            <div style="font-size:11px;color:rgba(255,255,255,.85);letter-spacing:.4px;text-transform:uppercase;margin-top:2px;">
              Revenda e Distribuicao Ambev
            </div>
          </td>
        </tr></table>
      </td>
    </tr>
    <tr>
      <td style="background:#0a3fbf;padding:12px 28px;">
        <span style="font-size:14px;font-weight:700;color:#fff;">${subtitle}</span>
      </td>
    </tr>`;
}

function collaboratorTable(data) {
  const fields = [
    ['Nome',     esc(data.nome_completo)],
    ['CPF',      esc(formatCpf(data.cpf))],
    ['E-mail',   esc(data.email)],
    ['Unidade',  esc(data.unidade)],
    ['Cargo',    esc(data.cargo)],
    ['Setor',    esc(data.setor)],
    ['Funcao',   esc(data.funcao)],
  ];
  const rows = fields.map(([label, value]) => `
    <tr>
      <td style="padding:10px 14px;width:36%;background:#f8f9fc;border-bottom:1px solid #eaecf3;
                 font-size:13px;font-weight:600;color:#5b6478;white-space:nowrap;">${label}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #eaecf3;font-size:14px;color:#1a1f36;">${value}</td>
    </tr>`).join('');
  return `
    <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#0033A0;letter-spacing:.8px;text-transform:uppercase;">
      Colaborador
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="border:1px solid #eaecf3;border-radius:8px;overflow:hidden;border-collapse:collapse;margin-bottom:24px;">
      ${rows}
    </table>`;
}

function urlsBlock(urls) {
  const items = urls.map((u) => `
    <tr><td style="padding:6px 0;border-bottom:1px solid #f0f0f0;">
      <a href="${esc(u)}" style="color:#0033A0;text-decoration:none;font-size:14px;word-break:break-all;">${esc(u)}</a>
    </td></tr>`).join('');
  return `
    <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#0033A0;letter-spacing:.8px;text-transform:uppercase;">
      Sites Solicitados (${urls.length})
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="border:1px solid #eaecf3;border-radius:8px;overflow:hidden;border-collapse:collapse;margin-bottom:24px;">
      <tr><td style="padding:8px 14px 2px;">
        <table width="100%" cellpadding="0" cellspacing="0">${items}</table>
      </td></tr>
    </table>`;
}

/* ── E-mail para a TI (notificacao de nova solicitacao) ── */

function buildTiHtml({ id, created_at, data, token, appUrl }) {
  const proto = '#' + String(id).padStart(5, '0');
  const date  = formatDate(new Date(created_at));
  const approveUrl = `${appUrl}/api/approve/${token}`;
  const rejectUrl  = `${appUrl}/api/reject/${token}`;

  const justBlock = data.justificativa ? `
    <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#0033A0;letter-spacing:.8px;text-transform:uppercase;">
      Justificativa
    </p>
    <div style="background:#f8f9fc;border:1px solid #eaecf3;border-radius:8px;padding:14px;
                font-size:14px;color:#1a1f36;line-height:1.6;margin-bottom:24px;">
      ${esc(data.justificativa)}
    </div>` : '';

  return emailShell(`[Firewall] Nova solicitacao ${proto} — ${data.nome_completo}`, `
    ${headerBlock(`Nova Solicitacao de Desbloqueio &nbsp;&bull;&nbsp; ${esc(proto)}`)}
    <tr><td style="background:#fff;padding:28px;border-radius:0 0 12px 12px;
                   box-shadow:0 8px 24px rgba(16,24,40,.08);">
      <p style="margin:0 0 20px;font-size:13px;color:#5b6478;">
        Recebido em <strong style="color:#1a1f36;">${date}</strong>
      </p>
      ${collaboratorTable(data)}
      ${urlsBlock(data.urls)}
      ${justBlock}
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
        <tr>
          <td style="padding-right:8px;">
            <a href="${esc(approveUrl)}"
               style="display:block;text-align:center;padding:14px;background:#1a7a3c;color:#fff;
                      text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;">
              Aprovar
            </a>
          </td>
          <td style="padding-left:8px;">
            <a href="${esc(rejectUrl)}"
               style="display:block;text-align:center;padding:14px;background:#c0344b;color:#fff;
                      text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;">
              Reprovar
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:16px 0 0;font-size:12px;color:#b0b7c8;text-align:center;">
        Estes links sao de uso unico. Apos utiliza-los a solicitacao sera encerrada.
      </p>
    </td></tr>`);
}

/* ── E-mail para o colaborador: APROVADO ── */

function buildApprovedHtml({ id, data }) {
  const proto = '#' + String(id).padStart(5, '0');
  return emailShell(`Sua solicitacao ${proto} foi aprovada!`, `
    ${headerBlock(`Solicitacao ${esc(proto)} &mdash; Aprovada`)}
    <tr><td style="background:#fff;padding:28px;border-radius:0 0 12px 12px;
                   box-shadow:0 8px 24px rgba(16,24,40,.08);">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="width:64px;height:64px;background:#e6f4ec;border-radius:50%;
                    display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
          <svg viewBox="0 0 24 24" width="32" height="32"><path fill="#1f8a4c" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>
        </div>
        <h2 style="margin:0 0 6px;font-size:20px;color:#1a1f36;">Solicitacao aprovada!</h2>
        <p style="margin:0;color:#5b6478;font-size:14px;">
          Ola, <strong>${esc(data.nome_completo.split(' ')[0])}</strong>! Sua solicitacao de desbloqueio foi aprovada pelo time de TI.
        </p>
      </div>
      ${urlsBlock(data.urls)}
      <div style="background:#eef3ff;border-radius:8px;padding:14px 16px;">
        <p style="margin:0;font-size:13px;color:#0033A0;font-weight:500;">
          Os sites listados acima estao sendo liberados no firewall. Em caso de duvidas, entre em contato com a TI.
        </p>
      </div>
      <p style="margin:20px 0 0;font-size:13px;color:#8c93a8;text-align:center;">
        Protocolo ${esc(proto)} &bull; ${esc(data.unidade)}
      </p>
    </td></tr>`);
}

/* ── E-mail para o colaborador: REPROVADO ── */

function buildRejectedHtml({ id, data, motivo }) {
  const proto = '#' + String(id).padStart(5, '0');
  return emailShell(`Sua solicitacao ${proto} foi reprovada`, `
    ${headerBlock(`Solicitacao ${esc(proto)} &mdash; Reprovada`)}
    <tr><td style="background:#fff;padding:28px;border-radius:0 0 12px 12px;
                   box-shadow:0 8px 24px rgba(16,24,40,.08);">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="width:64px;height:64px;background:#fdecef;border-radius:50%;
                    display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none">
            <path stroke="#c0344b" stroke-width="2.5" stroke-linecap="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </div>
        <h2 style="margin:0 0 6px;font-size:20px;color:#1a1f36;">Solicitacao reprovada</h2>
        <p style="margin:0;color:#5b6478;font-size:14px;">
          Ola, <strong>${esc(data.nome_completo.split(' ')[0])}</strong>. Infelizmente sua solicitacao de desbloqueio foi reprovada pelo time de TI.
        </p>
      </div>
      ${urlsBlock(data.urls)}
      <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#c0344b;letter-spacing:.8px;text-transform:uppercase;">
        Motivo da reprovacao
      </p>
      <div style="background:#fdecef;border:1px solid #f0bcc5;border-radius:8px;padding:14px;
                  font-size:14px;color:#1a1f36;line-height:1.6;margin-bottom:24px;">
        ${esc(motivo)}
      </div>
      <div style="background:#f8f9fc;border-radius:8px;padding:14px 16px;">
        <p style="margin:0;font-size:13px;color:#5b6478;">
          Se acreditar que houve um engano ou tiver mais informacoes, entre em contato com o time de TI.
        </p>
      </div>
      <p style="margin:20px 0 0;font-size:13px;color:#8c93a8;text-align:center;">
        Protocolo ${esc(proto)} &bull; ${esc(data.unidade)}
      </p>
    </td></tr>`);
}

/* ── Funcoes exportadas ── */

async function sendRequestEmail({ id, created_at, data, token, appUrl }) {
  if (!SMTP_PASS) {
    console.warn('[mailer] SMTP_PASS nao configurada — e-mail para TI nao enviado.');
    return;
  }
  const proto = '#' + String(id).padStart(5, '0');
  const info = await getTransporter().sendMail({
    from: `"Revalle TI" <${SMTP_USER}>`,
    to: SMTP_TO,
    subject: `[Firewall] Nova solicitacao ${proto} — ${data.nome_completo} (${data.unidade})`,
    html: buildTiHtml({ id, created_at, data, token, appUrl }),
  });
  console.log(`[mailer] e-mail TI enviado: ${info.messageId}`);
}

async function sendApprovedEmail({ id, data }) {
  if (!SMTP_PASS) {
    console.warn('[mailer] SMTP_PASS nao configurada — e-mail de aprovacao nao enviado.');
    return;
  }
  const proto = '#' + String(id).padStart(5, '0');
  const info = await getTransporter().sendMail({
    from: `"Revalle TI" <${SMTP_USER}>`,
    to: data.email,
    subject: `[Revalle] Sua solicitacao ${proto} foi aprovada!`,
    html: buildApprovedHtml({ id, data }),
  });
  console.log(`[mailer] e-mail aprovacao enviado: ${info.messageId}`);
}

async function sendRejectedEmail({ id, data, motivo }) {
  if (!SMTP_PASS) {
    console.warn('[mailer] SMTP_PASS nao configurada — e-mail de reprovacao nao enviado.');
    return;
  }
  const proto = '#' + String(id).padStart(5, '0');
  const info = await getTransporter().sendMail({
    from: `"Revalle TI" <${SMTP_USER}>`,
    to: data.email,
    subject: `[Revalle] Sua solicitacao ${proto} foi reprovada`,
    html: buildRejectedHtml({ id, data, motivo }),
  });
  console.log(`[mailer] e-mail reprovacao enviado: ${info.messageId}`);
}

/* ── E-mail para contratos@revalle.com.br ── */

function formatCnpj(digits) {
  return String(digits || '').replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

function formatPhone(digits) {
  return String(digits || '').replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
}

function formatDateBr(isoDate) {
  if (!isoDate) return '—';
  const [y, m, d] = String(isoDate).split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}

function buildContractHtml({ id, created_at, data, arquivo_token, arquivos_tokens, appUrl }) {
  const proto = '#' + String(id).padStart(5, '0');
  const date  = formatDate(new Date(created_at));

  const vigencia = data.vigencia_fim
    ? `${formatDateBr(data.vigencia_inicio)} ate ${formatDateBr(data.vigencia_fim)}`
    : `A partir de ${formatDateBr(data.vigencia_inicio)} (sem data final)`;

  const fornecedorFields = [
    ['Razao Social',      esc(data.razao_social)],
    ['CNPJ',              esc(formatCnpj(data.cnpj))],
    ['Pessoa de Contato', esc(data.pessoa_contato)],
    ['Telefone',          esc(formatPhone(data.telefone))],
  ];
  const contratoFields = [
    ['Revenda',       esc(data.revenda)],
    ['Setor',         esc(data.setor)],
    ['Vigencia',      esc(vigencia)],
    ['Dono do Servico', esc(data.dono_servico)],
  ];

  const buildRows = (fields) => fields.map(([label, value]) => `
    <tr>
      <td style="padding:10px 14px;width:38%;background:#f8f9fc;border-bottom:1px solid #eaecf3;
                 font-size:13px;font-weight:600;color:#5b6478;white-space:nowrap;">${label}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #eaecf3;font-size:14px;color:#1a1f36;">${value}</td>
    </tr>`).join('');

  const section = (title, rows) => `
    <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#0033A0;letter-spacing:.8px;text-transform:uppercase;">${title}</p>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="border:1px solid #eaecf3;border-radius:8px;overflow:hidden;border-collapse:collapse;margin-bottom:24px;">
      ${rows}
    </table>`;

  // Process files list
  let filesList = [];
  if (data.arquivos && Array.isArray(data.arquivos) && arquivos_tokens && Array.isArray(arquivos_tokens)) {
    data.arquivos.forEach((file, index) => {
      const token = arquivos_tokens[index];
      filesList.push({
        nome: file.nome,
        url: `${appUrl}/api/contratos/${id}/pdf?token=${token}`
      });
    });
  } else {
    // Fallback for backward compatibility
    const token = arquivo_token || (Array.isArray(arquivos_tokens) ? arquivos_tokens[0] : '');
    const filename = data.arquivo_nome || (data.arquivos && data.arquivos[0] ? data.arquivos[0].nome : 'contrato.pdf');
    filesList.push({
      nome: filename,
      url: `${appUrl}/api/contratos/${id}/pdf?token=${token}`
    });
  }

  const filesHtml = filesList.map((file, index) => `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
      <tr>
        <td>
          <a href="${esc(file.url)}"
             style="display:block;text-align:center;padding:14px;background:#0033A0;color:#fff;
                    text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;word-break:break-all;">
            Abrir PDF ${filesList.length > 1 ? (index + 1) : ''}: ${esc(file.nome)}
          </a>
        </td>
      </tr>
    </table>
  `).join('');

  return emailShell(`[Contratos] Novo contrato ${proto} — ${data.razao_social}`, `
    ${headerBlock(`Novo Contrato Recebido &nbsp;&bull;&nbsp; ${esc(proto)}`)}
    <tr><td style="background:#fff;padding:28px;border-radius:0 0 12px 12px;
                   box-shadow:0 8px 24px rgba(16,24,40,.08);">
      <p style="margin:0 0 20px;font-size:13px;color:#5b6478;">
        Recebido em <strong style="color:#1a1f36;">${date}</strong>
      </p>
      ${section('Fornecedor', buildRows(fornecedorFields))}
      ${section('Contrato', buildRows(contratoFields))}
      <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#0033A0;letter-spacing:.8px;text-transform:uppercase;">
        ${filesList.length > 1 ? 'Documentos' : 'Documento'}
      </p>
      ${filesHtml}
    </td></tr>`);
}

async function sendContractEmail({ id, created_at, data, arquivo_token, arquivos_tokens, appUrl }) {
  if (!SMTP_PASS) {
    console.warn('[mailer] SMTP_PASS nao configurada — e-mail de contrato nao enviado.');
    return;
  }
  const proto = '#' + String(id).padStart(5, '0');
  const info = await getTransporter().sendMail({
    from: `"Revalle TI" <${SMTP_USER}>`,
    to: SMTP_TO_CONTRATOS,
    subject: `[Contratos] Novo contrato ${proto} — ${data.razao_social} (${data.revenda})`,
    html: buildContractHtml({ id, created_at, data, arquivo_token, arquivos_tokens, appUrl }),
  });
  console.log(`[mailer] e-mail contrato enviado: ${info.messageId}`);
}

module.exports = { sendRequestEmail, sendApprovedEmail, sendRejectedEmail, sendContractEmail };
