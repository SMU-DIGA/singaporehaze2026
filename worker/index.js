// Sites ESM Worker. Public-source data persists in R2; Sites enforces owner-private access.
// ASSETS is injected by scripts/build.mjs. No credentials are bundled.
const API = 'https://api-open.data.gov.sg/v2/real-time/api/';
const REGION_IDS = ['north', 'south', 'east', 'west', 'central'];
const SNAPSHOT = 'haze/latest.json';
const NEA = 'https://www.nea.gov.sg/media/news/GetData/1/0/0/haze';

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
async function getSource(url, kind = 'json') {
  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'SingaporeHazeWatch/1.0' }, signal: AbortSignal.timeout(18000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return kind === 'json' ? await r.json() : await r.text();
    } catch (err) { last = err; }
  }
  throw last;
}
function valid(item, key) {
  return item && Number.isFinite(Date.parse(item.timestamp)) && REGION_IDS.every(r => typeof item.readings?.[key]?.[r] === 'number' && Number.isFinite(item.readings[key][r]) && item.readings[key][r] >= 0 && item.readings[key][r] <= 5000);
}
async function official(kind, date) {
  const params = new URLSearchParams(date ? { date } : {}), items = [], seen = new Set();
  for (let page = 0; page < 12; page++) {
    const data = await getSource(`${API}${kind}?${params}`);
    if (data.code !== 0 || !data.data?.items?.length) throw new Error('No official readings');
    items.push(...data.data.items);
    const token = data.data.paginationToken;
    if (!token || seen.has(token)) break;
    seen.add(token); params.set('paginationToken', token);
  }
  return items;
}
function unescape(text) {
  return text.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#(?:39|x27);/g, "'").replace(/&(?:nbsp|#160);/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}
async function advisories() {
  const payload = await getSource(NEA);
  const result = (payload.Data || []).filter(n => /haze/i.test(n.Title || '')).map(n => {
    const time = Number((n.DateOfArticle || '').match(/\d{10,}/)?.[0]);
    return { title: unescape(n.Title), url: `https://www.nea.gov.sg/media/news/${n.NewsOrAdvisory === 'Advisory' ? 'advisories' : 'news'}/index/${encodeURIComponent(n.UrlName)}`, source: 'NEA', publishedAt: Number.isFinite(time) && time > 0 ? new Date(time).toISOString() : null, category: 'government' };
  });
  if (!result.length) throw new Error('No official advisories');
  return result;
}
async function news() {
  const markup = await getSource('https://www.channelnewsasia.com/topic/haze', 'text');
  const items = [], seen = new Set();
  for (const match of markup.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = new URL(match[1], 'https://www.channelnewsasia.com');
    const title = unescape(match[2]);
    if (href.hostname !== 'www.channelnewsasia.com' || !/-\d{5,}$/.test(href.pathname) || !/haze/i.test(title + href.pathname) || title.length < 18 || seen.has(href.href)) continue;
    seen.add(href.href);
    items.push({ title: title.replace(/^\s*(Singapore|Asia|News)\s+/i, '').slice(0, 220), url: href.href, source: 'CNA', publishedAt: null, category: href.pathname.startsWith('/asia/') ? 'regional' : 'singapore' });
  }
  if (!items.length) throw new Error('No news headlines');
  return items.slice(0, 24);
}
async function snapshot(env) {
  const object = await env.BUCKET?.get(SNAPSHOT);
  if (object) return object.json();
  return JSON.parse(ASSETS['/data/latest.json'].body);
}
async function refresh(env) {
  if (!env.BUCKET) return json({ error: 'Persistent storage unavailable' }, 503);
  const previous = await snapshot(env);
  const now = new Date();
  // Idempotent refresh: do not hammer upstreams or overwrite a concurrent fresh snapshot.
  if (previous.persistedAt && Date.now() - Date.parse(previous.generatedAt) < 5 * 60000) return json({ ok: true, unchanged: true, generatedAt: previous.generatedAt, persistedAt: previous.persistedAt });
  const next = { ...previous, sources: {}, errors: [] };
  const jobs = [
    ['psi', async () => { const list = await official('psi'); const item = list.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0]; if (!valid(item, 'psi_twenty_four_hourly')) throw new Error('Invalid PSI'); return item; }],
    ['pm25', async () => { const list = await official('pm25'); const item = list.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0]; if (!valid(item, 'pm25_one_hourly')) throw new Error('Invalid PM2.5'); return item; }],
    ['advisories', advisories], ['cna', news],
  ];
  const histories = { psi: [], pm25: [] };
  for (let offset = 0; offset < 3; offset++) {
    const date = new Date(+now + 8 * 3600000 - offset * 86400000).toISOString().slice(0, 10);
    for (const kind of ['psi', 'pm25']) jobs.push([`history_${kind}_${date}`, async () => { const items = await official(kind, date); histories[kind].push(...items); return true; }]);
  }
  // Four requests at a time keeps within upstream limits and Worker subrequest limits.
  for (let offset = 0; offset < jobs.length; offset += 4) await Promise.all(jobs.slice(offset, offset + 4).map(async ([key, fn]) => {
    try { const value = await fn(); if (!key.startsWith('history_')) next[key === 'cna' ? 'news' : key] = value; next.sources[key] = { ok: true, checkedAt: now.toISOString() }; }
    catch (err) { next.sources[key] = { ok: false, checkedAt: now.toISOString(), error: err.message }; next.errors.push(key); }
  }));
  next.sources.news = next.sources.cna;
  next.history = {};
  for (const kind of ['psi', 'pm25']) {
    const key = kind === 'psi' ? 'psi_twenty_four_hourly' : 'pm25_one_hourly';
    const points = new Map((previous.history?.[kind] || []).map(p => [p.timestamp, p]));
    for (const item of histories[kind]) if (valid(item, key)) points.set(item.timestamp, { timestamp: item.timestamp, values: item.readings[key] });
    next.history[kind] = [...points.values()].filter(p => Date.parse(p.timestamp) >= +now - 72 * 3600000).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  }
  const nextRun = new Date(now); nextRun.setUTCMinutes(17, 0, 0);
  while (+nextRun <= +now || (nextRun.getUTCHours() + 8) % 3 !== 0) nextRun.setUTCHours(nextRun.getUTCHours() + 1);
  next.generatedAt = now.toISOString(); next.nextUpdateAt = nextRun.toISOString(); next.schemaVersion = 1; next.persistedAt = new Date().toISOString();
  await env.BUCKET.put(SNAPSHOT, JSON.stringify(next), { httpMetadata: { contentType: 'application/json' } });
  return json({ ok: !!next.sources.psi?.ok && !!next.sources.pm25?.ok, generatedAt: next.generatedAt, persistedAt: next.persistedAt, errors: next.errors, newsCount: next.news?.length || 0, advisoryCount: next.advisories?.length || 0 }, next.sources.psi?.ok && next.sources.pm25?.ok ? 200 : 502);
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url), path = url.pathname;
    try {
      if (path === '/api/data' && request.method === 'GET') return json(await snapshot(env));
      if (path === '/api/refresh') {
        if (request.method !== 'POST') return json({ error: 'Use POST' }, 405);
        // Site must remain owner-private. Sites dispatch authorizes owner or service access before this Worker.
        return await refresh(env);
      }
      if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'Method not allowed' }, 405);
      const asset = ASSETS[path === '/' ? '/index.html' : path];
      if (!asset) return new Response('Not found', { status: 404 });
      return new Response(request.method === 'HEAD' ? null : asset.body, { headers: { 'Content-Type': asset.type, 'Cache-Control': path.endsWith('.json') || path === '/' ? 'no-cache' : 'public, max-age=300', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' } });
    } catch { return json({ error: 'Source temporarily unavailable; please retry' }, 503); }
  },
};
