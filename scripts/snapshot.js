// Downloads the OCW course list and saves data/ocw-feed.json.
// Commit that file and the server starts instantly, even on a host that forgets its disk between restarts.
//   npm run snapshot
const fs = require('fs/promises');
const path = require('path');
const ocw = require('../lib/ocw');

(async () => {
  const t0 = Date.now();
  const resources = (await ocw.fetchAllOcw()).map(ocw.slimResource);
  const dir = path.join(__dirname, '..', 'data');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'ocw-feed.json'), JSON.stringify({ updated: Date.now(), resources }));
  const index = ocw.buildIndex(resources);
  console.log(`Saved ${resources.length} OCW course runs (${index.courses.length} courses) in ${Math.round((Date.now() - t0) / 1000)}s.`);
})().catch((e) => { console.error('Snapshot failed:', e.message); process.exit(1); });
