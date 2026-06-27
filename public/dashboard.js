/* ════════════════════════════════════════════════════════════════
   Revalle · Painel de Controle — client
   ════════════════════════════════════════════════════════════════ */
const API = '/api/dashboard';

const state = {
  view: 'overview',
  summary: null,
  fw: { status: '', unidade: '', setor: '', search: '', page: 1, pageSize: 25, total: 0 },
  ct: { vigencia: '', setor: '', search: '', page: 1, pageSize: 25, total: 0 },
  charts: {},
  drawerKind: null,
};

/* ── DOM helpers ── */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const debounce = (fn, ms = 350) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/* ── Formatação ── */
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function fmtIsoDate(s) { if (!s) return '—'; const [y, m, d] = String(s).split('-'); return `${d}/${m}/${y}`; }
function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(iso));
}
function fmtDateShort(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso)).replace('.', '');
}
function monthLabel(ym) { const [y, m] = ym.split('-'); return `${MESES[Number(m) - 1]}/${y.slice(2)}`; }
const proto = (id) => '#' + String(id).padStart(5, '0');
function fmtCpf(d) { return String(d || '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'); }
function fmtCnpj(d) { return String(d || '').replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5'); }
function fmtPhone(d) { return String(d || '').replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3'); }

/* ── API ── */
async function api(path, opts = {}) {
  const res = await fetch(API + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (res.status === 401) { window.location.href = '/dashboard/login'; throw new Error('unauth'); }
  return res;
}

/* ════════ Toasts ════════ */
const ICONS = {
  success: '<path d="M20 6 9 17l-5-5"/>',
  error: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
};
function toast(kind, title, sub = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `<div class="t-ico"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICONS[kind]}</svg></div>
    <div><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
  $('#toastStack').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 250); }, 4200);
}

/* ════════ Vigência helpers ════════ */
function vigInfo(dias, fim) {
  if (fim == null || dias == null) return { cls: 'vig-none', label: 'Sem data final', exp: 'warn', big: '∞', small: 'sem fim' };
  if (dias < 0) return { cls: 'vig-bad', label: `Vencido há ${Math.abs(dias)}d`, exp: 'bad', big: Math.abs(dias), small: 'd atrás' };
  if (dias <= 30) return { cls: 'vig-warn', label: `Vence em ${dias}d`, exp: 'bad', big: dias, small: 'dias' };
  if (dias <= 90) return { cls: 'vig-warn', label: `Vence em ${dias}d`, exp: 'warn', big: dias, small: 'dias' };
  return { cls: 'vig-ok', label: 'Vigente', exp: 'ok', big: dias, small: 'dias' };
}

/* ════════════════════════════════════════════════════════════════
   Navegação
   ════════════════════════════════════════════════════════════════ */
const TITLES = {
  overview: ['Visão Geral', 'Indicadores consolidados de solicitações e contratos'],
  firewall: ['Solicitações', 'Desbloqueios de firewall — aprove, reprove e acompanhe'],
  contratos: ['Contratos', 'Carteira de contratos e controle de vigência'],
};
function switchView(view) {
  state.view = view;
  $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  $$('.view').forEach((v) => v.hidden = v.id !== `view-${view}`);
  $('#pageTitle').textContent = TITLES[view][0];
  $('#pageSub').textContent = TITLES[view][1];
  closeSidebar();
  window.scrollTo({ top: 0 });
  if (view === 'firewall' && !$('#fwBody').children.length) loadFirewall();
  if (view === 'contratos' && !$('#ctBody').children.length) loadContratos();
}

function closeSidebar() { $('#sidebar').classList.remove('open'); $('#scrim').classList.remove('open'); }

/* ════════════════════════════════════════════════════════════════
   Chart.js — tema customizado
   ════════════════════════════════════════════════════════════════ */
const C = { brand: '#0A3296', brand5: '#2D63F0', teal: '#00B3A4', amber: '#E08A00', green: '#1F9D57', red: '#D6453E', violet: '#7C5CFC' };
if (window.Chart) {
  Chart.defaults.font.family = "'Outfit', sans-serif";
  Chart.defaults.font.size = 12.5;
  Chart.defaults.color = '#5A6480';
  Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.plugins.legend.display = false;
  const tt = Chart.defaults.plugins.tooltip;
  tt.backgroundColor = '#11182B'; tt.padding = 12; tt.cornerRadius = 10;
  tt.displayColors = false; tt.titleFont = { family: "'Outfit'", weight: '600', size: 13 };
  tt.bodyFont = { family: "'Outfit'", size: 13 }; tt.titleMarginBottom = 4;
}
function makeChart(id, cfg) {
  if (!window.Chart) return;
  if (state.charts[id]) state.charts[id].destroy();
  const ctx = document.getElementById(id);
  if (!ctx) return;
  state.charts[id] = new Chart(ctx, cfg);
}
function hBar(id, items, color) {
  makeChart(id, {
    type: 'bar',
    data: { labels: items.map((i) => i.label), datasets: [{ data: items.map((i) => i.value), backgroundColor: color, borderRadius: 7, maxBarThickness: 24 }] },
    options: {
      indexAxis: 'y',
      layout: { padding: { right: 6 } },
      scales: {
        x: { beginAtZero: true, grid: { color: '#EEF1F7', drawTicks: false }, border: { display: false }, ticks: { precision: 0, padding: 6 } },
        y: { grid: { display: false }, border: { display: false }, ticks: { font: { weight: '500' }, crossAlign: 'far' } },
      },
      plugins: { tooltip: { callbacks: { title: (c) => c[0].label, label: (c) => ` ${c.parsed.x} ${c.parsed.x === 1 ? 'registro' : 'registros'}` } } },
    },
  });
}

/* ════════════════════════════════════════════════════════════════
   Visão Geral
   ════════════════════════════════════════════════════════════════ */
async function loadSummary() {
  try {
    const res = await api('/summary');
    const data = await res.json();
    if (!data.ok) throw new Error();
    state.summary = data;
    renderKpis(data);
    renderCharts(data);
    renderExpire(data.contratos.upcoming);
    renderContratoMiniKpis(data.contratos.kpis);
    populateFilters(data);
    $('#updatedAt').textContent = 'Atualizado ' + fmtDateTime(data.generated_at);
  } catch (e) {
    if (e.message !== 'unauth') toast('error', 'Erro ao carregar', 'Não foi possível obter os indicadores.');
  }
}

function renderKpis(d) {
  const fw = d.firewall.kpis, ct = d.contratos.kpis;
  const decided = fw.approved + fw.rejected;
  const taxa = decided ? Math.round((fw.approved / decided) * 100) + '%' : '—';
  const aVencer = ct.vence_30 + ct.vence_60 + ct.vence_90;
  const ico = (p) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const cards = [
    { cls: fw.pending ? 'alert-amber' : '', ico: 'amber', svg: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>', val: fw.pending, label: 'Solicitações pendentes', go: 'firewall' },
    { ico: 'green', svg: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>', val: taxa, label: 'Taxa de aprovação' },
    { ico: 'blue', svg: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>', val: fw.total, label: 'Total de solicitações', trend: fw.this_month },
    { ico: 'teal', svg: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>', val: ct.total, label: 'Contratos cadastrados', go: 'contratos' },
    { cls: aVencer ? 'alert-amber' : '', ico: 'amber', svg: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>', val: aVencer, label: 'Contratos a vencer (90d)', go: 'contratos' },
    { cls: ct.vencidos ? 'alert-red' : '', ico: 'red', svg: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>', val: ct.vencidos, label: 'Contratos vencidos', go: 'contratos' },
  ];
  $('#kpiGrid').innerHTML = cards.map((c) => `
    <div class="kpi ${c.cls || ''}" ${c.go ? `data-goto="${c.go}" style="cursor:pointer"` : ''}>
      <div class="kpi-top">
        <div class="kpi-ico ${c.ico}">${ico(c.svg)}</div>
        ${c.trend ? `<span class="kpi-trend up">+${c.trend} este mês</span>` : ''}
      </div>
      <div class="kpi-val">${c.val}</div>
      <div class="kpi-label">${c.label}</div>
    </div>`).join('');
}

function lastMonths(n) {
  const out = []; const now = new Date();
  for (let i = n - 1; i >= 0; i--) { const x = new Date(now.getFullYear(), now.getMonth() - i, 1); out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`); }
  return out;
}

function renderCharts(d) {
  /* Tendência (área) */
  const months = lastMonths(12);
  const map = Object.fromEntries(d.firewall.monthly.map((r) => [r.month, r.total]));
  const series = months.map((m) => map[m] || 0);
  $('#trendTotal').textContent = `+${d.firewall.kpis.this_month} este mês`;
  if (window.Chart) {
    const ctx = document.getElementById('chartTrend').getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 230);
    g.addColorStop(0, 'rgba(45,99,240,.26)'); g.addColorStop(1, 'rgba(45,99,240,0)');
    makeChart('chartTrend', {
      type: 'line',
      data: { labels: months.map(monthLabel), datasets: [{ data: series, borderColor: C.brand5, borderWidth: 2.5, fill: true, backgroundColor: g, tension: .4, pointRadius: 0, pointHoverRadius: 6, pointHoverBackgroundColor: C.brand5, pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2 }] },
      options: {
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 14 } },
          y: { beginAtZero: true, grid: { color: '#EEF1F7', drawTicks: false }, border: { display: false }, ticks: { precision: 0, padding: 8, maxTicksLimit: 5 } },
        },
        plugins: { tooltip: { callbacks: { label: (c) => ` ${c.parsed.y} ${c.parsed.y === 1 ? 'solicitação' : 'solicitações'}` } } },
      },
    });
  }

  /* Status (donut) */
  const st = Object.fromEntries(d.firewall.byStatus.map((r) => [r.status, r.total]));
  const sv = [st.pending || 0, st.approved || 0, st.rejected || 0];
  $('#donutTotal').textContent = sv.reduce((a, b) => a + b, 0);
  makeChart('chartStatus', {
    type: 'doughnut',
    data: { labels: ['Pendentes', 'Aprovadas', 'Reprovadas'], datasets: [{ data: sv, backgroundColor: [C.amber, C.green, C.red], borderWidth: 0, hoverOffset: 6, spacing: 2 }] },
    options: { cutout: '72%', plugins: { tooltip: { callbacks: { label: (c) => ` ${c.label}: ${c.parsed}` } } } },
  });
  const legend = [['Pendentes', sv[0], C.amber], ['Aprovadas', sv[1], C.green], ['Reprovadas', sv[2], C.red]];
  $('#statusLegend').innerHTML = legend.map(([n, v, c]) => `<div class="legend-row"><span class="dot" style="background:${c}"></span><span class="lname">${n}</span><span class="lval">${v}</span></div>`).join('');

  /* Por unidade / setor */
  hBar('chartUnidade', d.firewall.byUnidade.slice(0, 8).map((r) => ({ label: r.unidade.replace('Revalle ', ''), value: r.total })), C.brand5);
  hBar('chartSetor', d.firewall.bySetor.slice(0, 8).map((r) => ({ label: r.setor, value: r.total })), C.teal);

  /* Top domínios */
  const dom = d.firewall.topDomains.length
    ? hBar('chartDomains', d.firewall.topDomains.map((r) => ({ label: r.domain, value: r.total })), C.brand)
    : null;
  if (!d.firewall.topDomains.length && window.Chart) makeChart('chartDomains', { type: 'bar', data: { labels: [], datasets: [{ data: [] }] }, options: {} });

  /* Contratos por revenda */
  hBar('chartRevenda', d.contratos.byRevenda.slice(0, 8).map((r) => ({ label: r.revenda.replace('Revalle ', ''), value: r.total })), C.violet);
}

