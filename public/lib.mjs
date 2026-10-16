export const regions = [
  { id: 'north', zh: '北部', en: 'North', x: 361, y: 108 },
  { id: 'south', zh: '南部', en: 'South', x: 361, y: 282 },
  { id: 'east', zh: '东部', en: 'East', x: 530, y: 195 },
  { id: 'west', zh: '西部', en: 'West', x: 190, y: 195 },
  { id: 'central', zh: '中部', en: 'Central', x: 361, y: 195 },
];
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
