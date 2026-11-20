/* Pesquisa de NPS do TI — passo a passo montado a partir de
 * PESQUISA_NPS_TI (public/pesquisa-nps-ti-perguntas.js). */
document.addEventListener('DOMContentLoaded', () => {
  const DEF = window.PESQUISA_NPS_TI;
  const $ = (id) => document.getElementById(id);

  const cpfCard = $('cpfCard');
  const surveyCard = $('surveyCard');
  const doneCard = $('doneCard');
  const formCpf = $('formCpf');
  const cpfInput = $('cpfInput');
  const questionsEl = $('questions');

  $('aberturaText').textContent = DEF.abertura;

  let cpf = '';
  let respostas = {};
  let etapaIdx = 0;

  /* ── Utilitarios ── */
  function maskCpf(value) {
    const d = value.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
  }
  function el(tag, attrs = {}, text) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else node.setAttribute(k, v);
    }
    if (text != null) node.textContent = text;
    return node;
  }
  function setLoading(btnId, loading, label) {
    $(btnId).disabled = loading;
    $(`${btnId}Text`).textContent = label;
    $(`${btnId}Spinner`).hidden = !loading;
  }
  function showOnly(card) {
    for (const c of [cpfCard, surveyCard, doneCard]) c.hidden = c !== card;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ── Rascunho no aparelho (quem fechar a pagina continua de onde parou) ── */
  const draftKey = () => `npsTi:${cpf}`;
  function saveDraft() {
    try { localStorage.setItem(draftKey(), JSON.stringify({ respostas, etapaIdx })); } catch (_) { /* sem storage */ }
  }
  function loadDraft() {
    try { return JSON.parse(localStorage.getItem(draftKey()) || 'null'); } catch (_) { return null; }
  }
  function clearDraft() {
    try { localStorage.removeItem(draftKey()); } catch (_) { /* sem storage */ }
  }

  /* ── Anti-robo (mesmo desafio das demais paginas) ── */
  const interactions = { moves: 0, touches: 0, keyEvents: 0 };
  window.addEventListener('mousemove', () => { interactions.moves++; }, { passive: true });
  window.addEventListener('touchstart', () => { interactions.touches++; }, { passive: true });
  window.addEventListener('touchmove', () => { interactions.touches++; }, { passive: true });
  window.addEventListener('keydown', () => { interactions.keyEvents++; }, { passive: true });

  // O token vale de 0,8 s a 30 min depois de emitido e pode ser reutilizado:
  // carrega ao abrir a pagina e so renova perto de expirar.
  let challenge = null;
  let challengeAt = 0;
  let powNonce = 0;

  async function loadChallenge() {
    try {
      const data = await fetch('/api/security/challenge').then((r) => r.json());
      if (!data.ok) return;
      challenge = data;
      challengeAt = Date.now();
      powNonce = 0;
      if (window.crypto && window.crypto.subtle) {
        const enc = new TextEncoder();
        for (let n = 0; n < 300000; n++) {
          const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(challenge.nonce + String(n))));
          if (bytes[0] === 0 && (bytes[1] >> 4) === 0) { powNonce = n; break; }
        }
      }
    } catch (_) { /* segue sem desafio; o servidor recusa e a pessoa tenta de novo */ }
  }
  loadChallenge();

  async function securityPayload() {
    if (!challenge || Date.now() - challengeAt > 25 * 60 * 1000) await loadChallenge();
    const wait = 900 - (Date.now() - challengeAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    return {
      challengeToken: challenge ? challenge.token : '',
      powNonce,
      website_url: $('website_url').value,
      behavior: { isTrusted: true, webdriver: Boolean(navigator.webdriver), ...interactions },
    };
  }

  /* ── Etapa 0: CPF ── */
  cpfInput.addEventListener('input', (e) => {
    e.target.value = maskCpf(e.target.value);
    $('errCpf').textContent = '';
    $('cpfError').hidden = true;
  });

  formCpf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const digits = cpfInput.value.replace(/\D/g, '');
    if (digits.length !== 11) {
      $('errCpf').textContent = 'Informe os 11 números do seu CPF.';
      return;
    }
    setLoading('btnCpf', true, 'Consultando...');
    try {
      const res = await fetch('/api/pesquisa-nps-ti/check-cpf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpf: digits, ...(await securityPayload()) }),
      });
      const data = await res.json();
      if (data.isBot || data.expired) challenge = null; // token recusado: pega outro na proxima tentativa
      if (data.already_answered) {
        showDone(true);
        return;
      }
      if (!res.ok || !data.ok) {
        $('cpfError').textContent = data.error || 'Não foi possível consultar o CPF.';
        $('cpfError').hidden = false;
        return;
      }
      cpf = digits;
      startSurvey(data.colaborador);
    } catch (err) {
      console.error('[nps-ti check-cpf] erro:', err);
      $('cpfError').textContent = 'Erro de conexão. Verifique sua internet e tente novamente.';
      $('cpfError').hidden = false;
    } finally {
      setLoading('btnCpf', false, 'Começar');
    }
  });

  function startSurvey(colab) {
    $('colabNome').textContent = colab.nome_completo || 'Colaborador(a)';
    const chips = $('colabChips');
    chips.innerHTML = '';
    for (const v of [colab.cargo, colab.unidade]) if (v) chips.appendChild(el('span', { class: 'colab-chip' }, v));

    const draft = loadDraft();
    respostas = (draft && draft.respostas) || {};
    etapaIdx = (draft && draft.etapaIdx) || 0;
    showOnly(surveyCard);
    renderEtapa();
  }

  /* ── Etapas ── */
  const etapasAtivas = () => DEF.etapas.filter((e) => DEF.etapaTemPerguntas(e.id, respostas));

  function renderEtapa() {
    const ativas = etapasAtivas();
    etapaIdx = Math.min(etapaIdx, ativas.length - 1);
    const etapa = ativas[etapaIdx];

    $('stepCount').textContent = `Etapa ${etapaIdx + 1} de ${ativas.length}`;
    $('stepTitle').textContent = etapa.titulo;
    $('stepDesc').textContent = etapa.descricao;
    $('progressFill').style.width = `${Math.round(((etapaIdx + 1) / ativas.length) * 100)}%`;
    $('btnBack').hidden = etapaIdx === 0;
    $('btnNextText').textContent = etapaIdx === ativas.length - 1 ? 'Enviar respostas' : 'Continuar';
    $('surveyError').hidden = true;

    questionsEl.innerHTML = '';
    for (const p of DEF.perguntas.filter((q) => q.etapa === etapa.id)) {
      questionsEl.appendChild(renderPergunta(p));
    }
    refreshVisibility();
  }

  // Mostra/esconde perguntas e itens conforme as respostas atuais.
  function refreshVisibility() {
    for (const card of questionsEl.querySelectorAll('.q-card')) {
      const p = DEF.porId[card.dataset.q];
      card.hidden = !DEF.visivel(p, respostas);
      if (p.tipo === 'matriz') {
        const visiveis = new Set(DEF.itensVisiveis(p, respostas).map((it) => it.id));
        for (const row of card.querySelectorAll('.matrix-row')) row.hidden = !visiveis.has(row.dataset.item);
      }
    }
  }

  function onChange() {
    saveDraft();
    refreshVisibility();
    // Ultima etapa pode mudar (ex.: marcou/desmarcou celular).
    const ativas = etapasAtivas();
    $('stepCount').textContent = `Etapa ${etapaIdx + 1} de ${ativas.length}`;
    $('progressFill').style.width = `${Math.round(((etapaIdx + 1) / ativas.length) * 100)}%`;
    $('btnNextText').textContent = etapaIdx === ativas.length - 1 ? 'Enviar respostas' : 'Continuar';
  }

  function clearError(card) {
    card.classList.remove('has-error');
    const e = card.querySelector('.q-error');
    if (e) e.remove();
    for (const row of card.querySelectorAll('.matrix-row.missing')) row.classList.remove('missing');
  }

  function renderPergunta(p) {
    const card = el('div', { class: 'q-card', dataset: { q: p.id } });
    const head = el('div', { class: 'q-text' }, p.texto);
    head.appendChild(p.obrigatoria ? el('span', { class: 'req' }, '*') : el('span', { class: 'opt' }, '(opcional)'));
    card.appendChild(head);
    if (p.ajuda) card.appendChild(el('div', { class: 'q-help' }, p.ajuda));

    if (p.tipo === 'unica' || p.tipo === 'multi') {
      const list = el('div', { class: 'chip-list' });
      for (const o of p.opcoes) {
        const btn = el('button', { type: 'button', class: `chip-btn${p.tipo === 'multi' ? ' multi' : ''}`, dataset: { v: o.v } });
        btn.appendChild(el('span', { class: 'mark' }));
        btn.appendChild(el('span', {}, o.l));
        list.appendChild(btn);
      }
      const paint = () => {
        const v = respostas[p.id];
        for (const b of list.children) {
          b.classList.toggle('selected', p.tipo === 'multi' ? (v || []).includes(b.dataset.v) : v === b.dataset.v);
        }
      };
      list.addEventListener('click', (e) => {
        const b = e.target.closest('.chip-btn');
        if (!b) return;
        const v = b.dataset.v;
        if (p.tipo === 'unica') {
          // Clicar de novo desmarca perguntas opcionais.
          respostas[p.id] = respostas[p.id] === v && !p.obrigatoria ? undefined : v;
        } else {
          let arr = new Set(respostas[p.id] || []);
          if (arr.has(v)) arr.delete(v);
          else if (p.exclusiva && v === p.exclusiva) arr = new Set([v]);
          else { arr.add(v); if (p.exclusiva) arr.delete(p.exclusiva); }
          respostas[p.id] = [...arr];
        }
        paint();
        clearError(card);
        onChange();
      });
      paint();
      card.appendChild(list);
    } else if (p.tipo === 'escala') {
      const scale = el('div', { class: 'scale' });
      for (let n = p.min; n <= p.max; n++) {
        const cls = n <= 6 ? 'det' : n <= 8 ? 'neu' : 'pro';
        scale.appendChild(el('button', { type: 'button', class: cls, dataset: { v: String(n) } }, String(n)));
      }
      const paint = () => { for (const b of scale.children) b.classList.toggle('selected', String(respostas[p.id]) === b.dataset.v); };
      scale.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        respostas[p.id] = Number(b.dataset.v);
        paint();
        clearError(card);
        onChange();
      });
      paint();
      card.appendChild(scale);
      const labels = el('div', { class: 'scale-labels' });
      labels.appendChild(el('span', {}, `${p.min} · ${p.rotuloMin}`));
      labels.appendChild(el('span', {}, `${p.rotuloMax} · ${p.max}`));
      card.appendChild(labels);
    } else if (p.tipo === 'matriz') {
      for (const it of p.itens) {
        const row = el('div', { class: 'matrix-row', dataset: { item: it.id } });
        row.appendChild(el('div', { class: 'matrix-label' }, it.l));
        const opts = el('div', { class: 'matrix-opts' });
        for (const nota of p.notas) opts.appendChild(el('button', { type: 'button', title: nota.l, dataset: { v: nota.v } }, nota.v));
        opts.appendChild(el('button', { type: 'button', class: 'nao-uso', dataset: { v: 'nao_uso' } }, 'Não uso'));
        const paint = () => {
          const v = (respostas[p.id] || {})[it.id];
          for (const b of opts.children) b.classList.toggle('selected', v === b.dataset.v);
        };
        opts.addEventListener('click', (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          respostas[p.id] = { ...(respostas[p.id] || {}), [it.id]: b.dataset.v };
          paint();
          row.classList.remove('missing');
          onChange();
        });
        paint();
        row.appendChild(opts);
        card.appendChild(row);
      }
    } else if (p.tipo === 'aberta') {
      const ta = el('textarea', {
        maxlength: String(DEF.MAX_TEXTO),
        placeholder: p.obrigatoria ? 'Escreva aqui...' : 'Escreva aqui, se quiser...',
      });
      ta.value = respostas[p.id] || '';
      const info = el('div', { class: 'char-info' }, `${ta.value.length}/${DEF.MAX_TEXTO}`);
      ta.addEventListener('input', () => {
        respostas[p.id] = ta.value;
        info.textContent = `${ta.value.length}/${DEF.MAX_TEXTO}`;
        if (!p.min || ta.value.trim().length >= p.min) clearError(card);
        saveDraft();
      });
      card.appendChild(ta);
      card.appendChild(info);
    }
    return card;
  }

  function showErrors(erros) {
    let first = null;
    for (const [id, msg] of Object.entries(erros)) {
      const card = questionsEl.querySelector(`.q-card[data-q="${id}"]`);
      if (!card) continue;
      clearError(card);
      card.classList.add('has-error');
      card.appendChild(el('div', { class: 'q-error' }, msg));
      const p = DEF.porId[id];
      if (p.tipo === 'matriz') {
        for (const it of DEF.itensVisiveis(p, respostas)) {
          if (!(respostas[id] || {})[it.id]) {
            const row = card.querySelector(`.matrix-row[data-item="${it.id}"]`);
            if (row) row.classList.add('missing');
          }
        }
      }
      if (!first) first = card;
    }
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  $('btnBack').addEventListener('click', () => {
    etapaIdx = Math.max(0, etapaIdx - 1);
    saveDraft();
    renderEtapa();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  $('btnNext').addEventListener('click', async () => {
    const ativas = etapasAtivas();
    const etapa = ativas[etapaIdx];
    const { erros } = DEF.validar(respostas, etapa.id);
    if (Object.keys(erros).length) {
      showErrors(erros);
      return;
    }
    if (etapaIdx < ativas.length - 1) {
      etapaIdx++;
      saveDraft();
      renderEtapa();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    await enviar();
  });

  async function enviar() {
    setLoading('btnNext', true, 'Enviando...');
    $('surveyError').hidden = true;
    try {
      const res = await fetch('/api/pesquisa-nps-ti/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpf, respostas, ...(await securityPayload()) }),
      });
      const data = await res.json();
      if (data.isBot || data.expired) challenge = null;
      if (res.ok && data.ok) {
        clearDraft();
        showDone(false);
        return;
      }
      if (data.already_answered) {
        clearDraft();
        showDone(true);
        return;
      }
      // Servidor recusou alguma pergunta: volta para a etapa dela.
      if (data.campos) {
        const id = Object.keys(data.campos)[0];
        const idx = etapasAtivas().findIndex((e) => e.id === DEF.porId[id].etapa);
        if (idx >= 0) { etapaIdx = idx; renderEtapa(); showErrors(data.campos); }
      }
      $('surveyError').textContent = (data.errors && data.errors[0]) || data.error || 'Não foi possível enviar. Tente novamente.';
      $('surveyError').hidden = false;
    } catch (err) {
      console.error('[nps-ti submit] erro:', err);
      $('surveyError').textContent = 'Erro de conexão. Suas respostas estão salvas neste aparelho; tente enviar de novo.';
      $('surveyError').hidden = false;
    } finally {
      const ultima = etapaIdx === etapasAtivas().length - 1;
      setLoading('btnNext', false, ultima ? 'Enviar respostas' : 'Continuar');
    }
  }

  function showDone(jaRespondeu) {
    if (jaRespondeu) {
      $('doneIcon').classList.add('info');
      $('doneTitle').textContent = 'Você já respondeu esta pesquisa';
      $('doneSub').textContent = 'Cada colaborador responde uma vez. Obrigado pela participação!';
    }
    showOnly(doneCard);
  }
});
