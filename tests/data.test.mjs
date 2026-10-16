import test from 'node:test';
import assert from 'node:assert/strict';
import { band, stale, safeUrl, escapeHtml, activity, readings } from '../public/lib.mjs';
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
