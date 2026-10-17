import { regions, band, readings, history, validValues, stale, safeUrl, escapeHtml as e, activity, nearestRegion, nearest, postalCode, inSingapore, SG_BOUNDS, flightTime, flightLinks, pm25Band, bestWindow, cadrNeeded, cleaningTime, suitablePurifiers, indoorPm, CFM_TO_M3H } from './lib.mjs';
import { getLanguage, setLanguage, localize, locale, t, list } from './locale.mjs';
import { rules, TIERS, tierOf, checked as rulesChecked } from './rules.mjs';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const state = { data: null, metric: 'psi', period: 24, region: 'all', filter: 'all', query: '', limit: 6, place: null, resources: null, escape: null, history: null, purAll: false, hoursRegion: null, layers: { readings: true, masks: true, ccs: false, polyclinics: false } };
const seriesColors = { north: '#4f7a45', south: '#4f8a96', east: '#b58b2d', west: '#c9652f', central: '#8a5a96' };
// The server cron job commits fresh snapshots here every hour. Reading it directly
// means the static site shows new data even before GitHub Pages finishes redeploying.
const REPO_DATA = 'https://raw.githubusercontent.com/SMU-DIGA/singaporehaze2026/main/public/data/';
const icons = {
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Z M9 3v16 M15 5v16"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  news: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8 M8 11h8 M8 15h3 M8 18h3"/><rect x="14" y="15" width="2" height="3"/>',
  heart: '<path d="M20 5c-3-3-7-1-8 1-1-2-5-4-8-1s-1 7 2 10l6 6 6-6c3-3 5-7 2-10Z"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5 M4 12c0 4 16 4 16 0"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5 19 19 M5 19l1.5-1.5 M17.5 6.5 19 5"/>',
  refresh: '<path d="M20 7v5h-5 M4 17v-5h5 M6.5 6.5A8 8 0 0 1 20 12 M4 12a8 8 0 0 0 13.5 5.5"/>',
  wind: '<path d="M3 8h12a3 3 0 1 0-3-3 M3 12h16a3 3 0 1 1-3 3 M3 16h5a3 3 0 1 1-3 3"/>',
  particles: '<circle cx="8" cy="8" r="3"/><circle cx="18" cy="6" r="2"/><circle cx="16" cy="17" r="4"/><circle cx="5" cy="17" r="2"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  gauge: '<path d="M4 18a8 8 0 1 1 16 0"/><path d="m12 18 4-6"/><circle cx="12" cy="18" r="1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6 M12 7h.01"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  home: '<path d="m3 10 9-7 9 7 M5 9v12h14V9 M9 21v-8h6v8"/>',
  forecast: '<path d="M3 17l5-5 4 3 8-8"/><path d="M15 7h5v5"/>',
  mask: '<path d="M4 9c3-1.3 5.3-2 8-2s5 .7 8 2v3.5c0 3-3.8 5.5-8 5.5s-8-2.5-8-5.5Z"/><path d="M4 10.5H2.5 M20 10.5h1.5 M8.5 11h7 M8.5 14h7"/>',
  fit: '<path d="M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5"/>',
  plane: '<path d="M10.5 13.5 4 11l1.5-1.5 7 .5 4.5-4.5c1-1 2.5-1.2 3-.7s.3 2-.7 3L14.8 12.3l.5 7L13.8 21l-2.5-6.5-3.3 3.3.3 2.2-1.3 1.3-1.3-3.5L2.2 16.5l1.3-1.3 2.2.3Z"/>',
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
  syncTheme();
  $('#today').textContent = new Intl.DateTimeFormat(locale(), { timeZone: 'Asia/Singapore', year: 'numeric', month: en() ? 'short' : 'long', day: 'numeric', weekday: 'short' }).format(new Date());
  for (const option of $$('#region-select option')) { const r = regions.find(x => x.id === option.value); if (r) option.textContent = regionName(r); }
}
$('.language-switch').addEventListener('click', ev => {
  const b = ev.target.closest('[data-language]'); if (!b) return;
  setLanguage(b.dataset.language); renderStatic(); if (state.data) render();
  if (state.resources) renderResources(); // popups are built in the current language
  renderPurifier();
});

