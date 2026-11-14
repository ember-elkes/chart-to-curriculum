// Chart-to-curriculum server.
//   GET /api/chart?url=<catalog.mit.edu degree chart>  -> parsed requirements + OCW matches
//   GET /api/ocw/search?q=&dept=                        -> search OCW courses (match editor)
//   GET /api/status                                     -> OCW index state
// The OCW course list comes from MIT Open Learning's public feed, is cached on disk, and refreshes weekly.
const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const { JSDOM } = require('jsdom');
const { parseDegreeChartTracks } = require('./lib/parser');
const ocw = require('./lib/ocw');

const WEEK = 7 * 24 * 3600 * 1000;

// Only MIT catalog degree charts are fetched, so the server can't be used to request arbitrary URLs.
function normalizeChartUrl(input) {
  let s = String(input || '').trim();
  if (!s) throw httpError(400, 'Paste the address of a degree chart.');
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  let u;
  try { u = new URL(s); } catch { throw httpError(400, 'That doesn\'t look like a web address.'); }
  const okPath = /^\/degree-charts\/[a-z0-9-]+\/?$/i.test(u.pathname);
  if (u.hostname !== 'catalog.mit.edu' || !okPath) {
    throw httpError(400, 'Use a degree chart from catalog.mit.edu, for example https://catalog.mit.edu/degree-charts/literature-course-21l/');
  }
  return 'https://catalog.mit.edu' + u.pathname.replace(/\/?$/, '/');
}

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

function deptCodeOf(chart, url) {
  // "Course 21L", "Course 24-2" (a track of Course 24), "course-6-3" -> department is the part before any "-<digit>"
  const m = (chart.title || '').match(/Course\s+([0-9A-Za-z]+?)(?:-\d+)?\)/) || url.match(/course-([0-9a-z]+?)(?:-\d+)?\/?$/i);
  if (m) return m[1].toUpperCase();
  // Graduate charts ("sm-linguistics") name no course number: use the most common prefix among the chart's own subjects
  const counts = {};
  chart.groups.forEach((g) => g.items.forEach((i) => { const p = i.type === 'course' && String(i.code).split('.')[0]; if (p) counts[p] = (counts[p] || 0) + 1; }));
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0].toUpperCase() : null;
}

function createApp({ fetchFn = fetch, dataDir = process.env.DATA_DIR || path.join(__dirname, 'data'), now = Date.now, rateLimit = 40 } = {}) {
  const app = express();
  app.disable('x-powered-by');

  // ---- OCW index: disk cache -> memory ----
  let indexPromise = null;
  const meta = { state: 'idle', courses: 0, updated: null, error: null };

  async function loadIndex() {
    const file = path.join(dataDir, 'ocw-feed.json');
    let cached = null;
    try { cached = JSON.parse(await fs.readFile(file, 'utf8')); } catch { /* no cache yet */ }
    let resources = cached && cached.resources, updated = cached && cached.updated;
    if (!cached || now() - cached.updated > WEEK) {
      meta.state = 'downloading';
      try {
        resources = (await ocw.fetchAllOcw(fetchFn)).map(ocw.slimResource);
        updated = now();
        await fs.mkdir(dataDir, { recursive: true });
        await fs.writeFile(file, JSON.stringify({ updated, resources }));
      } catch (e) {
        if (!cached) { meta.state = 'error'; meta.error = e.message; throw e; }
        // Stale cache is better than no index.
      }
    }
    const index = ocw.buildIndex(resources);
    Object.assign(meta, { state: 'ready', courses: index.courses.length, updated, error: null });
    return index;
  }
  const getIndex = () => (indexPromise ||= loadIndex().catch((e) => { indexPromise = null; throw e; }));

  // ---- chart fetch + parse, cached for an hour ----
  const chartCache = new Map();
  async function getChart(url) {
    const hit = chartCache.get(url);
    if (hit && now() - hit.at < 3600e3) return hit.tracks;
    const res = await fetchFn(url, { headers: { 'User-Agent': 'chart-to-curriculum/1.0 (personal study tool)' }, signal: AbortSignal.timeout(15000) }).catch(() => null);
    if (!res) throw httpError(502, 'Couldn\'t reach catalog.mit.edu. Try again in a minute.');
    if (res.status === 404) throw httpError(404, 'That degree chart doesn\'t exist. Check the address.');
    if (!res.ok) throw httpError(502, 'catalog.mit.edu answered with an error (' + res.status + ').');
    const html = await res.text();
    if (html.length > 3e6) throw httpError(422, 'That page is too large to be a degree chart.');
    const doc = new JSDOM(html).window.document;
    const tracks = parseDegreeChartTracks(doc).filter((t) => t.chart.groups.some((g) => g.items.length));
    if (!tracks.length) throw httpError(422, 'That page doesn\'t contain a degree chart table we can read.');
    chartCache.set(url, { at: now(), tracks });
    return tracks;
  }

  // ---- tiny per-IP rate limit on the API ----
  const hits = new Map();
  app.use('/api', (req, res, next) => {
    const k = req.ip, t = now(), w = (hits.get(k) || []).filter((x) => t - x < 60e3);
    if (w.length >= rateLimit) return res.status(429).json({ error: 'Too many requests. Wait a minute and try again.' });
    w.push(t); hits.set(k, w); next();
  });

  app.get('/api/status', (req, res) => res.json({ index: meta }));

  app.get('/api/chart', async (req, res) => {
    try {
      const url = normalizeChartUrl(req.query.url);
      const [tracks, index] = await Promise.all([getChart(url), getIndex().catch(() => { throw httpError(503, 'The OpenCourseWare course list isn\'t available yet. Try again shortly.'); })]);
      const picked = tracks.find((t) => t.id === req.query.track) || tracks[0];
      const chart = picked.chart;
      const deptCode = deptCodeOf(chart, url);
      const deptCourses = deptCode ? index.courses.filter((c) => c.dept === deptCode).map(ocw.view) : [];
      res.json({ url, tracks: tracks.map((t) => ({ id: t.id, label: t.label })), track: picked.id, chart, matches: ocw.matchChart(chart, index), deptCode, deptCourses, ocwUpdated: meta.updated });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.status ? e.message : 'Something went wrong reading that chart.' });
      if (!e.status) console.error(e);
    }
  });

  app.get('/api/ocw/search', async (req, res) => {
    try {
      const index = await getIndex();
      res.json({ results: ocw.search(index, req.query.q, { dept: req.query.dept, limit: Math.min(+req.query.limit || 12, 30) }) });
    } catch (e) { res.status(503).json({ error: 'The OpenCourseWare course list isn\'t available yet.' }); }
  });

  app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
  app.warmUp = () => getIndex().catch((e) => console.error('OCW index failed:', e.message));
  app.meta = meta;
  return app;
}

if (require.main === module) {
  const app = createApp();
  const port = process.env.PORT || 3000;
  app.listen(port, () => { console.log('Listening on :' + port); app.warmUp(); });
}

module.exports = { createApp, normalizeChartUrl, deptCodeOf };
