# Brasão Daily Plan

Single-page iOS-style app that tells the Brasão team what to do each day, month by month (October and November 2026 for now; pick the month at the top): posts and stories (with copy), ads to turn on or off, emails, key dates and guardrails, for San Antonio, Plano and Irving.

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

## Meses
Arriba hay un selector de mes. Cada mes tiene sus propios archivos:
- Octubre: `src/data.json`, `src/actuals.json`, `src/budget.json`
- Noviembre: `src/data_nov.json`, `src/actuals_nov.json`, `src/budget_nov.json` (Sheet 1wLz3iSXEpbXvY3AMdletFHkFzjArp3Z1IguO_tKmg4s, Brasao_November_2026_FULL_PROGRAM)

`parse.py` detecta el mes solo: `python3 src/parse.py export_noviembre.txt data_nov.json`. Para agregar otro mes, añádelo a `MONTHS` en `src/build.py`.

## Analíticos (Google Analytics en vivo)
La pestaña Analíticos llama a `/api/analytics?m=<mes>` (función de Netlify en `netlify/functions/analytics.mjs`).
La función lee GA4 (propiedad 340318548, www.brasaousa.com) con una cuenta de servicio de solo lectura y compara 1 → hoy contra los mismos días del mes anterior. Cache de 10 min.
Variables de entorno en Netlify (alcance Functions): `GA_CLIENT_EMAIL`, `GA_PRIVATE_KEY` (y opcional `GA_PROPERTY_ID`).

## Dashboard (primera pestaña)
Abre por defecto. Junta todo el mes: gasto real contra presupuesto (con proyección), visitas, clics en Reservar y costo por clic (Google Analytics vía `/api/analytics`), insights automáticos, ritmo de gasto (plan acumulado), reparto por plataforma y por sucursal, plan contra real, visitas por día, canales, contenido hecho/planeado y mapa de avance diario. Código en `renderDashboard()` y `drawDash()` de `src/app.js`; estilos en el bloque "Dashboard" de `src/head.html`.

## Gasto real: una vez al día
Ya no hay botón Actualizar y abrir la app no consulta Meta, TikTok ni Google.
- `netlify/functions/daily-spend.mjs` (función programada, `42 13 * * *` UTC = 7:42 AM CT en invierno, 8:42 AM en verano) lee Meta, TikTok y el costo de Google Ads (vía Google Analytics) una vez al día y guarda la foto en Netlify Blobs (`snapshots/spend-AAAA-MM`). El día 1 también cierra el mes anterior.
- `/api/spend-daily` (`spend-daily.mjs`) solo devuelve esa foto. La app la lee y muestra "gasto actualizado <día, hora>".
- Si una plataforma no tiene llave o falla, se usa el último gasto guardado en `actuals*.json` (TikTok lo actualiza también la tarea diaria de Claude a las 7:42 AM).
- Llaves en Netlify (Functions): `META_TOKEN` (+ opcional `META_AD_ACCOUNTS`), `TIKTOK_TOKEN` o el token de `/api/tiktok-connect`, `GA_CLIENT_EMAIL`/`GA_PRIVATE_KEY`.
