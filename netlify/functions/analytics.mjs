/* Analíticos para el Plan Diario Brasão.
   Lee Google Analytics 4 (propiedad www.brasaousa.com) con una cuenta de servicio de solo lectura
   y regresa este mes (1 → hoy) contra los mismos días del mes anterior.

   Variables de entorno en Netlify (alcance: Functions):
     GA_CLIENT_EMAIL  correo de la cuenta de servicio (…@….iam.gserviceaccount.com)
     GA_PRIVATE_KEY   el "private_key" del JSON de la cuenta (con BEGIN/END)
     GA_PROPERTY_ID   opcional, por defecto 340318548
   Sin dependencias: firma el JWT con node:crypto y llama la API REST de Google. */
import { createSign } from "node:crypto";

const TZ = "America/Chicago";
const KEY_EVENTS = ["reserve_click", "phone_click", "directions_click"];
const RES = "keyEvents:reserve_click";

/* ---------- auth ---------- */
let tokenCache = { token: null, exp: 0 };
const b64url = (s) => Buffer.from(s).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

export function normalizeKey(raw) {
  /* Acepta la llave como venga pegada: con \n escritos, con saltos reales, con espacios, entre comillas,
     o incluso el JSON completo de la cuenta. Reconstruye un PEM limpio. */
  let k = String(raw || "").trim();
  if (k.startsWith("{")) { try { k = JSON.parse(k).private_key || k; } catch (e) {} }
  k = k.replace(/\\n/g, "\n").replace(/\\r/g, "");
  const m = k.match(/-----BEGIN ([A-Z ]*PRIVATE KEY)-----([\s\S]*?)-----END \1-----/);
  if (!m) return k;
  const body = m[2].replace(/[^A-Za-z0-9+/=]/g, "");
  return `-----BEGIN ${m[1]}-----\n${body.match(/.{1,64}/g).join("\n")}\n-----END ${m[1]}-----\n`;
}

export function signJwt(email, key, now = Math.floor(Date.now() / 1000)) {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: email, scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }));
  const s = createSign("RSA-SHA256");
  s.update(`${header}.${claim}`);
  const sig = s.sign(key).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${header}.${claim}.${sig}`;
}

async function getToken(email, key) {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache.token && tokenCache.exp - 120 > now) return tokenCache.token;
  let assertion;
  try { assertion = signJwt(email, key, now); }
  catch (e) { throw new Err("key", "La llave GA_PRIVATE_KEY en Netlify no se puede leer. Pega otra vez el private_key completo (de -----BEGIN a -----END PRIVATE KEY-----)."); }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Err("auth", `Google no aceptó la cuenta de servicio (${j.error_description || j.error || res.status}).`);
  tokenCache = { token: j.access_token, exp: now + (j.expires_in || 3600) };
  return j.access_token;
}

class Err extends Error { constructor(code, msg) { super(msg); this.code = code; } }

/* ---------- fechas (hora de Chicago) ---------- */
export function chicagoToday(d = new Date()) {
  const p = {};
  new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(d).forEach((x) => (p[x.type] = x.value));
  return { y: +p.year, m: +p.month, d: +p.day };
}
const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/* Rango del mes pedido y el mismo número de días del mes anterior.
   Mes en curso: 1 → hoy contra 1 → mismo día del mes anterior.
   Mes cerrado: mes completo contra mes anterior completo. */
export function ranges(y, m, today) {
  const nd = daysIn(y, m);
  const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1, pnd = daysIn(py, pm);
  const cmp = y * 100 + m, tcmp = today.y * 100 + today.m;
  if (cmp > tcmp) return null;
  const current = cmp === tcmp;
  const through = current ? today.d : nd;
  return {
    current, through, ndays: nd, pndays: pnd,
    cur: { startDate: iso(y, m, 1), endDate: iso(y, m, through) },
    prev: { startDate: iso(py, pm, 1), endDate: iso(py, pm, current ? Math.min(through, pnd) : pnd) },
    prevMonth: pm,
    /* la gráfica diaria muestra el mes anterior completo como referencia */
    prevFull: { startDate: iso(py, pm, 1), endDate: iso(py, pm, pnd) },
  };
}

/* ---------- GA4 ---------- */
async function batch(token, prop, requests) {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${prop}:batchRunReports`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ requests }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = j.error?.message || String(res.status);
    if (res.status === 403) throw new Err("permission", `La cuenta de servicio no tiene acceso a Google Analytics (${msg}).`);
    throw new Err("ga", `Google Analytics respondió con un error (${msg}).`);
  }
  return j.reports || [];
}

