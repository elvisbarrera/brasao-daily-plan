/* Devuelve la foto diaria del gasto que guardó daily-spend.mjs. No consulta Meta, TikTok ni Google. */
import { getStore } from "@netlify/blobs";

const json = (body) => new Response(JSON.stringify(body), {
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
    "netlify-cdn-cache-control": "public, durable, s-maxage=600" },
});

export default async (req) => {
  const url = new URL(req.url);
  const y = +url.searchParams.get("y"), m = +url.searchParams.get("m");
  if (!(m >= 1 && m <= 12) || !(y >= 2024 && y <= 2030)) return json({ ok: false, error: "Mes no válido." });
  const snap = await getStore("snapshots").get(`spend-${y}-${String(m).padStart(2, "0")}`, { type: "json" }).catch(() => null);
  return json(snap ? { ok: true, ...snap } : { ok: false, code: "none", error: "Todavía no hay foto del día para este mes." });
};

export const config = { path: "/api/spend-daily", method: "GET" };
