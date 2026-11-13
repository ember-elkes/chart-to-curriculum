// OCW course index + matcher against a parsed degree chart (see parser.js).
// Source: MIT Open Learning's public feed of OCW courses (real titles, primary AND cross-listed course numbers, run term/level).
// Pure JS, no dependencies: runs in Node 18+ and in a browser.
const FEED = 'https://api.learn.mit.edu/api/v1/learning_resources/?platform=ocw&resource_type=course&limit=100';

// Charts write joint subjects as 21L.601[J]; OCW lists 21L.601J. Compare on the number without the trailing J.
const canon = (code) => String(code).toUpperCase().replace(/J$/, '');

function normTitle(t) {
  return String(t || '').toLowerCase().replace(/\((ci-[hm])\)/g, ' ').replace(/['’]/g, '').replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

// Download every OCW course resource (about 2,500; ~26 pages of 100). Cache the result: it changes rarely.
async function fetchAllOcw(fetchFn = fetch, maxPages = 80) {
  const all = [];
  let url = FEED;
  for (let i = 0; url && i < maxPages; i++) {
    const j = await fetchFn(url, { headers: { Accept: 'application/json' } }).then((r) => r.json());
    all.push(...j.results);
    url = j.next;
  }
  return all;
}

// resources: array from the feed. One resource = one OCW run of a course.
// Returns { courses, byCode: Map(canon number -> course), byTitle: Map(normalized title -> [course]) }
function buildIndex(resources) {
  const byCode = new Map(), byTitle = new Map(), courses = [];
  resources.forEach((r) => {
    const nums = (r.course && r.course.course_numbers) || [];
    if (!nums.length) return;
    const primary = (nums.find((n) => n.listing_type === 'primary') || nums[0]).value;
    const run0 = (r.runs && r.runs[0]) || {};
    const run = {
      title: r.title, url: r.url, term: run0.semester ? String(run0.semester).toLowerCase() : null, year: run0.year || null,
      level: (run0.level || []).map((l) => l.code || l.name || l).join(','), numbers: nums.map((n) => n.value), topics: (r.topics || []).map((t) => t.name),
    };
    // A course is every run sharing a primary number; its other numbers (cross-listings) are lookup keys too.
    let c = byCode.get(canon(primary));
    if (!c) { c = { code: primary, dept: primary.split('.')[0].toUpperCase(), numbers: new Set(), runs: [] }; courses.push(c); }
    c.runs.push(run);
    nums.forEach((n) => { c.numbers.add(n.value); if (!byCode.has(canon(n.value))) byCode.set(canon(n.value), c); });
  });
  const rank = { spring: 3, fall: 2, summer: 1, iap: 0 };
  courses.forEach((c) => {
    c.runs.sort((a, b) => (b.year || 0) - (a.year || 0) || (rank[b.term] || 0) - (rank[a.term] || 0));
    c.title = c.runs[0].title;
    c.numbers = [...c.numbers];
    const keys = new Set();
    c.runs.forEach((r) => { keys.add(normTitle(r.title)); keys.add(normTitle(r.title.split(':')[0])); }); // topic subtitles ("Reading Fiction: Imaginary Journeys")
    keys.forEach((k) => { if (!byTitle.has(k)) byTitle.set(k, []); byTitle.get(k).push(c); });
  });
  return { courses, byCode, byTitle };
}

const view = (c) => ({ code: c.code, numbers: c.numbers, title: c.title, newest: { url: c.runs[0].url, term: c.runs[0].term, year: c.runs[0].year, level: c.runs[0].level }, otherRuns: c.runs.slice(1).map((r) => r.term + ' ' + r.year) });

// Match every course row in a parsed chart to OCW.
//  status: 'on-ocw' (number matches, incl. cross-listed numbers) | 'title-match' (renumbered) | 'ambiguous' | 'not-on-ocw'
const STOP = new Set(['a', 'an', 'and', 'of', 'the', 'to', 'in', 'on', 'for', 'with', 'from']);
const words = (t) => new Set(normTitle(t).split(' ').filter((w) => w && !STOP.has(w)));
function similarity(a, b) { // overlap coefficient of content words, 0..1
  const A = words(a), B = words(b); if (!A.size || !B.size) return 0;
  let n = 0; A.forEach((w) => B.has(w) && n++);
  return n / Math.min(A.size, B.size);
}
// MIT reuses course numbers over the years, so a number match is only trusted if some OCW run's title (or its pre-colon base) resembles the chart title.
const bestSim = (c, title) => Math.max(...c.runs.map((r) => Math.max(similarity(title, r.title), similarity(title, r.title.split(':')[0]))));

// status: 'on-ocw' | 'title-match' (renumbered) | 'number-reused' (OCW's same number is a different subject; review) | 'ambiguous' | 'not-on-ocw'
function matchChart(chart, index) {
  const out = [];
  chart.groups.forEach((g) => g.items.forEach((it) => {
    if (it.type !== 'course') return;
    const numberHit = index.byCode.get(canon(it.code));
    let c = null, status = null;
    if (numberHit && bestSim(numberHit, it.title) >= 0.6) { c = numberHit; status = 'on-ocw'; }
    else {
      const cand = [...new Set(index.byTitle.get(normTitle(it.title)) || [])];
      const dept = it.code.split('.')[0].toUpperCase();
      const same = cand.filter((x) => x.dept === dept);
      if (cand.length === 1) { c = cand[0]; status = 'title-match'; }
      else if (same.length === 1) { c = same[0]; status = 'title-match'; }
      else if (cand.length > 1) status = 'ambiguous';
      else if (numberHit) { c = numberHit; status = 'number-reused'; }
      else status = 'not-on-ocw';
    }
    out.push({ group: g.title || g.section, tag: g.tag, code: it.code, title: it.title, status, ocw: c ? view(c) : null });
  }));
  return out;
}

// Suggestions for open slots / unmatched rows: same department, optional number window, optional keywords.
function suggest(index, { dept, min = 0, max = Infinity, keywords = [], limit = 12 }) {
  const kw = keywords.map((k) => k.toLowerCase());
  return index.courses.filter((c) => {
    if (dept && c.dept !== dept.toUpperCase()) return false;
    const n = parseInt((c.code.split('.')[1] || '').replace(/\D/g, ''), 10);
    if (!isNaN(n) && (n < min || n > max)) return false;
    return !kw.length || kw.some((k) => normTitle(c.title).includes(k));
  }).slice(0, limit).map(view);
}

// Keep only what the index needs, so the on-disk cache stays small (~1 MB instead of ~30 MB).
function slimResource(r) {
  return {
    title: r.title, url: r.url,
    topics: (r.topics || []).map((t) => t.name || t).slice(0, 6),
    runs: (r.runs || []).slice(0, 1).map((u) => ({ semester: u.semester, year: u.year, level: (u.level || []).map((l) => ({ code: l.code || l.name || l })) })),
    course: { course_numbers: ((r.course && r.course.course_numbers) || []).map((n) => ({ value: n.value, listing_type: n.listing_type })) },
  };
}

// Free-text search over OCW courses by number or title (used by the match editor).
function search(index, q, { dept, limit = 15 } = {}) {
  const raw = String(q || '').trim(); if (!raw) return [];
  const up = raw.toUpperCase().replace(/J$/, ''), nt = normTitle(raw), ws = nt.split(' ').filter(Boolean);
  const scored = [];
  index.courses.forEach((c) => {
    if (dept && c.dept !== dept.toUpperCase()) return;
    const title = normTitle(c.runs.map((r) => r.title).join(' '));
    let s = 0;
    if (c.numbers.some((n) => canon(n) === up)) s = 5;
    else if (c.numbers.some((n) => canon(n).startsWith(up))) s = 4;
    else if (title.includes(nt)) s = 3;
    else if (ws.length > 1 && ws.every((w) => title.includes(w))) s = 2;
    else if (ws.length === 1 && title.includes(ws[0])) s = 1;
    if (s) scored.push([s, c]);
  });
  scored.sort((a, b) => b[0] - a[0] || a[1].code.localeCompare(b[1].code, undefined, { numeric: true }));
  return scored.slice(0, limit).map(([, c]) => view(c));
}

if (typeof module !== 'undefined') module.exports = { FEED, fetchAllOcw, slimResource, buildIndex, matchChart, suggest, search, view, normTitle, canon };