/* Filas → objetos. Con dos rangos, GA agrega la dimensión dateRange ("date_range_0" = este mes, "date_range_1" = anterior). */
export function rowsOf(report) {
  const dh = (report.dimensionHeaders || []).map((h) => h.name);
  /* "keyEvents:reserve_click" = clics en Reservar (key event) */
  const mh = (report.metricHeaders || []).map((h) => (h.name === RES ? "reserves" : h.name));
  return (report.rows || []).map((r) => {
    const o = {};
    (r.dimensionValues || []).forEach((v, i) => (o[dh[i]] = v.value));
    (r.metricValues || []).forEach((v, i) => (o[mh[i]] = Number(v.value) || 0));
    return o;
  });
}
const which = (o) => (o.dateRange === "date_range_1" ? "prev" : "cur");

export function shape(reports, R) {
  const [tot, daily, chan, src, ev, pages, gift, city] = reports.map(rowsOf);
  const T = { cur: {}, prev: {} };
  const MET = ["sessions", "totalUsers", "newUsers", "engagedSessions", "reserves", "screenPageViews"];
  for (const k of ["cur", "prev"]) MET.forEach((m) => (T[k][m] = 0));
  tot.forEach((o) => MET.forEach((m) => (T[which(o)][m] = o[m] || 0)));
  for (const k of ["cur", "prev"]) T[k].engagementRate = T[k].sessions ? T[k].engagedSessions / T[k].sessions : 0;

  /* serie diaria por día del mes */
  const mk = (n) => Array.from({ length: n }, () => 0);
  const D = { cur: { sessions: mk(R.ndays), reserves: mk(R.ndays) }, prev: { sessions: mk(R.pndays), reserves: mk(R.pndays) } };
  daily.forEach((o) => {
    const d = +String(o.date).slice(6, 8), k = which(o);
    if (d >= 1 && d <= D[k].sessions.length) { D[k].sessions[d - 1] += o.sessions; D[k].reserves[d - 1] += o.reserves; }
  });

  const pair = (list, dim, metrics) => {
    const m = new Map();
    list.forEach((o) => {
      const key = o[dim] || "(sin dato)";
      if (!m.has(key)) m.set(key, { name: key, cur: Object.fromEntries(metrics.map((x) => [x, 0])), prev: Object.fromEntries(metrics.map((x) => [x, 0])) });
      metrics.forEach((x) => (m.get(key)[which(o)][x] += o[x] || 0));
    });
    return [...m.values()].sort((a, b) => (b.cur[metrics[0]] - a.cur[metrics[0]]) || (b.prev[metrics[0]] - a.prev[metrics[0]]));
  };
  const events = Object.fromEntries(KEY_EVENTS.map((e) => [e, { cur: 0, prev: 0 }]));
  ev.forEach((o) => { if (events[o.eventName]) events[o.eventName][which(o)] += o.eventCount; });
  const giftCards = { cur: 0, prev: 0 };
  gift.forEach((o) => (giftCards[which(o)] += o.eventCount));

  return {
    totals: T,
    daily: D,
    channels: pair(chan, "sessionDefaultChannelGroup", ["sessions", "reserves"]),
    sources: pair(src, "sessionSourceMedium", ["sessions", "reserves"]).slice(0, 10),
    events, giftCards,
    pages: rowsOf_cur(pages, "pagePath", "screenPageViews").slice(0, 8),
    cities: pair(city, "city", ["sessions"]).slice(0, 8),
  };
}
function rowsOf_cur(list, dim, met) { return list.map((o) => ({ name: o[dim], value: o[met] })); }

