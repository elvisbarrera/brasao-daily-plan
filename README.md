# Brasão Daily Plan

Single-page iOS-style app that tells the Brasão team what to do each day in October 2026: posts and stories (with copy), ads to turn on or off, emails, key dates and guardrails, for San Antonio, Plano and Irving.

- `index.html`: the complete app (data inlined). Open it in a browser.
- `src/parse.py`: turns the "Brasao_October_2026_FULL_PROGRAM" export into `src/data.json`.
- `src/head.html`, `src/body.html`, `src/app.js`: app source. Build = head + body + `const DATA=<data.json>` + app.js.

Ad amounts come from the planning sheet, not live platform spend.

## Daily spend update
`src/actuals.json` holds real spend (Meta + TikTok since Oct 1). A daily scheduled task refreshes it, runs `python3 src/build.py` (writes `index.html`) and pushes to `main`; Netlify redeploys.

## Fuente de datos
Todo el plan viene del Google Sheet (Brasao_October_2026_FULL_PROGRAM). Para actualizar: descarga el Sheet como .xlsx (Drive), corre `python3 src/sync_from_sheet.py archivo.xlsx`, luego `python3 src/parse.py src/sheet_export.txt` y `python3 src/build.py`.

## Links de stories
`storyLink()` en `src/app.js` deciden, con el tema, formato y sucursal que trae el Sheet, si cada story lleva sticker de link, cuál y con qué texto (con UTM). La pestaña Guía explica las reglas.
