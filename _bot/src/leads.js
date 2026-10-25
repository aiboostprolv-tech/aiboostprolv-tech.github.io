// Mājaslapas formu pieteikumi (kontakts, bezmaksas audits) — saglabā tajā pašā /admin sarakstā
// blakus čatbota sarunām un nosūta paziņojumu Telegram. Formspree e-pasts paliek kā dublējums.

import { notifyTelegram } from "./log.js";
import { startDemo } from "./demo.js";

const SITE_ORIGINS = ["https://aiboostpro.lv", "https://www.aiboostpro.lv"];
const LEAD_TTL = 365 * 24 * 3600;   // pieteikumi glabājas gadu
const RATE_LIMIT = 10;              // pieteikumi no vienas IP 10 minūtēs
const MAX_FIELD = 2000;
const TYPES = { contact: "Kontakts", audit: "Bezmaksas audits", demo: "Bezmaksas demo" };

const cors = (origin, env) => {
  const allowed = (env.SITE_ORIGINS ? env.SITE_ORIGINS.split(",") : SITE_ORIGINS).map((o) => o.trim());
  const ok = allowed.includes(origin);
  return { ok, headers: ok ? {
    "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type", "Access-Control-Max-Age": "86400", "Vary": "Origin",
  } : {} };
};

const json = (obj, status, headers) => new Response(JSON.stringify(obj), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
});

const clean = (v) => String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, MAX_FIELD);

// Sagatavo ierakstu no formas datiem. Atgriež null, ja dati nav derīgi.
export function buildLead(body) {
  const type = TYPES[body?.type] ? body.type : null;
  if (!type) return null;
  if (!["on", "true", "1", true].includes(body.consent)) return null;   // piekrišana ir obligāta
  const f = {
    name: clean(body.name), email: clean(body.email), phone: clean(body.phone),
    message: clean(body.message), website: clean(body.website), contact: clean(body.contact),
  };
  const contact = f.email || f.contact || f.phone;
  if (!contact) return null;
  const lines = [
    `Veids: ${TYPES[type]}`,
    f.name && `Vārds: ${f.name}`,
    f.email && `E-pasts: ${f.email}`,
    f.phone && `Tālrunis: ${f.phone}`,
    f.contact && `Kontakts: ${f.contact}`,
    f.website && `Mājaslapa: ${f.website}`,
    f.message && `\n${f.message}`,
  ].filter(Boolean);
  return { type, text: lines.join("\n"), summary: `${TYPES[type]}: ${contact}` };
}

export async function handleLead(request, env, store, ctx) {
  const origin = request.headers.get("Origin") || "";
  const c = cors(origin, env);
  if (request.method === "OPTIONS") return new Response(null, { status: c.ok ? 204 : 403, headers: c.headers });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: c.headers });
  if (!c.ok) return new Response("Forbidden", { status: 403 });

  let body;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400, c.headers); }

  // Paslēptais lauks: ja robots to aizpildījis, ziņu klusi atmet
  if (body && body._gotcha) return json({ ok: true }, 200, c.headers);

  if (!store) return json({ error: "storage_unavailable" }, 503, c.headers);
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const rlKey = `lead-rl:${ip}:${Math.floor(Date.now() / 600000)}`;
  const count = Number((await store.get(rlKey)) || 0);
  if (count >= RATE_LIMIT) return json({ error: "rate_limited" }, 429, c.headers);
  await store.put(rlKey, String(count + 1), { expirationTtl: 660 });

  const lead = buildLead(body);
  if (!lead) return json({ error: "invalid" }, 400, c.headers);

  const sid = crypto.randomUUID().replace(/-/g, "");
  const now = Date.now();
  const rec = {
    channel: "form", sid, lang: clean(body.lang || ""), page: clean(body.page || origin),
    started: now, updated: now, msgs: [{ r: "user", t: lead.text, ts: now }],
  };
  await store.put(`log:form:${sid}`, JSON.stringify(rec), {
    expirationTtl: LEAD_TTL,
    metadata: {
      channel: "form", lang: rec.lang, started: now, updated: now, n: 1,
      preview: lead.summary.slice(0, 120),
    },
  });
  if (lead.type === "demo") {
    // Demo melnraksts top sagatavots fonā; klients saņem atbildi uzreiz
    const job = startDemo(env, store, sid, {
      lang: clean(body.lang || ""), message: clean(body.message), website: clean(body.website),
    }, new URL(request.url).origin);
    if (ctx && ctx.waitUntil) ctx.waitUntil(job); else await job;
  }
  try { await notifyTelegram(env, `📩 ${lead.summary}\n\n${lead.text.slice(0, 1000)}`); } catch { /* nav kritiski */ }

  return json({ ok: true }, 200, c.headers);
}
