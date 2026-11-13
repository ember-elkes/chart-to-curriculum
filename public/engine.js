// Requirements engine: runs in the browser and in Node tests (no DOM, no network).
//   buildModel(apiResponse)         -> courses, derived rules, filter facets
//   evaluate(model, state)          -> live counters for a plan
//   state = { plan: [keys], overrides: {key: {decision, ocw}}, rules: {id: edits}, manualRules: [rule] }
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CurriculumEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const canon = (c) => String(c).toUpperCase().replace(/J$/, '');
  const NUMWORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const TAG_NAMES = {
    introductory: 'Introductory subjects', intermediate: 'Intermediate subjects', 'pre-1900': 'Pre-1900 texts',
    'ci-m': 'Communication-intensive (CI-M)', 'ci-h': 'Communication-intensive (CI-H)', 'pick-option': 'Required-subject choices', seminar: 'Seminars',
  };

  // ---------- model ----------
  function buildModel(resp) {
    const { chart, matches = [], deptCode = null, deptCourses = [] } = resp;
    const matchByKey = new Map();
    matches.forEach((m) => { const k = canon(m.code); if (!matchByKey.has(k)) matchByKey.set(k, m); });

    const courses = new Map();
    chart.groups.forEach((g, gi) => {
      const hasPick = !!(g.rule && g.rule.type === 'pick');
      g.items.forEach((it) => {
        if (it.type !== 'course') return;
        const k = canon(it.code);
        let c = courses.get(k);
        if (!c) {
          const m = matchByKey.get(k);
          c = { key: k, code: it.code, title: it.title, units: it.units || null, joint: it.joint, tags: new Set(), sections: new Set(), match: m ? { status: m.status, ocw: m.ocw } : { status: 'not-on-ocw', ocw: null }, source: 'chart' };
          courses.set(k, c);
        }
        (it.tags || []).forEach((t) => c.tags.add(t.toLowerCase()));
        if (g.tag) c.tags.add(g.tag);
        if (hasPick && it.option) c.tags.add('pick-option');
        if (!c.units && it.units) c.units = it.units;
        c.sections.add(g.section);
      });
    });
    // OCW courses in the chart's own department, usable for open slots ("Eight anthropology subjects")
    deptCourses.forEach((oc) => {
      const k = canon(oc.code);
      let c = courses.get(k);
      if (!c) { c = { key: k, code: oc.code, title: oc.title, units: null, joint: /J$/.test(oc.code), tags: new Set(), sections: new Set(), match: { status: 'on-ocw', ocw: oc }, source: 'ocw' }; courses.set(k, c); }
      c.tags.add('dept-pool');
    });

    const rules = deriveRules(chart, deptCode);
    return { title: chart.title, url: resp.url, deptCode, chart, courses, rules, facets: buildFacets(courses, deptCode), needsReview: chart.needsReview || [] };
  }

  const n2w = (n) => (n >= 0 && n < NUMWORD.length ? n : n);

  function deriveRules(chart, deptCode) {
    const rules = [];
    const sectionsHave = (title) => chart.groups.some((g) => g.section.split(' > ').slice(1).includes(title) && g.items.some((i) => i.type === 'course'));
    chart.groups.forEach((g, gi) => {
      if (g.kind === 'summary') return;
      const courses = g.items.filter((i) => i.type === 'course');
      const pick = g.rule && g.rule.type === 'pick' ? g.rule : null;
      if (pick && pick.count) {
        const opts = courses.filter((i) => i.option);
        if (opts.length) {
          rules.push({ id: `g${gi}-pick`, source: 'chart', label: `Choose ${pick.count} from ${g.title || 'the list'}`, detail: pick.text, kind: 'min', count: pick.count, pool: { type: 'codes', value: opts.map((i) => canon(i.code)) } });
        } else if (g.title && sectionsHave(g.title)) {
          rules.push({ id: `g${gi}-pick`, source: 'chart', label: `Choose ${pick.count} from ${g.title}`, detail: pick.text, kind: 'min', count: pick.count, pool: { type: 'section', value: g.title } });
        } else {
          rules.push({ id: `g${gi}-pick`, source: 'chart', label: `Choose ${pick.count}: ${g.title || pick.text}`, detail: pick.text, kind: 'min', count: pick.count, pool: { type: 'all' } });
        }
      }
      const fixed = courses.filter((i) => !i.option);
      // Only table groups under an explicit area header ("Required Subjects") are required lists.
      // Section lists ("Introductory Subjects", "Subjects focusing on pre-1900 texts") are pools of options, not requirements.
      if (fixed.length && g.kind === 'requirement' && !g.tag) {
        rules.push({ id: `g${gi}-all`, source: 'chart', label: `${g.title || 'Required'}: take all ${fixed.length}`, detail: fixed.map((i) => i.code).join(', '), kind: 'all', count: fixed.length, pool: { type: 'codes', value: fixed.map((i) => canon(i.code)) } });
      }
      g.items.filter((i) => i.type === 'slots' && i.count).forEach((it, si) => {
        rules.push({ id: `g${gi}-slots${si}`, source: 'chart', label: `${deptCode ? deptCode + ': ' : ''}${it.count} more subjects`, detail: it.text, kind: 'min', count: it.count, pool: deptCode ? { type: 'dept', value: deptCode } : { type: 'all' } });
      });
    });

    const seen = new Set();
    (chart.suggestedRules || []).forEach((s) => {
      const key = [s.id, s.kind, s.count].join(':');
      if (seen.has(key)) return; seen.add(key);
      const map = {
        total: { label: `At least ${s.count} subjects in the major`, pool: { type: 'all' } },
        introductory: { label: `No more than ${s.count} introductory subjects`, pool: { type: 'tag', value: 'introductory' } },
        intermediate: { label: `At least ${s.count} intermediate subjects`, pool: { type: 'tag', value: 'intermediate' } },
        seminar: { label: `At least ${s.count} seminars`, pool: { type: 'tag', value: 'pick-option' } },
        'pre-1900': { label: `At least ${s.count} subjects on pre-1900 texts`, pool: { type: 'tag', value: 'pre-1900' } },
        'ci-m': { label: `At least ${s.count} communication-intensive (CI-M) subjects`, pool: { type: 'tag', value: 'ci-m' } },
      }[s.id];
      if (!map) return;
      rules.push({ id: `p-${s.id}-${s.count}`, source: 'footnote', label: map.label, detail: s.text, kind: s.kind, count: s.count, pool: map.pool, unconfirmed: true });
    });
    return rules;
  }

  function buildFacets(courses, deptCode) {
    const tags = new Map(), sections = new Map();
    courses.forEach((c) => {
      c.tags.forEach((t) => tags.set(t, (tags.get(t) || 0) + 1));
      c.sections.forEach((s) => { const part = s.split(' > ')[1]; if (part) sections.set(part, (sections.get(part) || 0) + 1); });
    });
    const out = [];
    tags.forEach((n, t) => out.push({ id: 'tag:' + t, label: t === 'dept-pool' ? `All ${deptCode || 'department'} subjects on OCW` : (TAG_NAMES[t] || t), pool: { type: t === 'dept-pool' ? 'dept' : 'tag', value: t === 'dept-pool' ? deptCode : t }, count: n }));
    sections.forEach((n, s) => out.push({ id: 'section:' + s, label: s, pool: { type: 'section', value: s }, count: n }));
    return out;
  }

  // ---------- state helpers ----------
  const newState = () => ({ plan: [], overrides: {}, rules: {}, manualRules: [] });

  function effectiveMatch(course, state) {
    const o = state.overrides[course.key];
    if (!o) return course.match;
    if (o.decision === 'reject') return { status: 'not-on-ocw', ocw: null };
    if (o.decision === 'confirm') return { status: 'confirmed', ocw: course.match.ocw };
    if (o.decision === 'custom') return { status: 'custom', ocw: o.ocw };
    return course.match;
  }
  const needsReview = (m) => m.status === 'number-reused' || m.status === 'ambiguous';
  const onOcw = (m) => m.status !== 'not-on-ocw';

  function effectiveRules(model, state) {
    const base = model.rules.filter((r) => !(state.rules[r.id] && state.rules[r.id].removed)).map((r) => {
      const e = state.rules[r.id] || {};
      return { ...r, count: e.count != null ? e.count : r.count, kind: e.kind || r.kind, pool: e.pool || r.pool, edited: !!state.rules[r.id], unconfirmed: e.confirmed ? false : r.unconfirmed };
    });
    return base.concat(state.manualRules.map((r) => ({ ...r, source: 'manual', edited: true })));
  }

  function members(rule, model) {
    const out = [];
    model.courses.forEach((c) => {
      const p = rule.pool; let hit = false;
      if (p.type === 'all') hit = true;
      else if (p.type === 'codes') hit = p.value.includes(c.key);
      else if (p.type === 'tag') hit = c.tags.has(p.value);
      else if (p.type === 'section') hit = [...c.sections].some((s) => s.split(' > ').includes(p.value));
      else if (p.type === 'dept') hit = c.tags.has('dept-pool') && (!p.value || c.code.toUpperCase().startsWith(p.value.toUpperCase() + '.'));
      if (hit) out.push(c.key);
    });
    return out;
  }

  // ---------- evaluation ----------
  function evaluate(model, state) {
    const planKeys = state.plan.filter((k) => model.courses.has(k));
    const plan = planKeys.map((k) => model.courses.get(k));
    const planSet = new Set(planKeys);
    const results = effectiveRules(model, state).map((rule) => {
      const pool = members(rule, model);
      const mine = pool.filter((k) => planSet.has(k));
      const need = rule.kind === 'all' ? pool.length : rule.count;
      const have = mine.length;
      const ok = rule.kind === 'max' ? have <= need : have >= need;
      return { rule, pool, mine, have, need, ok, over: rule.kind === 'max' ? have > need : rule.kind === 'all' ? false : false, poolSize: pool.length };
    });
    let units = 0, unknown = 0;
    plan.forEach((c) => { const u = parseInt(c.units, 10); if (u) units += u; else unknown++; });
    return { results, plan, units, unknownUnits: unknown, done: results.length > 0 && results.every((r) => r.ok) && planKeys.length > 0, open: results.filter((r) => !r.ok).length };
  }

  // ---------- export ----------
  function ocwLine(c, state) {
    const m = effectiveMatch(c, state), o = m.ocw;
    if (!o) return 'not on OCW';
    const run = o.newest ? `${cap(o.newest.term)} ${o.newest.year}` : '';
    return `[OCW ${o.code}${run ? ', ' + run : ''}](${o.newest ? o.newest.url : ''})${needsReview(m) ? ' (check match)' : ''}`;
  }
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
  const byCode = (a, b) => a.code.localeCompare(b.code, undefined, { numeric: true });

  function toMarkdown(model, state) {
    const ev = evaluate(model, state);
    const lines = [`# ${model.title}: my OpenCourseWare plan`, '', `Degree chart: ${model.url}`, '', '## Requirements'];
    ev.results.forEach((r) => lines.push(`- [${r.ok ? 'x' : ' '}] ${r.rule.label} (${r.have}${r.rule.kind === 'max' ? ' of at most ' : ' of '}${r.need})`));
    lines.push('', '## Courses');
    ev.plan.slice().sort(byCode).forEach((c) => lines.push(`- [ ] **${c.code}** ${c.title}${c.units ? ` (${c.units} units)` : ''}: ${ocwLine(c, state)}`));
    lines.push('', `${ev.plan.length} subjects${ev.units ? `, ${ev.units}${ev.unknownUnits ? '+' : ''} units` : ''}.`);
    return lines.join('\n');
  }

  function toList(model, state) {
    const ev = evaluate(model, state);
    return ev.plan.slice().sort(byCode).map((c) => {
      const o = effectiveMatch(c, state).ocw;
      return `${c.code}  ${c.title}${o && o.newest ? '  ' + o.newest.url : ''}`;
    }).join('\n');
  }

  // ---------- share link ----------
  function encodeState(url, state) {
    const json = JSON.stringify({ u: url, p: state.plan, o: state.overrides, r: state.rules, m: state.manualRules });
    const b64 = typeof Buffer !== 'undefined' ? Buffer.from(json, 'utf8').toString('base64') : btoa(unescape(encodeURIComponent(json)));
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decodeState(str) {
    try {
      const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
      const json = typeof Buffer !== 'undefined' ? Buffer.from(b64, 'base64').toString('utf8') : decodeURIComponent(escape(atob(b64)));
      const d = JSON.parse(json);
      return { url: d.u, state: { plan: d.p || [], overrides: d.o || {}, rules: d.r || {}, manualRules: d.m || [] } };
    } catch { return null; }
  }

  return { canon, buildModel, newState, evaluate, effectiveMatch, effectiveRules, members, needsReview, onOcw, toMarkdown, toList, encodeState, decodeState, TAG_NAMES };
});
