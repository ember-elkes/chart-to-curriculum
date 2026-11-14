// Test fixtures. The 21A chart reproduces the real catalog.mit.edu markup (captured from the live page);
// the 21L chart is a smaller chart with the same structure (indented pick list, "select seven" row, footnotes, section lists).
const GIR = `<table class="sc_sctable tbl_girs hide-thead"><thead><tr class="sctablehead"><th class="column0">Summary of Subject Requirements</th><th class="column1">Subjects</th></tr></thead><tbody>
<tr class="even firstrow"><td class="column0 girscience">Science Requirement</td><td class="column1">6</td></tr>
<tr class="odd"><td class="column0 girhumanities">Humanities, Arts, and Social Sciences (HASS) Requirement</td><td class="column1">8</td></tr>
<tr class="even lastrow"><td class="column0"><strong>Total GIR Subjects Required for SB Degree</strong></td><td class="column1"><strong>17</strong></td></tr></tbody></table>`;

const code = (c) => `<a href="/search/?P=${c}" title="${c}" class="bubblelink code">${c}</a>`;
const row = (c, title, { indent = false, hours = '', sup = '', joint = false } = {}) =>
  `<tr class="odd"><td class="codecol">${indent ? '<div style="margin-left: 20px;">' : ''}${code(c + (joint ? '[J]' : ''))}${indent ? '</div>' : ''}</td><td>${title}${sup ? `<sup>${sup}</sup>` : ''}</td><td class="hourscol">${hours}</td></tr>`;
const list = (rows) => `<table class="sc_courselist hide-thead"><tbody>${rows.join('')}</tbody></table>`;

const chart21A = `<html><body><h1>Anthropology (Course 21A)</h1><div id="textcontainer">
<h2>Bachelor of Science in Anthropology</h2><h3>General Institute Requirements (GIRs)</h3>${GIR}
<h3>Departmental Program</h3>
<table class="sc_courselist hide-thead" width="100%"><colgroup><col class="codecol"><col class="titlecol"><col class="hourscol"></colgroup><tbody>
<tr class="even areaheader firstrow"><td colspan="2"><span class="courselistcomment areaheader">Required Subjects</span></td><td align="right"><strong>Units</strong></td></tr>
<tr class="odd"><td colspan="2"><span class="courselistcomment areasubheader"><i>Select two of the following:</i></span></td><td class="hourscol">24</td></tr>
<tr class="even"><td class="codecol"><div style="margin-left: 20px;">${code('21A.00')}</div></td><td>Introduction to Anthropology: Comparing Human Cultures</td><td class="hourscol"></td></tr>
<tr class="odd"><td class="codecol"><div style="margin-left: 20px;">${code('21A.01')}</div></td><td>How Culture Works</td><td class="hourscol"></td></tr>
<tr class="even"><td class="codecol"><div style="margin-left: 20px;">${code('21A.157')}</div></td><td>The Meaning of Life</td><td class="hourscol"></td></tr>
<tr class="odd"><td class="codecol">${code('21A.155')}</td><td>Food, Culture, and Politics (CI-M)</td><td class="hourscol">12</td></tr>
<tr class="even"><td class="codecol">${code('21A.802')}</td><td>Seminar in Ethnography and Fieldwork (CI-M)</td><td class="hourscol">12</td></tr>
<tr class="odd areaheader"><td colspan="2"><span class="courselistcomment areaheader">Restricted Electives</span></td><td class="hourscol"></td></tr>
<tr class="even"><td colspan="2"><span class="courselistcomment">Eight anthropology subjects, which may include a pre-thesis tutorial (${code('21A.THT')}) and a thesis (${code('21A.THU')}). The decision to write a thesis is made in consultation between the student and advisor.</span></td><td class="hourscol">90-96</td></tr>
<tr class="odd areaheader"><td colspan="2"><span class="courselistcomment areaheader">Units in Major</span></td><td class="hourscol">138-144</td></tr>
<tr class="even areaheader lastrow"><td colspan="2"><span class="courselistcomment areaheader">Unrestricted Electives</span> <sup>1</sup></td><td class="hourscol">72-114</td></tr>
<tr><td colspan="2">Units in Major That Also Satisfy the GIRs</td><td class="hourscol">(36-72)</td></tr>
<tr class="listsum"><td colspan="2">Total Units Beyond the GIRs Required for SB Degree</td><td class="hourscol">180</td></tr></tbody></table>
<table class="sc_footnotes hide-thead"><tbody><tr><td valign="top" class="symcol"><em><sup>1</sup></em></td><td class="notecol"><em><p>This chart has been calculated based on an overlap of 36 units (three subjects) between the HASS General Institute Requirement and the departmental requirements.</p></em></td></tr></tbody></table>
</div></body></html>`;

