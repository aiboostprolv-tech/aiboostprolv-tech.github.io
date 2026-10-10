// Sarunu žurnāls (Cloudflare KV) un Telegram paziņojumi Kristīnei.

export const LOG_TTL = 90 * 24 * 3600;   // sarunas glabājas 90 dienas
const LOG_MAX_MSGS = 60;                 // ziņu skaits vienā sarunā žurnālā
const PREVIEW_CHARS = 120;

export const CHANNEL_LABEL = {
  site: "Mājaslapa", messenger: "Messenger", instagram: "Instagram", whatsapp: "WhatsApp",
};

export function validSid(sid) {
  return typeof sid === "string" && /^[a-z0-9]{6,32}$/i.test(sid);
}

// Pieraksta vienu jautājumu un atbildi. Darbojas tikai, ja ir piesaistīts BOT_KV.
export async function recordExchange(env, { channel, sid, lang = "", page = "", user, bot, failed = false }) {
  const store = env.BOT_KV;
  const now = Date.now();
  if (store && sid) {
    const key = `log:${channel}:${sid}`;
    let rec = null;
    try { rec = JSON.parse((await store.get(key)) || "null"); } catch { rec = null; }
    if (!rec) rec = { channel, sid, lang, page, started: now, msgs: [] };
    if (lang) rec.lang = lang;
    if (page && !rec.page) rec.page = page;
    rec.updated = now;
    rec.msgs.push({ r: "user", t: user, ts: now });
    rec.msgs.push({ r: "bot", t: bot, ts: now, ...(failed ? { f: 1 } : {}) });
    if (rec.msgs.length > LOG_MAX_MSGS) rec.msgs = rec.msgs.slice(-LOG_MAX_MSGS);
    const first = rec.msgs.find((m) => m.r === "user");
    await store.put(key, JSON.stringify(rec), {
      expirationTtl: LOG_TTL,
      metadata: {
        channel, lang: rec.lang, started: rec.started, updated: now,
        n: rec.msgs.filter((m) => m.r === "user").length,
        preview: (first ? first.t : "").slice(0, PREVIEW_CHARS),
      },
    });
  }
  await notifyTelegram(env, formatTelegram({ channel, sid, lang, user, bot, failed }));
}

export function formatTelegram({ channel, sid, lang, user, bot, failed }) {
  const head = `💬 ${CHANNEL_LABEL[channel] || channel}${lang ? " · " + lang.toUpperCase() : ""}${sid ? " · #" + String(sid).slice(-5) : ""}`;
  const text = `${head}\n\n👤 ${user}\n\n🤖 ${bot}${failed ? "\n\n⚠️ AI nebija pieejams, klients redzēja rezerves atbildi." : ""}`;
  return text.length > 4000 ? text.slice(0, 3999) + "…" : text;
}

// Telegram čata ID: TELEGRAM_CHAT_ID mainīgais vai KV ieraksts, ko saglabā /admin lapa.
export async function telegramChatId(env) {
  if (env.TELEGRAM_CHAT_ID) return env.TELEGRAM_CHAT_ID;
  if (env.BOT_KV) return await env.BOT_KV.get("tg:chat");
  return null;
}

export async function notifyTelegram(env, text) {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  const chatId = await telegramChatId(env);
  if (!chatId) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    if (!res.ok) console.error(`telegram ${res.status}: ${await res.text()}`);
  } catch (e) {
    console.error("telegram error", e);
  }
}

// Atrod pēdējo privāto čatu, kas rakstījis Telegram botam (pēc /start), un to saglabā.
export async function linkTelegram(env) {
  if (!env.TELEGRAM_BOT_TOKEN) return { ok: false, reason: "no_token" };
  if (!env.BOT_KV) return { ok: false, reason: "no_kv" };
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getUpdates`);
  if (!res.ok) return { ok: false, reason: `telegram_${res.status}` };
  const data = await res.json();
  const chats = (data.result || [])
    .map((u) => u.message?.chat)
    .filter((c) => c && c.type === "private");
  const chat = chats[chats.length - 1];
  if (!chat) return { ok: false, reason: "no_chat" };
  await env.BOT_KV.put("tg:chat", String(chat.id));
  const name = [chat.first_name, chat.last_name].filter(Boolean).join(" ") || chat.username || "";
  await env.BOT_KV.put("tg:name", name);
  await notifyTelegram(env, "✅ AiBoost Pro bots pieslēgts. Šeit saņemsi visas čatbota sarunas.");
  return { ok: true, name };
}