function renderExpire(list) {
  const box = $('#expireList');
  if (!list.length) { box.innerHTML = '<div class="expire-empty">Nenhum contrato vence nos próximos 90 dias. 🎉</div>'; return; }
  box.innerHTML = list.map((c) => {
    const v = vigInfo(c.dias_restantes, c.vigencia_fim);
    return `<div class="expire-item" data-contract="${c.id}">
      <div class="expire-days ${v.exp}"><b>${v.big}</b><span>${v.small}</span></div>
      <div class="expire-meta">
        <b>${esc(c.razao_social)}</b>
        <span>${esc(c.revenda)} · vence ${fmtIsoDate(c.vigencia_fim)}</span>
      </div>
    </div>`;
  }).join('');
}

function renderContratoMiniKpis(k) {
  const items = [
    { ico: 'green', svg: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>', val: k.vigente_long + k.sem_fim, label: 'Vigentes' },
    { ico: 'amber', svg: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>', val: k.vence_30, label: 'Vencem em 30 dias' },
    { ico: 'amber', svg: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>', val: k.vence_60 + k.vence_90, label: 'Vencem em 31–90 dias' },
    { ico: 'red', svg: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>', val: k.vencidos, label: 'Vencidos' },
  ];
  const ico = (p) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  $('#contratoKpis').innerHTML = items.map((i) => `<div class="mini-kpi"><div class="mk-ico kpi-ico ${i.ico}">${ico(i.svg)}</div><div><b>${i.val}</b><span>${i.label}</span></div></div>`).join('');
  // badges no menu
  const pend = state.summary.firewall.kpis.pending;
  const navP = $('#navPending'); navP.hidden = !pend; navP.textContent = pend;
  const exp = k.vencidos + k.vence_30;
  const navE = $('#navExpiring'); navE.hidden = !exp; navE.textContent = exp;
}

function populateFilters(d) {
  const fwU = $('#fwUnidade'), fwS = $('#fwSetor'), ctS = $('#ctSetor');
  if (fwU.options.length <= 1) d.firewall.byUnidade.forEach((r) => fwU.add(new Option(r.unidade, r.unidade)));
  if (fwS.options.length <= 1) d.firewall.bySetor.forEach((r) => fwS.add(new Option(r.setor, r.setor)));
  if (ctS.options.length <= 1) d.contratos.bySetor.forEach((r) => ctS.add(new Option(r.setor, r.setor)));
}

/* ════════════════════════════════════════════════════════════════
   Solicitações de firewall
   ════════════════════════════════════════════════════════════════ */
function fwQuery() {
  const f = state.fw; const p = new URLSearchParams();
  if (f.status) p.set('status', f.status);
  if (f.unidade) p.set('unidade', f.unidade);
  if (f.setor) p.set('setor', f.setor);
  if (f.search) p.set('search', f.search);
  return p;
}
async function loadFirewall() {
  const body = $('#fwBody');
  body.innerHTML = skeletonRows(6, 8);
  $('#fwEmpty').hidden = true;
  const p = fwQuery(); p.set('page', state.fw.page); p.set('pageSize', state.fw.pageSize);
  $('#fwExport').href = `${API}/export/firewall.csv?${fwQuery().toString()}`;
  try {
    const res = await api('/firewall?' + p.toString());
    const data = await res.json();
    state.fw.total = data.total;
    renderFwRows(data.rows);
    renderPager('#fwPager', state.fw, loadFirewall);
  } catch (e) { if (e.message !== 'unauth') body.innerHTML = ''; }
}
function statusBadge(s) {
  const m = { pending: ['pending', 'Pendente'], approved: ['approved', 'Aprovada'], rejected: ['rejected', 'Reprovada'] };
  const [cls, lbl] = m[s] || ['pending', s];
  return `<span class="badge ${cls}"><span class="bd"></span>${lbl}</span>`;
}
function renderFwRows(rows) {
  const body = $('#fwBody');
  if (!rows.length) { body.innerHTML = ''; emptyState('#fwEmpty', 'Nenhuma solicitação encontrada', 'Ajuste os filtros ou aguarde novas solicitações.'); return; }
  $('#fwEmpty').hidden = true;
  body.innerHTML = rows.map((r) => `
    <tr data-fw="${r.id}">
      <td><span class="proto">${proto(r.id)}</span></td>
      <td><div class="cell-main">${esc(r.nome_completo)}</div><div class="cell-sub">${esc(r.email || fmtCpf(r.cpf))}</div></td>
      <td>${esc(r.unidade)}</td>
      <td>${esc(r.setor)}</td>
      <td class="center"><span class="count-pill">${(r.urls || []).length}</span></td>
      <td>${fmtDateTime(r.created_at)}</td>
      <td>${statusBadge(r.status)}</td>
      <td><svg class="row-arrow" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></td>
    </tr>`).join('');
}
async function openFirewall(id) {
  openDrawer();
  state.drawerKind = 'firewall';
  $('#drawerBody').innerHTML = drawerSkeleton();
  $('#drawerFoot').hidden = true;
  try {
    const res = await api('/firewall/' + id);
    const { row: r } = await res.json();
    $('#drawerKicker').textContent = proto(r.id) + ' · ' + fmtDateTime(r.created_at);
    $('#drawerTitle').textContent = r.nome_completo;
    let callout = '';
    if (r.status === 'approved') callout = `<div class="callout green"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg><div><b>Aprovada</b> em ${fmtDateTime(r.resolved_at)}</div></div>`;
    else if (r.status === 'rejected') callout = `<div class="callout red"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 9-6 6M9 9l6 6"/></svg><div><b>Reprovada</b> em ${fmtDateTime(r.resolved_at)}${r.motivo_reprovacao ? `<br><span style="font-weight:400">Motivo: ${esc(r.motivo_reprovacao)}</span>` : ''}</div></div>`;
    else callout = `<div class="callout amber"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg><div><b>Aguardando decisão.</b> Use os botões abaixo para aprovar ou reprovar.</div></div>`;
    const urls = (r.urls || []).map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>${esc(u)}</a>`).join('');
    $('#drawerBody').innerHTML = `
      <div class="d-section">${callout}</div>
      <div class="d-section">
        <div class="d-section-title">Colaborador</div>
        <div class="d-grid">
          <div class="d-cell"><label>Unidade</label><span>${esc(r.unidade)}</span></div>
          <div class="d-cell"><label>Setor</label><span>${esc(r.setor)}</span></div>
          <div class="d-cell"><label>Cargo</label><span>${esc(r.cargo)}</span></div>
          <div class="d-cell"><label>Função</label><span>${esc(r.funcao)}</span></div>
          <div class="d-cell"><label>CPF</label><span>${fmtCpf(r.cpf)}</span></div>
          <div class="d-cell"><label>E-mail</label><span>${esc(r.email || '—')}</span></div>
        </div>
      </div>
      <div class="d-section">
        <div class="d-section-title">Sites solicitados (${(r.urls || []).length})</div>
        <div class="url-list">${urls || '<span style="color:var(--faint)">—</span>'}</div>
      </div>
      ${r.justificativa ? `<div class="d-section"><div class="d-section-title">Justificativa</div><div class="d-cell" style="border:1px solid var(--line);border-radius:12px"><span>${esc(r.justificativa)}</span></div></div>` : ''}`;
    if (r.status === 'pending') {
      const foot = $('#drawerFoot'); foot.hidden = false;
      foot.innerHTML = `<button class="btn btn-reject" id="btnReject">Reprovar</button><button class="btn btn-approve" id="btnApprove">Aprovar</button>`;
      $('#btnApprove').onclick = () => actFirewall(id, 'approve');
      $('#btnReject').onclick = () => showRejectBox(id);
    }
  } catch (e) { if (e.message !== 'unauth') $('#drawerBody').innerHTML = '<p style="color:var(--faint)">Erro ao carregar.</p>'; }
}
function showRejectBox(id) {
  const foot = $('#drawerFoot');
  foot.innerHTML = `<div class="reject-box" style="flex:1">
    <textarea id="rejMotivo" placeholder="Descreva o motivo da reprovação… (será enviado ao colaborador)" maxlength="1000"></textarea>
    <div class="reject-actions">
      <button class="btn btn-reject" id="rejCancel" style="flex:0 0 auto;padding:13px 16px">Cancelar</button>
      <button class="btn btn-approve" id="rejConfirm" style="background:var(--red)">Confirmar reprovação</button>
    </div></div>`;
  const ta = $('#rejMotivo'); ta.focus();
  $('#rejCancel').onclick = () => openFirewall(id);
  $('#rejConfirm').onclick = () => {
    const motivo = ta.value.trim();
    if (!motivo) { ta.style.borderColor = 'var(--red)'; ta.focus(); return; }
    actFirewall(id, 'reject', motivo);
  };
}
async function actFirewall(id, action, motivo) {
  const foot = $('#drawerFoot');
  $$('#drawerFoot button').forEach((b) => b.disabled = true);
  try {
    const res = await api(`/firewall/${id}/${action}`, { method: 'POST', body: JSON.stringify(action === 'reject' ? { motivo } : {}) });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Falha');
    toast('success', action === 'approve' ? 'Solicitação aprovada' : 'Solicitação reprovada', 'E-mail enviado ao colaborador.');
    foot.hidden = true;
    closeDrawer();
    await Promise.all([loadFirewall(), loadSummary()]);
  } catch (e) {
    if (e.message !== 'unauth') { toast('error', 'Não foi possível concluir', e.message); $$('#drawerFoot button').forEach((b) => b.disabled = false); }
  }
}

/* ════════════════════════════════════════════════════════════════
   Contratos
   ════════════════════════════════════════════════════════════════ */
function ctQuery() {
  const f = state.ct; const p = new URLSearchParams();
  if (f.vigencia) p.set('vigencia', f.vigencia);
  if (f.setor) p.set('setor', f.setor);
  if (f.search) p.set('search', f.search);
  return p;
}
async function loadContratos() {
  const body = $('#ctBody');
  body.innerHTML = skeletonRows(6, 7);
  $('#ctEmpty').hidden = true;
  const p = ctQuery(); p.set('page', state.ct.page); p.set('pageSize', state.ct.pageSize);
  $('#ctExport').href = `${API}/export/contratos.csv?${ctQuery().toString()}`;
  try {
    const res = await api('/contratos?' + p.toString());
    const data = await res.json();
    state.ct.total = data.total;
    renderCtRows(data.rows);
    renderPager('#ctPager', state.ct, loadContratos);
  } catch (e) { if (e.message !== 'unauth') body.innerHTML = ''; }
}
function renderCtRows(rows) {
  const body = $('#ctBody');
  if (!rows.length) { body.innerHTML = ''; emptyState('#ctEmpty', 'Nenhum contrato encontrado', 'Ajuste os filtros para refinar a busca.'); return; }
  $('#ctEmpty').hidden = true;
  body.innerHTML = rows.map((r) => {
    const v = vigInfo(r.dias_restantes, r.vigencia_fim);
    return `<tr data-contract="${r.id}">
      <td><span class="proto">${proto(r.id)}</span></td>
      <td><div class="cell-main">${esc(r.razao_social)}</div><div class="cell-sub">${fmtCnpj(r.cnpj)}</div></td>
      <td>${esc(r.revenda)}</td>
      <td>${esc(r.setor)}</td>
      <td><div class="vig-cell"><span class="badge ${v.cls}"><span class="bd"></span>${v.label}</span><small>${r.vigencia_fim ? 'até ' + fmtIsoDate(r.vigencia_fim) : 'a partir de ' + fmtIsoDate(r.vigencia_inicio)}</small></div></td>
      <td class="center"><span class="count-pill">${r.arquivos_count}</span></td>
      <td><svg class="row-arrow" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></td>
    </tr>`;
  }).join('');
}
async function openContrato(id) {
  openDrawer();
  state.drawerKind = 'contrato';
  $('#drawerBody').innerHTML = drawerSkeleton();
  $('#drawerFoot').hidden = true;
  try {
    const res = await api('/contratos/' + id);
    const { row: r, arquivos } = await res.json();
    const v = vigInfo(r.dias_restantes, r.vigencia_fim);
    $('#drawerKicker').textContent = proto(r.id) + ' · cadastrado ' + fmtDateTime(r.created_at);
    $('#drawerTitle').textContent = r.razao_social;
    const calloutCls = v.exp === 'bad' ? 'red' : v.exp === 'warn' ? 'amber' : 'green';
    const files = arquivos.length ? arquivos.map((f) => `
      <div class="file-row">
        <div class="file-ico"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg></div>
        <div class="file-meta"><b>${esc(f.arquivo_nome)}</b><span>PDF</span></div>
        <div class="file-actions">
          <a class="file-btn" href="${API}/contratos/file/${f.id}" target="_blank" rel="noopener" title="Abrir"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg></a>
          <a class="file-btn" href="${API}/contratos/file/${f.id}?download=1" title="Baixar"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg></a>
        </div>
      </div>`).join('') : '<span style="color:var(--faint)">Nenhum arquivo anexado.</span>';
    $('#drawerBody').innerHTML = `
      <div class="d-section"><div class="callout ${calloutCls}">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
        <div><b>${v.label}.</b> Vigência ${fmtIsoDate(r.vigencia_inicio)} ${r.vigencia_fim ? '— ' + fmtIsoDate(r.vigencia_fim) : '(sem data final)'}</div>
      </div></div>
      <div class="d-section">
        <div class="d-section-title">Fornecedor</div>
        <div class="d-grid">
          <div class="d-cell full"><label>Razão Social</label><span>${esc(r.razao_social)}</span></div>
          <div class="d-cell"><label>CNPJ</label><span>${fmtCnpj(r.cnpj)}</span></div>
          <div class="d-cell"><label>Telefone</label><span>${fmtPhone(r.telefone)}</span></div>
          <div class="d-cell"><label>Contato</label><span>${esc(r.pessoa_contato)}</span></div>
          <div class="d-cell"><label>Dono do serviço</label><span>${esc(r.dono_servico)}</span></div>
        </div>
      </div>
      <div class="d-section">
        <div class="d-section-title">Contrato</div>
        <div class="d-grid">
          <div class="d-cell"><label>Revenda</label><span>${esc(r.revenda)}</span></div>
          <div class="d-cell"><label>Setor</label><span>${esc(r.setor)}</span></div>
          <div class="d-cell"><label>Início da vigência</label><span>${fmtIsoDate(r.vigencia_inicio)}</span></div>
          <div class="d-cell"><label>Fim da vigência</label><span>${r.vigencia_fim ? fmtIsoDate(r.vigencia_fim) : 'Sem data final'}</span></div>
        </div>
      </div>
      <div class="d-section">
        <div class="d-section-title">Documentos (${arquivos.length})</div>
        ${files}
      </div>`;
  } catch (e) { if (e.message !== 'unauth') $('#drawerBody').innerHTML = '<p style="color:var(--faint)">Erro ao carregar.</p>'; }
}

/* ════════════════════════════════════════════════════════════════
   Drawer / paginação / skeletons
   ════════════════════════════════════════════════════════════════ */
function openDrawer() { $('#drawer').classList.add('open'); $('#drawerScrim').classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeDrawer() { $('#drawer').classList.remove('open'); $('#drawerScrim').classList.remove('open'); document.body.style.overflow = ''; }

function renderPager(sel, st, reload) {
  const pages = Math.max(Math.ceil(st.total / st.pageSize), 1);
  const from = st.total ? (st.page - 1) * st.pageSize + 1 : 0;
  const to = Math.min(st.page * st.pageSize, st.total);
  const win = []; const cur = st.page;
  for (let i = 1; i <= pages; i++) { if (i === 1 || i === pages || Math.abs(i - cur) <= 1) win.push(i); else if (win[win.length - 1] !== '…') win.push('…'); }
  $(sel).innerHTML = `
    <div class="pager-info">Mostrando <b>${from}–${to}</b> de <b>${st.total}</b></div>
    <div class="pager-btns">
      <button class="pg-btn" data-pg="prev" ${cur <= 1 ? 'disabled' : ''}>‹</button>
      ${win.map((p) => p === '…' ? '<span class="pg-btn" style="border:none;background:none;cursor:default">…</span>' : `<button class="pg-btn ${p === cur ? 'active' : ''}" data-pg="${p}">${p}</button>`).join('')}
      <button class="pg-btn" data-pg="next" ${cur >= pages ? 'disabled' : ''}>›</button>
    </div>`;
  $$(sel + ' [data-pg]').forEach((b) => b.onclick = () => {
    const v = b.dataset.pg;
    if (v === 'prev') st.page = Math.max(1, st.page - 1);
    else if (v === 'next') st.page = Math.min(pages, st.page + 1);
    else st.page = Number(v);
    reload();
  });
}
function skeletonRows(rows, cols) {
  return Array.from({ length: rows }).map(() => `<tr>${Array.from({ length: cols }).map(() => '<td><div class="skeleton" style="height:16px;width:80%"></div></td>').join('')}</tr>`).join('');
}
function drawerSkeleton() {
  return `<div class="skeleton" style="height:64px;margin-bottom:22px"></div>
    <div class="skeleton" style="height:140px;margin-bottom:22px"></div>
    <div class="skeleton" style="height:120px"></div>`;
}
function emptyState(sel, title, sub) {
  const el = $(sel); el.hidden = false;
  el.innerHTML = `<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><b>${esc(title)}</b><span>${esc(sub)}</span>`;
}

/* ════════════════════════════════════════════════════════════════
   Eventos
   ════════════════════════════════════════════════════════════════ */
function bind() {
  $$('.nav-item').forEach((b) => b.onclick = () => switchView(b.dataset.view));
  $('#menuToggle').onclick = () => { $('#sidebar').classList.add('open'); $('#scrim').classList.add('open'); };
  $('#scrim').onclick = closeSidebar;
  $('#logoutBtn').onclick = async () => { await api('/logout', { method: 'POST' }).catch(() => {}); window.location.href = '/dashboard/login'; };
  $('#refreshBtn').onclick = async (e) => {
    const b = e.currentTarget; b.classList.add('refreshing');
    await loadSummary();
    if (state.view === 'firewall') await loadFirewall();
    if (state.view === 'contratos') await loadContratos();
    setTimeout(() => b.classList.remove('refreshing'), 500);
  };

  // navegação por cartões / atalhos
  document.addEventListener('click', (e) => {
    const goto = e.target.closest('[data-goto]'); if (goto) { switchView(goto.dataset.goto); return; }
    const exp = e.target.closest('[data-contract]'); if (exp) { switchView('contratos'); openContrato(exp.dataset.contract); return; }
    const fwRow = e.target.closest('[data-fw]'); if (fwRow) { openFirewall(fwRow.dataset.fw); return; }
    const ctRow = e.target.closest('[data-contract]'); if (ctRow) { openContrato(ctRow.dataset.contract); return; }
  });

  $('#drawerClose').onclick = closeDrawer;
  $('#drawerScrim').onclick = closeDrawer;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeDrawer(); closeSidebar(); } });

  // filtros firewall
  $('#fwStatus').onclick = (e) => { const s = e.target.closest('.seg'); if (!s) return; $$('#fwStatus .seg').forEach((x) => x.classList.toggle('active', x === s)); state.fw.status = s.dataset.val; state.fw.page = 1; loadFirewall(); };
  $('#fwUnidade').onchange = (e) => { state.fw.unidade = e.target.value; state.fw.page = 1; loadFirewall(); };
  $('#fwSetor').onchange = (e) => { state.fw.setor = e.target.value; state.fw.page = 1; loadFirewall(); };
  $('#fwSearch').oninput = debounce((e) => { state.fw.search = e.target.value.trim(); state.fw.page = 1; loadFirewall(); });

  // filtros contratos
  $('#ctVigencia').onclick = (e) => { const s = e.target.closest('.seg'); if (!s) return; $$('#ctVigencia .seg').forEach((x) => x.classList.toggle('active', x === s)); state.ct.vigencia = s.dataset.val; state.ct.page = 1; loadContratos(); };
  $('#ctSetor').onchange = (e) => { state.ct.setor = e.target.value; state.ct.page = 1; loadContratos(); };
  $('#ctSearch').oninput = debounce((e) => { state.ct.search = e.target.value.trim(); state.ct.page = 1; loadContratos(); });
}

/* ════════ Init ════════ */
(async function init() {
  bind();
  await loadSummary();
  $('#pageLoader').classList.add('hide');
})();
