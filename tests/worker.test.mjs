import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
const regions = ['north', 'south', 'east', 'west', 'central'];
const reading = (key, value) => ({ timestamp: new Date().toISOString(), readings: { [key]: Object.fromEntries(regions.map(r => [r, value])) } });
function bucket() {
  let saved;
  return { async get() { return saved ? { json: async () => JSON.parse(saved) } : null; }, async put(key, body) { assert.equal(key, 'haze/latest.json'); saved = body; } };
}
function sources(failPm = false) {
  return async url => {
    if (url.includes('/pm25')) return Response.json(failPm ? { code: 1 } : { code: 0, data: { items: [reading('pm25_one_hourly', 160)] } });
    if (url.includes('/psi')) return Response.json({ code: 0, data: { items: [reading('psi_twenty_four_hourly', 220)] } });
    if (url.includes('nea.gov.sg')) return Response.json({ Data: [{ Title: 'Haze Situation Update', UrlName: 'haze-update', NewsOrAdvisory: 'Advisory', DateOfArticle: '/Date(1792059540000)/' }] });
    return new Response('<a href="/singapore/singapore-haze-update-123456">Singapore haze: latest air quality update</a>');
  };
}
test('unattended refresh persists a snapshot that a new request reads back', async () => {
  globalThis.ASSETS = { '/data/latest.json': { body: JSON.stringify({ schemaVersion: 1, history: {} }) } };
  const original = globalThis.fetch; globalThis.fetch = sources();
  const env = { BUCKET: bucket() };
  try {
    const write = await worker.fetch(new Request('https://test/api/refresh', { method: 'POST' }), env);
    assert.equal(write.status, 200);
    const result = await write.json();
    const read = await (await worker.fetch(new Request('https://test/api/data'), env)).json();
    assert.equal(read.persistedAt, result.persistedAt);
    assert.equal(read.psi.readings.psi_twenty_four_hourly.central, 220);
    assert.equal(read.advisories.length, 1);
    assert.equal(read.news[0].title, 'Singapore haze: latest air quality update');
    const repeat = await (await worker.fetch(new Request('https://test/api/refresh', { method: 'POST' }), env)).json();
    assert.equal(repeat.unchanged, true);
  } finally { globalThis.fetch = original; }
});
test('failed official source preserves last good data and reports failure', async () => {
  const old = reading('pm25_one_hourly', 80);
  globalThis.ASSETS = { '/data/latest.json': { body: JSON.stringify({ schemaVersion: 1, pm25: old, history: {} }) } };
  const original = globalThis.fetch; globalThis.fetch = sources(true);
  const env = { BUCKET: bucket() };
  try {
    const write = await worker.fetch(new Request('https://test/api/refresh', { method: 'POST' }), env);
    assert.equal(write.status, 502);
    const read = await (await worker.fetch(new Request('https://test/api/data'), env)).json();
    assert.deepEqual(read.pm25, old);
    assert.equal(read.sources.pm25.ok, false);
    assert.ok(read.errors.includes('pm25'));
  } finally { globalThis.fetch = original; }
});
test('refresh rejects GET and does not claim persistence without storage', async () => {
  assert.equal((await worker.fetch(new Request('https://test/api/refresh'), {})).status, 405);
  assert.equal((await worker.fetch(new Request('https://test/api/refresh', { method: 'POST' }), {})).status, 503);
});
