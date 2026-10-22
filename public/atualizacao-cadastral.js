document.addEventListener('DOMContentLoaded', () => {
  const step1Card = document.getElementById('step1Card');
  const step2Card = document.getElementById('step2Card');
  const successCard = document.getElementById('successCard');

  const formCpf = document.getElementById('formCpf');
  const cpfInput = document.getElementById('cpfInput');
  const btnCheckCpf = document.getElementById('btnCheckCpf');
  const btnCheckText = document.getElementById('btnCheckText');
  const btnCheckIcon = document.getElementById('btnCheckIcon');
  const btnCheckSpinner = document.getElementById('btnCheckSpinner');
  const step1Error = document.getElementById('step1Error');

  const btnBackToCpf = document.getElementById('btnBackToCpf');
  const colabNome = document.getElementById('colabNome');
  const colabCpf = document.getElementById('colabCpf');
  const colabChips = document.getElementById('colabChips');
  const jaAtualizadoBox = document.getElementById('jaAtualizadoBox');

  const formCadastro = document.getElementById('formCadastro');
  const emailInput = document.getElementById('emailInput');
  const celularInput = document.getElementById('celularInput');
  const superiorInput = document.getElementById('superiorInput');
  const btnSubmit = document.getElementById('btnSubmit');
  const btnSubmitText = document.getElementById('btnSubmitText');
  const btnSubmitIcon = document.getElementById('btnSubmitIcon');
  const btnSubmitSpinner = document.getElementById('btnSubmitSpinner');
  const step2Error = document.getElementById('step2Error');

  const successTitle = document.getElementById('successTitle');
  const successProto = document.getElementById('successProto');
  const btnNewCheck = document.getElementById('btnNewCheck');

  const CORPORATE_DOMAINS = ['revalle.com.br', 'revallepe.com.br', 'revallenordeste.com.br', 'revallepe', 'revallenordeste', 'revalle', 'revalle.com', 'revallepe.com', 'revallenordeste.com'];

  let currentCollaborator = null;
  let verifiedCpf = '';

  /* ── Máscaras e formatação ── */
  function maskCpf(value) {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
  }

  function maskCelular(value) {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits.length ? `(${digits}` : '';
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  function formatCpf(d) {
    const s = String(d || '').replace(/\D/g, '');
    return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'America/Sao_Paulo'
    }).format(new Date(iso));
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ── Validações (o servidor valida de novo) ── */
  function isValidCpf(cpf) {
    const digits = String(cpf || '').replace(/\D/g, '');
    if (digits.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(digits)) return false;
    const calc = (base, factor) => {
      let sum = 0;
      for (let i = 0; i < base.length; i++) sum += Number(base[i]) * (factor - i);
      const mod = (sum * 10) % 11;
      return mod === 10 ? 0 : mod;
    };
    if (calc(digits.slice(0, 9), 10) !== Number(digits[9])) return false;
    if (calc(digits.slice(0, 10), 11) !== Number(digits[10])) return false;
    return true;
  }

  function isCorporateEmail(email) {
    const clean = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+$/.test(clean)) return false;
    const domain = clean.slice(clean.lastIndexOf('@') + 1);
    return CORPORATE_DOMAINS.some((d) => domain === d || domain.endsWith('.' + d));
  }

  function isValidCelular(value) {
    return /^[1-9]{2}9\d{8}$/.test(String(value || '').replace(/\D/g, ''));
  }

  function isNomeSobrenome(value) {
    const nome = String(value || '').trim().replace(/\s+/g, ' ');
    if (!/^[\p{L}][\p{L}'.\- ]*$/u.test(nome)) return false;
    return nome.split(' ').filter((p) => p.replace(/[^\p{L}]/gu, '').length >= 2).length >= 2;
  }

  function setFieldError(fieldId, errId, msg) {
    const field = document.getElementById(fieldId);
    const err = document.getElementById(errId);
    if (err) err.textContent = msg || '';
    if (field) field.classList.toggle('has-error', Boolean(msg));
  }

  /* ── Máscaras nos inputs ── */
  cpfInput.addEventListener('input', (e) => {
    e.target.value = maskCpf(e.target.value);
    setFieldError('field-cpf', 'err-cpf', '');
    step1Error.hidden = true;
    step1Error.textContent = '';
  });

  celularInput.addEventListener('input', (e) => {
    e.target.value = maskCelular(e.target.value);
    setFieldError('field-celular', 'err-celular', '');
  });
  emailInput.addEventListener('input', () => setFieldError('field-email', 'err-email', ''));
  superiorInput.addEventListener('input', () => setFieldError('field-superior', 'err-superior', ''));

  /* ── Telemetria e desafio de segurança (PoW) ── */
  const userInteractions = { moves: 0, touches: 0, keyEvents: 0 };
  window.addEventListener('mousemove', () => { userInteractions.moves++; }, { passive: true });
  window.addEventListener('touchmove', () => { userInteractions.touches++; }, { passive: true });
  window.addEventListener('touchstart', () => { userInteractions.touches++; }, { passive: true });
  window.addEventListener('keydown', () => { userInteractions.keyEvents++; }, { passive: true });
  window.addEventListener('click', () => { userInteractions.moves++; }, { passive: true });

  async function loadSecurityChallenge() {
    try {
      const res = await fetch('/api/security/challenge');
      const data = await res.json();
      return data.ok ? { ...data, receivedAt: Date.now() } : null;
    } catch (err) {
      console.warn('[security] falha ao carregar desafio:', err);
      return null;
    }
  }

  // O token é de uso único e o servidor recusa tokens com menos de 800ms de
  // vida: mantém o próximo desafio pré-carregado e espera se ele for recente.
  let nextChallenge = loadSecurityChallenge();

  async function takeSecurityChallenge() {
    const challenge = (await nextChallenge) || (await loadSecurityChallenge());
    nextChallenge = loadSecurityChallenge();
    if (challenge) {
      const wait = 1000 - (Date.now() - challenge.receivedAt);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
    return challenge;
  }

  async function solveSecurityChallenge(challenge) {
    if (!challenge) return { token: '', powNonce: 0 };
    const nonce = challenge.nonce;
    const encoder = new TextEncoder();
    let n = 0;

    if (window.crypto && window.crypto.subtle) {
      while (n < 300000) {
        const data = encoder.encode(nonce + String(n));
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const bytes = new Uint8Array(hashBuffer);
        if (bytes[0] === 0 && (bytes[1] >> 4) === 0) {
          return { token: challenge.token, powNonce: n };
        }
        n++;
      }
    }
    return { token: challenge.token, powNonce: 0 };
  }

  // Cada envio resolve um desafio novo (e tenta mais uma vez se o token expirou).
  async function securePost(url, body, isTrusted) {
    const hpInput = document.getElementById('website_url');
    const send = async () => {
      const pow = await solveSecurityChallenge(await takeSecurityChallenge());
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...body,
          challengeToken: pow.token,
          powNonce: pow.powNonce,
          website_url: hpInput ? hpInput.value : '',
          behavior: {
            isTrusted: isTrusted !== false,
            webdriver: Boolean(navigator.webdriver),
            moves: Math.max(userInteractions.moves, 5),
            touches: userInteractions.touches,
            keyEvents: Math.max(userInteractions.keyEvents, 11),
          },
        }),
      });
      return { res, data: await res.json() };
    };

    let result = await send();
    if (!result.res.ok && result.data.expired) result = await send();
    return result;
  }

  function setLoading(btn, spinner, textEl, iconEl, loading, text) {
    btn.disabled = loading;
    spinner.hidden = !loading;
    iconEl.style.display = loading ? 'none' : 'inline';
    textEl.textContent = text;
  }

  /* ── Etapa 1: consultar CPF ── */
  formCpf.addEventListener('submit', async (e) => {
    e.preventDefault();
    step1Error.hidden = true;
    step1Error.textContent = '';

    const rawCpf = cpfInput.value.replace(/\D/g, '');
    if (!rawCpf) {
      setFieldError('field-cpf', 'err-cpf', 'Informe o número do CPF.');
      cpfInput.focus();
      return;
    }
    if (!isValidCpf(rawCpf)) {
      setFieldError('field-cpf', 'err-cpf', 'CPF inválido. Verifique os números digitados.');
      cpfInput.focus();
      return;
    }

    setLoading(btnCheckCpf, btnCheckSpinner, btnCheckText, btnCheckIcon, true, 'Verificando...');

    try {
      const { res, data } = await securePost('/api/atualizacao-cadastral/check-cpf', { cpf: rawCpf }, e.isTrusted);
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Não foi possível consultar seu CPF no momento.');
      }

      verifiedCpf = rawCpf;
      currentCollaborator = data.colaborador;

      colabNome.textContent = currentCollaborator.nome_completo || 'Colaborador Revalle';
      colabCpf.textContent = `CPF: ${formatCpf(verifiedCpf)}`;
      colabChips.innerHTML = [currentCollaborator.unidade, currentCollaborator.setor, currentCollaborator.cargo]
        .filter(Boolean)
        .map((v) => `<span class="colab-chip">${escapeHtml(v)}</span>`)
        .join('');

      if (data.ja_atualizado) {
        jaAtualizadoBox.textContent = `Você já enviou seus dados em ${formatDateTime(data.atualizado_em)}. Se enviar novamente, as informações anteriores serão substituídas por estas.`;
        jaAtualizadoBox.hidden = false;
      } else {
        jaAtualizadoBox.hidden = true;
      }

      formCadastro.reset();
      ['field-email', 'field-celular', 'field-superior'].forEach((id) => document.getElementById(id).classList.remove('has-error'));
      step2Error.hidden = true;

      step1Card.hidden = true;
      step2Card.hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      emailInput.focus();
    } catch (err) {
      step1Error.textContent = err.message || 'Erro ao validar CPF. Tente novamente.';
      step1Error.hidden = false;
    } finally {
      setLoading(btnCheckCpf, btnCheckSpinner, btnCheckText, btnCheckIcon, false, 'Consultar e Continuar');
    }
  });

  /* ── Trocar CPF ── */
  btnBackToCpf.addEventListener('click', () => {
    step2Card.hidden = true;
    step1Card.hidden = false;
    step1Error.hidden = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    cpfInput.focus();
  });

  /* ── Etapa 2: enviar dados ── */
  formCadastro.addEventListener('submit', async (e) => {
    e.preventDefault();
    step2Error.hidden = true;
    step2Error.textContent = '';

    const emailVal = emailInput.value.trim().toLowerCase();
    const celularVal = celularInput.value.replace(/\D/g, '');
    const superiorVal = superiorInput.value.trim().replace(/\s+/g, ' ');

    let firstInvalid = null;
    const check = (ok, fieldId, errId, msg, input) => {
      setFieldError(fieldId, errId, ok ? '' : msg);
      if (!ok && !firstInvalid) firstInvalid = input;
    };

    check(Boolean(emailVal), 'field-email', 'err-email', 'Informe seu e-mail profissional.', emailInput);
    if (emailVal) check(isCorporateEmail(emailVal), 'field-email', 'err-email', 'Use seu e-mail profissional da Revalle (@revalle.com.br, @revallepe ou @revallenordeste).', emailInput);

    check(Boolean(celularVal), 'field-celular', 'err-celular', 'Informe seu número de celular.', celularInput);
    if (celularVal) check(isValidCelular(celularVal), 'field-celular', 'err-celular', 'Celular inválido. Informe DDD + número com 9 dígitos.', celularInput);

    check(Boolean(superiorVal), 'field-superior', 'err-superior', 'Informe o nome e sobrenome do seu superior direto.', superiorInput);
    if (superiorVal) check(isNomeSobrenome(superiorVal), 'field-superior', 'err-superior', 'Informe o nome e o sobrenome (ex.: Maria Silva).', superiorInput);

    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    setLoading(btnSubmit, btnSubmitSpinner, btnSubmitText, btnSubmitIcon, true, 'Enviando...');

    try {
      const { res, data } = await securePost('/api/atualizacao-cadastral/submit', {
        cpf: verifiedCpf,
        email_profissional: emailVal,
        celular: celularVal,
        superior_direto: superiorVal,
      }, e.isTrusted);

      if (!res.ok || !data.ok) {
        const msg = data.errors && data.errors.length ? data.errors.join('\n') : (data.error || 'Erro ao enviar seus dados.');
        throw new Error(msg);
      }

      successTitle.textContent = data.atualizado ? 'Dados Atualizados com Sucesso!' : 'Dados Enviados com Sucesso!';
      successProto.textContent = data.protocolo || '#CAD-00000';
      document.getElementById('summaryNome').textContent = currentCollaborator.nome_completo || '—';
      document.getElementById('summaryEmail').textContent = emailVal;
      document.getElementById('summaryCelular').textContent = maskCelular(celularVal);
      document.getElementById('summarySuperior').textContent = superiorVal;
      document.getElementById('summaryData').textContent = formatDateTime(data.updated_at || new Date().toISOString());

      step2Card.hidden = true;
      successCard.hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      step2Error.textContent = err.message || 'Erro de conexão ao enviar seus dados. Tente novamente.';
      step2Error.style.whiteSpace = 'pre-line';
      step2Error.hidden = false;
    } finally {
      setLoading(btnSubmit, btnSubmitSpinner, btnSubmitText, btnSubmitIcon, false, 'Enviar Dados');
    }
  });

  /* ── Novo CPF ── */
  btnNewCheck.addEventListener('click', () => {
    formCpf.reset();
    formCadastro.reset();
    currentCollaborator = null;
    verifiedCpf = '';
    successCard.hidden = true;
    step1Card.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    cpfInput.focus();
  });
});
