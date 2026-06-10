(function () {
  'use strict';

  const form        = document.getElementById('contractForm');
  const formCard    = document.getElementById('formCard');
  const successCard = document.getElementById('successCard');
  const protocolEl  = document.getElementById('protocolNumber');
  const newReqBtn   = document.getElementById('newRequestBtn');
  const submitBtn   = document.getElementById('submitBtn');
  const globalError = document.getElementById('globalError');
  const yearEl      = document.getElementById('year');
  const fileZone    = document.getElementById('fileZone');
  const fileInput   = document.getElementById('arquivo');
  const fileLabel   = document.getElementById('fileLabel');
  const fileListEl  = document.getElementById('fileList');

  let selectedFiles = [];

  yearEl.textContent = new Date().getFullYear();

  /* ---------- CNPJ mask ---------- */
  function maskCnpj(v) {
    const d = v.replace(/\D/g, '').slice(0, 14);
    if (d.length > 12) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{1,2}).*/, '$1.$2.$3/$4-$5');
    if (d.length > 8)  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{1,4}).*/, '$1.$2.$3/$4');
    if (d.length > 5)  return d.replace(/(\d{2})(\d{3})(\d{1,3}).*/, '$1.$2.$3');
    if (d.length > 2)  return d.replace(/(\d{2})(\d{1,3}).*/, '$1.$2');
    return d;
  }

  document.getElementById('cnpj').addEventListener('input', (e) => {
    const s = e.target.selectionStart;
    const old = e.target.value.length;
    e.target.value = maskCnpj(e.target.value);
    const diff = e.target.value.length - old;
    try { e.target.setSelectionRange(s + diff, s + diff); } catch (_) {}
  });

  /* ---------- Phone mask ---------- */
  function maskPhone(v) {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length > 6) return d.replace(/(\d{2})(\d{5})(\d{1,4}).*/, '($1) $2-$3');
    if (d.length > 2) return d.replace(/(\d{2})(\d{1,5}).*/, '($1) $2');
    return d;
  }

  document.getElementById('telefone').addEventListener('input', (e) => {
    const s = e.target.selectionStart;
    const old = e.target.value.length;
    e.target.value = maskPhone(e.target.value);
    const diff = e.target.value.length - old;
    try { e.target.setSelectionRange(s + diff, s + diff); } catch (_) {}
  });

  /* ---------- CNPJ validation ---------- */
  function isValidCnpj(cnpj) {
    const d = cnpj.replace(/\D/g, '');
    if (d.length !== 14) return false;
    if (/^(\d)\1{13}$/.test(d)) return false;
    const calc = (str, weights) => {
      let sum = 0;
      for (let i = 0; i < weights.length; i++) sum += Number(str[i]) * weights[i];
      const r = sum % 11;
      return r < 2 ? 0 : 11 - r;
    };
    if (calc(d, [5,4,3,2,9,8,7,6,5,4,3,2]) !== Number(d[12])) return false;
    if (calc(d, [6,5,4,3,2,9,8,7,6,5,4,3,2]) !== Number(d[13])) return false;
    return true;
  }

  /* ---------- File zone (Multiple Files) ---------- */
  function updateFilesUI() {
    fileListEl.innerHTML = '';
    
    if (selectedFiles.length === 0) {
      fileLabel.textContent = 'Clique ou arraste o(s) PDF(s) aqui';
      fileZone.classList.remove('has-file');
      fileInput.value = '';
    } else {
      fileLabel.textContent = 'Adicionar mais PDF(s)...';
      fileZone.classList.add('has-file');
      
      // Sync with fileInput using DataTransfer
      const dt = new DataTransfer();
      selectedFiles.forEach((file) => dt.items.add(file));
      fileInput.files = dt.files;
      
      // Render list
      selectedFiles.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'file-item';
        
        const info = document.createElement('div');
        info.className = 'file-item-info';
        
        const icon = document.createElement('span');
        icon.className = 'file-item-icon';
        icon.textContent = '📄';
        
        const name = document.createElement('span');
        name.className = 'file-item-name';
        name.textContent = file.name;
        
        const size = document.createElement('span');
        size.className = 'file-item-size';
        const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
        size.textContent = `(${sizeMb} MB)`;
        
        info.appendChild(icon);
        info.appendChild(name);
        info.appendChild(size);
        
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'file-item-remove';
        removeBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        `;
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          selectedFiles.splice(index, 1);
          updateFilesUI();
        });
        
        item.appendChild(info);
        item.appendChild(removeBtn);
        fileListEl.appendChild(item);
      });
    }
  }

  function handleFilesSelection(files) {
    if (!files) return;
    
    let hasInvalid = false;
    let hasTooLarge = false;
    
    Array.from(files).forEach((file) => {
      if (file.type !== 'application/pdf') {
        hasInvalid = true;
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        hasTooLarge = true;
        return;
      }
      // Avoid duplicates
      const exists = selectedFiles.some((f) => f.name === file.name && f.size === file.size);
      if (!exists) {
        selectedFiles.push(file);
      }
    });
    
    if (hasInvalid) {
      setFieldError('arquivo', 'Apenas arquivos PDF sao aceitos.');
    } else if (hasTooLarge) {
      setFieldError('arquivo', 'Um ou mais arquivos excedem o limite de 10 MB.');
    } else {
      clearFieldError('arquivo');
    }
    
    updateFilesUI();
  }

  fileZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    handleFilesSelection(fileInput.files);
  });

  fileZone.addEventListener('dragover', (e) => { e.preventDefault(); fileZone.classList.add('drag-over'); });
  fileZone.addEventListener('dragleave', () => fileZone.classList.remove('drag-over'));
  fileZone.addEventListener('drop', (e) => {
    e.preventDefault();
    fileZone.classList.remove('drag-over');
    handleFilesSelection(e.dataTransfer.files);
  });

  /* ---------- Custom Multiselect ---------- */
  const multiselect = document.getElementById('revendaMultiselect');
  const selectBox = multiselect.querySelector('.multiselect-select');
  const checkboxes = multiselect.querySelectorAll('.multiselect-option input[type="checkbox"]');
  const placeholder = multiselect.querySelector('.multiselect-placeholder');
  const hiddenRevendaInput = document.getElementById('revenda');

  selectBox.addEventListener('click', (e) => {
    e.stopPropagation();
    multiselect.classList.toggle('is-open');
  });

  document.addEventListener('click', (e) => {
    if (!multiselect.contains(e.target)) {
      multiselect.classList.remove('is-open');
    }
  });

  function updateMultiselect() {
    const selected = [];
    checkboxes.forEach((cb) => {
      if (cb.checked) selected.push(cb.value);
    });

    let tagsContainer = selectBox.querySelector('.multiselect-tags');
    if (!tagsContainer) {
      tagsContainer = document.createElement('div');
      tagsContainer.className = 'multiselect-tags';
      selectBox.insertBefore(tagsContainer, selectBox.querySelector('.multiselect-arrow'));
    }
    tagsContainer.innerHTML = '';

    if (selected.length === 0) {
      placeholder.style.display = 'block';
      tagsContainer.remove();
      selectBox.classList.remove('has-value');
      hiddenRevendaInput.value = '';
    } else {
      placeholder.style.display = 'none';
      selected.forEach((val) => {
        const tag = document.createElement('span');
        tag.className = 'multiselect-tag';
        tag.textContent = val;

        const removeBtn = document.createElement('span');
        removeBtn.className = 'multiselect-tag-remove';
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const cb = Array.from(checkboxes).find(c => c.value === val);
          if (cb) {
            cb.checked = false;
            updateMultiselect();
          }
        });

        tag.appendChild(removeBtn);
        tagsContainer.appendChild(tag);
      });
      selectBox.classList.add('has-value');
      hiddenRevendaInput.value = selected.join(', ');
    }

    if (selected.length > 0) {
      clearFieldError('revenda');
    }
  }

  checkboxes.forEach((cb) => {
    cb.addEventListener('change', updateMultiselect);
  });

  /* ---------- Erros ---------- */
  function clearErrors() {
    form.querySelectorAll('.has-error').forEach((el) => el.classList.remove('has-error'));
    form.querySelectorAll('.error').forEach((el) => { el.textContent = ''; });
    globalError.hidden = true;
    globalError.innerHTML = '';
  }

  function clearFieldError(name) {
    const fieldEl = form.querySelector(`[name="${name}"]`)?.closest('.field')
      || form.querySelector(`[data-error-for="${name}"]`)?.closest('.field');
    if (!fieldEl) return;
    fieldEl.classList.remove('has-error');
    const errEl = fieldEl.querySelector(`.error[data-error-for="${name}"]`);
    if (errEl) errEl.textContent = '';
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
    return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  /* ---------- Validacao local ---------- */
  function collectAndValidate() {
    clearErrors();
    const errors = [];

    const revenda = document.getElementById('revenda').value.trim();
    if (!revenda) { setFieldError('revenda', 'Selecione pelo menos uma revenda.'); errors.push('Revenda'); }

    const setor = document.getElementById('setor').value.trim();
    if (!setor) { setFieldError('setor', 'Selecione o setor.'); errors.push('Setor'); }

    const razao_social = document.getElementById('razao_social').value.trim();
    if (!razao_social) { setFieldError('razao_social', 'Informe a razao social.'); errors.push('Razao Social'); }

    const cnpjRaw = document.getElementById('cnpj').value;
    const cnpjDigits = cnpjRaw.replace(/\D/g, '');
    if (!cnpjDigits) { setFieldError('cnpj', 'Informe o CNPJ.'); errors.push('CNPJ'); }
    else if (!isValidCnpj(cnpjDigits)) { setFieldError('cnpj', 'CNPJ invalido.'); errors.push('CNPJ'); }

    const telefoneDigits = document.getElementById('telefone').value.replace(/\D/g, '');
    if (!telefoneDigits) { setFieldError('telefone', 'Informe o telefone.'); errors.push('Telefone'); }
    else if (telefoneDigits.length !== 11) { setFieldError('telefone', 'Telefone invalido (DDD + 9 digitos).'); errors.push('Telefone'); }

    const pessoa_contato = document.getElementById('pessoa_contato').value.trim();
    if (!pessoa_contato) { setFieldError('pessoa_contato', 'Informe a pessoa de contato.'); errors.push('Pessoa de Contato'); }

    const dono_servico = document.getElementById('dono_servico').value.trim();
    if (!dono_servico) { setFieldError('dono_servico', 'Informe o dono do servico.'); errors.push('Dono do Servico'); }
    else if (!dono_servico.includes(' ')) { setFieldError('dono_servico', 'Informe nome e sobrenome.'); errors.push('Dono do Servico'); }

    const vigencia_inicio = document.getElementById('vigencia_inicio').value;
    if (!vigencia_inicio) { setFieldError('vigencia_inicio', 'Informe a data inicial.'); errors.push('Vigencia Inicio'); }

    const vigencia_fim = document.getElementById('vigencia_fim').value;
    if (!vigencia_fim) { setFieldError('vigencia_fim', 'Informe a data final.'); errors.push('Vigencia Fim'); }
    else if (vigencia_inicio && vigencia_fim < vigencia_inicio) {
      setFieldError('vigencia_fim', 'Data final deve ser igual ou posterior a data inicial.');
      errors.push('Vigencia Fim');
    }

    if (selectedFiles.length === 0) {
      setFieldError('arquivo', 'Anexe pelo menos um contrato em PDF.');
      errors.push('Arquivo');
    }

    return {
      valid: errors.length === 0,
      fields: { revenda, setor, razao_social, cnpj: cnpjDigits, telefone: telefoneDigits,
                pessoa_contato, dono_servico, vigencia_inicio, vigencia_fim },
    };
  }

  /* ---------- Submit ---------- */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { valid, fields } = collectAndValidate();
    if (!valid) {
      const firstErr = form.querySelector('.has-error input:not([type="hidden"]), .has-error select, .has-error textarea, .has-error [tabindex="0"]');
      if (firstErr) firstErr.focus({ preventScroll: false });
      return;
    }

    submitBtn.disabled = true;
    submitBtn.classList.add('is-loading');

    try {
      const fd = new FormData();
      Object.entries(fields).forEach(([k, v]) => { if (v) fd.append(k, v); });
      selectedFiles.forEach((file) => {
        fd.append('arquivo', file);
      });

      const res = await fetch('/api/contratos/submit', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        const errs = Array.isArray(data.errors) && data.errors.length
          ? data.errors : ['Erro ao enviar. Tente novamente.'];
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

  newReqBtn.addEventListener('click', () => {
    form.reset();
    selectedFiles = [];
    updateFilesUI();
    checkboxes.forEach((cb) => cb.checked = false);
    updateMultiselect();
    clearErrors();
    successCard.hidden = true;
    formCard.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  form.addEventListener('input', (e) => {
    const field = e.target.closest('.field');
    if (field && field.classList.contains('has-error')) {
      field.classList.remove('has-error');
      const errEl = field.querySelector('.error');
      if (errEl) errEl.textContent = '';
    }
  });
})();
