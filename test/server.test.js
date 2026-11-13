const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { JSDOM } = require('jsdom');
const { parseDegreeChart } = require('../lib/parser');
const { createApp, normalizeChartUrl } = require('../server');
const { chart21A, chart21L, mockFetch } = require('./helpers');

const U21A = 'https://catalog.mit.edu/degree-charts/anthropology-course-21a/';
const U21L = 'https://catalog.mit.edu/degree-charts/literature-course-21l/';
const parse = (html) => parseDegreeChart(new JSDOM(html).window.document);

test('parser: 21A groups, pick rule, option flags, slots', () => {
  const c = parse(chart21A);
  assert.equal(c.title, 'Anthropology (Course 21A)');
  const req = c.groups.find((g) => g.title === 'Required Subjects');
  assert.equal(req.rule.count, 2);
  assert.equal(req.units, '24');
  assert.deepEqual(req.items.map((i) => [i.code, i.option]), [['21A.00', true], ['21A.01', true], ['21A.157', true], ['21A.155', false], ['21A.802', false]]);
  assert.deepEqual(req.items.filter((i) => i.tags.includes('CI-M')).map((i) => i.code), ['21A.155', '21A.802']);
  const slots = c.groups.find((g) => g.title === 'Restricted Electives').items[0];
  assert.equal(slots.type, 'slots'); assert.equal(slots.count, 8); assert.deepEqual(slots.mentionedCodes, ['21A.THT', '21A.THU']);
  assert.equal(c.totals.at(-1).units, '180');
});

test('parser: 21L-shaped chart yields every footnote rule once', () => {
  const c = parse(chart21L);
  const ids = c.suggestedRules.map((r) => r.id + ':' + r.kind + ':' + r.count);
  for (const want of ['total:min:10', 'introductory:max:3', 'intermediate:min:3', 'seminar:min:3', 'pre-1900:min:3', 'ci-m:min:2']) assert.ok(ids.includes(want), want);
  assert.deepEqual(c.groups.filter((g) => g.tag).map((g) => [g.tag, g.items.length]), [['pre-1900', 4], ['introductory', 5], ['intermediate', 5]]);
  const t = c.groups.find((g) => g.tag === 'pre-1900').items[0];
  assert.equal(t.title, 'Foundations of Western Literature: Homer to Dante'); // footnote marker stripped
});

test('url validation only allows catalog.mit.edu degree charts', () => {
  assert.equal(normalizeChartUrl('catalog.mit.edu/degree-charts/literature-course-21l'), U21L);
  assert.equal(normalizeChartUrl(U21L + '?x=1#cat-h'), U21L);
  for (const bad of ['', 'https://evil.example/degree-charts/x/', 'https://catalog.mit.edu.evil.com/degree-charts/x/', 'https://catalog.mit.edu/search/?P=21L', 'http://169.254.169.254/']) assert.throws(() => normalizeChartUrl(bad), /./, bad);
});

test('GET /api/chart: parses, matches against OCW, caches the feed on disk', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccb-'));
  const counters = {};
  const app = createApp({ fetchFn: mockFetch({ charts: { [U21A]: chart21A, [U21L]: chart21L }, counters }), dataDir });
  const server = app.listen(0); const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const a = await fetch(base + '/api/chart?url=' + encodeURIComponent(U21A)).then((r) => r.json());
    assert.equal(a.deptCode, '21A');
    const st = Object.fromEntries(a.matches.map((m) => [m.code, m.status]));
    assert.deepEqual(st, { '21A.00': 'on-ocw', '21A.01': 'on-ocw', '21A.157': 'on-ocw', '21A.155': 'on-ocw', '21A.802': 'title-match' });
    assert.equal(a.matches.find((m) => m.code === '21A.802').ocw.code, '21A.112');
    assert.equal(a.deptCourses.length, 8);

    const l = await fetch(base + '/api/chart?url=' + encodeURIComponent(U21L)).then((r) => r.json());
    const ls = Object.fromEntries(l.matches.map((m) => [m.code, m.status]));
    assert.equal(ls['21L.703'], 'on-ocw');       // [J] chart code vs OCW 21L.703J
    assert.equal(ls['21L.432'], 'on-ocw');
    assert.equal(ls['21L.003'], 'on-ocw');       // OCW title is "Reading Fiction: Imaginary Journeys", base title matches
    assert.equal(ls['21L.001'], 'not-on-ocw');
    assert.equal(counters.feed, 1, 'feed downloaded once for both charts');
    assert.ok(fs.existsSync(path.join(dataDir, 'ocw-feed.json')));

    const s = await fetch(base + '/api/ocw/search?q=shakespeare').then((r) => r.json());
    assert.deepEqual(s.results.map((x) => x.code), ['21L.009']);
    const byNum = await fetch(base + '/api/ocw/search?q=21L.432').then((r) => r.json());
    assert.equal(byNum.results[0].code, '21L.432J');

    const bad = await fetch(base + '/api/chart?url=' + encodeURIComponent('https://example.com/x')).then((r) => r.status);
    assert.equal(bad, 400);
    const missing = await fetch(base + '/api/chart?url=' + encodeURIComponent('https://catalog.mit.edu/degree-charts/nope-course-99/')).then((r) => r.status);
    assert.equal(missing, 404);
  } finally { server.close(); }

  // second app instance reuses the disk cache: no new feed download
  const counters2 = {};
  const app2 = createApp({ fetchFn: mockFetch({ charts: { [U21A]: chart21A }, counters: counters2 }), dataDir });
  const s2 = app2.listen(0);
  try {
    await fetch('http://127.0.0.1:' + s2.address().port + '/api/chart?url=' + encodeURIComponent(U21A));
    assert.equal(counters2.feed, undefined);
  } finally { s2.close(); }
});
