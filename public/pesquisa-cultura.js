document.addEventListener('DOMContentLoaded', () => {
  // Cards / Views
  const step1Card = document.getElementById('step1Card');
  const step2Card = document.getElementById('step2Card');
  const successCard = document.getElementById('successCard');

  // Step 1 Elements
  const formCpf = document.getElementById('formCpf');
  const cpfInput = document.getElementById('cpfInput');
  const errCpf = document.getElementById('errCpf');
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

  /* ── Step 1: Verificar CPF ── */
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

    btnCheckCpf.disabled = true;
    btnCheckText.textContent = 'Validando acesso...';
    if (btnCheckIcon) btnCheckIcon.hidden = true;
    if (btnCheckSpinner) btnCheckSpinner.hidden = false;
    if (step1Error) step1Error.hidden = true;

    try {
      const res = await fetch('/api/pesquisa-cultura/check-cpf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpf: cpfDigits }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        step1Error.className = data.already_participated ? 'alert-box alert-warn' : 'alert-box alert-error';
        step1Error.textContent = data.error || 'CPF não localizado. Verifique os dados ou contate o Departamento Pessoal.';
        step1Error.hidden = false;
        return;
      }

      verifiedCpf = cpfDigits;

      if (data.colaborador && data.colaborador.primeiro_nome) {
        pesquisaGreeting.textContent = `Olá, ${data.colaborador.primeiro_nome}!`;
      } else {
        pesquisaGreeting.textContent = 'Pesquisa de Cultura Revalle';
      }

      // Sugestão de unidade se encontrada
      if (data.colaborador && data.colaborador.unidade_sugerida) {
        const uSelect = document.getElementById('pUnidade');
        if (uSelect && !uSelect.value) {
          for (const opt of uSelect.options) {
            if (opt.value.toLowerCase().includes(data.colaborador.unidade_sugerida.toLowerCase())) {
              uSelect.value = opt.value;
              break;
            }
          }
        }
      }

      step1Card.hidden = true;
      step2Card.hidden = false;
      successCard.hidden = true;
      window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (err) {
      console.error('[pesquisa check-cpf] erro:', err);
      step1Error.className = 'alert-box alert-error';
      step1Error.textContent = 'Erro de conexão com o servidor. Verifique sua internet e tente novamente.';
      step1Error.hidden = false;
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
      unidade: document.getElementById('pUnidade').value.trim(),
      area_departamento: document.getElementById('pArea').value.trim(),
      tempo_empresa: document.getElementById('pTempo').value.trim(),
      pesa_favor_contra: document.getElementById('pPesaFavorContra').value.trim(),
      futuro_3_5_anos: document.getElementById('pFuturo').value.trim(),
      valores_empresa: document.getElementById('pValores').value.trim(),
      nao_mudar_nunca: document.getElementById('pNaoMudar').value.trim(),
      dia_dificil_motivo: document.getElementById('pDiaDificil').value.trim(),
      algo_sem_dizer: document.getElementById('pAlgoSemDizer').value.trim(),
      lideranca_acompanhamento: document.getElementById('pLidAcompanhamento').value.trim(),
      lideranca_aprendizado_desafio: document.getElementById('pLidDesafio').value.trim(),
      lideranca_entrega_feedback: document.getElementById('pLidEntrega').value.trim(),
      lideranca_ultimo_feedback: document.getElementById('pLidUltimoFeed').value.trim(),
      lideranca_exemplo_incoerencia: document.getElementById('pLidIncoerencia').value.trim(),
      lideranca_gosta_mudar: document.getElementById('pLidGostaMudar').value.trim(),
    };

    // Validação de todos os campos
    const emptyKeys = Object.keys(payload).filter((k) => !payload[k]);
    if (emptyKeys.length > 0) {
      surveyError.textContent = `Atenção: Por favor, responda a todas as 15 perguntas da pesquisa antes de enviar (faltam ${emptyKeys.length} resposta${emptyKeys.length > 1 ? 's' : ''}).`;
      surveyError.hidden = false;
      const firstEmptyEl = formSurvey.querySelector('[required]:invalid') || formSurvey.querySelector('textarea:invalid, select:invalid');
      if (firstEmptyEl) {
        firstEmptyEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        firstEmptyEl.focus();
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
    verifiedCpf = '';
    successCard.hidden = true;
    step2Card.hidden = true;
    step1Card.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});
