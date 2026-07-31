document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('imersaoTessForm');
  const formCard = document.getElementById('formCard');
  const successCard = document.getElementById('successCard');

  const inputNome = document.getElementById('nome');
  const inputEmail = document.getElementById('email');
  const inputTelefone = document.getElementById('telefone');
  const selectSetor = document.getElementById('setor');
  const selectRevenda = document.getElementById('revenda');

  const btnSubmit = document.getElementById('btnSubmit');
  const btnText = document.getElementById('btnText');
  const btnIcon = document.getElementById('btnIcon');
  const btnSpinner = document.getElementById('btnSpinner');
  const generalError = document.getElementById('generalError');
  const btnNewRegistration = document.getElementById('btnNewRegistration');

  /* ── Telefone Input Masking ── */
  function maskPhone(value) {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits.length ? `(${digits}` : '';
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  }

  inputTelefone.addEventListener('input', (e) => {
    e.target.value = maskPhone(e.target.value);
    clearError('telefone');
  });

  inputNome.addEventListener('input', () => clearError('nome'));
  inputEmail.addEventListener('input', () => clearError('email'));
  selectSetor.addEventListener('change', () => clearError('setor'));
  selectRevenda.addEventListener('change', () => clearError('revenda'));

  function setError(fieldId, msg) {
    const errEl = document.getElementById(`err-${fieldId}`);
    const inputEl = document.getElementById(fieldId);
    if (errEl) errEl.textContent = msg;
    if (inputEl) inputEl.classList.add('error');
  }

  function clearError(fieldId) {
    const errEl = document.getElementById(`err-${fieldId}`);
    const inputEl = document.getElementById(fieldId);
    if (errEl) errEl.textContent = '';
    if (inputEl) inputEl.classList.remove('error');
    if (generalError) {
      generalError.hidden = true;
      generalError.textContent = '';
    }
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
  }

  function validateForm() {
    let isValid = true;
    const nomeVal = inputNome.value.trim();
    const emailVal = inputEmail.value.trim();
    const phoneDigits = inputTelefone.value.replace(/\D/g, '');
    const setorVal = selectSetor.value;
    const revendaVal = selectRevenda.value;

    if (!nomeVal) {
      setError('nome', 'Informe seu nome completo.');
      isValid = false;
    } else if (nomeVal.length < 3) {
      setError('nome', 'O nome deve ter pelo menos 3 caracteres.');
      isValid = false;
    } else if (!nomeVal.includes(' ')) {
      setError('nome', 'Informe seu nome e sobrenome.');
      isValid = false;
    }

    if (!emailVal) {
      setError('email', 'Informe seu e-mail corporativo.');
      isValid = false;
    } else if (!isValidEmail(emailVal)) {
      setError('email', 'Informe um e-mail válido.');
      isValid = false;
    } else if (!emailVal.toLowerCase().endsWith('@revalle.com.br')) {
      setError('email', 'Use obrigatoriamente seu e-mail corporativo (@revalle.com.br).');
      isValid = false;
    }

    if (!phoneDigits) {
      setError('telefone', 'Informe seu telefone/WhatsApp.');
      isValid = false;
    } else if (phoneDigits.length < 10 || phoneDigits.length > 11) {
      setError('telefone', 'Telefone inválido (informe DDD + número).');
      isValid = false;
    }

    if (!setorVal) {
      setError('setor', 'Selecione o seu setor.');
      isValid = false;
    }

    if (!revendaVal) {
      setError('revenda', 'Selecione a sua revenda/unidade.');
      isValid = false;
    }

    return isValid;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    // Set loading state
    btnSubmit.disabled = true;
    btnText.textContent = 'Enviando inscrição...';
    if (btnIcon) btnIcon.hidden = true;
    if (btnSpinner) btnSpinner.hidden = false;
    if (generalError) generalError.hidden = true;

    const payload = {
      nome: inputNome.value.trim(),
      email: inputEmail.value.trim(),
      telefone: inputTelefone.value.trim(),
      setor: selectSetor.value,
      revenda: selectRevenda.value,
    };

    try {
      const response = await fetch('/api/imersao-tess/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const resData = await response.json();

      if (!response.ok || !resData.ok) {
        const errorMsg = (resData.errors && resData.errors.join('<br>')) || 'Erro ao enviar inscrição. Tente novamente.';
        if (generalError) {
          generalError.innerHTML = errorMsg;
          generalError.hidden = false;
        }
        return;
      }

      // Success! Populate summary and toggle screens
      const protoText = '#IM-' + String(resData.id).padStart(5, '0');
      document.getElementById('successProto').textContent = protoText;
      document.getElementById('successEmail').textContent = payload.email;
      document.getElementById('summaryNome').textContent = payload.nome;
      document.getElementById('summaryTelefone').textContent = payload.telefone;
      document.getElementById('summarySetor').textContent = payload.setor;
      document.getElementById('summaryRevenda').textContent = payload.revenda;

      formCard.hidden = true;
      successCard.hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (err) {
      console.error('[imersao-tess] erro ao enviar:', err);
      if (generalError) {
        generalError.textContent = 'Ocorreu um erro de conexão. Verifique sua internet e tente novamente.';
        generalError.hidden = false;
      }
    } finally {
      btnSubmit.disabled = false;
      btnText.textContent = 'Confirmar Minha Inscrição';
      if (btnIcon) btnIcon.hidden = false;
      if (btnSpinner) btnSpinner.hidden = true;
    }
  });

  btnNewRegistration.addEventListener('click', () => {
    form.reset();
    document.querySelectorAll('.error-msg').forEach((el) => el.textContent = '');
    document.querySelectorAll('.error').forEach((el) => el.classList.remove('error'));
    if (generalError) generalError.hidden = true;
    successCard.hidden = true;
    formCard.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});
