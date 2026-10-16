export const regions = [
  { id: 'north', zh: '北部', en: 'North', x: 361, y: 108 },
  { id: 'south', zh: '南部', en: 'South', x: 361, y: 282 },
  { id: 'east', zh: '东部', en: 'East', x: 530, y: 195 },
  { id: 'west', zh: '西部', en: 'West', x: 190, y: 195 },
  { id: 'central', zh: '中部', en: 'Central', x: 361, y: 195 },
];
export const colors = ['#2e9079', '#b58b2d', '#da7540', '#b74d67', '#7c457e'];
export function band(value, metric = 'psi') {
  if (!Number.isFinite(value)) return { index: -1, label: '暂无数据', color: '#8b949e' };
  const limits = metric === 'psi' ? [50, 100, 200, 300] : [55, 150, 250];
  const labels = metric === 'psi' ? ['良好', '中等', '不健康', '非常不健康', '危险'] : ['正常', '偏高', '高', '非常高'];
  const index = limits.findIndex(n => value <= n);
  const i = index === -1 ? limits.length : index;
  return { index: i, label: labels[i], color: colors[metric === 'pm25' && i > 0 ? i + 1 : i] };
}
export function readings(data, metric) {
  return data?.[metric]?.readings?.[metric === 'psi' ? 'psi_twenty_four_hourly' : 'pm25_one_hourly'] || {};
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
export function activity(value, audience) {
  const level = band(value).index;
  const messages = {
    general: ['可正常安排日常活动。', '可正常安排日常活动。', '减少长时间或剧烈的户外体力活动。', '避免长时间或剧烈的户外体力活动。', '尽量减少户外活动。'],
    vulnerable: ['可正常安排日常活动。', '可正常安排日常活动。', '尽量减少长时间或剧烈的户外体力活动。', '尽量减少户外活动。', '避免户外活动。'],
    chronic: ['可正常安排日常活动。', '可正常安排日常活动。', '避免长时间或剧烈的户外体力活动。', '避免户外活动。', '避免户外活动。'],
  };
  return level < 0 ? '数据暂不可用，请查看 NEA 最新指引。' : messages[audience][level];
}
