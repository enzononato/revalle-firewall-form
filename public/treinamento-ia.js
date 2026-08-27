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
  const errCpf = document.getElementById('err-cpf');
  const step1Error = document.getElementById('step1Error');

  const btnBackToCpf = document.getElementById('btnBackToCpf');
  const colabNome = document.getElementById('colabNome');
  const colabCpf = document.getElementById('colabCpf');
  const colabChips = document.getElementById('colabChips');

  const formSign = document.getElementById('formSign');
  const checkConsent = document.getElementById('checkConsent');
  const step2Error = document.getElementById('step2Error');
  const btnSign = document.getElementById('btnSign');
  const btnSignText = document.getElementById('btnSignText');
  const btnSignIcon = document.getElementById('btnSignIcon');
  const btnSignSpinner = document.getElementById('btnSignSpinner');

  const btnNewCheck = document.getElementById('btnNewCheck');
  const successTitle = document.getElementById('successTitle');
  const successSub = document.getElementById('successSub');
  const successProto = document.getElementById('successProto');
  const summaryNome = document.getElementById('summaryNome');
  const summaryCpf = document.getElementById('summaryCpf');
  const summaryData = document.getElementById('summaryData');
  const summaryCargo = document.getElementById('summaryCargo');
  const summarySetor = document.getElementById('summarySetor');
  const successIconBadge = document.getElementById('successIconBadge');

  let currentCollaborator = null;

  /* ── CPF Input Mask ── */
  function maskCpf(value) {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
  }

  function formatCpf(d) {
    const s = String(d || '').replace(/\D/g, '');
    return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZone: 'America/Sao_Paulo'
    }).format(new Date(iso));
  }

  cpfInput.addEventListener('input', (e) => {
    e.target.value = maskCpf(e.target.value);
    if (errCpf) errCpf.textContent = '';
    cpfInput.classList.remove('error');
    if (step1Error) {
      step1Error.hidden = true;
      step1Error.textContent = '';
    }
  });

  /* ── Telemetria Comportamental Anti-Robô de Cliques ── */
  let userInteractions = { moves: 0, touches: 0, keyEvents: 0 };
  window.addEventListener('mousemove', () => { userInteractions.moves++; }, { passive: true });
  window.addEventListener('touchmove', () => { userInteractions.touches++; }, { passive: true });
  window.addEventListener('touchstart', () => { userInteractions.touches++; }, { passive: true });
  window.addEventListener('keydown', () => { userInteractions.keyEvents++; }, { passive: true });

  /* ── Desafio Criptográfico Anti-Bot ── */
  let securityChallenge = null;

  async function loadSecurityChallenge() {
    try {
      const res = await fetch('/api/security/challenge');
      const data = await res.json();
      if (data.ok) {
        securityChallenge = data;
      }
    } catch (err) {
      console.warn('[security] falha ao carregar desafio:', err);
    }
  }

  loadSecurityChallenge();

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

  /* ── Step 1: Consultar CPF ── */
  formCpf.addEventListener('submit', async (e) => {
    e.preventDefault();

    const cpfDigits = cpfInput.value.replace(/\D/g, '');
    if (!cpfDigits) {
      errCpf.textContent = 'Informe o número do CPF.';
      cpfInput.classList.add('error');
      return;
    }
    if (cpfDigits.length !== 11) {
      errCpf.textContent = 'CPF incompleto (deve conter 11 dígitos).';
      cpfInput.classList.add('error');
      return;
    }

    // Loading
    btnCheckCpf.disabled = true;
    btnCheckText.textContent = 'Consultando...';
    if (btnCheckIcon) btnCheckIcon.hidden = true;
    if (btnCheckSpinner) btnCheckSpinner.hidden = false;
    if (step1Error) step1Error.hidden = true;

    try {
      if (!securityChallenge) {
        await loadSecurityChallenge();
      }

      const powResult = await solveSecurityChallenge(securityChallenge);
      const hpInput = document.getElementById('website_url');
      const hpVal = hpInput ? hpInput.value : '';

      const behaviorPayload = {
        isTrusted: e.isTrusted !== false,
        webdriver: Boolean(navigator.webdriver),
        moves: userInteractions.moves,
        touches: userInteractions.touches,
        keyEvents: userInteractions.keyEvents,
      };

      let res = await fetch('/api/treinamento-ia/check-cpf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cpf: cpfDigits,
          challengeToken: powResult.token,
          powNonce: powResult.powNonce,
          website_url: hpVal,
          behavior: behaviorPayload,
        }),
      });

      let data = await res.json();

      if (!res.ok && data.expired) {
        await loadSecurityChallenge();
        const retryPow = await solveSecurityChallenge(securityChallenge);
        res = await fetch('/api/treinamento-ia/check-cpf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cpf: cpfDigits,
            challengeToken: retryPow.token,
            powNonce: retryPow.powNonce,
            website_url: hpVal,
            behavior: behaviorPayload,
          }),
        });
        data = await res.json();
      }

      if (!res.ok || !data.ok) {
        step1Error.className = data.not_permitted ? 'alert-box alert-warn' : 'alert-box alert-error';
        step1Error.textContent = data.error || 'CPF não localizado. Verifique os dados ou procure o setor de TI / RH.';
        step1Error.hidden = false;
        loadSecurityChallenge();
        return;
      }

      currentCollaborator = data.colaborador;

      // Se já assinou, mostra comprovante diretamente
      if (currentCollaborator.assinado) {
        showConfirmationScreen(currentCollaborator, true);
        return;
      }

      // Se está pendente, avança para a Etapa 2
      showStep2(currentCollaborator);

    } catch (err) {
      console.error('[ia check-cpf] erro:', err);
      step1Error.textContent = 'Erro de conexão com o servidor. Verifique sua internet e tente novamente.';
      step1Error.hidden = false;
      loadSecurityChallenge();
    } finally {
      btnCheckCpf.disabled = false;
      btnCheckText.textContent = 'Consultar e Continuar';
      if (btnCheckIcon) btnCheckIcon.hidden = false;
      if (btnCheckSpinner) btnCheckSpinner.hidden = true;
    }
  });

  function showStep2(colab) {
    colabNome.textContent = colab.nome_completo;
    colabCpf.textContent = `CPF: ${formatCpf(colab.cpf)}`;
    
    colabChips.innerHTML = '';
    if (colab.cargo) {
      const chip = document.createElement('span');
      chip.className = 'colab-chip';
      chip.textContent = colab.cargo;
      colabChips.appendChild(chip);
    }
    if (colab.setor) {
      const chip = document.createElement('span');
      chip.className = 'colab-chip';
      chip.textContent = colab.setor;
      colabChips.appendChild(chip);
    }
    if (colab.unidade) {
      const chip = document.createElement('span');
      chip.className = 'colab-chip';
      chip.textContent = colab.unidade;
      colabChips.appendChild(chip);
    }

    checkConsent.checked = false;
    if (step2Error) step2Error.hidden = true;

    step1Card.hidden = true;
    step2Card.hidden = false;
    successCard.hidden = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  btnBackToCpf.addEventListener('click', () => {
    step2Card.hidden = true;
    step1Card.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* ── Step 2: Assinar Termo ── */
  formSign.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!checkConsent.checked) {
      step2Error.textContent = 'Marque a caixa de declaração para confirmar sua participação e responsabilidade.';
      step2Error.hidden = false;
      return;
    }

    const cpfToSign = (currentCollaborator && currentCollaborator.cpf) || cpfInput.value.replace(/\D/g, '');

    if (!cpfToSign || cpfToSign.length !== 11) {
      step2Error.textContent = 'Sessão expirada. Consulte seu CPF novamente.';
      step2Error.hidden = false;
      return;
    }

    btnSign.disabled = true;
    btnSignText.textContent = 'Registrando assinatura...';
    if (btnSignIcon) btnSignIcon.hidden = true;
    if (btnSignSpinner) btnSignSpinner.hidden = false;
    if (step2Error) step2Error.hidden = true;

    try {
      const res = await fetch('/api/treinamento-ia/assinar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cpf: cpfToSign,
          aceitou_termos: true,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        step2Error.textContent = data.error || 'Erro ao registrar assinatura. Tente novamente.';
        step2Error.hidden = false;
        return;
      }

      if (!currentCollaborator) {
        currentCollaborator = { cpf: cpfToSign, nome_completo: data.nome_completo || '' };
      }
      currentCollaborator.assinado = true;
      currentCollaborator.assinado_em = data.assinado_em;
      currentCollaborator.protocolo = data.protocolo;

      showConfirmationScreen(currentCollaborator, false);

    } catch (err) {
      console.error('[ia assinar] erro:', err);
      step2Error.textContent = 'Erro ao processar assinatura. Verifique sua conexão e tente novamente.';
      step2Error.hidden = false;
    } finally {
      btnSign.disabled = false;
      btnSignText.textContent = 'Assinar Termo Digitalmente';
      if (btnSignIcon) btnSignIcon.hidden = false;
      if (btnSignSpinner) btnSignSpinner.hidden = true;
    }
  });

  function showConfirmationScreen(colab, alreadySigned) {
    step1Card.hidden = true;
    step2Card.hidden = true;
    successCard.hidden = false;

    if (alreadySigned) {
      successTitle.textContent = 'Termo Já Assinado!';
      successSub.textContent = 'Este colaborador já assinou o Termo de Ciência e Participação do Treinamento de IA, LGPD e Intranet anteriormente.';
      if (successIconBadge) {
        successIconBadge.className = 'success-icon-badge already-signed-badge';
        successIconBadge.innerHTML = `<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`;
      }
    } else {
      successTitle.textContent = 'Termo Assinado com Sucesso!';
      successSub.textContent = 'Sua participação e ciência do treinamento foram registradas com sucesso no sistema.';
      if (successIconBadge) {
        successIconBadge.className = 'success-icon-badge';
        successIconBadge.innerHTML = `<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
      }
    }

    successProto.textContent = colab.protocolo || '#TIA-' + String(colab.id).padStart(5, '0');
    summaryNome.textContent = colab.nome_completo;
    summaryCpf.textContent = formatCpf(colab.cpf);
    summaryData.textContent = formatDateTime(colab.assinado_em);
    summaryCargo.textContent = colab.cargo || 'Não informado';
    summarySetor.textContent = [colab.setor, colab.unidade].filter(Boolean).join(' · ') || 'Não informado';

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  btnNewCheck.addEventListener('click', () => {
    formCpf.reset();
    currentCollaborator = null;
    if (errCpf) errCpf.textContent = '';
    if (step1Error) step1Error.hidden = true;
    cpfInput.classList.remove('error');

    successCard.hidden = true;
    step2Card.hidden = true;
    step1Card.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});