// Theme button shows where a click goes: a moon in light mode, a sun in dark mode.
function syncTheme() {
  const dark = document.body.classList.contains('dark'), label = t(dark ? 'themeToLight' : 'themeToDark');
  $('#theme').innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[dark ? 'sun' : 'moon']}</svg>`;
  $('#theme').setAttribute('aria-label', label); $('#theme').title = label;
}
try { document.body.classList.toggle('dark', localStorage.getItem('haze-theme') === 'dark'); } catch {}
$('#theme').addEventListener('click', () => {
  document.body.classList.toggle('dark'); syncTheme(); live.tiles?.setUrl(tileUrl());
  try { localStorage.setItem('haze-theme', document.body.classList.contains('dark') ? 'dark' : 'light'); } catch {}
});
const dialog = $('#sources-dialog');
['#sources-button', '#footer-sources', '#map-info'].forEach(id => $(id).addEventListener('click', () => dialog.showModal()));
$('#close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', ev => { if (ev.target === dialog) { const r = dialog.getBoundingClientRect(); if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) dialog.close(); } });

// Live map: OneMap tiles via Leaflet. If Leaflet fails to load, the schematic SVG stays in place.
const ONEMAP_ATTRIBUTION = '<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" alt="" style="height:20px;width:20px;vertical-align:middle">&nbsp;<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a>&nbsp;&copy;&nbsp;contributors&nbsp;&#124;&nbsp;<a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>';
const tileUrl = () => `https://www.onemap.gov.sg/maps/tiles/${document.body.classList.contains('dark') ? 'Night' : 'Default'}/{z}/{x}/{y}.png`;
const live = { map: null, tiles: null, markers: {}, readings: null, reset: null, you: null, layers: {} };
const MAIN_ISLAND = [[1.23, 103.62], [1.47, 104.01]];
function initMap() {
  const L = window.L;
  if (live.map || !L) return;
  $('.map-wrap').classList.add('live'); // Show the container first so Leaflet can measure it.
  // One-finger drags scroll the page on phones; pinch still zooms.
  live.map = L.map('live-map', { maxBounds: L.latLngBounds(SG_BOUNDS).pad(0.2), minZoom: 10, maxZoom: 18, zoomSnap: 0.25, zoomControl: false, scrollWheelZoom: false, dragging: !L.Browser.mobile }).fitBounds(MAIN_ISLAND);
  L.control.zoom({ position: 'topright' }).addTo(live.map);
  // "Fit" control: back to the whole-island view the map opened with.
  const Reset = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const bar = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
      live.reset = L.DomUtil.create('a', 'map-reset', bar);
      live.reset.href = '#'; live.reset.setAttribute('role', 'button');
      live.reset.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons.fit}</svg>`;
      L.DomEvent.disableClickPropagation(bar);
      L.DomEvent.on(live.reset, 'click', ev => { L.DomEvent.preventDefault(ev); live.map.closePopup(); live.map.fitBounds(MAIN_ISLAND, { animate: true }); });
      return bar;
    },
  });
  new Reset().addTo(live.map);
  live.map.attributionControl.setPrefix(false);
  live.tiles = L.tileLayer(tileUrl(), { minZoom: 10, maxZoom: 18, detectRetina: true, attribution: ONEMAP_ATTRIBUTION }).addTo(live.map);
  live.readings = L.layerGroup();
  if (state.layers.readings) live.readings.addTo(live.map);
  $('#map-layers').hidden = false;
}
function renderLiveMap(values) {
  const L = window.L;
  if (!live.map) return;
  live.reset.title = t('mapReset'); live.reset.setAttribute('aria-label', t('mapReset'));
  for (const r of regions) {
    const value = values[r.id], b = bandOf(value, state.metric), shown = Number.isFinite(value) ? value : '—';
    const label = t('regionAria', { region: regionName(r), value: shown, band: b.label });
    const icon = L.divIcon({ className: 'live-pin', iconSize: [64, 78], iconAnchor: [32, 26], html: `<div class="pin${state.region === r.id ? ' active' : ''}" style="--c:${b.color}"><b>${shown}</b><span>${e(regionName(r))}</span></div>` });
    if (!live.markers[r.id]) live.markers[r.id] = L.marker([r.lat, r.lon], { icon, keyboard: true, riseOnHover: true }).addTo(live.readings).on('click', () => selectRegion(r.id));
    else live.markers[r.id].setIcon(icon);
    const el = live.markers[r.id].getElement();
    if (el) { el.title = label; el.setAttribute('aria-label', label); }
  }
}
function selectRegion(id, toggle = true) {
  state.region = toggle && state.region === id ? 'all' : id;
  $('#region-select').value = state.region; renderMap(); renderChart();
}

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

  const labels = { psi: 'srcPsi', pm25: 'srcPm', advisories: 'srcAdv', news: 'srcNews', cna: 'srcCna', forecast_nea: 'srcFcNea', forecast_model: 'srcFcModel', forecast_weather: 'srcFcWeather', forecast_asmc: 'srcFcAsmc' };
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
  renderLiveMap(values);
  if (live.map) renderLegends();
  $('#map-legend').innerHTML = limits.map(([value, label]) => { const b = bandOf(value, state.metric); return `<span class="legend-item" style="--c:${b.color}"><i></i>${e(b.label)} <span class="legend-range">${label}</span></span>`; }).join('');
  $('#region-list').innerHTML = regions.map(r => { const value = values[r.id], b = bandOf(value, state.metric); return `<button class="region-cell ${state.region === r.id ? 'active' : ''}" data-region="${r.id}" aria-pressed="${state.region === r.id}"><span class="region-name">${e(regionName(r))}</span><b style="color:${b.color}">${Number.isFinite(value) ? value : '—'}</b><small style="color:${b.color}">${e(b.label)}</small></button>`; }).join('');
  $$('#map-markers [data-region], #region-list [data-region]').forEach(el => {
    const select = () => selectRegion(el.dataset.region);
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
  $('#fc-sub').textContent = t('fcSub', { time: sgt(clock(f.issuedAt)) });
  $('#fc-day').textContent = t('fcTomorrow', { date: day });
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
      ? [t('fcOfficial'), /^\d/.test(f.official.text) ? f.official.text : t('fcOfficialValue', { text: f.official.text, low: f.official.low, high: f.official.high }), t('fcOfficialNote', { time: sgt(fmt(f.official.publishedAt)) }), 'official']
      : [t('fcOfficial'), t('fcOfficialPending'), t('fcOfficialPendingNote'), 'pending'],
    f.model ? [t('fcModel'), range(f.model), t('fcModelNote', { pm: f.model.pm25, bias: f.model.bias })] : [t('fcModel'), t('fcModelMissing'), '', 'pending'],
    f.trend && [t('fcTrend'), range(f.trend), t('fcTrendNote', { change: signed(f.trend.change24h) })],
    w ? [t('fcWeather'), t('fcWeatherValue', { dir: w.windDirection, speed: w.windSpeed ? `${w.windSpeed.low}–${w.windSpeed.high}` : '—' }), [w.text && `${w.text.replace(/[.。]?$/, '.')}`, t(w.southerly ? 'fcWeatherSouth' : 'fcWeatherNorth'), w.rain ? t('fcWeatherRain') : ''].filter(Boolean).join(' ')] : [t('fcWeather'), t('fcWeatherMissing'), '', 'pending'],
  ].filter(Boolean);
  $('#fc-signals').innerHTML = signals.map(([label, value, note, kind]) => `<li class="${kind || ''}"><span class="signal-label">${e(label)}</span><b>${e(value)}</b>${note ? `<small>${e(note)}</small>` : ''}</li>`).join('');
  $('#fc-outlook').hidden = !f.official?.outlook;
  if (f.official?.outlook) { $('#fc-outlook-text').textContent = f.official.outlook; $('#fc-outlook-link').href = safeUrl(f.official.url); }
  renderLongRange(f);
  const scored = (state.data.forecastLog || []).filter(x => typeof x.hit === 'boolean').slice(-7);
  $('#fc-record').textContent = scored.length ? t('fcRecord', { n: scored.length, hits: scored.filter(x => x.hit).length }) : t('fcRecordNone');
}
// The next few days and ASMC's fortnightly and seasonal outlooks: when might it get better?
function renderLongRange(f) {
  const long = f.longRange, days = long?.days || [];
  $('#fc-long').hidden = days.length < 2;
  if (days.length < 2) return;
  const date = d => fmt(`${d}T12:00:00+08:00`, { weekday: 'short', hour: undefined, minute: undefined });
  const nowHigh = Math.max(...validValues(readings(state.data, 'psi')));
  const first = days[0].high, last = days[days.length - 1].high;
  const head = long.betterFrom
    ? (long.betterFrom === days[0].date && nowHigh <= 100 ? t('fcLongStay') : t('fcLongBetter', { date: date(long.betterFrom) }))
    : t(last <= first * 0.85 ? 'fcLongEasing' : last >= first * 1.15 ? 'fcLongWorse' : 'fcLongFlat', { n: days.length });
  $('#fc-long-head').textContent = head;
  const cell = d => {
    const b = bandOf(d.high), w = d.weather;
    const weather = w ? `<small>${e(t(w.rain ? 'fcLongRain' : 'fcLongDry'))}${w.windDirection ? ` · ${e(w.windDirection)}` : ''}</small>` : '';
    const day = fmt(`${d.date}T12:00:00+08:00`, { weekday: 'short', hour: undefined, minute: undefined, month: undefined, day: undefined });
    return `<div class="long-day${d.source === 'blend' ? ' first' : ''}" style="--c:${b.color}"><span>${e(day)}</span><b>${d.low === d.high ? d.low : `${d.low}–${d.high}`}</b><i></i><em>${e(b.label)}</em>${weather}</div>`;
  };
  $('#fc-long-days').innerHTML = days.map(cell).join('');
  const asmc = long.asmc || {}, today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
  const parts = [];
  const fn = asmc.fortnight;
  if (fn && (!fn.until || fn.until >= today)) {
    const tendency = { drier: 'fcAsmcDrier', wetter: 'fcAsmcWetter', normal: 'fcAsmcNormal' }[fn.tendency];
    parts.push(`<div><span class="signal-label">${e(t('fcAsmcFortnight', { period: fn.period || '' }))}</span>${tendency ? `<b>${e(t(tendency))}</b>` : ''}<details${tendency ? '' : ' open'}><summary>${e(t('fcAsmcOriginal'))}</summary><blockquote lang="en">${e(fn.text)}</blockquote></details><a href="${e(safeUrl(fn.url))}" target="_blank" rel="noopener noreferrer">ASMC ↗</a></div>`);
  }
  const season = asmc.seasonal;
  if (season) {
    const ease = season.easeFrom, when = ease && t(`fcWhen_${ease.part}`, { month: en() ? new Date(2026, ease.month - 1, 1).toLocaleDateString('en-SG', { month: 'long' }) : ease.month });
    const verdict = [season.escalated && t('fcAsmcEscalated'), ease && t(ease.rain ? 'fcAsmcEaseRain' : 'fcAsmcEase', { when })].filter(Boolean).join(en() ? ' ' : '');
    const period = season.title ? ` · <span lang="en">${e(season.title.replace(/^Seasonal Forecast for /, ''))}</span>` : '';
    parts.push(`<div><span class="signal-label">${e(t('fcAsmcSeason'))}${period}</span>${verdict ? `<b>${e(verdict)}</b>` : ''}<details${verdict ? '' : ' open'}><summary>${e(t('fcAsmcOriginal'))}</summary><blockquote lang="en">${e(season.text)}</blockquote></details><a href="${e(safeUrl(season.url))}" target="_blank" rel="noopener noreferrer">ASMC ↗</a></div>`);
  }
  $('#fc-long-asmc').innerHTML = parts.join('');
  $('#fc-long-asmc').hidden = !parts.length;
}
function render() { renderSummary(); renderMyAir(); renderForecast(); renderHours(); renderRules(); renderMap(); renderChart(); renderHistory(); renderEscape(); renderAdvisories(); renderNews(); renderToc(); }

// Compared with past years: per-year peaks and day counts, and the haze season overlaid by year.
const yearColours = ['#9aa6a0', '#b58b2d', '#4f8a96', '#c9652f', '#8a5a96', '#2e9079'];
function renderHistory() {
  const h = state.history;
  $('#history').hidden = !h?.years?.length;
  if (!h?.years?.length) return;
  const now = h.years[h.years.length - 1];
  const day = date => fmt(`${date}T12:00:00+08:00`, { year: 'numeric', hour: undefined, minute: undefined });
  const regionLabel = id => { const r = regions.find(x => x.id === id); return r ? regionName(r) : id; };
  const past = h.years.filter(y => y.year !== now.year);
  const since = [...past].reverse().find(y => y.peak >= now.peak);
  const most = [...past].sort((a, b) => b.days100 - a.days100)[0];
  const vars = { year: now.year, peak: now.peak, region: regionLabel(now.peakRegion), date: day(now.peakDate), days: now.days100 };
  $('#his-headline').textContent = since
    ? t('hisHeadSince', { ...vars, since: since.year, sincePeak: since.peak, maxYear: most.year, maxDays: most.days100 })
    : t('hisHeadRecord', vars);
  const top = Math.max(...h.years.map(y => y.peak));
  $('#his-rows').innerHTML = [...h.years].reverse().map(y => {
    const b = bandOf(y.peak);
    const label = `${y.year}${y.partial ? ` <small>${e(t(y.year === now.year ? 'hisSoFar' : 'hisFrom'))}</small>` : ''}`;
    const count = (n, limit) => `<td class="${n ? 'hot' : ''}" style="--c:${bandOf(limit + 1).color}">${n || '–'}</td>`;
    return `<tr class="${y.year === now.year ? 'current' : ''}"><th scope="row">${label}</th><td class="his-peak" title="${e(`${regionLabel(y.peakRegion)} · ${day(y.peakDate)}`)}"><span style="--w:${Math.round(y.peak / top * 100)}%;--c:${b.color}"><i></i><b style="color:${b.color}">${y.peak}</b></span></td>${count(y.days100, 100)}${count(y.days200, 200)}${count(y.days300, 300)}</tr>`;
  }).join('');
  // Season overlay: x = day of the season, y = daily highest PSI.
  const series = Object.entries(h.season || {}).sort(([a], [b]) => a - b);
  const length = Math.max(...series.map(([, v]) => v.length));
  const max = Math.ceil(Math.max(200, ...series.flatMap(([, v]) => v.filter(Number.isFinite))) / 50) * 50;
  const x = i => 44 + i / (length - 1) * 496, y = v => 210 - v / max * 185;
  let svg = '';
  for (let v = 0; v <= max; v += 50) svg += `<line class="grid" x1="44" x2="540" y1="${y(v)}" y2="${y(v)}"/><text x="34" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  for (const limit of [100, 200, 300].filter(l => l < max)) svg += `<line class="threshold" x1="44" x2="540" y1="${y(limit)}" y2="${y(limit)}" style="stroke:${bandOf(limit + 1).color}"/>`;
  const start = new Date(`2000-${h.seasonStart}T12:00:00+08:00`);
  for (let m = 0; m < 4; m++) { const d = new Date(start); d.setMonth(start.getMonth() + m); const i = Math.round((d - start) / 86400000); svg += `<text x="${x(i)}" y="234" text-anchor="${m ? 'middle' : 'start'}">${e(new Intl.DateTimeFormat(locale(), { month: 'short' }).format(d))}</text>`; }
  series.forEach(([year, values], k) => {
    const current = +year === now.year, colour = current ? '#b74d67' : yearColours[k % yearColours.length];
    let path = '';
    values.forEach((v, i) => { if (Number.isFinite(v)) path += `${path && Number.isFinite(values[i - 1]) ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `; });
    svg += `<path class="series${current ? ' current' : ''}" d="${path}" stroke="${colour}"/>`;
  });
  $('#his-chart').innerHTML = svg;
  $('#his-legend').innerHTML = series.map(([year], k) => `<span style="--c:${+year === now.year ? '#b74d67' : yearColours[k % yearColours.length]}" class="${+year === now.year ? 'current' : ''}"><i></i>${year}</span>`).join('');
  $('#his-older').textContent = t('hisOlder', { items: (h.older || []).map(o => t('hisOlderItem', { date: day(o.date), value: o.value })).join(getLanguage() === 'en' ? '; ' : '；') });
  $('#his-note').textContent = t('hisNote', { end: h.datasetEnd ? day(h.datasetEnd) : '—' });
}

