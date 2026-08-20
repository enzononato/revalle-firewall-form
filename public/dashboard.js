/* ════════════════════════════════════════════════════════════════
   Revalle · Painel de Controle — client
   ════════════════════════════════════════════════════════════════ */
const API = '/api/dashboard';

const state = {
  view: 'overview',
  user: null,
  summary: null,
  fw: { status: '', unidade: '', setor: '', search: '', page: 1, pageSize: 25, total: 0 },
  ct: { vigencia: '', setor: '', search: '', page: 1, pageSize: 25, total: 0 },
  tess: { setor: '', revenda: '', search: '', page: 1, pageSize: 25, total: 0 },
  solides: { status: '', setor: '', search: '', page: 1, pageSize: 25, total: 0 },
  cultura: { unidade: '', area: '', tempo: '', search: '', page: 1, pageSize: 25, total: 0, subTab: 'respostas' },
  culturaAdesao: { status: 'pendente', unidade: '', setor: '', search: '', page: 1, pageSize: 25, total: 0 },
  usuarios: { search: '', perfil: '', list: [] },
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
  tess: ['Imersão Tess', 'Lista de inscritos e detalhes da Imersão Tess'],
  solides: ['Gestão de Ponto (Sólides)', 'Lideranças participantes e controle de assinatura do termo'],
  cultura: ['Pesquisa de Cultura', 'Respostas 100% anônimas sobre o dia a dia e clima na Revalle'],
  usuarios: ['Usuários & Acessos', 'Gerenciamento de acessos e perfis de usuários do painel'],
};
function switchView(view) {
  if (state.user && state.user.perfil === 'mkt_cultura') {
    view = 'cultura';
  }
  state.view = view;
  $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  $$('.view').forEach((v) => v.hidden = v.id !== `view-${view}`);
  $('#pageTitle').textContent = TITLES[view] ? TITLES[view][0] : 'Painel';
  $('#pageSub').textContent = TITLES[view] ? TITLES[view][1] : '';
  closeSidebar();
  window.scrollTo({ top: 0 });
  if (view === 'firewall') loadFirewall();
  if (view === 'contratos') loadContratos();
  if (view === 'tess') loadTess();
  if (view === 'solides') loadSolides();
  if (view === 'cultura') loadPesquisaCultura();
  if (view === 'usuarios') loadUsuarios();
}

async function loadCurrentUser() {
  try {
    const res = await api('/me').then((r) => r.json());
    if (res.ok && res.user) {
      state.user = res.user;
      const name = state.user.nome || 'Administrador';
      const isAdmin = state.user.perfil === 'admin';
      const roleLabel = isAdmin ? 'Administrador' : 'Mkt / Cultura';
      
      if ($('#sideUserName')) $('#sideUserName').textContent = name;
      if ($('#sideUserRoleBadge')) {
        $('#sideUserRoleBadge').textContent = roleLabel;
        $('#sideUserRoleBadge').style.color = isAdmin ? '#38bdf8' : '#34d399';
      }
      if ($('#sideUserAvatar')) {
        $('#sideUserAvatar').textContent = (name.trim()[0] || 'U').toUpperCase();
        $('#sideUserAvatar').style.background = isAdmin
          ? 'linear-gradient(135deg, #2563EB, #0A3296)'
          : 'linear-gradient(135deg, #059669, #10B981)';
      }

      // Filtrar itens do menu pela permissão data-roles
      $$('.nav-item').forEach((item) => {
        const roles = (item.dataset.roles || '').split(',').map((r) => r.trim()).filter(Boolean);
        if (roles.length > 0 && !roles.includes(state.user.perfil)) {
          item.style.display = 'none';
        } else {
          item.style.display = 'flex';
        }
      });

      // Se for Mkt/Cultura, direciona exclusivamente para a Pesquisa de Cultura
      if (!isAdmin) {
        switchView('cultura');
      }
    }
  } catch (err) {
    console.error('[dashboard] erro ao obter usuario logado:', err);
  }
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
    updateNavBadges(data);
    $('#updatedAt').textContent = 'Atualizado ' + fmtDateTime(data.generated_at);
  } catch (e) {
    if (e.message !== 'unauth') toast('error', 'Erro ao carregar', 'Não foi possível obter os indicadores.');
  }
}

