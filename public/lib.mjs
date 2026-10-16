// lat/lon are NEA's reference points for each region (regionMetadata in the PSI API);
// x/y place them on the schematic map used when the live map cannot load.
export const regions = [
  { id: 'north', zh: '北部', en: 'North', x: 361, y: 108, lat: 1.41803, lon: 103.82 },
  { id: 'south', zh: '南部', en: 'South', x: 361, y: 282, lat: 1.29587, lon: 103.82 },
  { id: 'east', zh: '东部', en: 'East', x: 530, y: 195, lat: 1.35735, lon: 103.94 },
  { id: 'west', zh: '西部', en: 'West', x: 190, y: 195, lat: 1.35735, lon: 103.7 },
  { id: 'central', zh: '中部', en: 'Central', x: 361, y: 195, lat: 1.35735, lon: 103.82 },
];
export const SG_BOUNDS = [[1.15, 103.59], [1.48, 104.1]];
export function inSingapore(lat, lon) {
  return lat >= SG_BOUNDS[0][0] && lat <= SG_BOUNDS[1][0] && lon >= SG_BOUNDS[0][1] && lon <= SG_BOUNDS[1][1];
}
// NEA publishes no region boundaries, so a location belongs to the closest reference point.
export function nearestRegion(lat, lon) {
  const distance = r => (r.lat - lat) ** 2 + ((r.lon - lon) * Math.cos(lat * Math.PI / 180)) ** 2;
  return regions.reduce((best, r) => (distance(r) < distance(best) ? r : best));
}
// Great-circle distance in metres.
export function distance(a, b) {
  const rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}
