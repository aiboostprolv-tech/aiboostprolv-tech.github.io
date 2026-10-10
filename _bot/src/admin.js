// Privātā sarunu lapa: /admin (aizsargāta ar paroli ADMIN_PASSWORD).
import { CHANNEL_LABEL, linkTelegram, telegramChatId } from "./log.js";

const LIST_LIMIT = 200;

export async function handleAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) {
    return page("Nav iestatīta parole", `<p class="note">Cloudflare iestatījumos pievieno Secret <code>ADMIN_PASSWORD</code>.</p>`, 503);
  }
  if (!checkAuth(request, env.ADMIN_PASSWORD)) {
    return new Response("Nepieciešama parole", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="AiBoost Pro sarunas", charset="UTF-8"', "cache-control": "no-store" },
    });
  }
  const url = new URL(request.url);
  const store = env.BOT_KV;

  if (url.pathname === "/admin/telegram" && request.method === "POST") {
    const r = await linkTelegram(env);
    const msg = r.ok ? `ok:${r.name || ""}` : `err:${r.reason}`;
    return Response.redirect(`${url.origin}/admin?tg=${encodeURIComponent(msg)}`, 303);
  }

  if (!store) {
    return page("Sarunas", `<p class="note">Sarunu glabātuve vēl nav pieslēgta (KV <code>BOT_KV</code>).</p>`);
  }

  const m = url.pathname.match(/^\/admin\/s\/(site|messenger|instagram|whatsapp)\/([A-Za-z0-9:_-]{1,80})$/);
  if (m) return await sessionPage(store, m[1], m[2]);
  if (url.pathname !== "/admin") return new Response("Not found", { status: 404 });
  return await listPage(env, store, url.searchParams.get("tg"));
}

async function listPage(env, store, tgMsg) {
  let keys = [];
  let cursor;
  do {
    const r = await store.list({ prefix: "log:", cursor, limit: 1000 });
    keys = keys.concat(r.keys);
    cursor = r.list_complete ? undefined : r.cursor;
  } while (cursor && keys.length < 5000);

  const items = keys
    .filter((k) => k.metadata)
    .sort((a, b) => (b.metadata.updated || 0) - (a.metadata.updated || 0))
    .slice(0, LIST_LIMIT);

  const today = dayKey(Date.now());
  const todayCount = items.filter((k) => dayKey(k.metadata.updated) === today).length;

  const rows = items.map((k) => {
    const [, channel, ...rest] = k.name.split(":");
    const sid = rest.join(":");
    const md = k.metadata;
    return `<a class="row" href="/admin/s/${esc(channel)}/${encodeURIComponent(sid)}">
      <div class="row-top"><span class="badge ${esc(channel)}">${esc(CHANNEL_LABEL[channel] || channel)}</span>${md.lang ? `<span class="lang">${esc(md.lang.toUpperCase())}</span>` : ""}<span class="time">${esc(fmt(md.updated))}</span></div>
      <div class="preview">${esc(md.preview || "—")}</div>
      <div class="meta">${md.n || 0} ${plural(md.n || 0)}</div>
    </a>`;
  }).join("");

  const tgLinked = Boolean(await telegramChatId(env));
  const tgName = env.BOT_KV ? await env.BOT_KV.get("tg:name") : null;
  let tgNote = "";
  if (tgMsg) {
    if (tgMsg.startsWith("ok:")) tgNote = `<p class="flash ok">Telegram pieslēgts${tgMsg.length > 3 ? ": " + esc(tgMsg.slice(3)) : ""}. Pārbaudi Telegram, tur jābūt apstiprinājuma ziņai.</p>`;
    else {
      const reasons = {
        no_token: "Cloudflare iestatījumos nav Secret TELEGRAM_BOT_TOKEN.",
        no_chat: "Telegram vēl nav saņemta ziņa. Atver savu botu Telegram, nospied Start un mēģini vēlreiz.",
        no_kv: "Nav pieslēgta sarunu glabātuve.",
      };
      tgNote = `<p class="flash err">${esc(reasons[tgMsg.slice(4)] || "Neizdevās: " + tgMsg.slice(4))}</p>`;
    }
  }
  const tgBox = env.TELEGRAM_BOT_TOKEN
    ? `<form method="post" action="/admin/telegram" class="tg"><span>Telegram: ${tgLinked ? `<b>pieslēgts</b>${tgName ? " (" + esc(tgName) + ")" : ""}` : "<b>nav pieslēgts</b>"}</span><button type="submit">${tgLinked ? "Pieslēgt no jauna" : "Pieslēgt Telegram"}</button></form>`
    : "";

  const body = `
    <div class="stats"><div><b>${items.length}</b><span>sarunas (90 d.)</span></div><div><b>${todayCount}</b><span>šodien</span></div></div>
    ${tgNote}${tgBox}
    <div class="list">${rows || `<p class="note">Sarunu vēl nav. Tās parādīsies šeit, tiklīdz kāds uzrakstīs čatā.</p>`}</div>`;
  return page("Sarunas", body);
}

