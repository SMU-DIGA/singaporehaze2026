import { regions, band, readings, history, validValues, stale, safeUrl, escapeHtml as e, activity } from './lib.mjs';
import { getLanguage, setLanguage, localize, locale, t } from './locale.mjs';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const state = { data: null, metric: 'psi', period: 24, region: 'all', filter: 'all', query: '', limit: 6 };
const seriesColors = { north: '#4f7a45', south: '#4f8a96', east: '#b58b2d', west: '#c9652f', central: '#8a5a96' };
// The server cron job commits fresh snapshots here every hour. Reading it directly
// means the static site shows new data even before GitHub Pages finishes redeploying.
const REPO_DATA = 'https://raw.githubusercontent.com/SMU-DIGA/singaporehaze2026/main/public/data/latest.json';
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
  gauge: '<path d="M4 18a8 8 0 1 1 16 0"/><path d="m12 18 4-6"/><circle cx="12" cy="18" r="1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6 M12 7h.01"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  home: '<path d="m3 10 9-7 9 7 M5 9v12h14V9 M9 21v-8h6v8"/>',
  forecast: '<path d="M3 17l5-5 4 3 8-8"/><path d="M15 7h5v5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18 M5 6.5h14 M5 17.5h14"/>',
};
$$('[data-icon]').forEach(el => { el.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[el.dataset.icon] || icons.info}</svg>`; });

const en = () => getLanguage() === 'en';
const regionName = r => (en() ? r.en : r.zh);
const bandOf = (value, metric = 'psi') => band(value, metric, getLanguage());
const unit = metric => ({ psi: 'PSI', pm25: 'µg/m³', aqi: 'AQI' })[metric];
// AQI is derived from the PM2.5 readings, so it shares their observation time.
const observedAt = metric => state.data?.[metric === 'aqi' ? 'pm25' : metric]?.timestamp;
const metricName = metric => t({ psi: 'metricPsi', pm25: 'metricPm', aqi: 'metricAqi' }[metric]);
const fmt = (date, options = {}) => {
  const d = new Date(date);
  return Number.isFinite(+d) ? new Intl.DateTimeFormat(locale(), { timeZone: 'Asia/Singapore', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, ...options }).format(d) : t('timeUnknown');
};
const clock = date => fmt(date, { month: undefined, day: undefined });
const sgt = text => `${text} SGT`;

function renderStatic() {
  localize();
  $('#today').textContent = new Intl.DateTimeFormat(locale(), { timeZone: 'Asia/Singapore', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
  for (const option of $$('#region-select option')) { const r = regions.find(x => x.id === option.value); if (r) option.textContent = regionName(r); }
}
$('.language-switch').addEventListener('click', ev => {
  const b = ev.target.closest('[data-language]'); if (!b) return;
  setLanguage(b.dataset.language); renderStatic(); if (state.data) render();
});

try { document.body.classList.toggle('dark', localStorage.getItem('haze-theme') === 'dark'); } catch {}
$('#theme').addEventListener('click', () => { document.body.classList.toggle('dark'); try { localStorage.setItem('haze-theme', document.body.classList.contains('dark') ? 'dark' : 'light'); } catch {} });
const dialog = $('#sources-dialog');
['#sources-button', '#footer-sources', '#map-info'].forEach(id => $(id).addEventListener('click', () => dialog.showModal()));
$('#close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', ev => { if (ev.target === dialog) { const r = dialog.getBoundingClientRect(); if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) dialog.close(); } });

function setBadge(id, value, metric) {
  const b = bandOf(value, metric), el = $(id);
  el.removeAttribute('data-i18n');
  el.textContent = b.label; el.style.color = b.color; el.style.background = `${b.color}1a`;
}
function renderSummary() {
  const d = state.data, psi = readings(d, 'psi'), pm = readings(d, 'pm25');
  const pv = validValues(psi), mv = validValues(pm), av = validValues(readings(d, 'aqi'));
  const range = values => (values.length ? (Math.min(...values) === Math.max(...values) ? `${values[0]}` : `${Math.min(...values)}–${Math.max(...values)}`) : '—');
  $('#psi-range').innerHTML = `${range(pv)}<span class="unit">PSI</span>`;
  $('#pm-range').innerHTML = `${range(mv)}<span class="unit">µg/m³</span>`;
  const max = pv.length ? Math.max(...pv) : NaN;
  $('#aqi-range').innerHTML = `${range(av)}<span class="unit">AQI</span>`;
  setBadge('#psi-band', max, 'psi'); setBadge('#pm-band', mv.length ? Math.max(...mv) : NaN, 'pm25'); setBadge('#aqi-band', av.length ? Math.max(...av) : NaN, 'aqi');
  const worst = regions.filter(r => Number.isFinite(psi[r.id])).sort((a, b) => psi[b.id] - psi[a.id])[0];
  $('#worst-region').textContent = worst ? regionName(worst) : t('noData');
  $('#worst-value').textContent = worst ? `PSI ${psi[worst.id]}` : '—';
  $('#worst-value').style.color = bandOf(max).color; $('#worst-value').style.background = `${bandOf(max).color}1a`;

  $('#updated').removeAttribute('data-i18n');
  $('#updated').textContent = t('collected', { time: sgt(fmt(d.generatedAt)) });
  const next = d.nextUpdateAt ? t('nextUpdate', { time: sgt(clock(d.nextUpdateAt)) }) : t('nextUpdateUnknown');
  $('#next-update').textContent = next;
  $('#sidebar-next').textContent = d.nextUpdateAt ? t('sidebarNext', { time: sgt(clock(d.nextUpdateAt)) }) : t('nextUpdateUnknown');

  $('#alert-title').removeAttribute('data-i18n'); $('#alert-text').removeAttribute('data-i18n');
  $('#alert').style.setProperty('--alert', bandOf(max).color);
  $('#alert-title').textContent = Number.isFinite(max) ? t('alertTitle', { band: bandOf(max).label }) : t('alertNoData');
  $('#alert-text').textContent = pv.length ? t('alertText', { range: range(pv), advice: activity(max, 'general', getLanguage()), time: sgt(fmt(d.psi.timestamp)) }) : t('alertNoDataText');

  const warnings = [];
  if (stale(d.psi?.timestamp) || stale(d.pm25?.timestamp)) warnings.push(t('warnStale'));
  else if (stale(d.generatedAt)) warnings.push(t('warnCollect'));
  if (Object.entries(d.sources || {}).some(([key, value]) => ['psi', 'pm25', 'news', 'advisories', 'cna'].includes(key) && !value.ok)) warnings.push(t('warnSources'));
  $('#data-warning').hidden = warnings.length === 0; $('#data-warning').textContent = warnings.join(' ');

  const labels = { psi: 'srcPsi', pm25: 'srcPm', advisories: 'srcAdv', news: 'srcNews', cna: 'srcCna', forecast_nea: 'srcFcNea', forecast_model: 'srcFcModel', forecast_weather: 'srcFcWeather' };
  $('#source-status').innerHTML = `<strong>${e(t('statusHead', { time: sgt(fmt(d.generatedAt)) }))}</strong><ul>` + Object.entries(labels).map(([k, label]) => `<li><span>${e(t(label))}</span><span class="${d.sources?.[k]?.ok ? 'ok' : 'fail'}">${e(t(d.sources?.[k]?.ok ? 'statusOk' : 'statusFail'))}</span></li>`).join('') + '</ul>';
  renderAdvice();
}
function renderMap() {
  const values = readings(state.data, state.metric);
  const observed = observedAt(state.metric);
  $('#map-observed').textContent = observed ? t('mapObserved', { time: sgt(fmt(observed)) }) : 'NEA';
  $('#map-markers').innerHTML = regions.map(r => {
    const value = values[r.id], b = bandOf(value, state.metric), shown = Number.isFinite(value) ? value : '—';
    return `<g class="marker${state.region === r.id ? ' active' : ''}" tabindex="0" role="button" aria-label="${e(t('regionAria', { region: regionName(r), value: shown, band: b.label }))}" data-region="${r.id}" transform="translate(${r.x} ${r.y})"><title>${e(regionName(r))}: ${shown} ${unit(state.metric)} · ${e(b.label)}</title><circle r="31" fill="${b.color}1f"/><circle r="25" fill="var(--panel)" stroke="${b.color}" stroke-width="2.5"/><text text-anchor="middle" y="7" fill="${b.color}" font-size="20" font-weight="700">${shown}</text><text class="region-label" text-anchor="middle" y="46" font-size="14" font-weight="600">${e(regionName(r))}</text></g>`;
  }).join('');
  const limits = {
    psi: [[0, '0–50'], [51, '51–100'], [101, '101–200'], [201, '201–300'], [301, '>300']],
    pm25: [[0, '0–55'], [56, '56–150'], [151, '151–250'], [251, '≥251']],
    aqi: [[0, '0–50'], [51, '51–100'], [101, '101–150'], [151, '151–200'], [201, '201–300'], [301, '>300']],
  }[state.metric];
  $('#map-legend').innerHTML = limits.map(([value, label]) => { const b = bandOf(value, state.metric); return `<span class="legend-item" style="--c:${b.color}"><i></i>${e(b.label)} <span class="legend-range">${label}</span></span>`; }).join('');
  $('#region-list').innerHTML = regions.map(r => { const value = values[r.id], b = bandOf(value, state.metric); return `<button class="region-cell ${state.region === r.id ? 'active' : ''}" data-region="${r.id}" aria-pressed="${state.region === r.id}"><span class="region-name">${e(regionName(r))}</span><b style="color:${b.color}">${Number.isFinite(value) ? value : '—'}</b><small style="color:${b.color}">${e(b.label)}</small></button>`; }).join('');
  $$('#map-markers [data-region], #region-list [data-region]').forEach(el => {
    const select = () => { state.region = state.region === el.dataset.region ? 'all' : el.dataset.region; $('#region-select').value = state.region; renderMap(); renderChart(); };
    el.addEventListener('click', select); el.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select(); } });
  });
}
function renderChart() {
  const series = history(state.data, state.metric);
  const end = Date.parse(observedAt(state.metric)) || Date.now();
  const start = end - state.period * 3600000;
  const points = series.filter(p => Date.parse(p.timestamp) >= start && Date.parse(p.timestamp) <= end);
  const selected = state.region === 'all' ? regions : regions.filter(r => r.id === state.region);
  const valueList = points.flatMap(p => selected.map(r => p.values[r.id])).filter(Number.isFinite);
  // Round the axis to a readable step (e.g. 0/50/100/150… rather than 0/63/125/188…).
  const top = Math.max(100, Math.max(0, ...valueList) * 1.1);
  const step = [10, 20, 25, 50, 100, 200].find(s => top / s <= 6) || 500;
  const max = Math.ceil(top / step) * step, ticks = max / step;
  const x = time => 44 + (Date.parse(time) - start) / (end - start) * 496;
  const y = v => 215 - v / max * 185;
  const week = state.period === 168;
  $('#chart-subtitle').textContent = t(week ? 'trendSubWeek' : 'trendSub', { hours: state.period, metric: metricName(state.metric) });
  $('#chart-region').removeAttribute('data-i18n');
  $('#chart-region').textContent = state.region === 'all' ? t('allRegions') : regionName(selected[0]);
  $('#chart-empty').hidden = valueList.length > 0;
  let svg = '';
  for (let i = 0; i <= ticks; i++) { const v = i * step; svg += `<line class="grid" x1="44" x2="540" y1="${y(v)}" y2="${y(v)}"/><text x="34" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`; }
  // Weekly view labels each day; shorter views label clock times.
  const labels = week ? 7 : 4;
  for (let i = 0; i <= labels; i++) { const time = start + (end - start) * i / labels; svg += `<text x="${44 + i * 496 / labels}" y="244" text-anchor="${i === 0 ? 'start' : i === labels ? 'end' : 'middle'}">${e(week ? fmt(time, { month: 'numeric', day: 'numeric', hour: undefined, minute: undefined }) : clock(time))}</text>`; }
  if (state.metric !== 'pm25' && max >= 100) svg += `<line class="threshold" x1="44" x2="540" y1="${y(100)}" y2="${y(100)}"/><text class="threshold-label" x="537" y="${y(100) - 7}" text-anchor="end">${unit(state.metric)} 100</text>`;
  for (const r of selected) {
    let path = '', lastTime = 0;
    for (const p of points) {
      const value = p.values[r.id], time = Date.parse(p.timestamp);
      if (!Number.isFinite(value)) { lastTime = 0; continue; }
      path += `${!lastTime || time - lastTime > 5400000 ? 'M' : 'L'}${x(p.timestamp).toFixed(1)} ${y(value).toFixed(1)} `;
      lastTime = time;
    }
    svg += `<path class="series" d="${path}" stroke="${seriesColors[r.id]}"/>`;
    for (const p of points) if (Number.isFinite(p.values[r.id])) svg += `<circle cx="${x(p.timestamp)}" cy="${y(p.values[r.id])}" r="5" fill="${seriesColors[r.id]}" opacity="0"><title>${e(regionName(r))} · ${e(fmt(p.timestamp))} · ${p.values[r.id]} ${unit(state.metric)}</title></circle>`;
  }
  $('#trend-chart').innerHTML = svg;
  $('#chart-legend').innerHTML = regions.map(r => `<button data-region="${r.id}" style="--c:${seriesColors[r.id]}" class="${state.region === 'all' || state.region === r.id ? '' : 'dim'}" aria-pressed="${state.region === r.id}"><i></i>${e(regionName(r))}</button>`).join('');
  $$('#chart-legend button').forEach(el => el.addEventListener('click', () => { state.region = state.region === el.dataset.region ? 'all' : el.dataset.region; $('#region-select').value = state.region; renderMap(); renderChart(); }));
}
function renderAdvisories() {
  const all = state.data?.advisories || [];
  const policy = all.find(a => a.url.includes('/news/index/'));
  const items = policy ? [...all.filter(a => a !== policy).slice(0, 3), policy] : all.slice(0, 4);
  $('#advisory-list').innerHTML = items.length ? items.map(item => `<article class="advisory-item"><span class="advisory-label">NEA</span><div><h3 lang="en"><a href="${e(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer">${e(item.title)}</a></h3><p>${e(t('advMeta', { date: item.publishedAt ? fmt(item.publishedAt, { hour: undefined, minute: undefined, year: 'numeric' }) : t('advNoDate') }))}</p></div><a href="${e(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer" aria-label="${e(t('advOpen'))}">↗</a></article>`).join('') : `<p class="empty">${e(t('advEmpty'))}</p>`;
}
function renderNews() {
  const items = (state.data?.news || []).filter(n => (state.filter === 'all' || n.category === state.filter) && `${n.title} ${n.source}`.toLowerCase().includes(state.query.toLowerCase()));
  $('#news-count').textContent = items.length;
  $('#news-list').innerHTML = items.length ? items.slice(0, state.limit).map(n => `<a class="news-card" href="${e(safeUrl(n.url))}" target="_blank" rel="noopener noreferrer"><div class="news-meta"><span class="source-mark ${n.source === 'CNA' ? 'cna' : ''}">${e(n.source)}</span><span class="news-category">${e(t(n.category === 'regional' ? 'newsRegional' : 'newsSg'))}</span></div><h3 lang="en">${e(n.title)}</h3><div class="news-card-foot"><span>${e(n.publishedAt ? fmt(n.publishedAt) : t('newsNoTime'))}</span><span aria-hidden="true">↗</span></div></a>`).join('') : `<p class="empty">${e(t('newsEmpty'))}</p>`;
  $('#load-more').hidden = items.length <= state.limit;
}
function renderAdvice() {
  const pv = validValues(readings(state.data, 'psi'));
  const max = pv.length ? Math.max(...pv) : NaN;
  $('#personal-advice').textContent = activity(max, $('#audience').value, getLanguage());
  $('#personal-advice').style.setProperty('--c', bandOf(max).color);
  $('#advice-note').textContent = Number.isFinite(max) ? t('adviceNote', { value: `PSI ${max}` }) : '';
}
function renderForecast() {
  const f = state.data?.forecast;
  $('#forecast').hidden = !f?.psi;
  if (!f?.psi) return;
  const { low, high } = f.psi, top = bandOf(high), bottom = bandOf(low);
  const day = fmt(`${f.targetDate}T12:00:00+08:00`, { weekday: 'short', hour: undefined, minute: undefined });
  $('#fc-sub').textContent = t('fcSub', { date: day, time: sgt(clock(f.issuedAt)) });
  const level = { high: 'fcHigh', medium: 'fcMedium', low: 'fcLow' }[f.confidence] || 'fcLow';
  $('#fc-confidence').textContent = t('fcConfidence', { level: t(level) });
  $('#fc-confidence').dataset.level = f.confidence;
  $('#fc-range').innerHTML = `${low === high ? low : `${low}–${high}`}<span class="unit">PSI</span>`;
  $('#fc-band').textContent = bottom.index === top.index ? top.label : `${bottom.label} – ${top.label}`;
  $('#fc-band').style.color = top.color; $('#fc-band').style.background = `${top.color}1a`;
  $('#fc-advice').textContent = t('fcAdvice', { advice: activity(high, 'general', getLanguage()) });
  $('#fc-regions').innerHTML = regions.filter(r => Number.isFinite(f.regions?.[r.id])).map(r => { const b = bandOf(f.regions[r.id]); return `<div><span>${e(regionName(r))}</span><b style="color:${b.color}">${f.regions[r.id]}</b></div>`; }).join('');
  const signed = n => (n > 0 ? `+${n}` : `${n}`);
  const range = x => `PSI ${x.low === x.high ? x.low : `${x.low}–${x.high}`}`;
  const w = f.weather;
  const signals = [
    f.official
      ? [t('fcOfficial'), t('fcOfficialValue', { text: f.official.text, low: f.official.low, high: f.official.high }), t('fcOfficialNote', { time: sgt(fmt(f.official.publishedAt)) }), 'official']
      : [t('fcOfficial'), t('fcOfficialPending'), t('fcOfficialPendingNote'), 'pending'],
    f.model ? [t('fcModel'), range(f.model), t('fcModelNote', { pm: f.model.pm25, bias: f.model.bias })] : [t('fcModel'), t('fcModelMissing'), '', 'pending'],
    f.trend && [t('fcTrend'), range(f.trend), t('fcTrendNote', { change: signed(f.trend.change24h) })],
    w ? [t('fcWeather'), t('fcWeatherValue', { dir: w.windDirection, speed: w.windSpeed ? `${w.windSpeed.low}–${w.windSpeed.high}` : '—' }), [w.text && `${w.text.replace(/[.。]?$/, '.')}`, t(w.southerly ? 'fcWeatherSouth' : 'fcWeatherNorth'), w.rain ? t('fcWeatherRain') : ''].filter(Boolean).join(' ')] : [t('fcWeather'), t('fcWeatherMissing'), '', 'pending'],
  ].filter(Boolean);
  $('#fc-signals').innerHTML = signals.map(([label, value, note, kind]) => `<li class="${kind || ''}"><span class="signal-label">${e(label)}</span><b>${e(value)}</b>${note ? `<small>${e(note)}</small>` : ''}</li>`).join('');
  $('#fc-outlook').hidden = !f.official?.outlook;
  if (f.official?.outlook) { $('#fc-outlook-text').textContent = f.official.outlook; $('#fc-outlook-link').href = safeUrl(f.official.url); }
  const scored = (state.data.forecastLog || []).filter(x => typeof x.hit === 'boolean').slice(-7);
  $('#fc-record').textContent = scored.length ? t('fcRecord', { n: scored.length, hits: scored.filter(x => x.hit).length }) : t('fcRecordNone');
}
function render() { renderSummary(); renderForecast(); renderMap(); renderChart(); renderAdvisories(); renderNews(); }

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!response.ok || !(response.headers.get('content-type') || '').match(/json|text\/plain/)) throw new Error('Unavailable');
  const data = await response.json();
  if (data.schemaVersion !== 1) throw new Error('Invalid data format');
  return data;
}
async function fetchLatest() {
  const staticHost = location.hostname.endsWith('github.io') || ['localhost', '127.0.0.1', ''].includes(location.hostname);
  // Hosted worker supplies durable snapshots from its own scheduled refresh.
  if (!staticHost) { try { return await fetchJson(`./api/data?t=${Date.now()}`); } catch {} }
  const local = new URL('./data/latest.json', import.meta.url); local.searchParams.set('t', Date.now());
  const candidates = (await Promise.allSettled([fetchJson(local), fetchJson(`${REPO_DATA}?t=${Date.now()}`)])).filter(r => r.status === 'fulfilled').map(r => r.value);
  if (!candidates.length) throw new Error('Data unavailable');
  return candidates.sort((a, b) => (Date.parse(b.generatedAt) || 0) - (Date.parse(a.generatedAt) || 0))[0];
}
async function load() {
  $('#refresh').disabled = true;
  try {
    state.data = await fetchLatest(); render();
  } catch {
    $('#data-warning').hidden = false; $('#data-warning').textContent = t('warnOffline');
    if (!state.data) { state.data = {}; renderMap(); renderChart(); renderAdvisories(); renderNews(); $('#updated').removeAttribute('data-i18n'); $('#updated').textContent = t('loadFailed'); }
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
$$('#overview,#forecast,#distribution,#advisories,#news,#guide').forEach(el => observer.observe(el));
// New snapshots land every hour; check every 15 minutes while the tab is visible, and on return.
setInterval(() => { if (document.visibilityState === 'visible') load(); }, 15 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.data?.nextUpdateAt && Date.now() > Date.parse(state.data.nextUpdateAt)) load(); });
renderStatic();
load();
