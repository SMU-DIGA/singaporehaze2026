import test from 'node:test';
import assert from 'node:assert/strict';
import { band, stale, safeUrl, escapeHtml, activity, readings, nearestRegion, postalCode, inSingapore, distance, nearest, flightTime, flightLinks } from '../public/lib.mjs';
test('PSI boundaries follow NEA categories, including missing data', () => {
  for (const [n, i] of [[0, 0], [50, 0], [51, 1], [100, 1], [101, 2], [200, 2], [201, 3], [300, 3], [301, 4]]) assert.equal(band(n).index, i);
  assert.equal(band(undefined).index, -1);
  assert.equal(band(NaN).label, '暂无数据');
});
test('PM2.5 uses its own bands rather than PSI thresholds', () => {
  for (const [n, i] of [[55, 0], [56, 1], [150, 1], [151, 2], [250, 2], [251, 3]]) assert.equal(band(n, 'pm25').index, i);
  assert.notEqual(band(151).label, band(151, 'pm25').label);
});
test('missing, old and future timestamps are flagged', () => {
  const now = Date.parse('2026-10-16T12:00:00+08:00');
  assert.equal(stale('2026-10-16T10:00:00+08:00', now), false);
  assert.equal(stale('2026-10-16T07:00:00+08:00', now), true);
  assert.equal(stale('2026-10-16T16:00:00+08:00', now), true);
  assert.equal(stale(null, now), true);
});
test('untrusted headlines and URLs cannot inject markup or executable links', () => {
  assert.equal(safeUrl('javascript:alert(1)'), '#');
  assert.equal(safeUrl('data:text/html,<script>'), '#');
  assert.equal(safeUrl('https://www.nea.gov.sg/'), 'https://www.nea.gov.sg/');
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});
test('advice changes for vulnerable groups and absent readings stay absent', () => {
  assert.match(activity(201, 'chronic'), /避免户外活动/);
  assert.match(activity(101, 'vulnerable'), /尽量减少/);
  assert.match(activity(NaN, 'general'), /暂不可用/);
  assert.deepEqual(readings({}, 'psi'), {});
});
test('band labels and advice are available in English', () => {
  assert.equal(band(120, 'psi', 'en').label, 'Unhealthy');
  assert.equal(band(160, 'pm25', 'en').label, 'High');
  assert.equal(band(NaN, 'psi', 'en').label, 'No data');
  assert.match(activity(201, 'chronic', 'en'), /Avoid outdoor activity/);
  assert.equal(band(120, 'psi', 'en').color, band(120).color);
});
test('AQI follows the US EPA PM2.5 table used by aqicn.org', async () => {
  const { aqiFromPm25, readings: read, history } = await import('../public/lib.mjs');
  for (const [c, aqi] of [[0, 0], [12, 50], [35.4, 100], [55.4, 150], [96, 172], [164, 214], [250.4, 300], [600, 500]]) assert.equal(aqiFromPm25(c), aqi);
  assert.ok(Number.isNaN(aqiFromPm25(undefined)));
  assert.equal(band(214, 'aqi').label, '重度污染');
  assert.equal(band(120, 'aqi', 'en').label, 'Unhealthy for sensitive groups');
  const data = { pm25: { readings: { pm25_one_hourly: { central: 164 } } }, history: { pm25: [{ timestamp: 't', values: { central: 96 } }] } };
  assert.equal(read(data, 'aqi').central, 214);
  assert.equal(history(data, 'aqi')[0].values.central, 172);
});
test('postal codes map to the closest NEA region', () => {
  assert.equal(nearestRegion(1.4289, 103.8335).id, 'north'); // Yishun
  assert.equal(nearestRegion(1.3404, 103.7090).id, 'west'); // Jurong West
  assert.equal(nearestRegion(1.3526, 103.9447).id, 'east'); // Tampines
  assert.equal(nearestRegion(1.2494, 103.8303).id, 'south'); // Sentosa
  assert.equal(nearestRegion(1.3521, 103.8198).id, 'central');
  assert.equal(postalCode(' 760 746 '), '760746');
  assert.equal(postalCode('76074'), null);
  assert.equal(postalCode('abcdef'), null);
  assert.equal(inSingapore(1.35, 103.82), true);
  assert.equal(inSingapore(1.55, 103.75), false); // Johor
});
test('nearby resources are ranked by real distance', () => {
  const yishun = { lat: 1.4289, lon: 103.8335 };
  assert.ok(Math.abs(distance(yishun, { lat: 1.4289, lon: 103.8435 }) - 1112) < 5); // 0.01° of longitude near the equator
  const items = [{ name: 'far', lat: 1.30, lon: 103.85 }, { name: 'near', lat: 1.43, lon: 103.835 }, { name: 'mid', lat: 1.40, lon: 103.83 }];
  assert.deepEqual(nearest(yishun, items, 2).map(x => x.name), ['near', 'mid']);
  assert.deepEqual(nearest(yishun, undefined), []);
});
test('flight times and search links', () => {
  assert.equal(flightTime(60), '约 1 小时');
  assert.equal(flightTime(145), '约 2 小时 25 分');
  assert.equal(flightTime(45), '约 45 分');
  assert.equal(flightTime(145, 'en'), '~2h 25m');
  assert.equal(flightTime(45, 'en'), '~45m');
  assert.equal(flightTime(0), '');
  const links = flightLinks('KUL', '2026-10-17');
  assert.match(links.trip, /dcity=sin&acity=kul&ddate=2026-10-17/);
  assert.equal(links.skyscanner, 'https://www.skyscanner.com.sg/transport/flights/sin/kul/261017/');
  assert.match(links.google, /Flights%20to%20KUL%20from%20SIN%20on%202026-10-17/);
});