export function nearest(place, items = [], count = 1) {
  return items.map(item => ({ ...item, metres: distance(place, item) })).sort((x, y) => x.metres - y.metres).slice(0, count);
}
export function flightTime(minutes, lang = 'zh') {
  if (!Number.isFinite(minutes) || minutes <= 0) return '';
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return lang === 'en' ? `~${h ? `${h}h` : ''}${m ? ` ${m}m` : ''}`.replace('~ ', '~') : `约 ${h ? `${h} 小时` : ''}${m ? ` ${m} 分` : ''}`.replace('约  ', '约 ');
}
// Flight searches open on the given date (YYYY-MM-DD), one way from Singapore.
export function flightLinks(iata, date) {
  const code = iata.toLowerCase(), compact = date.replaceAll('-', '').slice(2);
  return {
    trip: `https://www.trip.com/flights/showfarefirst?dcity=sin&acity=${code}&ddate=${date}&triptype=ow&class=y&quantity=1&locale=en-SG&curr=SGD`,
    google: `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights to ${iata} from SIN on ${date} one way`)}&curr=SGD`,
    skyscanner: `https://www.skyscanner.com.sg/transport/flights/sin/${code}/${compact}/`,
  };
}
// NEA 1-hr PM2.5 bands (µg/m³) and the matching activity advice for the next hour.
export const PM25_BANDS = [55, 150, 250];
export function pm25Band(value) {
  if (!Number.isFinite(value)) return -1;
  const i = PM25_BANDS.findIndex(limit => value <= limit);
  return i === -1 ? PM25_BANDS.length : i;
}
// Lowest-average run of `span` consecutive hours whose start falls in [fromHour, toHour].
// hours: [{ hour: 0-23, value }] in time order for one day.
export function bestWindow(hours, span = 2, fromHour = 6, toHour = 21) {
  let best = null;
  for (let i = 0; i + span <= hours.length; i++) {
    const run = hours.slice(i, i + span);
    if (run[0].hour < fromHour || run[0].hour > toHour || run.some((h, k) => h.hour !== run[0].hour + k || !Number.isFinite(h.value))) continue;
    const mean = run.reduce((sum, h) => sum + h.value, 0) / span;
    if (!best || mean < best.mean) best = { start: run[0].hour, end: run[0].hour + span, mean: Math.round(mean), peak: Math.max(...run.map(h => h.value)) };
  }
  return best;
}
// Air cleaner sizing, NEA's rule: smoke CADR (m³/h) ≥ room volume (m³) × 5, or × 7 where
// ventilation is poor or the unit relies partly on electronic cleaning (ionisers etc.).
export const CFM_TO_M3H = 1.699;
export function cadrNeeded(areaM2, heightM = 2.6, factor = 5) {
  if (!(areaM2 > 0) || !(heightM > 0)) return null;
  const m3h = Math.ceil(areaM2 * heightM * factor);
  return { m3h, cfm: Math.round(m3h / CFM_TO_M3H), volume: Math.round(areaM2 * heightM) };
}
// Models from NEA's list that are big enough for the room, smallest first. Units with
// electronic cleaning are judged on their overall CADR against the × 7 rule.
export function suitablePurifiers(items = [], areaM2, heightM = 2.6, poorVentilation = false) {
  const volume = areaM2 * heightM;
  if (!(volume > 0)) return [];
  return items.map(item => {
    const cadr = item.electronic ? item.cadrOverall : (item.cadrFilter ?? item.cadrOverall);
    const need = Math.ceil(volume * (item.electronic || poorVentilation ? 7 : 5));
    return { ...item, cadr, need, ach: Math.round(cadr / volume * 10) / 10 };
  }).filter(item => item.cadr >= item.need).sort((a, b) => a.cadr - b.cadr);
}
// Air changes per hour, and minutes to cut indoor particles by 90% in a closed, well-mixed room.
export function cleaningTime(cadrM3h, areaM2, heightM = 2.6) {
  if (!(cadrM3h > 0) || !(areaM2 > 0) || !(heightM > 0)) return null;
  const ach = cadrM3h / (areaM2 * heightM);
  return { ach: Math.round(ach * 10) / 10, minutes90: Math.round(Math.log(10) / ach * 60) };
}
// Indoor PM2.5 after closing up and switching the cleaner on, starting from the outdoor
// level. Closed rooms still leak about LEAK_ACH air changes an hour, so the level settles
// at a floor rather than zero. Without a cleaner it stays at the outdoor level.
export const LEAK_ACH = 0.5;
export function indoorPm(outdoor, cadrM3h, volumeM3, leak = LEAK_ACH) {
  if (!(outdoor > 0) || !(volumeM3 > 0)) return null;
  const k = Math.max(cadrM3h || 0, 0) / volumeM3 + leak, floor = outdoor * leak / k;
  return {
    floor: Math.round(floor),
    at: minutes => floor + (outdoor - floor) * Math.exp(-k * minutes / 60),
    minutesTo: target => (outdoor <= target ? 0 : floor >= target ? null : Math.ceil(-Math.log((target - floor) / (outdoor - floor)) / k * 60)),
  };
}
export function postalCode(input) {
  const code = String(input ?? '').replace(/\s/g, '');
  return /^\d{6}$/.test(code) ? code : null;
}
export const colors = ['#2e9079', '#b58b2d', '#da7540', '#b74d67', '#7c457e'];
// AQI uses the US EPA category colours (darkened yellow so text stays readable), as on aqicn.org.
const aqiColors = ['#009966', '#b8960c', '#e07a1f', '#cc0033', '#660099', '#7e0023'];
const bandLabels = {
  zh: { none: '暂无数据', psi: ['良好', '中等', '不健康', '非常不健康', '危险'], pm25: ['正常', '偏高', '高', '非常高'], aqi: ['优', '良', '轻度污染', '中度污染', '重度污染', '严重污染'] },
  en: { none: 'No data', psi: ['Good', 'Moderate', 'Unhealthy', 'Very unhealthy', 'Hazardous'], pm25: ['Normal', 'Elevated', 'High', 'Very high'], aqi: ['Good', 'Moderate', 'Unhealthy for sensitive groups', 'Unhealthy', 'Very unhealthy', 'Hazardous'] },
};
const bandLimits = { psi: [50, 100, 200, 300], pm25: [55, 150, 250], aqi: [50, 100, 150, 200, 300] };
export function band(value, metric = 'psi', lang = 'zh') {
  const text = bandLabels[lang] || bandLabels.zh;
  if (!Number.isFinite(value)) return { index: -1, label: text.none, color: '#8b949e' };
  const limits = bandLimits[metric] || bandLimits.psi;
  const index = limits.findIndex(n => value <= n);
  const i = index === -1 ? limits.length : index;
  const color = metric === 'aqi' ? aqiColors[i] : colors[metric === 'pm25' && i > 0 ? i + 1 : i];
  return { index: i, label: text[metric in bandLimits ? metric : 'psi'][i], color };
}
// US EPA PM2.5 AQI breakpoints (pre-2024 table), applied to the hourly reading.
// This is the convention aqicn.org uses, so values match its Singapore map.
const AQI_BREAKPOINTS = [[0, 12, 0, 50], [12.1, 35.4, 51, 100], [35.5, 55.4, 101, 150], [55.5, 150.4, 151, 200], [150.5, 250.4, 201, 300], [250.5, 350.4, 301, 400], [350.5, 500.4, 401, 500]];
export function aqiFromPm25(concentration) {
  if (!Number.isFinite(concentration) || concentration < 0) return NaN;
  const c = Math.floor(concentration * 10) / 10;
  const bp = AQI_BREAKPOINTS.find(([, hi]) => c <= hi);
  if (!bp) return 500;
  const [lo, hi, aqiLo, aqiHi] = bp;
  return Math.round((aqiHi - aqiLo) / (hi - lo) * (Math.max(c, lo) - lo) + aqiLo);
}
const mapValues = (values, fn) => Object.fromEntries(Object.entries(values || {}).map(([k, v]) => [k, fn(v)]));
export function readings(data, metric) {
  if (metric === 'aqi') return mapValues(readings(data, 'pm25'), aqiFromPm25);
  return data?.[metric]?.readings?.[metric === 'psi' ? 'psi_twenty_four_hourly' : 'pm25_one_hourly'] || {};
}
export function history(data, metric) {
  if (metric === 'aqi') return (data?.history?.pm25 || []).map(p => ({ timestamp: p.timestamp, values: mapValues(p.values, aqiFromPm25) }));
  return data?.history?.[metric] || [];
}
export function validValues(values) {
  return regions.map(r => values[r.id]).filter(Number.isFinite);
}
export function stale(timestamp, now = Date.now(), hours = 4) {
  const t = Date.parse(timestamp);
  return !Number.isFinite(t) || now - t > hours * 3600000 || t > now + 3600000;
}
export function safeUrl(input) {
  try { const url = new URL(input); return url.protocol === 'https:' ? url.href : '#'; } catch { return '#'; }
}
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const advice = {
  zh: {
    general: ['可正常安排日常活动。', '可正常安排日常活动。', '减少长时间或剧烈的户外体力活动。', '避免长时间或剧烈的户外体力活动。', '尽量减少户外活动。'],
    vulnerable: ['可正常安排日常活动。', '可正常安排日常活动。', '尽量减少长时间或剧烈的户外体力活动。', '尽量减少户外活动。', '避免户外活动。'],
    chronic: ['可正常安排日常活动。', '可正常安排日常活动。', '避免长时间或剧烈的户外体力活动。', '避免户外活动。', '避免户外活动。'],
    none: '数据暂不可用，请查看 NEA 最新指引。',
  },
  en: {
    general: ['Normal activities.', 'Normal activities.', 'Reduce prolonged or strenuous outdoor physical exertion.', 'Avoid prolonged or strenuous outdoor physical exertion.', 'Minimise outdoor activity.'],
    vulnerable: ['Normal activities.', 'Normal activities.', 'Minimise prolonged or strenuous outdoor physical exertion.', 'Minimise outdoor activity.', 'Avoid outdoor activity.'],
    chronic: ['Normal activities.', 'Normal activities.', 'Avoid prolonged or strenuous outdoor physical exertion.', 'Avoid outdoor activity.', 'Avoid outdoor activity.'],
    none: 'Data unavailable. Please check the latest NEA advice.',
  },
};
export function activity(value, audience, lang = 'zh') {
  const level = band(value).index, text = advice[lang] || advice.zh;
  return level < 0 ? text.none : text[audience][level];
}
