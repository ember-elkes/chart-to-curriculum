// Parses an MIT catalog degree chart (catalog.mit.edu/degree-charts/...) into a requirements object.
// Pure DOM code: runs in a browser (for testing) and in Node via jsdom/linkedom.
function parseDegreeChart(doc) {
  const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const num = (w) => (w == null ? null : NUM[String(w).toLowerCase()] ?? (parseInt(w, 10) || null));
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const textNoSup = (el) => { const c = el.cloneNode(true); c.querySelectorAll('sup').forEach((s) => s.remove()); return clean(c.textContent); };
  const supOf = (el) => [...el.querySelectorAll('sup')].flatMap((s) => clean(s.textContent).split(',').map((x) => x.trim()).filter(Boolean));
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const root = doc.querySelector('#textcontainer') || doc.body;
  const out = { title: clean((doc.querySelector('h1') || {}).textContent), gir: [], groups: [], totals: [], footnotes: [], notes: [], suggestedRules: [], needsReview: [] };
  const path = [];
  let g = null;
  const newGroup = (title, extra = {}) => {
    const head = path.length >= 3 ? path[path.length - 1] : '';
    const tag = /pre-1900/i.test(head) ? 'pre-1900' : /^introductory/i.test(head) ? 'introductory' : /^intermediate/i.test(head) ? 'intermediate' : /seminar/i.test(head) ? 'seminar' : head ? slug(head) : null;
    g = { section: path.filter(Boolean).join(' > '), tag, title, units: null, rule: null, footnotes: [], items: [], ...extra };
    out.groups.push(g);
    return g;
  };

  root.querySelectorAll('h2,h3,h4,p,table').forEach((el) => {
    const tag = el.tagName;
    if (tag !== 'TABLE' && el.closest('table')) return;
    if (/^H[2-4]$/.test(tag)) { const lvl = +tag[1] - 2; path[lvl] = clean(el.textContent); path.length = lvl + 1; g = null; return; }
    if (tag === 'P') { const t = clean(el.textContent); if (t) out.notes.push({ section: path.join(' > '), text: t }); return; }

    if (el.classList.contains('tbl_girs')) {
      [...el.querySelectorAll('tbody tr')].forEach((r) => {
        const c = r.cells; if (c.length >= 2) out.gir.push({ label: clean(c[0].textContent), subjects: parseInt(clean(c[c.length - 1].textContent), 10) || null });
      });
    } else if (el.classList.contains('sc_footnotes')) {
      [...el.rows].forEach((r) => { const s = r.querySelector('.symcol'), n = r.querySelector('.notecol'); if (s && n) out.footnotes.push({ symbol: clean(s.textContent), text: clean(n.textContent), section: path.join(' > ') }); });
    } else if (el.classList.contains('sc_courselist')) {
      g = null;
      [...el.rows].forEach((tr) => {
        const cells = [...tr.cells];
        const cm = tr.querySelector('.courselistcomment');
        const a = tr.querySelector('a.code');
        const hoursEl = tr.querySelector('td.hourscol') || (cells.length > 1 ? cells[cells.length - 1] : null);
        let hours = hoursEl ? clean(hoursEl.textContent) : '';
        if (/^units$/i.test(hours) && !a) hours = ''; // "Units" is a column label, not a value
        const isHeader = tr.classList.contains('areaheader');
        const label = cm ? textNoSup(cm) : clean(cells[0] ? cells[0].textContent : '');

        if (tr.classList.contains('listsum') || (!a && !cm && label)) { out.totals.push({ label, units: hours }); return; }
        if (isHeader) {
          if (label === 'Units') return; // column header row
          newGroup(label, { units: hours || null, footnotes: supOf(tr), kind: /units|total/i.test(label) ? 'summary' : 'requirement' });
          if (!label) { g.unlabeled = true; out.needsReview.push({ where: g.section, issue: 'Group header has no label', units: hours }); }
          return;
        }
        if (!a && cm && /^select\b/i.test(label)) {
          if (!g) newGroup(path[path.length - 1] || 'Requirements');
          const m = label.match(/select\s+(\w+)/i);
          g.rule = { type: 'pick', count: num(m && m[1]), text: label }; if (hours) g.units = g.units || hours;
          g.footnotes = [...new Set([...g.footnotes, ...supOf(tr)])]; return;
        }
        if (!a && !cm && !label && hours) { // unlabeled units row (e.g. 21L "36")
          newGroup('', { units: hours, unlabeled: true });
          out.needsReview.push({ where: g.section, issue: 'Units row has no label', units: hours }); return;
        }
        if (!g) newGroup(path[path.length - 1] || 'Requirements');
        if (a && !cm) { // plain course row
          const titleCell = cells.find((c) => !c.querySelector('a.code') && !c.classList.contains('hourscol')) || cells[1];
          let title = textNoSup(titleCell);
          const tags = [...title.matchAll(/\((CI-[HM])\)/g)].map((m) => m[1]);
          title = title.replace(/\s*\(CI-[HM]\)/g, '').trim();
          const raw = a.title;
          g.items.push({ type: 'course', code: raw.replace(/\[J\]/, ''), joint: /\[J\]/.test(raw), title, units: hours || null, tags, footnotes: supOf(titleCell),
            option: !!tr.querySelector('div[style*="margin-left"]') && !!g.rule && g.rule.type === 'pick' });
          return;
        }
        if (cm) { // free-text requirement slot, e.g. "Eight anthropology subjects..."
          const m = label.match(/^(\w+)\s+(?:[\w-]+\s+){0,3}subjects?/i);
          g.items.push({ type: 'slots', text: label, count: num(m && m[1]), units: hours || null, mentionedCodes: [...cm.querySelectorAll('a.code')].map((x) => x.title), footnotes: supOf(tr) });
        }
      });
    }
  });

  // Suggest machine-checkable rules from the prose (footnotes + departmental-program notes). The manual editor confirms/fixes these.
  const prose = [...out.footnotes.map((f) => ({ src: 'footnote ' + f.symbol, t: f.text })), ...out.notes.filter((n) => /Departmental/.test(n.section)).map((n) => ({ src: 'note', t: n.text }))];
  const patterns = [
    ['total', /major will consist of at least (\w+) subjects/i, 'min', 'any'],
    ['introductory', /no more than (\w+) introductory/i, 'max', 'introductory'],
    ['intermediate', /at least (\w+) intermediate/i, 'min', 'intermediate'],
    ['seminar', /at least (\w+) seminars/i, 'min', 'seminar'],
    ['pre-1900', /minimum of (\w+) subjects[^.]*pre-1900/i, 'min', 'pre-1900'],
    ['ci-m', /at least (\w+) subjects[^.]*\(?CI-M\)?|(?:least|choose at least) (\w+) subjects in the major[^.]*CI-M\)?/i, 'min', 'ci-m'],
  ];
  prose.forEach(({ src, t }) => patterns.forEach(([id, re, kind, tier]) => { const m = t.match(re); if (m) { const n = num(m[1] || m[2]); if (n) out.suggestedRules.push({ id, kind, count: n, tier, source: src, text: m[0], confidence: 'auto' }); } }));
  return out;
}
if (typeof module !== 'undefined') module.exports = { parseDegreeChart };
