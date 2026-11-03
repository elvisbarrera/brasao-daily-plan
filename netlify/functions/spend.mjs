/* Gasto real en vivo para el Plan Diario Brasão (botón "Actualizar").
   Lee Meta (Instagram + Facebook) y TikTok con llaves de SOLO LECTURA guardadas en Netlify.
   No inicia sesión como el usuario: usa las APIs oficiales, así que no afecta sus sesiones.
   Google Ads no va aquí: su costo ya llega por Google Analytics (/api/analytics).

   Variables de entorno en Netlify (alcance: Functions):
     META_TOKEN           token de System User con permiso ads_read (Business Manager)
     META_AD_ACCOUNTS     opcional: ids de cuentas separados por coma (act_123,act_456). Sin esto usa todas las del token.
     TIKTOK_TOKEN         access token de larga duración (TikTok for Business, Marketing API)
     TIKTOK_ADVERTISER_ID opcional, por defecto 6988573869539852289 (Brasão Brazilian Steakhouse)
   Si falta la llave de una plataforma, esa plataforma regresa {status:"setup"} y la app usa el último gasto guardado. */

const TZ = "America/Chicago";
const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function chicagoNow(d = new Date()) {
  const p = {};
  new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(d).forEach((x) => (p[x.type] = x.value));
  return { y: +p.year, m: +p.month, d: +p.day };
}

/* Mes en curso: 1 → hoy. Mes cerrado: mes completo. Mes futuro: null. */
export function range(y, m, t) {
  const cmp = y * 100 + m, tc = t.y * 100 + t.m;
  if (cmp > tc) return null;
  const through = cmp === tc ? t.d : daysIn(y, m);
  return { since: iso(y, m, 1), until: iso(y, m, through), through, current: cmp === tc };
}

class Err extends Error { constructor(status, msg) { super(msg); this.status = status; } }

/* ---------- Meta ---------- */
const GRAPH = "https://graph.facebook.com/v22.0";
async function graph(path, token) {
  const sep = path.includes("?") ? "&" : "?";
  const r = await fetch(`${GRAPH}${path}${sep}access_token=${encodeURIComponent(token)}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    const e = j.error || {};
    if (e.code === 190) throw new Err("auth", "El token de Meta venció o no es válido. Genera otro en Business Manager.");
    if (e.code === 10 || e.code === 200 || e.code === 100 && /permission/i.test(e.message || "")) throw new Err("permission", `El token de Meta no tiene permiso para leer anuncios (${e.message || r.status}).`);
    throw new Err("error", `Meta respondió con un error (${e.message || r.status}).`);
  }
  return j;
}
async function graphAll(path, token, max = 10) {
  let out = [], j = await graph(path, token), n = 0;
  out = out.concat(j.data || []);
  while (j.paging && j.paging.next && ++n < max) {
    const r = await fetch(j.paging.next); j = await r.json().catch(() => ({})); out = out.concat(j.data || []);
  }
  return out;
}
export async function meta(token, accountsEnv, R) {
  let accounts = String(accountsEnv || "").split(",").map((s) => s.trim()).filter(Boolean)
    .map((a) => (a.startsWith("act_") ? a : `act_${a}`)).map((id) => ({ id, name: id }));
  if (!accounts.length) {
    const list = await graphAll("/me/adaccounts?fields=id,name,account_status&limit=100", token);
    accounts = list.filter((a) => a.account_status !== 2).map((a) => ({ id: a.id, name: a.name || a.id }));
  }
  if (!accounts.length) throw new Err("permission", "El token de Meta no tiene ninguna cuenta de anuncios asignada.");
  const tr = encodeURIComponent(JSON.stringify({ since: R.since, until: R.until }));
  const per = await Promise.all(accounts.map(async (a) => {
    const rows = await graphAll(`/${a.id}/insights?level=campaign&fields=campaign_name,spend&time_range=${tr}&limit=200`, token);
    return rows.map((r) => ({ name: r.campaign_name, spent: Number(r.spend) || 0, account: a.name }));
  }));
  const campaigns = per.flat().filter((c) => c.spent > 0).sort((a, b) => b.spent - a.spent);
  return { spent: round(campaigns.reduce((s, c) => s + c.spent, 0)), campaigns: campaigns.map((c) => ({ name: c.name, spent: round(c.spent) })), accounts: accounts.length };
}

/* ---------- TikTok ---------- */
export async function tiktok(token, advertiser, R) {
  const q = new URLSearchParams({
    advertiser_id: advertiser, report_type: "BASIC", data_level: "AUCTION_CAMPAIGN",
    dimensions: JSON.stringify(["campaign_id"]), metrics: JSON.stringify(["spend", "campaign_name"]),
    start_date: R.since, end_date: R.until, page_size: "200", page: "1",
  });
  const r = await fetch(`https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?${q}`, { headers: { "Access-Token": token } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.code !== 0) {
    if ([40100, 40101, 40102, 40104, 40105].includes(j.code)) throw new Err("auth", `El token de TikTok venció o no es válido (${j.message || j.code}).`);
    if ([40001, 40002, 40007, 41000].includes(j.code)) throw new Err("permission", `El token de TikTok no tiene acceso a la cuenta de anuncios (${j.message || j.code}).`);
    throw new Err("error", `TikTok respondió con un error (${j.message || r.status}).`);
  }
  const campaigns = (j.data?.list || []).map((x) => ({ name: x.metrics?.campaign_name || x.dimensions?.campaign_id, spent: Number(x.metrics?.spend) || 0 }))
    .filter((c) => c.spent > 0).sort((a, b) => b.spent - a.spent);
  return { spent: round(campaigns.reduce((s, c) => s + c.spent, 0)), campaigns: campaigns.map((c) => ({ name: c.name, spent: round(c.spent) })) };
}

const round = (n) => Math.round(n * 100) / 100;
async function run(fn) {
  try { return { status: "ok", ...(await fn()) }; }
  catch (e) { return { status: e.status || "error", error: e.message || "Error desconocido." }; }
}
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
    /* 5 min en el CDN; el botón Actualizar manda ?t= para saltarse el cache */
    ...(status === 200 ? { "netlify-cdn-cache-control": "public, durable, s-maxage=300, stale-while-revalidate=900" } : {}),
  },
});

export default async (req) => {
  const url = new URL(req.url), t = chicagoNow();
  const y = +(url.searchParams.get("y") || t.y), m = +(url.searchParams.get("m") || t.m);
  if (!(m >= 1 && m <= 12) || !(y >= 2024 && y <= 2030)) return json({ ok: false, error: "Mes no válido." }, 400);
  const R = range(y, m, t);
  if (!R) return json({ ok: false, code: "future", error: "Ese mes todavía no empieza." });
  const env = (k) => (globalThis.Netlify ? Netlify.env.get(k) : process.env[k]);
  const mt = env("META_TOKEN"), tt = env("TIKTOK_TOKEN");
  const [metaR, ttR] = await Promise.all([
    mt ? run(() => meta(mt, env("META_AD_ACCOUNTS"), R)) : { status: "setup", error: "Falta META_TOKEN en Netlify." },
    tt ? run(() => tiktok(tt, env("TIKTOK_ADVERTISER_ID") || "6988573869539852289", R)) : { status: "setup", error: "Falta TIKTOK_TOKEN en Netlify." },
  ]);
  return json({ ok: true, generated: new Date().toISOString(), year: y, month: m, ...R, meta: metaR, tiktok: ttR });
};

export const config = { path: "/api/spend", method: "GET" };