// Official measures: which PSI band each agency's rules are in, now and (for forecast-based ones) tomorrow.
function renderRules() {
  const pv = validValues(readings(state.data, 'psi'));
  const now = pv.length ? Math.max(...pv) : NaN;
  const f = state.data?.forecast, range = f?.official || f?.psi;
  const nowTier = Number.isFinite(now) ? tierOf(now) : -1;
  // A forecast range can straddle two bands; mark every band it touches.
  const tomorrowTiers = range ? TIERS.map((tier, i) => (range.high >= tier.min && range.low <= tier.max ? i : -1)).filter(i => i >= 0) : [];
  const forecastText = range ? `PSI ${range.low}–${range.high}` : '—';
  $('#rules-sub').textContent = t('rulSub', { now: Number.isFinite(now) ? `PSI ${now}` : '—', forecast: forecastText });
  $('#rules-note').textContent = t('rulNote', { date: fmt(`${rulesChecked}T12:00:00+08:00`, { year: 'numeric', hour: undefined, minute: undefined }) });
  const bandName = i => { const b = bandOf(TIERS[i].min); return `${b.label} ${TIERS[i].max === Infinity ? `>${TIERS[i].min - 1}` : `${TIERS[i].min}–${TIERS[i].max}`}`; };
  $('#rules-grid').innerHTML = rules.map(rule => {
    const text = rule[getLanguage()] || rule.zh;
    const basis = rule.basis === 'forecast' ? `${t('rulForecast')} · ${forecastText}` : `${t('rulReading')} · ${Number.isFinite(now) ? `PSI ${now}` : '—'}`;
    const rows = TIERS.map((tier, i) => {
      const active = rule.basis === 'forecast' ? tomorrowTiers.includes(i) : nowTier === i;
      const tag = active ? `<em>${e(t(rule.basis === 'forecast' ? 'rulTomorrow' : 'rulNow'))}</em>` : '';
      const b = bandOf(tier.min);
      return `<li class="${active ? 'active' : ''}" style="--c:${b.color}"><span class="tier">${e(bandName(i))}${tag}</span><p>${e(text.tiers[i] || t('rulNone'))}</p></li>`;
    }).join('');
    return `<article class="rule-card"><h3>${e(text.agency)}</h3><p class="rule-basis">${e(basis)}</p><ul>${rows}</ul><a href="${e(rule.url)}" target="_blank" rel="noopener noreferrer">${e(t('rulSource'))} ↗</a></article>`;
  }).join('');
}

