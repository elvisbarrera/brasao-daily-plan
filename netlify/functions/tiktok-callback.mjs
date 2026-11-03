/* Conexión de TikTok sin copiar tokens.
   1) Cuando TikTok apruebe la app "Brasao Dashboard", en Netlify van TIKTOK_APP_ID y TIKTOK_APP_SECRET (Functions).
   2) Abres /api/tiktok-connect → TikTok pide autorizar la cuenta de anuncios → regresa aquí con auth_code.
   3) Esta función cambia el auth_code por el access token (no vence) y lo guarda en Netlify Blobs.
   /api/spend lo lee de ahí. Nadie ve ni copia el token. */
import { getStore } from "@netlify/blobs";

const env = (k) => (globalThis.Netlify ? Netlify.env.get(k) : process.env[k]);
const page = (title, body, ok) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<body style="font-family:-apple-system,system-ui,sans-serif;background:#060a13;color:#edf1f8;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px">
<div style="max-width:420px;text-align:center"><div style="font-size:44px">${ok ? "✅" : "⚠️"}</div><h1 style="font-size:22px">${title}</h1><p style="color:#9aa6bc;line-height:1.5">${body}</p>
<p><a href="/" style="color:#5b93ff;font-weight:600">Volver a la app</a></p></div></body>`, { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

export default async (req) => {
  const url = new URL(req.url);
  const appId = env("TIKTOK_APP_ID"), secret = env("TIKTOK_APP_SECRET");
  if (!appId || !secret) return page("Falta configurar TikTok", "Pon TIKTOK_APP_ID y TIKTOK_APP_SECRET en Netlify y haz deploy.", false);

  /* /api/tiktok-connect: manda a TikTok a autorizar */
  if (url.pathname.endsWith("/tiktok-connect")) {
    const redirect = `${url.origin}/api/tiktok-callback`;
    return Response.redirect(`https://business-api.tiktok.com/portal/auth?app_id=${encodeURIComponent(appId)}&state=brasao&redirect_uri=${encodeURIComponent(redirect)}`, 302);
  }

  const code = url.searchParams.get("auth_code") || url.searchParams.get("code");
  if (!code) return page("Sin código de TikTok", "Abre /api/tiktok-connect para empezar la conexión.", false);
  const r = await fetch("https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ app_id: appId, secret, auth_code: code }),
  });
  const j = await r.json().catch(() => ({}));
  const token = j?.data?.access_token;
  if (!r.ok || j.code !== 0 || !token) return page("TikTok no aceptó la conexión", `Intenta otra vez desde /api/tiktok-connect. (${j.message || r.status})`, false);
  await getStore("tokens").setJSON("tiktok", { access_token: token, advertiser_ids: j.data.advertiser_ids || [], at: new Date().toISOString() });
  return page("TikTok conectado", `Listo. Tu app ya lee el gasto de TikTok en vivo (${(j.data.advertiser_ids || []).length} cuenta(s) autorizada(s)). Toca Actualizar en el Dashboard.`, true);
};

export const config = { path: ["/api/tiktok-callback", "/api/tiktok-connect"], method: "GET" };
