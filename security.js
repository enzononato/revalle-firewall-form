const crypto = require('crypto');

/* ── Segredo Criptográfico Anti-Bot ── */
const ANTI_BOT_SECRET = process.env.ANTI_BOT_SECRET || 'revalle_anti_bot_secret_sec_2026_' + crypto.randomBytes(16).toString('hex');

/* Dificuldade padrão do micro-desafio de CPU (3 zeros hexadecimais = ~4096 iterações) */
const DEFAULT_DIFFICULTY = 3;

/* Armazenamento em memória de nonces já consumidos (prevenção de replay) */
const usedNonces = new Map(); // nonce -> timestamp

/* Armazenamento de Rate Limiting por IP (Sliding Window) */
const ipHistory = new Map(); // ip -> [timestamps]
const ipCooldowns = new Map(); // ip -> unblockTimestamp

/* Limpeza periódica de memória a cada 10 minutos */
setInterval(() => {
  const now = Date.now();
  // Limpa nonces mais velhos que 35 minutos
  for (const [nonce, ts] of usedNonces.entries()) {
    if (now - ts > 35 * 60 * 1000) {
      usedNonces.delete(nonce);
    }
  }
  // Limpa histórico de IPs inativos há mais de 10 minutos
  for (const [ip, list] of ipHistory.entries()) {
    const fresh = list.filter((t) => now - t < 10 * 60 * 1000);
    if (fresh.length === 0) ipHistory.delete(ip);
    else ipHistory.set(ip, fresh);
  }
  // Limpa cooldowns expirados
  for (const [ip, unblock] of ipCooldowns.entries()) {
    if (now >= unblock) ipCooldowns.delete(ip);
  }
}, 10 * 60 * 1000).unref();

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const list = String(forwarded).split(',');
    return list[0].trim().slice(0, 45);
  }
  return String(req.socket ? req.socket.remoteAddress : '').slice(0, 45) || '127.0.0.1';
}

/**
 * Gera um novo desafio criptográfico com token assinado HMAC.
 */
function createSecurityChallenge(req) {
  const nonce = crypto.randomBytes(12).toString('hex');
  const timestamp = Date.now();
  const difficulty = DEFAULT_DIFFICULTY;

  const payload = `${timestamp}:${nonce}:${difficulty}`;
  const signature = crypto.createHmac('sha256', ANTI_BOT_SECRET).update(payload).digest('hex');
  const token = `${timestamp}:${nonce}:${difficulty}:${signature}`;

  return {
    token,
    nonce,
    difficulty,
    timestamp,
  };
}

/**
 * Valida a resposta do desafio, token assinado, honeypot e regras anti-automação.
 */
function verifySecurityChallenge(req) {
  const body = req.body || {};
  const clientIp = getClientIp(req);
  const now = Date.now();

  // 1. Honeypot check: Se qualquer campo armadilha estiver preenchido, é um bot
  const honeypot = String(body.website_url || body._revalle_hp || body.hp_check || '').trim();
  if (honeypot.length > 0) {
    return { ok: false, error: 'Acesso rejeitado por verificação de segurança.', isBot: true };
  }

  const token = String(body.challengeToken || body.securityToken || '').trim();
  const powNonce = String(body.powNonce !== undefined ? body.powNonce : '').trim();

  if (!token || !powNonce) {
    return {
      ok: false,
      error: 'Token de segurança ausente ou inválido. Por favor, recarregue a página e tente novamente.',
      isBot: true,
    };
  }

  const parts = token.split(':');
  if (parts.length !== 4) {
    return { ok: false, error: 'Formato de token inválido.', isBot: true };
  }

  const [tsStr, nonce, diffStr, signature] = parts;
  const timestamp = Number(tsStr);
  const difficulty = Number(diffStr);

  if (!timestamp || !nonce || !difficulty || !signature) {
    return { ok: false, error: 'Parâmetros de segurança corrompidos.', isBot: true };
  }

  // 2. Validação da assinatura HMAC
  const expectedPayload = `${timestamp}:${nonce}:${difficulty}`;
  const expectedSignature = crypto.createHmac('sha256', ANTI_BOT_SECRET).update(expectedPayload).digest('hex');

  const sigBuffer = Buffer.from(signature, 'hex');
  const expBuffer = Buffer.from(expectedSignature, 'hex');

  if (sigBuffer.length !== expBuffer.length || !crypto.timingSafeEqual(sigBuffer, expBuffer)) {
    return { ok: false, error: 'Assinatura de segurança inválida.', isBot: true };
  }

  // 3. Validação de expiração e tempo de permanência
  const elapsed = now - timestamp;
  if (elapsed < 800) {
    // Menos de 800ms é característico de script automatizado disparando instantaneamente
    return {
      ok: false,
      error: 'Ação realizada muito rapidamente. Aguarde um instante e tente novamente.',
      isBot: true,
    };
  }
  if (elapsed > 30 * 60 * 1000) {
    return {
      ok: false,
      expired: true,
      error: 'Sua sessão expirou por inatividade. Por favor, recarregue a página para continuar.',
    };
  }

  // 4. Prevenção de reutilização do mesmo token (Replay Attack)
  if (usedNonces.has(nonce)) {
    return {
      ok: false,
      replayed: true,
      error: 'Token de segurança já utilizado. Por favor, recarregue a página.',
      isBot: true,
    };
  }

  // 5. Validação do Proof-of-Work (SHA-256)
  const hash = crypto.createHash('sha256').update(nonce + powNonce).digest('hex');
  const targetPrefix = '0'.repeat(difficulty);

  if (!hash.startsWith(targetPrefix)) {
    return {
      ok: false,
      error: 'Desafio de segurança não resolvido corretamente.',
      isBot: true,
    };
  }

  // Marca o nonce como consumido
  usedNonces.set(nonce, now);

  return { ok: true };
}

/**
 * Rate Limiter para rotas de validação de CPF (proteção contra rajadas automatizadas).
 * Permite até `maxPerMinute` requisições por IP na janela de 60s.
 */
function antiBotRateLimiter({ maxPerMinute = 15, cooldownMinutes = 3 } = {}) {
  return (req, res, next) => {
    const ip = getClientIp(req);
    const now = Date.now();

    // Verifica se o IP está em cooldown
    const unblock = ipCooldowns.get(ip);
    if (unblock && now < unblock) {
      const waitSeconds = Math.ceil((unblock - now) / 1000);
      return res.status(429).json({
        ok: false,
        rate_limited: true,
        error: `Muitas tentativas consecutivas detectadas. Por segurança, aguarde ${waitSeconds} segundos para tentar novamente.`,
      });
    }

    // Registra requisição no histórico do IP
    const list = (ipHistory.get(ip) || []).filter((t) => now - t < 60 * 1000);
    list.push(now);
    ipHistory.set(ip, list);

    if (list.length > maxPerMinute) {
      // Aplica cooldown temporário
      ipCooldowns.set(ip, now + cooldownMinutes * 60 * 1000);
      return res.status(429).json({
        ok: false,
        rate_limited: true,
        error: `Limite de tentativas excedido para esta conexão de internet. Aguarde ${cooldownMinutes} minutos para tentar novamente.`,
      });
    }

    next();
  };
}

module.exports = {
  createSecurityChallenge,
  verifySecurityChallenge,
  antiBotRateLimiter,
  getClientIp,
};
