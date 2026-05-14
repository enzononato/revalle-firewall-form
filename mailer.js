const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || 'mail.revalle.com.br';
const SMTP_PORT = Number(process.env.SMTP_PORT) || 465;
const SMTP_USER = process.env.SMTP_USER || 'projetos.ti@revalle.com.br';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_TO   = process.env.SMTP_TO   || SMTP_USER;

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
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

/* ── Templates simples e compactos ── */

function buildTiHtml({ id, created_at, data, token, appUrl }) {
  const proto = '#' + String(id).padStart(5, '0');
  const date  = formatDate(new Date(created_at));
  const approveUrl = `${appUrl}/api/approve/${token}`;
  const rejectUrl  = `${appUrl}/api/reject/${token}`;
  const urlItems = data.urls.map(u => `<li>${esc(u)}</li>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f4f6fb;margin:0;padding:20px;">
<div style="max-width:580px;margin:0 auto;background:#fff;border-radius:8px;padding:28px;border:1px solid #dde3ef;">
  <div style="background:#0033A0;color:#fff;padding:16px 20px;border-radius:6px;margin-bottom:20px;">
    <strong style="font-size:16px;">Revalle &mdash; Nova Solicitacao de Desbloqueio ${esc(proto)}</strong>
  </div>
  <p style="color:#555;margin:0 0 16px;">Recebido em <strong>${date}</strong></p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
    <tr><td style="padding:7px 10px;background:#f8f9fc;font-weight:bold;width:35%;border:1px solid #e0e0e0;">Nome</td><td style="padding:7px 10px;border:1px solid #e0e0e0;">${esc(data.nome_completo)}</td></tr>
    <tr><td style="padding:7px 10px;background:#f8f9fc;font-weight:bold;border:1px solid #e0e0e0;">CPF</td><td style="padding:7px 10px;border:1px solid #e0e0e0;">${esc(formatCpf(data.cpf))}</td></tr>
    <tr><td style="padding:7px 10px;background:#f8f9fc;font-weight:bold;border:1px solid #e0e0e0;">E-mail</td><td style="padding:7px 10px;border:1px solid #e0e0e0;">${esc(data.email)}</td></tr>
    <tr><td style="padding:7px 10px;background:#f8f9fc;font-weight:bold;border:1px solid #e0e0e0;">Unidade</td><td style="padding:7px 10px;border:1px solid #e0e0e0;">${esc(data.unidade)}</td></tr>
    <tr><td style="padding:7px 10px;background:#f8f9fc;font-weight:bold;border:1px solid #e0e0e0;">Cargo</td><td style="padding:7px 10px;border:1px solid #e0e0e0;">${esc(data.cargo)}</td></tr>
    <tr><td style="padding:7px 10px;background:#f8f9fc;font-weight:bold;border:1px solid #e0e0e0;">Setor</td><td style="padding:7px 10px;border:1px solid #e0e0e0;">${esc(data.setor)}</td></tr>
    <tr><td style="padding:7px 10px;background:#f8f9fc;font-weight:bold;border:1px solid #e0e0e0;">Funcao</td><td style="padding:7px 10px;border:1px solid #e0e0e0;">${esc(data.funcao)}</td></tr>
  </table>
  <p style="font-weight:bold;color:#0033A0;margin:0 0 8px;">Sites Solicitados (${data.urls.length}):</p>
  <ul style="margin:0 0 20px;padding-left:18px;color:#333;">${urlItems}</ul>
  ${data.justificativa ? `<p style="font-weight:bold;color:#0033A0;margin:0 0 6px;">Justificativa:</p><p style="background:#f8f9fc;padding:10px;border-radius:4px;margin:0 0 20px;">${esc(data.justificativa)}</p>` : ''}
  <table style="width:100%;border-collapse:collapse;">
    <tr>
      <td style="padding-right:8px;"><a href="${esc(approveUrl)}" style="display:block;text-align:center;padding:12px;background:#1a7a3c;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">Aprovar</a></td>
      <td style="padding-left:8px;"><a href="${esc(rejectUrl)}" style="display:block;text-align:center;padding:12px;background:#c0344b;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">Reprovar</a></td>
    </tr>
  </table>
  <p style="margin:16px 0 0;font-size:11px;color:#aaa;text-align:center;">Estes links sao de uso unico. Apos clicar, a solicitacao sera encerrada.</p>
</div>
</body></html>`;
}

function buildApprovedHtml({ id, data }) {
  const proto = '#' + String(id).padStart(5, '0');
  const urlItems = data.urls.map(u => `<li>${esc(u)}</li>`).join('');
  const firstName = esc(data.nome_completo.split(' ')[0]);

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f4f6fb;margin:0;padding:20px;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:28px;border:1px solid #dde3ef;">
  <div style="background:#0033A0;color:#fff;padding:16px 20px;border-radius:6px;margin-bottom:20px;">
    <strong style="font-size:16px;">Revalle &mdash; Solicitacao ${esc(proto)} Aprovada</strong>
  </div>
  <p style="color:#333;">Ola, <strong>${firstName}</strong>! Sua solicitacao de desbloqueio foi <strong style="color:#1a7a3c;">aprovada</strong> pelo time de TI.</p>
  <p style="font-weight:bold;color:#0033A0;margin:16px 0 8px;">Sites liberados:</p>
  <ul style="margin:0 0 20px;padding-left:18px;color:#333;">${urlItems}</ul>
  <p style="background:#eef3ff;padding:12px;border-radius:6px;color:#0033A0;font-size:13px;margin:0;">Em caso de duvidas, entre em contato com a equipe de TI.</p>
  <p style="margin:16px 0 0;font-size:11px;color:#aaa;text-align:center;">Protocolo ${esc(proto)} &bull; ${esc(data.unidade)} &bull; E-mail gerado automaticamente por Revalle</p>
</div>
</body></html>`;
}

function buildRejectedHtml({ id, data, motivo }) {
  const proto = '#' + String(id).padStart(5, '0');
  const urlItems = data.urls.map(u => `<li>${esc(u)}</li>`).join('');
  const firstName = esc(data.nome_completo.split(' ')[0]);

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f4f6fb;margin:0;padding:20px;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:28px;border:1px solid #dde3ef;">
  <div style="background:#0033A0;color:#fff;padding:16px 20px;border-radius:6px;margin-bottom:20px;">
    <strong style="font-size:16px;">Revalle &mdash; Solicitacao ${esc(proto)} Reprovada</strong>
  </div>
  <p style="color:#333;">Ola, <strong>${firstName}</strong>. Infelizmente sua solicitacao de desbloqueio foi <strong style="color:#c0344b;">reprovada</strong> pelo time de TI.</p>
  <p style="font-weight:bold;color:#0033A0;margin:16px 0 8px;">Sites da solicitacao:</p>
  <ul style="margin:0 0 16px;padding-left:18px;color:#333;">${urlItems}</ul>
  <p style="font-weight:bold;color:#c0344b;margin:0 0 6px;">Motivo da reprovacao:</p>
  <p style="background:#fdecef;padding:12px;border-radius:6px;color:#333;margin:0 0 16px;">${esc(motivo)}</p>
  <p style="background:#f8f9fc;padding:12px;border-radius:6px;color:#555;font-size:13px;margin:0;">Se acreditar que houve um engano, entre em contato com o time de TI.</p>
  <p style="margin:16px 0 0;font-size:11px;color:#aaa;text-align:center;">Protocolo ${esc(proto)} &bull; ${esc(data.unidade)} &bull; E-mail gerado automaticamente por Revalle</p>
</div>
</body></html>`;
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

module.exports = { sendRequestEmail, sendApprovedEmail, sendRejectedEmail };