// When to go out: bias-corrected hourly PM2.5 for one region, today and tomorrow.
const hoursRegion = () => state.hoursRegion || (state.place ? nearestRegion(state.place.lat, state.place.lon).id : state.region !== 'all' ? state.region : 'central');
function renderHours() {
  const hourly = state.data?.forecast?.hourly;
  $('#hours').hidden = !hourly?.times?.length;
  if (!hourly?.times?.length) return;
  const region = hoursRegion();
  $('#hours-region').innerHTML = regions.map(r => `<button data-region="${r.id}" class="${r.id === region ? 'selected' : ''}" aria-pressed="${r.id === region}">${e(regionName(r))}</button>`).join('');
  const values = hourly.regions[region] || [];
  const days = {};
  hourly.times.forEach((time, i) => { (days[time.slice(0, 10)] ||= []).push({ hour: +time.slice(11, 13), value: values[i] }); });
  const top = Math.max(150, ...values.filter(Number.isFinite));
  const colourOf = v => bandOf(v, 'pm25');
  const hh = h => `${String(h).padStart(2, '0')}:00`;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date());
  // Late at night today has no window left; show it only if it is all there is.
  let shown = Object.entries(days).slice(0, 2).map(([date, hours]) => [date, hours, bestWindow(hours)]);
  if (shown.length > 1) shown = shown.filter(([, , best]) => best);
  $('#hours-days').innerHTML = shown.map(([date, hours, best]) => {
    const waking = hours.filter(h => h.hour >= 6);
    const worst = waking.filter(h => Number.isFinite(h.value)).sort((a, b) => b.value - a.value)[0];
    const label = `${t(date === today ? 'hrsToday' : 'hrsTomorrow')} · ${fmt(`${date}T12:00:00+08:00`, { weekday: 'short', month: 'short', day: 'numeric', hour: undefined, minute: undefined })}`;
    let summary = `<p class="hours-none">${e(t('hrsNoWindow'))}</p>`;
    if (best) {
      const band = pm25Band(best.peak), b = colourOf(best.peak);
      summary = `<p class="hours-best" style="--c:${b.color}"><b>${e(t('hrsBest', { from: hh(best.start), to: hh(best.end), value: best.mean, band: b.label }))}</b>${worst ? `<span>${e(t('hrsWorst', { at: hh(worst.hour), value: worst.value }))}</span>` : ''}</p>`
        + `<p class="hours-advice">${e(t('hrsHealthy', { advice: list('pmAdviceHealthy')[band] }))}<br>${e(t('hrsVulnerable', { advice: list('pmAdviceVulnerable')[band] }))}</p>`;
    }
    const bars = waking.map(h => { const b = colourOf(h.value); const inBest = best && h.hour >= best.start && h.hour < best.end;
      return `<div class="hour${inBest ? ' best' : ''}" style="--c:${b.color};--h:${Math.max(6, Math.round(h.value / top * 100))}%" title="${e(t('hrsHour', { time: hh(h.hour), value: h.value, band: b.label }))}"><i></i><span>${h.hour % 3 === 0 ? String(h.hour).padStart(2, '0') : ''}</span></div>`; }).join('');
    return `<div class="hours-day"><h3>${e(label)}</h3>${summary}${best ? `<div class="hour-strip" role="img" aria-label="${e(label)}">${bars}</div>` : ''}</div>`;
  }).join('') + `<p class="hours-footnote">${e(t('hrsVulnerableNote'))}</p>`;
  $('#hours-legend').innerHTML = [0, 56, 151, 251].map((v, i) => { const b = colourOf(v); return `<span class="legend-item" style="--c:${b.color}"><i></i>${e(b.label)} <span class="legend-range">${['0–55', '56–150', '151–250', '≥251'][i]}</span></span>`; }).join('') + '<span class="legend-range">µg/m³</span>';
}
$('#hours-region').addEventListener('click', ev => { const b = ev.target.closest('[data-region]'); if (!b) return; state.hoursRegion = b.dataset.region; renderHours(); });

