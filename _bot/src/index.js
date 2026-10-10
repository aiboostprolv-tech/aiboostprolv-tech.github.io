// AiBoost Pro AI bots — Cloudflare Worker.
// Saņem Meta webhook ziņas no Messenger, Instagram un WhatsApp,
// uzģenerē atbildi ar Claude un nosūta to atpakaļ.

import { BRAIN, HANDOFF_MARKER } from "./brain.js";
import { recordExchange, validSid } from "./log.js";
import { handleAdmin } from "./admin.js";

const BOT_TAG = "aiboost-bot";          // Messenger "metadata", lai atpazītu bota paša ziņas
const HISTORY_TURNS = 10;               // cik pēdējās ziņas atcerēties sarunā
const HISTORY_TTL = 7 * 24 * 3600;      // saruna aizmirstas pēc 7 dienām
const MAX_INPUT_CHARS = 1000;
const LIMITS = { messenger: 2000, instagram: 1000, whatsapp: 4096 }; // IG: baiti, pārējie: simboli

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/" && request.method === "GET") {
      return new Response("AiBoost Pro bots darbojas.", { status: 200 });
    }
    if (url.pathname === "/health") {
      // Tikai jā/nē — nekādas slepenās vērtības netiek parādītas
      const k = env.ANTHROPIC_API_KEY || "";
      return new Response(JSON.stringify({
        ok: true, ai_key: Boolean(k), ai_key_format: k.startsWith("sk-ant-"), ai_key_spaces: k !== k.trim(),
        model: env.MODEL || null, kv: Boolean(env.BOT_KV), telegram: Boolean(env.TELEGRAM_BOT_TOKEN),
        admin_password: Boolean(env.ADMIN_PASSWORD), bot_enabled: env.BOT_ENABLED !== "false",
      }), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
    }
    if (url.pathname === "/chat") return handleSiteChat(request, env, ctx);
    if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) return handleAdmin(request, env);
    if (url.pathname !== "/webhook") return new Response("Not found", { status: 404 });

    // 1) Meta verifikācija
    if (request.method === "GET") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");
      if (mode === "subscribe" && token && token === env.VERIFY_TOKEN) {
        return new Response(challenge || "", { status: 200 });
      }
      return new Response("Forbidden", { status: 403 });
    }

    // 2) Ienākošās ziņas
    if (request.method === "POST") {
      const raw = await request.text();
      if (!(await validSignature(raw, request.headers.get("X-Hub-Signature-256"), env.META_APP_SECRET))) {
        return new Response("Bad signature", { status: 401 });
      }
      let payload;
      try { payload = JSON.parse(raw); } catch { return new Response("Bad JSON", { status: 400 }); }
      // Atbildam Meta uzreiz, apstrāde turpinās fonā.
      ctx.waitUntil(handlePayload(payload, env).catch((e) => console.error("handle error", e)));
      return new Response("EVENT_RECEIVED", { status: 200 });
    }
    return new Response("Method not allowed", { status: 405 });
  },
};

// ---------- KV (ja nav piesaistīts, izmanto īslaicīgu atmiņu) ----------
const MEM = new Map();
const memKV = {
  async get(k) { const v = MEM.get(k); if (!v) return null; if (v.exp && v.exp < Date.now()) { MEM.delete(k); return null; } return v.val; },
  async put(k, val, opts = {}) { MEM.set(k, { val, exp: opts.expirationTtl ? Date.now() + opts.expirationTtl * 1000 : 0 }); },
  async delete(k) { MEM.delete(k); },
};
export function kv(env) { return env.BOT_KV || memKV; }

// ---------- Mājaslapas čats ----------
const SITE_ORIGINS = ["https://aiboostpro.lv", "https://www.aiboostpro.lv"];
const SITE_NOTE = `\n\nŠī saruna notiek aiboostpro.lv mājaslapas čatā. Ja jānodod saruna Kristīnei, aicini rakstīt WhatsApp +371 23231001 vai uz aiboostpro.lv@gmail.com (nelieto marķieri ${HANDOFF_MARKER}). Atbildi īsi, bez markdown.`;

