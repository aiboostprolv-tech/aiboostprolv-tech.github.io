// Bezmaksas mājaslapas audits — tehniskā pārbaude uzreiz pēc formas iesniegšanas.
// Rāda tikai to, ko izdevās izmērīt no lapas. Nekādu vērtējumu bez pamatojuma.

import { notifyTelegram } from "./log.js";

const SITE_ORIGINS = ["https://aiboostpro.lv", "https://www.aiboostpro.lv"];
const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 1_000_000;
const RATE_LIMIT = 10;                 // audits no vienas IP 10 minūtēs
const PAGESPEED_TIMEOUT_MS = 25000;

// ---------- URL drošība ----------

export function normalizeUrl(input) {
  let s = String(input || "").trim();
  if (!s || s.length > 300) return null;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  if (!isPublicHost(u.hostname)) return null;
  return u;
}

export function isPublicHost(hostname) {
  const h = hostname.toLowerCase();
  if (!h.includes(".")) return false;                       // nav vietējais nosaukums
  if (h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localhost")) return false;
  if (h.includes(":")) return false;                        // IPv6 literāls
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {                  // IPv4 literāls: bloķē privātos un rezervētos
    const [a, b] = h.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
  }
  return true;
}

// ---------- Lapas analīze ----------

function decodeEntities(s) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

export function parsePage(html) {
  const grab = (re) => { const m = html.match(re); return m ? decodeEntities(m[1].trim()) : null; };
  const title = grab(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const desc = grab(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)
    || grab(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i);
  const imgs = html.match(/<img\b[^>]*>/gi) || [];
  return {
    title,
    titleLen: title ? [...title].length : 0,
    desc,
    descLen: desc ? [...desc].length : 0,
    h1Count: (html.match(/<h1[\s>]/gi) || []).length,
    lang: grab(/<html[^>]*\blang=["']([^"']+)["']/i),
    viewport: /<meta[^>]+name=["']viewport["']/i.test(html),
    canonical: grab(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i),
    jsonLd: (html.match(/application\/ld\+json/gi) || []).length,
    images: imgs.length,
    imagesNoAlt: imgs.filter((t) => !/\balt=/i.test(t)).length,
  };
}

// Pārbaužu saraksts: katra pārbaude ir izmērīts fakts ar "ok" vērtējumu pēc skaidriem kritērijiem.
export function buildChecks(page, url, extra = {}) {
  const c = [];
  const add = (id, label, ok, value) => c.push({ id, label, ok: Boolean(ok), value: value ?? null });

  add("https", "Savienojums ir droš (HTTPS)", url.protocol === "https:", url.protocol.replace(":", ""));
  add("title", "Virsraksts (title) ir aizpildīts 30–60 rakstzīmes", page.titleLen >= 30 && page.titleLen <= 60, page.titleLen ? `${page.titleLen} rakstzīmes` : "trūkst");
  add("desc", "Meta apraksts ir aizpildīts 70–160 rakstzīmes", page.descLen >= 70 && page.descLen <= 160, page.descLen ? `${page.descLen} rakstzīmes` : "trūkst");
  add("h1", "Tieši viens H1 virsraksts", page.h1Count === 1, `${page.h1Count} gab.`);
  add("lang", "Lapas valoda norādīta (lang)", Boolean(page.lang), page.lang || "trūkst");
  add("viewport", "Mobilais skats iestatīts (viewport)", page.viewport, page.viewport ? "jā" : "nē");
  add("canonical", "Kanoniskā saite (canonical) norādīta", Boolean(page.canonical), page.canonical ? "jā" : "nē");
  add("schema", "Strukturētie dati (JSON-LD) ir", page.jsonLd > 0, `${page.jsonLd} gab.`);
  add("alt", "Visiem attēliem ir alt teksts", page.images > 0 ? page.imagesNoAlt === 0 : true,
    page.images ? `${page.imagesNoAlt} bez alt no ${page.images}` : "attēlu nav");
  add("sitemap", "sitemap.xml ir pieejams", extra.sitemap === true, extra.sitemap === true ? "jā" : "nav atrasts");
  add("robots", "robots.txt ir pieejams", extra.robots === true, extra.robots === true ? "jā" : "nav atrasts");
  return c;
}

// ---------- Tīkla pieprasījumi ----------

async function fetchText(url, { maxBytes = MAX_BYTES, timeout = FETCH_TIMEOUT_MS, method = "GET" } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      method, redirect: "follow", signal: ctrl.signal,
      headers: { "user-agent": "AiBoostProAuditBot/1.0 (+https://aiboostpro.lv)", accept: "text/html,application/xml,text/plain,*/*" },
    });
    if (method === "HEAD") return { status: res.status, text: "" };
    const reader = res.body?.getReader();
    let received = 0; const chunks = [];
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        chunks.push(value);
        if (received > maxBytes) { await reader.cancel(); break; }
      }
    }
    const buf = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
    let off = 0; for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
    return { status: res.status, text: new TextDecoder().decode(buf), finalUrl: res.url };
  } catch {
    return { status: 0, text: "" };
  } finally {
    clearTimeout(timer);
  }
}