// Air cleaner calculator.
function renderPurifier() {
  const area = parseFloat($('#pur-area').value), height = parseFloat($('#pur-height').value);
  const cadr = Math.round(parseFloat($('#pur-cadr').value) * ($('#pur-unit').value === 'cfm' ? CFM_TO_M3H : 1));
  const poor = $('#pur-poor').checked;
  const need = cadrNeeded(area, height, poor ? 7 : 5);
  $$('#pur-presets [data-area]').forEach(b => b.classList.toggle('selected', +b.dataset.area === area));
  if (!need) { $('#purifier-result').innerHTML = `<p>${e(t('purInvalid'))}</p>`; $('#pur-models').hidden = true; return; }
  const have = cleaningTime(cadr, area, height);
  const verdict = have ? `<p class="pur-verdict ${cadr >= need.m3h ? 'ok' : 'short'}">${e(t(cadr >= need.m3h ? 'purEnough' : 'purShort', { ach: have.ach, minutes: have.minutes90 }))}</p>` : '';
  $('#purifier-result').innerHTML = `<p class="pur-need">${e(t('purNeed', need))}</p>${verdict}${purifierCurve(need.m3h, have ? cadr : null, area * height)}`;
  // Models from NEA's list that are big enough, with shop searches for live prices.
  const list = state.resources?.purifiers;
  $('#pur-models').hidden = !list?.items?.length;
  if (!list?.items?.length) return;
  const fits = suitablePurifiers(list.items, area, height, poor);
  const shown = state.purAll ? fits : fits.slice(0, 5);
  const shop = (name, url) => `<a href="${e(url)}" target="_blank" rel="noopener noreferrer">${name} ↗</a>`;
  const query = model => encodeURIComponent(model.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim()); // shop search copes badly with brackets
  const rows = shown.map(p => `<li><div><b>${e(p.model)}</b><small>${e(t(p.electronic ? 'purElec' : 'purMech', { filter: p.filter }))}</small></div><div class="pur-model-cadr"><b>${e(t('purCadr', { cadr: p.cadr }))}</b><small>${e(t('purAch', { ach: p.ach }))}</small></div><div class="pur-shops">${shop('Lazada', `https://www.lazada.sg/catalog/?q=${query(p.model)}`)}${shop('Shopee', `https://shopee.sg/search?keyword=${query(p.model)}`)}</div></li>`).join('');
  const more = fits.length > 5 ? `<button class="text-button" id="pur-more">${e(t(state.purAll ? 'purLess' : 'purMore', { n: fits.length }))}</button>` : '';
  const date = list.listUpdated ? fmt(`${list.listUpdated}T12:00:00+08:00`, { year: 'numeric', hour: undefined, minute: undefined }) : '—';
  $('#pur-models').innerHTML = `<h3>${e(t('purModels'))}</h3><p class="pur-models-sub">${e(t(fits.length ? 'purModelsSub' : 'purModelsNone'))}</p>${fits.length ? `<ul>${rows}</ul>${more}` : ''}<p class="pur-disclaimer">${e(t('purDisclaimer', { date }))}</p>`;
}
// What happens indoors after closing up: indoor PM2.5 from now's highest outdoor reading,
// for no cleaner, the NEA minimum and the reader's own cleaner.
function purifierCurve(needM3h, haveM3h, volume) {
  const pm = readings(state.data, 'pm25'), worst = regions.filter(r => Number.isFinite(pm[r.id])).sort((a, b) => pm[b.id] - pm[a.id])[0];
  const outdoor = worst ? pm[worst.id] : 100, NORMAL = 55, W = 420, H = 190, L = 34, R = 12, T = 14, B = 26, MIN = 60;
  const lines = [['none', 0], ['need', needM3h], ...(haveM3h ? [['have', haveM3h]] : [])].map(([id, cadr]) => ({ id, room: indoorPm(outdoor, cadr, volume) }));
  const top = Math.max(outdoor, NORMAL) * 1.1, x = m => L + m / MIN * (W - L - R), y = v => T + (1 - v / top) * (H - T - B);
  let svg = '';
  for (const v of [0, Math.round(top / 2 / 10) * 10, Math.round(outdoor)]) svg += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  for (const m of [0, 15, 30, 45, 60]) svg += `<text x="${x(m)}" y="${H - 6}" text-anchor="${m === MIN ? 'end' : 'middle'}">${m === MIN ? t('purMinutes', { m }) : m}</text>`;
  if (outdoor > NORMAL) svg += `<line class="threshold" x1="${L}" x2="${W - R}" y1="${y(NORMAL)}" y2="${y(NORMAL)}"/><text class="threshold-label" x="${W - R}" y="${y(NORMAL) - 5}" text-anchor="end">${e(t('purNormal'))}</text>`;
  for (const { id, room } of lines) {
    const points = Array.from({ length: MIN + 1 }, (_, m) => `${x(m).toFixed(1)},${y(room.at(m)).toFixed(1)}`).join(' ');
    svg += `<polyline class="series pur-line-${id}" points="${points}"/>`;
  }
  const key = lines.map(({ id }) => `<span class="pur-key-${id}"><i></i>${e(t({ none: 'purLineNone', need: 'purLineNeed', have: 'purLineHave' }[id]))}</span>`).join('');
  const main = lines[lines.length - 1].room, reach = main.minutesTo(NORMAL);
  const stat = (label, value) => `<div><small>${e(label)}</small><b>${e(value)}</b></div>`;
  const time = cleaningTime(haveM3h || needM3h, volume, 1); // area × height = volume
  const stats = `<div class="pur-stats">${stat(t('purStatAch'), String(time.ach))}${stat(t('purStat90'), t('purMinutes', { m: time.minutes90 }))}${stat(t('purStatFloor'), `${main.floor} µg/m³`)}</div>`;
  const start = worst ? t('purStartNow', { pm: outdoor, region: regionName(worst) }) : t('purStartExample', { pm: outdoor });
  const gap = en() ? ' ' : '', summary = outdoor <= NORMAL ? t('purAlreadyNormal') : reach === null ? t('purNeverNormal') : t('purReach', { m: reach });
  return `<div class="pur-curve"><h3>${e(t(haveM3h ? 'purStatsHave' : 'purStatsNeed'))}</h3>${stats}<p class="pur-curve-title">${e(t('purCurveTitle'))}</p><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${e(start + gap + summary)}">${svg}</svg><div class="pur-key">${key}</div><p class="pur-curve-note">${e(start + gap + summary)}</p></div>`;
}
$('#pur-models').addEventListener('click', ev => { if (ev.target.closest('#pur-more')) { state.purAll = !state.purAll; renderPurifier(); } });
$('#purifier-form').addEventListener('input', renderPurifier);
$('#purifier-form').addEventListener('submit', ev => ev.preventDefault());
$('#pur-presets').addEventListener('click', ev => { const b = ev.target.closest('[data-area]'); if (!b) return; $('#pur-area').value = b.dataset.area; renderPurifier(); });

// Haze resources: N95 machines (stock mirrored from HazeMaskGoWhere), Community Clubs and polyclinics.
const stockColors = { available: '#2e9079', limited: '#b58b2d', out: '#b74d67', unknown: '#8b949e', offline: '#8b949e' };
const layerStyle = { ccs: { radius: 5, fillColor: '#7a62b8' }, polyclinics: { radius: 6, fillColor: '#2563eb' } };
const stockOf = item => (item.working === false ? 'offline' : item.stock || 'unknown');
const stockLabel = item => t({ available: 'stockAvailable', limited: 'stockLimited', out: 'stockOut', unknown: 'stockUnknown', offline: 'stockOffline' }[stockOf(item)]);
const directions = item => `https://www.google.com/maps/dir/?api=1&destination=${+item.lat},${+item.lon}`;
const metres = m => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);
function popupHtml(kind, item) {
  const lines = [`<strong>${e(item.name)}</strong>`, `<span>${e([item.address, item.postal].filter(Boolean).join(' · '))}</span>`];
  if (kind === 'masks') {
    lines.push(`<b style="color:${stockColors[stockOf(item)]}">${e(stockLabel(item))}</b>`);
    if (item.hours) lines.push(`<span>${e(t('popupHours', { hours: item.hours }))}</span>`);
    if (item.note) lines.push(`<span>${e(item.note)}</span>`);
  } else lines.push(`<span>${e(t(kind === 'ccs' ? 'popupCc' : 'popupClinic'))}</span>`);
  lines.push(`<a href="${directions(item)}" target="_blank" rel="noopener noreferrer">${e(t('popupDirections'))} ↗</a>`);
  return `<div class="res-popup">${lines.join('')}</div>`;
}
function renderResourceLayers() {
  const L = window.L, res = state.resources;
  if (!live.map || !res) return;
  for (const group of Object.values(live.layers)) group.remove();
  live.layers = {};
  for (const kind of ['ccs', 'polyclinics', 'masks']) {
    const items = res[kind]?.items || [];
    live.layers[kind] = L.layerGroup(items.map(item => {
      const style = kind === 'masks' ? { radius: 7, fillColor: stockColors[stockOf(item)] } : layerStyle[kind];
      return L.circleMarker([item.lat, item.lon], { color: '#fff', weight: 2, fillOpacity: 1, ...style }).bindPopup(popupHtml(kind, item)).bindTooltip(e(item.name));
    }));
    if (state.layers[kind]) live.layers[kind].addTo(live.map);
  }
  $$('#map-layers [data-layer]').forEach(b => { b.hidden = !(b.dataset.layer === 'readings' || live.layers[b.dataset.layer]); b.setAttribute('aria-pressed', !!state.layers[b.dataset.layer]); });
  renderLegends();
}
// Stock colours reuse green/amber/red, so never show them beside the air-quality legend unlabelled.
function renderLegends() {
  $('#map-legend').hidden = live.map ? !state.layers.readings : false;
  const stock = $('#stock-legend');
  stock.hidden = !(state.layers.masks && live.layers.masks);
  stock.innerHTML = `<span class="legend-title">${e(t('layerMasks'))}</span>` + [['available', 'stockAvailable'], ['limited', 'stockLimited'], ['out', 'stockOut'], ['unknown', 'stockGrey']]
    .map(([key, label]) => `<span class="legend-item" style="--c:${stockColors[key]}"><i></i>${e(t(label))}</span>`).join('');
}
function renderResources() {
  const masks = state.resources?.masks;
  const items = masks?.items || [];
  const count = key => items.filter(x => stockOf(x) === key).length;
  $('#mask-stock').textContent = !items.length ? t('maskStockNone')
    : stale(masks.updatedAt, Date.now(), 3) ? t('maskStockStale')
    : t('maskStock', { n: items.length, available: count('available'), limited: count('limited'), unavailable: count('out') + count('offline'), time: sgt(fmt(masks.updatedAt)) });
  renderResourceLayers();
}
$('#map-layers').addEventListener('click', ev => {
  const button = ev.target.closest('[data-layer]'); if (!button) return;
  const kind = button.dataset.layer;
  state.layers[kind] = !state.layers[kind];
  button.setAttribute('aria-pressed', state.layers[kind]);
  const group = kind === 'readings' ? live.readings : live.layers[kind];
  if (group) state.layers[kind] ? group.addTo(live.map) : group.remove();
  // Pins added while hidden have no element yet, so refresh their labels.
  if (kind === 'readings' && state.layers.readings) renderMap();
  renderLegends();
});
function nearbyHtml(place) {
  const res = state.resources;
  if (!res) return '';
  const row = (kind, item, detail) => `<li><i class="dot" style="--c:${kind === 'masks' ? stockColors[stockOf(item)] : layerStyle[kind].fillColor}"></i><span><b>${e(item.name)}</b><small>${e(detail)}</small></span><a href="${directions(item)}" target="_blank" rel="noopener noreferrer" aria-label="${e(t('popupDirections'))}: ${e(item.name)}">${e(metres(item.metres))} ↗</a></li>`;
  const groups = [
    ['nearbyMasks', nearest(place, res.masks?.items, 3).map(item => row('masks', item, stockLabel(item)))],
    ['nearbyCc', nearest(place, res.ccs?.items, 1).map(item => row('ccs', item, item.address))],
    ['nearbyClinic', nearest(place, res.polyclinics?.items, 1).map(item => row('polyclinics', item, item.address))],
  ].filter(([, rows]) => rows.length);
  return groups.length ? `<div class="nearby"><h4>${e(t('nearbyTitle'))}</h4>${groups.map(([title, rows]) => `<p>${e(t(title))}</p><ul>${rows.join('')}</ul>`).join('')}</div>` : '';
}