const chart21L = `<html><body><h1>Literature (Course 21L)</h1><div id="textcontainer">
<h2>Bachelor of Science in Literature</h2><h3>General Institute Requirements (GIRs)</h3>${GIR}
<h3>Departmental Program</h3><p>Choose at least two subjects in the major that are designated as communication-intensive (CI-M) to fulfill the Communication Requirement.</p>
<table class="sc_courselist hide-thead"><tbody>
<tr class="even areaheader firstrow"><td colspan="2"><span class="courselistcomment areaheader">Required Subjects</span></td><td align="right"><strong>Units</strong></td></tr>
<tr class="odd"><td colspan="2"><span class="courselistcomment areasubheader"><i>Select three of the following:</i></span></td><td class="hourscol">36</td></tr>
${row('21L.701', 'Literary Methods (CI-M)', { indent: true })}${row('21L.702', 'Studies in Fiction (CI-M)', { indent: true })}${row('21L.703', 'Studies in Drama', { indent: true, joint: true })}${row('21L.704', 'Studies in Poetry (CI-M)', { indent: true })}${row('21L.705', 'Major Authors (CI-M)', { indent: true })}${row('21L.720', 'Chaucer\'s Canterbury Tales', { indent: true })}
<tr class="even areaheader"><td colspan="2"><span class="courselistcomment areaheader">Restricted Electives</span></td><td class="hourscol">78-84</td></tr>
<tr class="odd"><td colspan="2"><span class="courselistcomment">Select seven additional subjects to form a coherent program <sup>1,2</sup></span></td><td class="hourscol"></td></tr>
<tr class="even areaheader"><td colspan="2"><span class="courselistcomment areaheader">Units in Major</span></td><td class="hourscol">114-120</td></tr>
<tr class="listsum"><td colspan="2">Total Units Beyond the GIRs Required for SB Degree</td><td class="hourscol">180</td></tr></tbody></table>
<table class="sc_footnotes hide-thead"><tbody>
<tr><td class="symcol"><em><sup>1</sup></em></td><td class="notecol"><em><p>The major will consist of at least 10 subjects including no more than 3 introductory subjects, at least 3 intermediate subjects, and at least 3 seminars. A minimum of 3 subjects in the overall degree program must focus on pre-1900 texts.</p></em></td></tr>
<tr><td class="symcol"><em><sup>2</sup></em></td><td class="notecol"><em><p>Subjects focusing on pre-1900 texts, introductory subjects, and intermediate subjects are listed below. A maximum of 3 subjects may be selected from among the introductory subjects.</p></em></td></tr></tbody></table>
<h3>Restricted Electives</h3><h4>Subjects focusing on pre-1900 texts</h4>
${list([row('21L.001', 'Foundations of Western Literature: Homer to Dante', { sup: '1', hours: '12' }), row('21L.003', 'Reading Fiction', { sup: '1', hours: '12' }), row('21L.009', 'Shakespeare', { hours: '12' }), row('21L.720', 'Chaucer\'s Canterbury Tales', { hours: '12' })])}
<h4>Introductory Subjects</h4>
${list([row('21L.000', 'Writing About Literature', { joint: true, hours: '12' }), row('21L.001', 'Foundations of Western Literature: Homer to Dante', { hours: '12' }), row('21L.003', 'Reading Fiction', { hours: '12' }), row('21L.004', 'Reading Poetry', { hours: '12' }), row('21L.009', 'Shakespeare', { hours: '12' })])}
<h4>Intermediate Subjects</h4>
${list([row('21L.400', 'Medical Narratives', { hours: '12' }), row('21L.430', 'Popular Culture and Narrative', { hours: '12' }), row('21L.431', 'Shakespeare on Film and Media', { hours: '12' }), row('21L.432', 'Understanding Television', { joint: true, hours: '12' }), row('21L.451', 'Literary Theory', { hours: '12' })])}
</div></body></html>`;


