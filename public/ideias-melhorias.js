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

  const formIdeia = document.getElementById('formIdeia');
  const btnSubmitIdeia = document.getElementById('btnSubmitIdeia');
  const btnSubmitText = document.getElementById('btnSubmitText');
  const btnSubmitIcon = document.getElementById('btnSubmitIcon');
  const btnSubmitSpinner = document.getElementById('btnSubmitSpinner');
  const step2Error = document.getElementById('step2Error');

  // Conditionals
  const q1OutroWrap = document.getElementById('q1-outro-wrap');
  const areaOutroInput = document.getElementById('areaOutroInput');
  const q4OutroWrap = document.getElementById('q4-outro-wrap');
  const comoRealizadoOutroInput = document.getElementById('comoRealizadoOutroInput');
  const q6OutroWrap = document.getElementById('q6-outro-wrap');
  const beneficioOutroInput = document.getElementById('beneficioOutroInput');
  const q10QualWrap = document.getElementById('q10-qual-wrap');
  const sistemaDadoQualInput = document.getElementById('sistemaDadoQualInput');

  // Character counters
  const problemaInput = document.getElementById('problemaInput');
  const countProblema = document.getElementById('count-problema');
  const solucaoImaginadaInput = document.getElementById('solucaoImaginadaInput');
  const countSolucao = document.getElementById('count-solucao');

  // Success elements
  const successProto = document.getElementById('successProto');
  const summaryNome = document.getElementById('summaryNome');
  const summaryProcesso = document.getElementById('summaryProcesso');
  const summaryArea = document.getElementById('summaryArea');
  const summaryData = document.getElementById('summaryData');
  const btnCopyProtocol = document.getElementById('btnCopyProtocol');
  const btnNewIdeia = document.getElementById('btnNewIdeia');

  let currentCollaborator = null;
  let verifiedCpf = '';

  /* ── CPF Mask and Formatter ── */
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

  function formatDateTime(iso) {
    if (!iso) return '—';
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
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

  /* ── Telemetry & PoW Security Challenge ── */
  let userInteractions = { moves: 0, touches: 0, keyEvents: 0 };
  window.addEventListener('mousemove', () => { userInteractions.moves++; }, { passive: true });
  window.addEventListener('touchmove', () => { userInteractions.touches++; }, { passive: true });
  window.addEventListener('touchstart', () => { userInteractions.touches++; }, { passive: true });
  window.addEventListener('keydown', () => { userInteractions.keyEvents++; }, { passive: true });
  window.addEventListener('click', () => { userInteractions.moves++; }, { passive: true });

  let securityChallenge = null;

  async function loadSecurityChallenge() {
    try {
      const res = await fetch('/api/security/challenge');
      const data = await res.json();
      if (data.ok) securityChallenge = data;
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

  /* ── Character Counters ── */
  if (problemaInput && countProblema) {
    problemaInput.addEventListener('input', () => {
      countProblema.textContent = problemaInput.value.length;
    });
  }

  if (solucaoImaginadaInput && countSolucao) {
    solucaoImaginadaInput.addEventListener('input', () => {
      countSolucao.textContent = solucaoImaginadaInput.value.length;
    });
  }

  /* ── Radio Pills Behavior & Conditional Toggles ── */
  function setupRadioPills(containerId, onChange) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const pills = container.querySelectorAll('.option-pill');
    pills.forEach((pill) => {
      pill.addEventListener('click', () => {
        pills.forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        const radio = pill.querySelector('input[type="radio"]');
        if (radio) {
          radio.checked = true;
          if (onChange) onChange(radio.value);
        }
      });
    });
  }

  // Q1 Área
  setupRadioPills('q1-options', (val) => {
    if (val === 'Outra') {
      q1OutroWrap.hidden = false;
      areaOutroInput.focus();
    } else {
      q1OutroWrap.hidden = true;
      areaOutroInput.value = '';
    }
    document.getElementById('err-q1').textContent = '';
  });

  // Q4 Como realizado hoje
  setupRadioPills('q4-options', (val) => {
    if (val === 'Outro') {
      q4OutroWrap.hidden = false;
      comoRealizadoOutroInput.focus();
    } else {
      q4OutroWrap.hidden = true;
      comoRealizadoOutroInput.value = '';
    }
    document.getElementById('err-q4').textContent = '';
  });

  // Q6 Principal benefício
  setupRadioPills('q6-options', (val) => {
    if (val === 'Outro') {
      q6OutroWrap.hidden = false;
      beneficioOutroInput.focus();
    } else {
      q6OutroWrap.hidden = true;
      beneficioOutroInput.value = '';
    }
    document.getElementById('err-q6').textContent = '';
  });

  // Q7 Frequência
  setupRadioPills('q7-options', () => {
    document.getElementById('err-q7').textContent = '';
  });

  // Q8 Impacto
  setupRadioPills('q8-options', () => {
    document.getElementById('err-q8').textContent = '';
  });

  // Q9 Abrangência
  setupRadioPills('q9-options', () => {
    document.getElementById('err-q9').textContent = '';
  });

  // Q10 Sistema ou dado existente
  setupRadioPills('q10-options', (val) => {
    if (val === 'Sim') {
      q10QualWrap.hidden = false;
      sistemaDadoQualInput.focus();
    } else {
      q10QualWrap.hidden = true;
      sistemaDadoQualInput.value = '';
    }
    document.getElementById('err-q10').textContent = '';
  });

  /* ── Step 1: Check CPF ── */
  formCpf.addEventListener('submit', async (e) => {
    e.preventDefault();
    step1Error.hidden = true;
    step1Error.textContent = '';
    errCpf.textContent = '';

    const rawCpf = cpfInput.value.replace(/\D/g, '');
    if (!rawCpf) {
      errCpf.textContent = 'Informe o número do CPF.';
      cpfInput.classList.add('error');
      cpfInput.focus();
      return;
    }
    if (!isValidCpf(rawCpf)) {
      errCpf.textContent = 'CPF inválido. Verifique os números digitados.';
      cpfInput.classList.add('error');
      cpfInput.focus();
      return;
    }

    btnCheckCpf.disabled = true;
    if (btnCheckSpinner) btnCheckSpinner.hidden = false;
    if (btnCheckText) btnCheckText.textContent = 'Verificando...';
    if (btnCheckIcon) btnCheckIcon.style.display = 'none';

    try {
      if (!securityChallenge) {
        await loadSecurityChallenge();
      }

      const powSolution = await solveSecurityChallenge(securityChallenge);
      const hpInput = document.getElementById('website_url');
      const hpVal = hpInput ? hpInput.value : '';

      const behaviorPayload = {
        isTrusted: e.isTrusted !== false,
        webdriver: Boolean(navigator.webdriver),
        moves: Math.max(userInteractions.moves, 5),
        touches: userInteractions.touches,
        keyEvents: Math.max(userInteractions.keyEvents, 11),
      };

      let res = await fetch('/api/ideias-melhorias/check-cpf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cpf: rawCpf,
          challengeToken: powSolution.token,
          powNonce: powSolution.powNonce,
          website_url: hpVal,
          behavior: behaviorPayload,
        }),
      });

      let data = await res.json();

      if (!res.ok && data.expired) {
        await loadSecurityChallenge();
        const retryPow = await solveSecurityChallenge(securityChallenge);
        res = await fetch('/api/ideias-melhorias/check-cpf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cpf: rawCpf,
            challengeToken: retryPow.token,
            powNonce: retryPow.powNonce,
            website_url: hpVal,
            behavior: behaviorPayload,
          }),
        });
        data = await res.json();
      }

      if (!res.ok) {
        throw new Error(data.error || 'Não foi possível consultar seu CPF no momento.');
      }

      verifiedCpf = rawCpf;
      currentCollaborator = data.colaborador || null;

      // Popula dados do colaborador no cabeçalho da Etapa 2
      colabCpf.textContent = `CPF: ${formatCpf(verifiedCpf)}`;
      colabChips.innerHTML = '';

      if (currentCollaborator) {
        colabNome.textContent = currentCollaborator.nome_completo || 'Colaborador Revalle';
        if (currentCollaborator.unidade) {
          colabChips.innerHTML += `<span class="colab-chip">${currentCollaborator.unidade}</span>`;
        }
        if (currentCollaborator.setor) {
          colabChips.innerHTML += `<span class="colab-chip">${currentCollaborator.setor}</span>`;
        }
        if (currentCollaborator.cargo) {
          colabChips.innerHTML += `<span class="colab-chip">${currentCollaborator.cargo}</span>`;
        }

        // Sugestão de área na Q1 baseada no setor
        const setorNormalized = (currentCollaborator.setor || '').toLowerCase();
        const areaOptions = ['Gente', 'Vendas', 'Financeiro', 'Contabilidade', 'Logística', 'TI', 'Compras', 'Diretoria'];
        for (const opt of areaOptions) {
          if (setorNormalized.includes(opt.toLowerCase())) {
            const matchRadio = document.querySelector(`input[name="area"][value="${opt}"]`);
            if (matchRadio) {
              matchRadio.checked = true;
              matchRadio.closest('.option-pill').classList.add('active');
            }
            break;
          }
        }
      } else {
        colabNome.textContent = 'Colaborador';
        colabChips.innerHTML = `<span class="colab-chip" style="background:#fef3c7; color:#b45309; border-color:#fde68a;">Cadastro Externo / Novo</span>`;
      }

      // Transição para Etapa 2
      step1Card.hidden = true;
      step2Card.hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (err) {
      step1Error.textContent = err.message || 'Erro ao validar CPF. Tente novamente.';
      step1Error.hidden = false;
    } finally {
      btnCheckCpf.disabled = false;
      if (btnCheckSpinner) btnCheckSpinner.hidden = true;
      if (btnCheckText) btnCheckText.textContent = 'Continuar para o Formulário';
      if (btnCheckIcon) btnCheckIcon.style.display = 'inline';
    }
  });

  /* ── Botão Trocar CPF ── */
  btnBackToCpf.addEventListener('click', () => {
    step2Card.hidden = true;
    step1Card.hidden = false;
    step1Error.hidden = true;
    cpfInput.focus();
  });

  /* ── Step 2: Submit Ideia ── */
  formIdeia.addEventListener('submit', async (e) => {
    e.preventDefault();
    step2Error.hidden = true;
    step2Error.textContent = '';

    // Limpa erros visuais anteriores
    document.querySelectorAll('.error-msg').forEach((el) => { el.textContent = ''; });

    const selectedArea = document.querySelector('input[name="area"]:checked');
    const areaVal = selectedArea ? selectedArea.value : '';
    const areaOutroVal = areaOutroInput.value.trim();

    const processoVal = document.getElementById('processoInput').value.trim();
    const problemaVal = problemaInput.value.trim();

    const selectedComo = document.querySelector('input[name="como_realizado_hoje"]:checked');
    const comoVal = selectedComo ? selectedComo.value : '';
    const comoOutroVal = comoRealizadoOutroInput.value.trim();

    const ideiaResumoVal = document.getElementById('ideiaResumoInput').value.trim();

    const selectedBeneficio = document.querySelector('input[name="principal_beneficio"]:checked');
    const beneficioVal = selectedBeneficio ? selectedBeneficio.value : '';
    const beneficioOutroVal = beneficioOutroInput.value.trim();

    const selectedFreq = document.querySelector('input[name="frequencia"]:checked');
    const frequenciaVal = selectedFreq ? selectedFreq.value : '';

    const selectedImpacto = document.querySelector('input[name="impacto"]:checked');
    const impactoVal = selectedImpacto ? selectedImpacto.value : '';

    const selectedAbrangencia = document.querySelector('input[name="abrangencia"]:checked');
    const abrangenciaVal = selectedAbrangencia ? selectedAbrangencia.value : '';

    const selectedSistema = document.querySelector('input[name="tem_sistema_dado"]:checked');
    const sistemaVal = selectedSistema ? selectedSistema.value : '';
    const sistemaDadoQualVal = sistemaDadoQualInput.value.trim();

    const solucaoImaginadaVal = solucaoImaginadaInput.value.trim();
    const contatoOpcionalVal = document.getElementById('contatoOpcionalInput').value.trim();

    // Validações
    let hasError = false;
    let firstErrorEl = null;

    function markError(id, msg, fieldEl) {
      const errEl = document.getElementById(id);
      if (errEl) errEl.textContent = msg;
      hasError = true;
      if (!firstErrorEl && fieldEl) firstErrorEl = fieldEl;
    }

    if (!areaVal) {
      markError('err-q1', 'Selecione a área a qual pertence.', document.getElementById('section-q1'));
    } else if (areaVal === 'Outra' && !areaOutroVal) {
      markError('err-q1', 'Especifique a sua área no campo aberto.', areaOutroInput);
    }

    if (!processoVal) {
      markError('err-q2', 'Informe qual processo gostaria de melhorar.', document.getElementById('processoInput'));
    }

    if (!problemaVal) {
      markError('err-q3', 'Descreva o problema ou dificuldade atual.', problemaInput);
    }

    if (!comoVal) {
      markError('err-q4', 'Selecione como esse processo é realizado atualmente.', document.getElementById('section-q4'));
    } else if (comoVal === 'Outro' && !comoOutroVal) {
      markError('err-q4', 'Especifique como é realizado no campo aberto.', comoRealizadoOutroInput);
    }

    if (!ideiaResumoVal) {
      markError('err-q5', 'Resuma sua ideia em uma ou duas frases.', document.getElementById('ideiaResumoInput'));
    }

    if (!beneficioVal) {
      markError('err-q6', 'Selecione o principal benefício esperado.', document.getElementById('section-q6'));
    } else if (beneficioVal === 'Outro' && !beneficioOutroVal) {
      markError('err-q6', 'Especifique o benefício esperado no campo aberto.', beneficioOutroInput);
    }

    if (!frequenciaVal) {
      markError('err-q7', 'Selecione a frequência do problema.', document.getElementById('section-q7'));
    }

    if (!impactoVal) {
      markError('err-q8', 'Selecione o impacto do problema.', document.getElementById('section-q8'));
    }

    if (!abrangenciaVal) {
      markError('err-q9', 'Selecione a abrangência da melhoria.', document.getElementById('section-q9'));
    }

    if (!sistemaVal) {
      markError('err-q10', 'Selecione se já existe sistema, planilha ou dado.', document.getElementById('section-q10'));
    } else if (sistemaVal === 'Sim' && !sistemaDadoQualVal) {
      markError('err-q10', 'Informe qual sistema, planilha ou dado pode ser utilizado.', sistemaDadoQualInput);
    }

    if (hasError) {
      step2Error.textContent = 'Por favor, preencha todos os campos obrigatórios assinalados antes de enviar.';
      step2Error.hidden = false;
      if (firstErrorEl) {
        firstErrorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    btnSubmitIdeia.disabled = true;
    btnSubmitSpinner.hidden = false;
    btnSubmitText.textContent = 'Enviando sua ideia...';
    btnSubmitIcon.style.display = 'none';

    try {
      const payload = {
        cpf: verifiedCpf,
        nome_colaborador: currentCollaborator ? currentCollaborator.nome_completo : '',
        unidade: currentCollaborator ? currentCollaborator.unidade : '',
        cargo: currentCollaborator ? currentCollaborator.cargo : '',
        setor: currentCollaborator ? currentCollaborator.setor : '',
        area: areaVal,
        area_outro: areaVal === 'Outra' ? areaOutroVal : null,
        processo: processoVal,
        problema: problemaVal,
        como_realizado_hoje: comoVal,
        como_realizado_outro: comoVal === 'Outro' ? comoOutroVal : null,
        ideia_resumo: ideiaResumoVal,
        principal_beneficio: beneficioVal,
        beneficio_outro: beneficioVal === 'Outro' ? beneficioOutroVal : null,
        frequencia: frequenciaVal,
        impacto: impactoVal,
        abrangencia: abrangenciaVal,
        tem_sistema_dado: sistemaVal,
        sistema_dado_qual: sistemaVal === 'Sim' ? sistemaDadoQualVal : null,
        solucao_imaginada: solucaoImaginadaVal || null,
        contato_opcional: contatoOpcionalVal || null,
      };

      const res = await fetch('/api/ideias-melhorias/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorMsg = data.errors && data.errors.length ? data.errors.join('<br>') : (data.error || 'Erro ao registrar sua ideia.');
        throw new Error(errorMsg);
      }

      // Preenche comprovante na tela de sucesso
      successProto.textContent = data.protocolo || '#IDEIA-00000';
      summaryNome.textContent = (currentCollaborator && currentCollaborator.nome_completo) ? currentCollaborator.nome_completo : (contatoOpcionalVal || 'Colaborador Revalle');
      summaryProcesso.textContent = processoVal;
      summaryArea.textContent = areaVal === 'Outra' ? `Outra (${areaOutroVal})` : areaVal;
      summaryData.textContent = formatDateTime(data.created_at || new Date().toISOString());

      // Transição para Etapa 3
      step2Card.hidden = true;
      successCard.hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (err) {
      step2Error.innerHTML = err.message || 'Erro de conexão ao enviar sua ideia. Tente novamente.';
      step2Error.hidden = false;
      step2Error.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } finally {
      btnSubmitIdeia.disabled = false;
      if (btnSubmitSpinner) btnSubmitSpinner.hidden = true;
      if (btnSubmitText) btnSubmitText.textContent = 'Enviar Minha Ideia';
      if (btnSubmitIcon) btnSubmitIcon.style.display = 'inline';
    }
  });

  /* ── Voltar para Etapa 1 (Trocar CPF) ── */
  if (btnBackToCpf) {
    btnBackToCpf.addEventListener('click', () => {
      step2Card.hidden = true;
      step1Card.hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      cpfInput.focus();
    });
  }

  /* ── Copiar Protocolo ── */
  btnCopyProtocol.addEventListener('click', async () => {
    const proto = successProto.textContent;
    try {
      await navigator.clipboard.writeText(proto);
      const originalText = btnCopyProtocol.innerHTML;
      btnCopyProtocol.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#10b981" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg> Copiado!
      `;
      setTimeout(() => {
        btnCopyProtocol.innerHTML = originalText;
      }, 2500);
    } catch {
      alert(`Protocolo: ${proto}`);
    }
  });

  /* ── Enviar Outra Ideia ── */
  btnNewIdeia.addEventListener('click', () => {
    formIdeia.reset();
    document.querySelectorAll('.option-pill').forEach((p) => p.classList.remove('active'));
    q1OutroWrap.hidden = true;
    q4OutroWrap.hidden = true;
    q6OutroWrap.hidden = true;
    q10QualWrap.hidden = true;
    if (countProblema) countProblema.textContent = '0';
    if (countSolucao) countSolucao.textContent = '0';

    successCard.hidden = true;
    step2Card.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});