function updateNavBadges(data) {
  if (data.firewall && data.firewall.kpis) {
    const p = data.firewall.kpis.pending || 0;
    if ($('#navPending')) {
      $('#navPending').textContent = p;
      $('#navPending').hidden = p === 0;
    }
  }
  if (data.contratos && data.contratos.kpis) {
    const exp = (data.contratos.kpis.vence_30 || 0) + (data.contratos.kpis.vence_60 || 0) + (data.contratos.kpis.vence_90 || 0);
    if ($('#navExpiring')) {
      $('#navExpiring').textContent = exp;
      $('#navExpiring').hidden = exp === 0;
    }
  }
  if (data.tess) {
    const t = data.tess.total || 0;
    if ($('#navTessTotal')) {
      $('#navTessTotal').textContent = t;
      $('#navTessTotal').hidden = t === 0;
    }
  }
  if (data.solides) {
    const p = data.solides.pendentes != null ? data.solides.pendentes : (data.solides.total_permitidos - data.solides.assinados);
    if ($('#navSolidesPending')) {
      $('#navSolidesPending').textContent = p > 0 ? p : 0;
      $('#navSolidesPending').hidden = p <= 0;
    }
  }
  if (data.cultura) {
    const c = data.cultura.total || 0;
    if ($('#navCulturaTotal')) {
      $('#navCulturaTotal').textContent = c;
      $('#navCulturaTotal').hidden = c === 0;
    }
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
   Imersão Tess Dashboard
   ════════════════════════════════════════════════════════════════ */
async function loadTess() {
  const { setor, revenda, search, page, pageSize } = state.tess;
  const query = new URLSearchParams({ page, pageSize });
  if (setor) query.set('setor', setor);
  if (revenda) query.set('revenda', revenda);
  if (search) query.set('search', search);

  if ($('#tessExport')) $('#tessExport').href = `${API}/export/imersao-tess.csv?${query.toString()}`;
  if ($('#tessBody')) $('#tessBody').innerHTML = skeletonRows(5, 7);
  if ($('#tessEmpty')) $('#tessEmpty').hidden = true;

  try {
    const res = await api(`/imersao-tess?${query}`).then((r) => r.json());
    if (!res.ok) throw new Error(res.error || 'Erro ao carregar');
    state.tess.total = res.total;
    if ($('#navTessTotal')) {
      $('#navTessTotal').textContent = res.total;
      $('#navTessTotal').hidden = res.total === 0;
    }
    renderTess(res.rows, res.total);
    renderPager('#tessPager', state.tess, loadTess);
  } catch (err) {
    if (err.message === 'unauth') return;
    toast('error', 'Falha ao carregar inscritos da Imersão Tess', err.message);
    emptyState('#tessEmpty', 'Erro ao carregar', 'Ocorreu um erro ao buscar os dados.');
  }
}

function renderTess(rows, total) {
  const tbody = $('#tessBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!rows.length) {
    emptyState('#tessEmpty', 'Nenhum inscrito encontrado', 'Tente ajustar a busca ou filtros.');
    return;
  }
  if ($('#tessEmpty')) $('#tessEmpty').hidden = true;
  const html = rows.map((r) => `
    <tr>
      <td><span class="mono">${esc(proto(r.id))}</span></td>
      <td><span class="date-tag">${esc(fmtDateShort(r.created_at))}</span></td>
      <td><strong>${esc(r.nome)}</strong></td>
      <td>${esc(r.email)}</td>
      <td>${esc(fmtPhone(r.telefone))}</td>
      <td><span class="chip">${esc(r.setor)}</span></td>
      <td><span class="chip font-medium">${esc(r.revenda)}</span></td>
    </tr>
  `).join('');
  tbody.innerHTML = html;
}

/* ════════════════════════════════════════════════════════════════
   Treinamento Sólides Dashboard
   ════════════════════════════════════════════════════════════════ */
const selectedSolidesCpfs = new Set();

async function loadSolides() {
  const { status, setor, search, page, pageSize } = state.solides;
  const query = new URLSearchParams({ page, pageSize });
  if (status) query.set('status', status);
  if (setor) query.set('setor', setor);
  if (search) query.set('search', search);

  if ($('#solidesExport')) $('#solidesExport').href = `${API}/export/solides.csv?${query.toString()}`;
  if ($('#solidesBody')) $('#solidesBody').innerHTML = skeletonRows(5, 8);
  if ($('#solidesEmpty')) $('#solidesEmpty').hidden = true;

  try {
    const res = await api(`/solides?${query}`).then((r) => r.json());
    if (!res.ok) throw new Error(res.error || 'Erro ao carregar');
    state.solides.total = res.total;

    if (res.stats) {
      if ($('#solidesKpiTotalBase')) $('#solidesKpiTotalBase').textContent = res.stats.total_base || 0;
      if ($('#solidesKpiTotal')) $('#solidesKpiTotal').textContent = res.stats.total_permitidos || 0;
      if ($('#solidesKpiAssinados')) $('#solidesKpiAssinados').textContent = res.stats.assinados || 0;
      if ($('#solidesKpiTaxa')) $('#solidesKpiTaxa').textContent = `${res.stats.taxa_adesao || 0}% de adesão`;
      if ($('#solidesKpiPendentes')) $('#solidesKpiPendentes').textContent = res.stats.pendentes || 0;
      if ($('#navSolidesPending')) {
        $('#navSolidesPending').textContent = res.stats.pendentes || 0;
        $('#navSolidesPending').hidden = (res.stats.pendentes || 0) === 0;
      }
    }

    renderSolides(res.rows, res.total);
    renderPager('#solidesPager', state.solides, loadSolides);
  } catch (err) {
    if (err.message === 'unauth') return;
    toast('error', 'Falha ao carregar lista de treinamento Sólides', err.message);
    emptyState('#solidesEmpty', 'Erro ao carregar', 'Ocorreu um erro ao buscar os dados.');
  }
}

function updateBulkBar() {
  const bar = $('#solidesBulkBar');
  const countEl = $('#solidesBulkCount');
  if (!bar) return;
  const count = selectedSolidesCpfs.size;
  if (count > 0) {
    bar.style.display = 'flex';
    if (countEl) countEl.textContent = `${count} colaborador${count > 1 ? 'es' : ''} selecionado${count > 1 ? 's' : ''}`;
  } else {
    bar.style.display = 'none';
  }
}

function renderSolides(rows, total) {
  const tbody = $('#solidesBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  selectedSolidesCpfs.clear();
  updateBulkBar();
  const checkAll = $('#solidesCheckAll');
  if (checkAll) checkAll.checked = false;

  if (!rows.length) {
    emptyState('#solidesEmpty', 'Nenhum colaborador encontrado', 'Tente ajustar a busca ou filtros.');
    return;
  }
  if ($('#solidesEmpty')) $('#solidesEmpty').hidden = true;

  const html = rows.map((r) => {
    let statusHtml = '';
    if (r.assinado) {
      statusHtml = `<span class="badge badge-ok"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Assinado</span>`;
    } else if (r.permitido) {
      statusHtml = `<span class="badge badge-warn"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Pendente</span>`;
    } else {
      statusHtml = `<span class="badge" style="background:#f1f5f9; color:#64748b; border:1px solid #cbd5e1;"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/></svg> Não Habilitado</span>`;
    }

    return `
    <tr data-cpf="${esc(r.cpf)}">
      <td style="text-align: center;">
        <input type="checkbox" class="solides-row-check" data-cpf="${esc(r.cpf)}" />
      </td>
      <td style="text-align: center;">
        <label class="toggle-switch" title="${r.permitido ? 'Permitido para responder' : 'Desabilitado'}">
          <input type="checkbox" class="solides-perm-toggle" data-cpf="${esc(r.cpf)}" ${r.permitido ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </td>
      <td>${statusHtml}</td>
      <td><strong>${esc(r.nome_completo)}</strong></td>
      <td><span class="mono">${esc(fmtCpf(r.cpf))}</span></td>
      <td>
        <span class="chip">${esc(r.cargo || '—')}</span>
        ${r.setor ? `<span class="chip font-medium">${esc(r.setor)}</span>` : ''}
      </td>
      <td><span class="chip font-medium">${esc(r.unidade || '—')}</span></td>
      <td>
        ${r.assinado_em 
          ? `<span class="date-tag">${esc(fmtDateTime(r.assinado_em))}</span>` 
          : `<span style="color: #94a3b8; font-size: 13px;">—</span>`
        }
      </td>
    </tr>
  `;
  }).join('');

  tbody.innerHTML = html;

  // Bind individual toggle switch change
  $$('.solides-perm-toggle', tbody).forEach((toggle) => {
    toggle.onchange = async (e) => {
      const cpf = e.target.dataset.cpf;
      const permitido = e.target.checked;
      try {
        const res = await api('/solides/toggle-permission', {
          method: 'POST',
          body: JSON.stringify({ cpf, permitido }),
        }).then((r) => r.json());

        if (!res.ok) throw new Error(res.error || 'Erro ao atualizar');
        toast('success', `Permissão ${permitido ? 'habilitada' : 'desabilitada'} com sucesso.`);
        loadSolides();
      } catch (err) {
        e.target.checked = !permitido;
        toast('error', 'Erro ao alterar permissão', err.message);
      }
    };
  });

  // Bind checkboxes
  $$('.solides-row-check', tbody).forEach((cb) => {
    cb.onchange = (e) => {
      const cpf = e.target.dataset.cpf;
      if (e.target.checked) selectedSolidesCpfs.add(cpf);
      else selectedSolidesCpfs.delete(cpf);
      updateBulkBar();
    };
  });
}

/* ════════════════════════════════════════════════════════════════
   Pesquisa de Cultura Revalle Dashboard
   ════════════════════════════════════════════════════════════════ */
async function loadPesquisaCultura() {
  const { unidade, area, tempo, search, page, pageSize } = state.cultura;
  const query = new URLSearchParams({ page, pageSize });
  if (unidade) query.set('unidade', unidade);
  if (area) query.set('area', area);
  if (tempo) query.set('tempo', tempo);
  if (search) query.set('search', search);

  if ($('#culturaExport')) $('#culturaExport').href = `${API}/export/pesquisa-cultura.csv?${query.toString()}`;
  if ($('#culturaBody')) $('#culturaBody').innerHTML = skeletonRows(5, 7);
  if ($('#culturaEmpty')) $('#culturaEmpty').hidden = true;

  try {
    const res = await api(`/pesquisa-cultura?${query}`).then((r) => r.json());
    if (!res.ok) throw new Error(res.error || 'Erro ao carregar');
    state.cultura.total = res.total;

    if (res.stats) {
      if ($('#culturaKpiTotal')) $('#culturaKpiTotal').textContent = res.stats.total || 0;
      if ($('#culturaKpiUnidades')) $('#culturaKpiUnidades').textContent = (res.stats.byUnidade || []).length;
      if ($('#culturaKpiAreas')) $('#culturaKpiAreas').textContent = (res.stats.byArea || []).length;
      if ($('#navCulturaTotal')) {
        $('#navCulturaTotal').textContent = res.stats.total || 0;
        $('#navCulturaTotal').hidden = (res.stats.total || 0) === 0;
      }
    }

    renderPesquisaCultura(res.rows, res.total);
    renderPager('#culturaPager', state.cultura, loadPesquisaCultura);
  } catch (err) {
    if (err.message === 'unauth') return;
    toast('error', 'Falha ao carregar pesquisa de cultura', err.message);
    emptyState('#culturaEmpty', 'Erro ao carregar', 'Ocorreu um erro ao buscar os dados.');
  }
}

function renderPesquisaCultura(rows, total) {
  const tbody = $('#culturaBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!rows.length) {
    emptyState('#culturaEmpty', 'Nenhuma resposta encontrada', 'Tente ajustar os filtros ou termo de busca.');
    return;
  }
  if ($('#culturaEmpty')) $('#culturaEmpty').hidden = true;

  const html = rows.map((r) => {
    const highlight = r.pesa_favor_contra ? r.pesa_favor_contra.slice(0, 75) + (r.pesa_favor_contra.length > 75 ? '…' : '') : '—';
    return `
    <tr data-cultura="${esc(r.id)}" style="cursor: pointer;">
      <td><span class="mono">#PC-${String(r.id).padStart(5, '0')}</span></td>
      <td><span class="date-tag">${esc(fmtDateTime(r.created_at))}</span></td>
      <td><strong>${esc(r.unidade || '—')}</strong></td>
      <td><span class="chip">${esc(r.area_departamento || '—')}</span></td>
      <td><span class="chip font-medium">${esc(r.tempo_empresa || '—')}</span></td>
      <td style="max-width: 280px; color: #475569; font-size: 13px; line-height: 1.4;">
        <em>"${esc(highlight)}"</em>
      </td>
      <td style="text-align: center;">
        <button class="btn btn-sm btn-outline" data-cultura="${esc(r.id)}" style="font-size: 12px; padding: 4px 10px;">
          Ver Respostas
        </button>
      </td>
    </tr>
  `;
  }).join('');

  tbody.innerHTML = html;
}

async function openPesquisaCulturaDrawer(id) {
  state.drawerKind = 'cultura';
  $('#drawerKicker').textContent = 'Pesquisa de Cultura Revalle';
  $('#drawerTitle').textContent = `Resposta #PC-${String(id).padStart(5, '0')}`;
  $('#drawerFoot').hidden = true;
  $('#drawerBody').innerHTML = '<div style="padding: 24px; text-align: center; color: #64748b;">Carregando respostas completas...</div>';
  openDrawer();

  try {
    const res = await api(`/pesquisa-cultura/${id}`).then((r) => r.json());
    if (!res.ok || !res.resposta) throw new Error(res.error || 'Resposta não encontrada');

    const r = res.resposta;

    const qBlock = (num, title, text) => `
      <div style="margin-bottom: 20px; padding: 14px 16px; background: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0;">
        <div style="font-size: 13.5px; font-weight: 700; color: #1e293b; margin-bottom: 6px; line-height: 1.4;">
          ${num}) ${esc(title)}
        </div>
        <div style="font-size: 14px; color: #334155; line-height: 1.6; white-space: pre-wrap; word-break: break-word;">
          ${esc(text || '—')}
        </div>
      </div>
    `;

    $('#drawerBody').innerHTML = `
      <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px;">
        <span class="chip" style="background:#e0f2fe; color:#0369a1; font-weight:700;">🏢 ${esc(r.unidade)}</span>
        <span class="chip" style="background:#f1f5f9; color:#334155; font-weight:600;">💼 ${esc(r.area_departamento)}</span>
        <span class="chip" style="background:#fef3c7; color:#92400e; font-weight:600;">⏳ ${esc(r.tempo_empresa)}</span>
        <span class="chip" style="background:#f3e8ff; color:#6b21a8; font-weight:600;">📅 ${esc(fmtDateTime(r.created_at))}</span>
      </div>

      <div style="font-size: 15px; font-weight: 800; color: #0A3296; margin-top: 10px; margin-bottom: 14px; text-transform: uppercase; letter-spacing: 0.5px;">
        Bloco 1: Engajamento - NPS
      </div>
      ${qBlock('4', 'Imagine que um amigo pergunta se vale a pena trabalhar na Revalle. O que faz você querer continuar aqui? E o que faz você pensar em sair?', r.pesa_favor_contra)}

      <div style="font-size: 15px; font-weight: 800; color: #0A3296; margin-top: 24px; margin-bottom: 14px; text-transform: uppercase; letter-spacing: 0.5px;">
        Bloco 2: Continuidade Cultural e Cultura Desejada
      </div>
      ${qBlock('5', 'Como você imagina a empresa daqui a 3 a 5 anos? O que ela teria que ter para estar no seu no melhor momento? O que ela teria que ter de diferente?', r.futuro_3_5_anos)}
      ${qBlock('6', 'Escolha até 5 valores ou palavras que mostram como a empresa é de verdade no dia a dia.', r.valores_empresa)}
      ${qBlock('7', 'O que existe aqui que você não quer que mude nunca?', r.nao_mudar_nunca)}
      ${qBlock('8', 'Teve algum dia difícil em que você quase desistiu, mas encontrou um motivo para continuar? Ou algum dia em que pensou em sair da empresa? Conte para a gente.', r.dia_dificil_motivo)}
      ${qBlock('9', 'Ficou alguma coisa que você gostaria de dizer? Este espaço é só seu.', r.algo_sem_dizer)}

      <div style="font-size: 15px; font-weight: 800; color: #0A3296; margin-top: 24px; margin-bottom: 14px; text-transform: uppercase; letter-spacing: 0.5px;">
        Bloco 3: Liderança Direta
      </div>
      ${qBlock('10', 'Alguma vez sua liderança direta ajudou você a aprender algo novo ou desafiou você de alguma forma? Conte como foi?', r.lideranca_aprendizado_desafio)}
      ${qBlock('11', 'Alguma vez você fez um trabalho e depois viu que não era o que sua liderança queria? Ou alguma vez fez certo já na primeira vez? Como foi isso?', r.lideranca_entrega_feedback)}
      ${qBlock('12', 'Quando foi a última vez que sua liderança direta falou com você sobre o seu trabalho, seja para elogiar ou para dizer o que poderia melhorar? Conte como foi.', r.lideranca_ultimo_feedback)}
      ${qBlock('13', 'Alguma vez sua liderança pediu algo de você, como prazo, postura ou dedicação, mas você viu que ela não fazia o mesmo? Conte essa situação.', r.lideranca_exemplo_incoerencia)}
      ${qBlock('14', 'O que você mais gosta na sua liderança direta? E, se pudesse mudar uma coisa, o que seria?', r.lideranca_gosta_mudar)}
    `;
  } catch (err) {
    $('#drawerBody').innerHTML = `<div style="padding:24px; color:#ef4444;">Erro ao carregar detalhes: ${esc(err.message)}</div>`;
  }
}

function switchCulturaSubTab(subTab) {
  state.cultura.subTab = subTab;
  const isRespostas = subTab === 'respostas';

  const tabResp = $('#tabCulturaRespostas');
  const tabAdes = $('#tabCulturaAdesao');
  const viewResp = $('#culturaSubViewRespostas');
  const viewAdes = $('#culturaSubViewAdesao');

  if (tabResp) {
    tabResp.style.fontWeight = isRespostas ? '700' : '600';
    tabResp.style.color = isRespostas ? '#0A3296' : '#64748b';
    tabResp.style.borderBottom = isRespostas ? '3px solid #0A3296' : 'none';
  }
  if (tabAdes) {
    tabAdes.style.fontWeight = !isRespostas ? '700' : '600';
    tabAdes.style.color = !isRespostas ? '#0A3296' : '#64748b';
    tabAdes.style.borderBottom = !isRespostas ? '3px solid #0A3296' : 'none';
  }

  if (viewResp) viewResp.hidden = !isRespostas;
  if (viewAdes) viewAdes.hidden = isRespostas;

  if (isRespostas) {
    loadPesquisaCultura();
  } else {
    loadPesquisaCulturaAdesao();
  }
}

async function loadPesquisaCulturaAdesao() {
  const { status, unidade, setor, search, page, pageSize } = state.culturaAdesao;
  const query = new URLSearchParams({ page, pageSize });
  if (status) query.set('status', status);
  if (unidade) query.set('unidade', unidade);
  if (setor) query.set('setor', setor);
  if (search) query.set('search', search);

  if ($('#culturaAdesaoExport')) {
    $('#culturaAdesaoExport').href = `${API}/export/pesquisa-cultura-adesao.csv?${query.toString()}`;
  }
  if ($('#culturaAdesaoBody')) $('#culturaAdesaoBody').innerHTML = skeletonRows(5, 6);
  if ($('#culturaAdesaoEmpty')) $('#culturaAdesaoEmpty').hidden = true;

  try {
    const res = await api(`/pesquisa-cultura-adesao?${query}`).then((r) => r.json());
    if (!res.ok) throw new Error(res.error || 'Erro ao carregar adesão');
    state.culturaAdesao.total = res.total;

    if (res.stats) {
      const s = res.stats;
      if ($('#culturaAdesaoKpiBase')) $('#culturaAdesaoKpiBase').textContent = s.total_base || 0;
      if ($('#culturaAdesaoKpiRespondidos')) $('#culturaAdesaoKpiRespondidos').textContent = s.total_respondidos || 0;
      if ($('#culturaAdesaoKpiPendentes')) $('#culturaAdesaoKpiPendentes').textContent = s.total_pendentes || 0;
      if ($('#culturaAdesaoKpiTaxa')) $('#culturaAdesaoKpiTaxa').textContent = `${s.taxa_adesao || 0}%`;

      if ($('#badgeCulturaPendentes')) {
        $('#badgeCulturaPendentes').textContent = `${s.total_pendentes || 0} pendentes`;
        $('#badgeCulturaPendentes').hidden = (s.total_pendentes || 0) === 0;
      }
    }

    renderPesquisaCulturaAdesao(res.rows, res.total);
    renderPager('#culturaAdesaoPager', state.culturaAdesao, loadPesquisaCulturaAdesao);
  } catch (err) {
    if (err.message === 'unauth') return;
    toast('error', 'Falha ao carregar adesão da pesquisa', err.message);
    emptyState('#culturaAdesaoEmpty', 'Erro ao carregar', 'Ocorreu um erro ao buscar os colaboradores.');
  }
}

function renderPesquisaCulturaAdesao(rows, total) {
  const tbody = $('#culturaAdesaoBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!rows.length) {
    emptyState('#culturaAdesaoEmpty', 'Nenhum colaborador encontrado', 'Tente ajustar os filtros ou termo de busca.');
    return;
  }
  if ($('#culturaAdesaoEmpty')) $('#culturaAdesaoEmpty').hidden = true;

  const html = rows.map((r) => {
    const statusTag = r.participou
      ? `<span class="chip font-medium" style="background:#f0fdf4; color:#16a34a; border: 1px solid #bbf7d0; font-weight:700;">✅ Respondido</span>`
      : `<span class="chip font-medium" style="background:#fffbeb; color:#b45309; border: 1px solid #fde68a; font-weight:700;">⚠️ Pendente</span>`;

    return `
      <tr>
        <td><strong>${esc(r.nome_completo)}</strong></td>
        <td><span class="mono" style="font-size: 13px;">${esc(fmtCpf(r.cpf))}</span></td>
        <td>${esc(r.unidade || '—')}</td>
        <td><span class="chip">${esc(r.setor || '—')}</span></td>
        <td><span class="chip font-medium">${esc(r.cargo || '—')}</span></td>
        <td style="text-align: center;">
          ${statusTag}
        </td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = html;
}

/* ════════════════════════════════════════════════════════════════
   Usuários & Acessos (Admin)
   ════════════════════════════════════════════════════════════════ */
async function loadUsuarios() {
  try {
    const res = await api('/usuarios').then((r) => r.json());
    if (!res.ok) throw new Error(res.error || 'Erro ao carregar usuários');
    state.usuarios.list = res.users || [];
    if ($('#navUsuariosTotal')) {
      $('#navUsuariosTotal').textContent = state.usuarios.list.length;
      $('#navUsuariosTotal').hidden = state.usuarios.list.length === 0;
    }
    renderUsuarios();
  } catch (err) {
    if (err.message === 'unauth') return;
    toast('error', 'Falha ao carregar usuários', err.message);
    emptyState('#usuariosEmpty', 'Erro ao carregar', 'Ocorreu um erro ao buscar os usuários.');
  }
}

function renderUsuarios() {
  const tbody = $('#usuariosBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const term = (state.usuarios.search || '').toLowerCase();
  const perfilFilter = state.usuarios.perfil;

  const filtered = state.usuarios.list.filter((u) => {
    if (perfilFilter && u.perfil !== perfilFilter) return false;
    if (!term) return true;
    return (u.nome || '').toLowerCase().includes(term) || (u.email || '').toLowerCase().includes(term);
  });

  if (!filtered.length) {
    emptyState('#usuariosEmpty', 'Nenhum usuário encontrado', 'Tente ajustar o termo de busca ou filtro de perfil.');
    return;
  }
  if ($('#usuariosEmpty')) $('#usuariosEmpty').hidden = true;

  const html = filtered.map((u) => {
    const isAdmin = u.perfil === 'admin';
    const perfilTag = isAdmin
      ? '<span class="chip" style="background:#e0f2fe; color:#0369a1; font-weight:700;">Administrador</span>'
      : '<span class="chip" style="background:#dcfce7; color:#15803d; font-weight:700;">Mkt / Cultura</span>';
    const statusTag = u.ativo
      ? '<span class="chip font-medium" style="background:#f0fdf4; color:#16a34a; border: 1px solid #bbf7d0;">Ativo</span>'
      : '<span class="chip font-medium" style="background:#f8fafc; color:#94a3b8; border: 1px solid #e2e8f0;">Inativo</span>';

    const lastLogin = u.ultimo_login ? fmtDateTime(u.ultimo_login) : 'Nunca acessou';
    const isSelf = state.user && state.user.id === u.id;

    return `
      <tr>
        <td><strong>${esc(u.nome)}</strong></td>
        <td><span class="mono" style="font-size: 13px;">${esc(u.email)}</span></td>
        <td>${perfilTag}</td>
        <td>${statusTag}</td>
        <td><span class="date-tag">${esc(lastLogin)}</span></td>
        <td><span class="date-tag">${esc(fmtDateTime(u.created_at))}</span></td>
        <td style="text-align: center;">
          <div style="display: flex; gap: 6px; justify-content: center;">
            <button class="btn btn-sm btn-outline" data-user-edit="${esc(u.id)}" title="Editar Usuário" style="font-size: 12px; padding: 4px 8px;">
              Editar
            </button>
            <button class="btn btn-sm btn-outline" data-user-toggle="${esc(u.id)}" data-current-ativo="${u.ativo ? '1' : '0'}" title="${u.ativo ? 'Desativar acesso' : 'Ativar acesso'}" style="font-size: 12px; padding: 4px 8px; color: ${u.ativo ? '#d97706' : '#16a34a'};">
              ${u.ativo ? 'Desativar' : 'Ativar'}
            </button>
            ${!isSelf ? `
              <button class="btn btn-sm btn-outline" data-user-delete="${esc(u.id)}" data-user-nome="${esc(u.nome)}" title="Excluir Usuário" style="font-size: 12px; padding: 4px 8px; color: #dc2626;">
                Excluir
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = html;
}

function openUserModal(user = null) {
  const modal = $('#userModalOverlay');
  const title = $('#userModalTitle');
  const form = $('#userModalForm');
  const err = $('#userModalError');
  const idInput = $('#userIdInput');
  const nomeInput = $('#userNomeInput');
  const emailInput = $('#userEmailInput');
  const perfilInput = $('#userPerfilInput');
  const senhaInput = $('#userSenhaInput');
  const senhaLabel = $('#userSenhaLabel');
  const senhaHelp = $('#userSenhaHelp');
  const ativoInput = $('#userAtivoInput');

  if (err) { err.hidden = true; err.textContent = ''; }
  form.reset();

  if (user) {
    title.textContent = 'Editar Usuário';
    idInput.value = user.id;
    nomeInput.value = user.nome || '';
    emailInput.value = user.email || '';
    perfilInput.value = user.perfil || 'mkt_cultura';
    ativoInput.checked = Boolean(user.ativo);
    senhaInput.required = false;
    senhaLabel.innerHTML = 'Alterar Senha <span style="font-weight: normal; color: #64748b;">(opcional)</span>';
    senhaHelp.hidden = false;
  } else {
    title.textContent = 'Novo Usuário';
    idInput.value = '';
    ativoInput.checked = true;
    perfilInput.value = 'mkt_cultura';
    senhaInput.required = true;
    senhaLabel.innerHTML = 'Senha de Acesso <span style="color: #ef4444;">*</span>';
    senhaHelp.hidden = true;
  }

  modal.style.display = 'grid';
  nomeInput.focus();
}

function closeUserModal() {
  const modal = $('#userModalOverlay');
  if (modal) modal.style.display = 'none';
}

async function saveUser(e) {
  e.preventDefault();
  const id = $('#userIdInput').value;
  const nome = $('#userNomeInput').value.trim();
  const email = $('#userEmailInput').value.trim();
  const perfil = $('#userPerfilInput').value;
  const senha = $('#userSenhaInput').value;
  const ativo = $('#userAtivoInput').checked;
  const errBox = $('#userModalError');
  const btnSave = $('#btnUserModalSave');

  if (!nome) { errBox.textContent = 'Informe o nome completo.'; errBox.hidden = false; return; }
  if (!email || !email.includes('@')) { errBox.textContent = 'Informe um e-mail válido.'; errBox.hidden = false; return; }
  if (!id && (!senha || senha.length < 6)) { errBox.textContent = 'A senha deve conter no mínimo 6 caracteres.'; errBox.hidden = false; return; }
  if (id && senha && senha.length < 6) { errBox.textContent = 'A nova senha deve conter no mínimo 6 caracteres.'; errBox.hidden = false; return; }

  errBox.hidden = true;
  btnSave.disabled = true;
  btnSave.textContent = 'Salvando...';

  try {
    const isEdit = Boolean(id);
    const url = isEdit ? `/usuarios/${id}` : '/usuarios';
    const method = isEdit ? 'PUT' : 'POST';
    const payload = { nome, email, perfil, ativo };
    if (senha) payload.senha = senha;

    const res = await api(url, {
      method,
      body: JSON.stringify(payload),
    }).then((r) => r.json());

    if (!res.ok) throw new Error(res.error || 'Erro ao salvar usuário');

    toast('success', isEdit ? 'Usuário atualizado com sucesso!' : 'Usuário cadastrado com sucesso!');
    closeUserModal();
    await loadUsuarios();
  } catch (err) {
    errBox.textContent = err.message || 'Erro ao salvar dados do usuário.';
    errBox.hidden = false;
  } finally {
    btnSave.disabled = false;
    btnSave.textContent = 'Salvar Usuário';
  }
}

async function deleteUser(id, nome) {
  if (!confirm(`Deseja realmente excluir o usuário "${nome}"? Esta ação não pode ser desfeita.`)) return;
  try {
    const res = await api(`/usuarios/${id}`, { method: 'DELETE' }).then((r) => r.json());
    if (!res.ok) throw new Error(res.error || 'Erro ao excluir usuário');
    toast('success', 'Usuário excluído com sucesso.');
    await loadUsuarios();
  } catch (err) {
    toast('error', 'Erro ao excluir', err.message);
  }
}

async function toggleUserStatus(id, currentAtivo) {
  const newStatus = !currentAtivo;
  try {
    const res = await api(`/usuarios/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ ativo: newStatus }),
    }).then((r) => r.json());
    if (!res.ok) throw new Error(res.error || 'Erro ao alterar status');
    toast('success', `Usuário ${newStatus ? 'ativado' : 'desativado'} com sucesso.`);
    await loadUsuarios();
  } catch (err) {
    toast('error', 'Erro ao alterar status', err.message);
  }
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
    if (state.view === 'tess') await loadTess();
    if (state.view === 'solides') await loadSolides();
    if (state.view === 'cultura') await loadPesquisaCultura();
    if (state.view === 'usuarios') await loadUsuarios();
    setTimeout(() => b.classList.remove('refreshing'), 500);
  };

  // navegação por cartões / atalhos
  document.addEventListener('click', (e) => {
    const goto = e.target.closest('[data-goto]'); if (goto) { switchView(goto.dataset.goto); return; }
    const exp = e.target.closest('[data-contract]'); if (exp) { switchView('contratos'); openContrato(exp.dataset.contract); return; }
    const fwRow = e.target.closest('[data-fw]'); if (fwRow) { openFirewall(fwRow.dataset.fw); return; }
    const ctRow = e.target.closest('[data-contract]'); if (ctRow) { openContrato(ctRow.dataset.contract); return; }
    const cult = e.target.closest('[data-cultura]'); if (cult) { openPesquisaCulturaDrawer(cult.dataset.cultura); return; }

    // Ações de usuário
    const uEdit = e.target.closest('[data-user-edit]');
    if (uEdit) {
      const u = state.usuarios.list.find((x) => String(x.id) === String(uEdit.dataset.userEdit));
      if (u) openUserModal(u);
      return;
    }
    const uToggle = e.target.closest('[data-user-toggle]');
    if (uToggle) {
      toggleUserStatus(uToggle.dataset.userToggle, uToggle.dataset.currentAtivo === '1');
      return;
    }
    const uDel = e.target.closest('[data-user-delete]');
    if (uDel) {
      deleteUser(uDel.dataset.userDelete, uDel.dataset.userNome);
      return;
    }
  });

  $('#drawerClose').onclick = closeDrawer;
  $('#drawerScrim').onclick = closeDrawer;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeDrawer(); closeSidebar(); closeUserModal(); } });

  // Eventos de Usuários
  if ($('#btnNovoUsuario')) $('#btnNovoUsuario').onclick = () => openUserModal();
  if ($('#btnUserModalClose')) $('#btnUserModalClose').onclick = closeUserModal;
  if ($('#btnUserModalCancel')) $('#btnUserModalCancel').onclick = closeUserModal;
  if ($('#userModalForm')) $('#userModalForm').onsubmit = saveUser;
  if ($('#usuariosSearch')) $('#usuariosSearch').oninput = debounce((e) => { state.usuarios.search = e.target.value.trim(); renderUsuarios(); });
  if ($('#usuariosFilterPerfil')) $('#usuariosFilterPerfil').onchange = (e) => { state.usuarios.perfil = e.target.value; renderUsuarios(); };

  // filtros firewall
  $('#fwStatus').onclick = (e) => { const s = e.target.closest('.seg'); if (!s) return; $$('#fwStatus .seg').forEach((x) => x.classList.toggle('active', x === s)); state.fw.status = s.dataset.val; state.fw.page = 1; loadFirewall(); };
  $('#fwUnidade').onchange = (e) => { state.fw.unidade = e.target.value; state.fw.page = 1; loadFirewall(); };
  $('#fwSetor').onchange = (e) => { state.fw.setor = e.target.value; state.fw.page = 1; loadFirewall(); };
  $('#fwSearch').oninput = debounce((e) => { state.fw.search = e.target.value.trim(); state.fw.page = 1; loadFirewall(); });

  // filtros contratos
  $('#ctVigencia').onclick = (e) => { const s = e.target.closest('.seg'); if (!s) return; $$('#ctVigencia .seg').forEach((x) => x.classList.toggle('active', x === s)); state.ct.vigencia = s.dataset.val; state.ct.page = 1; loadContratos(); };
  $('#ctSetor').onchange = (e) => { state.ct.setor = e.target.value; state.ct.page = 1; loadContratos(); };
  $('#ctSearch').oninput = debounce((e) => { state.ct.search = e.target.value.trim(); state.ct.page = 1; loadContratos(); });

  // filtros imersão tess
  if ($('#tessSetor')) $('#tessSetor').onchange = (e) => { state.tess.setor = e.target.value; state.tess.page = 1; loadTess(); };
  if ($('#tessRevenda')) $('#tessRevenda').onchange = (e) => { state.tess.revenda = e.target.value; state.tess.page = 1; loadTess(); };
  if ($('#tessSearch')) $('#tessSearch').oninput = debounce((e) => { state.tess.search = e.target.value.trim(); state.tess.page = 1; loadTess(); });

  // filtros treinamento solides
  if ($('#solidesStatus')) $('#solidesStatus').onclick = (e) => { const s = e.target.closest('.seg'); if (!s) return; $$('#solidesStatus .seg').forEach((x) => x.classList.toggle('active', x === s)); state.solides.status = s.dataset.val; state.solides.page = 1; loadSolides(); };
  if ($('#solidesSearch')) $('#solidesSearch').oninput = debounce((e) => { state.solides.search = e.target.value.trim(); state.solides.page = 1; loadSolides(); });

  // sub-tabs e filtros pesquisa cultura
  if ($('#tabCulturaRespostas')) $('#tabCulturaRespostas').onclick = () => switchCulturaSubTab('respostas');
  if ($('#tabCulturaAdesao')) $('#tabCulturaAdesao').onclick = () => switchCulturaSubTab('adesao');

  if ($('#culturaUnidade')) $('#culturaUnidade').onchange = (e) => { state.cultura.unidade = e.target.value; state.cultura.page = 1; loadPesquisaCultura(); };
  if ($('#culturaArea')) $('#culturaArea').onchange = (e) => { state.cultura.area = e.target.value; state.cultura.page = 1; loadPesquisaCultura(); };
  if ($('#culturaTempo')) $('#culturaTempo').onchange = (e) => { state.cultura.tempo = e.target.value; state.cultura.page = 1; loadPesquisaCultura(); };
  if ($('#culturaSearch')) $('#culturaSearch').oninput = debounce((e) => { state.cultura.search = e.target.value.trim(); state.cultura.page = 1; loadPesquisaCultura(); });

  if ($('#culturaAdesaoStatus')) $('#culturaAdesaoStatus').onchange = (e) => { state.culturaAdesao.status = e.target.value; state.culturaAdesao.page = 1; loadPesquisaCulturaAdesao(); };
  if ($('#culturaAdesaoUnidade')) $('#culturaAdesaoUnidade').onchange = (e) => { state.culturaAdesao.unidade = e.target.value; state.culturaAdesao.page = 1; loadPesquisaCulturaAdesao(); };
  if ($('#culturaAdesaoSetor')) $('#culturaAdesaoSetor').onchange = (e) => { state.culturaAdesao.setor = e.target.value; state.culturaAdesao.page = 1; loadPesquisaCulturaAdesao(); };
  if ($('#culturaAdesaoSearch')) $('#culturaAdesaoSearch').oninput = debounce((e) => { state.culturaAdesao.search = e.target.value.trim(); state.culturaAdesao.page = 1; loadPesquisaCulturaAdesao(); });

  // Check all solides
  if ($('#solidesCheckAll')) {
    $('#solidesCheckAll').onchange = (e) => {
      const checked = e.target.checked;
      $$('.solides-row-check', $('#solidesBody')).forEach((cb) => {
        cb.checked = checked;
        const cpf = cb.dataset.cpf;
        if (checked) selectedSolidesCpfs.add(cpf);
        else selectedSolidesCpfs.delete(cpf);
      });
      updateBulkBar();
    };
  }

  // Ações em lote solides
  if ($('#btnBulkAllow')) {
    $('#btnBulkAllow').onclick = async () => {
      const cpfs = [...selectedSolidesCpfs];
      if (!cpfs.length) return;
      try {
        const res = await api('/solides/bulk-permission', {
          method: 'POST',
          body: JSON.stringify({ cpfs, permitido: true }),
        }).then((r) => r.json());
        if (!res.ok) throw new Error(res.error || 'Erro');
        toast('success', `${cpfs.length} colaborador${cpfs.length > 1 ? 'es habilitados' : ' habilitado'} com sucesso!`);
        selectedSolidesCpfs.clear();
        loadSolides();
      } catch (err) {
        toast('error', 'Erro ao habilitar em lote', err.message);
      }
    };
  }

  if ($('#btnBulkDisallow')) {
    $('#btnBulkDisallow').onclick = async () => {
      const cpfs = [...selectedSolidesCpfs];
      if (!cpfs.length) return;
      try {
        const res = await api('/solides/bulk-permission', {
          method: 'POST',
          body: JSON.stringify({ cpfs, permitido: false }),
        }).then((r) => r.json());
        if (!res.ok) throw new Error(res.error || 'Erro');
        toast('success', `${cpfs.length} colaborador${cpfs.length > 1 ? 'es desabilitados' : ' desabilitado'} com sucesso!`);
        selectedSolidesCpfs.clear();
        loadSolides();
      } catch (err) {
        toast('error', 'Erro ao desabilitar em lote', err.message);
      }
    };
  }
}

/* ════════ Init ════════ */
(async function init() {
  bind();
  await loadCurrentUser();
  await loadSummary();
  $('#pageLoader').classList.add('hide');
})();

