/* Gasto real, una vez al día.
   Función programada de Netlify: corre todos los días a las 13:42 UTC (7:42 AM en Texas en horario de invierno,
   8:42 AM en horario de verano). Lee Meta, TikTok y Google Ads UNA vez y guarda la foto en Netlify Blobs.
   La app solo lee esa foto (/api/spend-daily): abrir la página no vuelve a consultar Meta, TikTok ni Google. */

import { getStore } from "@netlify/blobs";
import { chicagoNow, range, meta, tiktok } from "./spend.mjs";
import analytics from "./analytics.mjs";

const env = (k) => (globalThis.Netlify ? Netlify.env.get(k) : process.env[k]);
const key = (y, m) => `spend-${y}-${String(m).padStart(2, "0")}`;
async function run(fn) {
  try { return { status: "ok", ...(await fn()) }; }
  catch (e) { return { status: e.status || "error", error: e.message || "Error desconocido." }; }
}

async function snapshot(y, m, t) {
  const R = range(y, m, t);
  if (!R) return null;
  const mt = env("META_TOKEN");
  let tt = env("TIKTOK_TOKEN"), ttAdv = env("TIKTOK_ADVERTISER_ID");
  if (!tt) { try { const b = await getStore("tokens").get("tiktok", { type: "json" }); if (b) tt = b.access_token; } catch (e) {} }
  const [metaR, ttR, gaR] = await Promise.all([
    mt ? run(() => meta(mt, env("META_AD_ACCOUNTS"), R)) : { status: "setup", error: "Falta META_TOKEN en Netlify." },
    tt ? run(() => tiktok(tt, ttAdv || "6988573869539852289", R)) : { status: "setup", error: "Falta la llave de TikTok en Netlify." },
    analytics(new Request(`https://local/api/analytics?y=${y}&m=${m}`)).then((r) => r.json()).catch((e) => ({ ok: false, error: e.message })),
  ]);
  const ga = gaR && gaR.ok && gaR.googleAds
    ? { status: "ok", spent: Math.round(gaR.googleAds.cur.cost * 100) / 100, campaigns: gaR.googleAds.campaigns || [] }
    : { status: "error", error: (gaR && (gaR.googleAdsError || gaR.error)) || "Sin costo de Google Ads." };
  const store = getStore("snapshots");
  const prev = await store.get(key(y, m), { type: "json" }).catch(() => null);
  /* Si una plataforma falla hoy, se queda con la última foto buena de ese mes. */
  const keep = (now, old) => (now.status === "ok" || !old || old.status !== "ok" ? now : { ...old, stale: true });
  const snap = {
    at: new Date().toISOString(), year: y, month: m, through: R.through,
    meta: keep(metaR, prev && prev.meta), tiktok: keep(ttR, prev && prev.tiktok), google: keep(ga, prev && prev.google),
  };
  await store.setJSON(key(y, m), snap);
  return snap;
}

export default async () => {
  const t = chicagoNow();
  const out = [await snapshot(t.y, t.m, t)];
  /* El día 1 también cierra el mes anterior completo. */
  if (t.d === 1) { const py = t.m === 1 ? t.y - 1 : t.y, pm = t.m === 1 ? 12 : t.m - 1; out.push(await snapshot(py, pm, t)); }
  console.log("daily-spend", JSON.stringify(out.map((s) => s && { y: s.year, m: s.month, meta: s.meta.status, tiktok: s.tiktok.status, google: s.google.status })));
};

export const config = { schedule: "42 13 * * *" };
