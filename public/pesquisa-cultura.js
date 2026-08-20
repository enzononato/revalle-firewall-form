document.addEventListener('DOMContentLoaded', () => {
  // Cards / Views
  const step1Card = document.getElementById('step1Card');
  const step2Card = document.getElementById('step2Card');
  const successCard = document.getElementById('successCard');

  // Step 1 Elements
  const formCpf = document.getElementById('formCpf');
  const cpfInput = document.getElementById('cpfInput');
  const errCpf = document.getElementById('err-cpf');
  const step1Error = document.getElementById('step1Error');
  const btnCheckCpf = document.getElementById('btnCheckCpf');
  const btnCheckText = document.getElementById('btnCheckText');
  const btnCheckIcon = document.getElementById('btnCheckIcon');
  const btnCheckSpinner = document.getElementById('btnCheckSpinner');

  // Step 2 Elements
  const formSurvey = document.getElementById('formSurvey');
  const pesquisaGreeting = document.getElementById('pesquisaGreeting');
  const btnBackToCpf = document.getElementById('btnBackToCpf');
  const btnSubmitSurvey = document.getElementById('btnSubmitSurvey');
  const btnSubmitText = document.getElementById('btnSubmitText');
  const btnSubmitIcon = document.getElementById('btnSubmitIcon');
  const btnSubmitSpinner = document.getElementById('btnSubmitSpinner');
  const surveyError = document.getElementById('surveyError');

  // Progress Elements
  const progressCountText = document.getElementById('progressCountText');
  const progressFillBar = document.getElementById('progressFillBar');

  // Selection Inputs
  const inputUnidade = document.getElementById('inputUnidade');
  const inputArea = document.getElementById('inputArea');
  const inputTempo = document.getElementById('inputTempo');

  // Success Elements
  const btnDone = document.getElementById('btnDone');

  let verifiedCpf = '';

  /* ── CPF Mask ── */
  function maskCpf(val) {
    const v = String(val || '').replace(/\D/g, '').slice(0, 11);
    if (v.length <= 3) return v;
    if (v.length <= 6) return `${v.slice(0, 3)}.${v.slice(3)}`;
    if (v.length <= 9) return `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6)}`;
    return `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6, 9)}-${v.slice(9, 11)}`;
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

  /* ── Interactive Option Grid Handlers ── */
  function bindOptionGroup(containerId, inputEl) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip-btn');
      if (!btn) return;

      const val = btn.dataset.val;
      inputEl.value = val;

      container.querySelectorAll('.chip-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');

      const card = btn.closest('.survey-card');
      if (card) card.classList.add('answered');

      updateLiveProgress();
    });
  }

  bindOptionGroup('optsUnidade', inputUnidade);
  bindOptionGroup('optsArea', inputArea);
  bindOptionGroup('optsTempo', inputTempo);

  /* ── Textarea Live Character Counter ── */
  const textareas = formSurvey.querySelectorAll('textarea');
  textareas.forEach((ta) => {
    const footer = ta.parentElement ? ta.parentElement.querySelector('.char-count') : null;
    
    ta.addEventListener('input', () => {
      const len = ta.value.trim().length;
      if (footer) {
        footer.textContent = `${len} caractere${len === 1 ? '' : 's'}`;
        footer.style.color = len > 0 ? '#2563eb' : '#94a3b8';
      }

      const card = ta.closest('.survey-card');
      if (card) {
        if (len > 0) card.classList.add('answered');
        else card.classList.remove('answered');
      }

      updateLiveProgress();
    });
  });

  /* ── Live Progress Calculation (14 perguntas) ── */
  function updateLiveProgress() {
    const requiredFields = [
      inputUnidade.value.trim(),
      inputArea.value.trim(),
      inputTempo.value.trim(),
      document.getElementById('pPesaFavorContra').value.trim(),
      document.getElementById('pFuturo').value.trim(),
      document.getElementById('pValores').value.trim(),
      document.getElementById('pNaoMudar').value.trim(),
      document.getElementById('pDiaDificil').value.trim(),
      document.getElementById('pAlgoSemDizer').value.trim(),
      document.getElementById('pLidDesafio').value.trim(),
      document.getElementById('pLidEntrega').value.trim(),
      document.getElementById('pLidUltimoFeed').value.trim(),
      document.getElementById('pLidIncoerencia').value.trim(),
      document.getElementById('pLidGostaMudar').value.trim(),
    ];

    const filledCount = requiredFields.filter((val) => val.length > 0).length;
    const totalCount = 14;
    const percent = Math.round((filledCount / totalCount) * 100);

    if (progressCountText) {
      progressCountText.textContent = `${filledCount} de ${totalCount} respondidas (${percent}%)`;
      if (filledCount === totalCount) {
        progressCountText.style.background = '#dcfce7';
        progressCountText.style.color = '#15803d';
      } else {
        progressCountText.style.background = '#eff6ff';
        progressCountText.style.color = '#1d4ed8';
      }
    }

    if (progressFillBar) {
      progressFillBar.style.width = `${percent}%`;
    }
  }

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

  // Carrega o desafio no background no momento em que a página abre
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
        // Verifica 3 zeros hexadecimais (byte 0 = 0x00, nibble superior do byte 1 = 0)
        if (bytes[0] === 0 && (bytes[1] >> 4) === 0) {
          return { token: challenge.token, powNonce: n };
        }
        n++;
      }
    }
    return { token: challenge.token, powNonce: 0 };
  }

  /* ── Step 1: Verificar CPF ── */
  formCpf.addEventListener('submit', async (e) => {
    e.preventDefault();

    const cpfDigits = cpfInput.value.replace(/\D/g, '');
    if (!cpfDigits) {
      if (errCpf) errCpf.textContent = 'Informe o número do CPF.';
      cpfInput.classList.add('error');
      return;
    }
    if (cpfDigits.length !== 11) {
      if (errCpf) errCpf.textContent = 'CPF incompleto (deve conter 11 dígitos).';
      cpfInput.classList.add('error');
      return;
    }

    btnCheckCpf.disabled = true;
    btnCheckText.textContent = 'Validando acesso...';
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

      let res = await fetch('/api/pesquisa-cultura/check-cpf', {
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

      // Se o token expirou (inatividade), renova automaticamente e tenta mais uma vez
      if (!res.ok && data.expired) {
        await loadSecurityChallenge();
        const retryPow = await solveSecurityChallenge(securityChallenge);
        res = await fetch('/api/pesquisa-cultura/check-cpf', {
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
        step1Error.className = data.already_participated ? 'alert-box alert-warn' : 'alert-box alert-error';
        step1Error.textContent = data.error || 'CPF não localizado. Verifique os dados ou contate o Departamento Pessoal.';
        step1Error.hidden = false;
        // Atualiza desafio para a próxima tentativa
        loadSecurityChallenge();
        return;
      }

      verifiedCpf = cpfDigits;
      if (pesquisaGreeting) {
        pesquisaGreeting.textContent = 'Pesquisa de Cultura';
      }

      step1Card.hidden = true;
      step2Card.hidden = false;
      successCard.hidden = true;
      updateLiveProgress();
      window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (err) {
      console.error('[pesquisa check-cpf] erro:', err);
      step1Error.className = 'alert-box alert-error';
      step1Error.textContent = 'Erro de conexão com o servidor. Verifique sua internet e tente novamente.';
      step1Error.hidden = false;
      loadSecurityChallenge();
    } finally {
      btnCheckCpf.disabled = false;
      btnCheckText.textContent = 'Acessar Pesquisa Anônima';
      if (btnCheckIcon) btnCheckIcon.hidden = false;
      if (btnCheckSpinner) btnCheckSpinner.hidden = true;
    }
  });

  btnBackToCpf.addEventListener('click', () => {
    step2Card.hidden = true;
    step1Card.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* ── Step 2: Enviar Respostas ── */
  formSurvey.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!verifiedCpf) {
      surveyError.textContent = 'Sessão não identificada. Por favor, volte e informe seu CPF novamente.';
      surveyError.hidden = false;
      return;
    }

    const payload = {
      unidade: inputUnidade.value.trim(),
      area_departamento: inputArea.value.trim(),
      tempo_empresa: inputTempo.value.trim(),
      pesa_favor_contra: document.getElementById('pPesaFavorContra').value.trim(),
      futuro_3_5_anos: document.getElementById('pFuturo').value.trim(),
      valores_empresa: document.getElementById('pValores').value.trim(),
      nao_mudar_nunca: document.getElementById('pNaoMudar').value.trim(),
      dia_dificil_motivo: document.getElementById('pDiaDificil').value.trim(),
      algo_sem_dizer: document.getElementById('pAlgoSemDizer').value.trim(),
      lideranca_aprendizado_desafio: document.getElementById('pLidDesafio').value.trim(),
      lideranca_entrega_feedback: document.getElementById('pLidEntrega').value.trim(),
      lideranca_ultimo_feedback: document.getElementById('pLidUltimoFeed').value.trim(),
      lideranca_exemplo_incoerencia: document.getElementById('pLidIncoerencia').value.trim(),
      lideranca_gosta_mudar: document.getElementById('pLidGostaMudar').value.trim(),
    };

    // Validação de todos os 14 campos
    const emptyFields = Object.keys(payload).filter((k) => !payload[k]);
    if (emptyFields.length > 0) {
      surveyError.textContent = `Atenção: Por favor, responda a todas as 14 perguntas da pesquisa antes de enviar (faltam ${emptyFields.length} resposta${emptyFields.length > 1 ? 's' : ''}).`;
      surveyError.hidden = false;

      // Encontra o primeiro card não preenchido e rola até ele
      let targetEl = null;
      if (!payload.unidade) targetEl = document.getElementById('qcard-unidade');
      else if (!payload.area_departamento) targetEl = document.getElementById('qcard-area');
      else if (!payload.tempo_empresa) targetEl = document.getElementById('qcard-tempo');
      else {
        const emptyTa = [...textareas].find((ta) => !ta.value.trim());
        if (emptyTa) targetEl = emptyTa.closest('.survey-card');
      }

      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetEl.classList.add('active');
        const ta = targetEl.querySelector('textarea');
        if (ta) ta.focus();
      }
      return;
    }

    btnSubmitSurvey.disabled = true;
    btnSubmitText.textContent = 'Enviando anonimamente...';
    if (btnSubmitIcon) btnSubmitIcon.hidden = true;
    if (btnSubmitSpinner) btnSubmitSpinner.hidden = false;
    if (surveyError) surveyError.hidden = true;

    try {
      const res = await fetch('/api/pesquisa-cultura/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cpf: verifiedCpf,
          ...payload,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        surveyError.textContent = (data.errors && data.errors[0]) || data.error || 'Erro ao registrar respostas. Tente novamente.';
        surveyError.hidden = false;
        return;
      }

      step1Card.hidden = true;
      step2Card.hidden = true;
      successCard.hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (err) {
      console.error('[pesquisa submit] erro:', err);
      surveyError.textContent = 'Erro de conexão ao enviar respostas. Verifique sua conexão e tente novamente.';
      surveyError.hidden = false;
    } finally {
      btnSubmitSurvey.disabled = false;
      btnSubmitText.textContent = 'Enviar Respostas Anonimamente';
      if (btnSubmitIcon) btnSubmitIcon.hidden = false;
      if (btnSubmitSpinner) btnSubmitSpinner.hidden = true;
    }
  });

  btnDone.addEventListener('click', () => {
    formCpf.reset();
    formSurvey.reset();
    inputUnidade.value = '';
    inputArea.value = '';
    inputTempo.value = '';
    verifiedCpf = '';
    document.querySelectorAll('.chip-btn').forEach((b) => b.classList.remove('selected'));
    document.querySelectorAll('.survey-card').forEach((c) => c.classList.remove('answered', 'active'));
    document.querySelectorAll('.char-count').forEach((c) => { c.textContent = '0 caracteres'; c.style.color = '#94a3b8'; });
    
    successCard.hidden = true;
    step2Card.hidden = true;
    step1Card.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});
