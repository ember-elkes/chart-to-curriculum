(() => {
  const E = window.CurriculumEngine;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
  const byCode = (a, b) => a.code.localeCompare(b.code, undefined, { numeric: true });

  const S = { url: null, model: null, st: E.newState(), ui: { facet: 'all', q: '', sort: 'code', ocwOnly: true, editing: null }, dlg: null };

  // ---------- storage ----------
  const key = (url) => 'ccb:v1:' + url;
  const save = () => { try { localStorage.setItem(key(S.url), JSON.stringify(S.st)); localStorage.setItem('ccb:last', S.url); } catch { /* private mode */ } };
  const saved = (url) => { try { const v = JSON.parse(localStorage.getItem(key(url))); return v && v.plan ? v : null; } catch { return null; } };

  // ---------- loading ----------
  function setMsg(text, kind) { const m = $('#loadMsg'); m.textContent = text || ''; m.className = 'loadmsg' + (kind === 'err' ? ' err' : ''); }

  async function load(url, shared) {
    setMsg('Reading the chart…');
    const slow = setTimeout(() => setMsg('Reading the chart. The first request also downloads the OpenCourseWare course list, which takes about 20 seconds.'), 3500);
    try {
      const r = await fetch('/api/chart?url=' + encodeURIComponent(url));
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Couldn\'t read that chart.');
      S.model = E.buildModel(j); S.url = j.url;
      S.st = shared || saved(j.url) || E.newState();
      S.ui.facet = 'all'; S.ui.q = ''; S.ui.editing = null;
      $('#chartUrl').value = j.url;
      $('#q').value = '';
      $('#app').hidden = false;
      setMsg('');
      render(); save();
      history.replaceState(null, '', location.pathname);
    } catch (e) { setMsg(e.message, 'err'); } finally { clearTimeout(slow); }
  }

  // ---------- render ----------
  function render() { renderLedger(); renderCatalog(); }

  function renderLedger() {
    const m = S.model, ev = E.evaluate(m, S.st);
    $('#chartTitle').textContent = m.title;
    $('#chartLink').href = m.url;
    const met = ev.results.filter((r) => r.ok).length, total = ev.results.length;
    $('#summary').innerHTML = `<div class="line"><span>${met} of ${total} requirements met</span><span>${ev.plan.length} subjects${ev.units ? `, ${ev.units}${ev.unknownUnits ? '+' : ''} units` : ''}</span></div><div class="bar"><i style="width:${total ? Math.round((met / total) * 100) : 0}%"></i></div>`;

    const notes = [];
    if (!total || m.needsReview.length) notes.push('We couldn\'t read every requirement in this chart. Use Add a rule to fill in what\'s missing.');
    if (ev.results.some((r) => r.rule.unconfirmed)) notes.push('Rules marked "from a footnote" come from the chart\'s notes, not its table. Check each against the chart, then choose Looks right.');
    $('#notice').innerHTML = notes.map((n) => `<p class="notice">${esc(n)}</p>`).join('');

    $('#rules').innerHTML = ev.results.map(ruleHtml).join('');
    $('#plan').innerHTML = ev.plan.length
      ? ev.plan.slice().sort(byCode).map((c) => { const mt = E.effectiveMatch(c, S.st); return `<li><span class="code">${esc(c.code)}</span><span class="t">${esc(c.title)}${E.needsReview(mt) ? ' <span class="badge check">check match</span>' : ''}</span><button class="rm" data-action="toggle" data-key="${esc(c.key)}" aria-label="Remove ${esc(c.code)} from plan">Remove</button></li>`; }).join('')
      : '<li class="empty">Nothing yet. Add courses from the list.</li>';
  }

  function ruleHtml(r) {
    const { rule } = r, cls = r.over ? 'over' : r.ok ? 'ok' : 'open';
    const countTxt = rule.kind === 'max' ? `${r.have} of ${r.need} allowed` : `${r.have} of ${r.need}`;
    let vis = '';
    if (r.need <= 14 && r.poolSize !== 0) {
      const tiles = [], mine = r.mine.map((k) => S.model.courses.get(k)).sort(byCode);
      mine.forEach((c, i) => tiles.push(`<span class="slot ${i >= r.need ? (rule.kind === 'max' ? 'over' : 'extra') : 'filled'}" title="${esc(c.title)}">${esc(c.code)}</span>`));
      for (let i = mine.length; i < r.need; i++) tiles.push('<span class="slot empty"></span>');
      vis = `<div class="slots">${tiles.join('')}</div>`;
    } else {
      vis = `<div class="meter"><i style="width:${Math.min(100, Math.round((r.have / Math.max(r.need, 1)) * 100))}%"></i></div>`;
    }
    const flags = [];
    if (rule.unconfirmed) flags.push(`<span class="tag">from a footnote</span><button class="link" data-action="confirm-rule" data-id="${esc(rule.id)}">Looks right</button>`);
    if (r.poolSize === 0) flags.push('<span class="tag">No courses match this rule yet</span>');
    flags.push(`<button class="link rule-edit-btn" data-action="edit-rule" data-id="${esc(rule.id)}" aria-expanded="${S.ui.editing === rule.id}">${S.ui.editing === rule.id ? 'Done' : 'Edit'}</button>`);
    return `<li class="rule ${cls}" data-id="${esc(rule.id)}">
      <div class="rule-top"><span class="rule-label">${esc(rule.label)}</span><span class="rule-count">${countTxt}</span></div>
      ${vis}
      ${rule.detail && rule.source !== 'manual' ? `<p class="rule-detail">${esc(cap(rule.detail.length > 120 ? rule.detail.slice(0, 117) + '…' : rule.detail))}</p>` : ''}
      <div class="rule-flags">${flags.join('')}</div>
      ${S.ui.editing === rule.id ? ruleForm(rule) : ''}
    </li>`;
  }

  function poolOptions(rule) {
    const opts = [{ label: 'Any subject in my plan', pool: { type: 'all' } }, ...S.model.facets.map((f) => ({ label: f.label, pool: f.pool }))];
    if (!opts.some((o) => JSON.stringify(o.pool) === JSON.stringify(rule.pool))) opts.push({ label: rule.pool.type === 'codes' ? `The ${rule.pool.value.length} subjects in the chart's list` : 'Current pool', pool: rule.pool });
    return opts.map((o) => `<option value="${esc(JSON.stringify(o.pool))}" ${JSON.stringify(o.pool) === JSON.stringify(rule.pool) ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
  }
  function ruleForm(rule) {
    return `<div class="rule-form" data-id="${esc(rule.id)}">
      ${rule.source === 'manual' ? `<label>Name<input data-f="label" value="${esc(rule.label)}"></label>` : ''}
      <div class="row">
        <label>Rule<select data-f="kind"><option value="min" ${rule.kind === 'min' ? 'selected' : ''}>At least</option><option value="max" ${rule.kind === 'max' ? 'selected' : ''}>No more than</option><option value="all" ${rule.kind === 'all' ? 'selected' : ''}>All of</option></select></label>
        ${rule.kind === 'all' ? '' : `<label>Number<input type="number" min="0" max="99" data-f="count" value="${rule.count}"></label>`}
      </div>
      <label>Counting subjects from<select data-f="pool">${poolOptions(rule)}</select></label>
      <div class="row"><button class="btn quiet" data-action="remove-rule" data-id="${esc(rule.id)}">Remove this rule</button></div>
    </div>`;
  }

  // ---------- catalog ----------
  function statusInfo(c) {
    const mt = E.effectiveMatch(c, S.st), o = mt.ocw, run = o && o.newest ? `${cap(o.newest.term)} ${o.newest.year}` : '';
    const link = o && o.newest ? `<a class="link" href="${esc(o.newest.url)}" target="_blank" rel="noopener">Open on OCW</a>` : '';
    switch (mt.status) {
      case 'on-ocw': return { badge: '<span class="badge">On OCW</span>', sub: run, link, mt };
      case 'confirmed': return { badge: '<span class="badge">On OCW, you confirmed</span>', sub: run, link, mt };
      case 'custom': return { badge: `<span class="badge">Matched to ${esc(o.code)}</span>`, sub: esc(o.title), link, mt };
      case 'title-match': return { badge: `<span class="badge">On OCW as ${esc(o.code)}</span>`, sub: 'Same title, different number', link, mt };
      case 'number-reused': return { badge: '<span class="badge check">Check match</span>', sub: `OCW's ${esc(o.code)} is "${esc(o.title)}"`, link: `<button class="link" data-action="review" data-key="${esc(c.key)}">Review</button>`, mt };
      case 'ambiguous': return { badge: '<span class="badge check">Several matches</span>', sub: '', link: `<button class="link" data-action="review" data-key="${esc(c.key)}">Review</button>`, mt };
      default: return { badge: '<span class="badge none">Not on OCW</span>', sub: '', link: `<button class="link" data-action="review" data-key="${esc(c.key)}">Find it on OCW</button>`, mt };
    }
  }

  function filtered() {
    const { facet, q, sort, ocwOnly } = S.ui, f = S.model.facets.find((x) => x.id === facet), inPlan = new Set(S.st.plan);
    const needle = q.trim().toLowerCase();
    let list = [...S.model.courses.values()];
    const poolSet = f ? new Set(E.members({ pool: f.pool }, S.model)) : null;
    list = list.filter((c) => {
      if (facet === 'plan') return inPlan.has(c.key);
      if (poolSet && !poolSet.has(c.key)) return false;
      if (!poolSet && facet === 'all' && c.source === 'ocw') return false; // department extras appear under their own filter
      if (ocwOnly && !E.onOcw(E.effectiveMatch(c, S.st)) && !inPlan.has(c.key)) return false;
      return !needle || c.code.toLowerCase().includes(needle) || c.title.toLowerCase().includes(needle);
    });
    if (facet === 'plan' && needle) list = list.filter((c) => c.code.toLowerCase().includes(needle) || c.title.toLowerCase().includes(needle));
    list.sort(sort === 'title' ? (a, b) => a.title.localeCompare(b.title) : byCode);
    return list;
  }

  function renderCatalog() {
    const m = S.model, inPlan = new Set(S.st.plan);
    const chips = [{ id: 'all', label: 'All in chart' }, { id: 'plan', label: `In my plan (${S.st.plan.length})` }, ...m.facets.filter((f) => f.pool.type !== 'tag' || f.pool.value !== 'dept-pool').map((f) => ({ id: f.id, label: `${f.label} (${f.count})` }))];
    $('#chips').innerHTML = chips.map((c) => `<button type="button" class="chip" data-action="facet" data-id="${esc(c.id)}" aria-pressed="${S.ui.facet === c.id}">${esc(c.label)}</button>`).join('');
    const list = filtered(), chartTotal = [...m.courses.values()].filter((c) => c.source === 'chart').length;
    const hidden = S.ui.ocwOnly ? [...m.courses.values()].filter((c) => c.source === 'chart' && !E.onOcw(E.effectiveMatch(c, S.st))).length : 0;
    $('#count').textContent = `${list.length} ${list.length === 1 ? 'subject' : 'subjects'} shown of ${chartTotal} in the chart${hidden ? `. ${hidden} aren't on OCW and are hidden.` : '.'}`;
    $('#courses').innerHTML = list.length ? list.map((c) => {
      const si = statusInfo(c), usable = E.onOcw(si.mt), on = inPlan.has(c.key);
      const tags = [...c.tags].filter((t) => E.TAG_NAMES[t] && t !== 'pick-option').map((t) => `<span class="pill">${esc(E.TAG_NAMES[t])}</span>`).join('');
      return `<li class="course ${on ? 'in' : ''} ${usable ? '' : 'off'}">
        <button class="add" data-action="toggle" data-key="${esc(c.key)}" aria-pressed="${on}" aria-label="${on ? 'Remove' : 'Add'} ${esc(c.code)} ${on ? 'from' : 'to'} plan" ${!usable && !on ? 'disabled' : ''}>${on ? '✓' : '+'}</button>
        <div><div><span class="c-code">${esc(c.code)}</span><span class="c-title">${esc(c.title)}</span></div>
          <div class="c-meta">${c.units ? `<span>${esc(c.units)} units</span>` : ''}${tags}</div></div>
        <div class="c-side">${si.badge}${si.sub ? `<span class="sub">${si.sub}</span>` : ''}<span class="sub">${si.link}</span></div>
      </li>`;
    }).join('') : `<li class="empty-state">${S.ui.facet === 'plan' ? 'Your plan is empty. Choose All in chart and add a course.' : 'No subjects match. Clear the search, or untick "Only courses on OCW".'}</li>`;
  }

  // ---------- match dialog ----------
  function openReview(k) {
    const c = S.model.courses.get(k); S.dlg = k;
    const si = statusInfo(c), o = si.mt.ocw;
    $('#mdTitle').textContent = `${c.code}: match to OpenCourseWare`;
    $('#mdBody').innerHTML = `
      <div class="md-box"><b>${esc(c.code)}</b> ${esc(c.title)}<br><span class="sub">In the degree chart</span></div>
      ${o ? `<div class="md-box"><b>${esc(o.code)}</b> ${esc(o.title)}<br>${o.newest ? `<a href="${esc(o.newest.url)}" target="_blank" rel="noopener">Open on OCW</a>` : ''}</div>
        <div class="md-actions"><button class="btn primary" data-action="confirm-match">Same course</button><button class="btn" data-action="reject-match">Not the same course</button></div>` : ''}
      <label for="mdSearch">Search OpenCourseWare${o ? ' for a different course' : ''}</label>
      <input id="mdSearch" class="md-search" type="search" placeholder="Number or title" value="${esc(o ? '' : c.title)}">
      <ul id="mdResults" class="md-results"></ul>`;
    $('#matchDialog').showModal();
    mdSearch(); $('#mdSearch').addEventListener('input', debounce(mdSearch, 250));
  }
  async function mdSearch() {
    const q = $('#mdSearch').value.trim(), ul = $('#mdResults'); if (!q) { ul.innerHTML = ''; return; }
    try {
      const j = await (await fetch('/api/ocw/search?q=' + encodeURIComponent(q) + '&limit=10')).json();
      ul.innerHTML = (j.results || []).map((o, i) => `<li><span><b>${esc(o.code)}</b> ${esc(o.title)}<br><span class="sub">${esc(cap(o.newest.term))} ${esc(o.newest.year)}</span></span><button class="btn" data-action="use-result" data-i="${i}">Use this one</button></li>`).join('') || '<li>No OpenCourseWare course matches that search.</li>';
      ul._results = j.results || [];
    } catch { ul.innerHTML = '<li>Search is unavailable right now.</li>'; }
  }
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  // ---------- actions ----------
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200); }
  async function copy(text, done) {
    try { await navigator.clipboard.writeText(text); } catch { const ta = document.createElement('textarea'); ta.value = text; document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    toast(done);
  }
  const commit = () => { save(); render(); };
  function setRule(id, patch) {
    const man = S.st.manualRules.find((r) => r.id === id);
    if (man) Object.assign(man, patch); else S.st.rules[id] = { ...(S.st.rules[id] || {}), ...patch };
    commit();
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]'); if (!b) return;
    const a = b.dataset.action, id = b.dataset.id, k = b.dataset.key;
    if (a === 'toggle') { const i = S.st.plan.indexOf(k); if (i >= 0) S.st.plan.splice(i, 1); else S.st.plan.push(k); commit(); }
    else if (a === 'facet') { S.ui.facet = id; renderCatalog(); }
    else if (a === 'edit-rule') { S.ui.editing = S.ui.editing === id ? null : id; renderLedger(); }
    else if (a === 'confirm-rule') setRule(id, { confirmed: true });
    else if (a === 'remove-rule') { const mi = S.st.manualRules.findIndex((r) => r.id === id); if (mi >= 0) S.st.manualRules.splice(mi, 1); else S.st.rules[id] = { ...(S.st.rules[id] || {}), removed: true }; S.ui.editing = null; commit(); }
    else if (a === 'add-rule') { const nid = 'm' + Date.now(); S.st.manualRules.push({ id: nid, label: 'My rule', kind: 'min', count: 1, pool: { type: 'all' } }); S.ui.editing = nid; commit(); }
    else if (a === 'reset-rules') { S.st.rules = {}; S.st.manualRules = []; S.ui.editing = null; commit(); toast('Rules reset to the chart'); }
    else if (a === 'review') openReview(k);
    else if (a === 'confirm-match') { S.st.overrides[S.dlg] = { decision: 'confirm' }; $('#matchDialog').close(); commit(); }
    else if (a === 'reject-match') { S.st.overrides[S.dlg] = { decision: 'reject' }; $('#matchDialog').close(); commit(); }
    else if (a === 'use-result') { const o = $('#mdResults')._results[+b.dataset.i]; S.st.overrides[S.dlg] = { decision: 'custom', ocw: o }; $('#matchDialog').close(); commit(); }
    else if (a === 'copy-notion') copy(E.toMarkdown(S.model, S.st), 'Copied. Paste it into Notion.');
    else if (a === 'copy-list') copy(E.toList(S.model, S.st), 'Copied the course list');
    else if (a === 'copy-link') copy(location.origin + location.pathname + '#s=' + E.encodeState(S.url, S.st), 'Copied the share link');
    else if (a === 'print') window.print();
  });

  document.addEventListener('change', (e) => {
    const f = e.target.dataset && e.target.dataset.f, form = e.target.closest('.rule-form');
    if (!f || !form) return;
    const v = e.target.value;
    if (f === 'count') setRule(form.dataset.id, { count: Math.max(0, parseInt(v, 10) || 0) });
    else if (f === 'kind') setRule(form.dataset.id, { kind: v });
    else if (f === 'pool') setRule(form.dataset.id, { pool: JSON.parse(v) });
    else if (f === 'label') setRule(form.dataset.id, { label: v.trim() || 'My rule' });
  });

  $('#loadForm').addEventListener('submit', (e) => { e.preventDefault(); const u = $('#chartUrl').value.trim(); if (u) load(u); else setMsg('Paste the address of a degree chart.', 'err'); });
  document.querySelectorAll('.try [data-url]').forEach((b) => b.addEventListener('click', () => { $('#chartUrl').value = b.dataset.url; load(b.dataset.url); }));
  $('#q').addEventListener('input', (e) => { S.ui.q = e.target.value; renderCatalog(); });
  $('#ocwOnly').addEventListener('change', (e) => { S.ui.ocwOnly = e.target.checked; renderCatalog(); });
  $('#sort').addEventListener('change', (e) => { S.ui.sort = e.target.value; renderCatalog(); });

  // ---------- start: share link > last chart ----------
  const m = location.hash.match(/^#s=(.+)$/), shared = m && E.decodeState(m[1]);
  if (shared && shared.url) { $('#chartUrl').value = shared.url; load(shared.url, shared.state); }
  else { try { const last = localStorage.getItem('ccb:last'); if (last) { $('#chartUrl').value = last; load(last); } } catch { /* ignore */ } }

  window.__ccb = { S, render }; // handy for debugging in the console
})();