// Two-track chart (Course 24-2), same structure as the live page: an EMPTY #textcontainer stub, one panel per track,
// an "or" row, several "Select one of the following" lists in one table, and "A coherent program of N additional subjects".
const hdr = (t) => `<tr class="even areaheader firstrow"><td colspan="2"><span class="courselistcomment areaheader">${t}</span></td><td align="right"><strong>Units</strong></td></tr>`;
const sel = (t, hours) => `<tr class="even"><td colspan="2"><span class="courselistcomment areasubheader"><i>${t}</i></span></td><td class="hourscol">${hours}</td></tr>`;
const orRow = (c, title) => `<tr class="orclass odd"><td class="codecol orclass">or&nbsp;${code(c)}</td><td colspan="2"> ${title}</td></tr>`;
const free = (t, sup, hours) => `<tr class="even"><td colspan="2"><span class="courselistcomment">${t}</span> <sup>${sup}</sup></td><td class="hourscol">${hours}</td></tr>`;
const tail = `<tr class="odd areaheader"><td colspan="2"><span class="courselistcomment areaheader">Units in Major</span></td><td class="hourscol">132</td></tr><tr class="listsum"><td colspan="2"><span class="courselistcomment">Total Units Beyond the GIRs Required for SB Degree</span></td><td class="hourscol">180</td></tr>`;
const panel = (id, track, rows, note) => `<div id="${id}textcontainer" class="page_content tab_content"><h2>Bachelor of Science in Linguistics and Philosophy (${track} Track)</h2><h3>General Institute Requirements (GIRs)</h3>${GIR}
<h3>Departmental Program</h3><p>Choose at least two subjects in the major that are designated as communication-intensive (CI-M) to fulfill the Communication Requirement.</p>
<table class="sc_courselist hide-thead"><tbody>${rows.join('')}${tail}</tbody></table>
<table class="sc_footnotes hide-thead"><tbody><tr><td valign="top" class="symcol"><em><sup>1</sup></em></td><td class="notecol"><em><p>${note}</p></em></td></tr></tbody></table></div>`;
const chart24 = `<html><body><h1>Linguistics and Philosophy (Course 24-2)</h1>
<ul class="clearfix" role="tablist"><li class="active"><a href="#linguisticstextcontainer" role="tab">Linguistics</a></li><li><a href="#philosophytextcontainer" role="tab">Philosophy</a></li></ul>
<div id="textcontainer" class="page_content tab_content"></div>
${panel('linguistics', 'Linguistics', [
  hdr('Required Subjects'), row('24.900', 'Introduction to Linguistics', { hours: '12' }), orRow('24.9000', 'How Language Works'),
  row('24.901', 'Language and Its Structure I: Phonology', { hours: '12' }), row('24.918', 'Workshop in Linguistic Research (CI-M)', { hours: '12' }),
  sel('Select one of the following linguistic analysis subjects:', '12'), row('24.909', 'Field Methods in Linguistics (CI-M)', { indent: true }), row('24.910', 'Advanced Topics in Linguistic Analysis (CI-M)', { indent: true }),
  sel('Select one of the following philosophy, cognition, and computation subjects:', '12'), row('6.3900', 'Introduction to Machine Learning', { indent: true }), row('24.09', 'Minds and Machines', { indent: true }), row('24.141', 'Logic I', { indent: true }),
  `<tr class="odd areaheader"><td colspan="2"><span class="courselistcomment areaheader">Restricted Electives</span></td><td class="hourscol"></td></tr>`,
  free('A coherent program of three additional subjects from linguistics, philosophy, or a related area', 3, '36')], 'Students who do not use 24.909 may count a sixth subject toward the HASS Requirement.')}
${panel('philosophy', 'Philosophy', [
  hdr('Required Subjects'), row('24.900', 'Introduction to Linguistics', { hours: '12' }), row('24.251', 'Introduction to Philosophy of Language (CI-M)', { hours: '12' }),
  sel('Select one of the following Logic subjects:', '12'), row('24.118', 'Paradox and Infinity', { indent: true }), row('24.141', 'Logic I', { indent: true }),
  `<tr class="odd areaheader"><td colspan="2"><span class="courselistcomment areaheader">Restricted Electives</span></td><td class="hourscol"></td></tr>`,
  free('A coherent program of four additional subjects, at least two of which must be in Linguistics and Philosophy, approved by the major advisor.', 4, '48')], 'Subject has prerequisites outside of the program.')}
</body></html>`;

