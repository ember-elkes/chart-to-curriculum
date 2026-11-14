# Chart to curriculum

Paste an MIT degree chart address. The app reads the chart's requirements, checks every course against MIT OpenCourseWare (OCW), and keeps a live count while you build a plan.

## What it does

- **Reads any chart** at `catalog.mit.edu/degree-charts/...`: required lists, "select N of the following" groups, open slots ("Eight anthropology subjects"), and rules written in footnotes (such as "no more than 3 introductory subjects").
- **Matches courses to OCW** by number, including joint subjects (`21L.601[J]` is OCW's `21L.601J`), cross-listed numbers, and renumbered courses. MIT reuses numbers, so when OCW's course with the same number is a different subject, the course is flagged **Check match** instead of shown as available.
- **Counts as you build.** Each requirement is a row of slots that fill with the course codes you choose. Caps turn red when you go over.
- **Everything is editable.** Change a rule's number, kind, or course pool; remove a rule; add your own; confirm or reject a match; or search OCW for the right course yourself.
- **Saves and shares.** Your plan is saved in the browser. Export for Notion, as a plain list, as a share link, or print to PDF.

## Run it

```
npm install
npm run snapshot   # optional: download the OCW course list once (about 20 seconds)
npm start          # http://localhost:3000
```

`npm test` runs the unit and server tests. `npm run demo` starts a copy that uses built-in sample charts and needs no internet.

## Deploy on Render

1. Put this folder in a GitHub repository.
2. In Render, choose **New, Blueprint** and select the repository. `render.yaml` sets everything up.
3. Free instances forget their disk when they restart, so the server downloads the OCW course list again (about 20 seconds, once per start). To skip that wait, run `npm run snapshot` on your computer and commit `data/ocw-feed.json`. The server uses it immediately and refreshes it weekly.

## How it's built

| File | Job |
|---|---|
| `lib/parser.js` | Turns a chart page into groups, courses, rules, and footnotes. Plain DOM code. |
| `lib/ocw.js` | Builds the OCW index from MIT Open Learning's public course feed and matches chart courses to it. |
| `server.js` | Fetches charts (only from `catalog.mit.edu`), parses and matches them, caches the OCW list on disk. |
| `public/engine.js` | Derives requirements and computes live counters. Shared by the page and the tests. |
| `public/app.js`, `app.css`, `index.html` | The builder page. |

## Known limits

- Rules written only in prose are suggested, not certain. They're marked "from a footnote" until you choose **Looks right**.
- Half-length subjects (such as 21L "Samplings") count as one subject. Change the count in the rule editor if your chart treats them differently.
- Unit totals use the units shown in the chart. Open slots filled with OCW courses have no unit count, so totals show as "12+".
- About half of some charts' courses aren't on OCW. They're hidden by default; untick **Only courses on OCW** to see them.
- Charts with several tracks (for example Linguistics and Philosophy, 24-2) show a switch under the title. Each track keeps its own plan.
- An "or" row in a chart (24.900 or 24.9000) counts as one requirement that either subject meets.
- Open-slot rules such as "at least two of which must be in Linguistics and Philosophy" count every department subject in your plan. Add a rule if you want to check the sub-requirement.
- Other universities' charts aren't supported. The parser expects the MIT catalog's markup.

Course materials belong to MIT OpenCourseWare (CC BY-NC-SA). This project isn't affiliated with MIT.
