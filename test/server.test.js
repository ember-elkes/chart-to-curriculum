const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { JSDOM } = require('jsdom');
const { parseDegreeChart, parseDegreeChartTracks } = require('../lib/parser');
const { createApp, normalizeChartUrl, deptCodeOf } = require('../server');
const { chart21A, chart21L, chart24, mockFetch } = require('./helpers');
const E = require('../public/engine');

const U21A = 'https://catalog.mit.edu/degree-charts/anthropology-course-21a/';
const U21L = 'https://catalog.mit.edu/degree-charts/literature-course-21l/';
const U24 = 'https://catalog.mit.edu/degree-charts/linguistics-philosophy-course-24-2/';
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


// ---- multi-track charts (Course 24-2) ----
const dom = (html) => new JSDOM(html).window.document;

test('parser: a two-track page yields one chart per tab panel, and single-track pages still yield one', () => {
  const t = parseDegreeChartTracks(dom(chart24));
  assert.deepEqual(t.map((x) => [x.id, x.label]), [['linguistics', 'Linguistics'], ['philosophy', 'Philosophy']]);
  assert.ok(t.every((x) => x.chart.groups.some((g) => g.items.length)), 'both tracks have courses');
  assert.deepEqual(parseDegreeChartTracks(dom(chart21A)).map((x) => x.label), ['']);
  assert.ok(parseDegreeChart(dom(chart24)).groups.some((g) => g.items.length), 'even without picking a track, the page is readable');
});

test('parser: "or" rows, repeated Select rows and "coherent program" counts (24-2 Linguistics)', () => {
  const c = parseDegreeChartTracks(dom(chart24))[0].chart;
  const req = c.groups.find((g) => g.title === 'Required Subjects');
  assert.deepEqual(req.items.map((i) => [i.code, i.altOf || null, i.option]), [['24.900', null, false], ['24.9000', '24.900', false], ['24.901', null, false], ['24.918', null, false], ['24.909', null, true], ['24.910', null, true]]);
  assert.equal(req.rule.count, 1);
  const second = c.groups.find((g) => /philosophy, cognition/.test(g.title));
  assert.ok(second, 'second Select list is its own group');
  assert.deepEqual(second.items.map((i) => [i.code, i.option]), [['6.3900', true], ['24.09', true], ['24.141', true]]);
  assert.equal(second.rule.count, 1);
  const slots = c.groups.find((g) => g.title === 'Restricted Electives').items[0];
  assert.equal(slots.count, 3);
  assert.equal(parseDegreeChartTracks(dom(chart24))[1].chart.groups.find((g) => g.title === 'Restricted Electives').items[0].count, 4);
});

test('engine: "24.900 or 24.9000" is one requirement that either subject satisfies', async () => {
  const app = createApp({ fetchFn: mockFetch({ charts: { [U24]: chart24 } }), dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'ccb-')) });
  const server = app.listen(0); const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const j = await (await fetch(base + '/api/chart?url=' + encodeURIComponent(U24))).json();
    const model = E.buildModel(j);
    const all = model.rules.find((r) => /take all/.test(r.label));
    assert.equal(all.count, 3); assert.match(all.detail, /24\.900 or 24\.9000/);
    const at = (plan) => E.evaluate(model, { ...E.newState(), plan }).results.find((r) => r.rule.id === all.id);
    assert.equal(at(['24.9000', '24.901', '24.918']).ok, true, 'the "or" alternative satisfies it');
    assert.equal(at(['24.900', '24.9000', '24.901', '24.918']).have, 3, 'taking both counts once');
    assert.equal(at(['24.901', '24.918']).ok, false);
  } finally { server.close(); }
});

test('server: tracks are listed, selectable by id, and the department is 24 (not 2)', async () => {
  const app = createApp({ fetchFn: mockFetch({ charts: { [U24]: chart24 } }), dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'ccb-')) });
  const server = app.listen(0); const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const q = (extra = '') => fetch(base + '/api/chart?url=' + encodeURIComponent(U24) + extra).then((r) => r.json());
    const a = await q();
    assert.deepEqual(a.tracks, [{ id: 'linguistics', label: 'Linguistics' }, { id: 'philosophy', label: 'Philosophy' }]);
    assert.equal(a.track, 'linguistics'); assert.equal(a.deptCode, '24');
    assert.ok(a.deptCourses.length && a.deptCourses.every((c) => c.code.startsWith('24.')), 'only Course 24 subjects offered for open slots');
    assert.ok(a.matches.some((m) => m.code === '24.9000' && m.status === 'on-ocw'));
    const b = await q('&track=philosophy');
    assert.equal(b.track, 'philosophy'); assert.ok(b.chart.groups.some((g) => g.items.some((i) => i.code === '24.251')));
    assert.ok(!b.chart.groups.some((g) => g.items.some((i) => i.code === '24.909')), 'the other track is not mixed in');
    assert.equal((await q('&track=nope')).track, 'linguistics', 'unknown track falls back to the first');
  } finally { server.close(); }
});

test('deptCodeOf: track and plain course numbers', () => {
  assert.equal(deptCodeOf({ title: 'Linguistics and Philosophy (Course 24-2)' }, U24), '24');
  assert.equal(deptCodeOf({ title: 'Literature (Course 21L)' }, U21L), '21L');
  assert.equal(deptCodeOf({ title: '' }, 'https://catalog.mit.edu/degree-charts/electrical-engineering-course-6-3/'), '6');
  assert.equal(deptCodeOf({ title: '' }, U21A), '21A');
});
