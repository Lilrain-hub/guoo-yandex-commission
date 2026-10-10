'use strict';

const PAGE_SIZE = 50;
const state = { parent: 'all', kw: '', change: 'all', sort: 'default', page: 1 };
const input = document.getElementById('searchInput');
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const changeLabels = { down: ['下调', 'chg-down'], new: ['新增', 'chg-new'], up: ['上调', 'chg-up'] };
const parentCounts = new Map();
for (const row of DATA) parentCounts.set(row.p, (parentCounts.get(row.p) || 0) + 1);
const parents = [...parentCounts].sort((a, b) => b[1] - a[1]);
let searchTimer;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function tokensOf(value) { return value.trim().toLowerCase().split(/\s+/).filter(Boolean); }
function highlight(value) {
  const tokens = tokensOf(state.kw);
  if (!tokens.length) return escapeHtml(value);
  const pattern = tokens.map(token => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return String(value).split(new RegExp('(' + pattern + ')', 'gi')).map((part, i) => i % 2 ? '<mark>' + escapeHtml(part) + '</mark>' : escapeHtml(part)).join('');
}
function pct(value) {
  if (value == null) return '—';
  const n = Math.round(value * 1000) / 10;
  return n + '%';
}
function rateHtml(value, cls) {
  return '<span class="rate ' + (value == null ? 'na' : cls) + '">' + pct(value) + '</span>';
}
function formatCategory(row) {
  const change = changeLabels[row.chg];
  const context = '<div class="category-context"><span class="p-badge">' + highlight(row.p) + '</span>' + (change ? '<span class="chg ' + change[1] + '">' + change[0] + '</span>' : '') + '</div>';
  if (row.d) return context + '<div class="category-name">' + highlight(row.p) + ' · 大类默认费率<span class="default-tag">默认</span></div>';
  const path = row.c.split(' - ');
  const leaf = path.pop();
  return context + '<div class="category-name">' + highlight(leaf) + '</div>' + (path.length ? '<div class="category-path">' + path.map(highlight).join('<span class="path-sep">›</span>') + '</div>' : '');
}
function filtered() {
  const tokens = tokensOf(state.kw);
  const list = DATA.filter(row => (state.parent === 'all' || row.p === state.parent) && (state.change === 'all' || row.chg === state.change) && tokens.every(token => (row.p + ' ' + row.c).toLowerCase().includes(token)));
  if (state.sort !== 'default') list.sort((a, b) => {
    if (a.fbp == null) return b.fbp == null ? 0 : 1;
    if (b.fbp == null) return -1;
    return state.sort === 'low' ? a.fbp - b.fbp : b.fbp - a.fbp;
  });
  return list;
}
function initNav() {
  const items = [['all', DATA.length], ...parents];
  document.getElementById('catNav').innerHTML = items.map(([name, count]) => '<button type="button" class="cat-chip' + (name === 'all' ? ' active' : '') + '" data-parent="' + escapeHtml(name) + '" aria-pressed="' + (name === 'all') + '"><span>' + (name === 'all' ? '全部类目' : escapeHtml(name)) + '</span><span class="count">' + count.toLocaleString('en-US') + '</span></button>').join('');
  document.getElementById('catNav').addEventListener('click', event => {
    const button = event.target.closest('[data-parent]');
    if (!button) return;
    flushSearch();
    state.parent = button.dataset.parent;
    state.page = 1;
    render();
  });
}
function syncControls() {
  document.querySelectorAll('[data-parent]').forEach(button => {
    const active = button.dataset.parent === state.parent;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.querySelectorAll('[data-filter]').forEach(button => {
    const active = button.dataset.filter === state.change;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.getElementById('sortSelect').value = state.sort;
  document.getElementById('clearBtn').hidden = !input.value;
}
function render() {
  syncControls();
  const list = filtered();
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  state.page = Math.min(state.page, pages);
  const start = (state.page - 1) * PAGE_SIZE;
  const scope = state.parent === 'all' ? '全部类目' : state.parent;
  document.getElementById('resultHint').innerHTML = '<b>' + escapeHtml(scope) + '</b>' + (state.kw.trim() ? ' · “' + escapeHtml(state.kw.trim()) + '”' : '') + (state.change !== 'all' ? ' · ' + changeLabels[state.change][0] : '') + ' · 共 <b>' + total.toLocaleString('en-US') + '</b> 条结果';
  const tbody = document.getElementById('tbody');
  tbody.innerHTML = list.slice(start, start + PAGE_SIZE).map(row => '<tr><td class="cat-cell">' + formatCategory(row) + '</td><td class="rate-cell">' + rateHtml(row.fbp, 'fbp') + '</td><td class="rate-cell">' + rateHtml(row.fbs, 'fbs') + '</td><td class="rate-cell">' + rateHtml(row.lm, 'lm') + '</td></tr>').join('');
  if (total && !motionQuery.matches && typeof tbody.animate === 'function') tbody.animate([{ opacity: .55, transform: 'translateY(3px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 180, easing: 'ease-out' });
  document.getElementById('empty').hidden = total > 0;
  document.querySelector('.table-scroll').hidden = total === 0;
  renderPager(pages, total);
}
function renderPager(pages, total) {
  const pager = document.getElementById('pager');
  pager.hidden = pages <= 1;
  if (pages <= 1) { pager.innerHTML = ''; return; }
  const page = state.page;
  const button = (label, target, disabled, current, ariaLabel) => '<button type="button" data-page="' + target + '"' + (disabled ? ' disabled' : '') + (current ? ' class="active" aria-current="page"' : '') + ' aria-label="' + ariaLabel + '">' + label + '</button>';
  let html = button('‹', page - 1, page === 1, false, '上一页');
  const visible = [...new Set([1, ...Array.from({ length: 5 }, (_, i) => page - 2 + i).filter(n => n > 0 && n <= pages), pages])].sort((a, b) => a - b);
  visible.forEach((n, i) => {
    if (i && n - visible[i - 1] > 1) html += '<span class="ellipsis" aria-hidden="true">…</span>';
    html += button(n, n, false, n === page, '第 ' + n + ' 页');
  });
  html += button('›', page + 1, page === pages, false, '下一页');
  html += '<span class="info">第 ' + page + ' / ' + pages + ' 页 · 每页 ' + PAGE_SIZE + ' 条</span>';
  pager.innerHTML = html;
}
function scrollToResults() {
  document.getElementById('results').scrollIntoView({ behavior: motionQuery.matches ? 'instant' : 'smooth', block: 'start' });
}
function flushSearch() { clearTimeout(searchTimer); state.kw = input.value; }
function reset() {
  clearTimeout(searchTimer);
  input.value = '';
  Object.assign(state, { parent: 'all', kw: '', change: 'all', sort: 'default', page: 1 });
  render();
}
function searchKeyword(keyword) {
  clearTimeout(searchTimer);
  input.value = keyword;
  Object.assign(state, { kw: keyword, parent: 'all', change: 'all', page: 1 });
  render();
  scrollToResults();
}
input.addEventListener('input', () => {
  clearTimeout(searchTimer);
  document.getElementById('clearBtn').hidden = !input.value;
  searchTimer = setTimeout(() => { state.kw = input.value; state.page = 1; render(); }, 180);
});
document.getElementById('searchForm').addEventListener('submit', event => { event.preventDefault(); flushSearch(); state.page = 1; render(); scrollToResults(); });
document.getElementById('clearBtn').addEventListener('click', () => { clearTimeout(searchTimer); input.value = ''; state.kw = ''; state.page = 1; render(); input.focus(); });
document.getElementById('resetBtn').addEventListener('click', reset);
document.getElementById('emptyReset').addEventListener('click', reset);
document.getElementById('changeFilters').addEventListener('click', event => {
  const button = event.target.closest('[data-filter]');
  if (!button) return;
  flushSearch(); state.change = button.dataset.filter; state.page = 1; render();
});
document.querySelectorAll('[data-change]').forEach(button => button.addEventListener('click', () => {
  clearTimeout(searchTimer); input.value = '';
  Object.assign(state, { kw: '', parent: 'all', change: button.dataset.change, page: 1 });
  render(); scrollToResults();
}));
document.querySelectorAll('[data-keyword]').forEach(button => button.addEventListener('click', () => searchKeyword(button.dataset.keyword)));
document.getElementById('sortSelect').addEventListener('change', event => { flushSearch(); state.sort = event.target.value; state.page = 1; render(); });
document.getElementById('pager').addEventListener('click', event => {
  const button = event.target.closest('button[data-page]');
  if (!button || button.disabled) return;
  state.page = Number(button.dataset.page); render();
  const current = document.querySelector('#pager [aria-current="page"]');
  if (current) current.focus({ preventScroll: true });
  scrollToResults();
});
document.addEventListener('keydown', event => {
  const editing = event.target.matches('input,textarea,select,[contenteditable="true"]');
  if (event.key === '/' && !editing && !event.ctrlKey && !event.metaKey && !document.getElementById('consultDialog').open) { event.preventDefault(); input.focus(); }
  if (event.key === 'Escape' && event.target === input) { clearTimeout(searchTimer); input.value = ''; state.kw = ''; state.page = 1; render(); }
});
const dialog = document.getElementById('consultDialog');
document.querySelectorAll('[data-consult]').forEach(button => button.addEventListener('click', () => dialog.showModal()));
document.getElementById('closeDialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { const r = dialog.getBoundingClientRect(); if (event.target === dialog && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)) dialog.close(); });
const backTop = document.getElementById('backTop');
window.addEventListener('scroll', () => { backTop.hidden = window.scrollY < 650; }, { passive: true });
backTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: motionQuery.matches ? 'instant' : 'smooth' }));
initNav();
render();

document.querySelectorAll('[data-kw]').forEach(button => button.addEventListener('click', () => searchKeyword(button.dataset.kw)));
