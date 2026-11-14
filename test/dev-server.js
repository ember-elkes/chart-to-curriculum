// Local demo server: real server code, but charts and the OCW feed come from test fixtures (no network needed).
//   node test/dev-server.js   then open http://localhost:3100
const fs = require('fs'), os = require('os'), path = require('path');
const { createApp } = require('../server');
const { chart21A, chart21L, chart24, mockFetch } = require('./helpers');

const charts = {
  'https://catalog.mit.edu/degree-charts/literature-course-21l/': chart21L,
  'https://catalog.mit.edu/degree-charts/anthropology-course-21a/': chart21A,
  'https://catalog.mit.edu/degree-charts/linguistics-philosophy-course-24-2/': chart24,
};
const app = createApp({ fetchFn: mockFetch({ charts }), dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'ccb-dev-')), rateLimit: 1000 });
const port = process.env.PORT || 3100;
app.listen(port, () => console.log('Demo on http://localhost:' + port));