function cors(origin, env) {
  const allowed = (env.SITE_ORIGINS ? env.SITE_ORIGINS.split(",") : SITE_ORIGINS).map((o) => o.trim());
  const ok = allowed.includes(origin);
  return { ok, headers: ok ? {
    "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type", "Access-Control-Max-Age": "86400", "Vary": "Origin",
  } : {} };
}

export async function handleSiteChat(request, env, ctx) {
  const origin = request.headers.get("Origin") || "";
  const c = cors(origin, env);
  if (request.method === "OPTIONS") return new Response(null, { status: c.ok ? 204 : 403, headers: c.headers });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: c.headers });
  if (!c.ok) return new Response("Forbidden", { status: 403 });
  if (env.BOT_ENABLED === "false") return json({ error: "disabled" }, 503, c.headers);

  // Ātruma ierobežojums: 20 ziņas 10 minūtēs no vienas IP adreses
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const rlKey = `rl:${ip}:${Math.floor(Date.now() / 600000)}`;
  const count = Number((await kv(env).get(rlKey)) || 0);
  if (count >= Number(env.SITE_RATE_LIMIT || 20)) return json({ error: "rate_limited" }, 429, c.headers);
  await kv(env).put(rlKey, String(count + 1), { expirationTtl: 660 });

  let body;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400, c.headers); }
  const msgs = Array.isArray(body?.messages) ? body.messages : [];
  const clean = msgs
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_INPUT_CHARS) }))
    .slice(-HISTORY_TURNS);
  while (clean.length && clean[0].role !== "user") clean.shift();
  if (!clean.length || clean[clean.length - 1].role !== "user") return json({ error: "no_message" }, 400, c.headers);

  const sid = validSid(body?.sid) ? body.sid.toLowerCase() : "";
  const lang = ["lv", "ru", "en"].includes(body?.lang) ? body.lang : "";
  const pageUrl = typeof body?.page === "string" ? body.page.slice(0, 200) : "";
  const userText = clean[clean.length - 1].content;
  const log = (bot, failed) => {
    if (!sid) return;
    const p = recordExchange(env, { channel: "site", sid, lang, page: pageUrl, user: userText, bot, failed })
      .catch((e) => console.error("log error", e));
    if (ctx && ctx.waitUntil) ctx.waitUntil(p);
  };

  try {
    const answer = (await askClaude(clean, env, SITE_NOTE)).split(HANDOFF_MARKER).join("").trim();
    log(answer, false);
    return json({ reply: answer }, 200, c.headers);
  } catch (e) {
    console.error("site chat error", e);
    log("(AI kļūda)", true);
    return json({ error: "ai_error" }, 502, c.headers);
  }
}
function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });
}

