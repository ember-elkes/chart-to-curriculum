const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const E = require('../public/engine');
const { createApp } = require('../server');
const { chart21A, chart21L, mockFetch } = require('./helpers');

const U21A = 'https://catalog.mit.edu/degree-charts/anthropology-course-21a/';
const U21L = 'https://catalog.mit.edu/degree-charts/literature-course-21l/';

async function load(url) { // real server code path, mocked network
  const app = createApp({ fetchFn: mockFetch({ charts: { [U21A]: chart21A, [U21L]: chart21L } }), dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'ccb-')) });
  const s = app.listen(0);
  try { return await fetch(`http://127.0.0.1:${s.address().port}/api/chart?url=${encodeURIComponent(url)}`).then((r) => r.json()); } finally { s.close(); }
}
const ruleByLabel = (ev, re) => ev.results.find((r) => re.test(r.rule.label));

test('21L: derived rules and live counters', async () => {
  const m = E.buildModel(await load(U21L));
  const labels = m.rules.map((r) => r.label);
  assert.ok(labels.includes('Choose 3 from Required Subjects'));
  assert.ok(labels.includes('Choose 7 from Restricted Electives'), 'select-seven row pools the Restricted Electives lists');
  assert.ok(labels.includes('No more than 3 introductory subjects'));
  assert.ok(labels.includes('At least 3 seminars'));
  assert.ok(!labels.some((l) => /take all/.test(l)), 'option lists must not become "take all" rules: ' + labels.join(' | '));

  const st = E.newState();
  let ev = E.evaluate(m, st);
  assert.equal(ev.plan.length, 0); assert.equal(ev.done, false);
  assert.equal(ruleByLabel(ev, /introductory/).ok, true, 'a max rule is satisfied by an empty plan');

  // 4 introductory + 2 seminars + 1 intermediate
  st.plan = ['21L.000', '21L.001', '21L.003', '21L.004', '21L.701', '21L.702', '21L.400'];
  ev = E.evaluate(m, st);
  const intro = ruleByLabel(ev, /introductory/);
  assert.equal(intro.have, 4); assert.equal(intro.ok, false); assert.equal(intro.over, true);
  assert.equal(ruleByLabel(ev, /seminars/).have, 2);
  assert.equal(ruleByLabel(ev, /seminars/).ok, false);
  const cim = ruleByLabel(ev, /CI-M/);
  assert.equal(cim.have, 2, 'only 21L.701 and 21L.702 carry the CI-M tag');
  assert.equal(cim.ok, true);
});

test('21L: one course can count toward several groups (pre-1900 and introductory)', async () => {
  const m = E.buildModel(await load(U21L));
  const c = m.courses.get('21L.001');
  assert.ok(c.tags.has('pre-1900') && c.tags.has('introductory'));
  assert.equal(c.title, 'Foundations of Western Literature: Homer to Dante');
});

test('21A: pick rule, fixed rule, and open slots pooled from OCW department courses', async () => {
  const m = E.buildModel(await load(U21A));
  const st = E.newState();
  st.plan = ['21A.00', '21A.01', '21A.155'];
  let ev = E.evaluate(m, st);
  assert.equal(ruleByLabel(ev, /Choose 2/).have, 2); assert.equal(ruleByLabel(ev, /Choose 2/).ok, true);
  const fixed = ruleByLabel(ev, /take all 2/);
  assert.equal(fixed.have, 1); assert.equal(fixed.ok, false);
  const slots = ruleByLabel(ev, /21A: 8 more/);
  assert.equal(slots.poolSize, 8);       // 21A courses in the OCW feed fixture
  assert.equal(slots.have, 3);           // 21A.00, 21A.01, 21A.155 are all 21A subjects on OCW
  st.plan.push('21A.802', '21A.211', '21A.212', '21A.219', '21A.157', '21A.112');
  ev = E.evaluate(m, st);
  assert.equal(ruleByLabel(ev, /take all 2/).ok, true);
  assert.equal(E.effectiveMatch(m.courses.get('21A.802'), st).status, 'title-match');
});

test('edits: change a rule, remove a rule, add a manual rule, override a match', async () => {
  const m = E.buildModel(await load(U21L));
  const st = E.newState();
  st.plan = ['21L.701'];
  const total = m.rules.find((r) => /subjects in the major/.test(r.label));
  st.rules[total.id] = { count: 12 };
  st.rules['p-intermediate-3'] = { removed: true };
  st.manualRules.push({ id: 'm1', label: 'At least 1 Shakespeare', kind: 'min', count: 1, pool: { type: 'codes', value: ['21L.009'] } });
  const ev = E.evaluate(m, st);
  assert.equal(ruleByLabel(ev, /subjects in the major/).need, 12);
  assert.equal(ruleByLabel(ev, /intermediate/), undefined);
  assert.equal(ruleByLabel(ev, /Shakespeare/).ok, false);

  const c = m.courses.get('21L.431');
  assert.equal(E.effectiveMatch(c, st).status, 'not-on-ocw');
  st.overrides['21L.431'] = { decision: 'custom', ocw: { code: '21L.435', title: 'Shakespeare, Film and Media', newest: { url: 'https://ocw.mit.edu/x/', term: 'spring', year: 2005 } } };
  assert.equal(E.effectiveMatch(c, st).status, 'custom');
});

test('exports and share link round-trip', async () => {
  const resp = await load(U21L);
  const m = E.buildModel(resp);
  const st = E.newState(); st.plan = ['21L.703', '21L.004']; st.overrides['21L.004'] = { decision: 'confirm' };
  const md = E.toMarkdown(m, st);
  assert.match(md, /- \[ \] \*\*21L\.004\*\* Reading Poetry \(12 units\): \[OCW 21L\.004, Fall 2019\]\(https:\/\/ocw\.mit\.edu\/courses\/21l-004-fall-2019\/\)/);
  assert.match(md, /21L\.703J/);
  assert.match(E.toList(m, st), /^21L\.004 {2}Reading Poetry {2}https:\/\/ocw\.mit\.edu/);
  const back = E.decodeState(E.encodeState(resp.url, st));
  assert.equal(back.url, resp.url); assert.deepEqual(back.state.plan, st.plan); assert.deepEqual(back.state.overrides, st.overrides);
  assert.equal(E.decodeState('not-valid!!'), null);
});