// "Air where you are": postal code (or device location) → closest NEA region.
// Lookups go from the browser straight to OneMap; nothing is sent to this site.
const ONEMAP_SEARCH = 'https://www.onemap.gov.sg/api/common/elastic/search';
const titleCase = text => text.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
function postalStatus(key) { $('#postal-status').hidden = !key; $('#postal-status').textContent = key ? t(key) : ''; }
async function lookupPostal(code) {
  const response = await fetch(`${ONEMAP_SEARCH}?searchVal=${code}&returnGeom=Y&getAddrDetails=Y&pageNum=1`, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Lookup failed');
  const hit = ((await response.json()).results || []).find(r => r.POSTAL === code);
  if (!hit) return null;
  const known = value => value && value !== 'NIL';
  // Block numbers such as 6A keep their case; road and building names are title-cased.
  const street = [hit.BLK_NO, known(hit.ROAD_NAME) && titleCase(hit.ROAD_NAME)].filter(known).join(' ');
  return { lat: +hit.LATITUDE, lon: +hit.LONGITUDE, postal: code, label: `${street || titleCase(hit.BUILDING)} · ${code}` };
}
function setPlace(place) {
  state.place = place;
  renderMyAir();
  if (!place) {
    if (live.you) { live.you.remove(); live.you = null; }
    selectRegion('all', false);
    return;
  }
  selectRegion(nearestRegion(place.lat, place.lon).id, false);
  state.hoursRegion = null; renderHours();
  if (live.map) {
    const icon = window.L.divIcon({ className: 'you-pin', iconSize: [18, 18], html: '<span></span>' });
    if (live.you) live.you.setLatLng([place.lat, place.lon]);
    else live.you = window.L.marker([place.lat, place.lon], { icon, zIndexOffset: 1000, keyboard: false }).addTo(live.map);
    live.you.getElement()?.setAttribute('title', t('myYou'));
    focusPlace(false);
  }
}
// Frame both the person's location and the region reading that applies to it.
function focusPlace(animate) {
  if (!live.map || !state.place) return;
  if ($('#now').hidden) { live.shown = false; return; } // refit when the map's tab is shown
  const r = nearestRegion(state.place.lat, state.place.lon);
  const bounds = window.L.latLngBounds([[state.place.lat, state.place.lon], [r.lat, r.lon]]);
  live.map[animate ? 'flyToBounds' : 'fitBounds'](bounds, { padding: [70, 70], maxZoom: 14 });
}
function renderMyAir() {
  const place = state.place;
  $('#my-air').hidden = !place;
  if (!place) return;
  const d = state.data || {}, r = nearestRegion(place.lat, place.lon);
  const psi = readings(d, 'psi')[r.id], tomorrow = d.forecast?.regions?.[r.id];
  const cell = (label, value, metric, unitText) => { const b = bandOf(value, metric); return `<div><span>${e(label)}</span><b style="color:${b.color}">${Number.isFinite(value) ? value : '—'}<small>${unitText}</small></b><em style="color:${b.color}">${e(b.label)}</em></div>`; };
  $('#my-air').innerHTML = `<div class="my-air-head"><div><h3>${e(place.label || t('geoHere'))}</h3><p>${e(t('myRegion', { region: regionName(r) }))}</p></div><div class="my-air-actions"><button class="text-button" data-action="map">${e(t('myShowMap'))}</button><button class="text-button" data-action="clear">${e(t('myClear'))}</button></div></div>`
    + `<div class="my-air-values">${cell(t('statPsi'), psi, 'psi', 'PSI')}${cell(t('statPm'), readings(d, 'pm25')[r.id], 'pm25', 'µg/m³')}${cell('AQI', readings(d, 'aqi')[r.id], 'aqi', 'AQI')}${Number.isFinite(tomorrow) ? cell(t('myTomorrow'), tomorrow, 'psi', 'PSI') : ''}</div>`
    + `<p class="my-air-advice">${e(t('myAdvice', { advice: activity(psi, 'general', getLanguage()) }))}</p><p class="my-air-note">${e(t('myNote'))}</p>`
    + nearbyHtml(place);
}
function rememberPostal(code) { try { if (code) localStorage.setItem('haze-postal', code); else localStorage.removeItem('haze-postal'); } catch {} }
async function checkPostal(input) {
  const code = postalCode(input);
  if (!code) { postalStatus('postalInvalid'); return; }
  postalStatus('postalSearching');
  try {
    const place = await lookupPostal(code);
    if (!place) { postalStatus('postalNotFound'); return; }
    postalStatus(null);
    rememberPostal($('#postal-remember').checked ? code : null);
    setPlace(place);
  } catch { postalStatus('postalFailed'); }
}
$('#postal-form').addEventListener('submit', ev => { ev.preventDefault(); checkPostal($('#postal-input').value); });
$('#postal-remember').addEventListener('change', ev => rememberPostal(ev.target.checked ? state.place?.postal : null));
$('#geo-button').addEventListener('click', () => {
  if (!navigator.geolocation) { postalStatus('geoDenied'); return; }
  postalStatus('postalSearching');
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude: lat, longitude: lon } = pos.coords;
    if (!inSingapore(lat, lon)) { postalStatus('geoOutside'); return; }
    postalStatus(null); setPlace({ lat, lon, label: null });
  }, () => postalStatus('geoDenied'), { timeout: 10000, maximumAge: 600000 });
});
$('#my-air').addEventListener('click', ev => {
  const action = ev.target.closest('[data-action]')?.dataset.action;
  if (action === 'clear') { $('#postal-input').value = ''; $('#postal-remember').checked = false; rememberPostal(null); postalStatus(null); setPlace(null); }
  if (action === 'map') { $('#distribution').scrollIntoView({ behavior: 'smooth' }); focusPlace(true); }
});