// ---------- Paraksta pārbaude ----------
export async function validSignature(raw, header, secret) {
  if (!secret) return false;
  if (!header || !header.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(hex, header.slice(7).toLowerCase());
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ---------- Notikumu izvilkšana ----------
// Atgriež sarakstu ar { channel, user, kind: "text"|"other"|"echo", text, fromBot }
export function extractEvents(payload) {
  const out = [];
  const obj = payload?.object;

  if (obj === "page" || obj === "instagram") {
    const channel = obj === "page" ? "messenger" : "instagram";
    for (const entry of payload.entry || []) {
      for (const m of entry.messaging || []) {
        const msg = m.message;
        if (!msg) continue;
        if (msg.is_echo) {
          // Uzņēmuma paša sūtīta ziņa (bots vai Kristīne). Klients = recipient.
          out.push({
            channel, user: m.recipient?.id, kind: "echo", text: msg.text || "",
            fromBot: msg.metadata === BOT_TAG,
          });
          continue;
        }
        const user = m.sender?.id;
        if (!user) continue;
        if (typeof msg.text === "string" && msg.text.trim()) out.push({ channel, user, kind: "text", text: msg.text });
        else out.push({ channel, user, kind: "other" });
      }
    }
  }

  if (obj === "whatsapp_business_account") {
    for (const entry of payload.entry || []) {
      for (const ch of entry.changes || []) {
        const v = ch.value || {};
        if (ch.field === "messages") {
          for (const msg of v.messages || []) {
            if (msg.type === "text" && msg.text?.body?.trim()) {
              out.push({ channel: "whatsapp", user: msg.from, kind: "text", text: msg.text.body, phoneId: v.metadata?.phone_number_id });
            } else if (msg.from) {
              out.push({ channel: "whatsapp", user: msg.from, kind: "other", phoneId: v.metadata?.phone_number_id });
            }
          }
        }
        // Ziņas, ko Kristīne nosūta no WhatsApp Business lietotnes (coexistence)
        if (ch.field === "smb_message_echoes") {
          for (const e of v.message_echoes || []) {
            out.push({ channel: "whatsapp", user: e.to, kind: "echo", text: e.text?.body || "", fromBot: false });
          }
        }
      }
    }
  }
  return out;
}

// ---------- Galvenā loģika ----------
async function handlePayload(payload, env) {
  for (const ev of extractEvents(payload)) {
    if (!ev.user) continue;
    await handleEvent(ev, env);
  }
}

export async function handleEvent(ev, env) {
  const pauseKey = `pause:${ev.channel}:${ev.user}`;
  const pauseHours = Number(env.HUMAN_PAUSE_HOURS || 12);

  if (ev.kind === "echo") {
    if (ev.fromBot) return;
    const cmd = ev.text.trim().toLowerCase();
    if (cmd === "#start") { await kv(env).delete(pauseKey); return; }
    // #stop vai jebkura Kristīnes ziņa Messenger/WhatsApp lietotnē = cilvēks pārņem sarunu.
    // Instagram atbalsojumi bez metadata netiek uzskatīti par cilvēku (izņemot #stop).
    if (cmd === "#stop" || ev.channel !== "instagram") {
      await kv(env).put(pauseKey, "1", { expirationTtl: pauseHours * 3600 });
    }
    return;
  }

  if (env.BOT_ENABLED === "false") return;
  if (await kv(env).get(pauseKey)) return; // Kristīne pārņēmusi sarunu

  if (ev.kind === "other") {
    await sendReply(ev, env,
      "Paldies! Pagaidām varu atbildēt tikai uz teksta ziņām. / Спасибо! Пока я отвечаю только на текстовые сообщения. / Thanks! For now I can only reply to text messages.");
    return;
  }

  const histKey = `hist:${ev.channel}:${ev.user}`;
  const history = JSON.parse((await kv(env).get(histKey)) || "[]");
  const userText = ev.text.slice(0, MAX_INPUT_CHARS);
  const messages = [...history, { role: "user", content: userText }];

  let answer;
  try {
    answer = await askClaude(messages, env);
  } catch (e) {
    console.error("claude error", e);
    answer = "Atvainojiet, man radās tehniska kļūme. Kristīne jums atbildēs personīgi. / Извините, техническая ошибка — Кристине ответит лично. / Sorry, a technical issue — Kristīne will reply personally.\n" + HANDOFF_MARKER;
  }

  const handoff = answer.includes(HANDOFF_MARKER);
  const clean = answer.split(HANDOFF_MARKER).join("").trim();

  await sendReply(ev, env, clean);
  await recordExchange(env, { channel: ev.channel, sid: ev.user, user: userText, bot: clean })
    .catch((e) => console.error("log error", e));

  const newHist = [...messages, { role: "assistant", content: clean }].slice(-HISTORY_TURNS);
  // Claude prasa, lai vēsture sāktos ar "user"
  while (newHist.length && newHist[0].role !== "user") newHist.shift();
  await kv(env).put(histKey, JSON.stringify(newHist), { expirationTtl: HISTORY_TTL });

  if (handoff) {
    await kv(env).put(pauseKey, "1", { expirationTtl: pauseHours * 3600 });
  }
}

// ---------- Claude ----------
export function rigaNow(date = new Date()) {
  return new Intl.DateTimeFormat("lv-LV", {
    timeZone: "Europe/Riga", weekday: "long", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

async function askClaude(messages, env, extra = "") {
  // Ja Claude ir īslaicīgi pārslogots (429/5xx), mēģina vēlreiz pēc īsas pauzes
  for (let attempt = 0; ; attempt++) {
    try { return await askClaudeOnce(messages, env, extra); }
    catch (e) {
      const retryable = /Claude (429|500|502|503|504|529)/.test(String(e && e.message));
      if (!retryable || attempt >= 1) throw e;
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
}

async function askClaudeOnce(messages, env, extra = "") {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": (env.ANTHROPIC_API_KEY || "").trim(),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: env.MODEL || "claude-haiku-5-5",
      max_tokens: 1500,
      system: `${BRAIN}\n\nPašreizējais laiks Rīgā: ${rigaNow()}.${extra}`,
      messages,
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`);
  const data = await res.json();
  let text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  if (!text) throw new Error("Claude empty response");
  if (data.stop_reason === "max_tokens") {
    // Atbilde nogriezta: atstāj tikai pilnos teikumus, lai klients neredz pusvārdu
    console.warn("claude max_tokens", data.usage);
    const cut = Math.max(text.lastIndexOf(". "), text.lastIndexOf("! "), text.lastIndexOf("? "), text.lastIndexOf("\n"));
    text = cut > 40 ? text.slice(0, cut + 1).trim() : text;
    if (cut <= 40 && !/[.!?]$/.test(text)) throw new Error("Claude truncated");
  }
  return text;
}

// ---------- Sūtīšana ----------
export function fitLength(text, channel) {
  const limit = LIMITS[channel];
  if (channel === "instagram") {
    const enc = new TextEncoder();
    if (enc.encode(text).length <= limit) return text;
    let t = text;
    while (enc.encode(t + "…").length > limit) t = t.slice(0, -1);
    return t + "…";
  }
  return text.length <= limit ? text : text.slice(0, limit - 1) + "…";
}

async function sendReply(ev, env, text) {
  const v = env.GRAPH_VERSION || "v25.0";
  const body = fitLength(text, ev.channel);
  let url, init;

  if (ev.channel === "messenger") {
    url = `https://graph.facebook.com/${v}/${env.PAGE_ID}/messages`;
    init = {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.PAGE_ACCESS_TOKEN}` },
      body: JSON.stringify({
        recipient: { id: ev.user }, messaging_type: "RESPONSE",
        message: { text: body, metadata: BOT_TAG },
      }),
    };
  } else if (ev.channel === "instagram") {
    url = `https://graph.instagram.com/${v}/me/messages`;
    init = {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.IG_ACCESS_TOKEN}` },
      body: JSON.stringify({ recipient: { id: ev.user }, message: { text: body } }),
    };
  } else if (ev.channel === "whatsapp") {
    url = `https://graph.facebook.com/${v}/${ev.phoneId || env.WA_PHONE_NUMBER_ID}/messages`;
    init = {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.WA_ACCESS_TOKEN}` },
      body: JSON.stringify({
        messaging_product: "whatsapp", recipient_type: "individual", to: ev.user,
        type: "text", text: { preview_url: false, body },
      }),
    };
  } else return;

  const res = await fetch(url, init);
  if (!res.ok) console.error(`send ${ev.channel} ${res.status}: ${await res.text()}`);
}
