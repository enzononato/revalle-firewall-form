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
    });
  }
  return transporter;
}

function formatCpf(digits) {
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function formatDate(date) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

function buildHtml({ id, created_at, data }) {
  const protocol = '#' + String(id).padStart(5, '0');
  const date = formatDate(new Date(created_at));
  const cpfFormatted = formatCpf(data.cpf);

  const urlRows = data.urls.map((url) => `
    <tr>
      <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;">
        <a href="${url}" style="color:#0033A0;text-decoration:none;font-size:14px;word-break:break-all;">${url}</a>
      </td>
    </tr>`).join('');

  const fields = [
    ['Nome completo', data.nome_completo],
    ['CPF',           cpfFormatted],
    ['Unidade',       data.unidade],
    ['Cargo',         data.cargo],
    ['Setor',         data.setor],
    ['Função',        data.funcao],
  ];

  const fieldRows = fields.map(([label, value]) => `
    <tr>
      <td style="padding:10px 14px;width:38%;background:#f8f9fc;border-bottom:1px solid #eaecf3;
                 font-size:13px;font-weight:600;color:#5b6478;white-space:nowrap;">
        ${label}
      </td>
      <td style="padding:10px 14px;border-bottom:1px solid #eaecf3;
                 font-size:14px;color:#1a1f36;">
        ${value}
      </td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Nova Solicitacao de Desbloqueio ${protocol}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0033A0 0%,#002677 100%);
                       border-radius:12px 12px 0 0;padding:24px 28px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <div style="width:44px;height:44px;background:#ffffff;border-radius:10px;
                                display:inline-block;text-align:center;line-height:44px;
                                font-size:22px;font-weight:700;color:#0033A0;
                                font-style:italic;letter-spacing:-1px;">R</div>
                  </td>
                  <td style="padding-left:12px;vertical-align:middle;">
                    <div style="font-size:20px;font-weight:700;color:#ffffff;
                                letter-spacing:-0.5px;line-height:1.1;">revalle</div>
                    <div style="font-size:11px;font-weight:500;color:rgba(255,255,255,0.85);
                                letter-spacing:0.4px;text-transform:uppercase;margin-top:2px;">
                      Revenda e Distribuicao Ambev
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Title bar -->
          <tr>
            <td style="background:#0a3fbf;padding:14px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size:15px;font-weight:700;color:#ffffff;">
                      Nova Solicitacao de Desbloqueio de Sites
                    </span>
                  </td>
                  <td align="right">
                    <span style="font-size:13px;color:rgba(255,255,255,0.85);white-space:nowrap;">
                      ${protocol}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:28px;border-radius:0 0 12px 12px;
                       box-shadow:0 8px 24px rgba(16,24,40,0.08);">

              <!-- Date -->
              <p style="margin:0 0 20px;font-size:13px;color:#5b6478;">
                Recebido em <strong style="color:#1a1f36;">${date}</strong>
              </p>

              <!-- Section: Colaborador -->
              <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#0033A0;
                        letter-spacing:0.8px;text-transform:uppercase;">
                Colaborador
              </p>
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="border:1px solid #eaecf3;border-radius:8px;
                            overflow:hidden;border-collapse:collapse;margin-bottom:28px;">
                ${fieldRows}
              </table>

              <!-- Section: URLs -->
              <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#0033A0;
                        letter-spacing:0.8px;text-transform:uppercase;">
                Sites Solicitados (${data.urls.length})
              </p>
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="border:1px solid #eaecf3;border-radius:8px;
                            overflow:hidden;border-collapse:collapse;margin-bottom:24px;padding:8px 14px;">
                <tr><td style="padding:8px 14px 0;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    ${urlRows}
                  </table>
                </td></tr>
              </table>

              ${data.justificativa ? `
              <!-- Section: Justificativa -->
              <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#0033A0;
                        letter-spacing:0.8px;text-transform:uppercase;">
                Justificativa
              </p>
              <div style="background:#f8f9fc;border:1px solid #eaecf3;border-radius:8px;
                          padding:14px;font-size:14px;color:#1a1f36;line-height:1.6;margin-bottom:24px;">
                ${data.justificativa}
              </div>` : ''}

              <!-- CTA hint -->
              <div style="background:#eef3ff;border-radius:8px;padding:14px 16px;">
                <p style="margin:0;font-size:13px;color:#0033A0;font-weight:500;">
                  Analise esta solicitacao e libere os sites no firewall caso aprovado.
                </p>
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 0 0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#8c93a8;">
                Este e-mail foi gerado automaticamente pelo sistema de solicitacoes da
                <strong style="color:#5b6478;">Revalle</strong>.
              </p>
              <p style="margin:6px 0 0;font-size:12px;color:#b0b7c8;">
                Protocolo ${protocol} &nbsp;&middot;&nbsp; ${date}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendRequestEmail({ id, created_at, data }) {
  if (!SMTP_PASS) {
    console.warn('[mailer] SMTP_PASS nao configurada — e-mail nao enviado.');
    return;
  }

  const protocol = '#' + String(id).padStart(5, '0');
  const subject = `[Firewall] Nova solicitacao ${protocol} — ${data.nome_completo} (${data.unidade})`;

  const info = await getTransporter().sendMail({
    from: `"Revalle TI" <${SMTP_USER}>`,
    to: SMTP_TO,
    subject,
    html: buildHtml({ id, created_at, data }),
  });

  console.log(`[mailer] e-mail enviado: ${info.messageId}`);
}

module.exports = { sendRequestEmail };