// Master of Science in Linguistics: real catalog markup (captured live). No section headers, no "Select" row,
// the pick list is introduced by "At least one of the following subjects:", and the URL names no course number.
const chartSM = `<html><body><h1>Master of Science in Linguistics</h1><div id="textcontainer"><p><a href="/schools/x/#linguistics-ms">Department of Linguistics and Philosophy</a></p><h2>Program Requirements</h2><table class="sc_courselist hide-thead"><tbody><tr class="even firstrow"><td class="codecol"><a title="24.900" class="bubblelink code">24.900</a></td><td>Introduction to Linguistics <sup>1</sup></td><td class="hourscol">12</td></tr><tr class="odd"><td colspan="2"><span class="courselistcomment">At least one of the following subjects:</span></td><td class="hourscol">12-36</td></tr><tr class="even"><td class="codecol"><div style="margin-left: 20px;"><a title="24.931" class="bubblelink code">24.931</a></div></td><td>Language and Its Structure I: Phonology <sup>1</sup></td><td class="hourscol"></td></tr><tr class="odd"><td class="codecol"><div style="margin-left: 20px;"><a title="24.932" class="bubblelink code">24.932</a></div></td><td>Language and Its Structure II: Syntax <sup>1</sup></td><td class="hourscol"></td></tr><tr class="even"><td class="codecol"><div style="margin-left: 20px;"><a title="24.933" class="bubblelink code">24.933</a></div></td><td>Language and Its Structure III: Semantics and Pragmatics <sup>1</sup></td><td class="hourscol"></td></tr><tr class="odd"><td class="codecol"><a title="24.921" class="bubblelink code">24.921</a></td><td>Independent Study: Linguistics (Focused on the student's language) <sup>2</sup></td><td class="hourscol">24</td></tr><tr class="even lastrow"><td class="codecol"><a title="24.THG" class="bubblelink code">24.THG</a></td><td>Graduate Thesis <sup>3</sup></td><td class="hourscol">72</td></tr><tr class="listsum"><td colspan="2">Total Units</td><td class="hourscol">120-144</td></tr></tbody></table><table class="sc_footnotes hide-thead"><tbody><tr><td class="symcol"><em><sup>1</sup></em></td><td class="notecol"><em><p>If the student has already completed equivalent coursework in this area, a more advanced class in the same area is taken instead.</p></em></td></tr><tr><td class="symcol"><em><sup>2</sup></em></td><td class="notecol"><em><p>Students register for a minimum of 24 units of 24.921 Independent Study: Linguistics, focused on their own language.</p></em></td></tr></tbody></table></div></body></html>`;

// OCW feed in the shape returned by api.learn.mit.edu (after slimResource)
const feedRes = (title, numbers, term = 'Fall', year = 2019) => ({
  title, url: 'https://ocw.mit.edu/courses/' + numbers[0].toLowerCase().replace('.', '-') + '-' + term.toLowerCase() + '-' + year + '/', topics: [],
  runs: [{ semester: term, year, level: [{ code: 'undergraduate' }] }],
  course: { course_numbers: numbers.map((v, i) => ({ value: v, listing_type: i ? 'cross-listed' : 'primary' })) },
});
const feed = [
  feedRes('Introduction to Anthropology', ['21A.00']), feedRes('How Culture Works', ['21A.01']), feedRes('The Meaning of Life', ['21A.157']),
  feedRes('Food, Culture, Politics', ['21A.155']), feedRes('Seminar in Ethnography and Fieldwork', ['21A.112'], 'Spring', 2008),
  feedRes('Magic, Witchcraft, and the Spirit World', ['21A.211']), feedRes('Myth, Ritual, and Symbolism', ['21A.212']), feedRes('Law and Society', ['21A.219']),
  feedRes('Reading Poetry', ['21L.004']), feedRes('Shakespeare', ['21L.009']), feedRes('Reading Fiction: Imaginary Journeys', ['21L.003'], 'Fall', 2015),
  feedRes('Studies in Fiction: Stowe', ['21L.702']), feedRes('Studies in Drama', ['21L.703J', 'CMS.840']), feedRes('Literary Theory', ['21L.451']),
  feedRes('At the Limit: Violence in Contemporary Fiction', ['21L.435']), // number reused: chart has 21L.435 as a different subject
  feedRes('Understanding Television', ['21L.432J', 'CMS.100']),
  feedRes('Introduction to Linguistics', ['24.900']), feedRes('How Language Works', ['24.9000']), feedRes('Language and Its Structure I: Phonology', ['24.901']),
  feedRes('Language and Its Structure II: Syntax', ['24.902']), feedRes('Language and Its Structure III: Semantics and Pragmatics', ['24.933']),
  feedRes('Logic I', ['24.141']), feedRes('Minds and Machines', ['24.09']), feedRes('Introduction to Machine Learning', ['6.3900']),
];

// Minimal fetch double: serves chart HTML by URL and the OCW feed (single page).
function mockFetch({ charts = {}, counters = {} } = {}) {
  return async (url) => {
    if (url.startsWith('https://catalog.mit.edu/')) {
      counters.chart = (counters.chart || 0) + 1;
      const html = charts[url];
      return { ok: !!html, status: html ? 200 : 404, text: async () => html };
    }
    counters.feed = (counters.feed || 0) + 1;
    return { ok: true, status: 200, json: async () => ({ results: feed, next: null }) };
  };
}

module.exports = { chart21A, chart21L, chart24, chartSM, feed, mockFetch };