async function pageSpeed(url, key) {
  if (!key) return null;
  const api = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url.href)}&strategy=mobile&category=performance&key=${encodeURIComponent(key)}`;
  const r = await fetchText(api, { maxBytes: 5_000_000, timeout: PAGESPEED_TIMEOUT_MS });
  if (r.status !== 200) return null;
  try {
    const d = JSON.parse(r.text);
    const score = Math.round((d.lighthouseResult?.categories?.performance?.score ?? NaN) * 100);
    const lcp = d.lighthouseResult?.audits?.["largest-contentful-paint"]?.displayValue ?? null;
    return Number.isFinite(score) ? { score, lcp, strategy: "mobile" } : null;
  } catch { return null; }
}

// ---------- Maršruts ----------

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

export async function handleSiteAudit(request, env, store) {
  const origin = request.headers.get("Origin") || "";
  const c = cors(origin, env);
  if (request.method === "OPTIONS") return new Response(null, { status: c.ok ? 204 : 403, headers: c.headers });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: c.headers });
  if (!c.ok) return new Response("Forbidden", { status: 403 });

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const rlKey = `audit-rl:${ip}:${Math.floor(Date.now() / 600000)}`;
  const count = Number((await store.get(rlKey)) || 0);
  if (count >= RATE_LIMIT) return json({ error: "rate_limited" }, 429, c.headers);
  await store.put(rlKey, String(count + 1), { expirationTtl: 660 });

  let body;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400, c.headers); }
  const url = normalizeUrl(body?.url);
  if (!url) return json({ error: "bad_url" }, 400, c.headers);

  const page = await fetchText(url.href);
  if (!page.text) return json({ error: "unreachable", url: url.href }, 200, c.headers);

  const origin2 = new URL(page.finalUrl || url.href).origin;
  const [sitemap, robots, speed] = await Promise.all([
    fetchText(origin2 + "/sitemap.xml", { method: "HEAD", timeout: 5000 }),
    fetchText(origin2 + "/robots.txt", { method: "HEAD", timeout: 5000 }),
    pageSpeed(url, env.PAGESPEED_API_KEY),
  ]);

  const parsed = parsePage(page.text);
  const checks = buildChecks(parsed, url, { sitemap: sitemap.status === 200, robots: robots.status === 200 });
  const result = {
    url: url.href,
    checks,
    passed: checks.filter((x) => x.ok).length,
    total: checks.length,
    speed,
  };

  // Paziņojums Kristīnei (bez kontaktu datiem — tie paliek formā)
  if (env.TELEGRAM_BOT_TOKEN) {
    try {
      await notifyTelegram(env, `🔍 Jauns audits: ${url.href}\nTehniskās pārbaudes: ${result.passed}/${result.total}${speed ? `\nĀtrums (mobilais): ${speed.score}/100` : ""}`);
    } catch { /* paziņojums nav kritisks */ }
  }

  return json(result, 200, c.headers);
}
