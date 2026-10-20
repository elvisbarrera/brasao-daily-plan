# Brasão Daily Plan

Single-page iOS-style app that tells the Brasão team what to do each day in October 2026: posts and stories (with copy), ads to turn on or off, emails, key dates and guardrails, for San Antonio, Plano and Irving.

- `index.html`: the complete app (data inlined). Open it in a browser.
- `src/parse.py`: turns the "Brasao_October_2026_FULL_PROGRAM" export into `src/data.json`.
- `src/head.html`, `src/body.html`, `src/app.js`: app source. Build = head + body + `const DATA=<data.json>` + app.js.

Ad amounts come from the planning sheet, not live platform spend.
