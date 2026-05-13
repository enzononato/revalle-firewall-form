(function () {
  'use strict';

  const MAX_URLS = 20;

  const form = document.getElementById('firewallForm');
  const formCard = document.getElementById('formCard');
  const successCard = document.getElementById('successCard');
  const protocolEl = document.getElementById('protocolNumber');
  const newRequestBtn = document.getElementById('newRequestBtn');
  const cpfInput = document.getElementById('cpf');
  const urlsList = document.getElementById('urlsList');
  const addUrlBtn = document.getElementById('addUrlBtn');
  const submitBtn = document.getElementById('submitBtn');
  const globalError = document.getElementById('globalError');
  const yearEl = document.getElementById('year');

  yearEl.textContent = new Date().getFullYear();

  /* ---------- CPF mask ---------- */
  function maskCpf(value) {
    const d = value.replace(/\D/g, '').slice(0, 11);
    let out = d;
    if (d.length > 9) out = d.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2}).*/, '$1.$2.$3-$4');
    else if (d.length > 6) out = d.replace(/(\d{3})(\d{3})(\d{1,3}).*/, '$1.$2.$3');
    else if (d.length > 3) out = d.replace(/(\d{3})(\d{1,3}).*/, '$1.$2');
    return out;
  }

  cpfInput.addEventListener('input', (e) => {
    const start = e.target.selectionStart;
    const oldLen = e.target.value.length;
    e.target.value = maskCpf(e.target.value);
    const diff = e.target.value.length - oldLen;
    try { e.target.setSelectionRange(start + diff, start + diff); } catch (_) {}
  });

  /* ---------- CPF validation (algoritmo BR) ---------- */
  function isValidCpf(cpf) {
    const d = String(cpf || '').replace(/\D/g, '');
    if (d.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(d)) return false;
    const calc = (base, factor) => {
      let sum = 0;
      for (let i = 0; i < base.length; i++) sum += Number(base[i]) * (factor - i);
      const mod = (sum * 10) % 11;
      return mod === 10 ? 0 : mod;
    };
    if (calc(d.slice(0, 9), 10) !== Number(d[9])) return false;
    if (calc(d.slice(0, 10), 11) !== Number(d[10])) return false;
    return true;
  }

  /* ---------- URLs dinamicos ---------- */
  function buildUrlRow() {
    const row = document.createElement('div');
    row.className = 'url-row';

    const input = document.createElement('input');
    input.type = 'text';
    input.name = 'url[]';
    input.placeholder = 'https://exemplo.com';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.maxLength = 500;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'url-remove';
    removeBtn.setAttribute('aria-label', 'Remover URL');
    removeBtn.innerHTML = '&times;';
    removeBtn.addEventListener('click', () => {
      if (urlsList.children.length > 1) {
        row.remove();
        updateRemoveState();
      } else {
        input.value = '';
        input.focus();
      }
    });

    row.append(input, removeBtn);
    return row;
  }

  function updateRemoveState() {
    const rows = urlsList.querySelectorAll('.url-row');
    rows.forEach((row) => {
      const btn = row.querySelector('.url-remove');
      btn.disabled = rows.length === 1;
    });
    addUrlBtn.disabled = rows.length >= MAX_URLS;
  }

  function addUrlRow(focus) {
    if (urlsList.children.length >= MAX_URLS) return;
    const row = buildUrlRow();
    urlsList.appendChild(row);
    if (focus) row.querySelector('input').focus();
    updateRemoveState();
  }

  addUrlBtn.addEventListener('click', () => addUrlRow(true));
  addUrlRow(false);

  /* ---------- URL validation (cliente) ---------- */
  function isValidUrl(s) {
    let v = String(s || '').trim();
    if (!v) return false;
    if (!/^https?:\/\//i.test(v)) v = 'http://' + v;
    try {
      const u = new URL(v);
      return Boolean(u.hostname) && u.hostname.includes('.');
    } catch { return false; }
  }

  /* ---------- Erros ---------- */
  function clearErrors() {
    form.querySelectorAll('.has-error').forEach((el) => el.classList.remove('has-error'));
    form.querySelectorAll('.error').forEach((el) => { el.textContent = ''; });
    globalError.hidden = true;
    globalError.innerHTML = '';
  }

  function setFieldError(name, message) {
    const fieldEl = form.querySelector(`[name="${name}"]`)?.closest('.field')
      || form.querySelector(`[data-error-for="${name}"]`)?.closest('.field');
    if (!fieldEl) return;
    fieldEl.classList.add('has-error');
    const errEl = fieldEl.querySelector(`.error[data-error-for="${name}"]`);
    if (errEl) errEl.textContent = message;
  }

  function showGlobalError(messages) {
    globalError.hidden = false;
    if (messages.length === 1) {
      globalError.textContent = messages[0];
    } else {
      const items = messages.map((m) => `<li>${escapeHtml(m)}</li>`).join('');
      globalError.innerHTML = `<strong>Corrija os campos abaixo:</strong><ul>${items}</ul>`;
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  /* ---------- Validacao local ---------- */
  function collectAndValidate() {
    clearErrors();
    const errors = [];

    const unidade = document.getElementById('unidade').value.trim();
    if (!unidade) { setFieldError('unidade', 'Selecione uma unidade.'); errors.push('Unidade'); }

    const nome = document.getElementById('nome_completo').value.trim();
    if (!nome) { setFieldError('nome_completo', 'Informe seu nome completo.'); errors.push('Nome'); }
    else if (nome.length < 3 || !nome.includes(' ')) {
      setFieldError('nome_completo', 'Informe nome e sobrenome.'); errors.push('Nome');
    }

    const cpfRaw = cpfInput.value;
    const cpfDigits = cpfRaw.replace(/\D/g, '');
    if (!cpfDigits) { setFieldError('cpf', 'Informe o CPF.'); errors.push('CPF'); }
    else if (!isValidCpf(cpfDigits)) { setFieldError('cpf', 'CPF invalido.'); errors.push('CPF'); }

    const cargo = document.getElementById('cargo').value.trim();
    if (!cargo) { setFieldError('cargo', 'Informe o cargo.'); errors.push('Cargo'); }

    const setor = document.getElementById('setor').value.trim();
    if (!setor) { setFieldError('setor', 'Selecione o setor.'); errors.push('Setor'); }

    const funcao = document.getElementById('funcao').value.trim();
    if (!funcao) { setFieldError('funcao', 'Informe a funcao.'); errors.push('Funcao'); }

    const email = document.getElementById('email').value.trim();
    if (!email) { setFieldError('email', 'Informe o e-mail.'); errors.push('Email'); }
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFieldError('email', 'E-mail invalido.'); errors.push('Email');
    }

    const urlInputs = Array.from(urlsList.querySelectorAll('input'));
    const urls = urlInputs.map((i) => i.value.trim()).filter(Boolean);
    if (urls.length === 0) {
      setFieldError('urls', 'Adicione ao menos uma URL.');
      errors.push('URLs');
    } else {
      const invalid = urls.filter((u) => !isValidUrl(u));
      if (invalid.length) {
        setFieldError('urls', 'Uma ou mais URLs estao em formato invalido.');
        errors.push('URLs');
      }
    }

    const justificativa = document.getElementById('justificativa').value.trim();

    return {
      valid: errors.length === 0,
      payload: { unidade, nome_completo: nome, cpf: cpfDigits, cargo, setor, funcao, email, urls, justificativa },
    };
  }

  /* ---------- Submit ---------- */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { valid, payload } = collectAndValidate();
    if (!valid) {
      const firstErr = form.querySelector('.has-error input, .has-error select, .has-error textarea');
      if (firstErr) firstErr.focus({ preventScroll: false });
      return;
    }

    submitBtn.disabled = true;
    submitBtn.classList.add('is-loading');

    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        const errs = Array.isArray(data.errors) && data.errors.length
          ? data.errors
          : ['Erro ao enviar a solicitacao. Tente novamente.'];
        showGlobalError(errs);
        return;
      }

      protocolEl.textContent = '#' + String(data.id).padStart(5, '0');
      formCard.hidden = true;
      successCard.hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      console.error(err);
      showGlobalError(['Falha de conexao. Verifique sua internet e tente novamente.']);
    } finally {
      submitBtn.disabled = false;
      submitBtn.classList.remove('is-loading');
    }
  });

  newRequestBtn.addEventListener('click', () => {
    form.reset();
    urlsList.innerHTML = '';
    addUrlRow(false);
    clearErrors();
    successCard.hidden = true;
    formCard.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* Limpa erro do campo ao digitar */
  form.addEventListener('input', (e) => {
    const field = e.target.closest('.field');
    if (field && field.classList.contains('has-error')) {
      field.classList.remove('has-error');
      const errEl = field.querySelector('.error');
      if (errEl) errEl.textContent = '';
    }
  });

  /* ---------- Modal ---------- */
  const infoModal = document.getElementById('infoModal');
  const closeModalBtn = document.getElementById('closeModalBtn');

  if (infoModal && closeModalBtn) {
    if (!sessionStorage.getItem('revalle_modal_seen')) {
      setTimeout(() => {
        infoModal.classList.add('is-active');
        infoModal.removeAttribute('aria-hidden');
      }, 300); // pequeno delay para animação de entrada
    }

    closeModalBtn.addEventListener('click', () => {
      infoModal.classList.remove('is-active');
      infoModal.setAttribute('aria-hidden', 'true');
      sessionStorage.setItem('revalle_modal_seen', 'true');
    });
  }
})();
