import { regions, band, readings, validValues, stale, safeUrl, escapeHtml as e, activity } from './lib.mjs';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const state = { data: null, metric: 'psi', period: 24, region: 'all', filter: 'all', query: '', limit: 6 };
const seriesColors = { north: '#77946d', south: '#8aa7ad', east: '#c8aa6b', west: '#d78254', central: '#a482ac' };
const icons = {
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Z M9 3v16 M15 5v16"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  news: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8 M8 11h8 M8 15h3 M8 18h3"/><rect x="14" y="15" width="2" height="3"/>',
  heart: '<path d="M20 5c-3-3-7-1-8 1-1-2-5-4-8-1s-1 7 2 10l6 6 6-6c3-3 5-7 2-10Z"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5 M4 12c0 4 16 4 16 0"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5 19 19 M5 19l1.5-1.5 M17.5 6.5 19 5"/>',
  refresh: '<path d="M20 7v5h-5 M4 17v-5h5 M6.5 6.5A8 8 0 0 1 20 12 M4 12a8 8 0 0 0 13.5 5.5"/>',
  wind: '<path d="M3 8h12a3 3 0 1 0-3-3 M3 12h16a3 3 0 1 1-3 3 M3 16h5a3 3 0 1 1-3 3"/>',
  particles: '<circle cx="8" cy="8" r="3"/><circle cx="18" cy="6" r="2"/><circle cx="16" cy="17" r="4"/><circle cx="5" cy="17" r="2"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6 M12 7h.01"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  home: '<path d="m3 10 9-7 9 7 M5 9v12h14V9 M9 21v-8h6v8"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18 M5 6.5h14 M5 17.5h14"/>',
};
$$('[data-icon]').forEach(el => { el.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[el.dataset.icon] || icons.info}</svg>`; });
const fmt = (date, options = {}) => {
  const d = new Date(date);
  return Number.isFinite(+d) ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Singapore', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, ...options }).format(d) : '时间未提供';
};
$('#today').textContent = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Singapore', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
try { document.body.classList.toggle('dark', localStorage.getItem('haze-theme') === 'dark'); } catch {}
$('#theme').addEventListener('click', () => { document.body.classList.toggle('dark'); try { localStorage.setItem('haze-theme', document.body.classList.contains('dark') ? 'dark' : 'light'); } catch {} });
const dialog = $('#sources-dialog');
['#sources-button', '#footer-sources', '#map-info'].forEach(id => $(id).addEventListener('click', () => dialog.showModal()));
$('#close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', ev => { if (ev.target === dialog) { const r = dialog.getBoundingClientRect(); if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) dialog.close(); } });

function setBadge(id, value, metric) {
  const b = band(value, metric); const el = $(id);
  el.textContent = b.label; el.style.color = b.color; el.style.background = `${b.color}15`;
}
function renderSummary() {
  const d = state.data, psi = readings(d, 'psi'), pm = readings(d, 'pm25');
  const pv = validValues(psi), mv = validValues(pm);
  $('#psi-range').innerHTML = `${pv.length ? `${Math.min(...pv)}–${Math.max(...pv)}` : '—'}<span>PSI</span>`;
  $('#pm-range').innerHTML = `${mv.length ? `${Math.min(...mv)}–${Math.max(...mv)}` : '—'}<span>µg/m³</span>`;
  const max = pv.length ? Math.max(...pv) : NaN;
  setBadge('#psi-band', max, 'psi'); setBadge('#pm-band', mv.length ? Math.max(...mv) : NaN, 'pm25');
  const worst = regions.filter(r => Number.isFinite(psi[r.id])).sort((a, b) => psi[b.id] - psi[a.id])[0];
  $('#worst-region').textContent = worst?.zh || '暂无数据';
  $('#worst-value').textContent = worst ? `PSI ${psi[worst.id]} · ${band(max).label}` : '—';
  $('#worst-value').style.color = band(max).color;
  $('#updated').textContent = `最近采集 ${fmt(d.generatedAt)} SGT`;
  $('#next-update').textContent = d.nextUpdateAt ? `下次预计 ${fmt(d.nextUpdateAt, { month: undefined, day: undefined })} SGT` : '后台定时采集';
  $('#alert-title').textContent = Number.isFinite(max) ? `全岛空气质量：${band(max).label}，出行前留意最新读数` : '空气数据暂时不可用';
  $('#alert-text').textContent = pv.length ? `24 小时 PSI 为 ${Math.min(...pv)}–${max}。${activity(max, 'general')} 最新观测 ${fmt(d.psi.timestamp)} SGT。` : '请直接查看 NEA 官方最新读数。';
  const warnings = [];
  if (stale(d.psi?.timestamp) || stale(d.pm25?.timestamp)) warnings.push('空气数据已过期或暂不可用，当前显示最近一次有效观测，请查看 NEA 最新发布。');
  if (stale(d.generatedAt)) warnings.push('后台采集时间已超过 4 小时，自动更新可能延迟。');
  if (Object.entries(d.sources || {}).some(([key, value]) => ['psi', 'pm25', 'news', 'advisories', 'cna'].includes(key) && !value.ok)) warnings.push('部分内容源暂不可用，已保留此前内容和官方入口。');
  $('#data-warning').hidden = warnings.length === 0; $('#data-warning').textContent = warnings.join(' ');
  $('#source-status').innerHTML = `<strong>本次采集 ${e(fmt(d.generatedAt))} SGT</strong><br>` + ['psi', 'pm25', 'advisories', 'news', 'cna'].map(k => `${e(({ psi: '官方 PSI', pm25: '官方 PM2.5', advisories: 'NEA 公告', news: '媒体 RSS', cna: 'CNA 新闻' })[k])}：${d.sources?.[k]?.ok ? '正常' : '未更新 / 使用已保存内容'}`).join('<br>');
  renderAdvice();
}
function renderMap() {
  const values = readings(state.data, state.metric);
  $('#map-observed').textContent = `${fmt(state.data?.[state.metric]?.timestamp)} SGT`;
  $('#map-markers').innerHTML = regions.map(r => {
    const value = values[r.id], b = band(value, state.metric);
    return `<g class="marker" tabindex="0" role="button" aria-label="${r.zh} ${Number.isFinite(value) ? value : '暂无数据'}，${b.label}；查看区域趋势" data-region="${r.id}" transform="translate(${r.x} ${r.y})"><title>${r.zh}：${value ?? '—'} ${state.metric === 'psi' ? 'PSI' : 'µg/m³'} · ${b.label}</title><circle r="27" fill="${b.color}12"/><circle r="22" fill="var(--panel)" stroke="${b.color}" stroke-width="1.5"/><text text-anchor="middle" y="6" fill="${b.color}" font-size="18" font-weight="650">${Number.isFinite(value) ? value : '—'}</text><text class="region-label" text-anchor="middle" y="39" fill="#59715e" font-size="10">${r.zh} ${r.en}</text></g>`;
  }).join('');
  const limits = state.metric === 'psi' ? [[0, '0–50'], [51, '51–100'], [101, '101–200'], [201, '201–300'], [301, '>300']] : [[0, '0–55'], [56, '56–150'], [151, '151–250'], [251, '≥251']];
  $('#map-legend').innerHTML = limits.map(([value, label]) => { const b = band(value, state.metric); return `<span class="legend-item" style="--c:${b.color}"><i></i>${b.label} ${label}</span>`; }).join('');
  $('#region-list').innerHTML = regions.map(r => { const value = values[r.id], b = band(value, state.metric); return `<button class="region-cell ${state.region === r.id ? 'active' : ''}" data-region="${r.id}" aria-label="查看${r.zh}历史趋势"><span class="region-name">${r.zh}</span><b style="color:${b.color}">${Number.isFinite(value) ? value : '—'}</b><small style="color:${b.color}">${b.label}</small></button>`; }).join('');
  $$('#map-markers [data-region], #region-list [data-region]').forEach(el => {
    const select = () => { state.region = el.dataset.region; $('#region-select').value = state.region; renderMap(); renderChart(); };
    el.addEventListener('click', select); el.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select(); } });
  });
}
function renderChart() {
  const history = state.data?.history?.[state.metric] || [];
  const end = Date.parse(state.data?.[state.metric]?.timestamp) || Date.now();
  const start = end - state.period * 3600000;
  const points = history.filter(p => Date.parse(p.timestamp) >= start && Date.parse(p.timestamp) <= end);
  const selected = state.region === 'all' ? regions : regions.filter(r => r.id === state.region);
  const valueList = points.flatMap(p => selected.map(r => p.values[r.id])).filter(Number.isFinite);
  const max = Math.max(100, Math.ceil((Math.max(0, ...valueList) + 20) / 50) * 50);
  const x = t => 40 + (Date.parse(t) - start) / (end - start) * 500;
  const y = v => 215 - v / max * 185;
  $('#chart-subtitle').textContent = `过去 ${state.period} 小时 · ${state.metric === 'psi' ? '24 小时 PSI' : '1 小时 PM2.5 (µg/m³)'}`;
  $('#chart-region').textContent = state.region === 'all' ? '全岛五区' : selected[0].zh;
  $('#chart-empty').hidden = valueList.length > 0;
  let svg = '';
  for (let i = 0; i <= 4; i++) { const v = i * max / 4; svg += `<line class="grid" x1="40" x2="540" y1="${y(v)}" y2="${y(v)}"/><text x="29" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`; }
  for (let i = 0; i <= 4; i++) { const t = start + (end - start) * i / 4; svg += `<text x="${40 + i * 125}" y="242" text-anchor="${i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}">${e(fmt(t, { month: undefined, day: undefined }))}</text>`; }
  if (state.metric === 'psi' && max >= 100) svg += `<line class="threshold" x1="40" x2="540" y1="${y(100)}" y2="${y(100)}"/><text x="537" y="${y(100) - 7}" text-anchor="end" opacity=".7">PSI 100</text>`;
  for (const r of selected) {
    let path = '', lastTime = 0;
    for (const p of points) {
      const value = p.values[r.id], time = Date.parse(p.timestamp);
      if (!Number.isFinite(value)) { lastTime = 0; continue; }
      path += `${!lastTime || time - lastTime > 5400000 ? 'M' : 'L'}${x(p.timestamp).toFixed(1)} ${y(value).toFixed(1)} `;
      lastTime = time;
    }
    svg += `<path class="series" d="${path}" stroke="${seriesColors[r.id]}"/>`;
    for (const p of points) if (Number.isFinite(p.values[r.id])) svg += `<circle cx="${x(p.timestamp)}" cy="${y(p.values[r.id])}" r="3.5" fill="${seriesColors[r.id]}" opacity=".12"><title>${r.zh} · ${e(fmt(p.timestamp))} · ${p.values[r.id]} ${state.metric === 'psi' ? 'PSI' : 'µg/m³'}</title></circle>`;
  }
  $('#trend-chart').innerHTML = svg;
  $('#chart-legend').innerHTML = regions.map(r => `<button data-region="${r.id}" style="--c:${seriesColors[r.id]};opacity:${state.region === 'all' || state.region === r.id ? 1 : .45}" aria-label="查看${r.zh}趋势"><i></i>${r.zh}</button>`).join('');
  $$('#chart-legend button').forEach(el => el.addEventListener('click', () => { state.region = state.region === el.dataset.region ? 'all' : el.dataset.region; $('#region-select').value = state.region; renderMap(); renderChart(); }));
}
function renderAdvisories() {
  const items = (state.data?.advisories || []).slice(0, 4);
  $('#advisory-list').innerHTML = items.length ? items.map(item => `<article class="advisory-item"><span class="advisory-label">NEA</span><div><h3><a href="${e(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer">${e(item.title)}</a></h3><p>国家环境局 · ${e(item.publishedAt ? fmt(item.publishedAt, { hour: undefined, minute: undefined }) : '官方公告')} · 英文原文</p></div><a href="${e(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer" aria-label="打开官方公告">↗</a></article>`).join('') : '<p class="empty">最新公告暂未读取成功。请通过下方官方入口查看实时指引。</p>';
}
function renderNews() {
  const items = (state.data?.news || []).filter(n => (state.filter === 'all' || n.category === state.filter) && `${n.title} ${n.source}`.toLowerCase().includes(state.query.toLowerCase()));
  $('#news-count').textContent = items.length;
  $('#news-list').innerHTML = items.length ? items.slice(0, state.limit).map(n => `<a class="news-card" href="${e(safeUrl(n.url))}" target="_blank" rel="noopener noreferrer"><div class="news-meta"><span class="source-mark ${n.source === 'CNA' ? 'cna' : ''}">${e(n.source)}</span><span class="news-category">${n.category === 'regional' ? '区域动态' : '新加坡'}</span></div><h3>${e(n.title)}</h3><div class="news-card-foot"><span>${n.publishedAt ? e(fmt(n.publishedAt)) : '媒体未提供发布时间'} · 原文报道</span><span>↗</span></div></a>`).join('') : '<p class="empty">没有符合条件的报道，试试其他关键词或分类。</p>';
  $('#load-more').hidden = items.length <= state.limit;
}
function renderAdvice() {
  const pv = validValues(readings(state.data, 'psi'));
  $('#personal-advice').textContent = activity(pv.length ? Math.max(...pv) : NaN, $('#audience').value) + '（按五区最高 24 小时 PSI；并非次日预测。）';
}
function render() { renderSummary(); renderMap(); renderChart(); renderAdvisories(); renderNews(); }
async function load() {
  $('#refresh').disabled = true;
  try {
    // Hosted worker supplies durable snapshots. Static / GitHub Pages builds use the bundled snapshot.
    let response;
    try { response = await fetch(`./api/data?t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) }); if (!response.ok || !(response.headers.get('content-type') || '').includes('application/json')) throw new Error('Static hosting'); }
    catch { response = await fetch(`./data/latest.json?t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) }); }
    if (!response.ok) throw new Error('Data unavailable');
    const next = await response.json();
    if (next.schemaVersion !== 1) throw new Error('Invalid data format');
    state.data = next; render();
  } catch {
    $('#data-warning').hidden = false; $('#data-warning').textContent = '暂时无法连接数据源，请稍后刷新或查看 NEA 官网。';
    if (!state.data) { state.data = {}; renderMap(); renderChart(); renderAdvisories(); renderNews(); $('#updated').textContent = '数据加载失败'; }
  } finally { $('#refresh').disabled = false; }
}
$('#refresh').addEventListener('click', load);
$('#metric-switch').addEventListener('click', ev => { const button = ev.target.closest('[data-metric]'); if (!button) return; state.metric = button.dataset.metric; $$('#metric-switch button').forEach(b => { b.classList.toggle('selected', b === button); b.setAttribute('aria-pressed', b === button); }); renderMap(); renderChart(); });
$('#period-switch').addEventListener('click', ev => { const button = ev.target.closest('[data-period]'); if (!button) return; state.period = +button.dataset.period; $$('#period-switch button').forEach(b => { b.classList.toggle('selected', b === button); b.setAttribute('aria-pressed', b === button); }); renderChart(); });
$('#region-select').addEventListener('change', ev => { state.region = ev.target.value; renderMap(); renderChart(); });
$('#news-tabs').addEventListener('click', ev => { const button = ev.target.closest('[data-filter]'); if (!button) return; state.filter = button.dataset.filter; state.limit = 6; $$('#news-tabs button').forEach(b => { b.classList.toggle('selected', b === button); b.setAttribute('aria-pressed', b === button); }); renderNews(); });
$('#news-search').addEventListener('input', ev => { state.query = ev.target.value; state.limit = 6; renderNews(); });
$('#load-more').addEventListener('click', () => { state.limit += 6; renderNews(); });
$('#audience').addEventListener('change', renderAdvice);
const observer = new IntersectionObserver(entries => { for (const entry of entries) if (entry.isIntersecting) $$('nav a').forEach(a => a.classList.toggle('active', a.hash === `#${entry.target.id}`)); }, { rootMargin: '-10% 0px -65% 0px' });
$$('#overview,#distribution,#advisories,#news,#guide').forEach(el => observer.observe(el));
setInterval(() => { if (document.visibilityState === 'visible') load(); }, 15 * 60 * 1000);
load();