async function sessionPage(store, channel, sid) {
  const raw = await store.get(`log:${channel}:${sid}`);
  if (!raw) return page("Saruna nav atrasta", `<p class="note">Saruna, iespējams, ir vecāka par 90 dienām.</p><p><a class="back" href="/admin">← Visas sarunas</a></p>`, 404);
  const rec = JSON.parse(raw);
  const msgs = rec.msgs.map((m) => `
    <div class="msg ${m.r === "user" ? "user" : "bot"}${m.f ? " failed" : ""}">
      <div class="who">${m.r === "user" ? "Klients" : "Bots"} · ${esc(fmtTime(m.ts))}</div>
      <div class="txt">${esc(m.t)}</div>
      ${m.f ? `<div class="warn">AI nebija pieejams, klients redzēja rezerves atbildi.</div>` : ""}
    </div>`).join("");
  const head = `<p><a class="back" href="/admin">← Visas sarunas</a></p>
    <div class="session-head"><span class="badge ${esc(channel)}">${esc(CHANNEL_LABEL[channel] || channel)}</span>${rec.lang ? `<span class="lang">${esc(rec.lang.toUpperCase())}</span>` : ""}<span class="time">Sākta ${esc(fmt(rec.started))}</span></div>
    ${rec.page ? `<p class="meta">Lapa: ${esc(rec.page)}</p>` : ""}`;
  return page("Saruna", head + `<div class="chat">${msgs}</div>`);
}

// ---------- palīgfunkcijas ----------
function checkAuth(request, password) {
  const h = request.headers.get("Authorization") || "";
  if (!h.startsWith("Basic ")) return false;
  let decoded = "";
  try { decoded = new TextDecoder().decode(Uint8Array.from(atob(h.slice(6)), (c) => c.charCodeAt(0))); } catch { return false; }
  const pass = decoded.slice(decoded.indexOf(":") + 1);
  return safeEqual(pass, password);
}
function safeEqual(a, b) {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  let r = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) r |= (ea[i] || 0) ^ (eb[i] || 0);
  return r === 0;
}
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const TZ = "Europe/Riga";
function fmt(ts) {
  if (!ts) return "";
  return new Intl.DateTimeFormat("lv-LV", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(ts));
}
function fmtTime(ts) {
  if (!ts) return "";
  return new Intl.DateTimeFormat("lv-LV", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(ts));
}
function dayKey(ts) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(ts || 0));
}
function plural(n) {
  return n % 10 === 1 && n % 100 !== 11 ? "jautājums" : "jautājumi";
}

function page(title, body, status = 200) {
  const html = `<!doctype html><html lang="lv"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(title)} · AiBoost Pro</title>
<style>
:root{--bg:#0a0a0a;--card:#17171c;--line:#26262e;--text:#f5f3ee;--muted:#8892a2;--accent:#00e5a0;--blue:#0066ff}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:760px;margin:0 auto;padding:20px 16px 48px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:20px}
.brand{font-weight:800;letter-spacing:-.01em;font-size:20px}.brand span{color:var(--accent)}
h1{font-size:15px;font-weight:500;color:var(--muted);margin:0}
.stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}
.stats div{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px}
.stats b{display:block;font-size:26px;line-height:1.1;color:var(--accent)}.stats span{color:var(--muted);font-size:13px}
.tg{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 16px;margin-bottom:16px;font-size:14px}
.tg button{background:var(--accent);color:#04120c;border:0;border-radius:10px;padding:9px 14px;font-weight:700;font-size:14px;cursor:pointer}
.flash{border-radius:12px;padding:10px 14px;font-size:14px;margin:0 0 12px}.flash.ok{background:#0d2a20;color:#b9ffe5}.flash.err{background:#2a1416;color:#ffc9cf}
.list{display:flex;flex-direction:column;gap:10px}
.row{display:block;text-decoration:none;color:inherit;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;transition:border-color .15s}
.row:hover,.row:focus-visible{border-color:var(--accent);outline:none}
.row-top,.session-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px}
.badge{border-radius:999px;padding:2px 10px;font-weight:700;font-size:12px;background:#22222a;color:var(--text)}
.badge.site{background:#0d2a20;color:var(--accent)}.badge.messenger{background:#0b1d3d;color:#8fb8ff}.badge.instagram{background:#331327;color:#ff9fd0}.badge.whatsapp{background:#10281a;color:#7ee2a8}
.lang{color:var(--muted);font-weight:700}.time{margin-left:auto;color:var(--muted)}
.preview{margin-top:8px;overflow-wrap:anywhere}.meta{color:var(--muted);font-size:13px;margin-top:4px}
.note{color:var(--muted);background:var(--card);border:1px dashed var(--line);border-radius:14px;padding:16px}
.back{color:var(--accent);text-decoration:none;font-size:14px}
.chat{display:flex;flex-direction:column;gap:10px;margin-top:16px}
.msg{max-width:88%;border-radius:16px;padding:10px 14px}
.msg.user{align-self:flex-end;background:var(--blue);color:#fff;border-bottom-right-radius:6px}
.msg.bot{align-self:flex-start;background:var(--card);border:1px solid var(--line);border-bottom-left-radius:6px}
.msg.failed{border-color:#7a3a40}
.who{font-size:12px;opacity:.75;margin-bottom:2px}.txt{white-space:pre-wrap;overflow-wrap:anywhere}
.warn{font-size:12px;color:#ffc9cf;margin-top:6px}
code{background:#22222a;border-radius:6px;padding:1px 6px}
</style></head><body><div class="wrap">
<header><div class="brand">AiBoost <span>Pro</span></div><h1>${esc(title)}</h1></header>
${body}
</div></body></html>`;
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex", "referrer-policy": "no-referrer", "x-frame-options": "DENY" },
  });
}