function requestsFor(R) {
  const two = [R.cur, R.prev];
  return [
    { dateRanges: two, metrics: ["sessions", "totalUsers", "newUsers", "engagedSessions", RES, "screenPageViews"].map((name) => ({ name })) },
    { dateRanges: [R.cur, R.prevFull], dimensions: [{ name: "date" }], metrics: [{ name: "sessions" }, { name: RES }], limit: 100 },
    { dateRanges: two, dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: [{ name: "sessions" }, { name: RES }], limit: 50 },
    { dateRanges: two, dimensions: [{ name: "sessionSourceMedium" }], metrics: [{ name: "sessions" }, { name: RES }], orderBys: [{ metric: { metricName: "sessions" }, desc: true }], limit: 40 },
    { dateRanges: two, dimensions: [{ name: "eventName" }], metrics: [{ name: "eventCount" }],
      dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: KEY_EVENTS } } } },
  ];
}
function requestsFor2(R) {
  const two = [R.cur, R.prev];
  return [
    { dateRanges: [R.cur], dimensions: [{ name: "pagePath" }], metrics: [{ name: "screenPageViews" }], orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }], limit: 8 },
    { dateRanges: two, dimensions: [{ name: "linkDomain" }], metrics: [{ name: "eventCount" }],
      dimensionFilter: { andGroup: { expressions: [
        { filter: { fieldName: "eventName", stringFilter: { value: "click", matchType: "EXACT" } } },
        { filter: { fieldName: "linkDomain", stringFilter: { value: "cardfoundry", matchType: "CONTAINS", caseSensitive: false } } },
      ] } } },
    { dateRanges: two, dimensions: [{ name: "city" }], metrics: [{ name: "sessions" }], orderBys: [{ metric: { metricName: "sessions" }, desc: true }], limit: 20 },
  ];
}
/* Google Ads (solo si la cuenta está ligada a GA4). Va aparte: si falla, lo demás sigue. */
function adsRequest(R) {
  return [{ dateRanges: [R.cur, R.prev], metrics: [{ name: "advertiserAdClicks" }, { name: "advertiserAdCost" }, { name: "advertiserAdImpressions" }] }];
}

const json = (body, status = 200, cache = true) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    /* 10 min en el CDN de Netlify para no gastar cuota de Google en cada visita */
    ...(cache && status === 200 ? { "netlify-cdn-cache-control": "public, durable, s-maxage=600, stale-while-revalidate=1800" } : {}),
  },
});

export default async (req) => {
  const url = new URL(req.url);
  const today = chicagoToday();
  const y = +(url.searchParams.get("y") || 2026), m = +(url.searchParams.get("m") || today.m);
  if (!(m >= 1 && m <= 12) || !(y >= 2024 && y <= 2030)) return json({ ok: false, code: "bad", error: "Mes no válido." }, 400, false);
  const R = ranges(y, m, today);
  if (!R) return json({ ok: false, code: "future", error: "Ese mes todavía no empieza." }, 200, false);

  const email = Netlify.env.get("GA_CLIENT_EMAIL"), key = normalizeKey(Netlify.env.get("GA_PRIVATE_KEY"));
  const prop = Netlify.env.get("GA_PROPERTY_ID") || "340318548";
  if (!email || !key.includes("PRIVATE KEY")) {
    return json({ ok: false, code: "setup", error: "Falta conectar la cuenta de servicio de Google Analytics en Netlify (GA_CLIENT_EMAIL y GA_PRIVATE_KEY)." }, 200, false);
  }
  try {
    const token = await getToken(email, key);
    const [a, b, ads] = await Promise.all([
      batch(token, prop, requestsFor(R)),
      batch(token, prop, requestsFor2(R)),
      batch(token, prop, adsRequest(R)).catch((e) => ({ error: e.message })),
    ]);
    const data = shape([...a, ...b], R);
    if (ads && ads.error) { data.googleAds = null; data.googleAdsError = ads.error; }
    else if (ads && ads[0]) {
      const G = { cur: { clicks: 0, cost: 0, impressions: 0 }, prev: { clicks: 0, cost: 0, impressions: 0 } };
      rowsOf(ads[0]).forEach((o) => { const k = which(o); G[k].clicks += o.advertiserAdClicks; G[k].cost += o.advertiserAdCost; G[k].impressions += o.advertiserAdImpressions; });
      data.googleAds = (G.cur.clicks || G.prev.clicks || G.cur.cost || G.prev.cost) ? G : null;
      if (!data.googleAds) data.googleAdsError = `GA4 devolvió el costo de Google Ads en 0 (${(ads[0].rows||[]).length} filas).`;
    } else data.googleAds = null;
    return json({ ok: true, property: prop, generated: new Date().toISOString(), year: y, month: m, ...R, ...data });
  } catch (e) {
    return json({ ok: false, code: e.code || "error", error: e.message || "Error desconocido." }, 200, false);
  }
};

export const config = { path: "/api/analytics", method: "GET" };