// Nearby destinations: same-model AQI now and for the next two days, plus flight searches.
const money = (amount, currency) => `${currency === 'SGD' ? 'S$' : `${currency} `}${amount}`;
function fareHtml(fare) {
  if (!fare) return '—';
  if (!fare.amount) return `<small>${e(t('escNoFare'))}</small>`;
  const link = (amount, url, text) => `<a href="${e(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${e(text || t('escPriceFrom', { price: money(amount, fare.currency) }))}</a>`;
  const detail = [fare.stops === 0 ? t('escDirectShort') : t('escStops', { n: fare.stops }), Number.isFinite(fare.hours) ? t('escHours', { h: fare.hours }) : ''].filter(Boolean).join(' · ');
  const direct = fare.direct && fare.stops !== 0 ? `<small>${link(fare.direct.amount, fare.direct.url, t('escDirect', { price: money(fare.direct.amount, fare.currency) }))}</small>` : '';
  return `${link(fare.amount, fare.url)}<small>${e(detail)}</small>${direct}`;
}
function renderEscape() {
  const d = state.escape;
  $('#escape').hidden = !d?.cities?.length;
  if (!d?.cities?.length) return;
  const day = date => fmt(`${date}T12:00:00+08:00`, { weekday: 'short', hour: undefined, minute: undefined, month: undefined, day: undefined });
  $('#esc-sub').textContent = t('escSub', { time: sgt(fmt(d.generatedAt)) });
  const heads = { now: t('escNow'), tomorrow: t('escDayMax', { day: day(d.tomorrow) }), after: t('escDayMax', { day: day(d.dayAfter) }) };
  $('#esc-tomorrow-head').textContent = heads.tomorrow; $('#esc-after-head').textContent = heads.after;
  const hasPrice = d.cities.some(c => c.price?.amount);
  $('.esc-price-col').hidden = !hasPrice;
  // data-label carries the column name into the stacked phone layout.
  const cell = (value, label) => { const b = bandOf(value, 'aqi'); return `<td class="esc-aqi" data-label="${e(label)}"><b style="color:${b.color}">${Number.isFinite(value) ? value : '—'}</b><small style="color:${b.color}">${e(b.label)}</small></td>`; };
  const rank = c => (Number.isFinite(c.tomorrowMax) ? c.tomorrowMax : Infinity);
  $('#esc-rows').innerHTML = [...d.cities].sort((a, b) => rank(a) - rank(b)).map(c => {
    const home = c.iata === 'SIN', links = flightLinks(c.iata, d.tomorrow);
    const price = fareHtml(c.price);
    return `<tr class="${home ? 'home' : ''}"><th scope="row"><span>${e(en() ? c.en : c.zh)}</span><small>${home ? e(t('escHere')) : `${e(en() ? c.zh : c.en)} · ${c.iata}`}</small></th>${cell(c.aqi, heads.now)}${cell(c.tomorrowMax, heads.tomorrow)}${cell(c.dayAfterMax, heads.after)}<td class="esc-time">${home ? '' : e(flightTime(c.flightMinutes, getLanguage()))}</td>${hasPrice ? `<td class="esc-price">${home ? '' : price}</td>` : ''}<td class="esc-links">${home ? '' : `<a href="${e(links.trip)}" target="_blank" rel="noopener noreferrer">Trip.com</a><a href="${e(links.google)}" target="_blank" rel="noopener noreferrer">Google</a><a href="${e(links.skyscanner)}" target="_blank" rel="noopener noreferrer">Skyscanner</a>`}</td></tr>`;
  }).join('');
}

// Tabs: the page is split into four panels; the URL hash names a tab or any section inside one.
const TABS = ['now', 'plan', 'protect', 'updates'];
let currentTab = 'now';
// Sidebar: a table of contents for the open tab, with the section in view highlighted.
const tocIcons = { locate: 'pin', stats: 'dashboard', distribution: 'map', trend: 'forecast', history: 'gauge', forecast: 'clock', rules: 'info', escape: 'plane', purifier: 'home', resources: 'mask', guide: 'heart', advisories: 'shield', news: 'news' };
const inView = new Set();
const tocSpy = new IntersectionObserver(entries => {
  for (const x of entries) x.isIntersecting ? inView.add(x.target.id) : inView.delete(x.target.id);
  const links = $$('#toc-links a'), first = links.find(a => inView.has(a.dataset.target));
  if (first) links.forEach(a => a.classList.toggle('active', a === first));
}, { rootMargin: '-140px 0px -50% 0px' });
function renderToc() {
  const sections = $$(`#${currentTab} [data-toc]`).filter(el => !el.hidden);
  tocSpy.disconnect(); inView.clear();
  $('#toc-links').innerHTML = sections.map(el => `<a href="#${el.id}" data-target="${el.id}"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[tocIcons[el.id]] || icons.info}</svg><span>${e(t(el.dataset.toc))}</span></a>`).join('');
  sections.forEach(el => tocSpy.observe(el));
  $('#toc-links a')?.classList.add('active');
}
// Phones: pin only the tab row of the top bar; the row above it scrolls away.
function pinTabs() {
  $('.topbar').style.top = matchMedia('(max-width: 760px)').matches ? `-${$('.tabs').offsetTop}px` : '';
}
window.addEventListener('resize', pinTabs);
function tabFor(id) {
  if (TABS.includes(id)) return id;
  return document.getElementById(id)?.closest('.tab-panel')?.id || 'now';
}
function showTab(tab, target) {
  currentTab = tab;
  $$('.tab-panel').forEach(panel => { panel.hidden = panel.id !== tab; });
  // The title block and island alert belong to "Now"; other tabs start straight with their content.
  $('#overview').hidden = tab !== 'now'; $('#alert').hidden = tab !== 'now';
  $$('nav [data-tab]').forEach(link => {
    const on = link.dataset.tab === tab;
    link.classList.toggle('active', on);
    if (on) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  // Leaflet measures its container, so a map first shown after being hidden must re-measure.
  if (tab === 'now' && live.map) {
    live.map.invalidateSize();
    if (!live.shown) { live.shown = true; if (state.place) focusPlace(false); else live.map.fitBounds(MAIN_ISLAND); }
  }
  renderToc();
  const section = target && !TABS.includes(target) ? document.getElementById(target) : null;
  if (section) section.scrollIntoView({ behavior: 'smooth' });
  else if (window.scrollY > $('#main').offsetTop) window.scrollTo({ top: 0 });
}
function route() {
  const id = decodeURIComponent(location.hash.slice(1));
  showTab(tabFor(id || 'now'), id);
}
window.addEventListener('hashchange', route);

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!response.ok || !(response.headers.get('content-type') || '').match(/json|text\/plain/)) throw new Error('Unavailable');
  const data = await response.json();
  if (data.schemaVersion !== 1) throw new Error('Invalid data format');
  return data;
}
// Prefer whichever copy is newer: the deployed file or the repository's latest commit.
async function fetchNewest(file) {
  const local = new URL(`./data/${file}`, import.meta.url); local.searchParams.set('t', Date.now());
  const candidates = (await Promise.allSettled([fetchJson(local), fetchJson(`${REPO_DATA}${file}?t=${Date.now()}`)])).filter(r => r.status === 'fulfilled').map(r => r.value);
  if (!candidates.length) throw new Error('Data unavailable');
  return candidates.sort((a, b) => (Date.parse(b.generatedAt) || 0) - (Date.parse(a.generatedAt) || 0))[0];
}
async function fetchLatest() {
  const staticHost = location.hostname.endsWith('github.io') || ['localhost', '127.0.0.1', ''].includes(location.hostname);
  // Hosted worker supplies durable snapshots from its own scheduled refresh.
  if (!staticHost) { try { return await fetchJson(`./api/data?t=${Date.now()}`); } catch {} }
  return fetchNewest('latest.json');
}
async function load() {
  $('#refresh').disabled = true;
  try {
    const [data, resources, escape, history] = await Promise.all([fetchLatest(), fetchNewest('resources.json').catch(() => state.resources), fetchNewest('escape.json').catch(() => state.escape), fetchNewest('history.json').catch(() => state.history)]);
    state.data = data; state.resources = resources; state.escape = escape; state.history = history; render(); renderResources(); renderPurifier();
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
// New snapshots land every hour; check every 15 minutes while the tab is visible, and on return.
setInterval(() => { if (document.visibilityState === 'visible') load(); }, 15 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.data?.nextUpdateAt && Date.now() > Date.parse(state.data.nextUpdateAt)) load(); });
renderStatic();
renderPurifier();
pinTabs();
route();
initMap();
live.shown = !$('#now').hidden;
load();
try {
  const saved = localStorage.getItem('haze-postal');
  if (saved) { $('#postal-input').value = saved; $('#postal-remember').checked = true; checkPostal(saved); }
} catch {}
